import { requireIdentity } from './identity.js';
import { listUsers, getUserById } from './users.js';
import {
  listGamesForUser, getGameById, endGame, createGame,
  seatForUser, seatOfState, sideOfSeat, findActiveGameForSet,
} from './games.js';
import { subscribe } from './sse.js';
import { writeGameState } from './state.js';
import { getPlugin } from './plugins.js';
import { appendTurnEntry, listTurnEntries } from './history.js';
import { createAiSession, getAiSession, clearStall, appendUserMessage } from './ai/agent-session.js';
import { isSorryColor, CONTRAST } from '../../plugins/sorry/server/colors.js';

export function mountRoutes(app, { db, registry, sse, ai = null }) {
  // Game-scoped middleware: validate id, load game, check membership.
  app.param('gameId', (req, res, next, gameId) => {
    if (!req.user) return res.status(401).json({ error: 'unauthenticated' });
    const id = Number(gameId);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'bad game id' });
    const game = getGameById(db, id);
    if (!game) return res.status(404).json({ error: 'game not found' });
    if (!game.participants.some(p => p.userId === req.user.id)) {
      return res.status(403).json({ error: 'not a participant' });
    }
    req.game = game;
    next();
  });

  // -- Identity-scoped, no game id --
  app.get('/api/me', requireIdentity, (req, res) => {
    const games = listGamesForUser(db, req.user.id).map(g => {
      const yourSeat = seatForUser(g, req.user.id);
      const opponents = g.participants
        .filter(p => p.userId !== req.user.id)
        .map(p => {
          const u = getUserById(db, p.userId);
          return { id: u.id, seat: p.seat, friendlyName: u.friendlyName, color: u.color, glyph: u.glyph };
        });
      // 2P plugins keep their {a, b} score dict; map it onto seats. N-player
      // games surface no lobby score (Risk has none).
      const yourSide = sideOfSeat(yourSeat);
      const yourScore = g.state?.scores?.[yourSide] ?? 0;
      const theirScore = g.state?.scores?.[yourSide === 'a' ? 'b' : 'a'] ?? 0;
      return {
        id: g.id,
        gameType: g.gameType,
        variant: g.state?.variant ?? null,
        opponent: opponents[0],
        opponents,
        you: yourSeat,
        status: g.status,
        yourTurn: g.status === 'active' && g.state?.activeUserId === req.user.id,
        yourScore, theirScore,
        endedReason: g.endedReason,
        winnerSeat: g.winnerSeat,
        isDraw: g.isDraw,
        updatedAt: g.updatedAt
      };
    });
    res.json({
      user: { id: req.user.id, email: req.user.email, friendlyName: req.user.friendlyName, color: req.user.color, glyph: req.user.glyph },
      games
    });
  });

  app.get('/api/users', requireIdentity, (_req, res) => {
    res.json(listUsers(db).map(u => ({ id: u.id, friendlyName: u.friendlyName, color: u.color, glyph: u.glyph, isBot: u.isBot })));
  });

  app.get('/api/ai/personas', requireIdentity, (req, res) => {
    if (!ai) return res.json({ personas: [] });
    const game = typeof req.query.game === 'string' ? req.query.game : null;
    const out = [];
    for (const p of ai.personas.values()) {
      if (game && p.games.length > 0 && !p.games.includes(game)) continue;
      out.push({ id: p.id, displayName: p.displayName, color: p.color, glyph: p.glyph, games: p.games });
    }
    res.json({ personas: out });
  });

  app.get('/api/plugins', requireIdentity, (_req, res) => {
    res.json({
      plugins: Object.values(registry).map(p => ({ id: p.id, displayName: p.displayName, players: p.players })),
    });
  });

  // -- Generic game listing & creation --
  app.get('/api/games', requireIdentity, (req, res) => {
    const rows = db.prepare(`
      SELECT g.id, g.game_type AS gameType, g.status, g.updated_at AS updatedAt
      FROM games g
      JOIN participants p ON p.game_id = g.id
      WHERE g.status = 'active' AND p.user_id = ?
      ORDER BY g.updated_at DESC
    `).all(req.user.id);
    res.json({ games: rows });
  });

  app.post('/api/games', requireIdentity, (req, res) => {
    const { opponentId, gameType, variant, color } = req.body ?? {};
    // Accept either opponentIds: [...] (N-player) or the legacy single
    // opponentId. Creator is always seat 0; invite order is turn order.
    const opponentIds = Array.isArray(req.body?.opponentIds)
      ? req.body.opponentIds
      : opponentId !== undefined ? [opponentId] : [];
    if (opponentIds.length === 0
        || !opponentIds.every(id => Number.isInteger(id))
        || opponentIds.includes(req.user.id)
        || new Set(opponentIds).size !== opponentIds.length) {
      return res.status(400).json({ error: 'invalid opponentIds' });
    }
    if (typeof gameType !== 'string' || !registry[gameType]) {
      return res.status(400).json({ error: 'invalid gameType' });
    }
    const plugin = registry[gameType];
    const totalPlayers = opponentIds.length + 1;
    if (totalPlayers < plugin.players.min || totalPlayers > plugin.players.max) {
      return res.status(400).json({
        error: `${plugin.displayName} takes ${plugin.players.min}-${plugin.players.max} players; got ${totalPlayers}`,
      });
    }
    if (variant !== undefined && typeof variant !== 'string') {
      return res.status(400).json({ error: 'invalid variant' });
    }
    if (color !== undefined && !isSorryColor(color)) {
      return res.status(400).json({ error: 'invalid color' });
    }
    const opponentRows = opponentIds.map(id =>
      db.prepare('SELECT id, is_bot FROM users WHERE id = ?').get(id));
    if (opponentRows.some(r => !r)) {
      return res.status(400).json({ error: 'opponent not on roster' });
    }
    const botRows = opponentRows.filter(r => r.is_bot === 1);
    // AI orchestration is 2P-only (one bot per game): bots are allowed only
    // in a 2-player game where the single opponent is the bot.
    if (botRows.length > 0 && totalPlayers > 2) {
      return res.status(400).json({ error: 'AI opponents are not supported in multiplayer games' });
    }
    const opponentIsBot = botRows.length === 1 && totalPlayers === 2;

    let personaId = null;
    if (opponentIsBot) {
      personaId = req.body?.personaId;
      if (typeof personaId !== 'string' || !personaId) {
        return res.status(400).json({ error: 'personaId required for AI opponent' });
      }
      if (!ai?.personas?.has(personaId)) {
        return res.status(400).json({ error: `unknown personaId: ${personaId}` });
      }
    }

    const roster = [req.user.id, ...opponentIds]; // seat order
    if (findActiveGameForSet(db, roster, gameType)) {
      return res.status(409).json({ error: 'an active game of this type already exists with these players' });
    }

    // participants carry seat (canonical) plus the legacy side alias for the
    // 2P plugins ('a' = seat 0 = creator, 'b' = seat 1).
    const participants = roster.map((userId, seat) => ({ userId, seat, side: sideOfSeat(seat) }));

    // The creator picks their own checker colour; the opponent takes the
    // contrast (2P colour games only — N-player plugins assign by seat).
    const pick = color ?? 'red';
    const colors = { a: pick, b: CONTRAST[pick] };

    let initialState;
    try {
      initialState = plugin.initialState({ participants, rng: makeRng(Date.now()), variant, colors });
    } catch (err) {
      return res.status(500).json({ error: `initialState failed: ${err.message}` });
    }

    const game = createGame(db, { userIds: roster, gameType, initialState });
    if (opponentIsBot && ai) {
      createAiSession(db, { gameId: game.id, botUserId: opponentIds[0], personaId });
      // Kick the bot immediately so it can be working on its first move
      // while the human is still reading their hand. Without this the
      // bot doesn't start thinking until the SSE subscribe lands.
      ai.orchestrator.scheduleTurn(game.id);
    }
    res.json({ id: game.id, gameType });
  });

  // -- Per-game routes (use :gameId) --
  app.get('/api/games/:gameId', requireIdentity, (req, res) => {
    const plugin = getPlugin(registry, req.game.gameType);
    const view = plugin.publicView({ state: req.game.state, viewerId: req.user.id });
    const participants = req.game.participants.map(p => {
      const u = getUserById(db, p.userId);
      return { userId: p.userId, seat: p.seat, friendlyName: u?.friendlyName ?? `Player ${p.seat + 1}`, color: u?.color ?? null, glyph: u?.glyph ?? null };
    });
    res.json({
      id: req.game.id,
      gameType: req.game.gameType,
      status: req.game.status,
      participants,
      // Legacy aliases for 2P clients (seat 0 = a, seat 1 = b).
      playerAId: participants[0]?.userId ?? null,
      playerBId: participants[1]?.userId ?? null,
      state: view,
    });
  });

  app.get('/api/games/:gameId/history', requireIdentity, (req, res) => {
    const entries = listTurnEntries(db, req.game.id);
    res.json({ entries });
  });

  app.get('/api/games/:gameId/events', requireIdentity, (req, res) => {
    subscribe(req.game.id, req, res);
    // Replay live AI status to a freshly-subscribed client. Without this,
    // page reloads after a stall or while the bot is thinking leave the
    // user with no UI indication of what's happening.
    if (!ai) return;
    const sess = getAiSession(db, req.game.id);
    if (!sess) return;
    const persona = ai.personas.get(sess.personaId);
    const displayName = persona?.displayName ?? 'AI';
    const state = req.game.state;
    const botIdx = seatOfState(state, sess.botUserId) ?? 1;
    const botSide = sideOfSeat(botIdx);

    if (sess.stalledAt != null) {
      const payload = { side: botSide, personaId: sess.personaId, displayName, reason: sess.stallReason ?? 'invalid_response' };
      res.write(`event: bot_stalled\ndata: ${JSON.stringify(payload)}\n\n`);
      return;
    }

    const botShouldAct =
      state.activeUserId === sess.botUserId ||
      (state.activeUserId == null && (
        (state.phase === 'discard' && state.pendingDiscards?.[botIdx] == null) ||
        (state.phase === 'show' && state.acknowledged?.[botIdx] === false)
      ));
    if (!botShouldAct) return;

    if (ai.orchestrator.isInFlight(req.game.id)) {
      const payload = { side: botSide, personaId: sess.personaId, displayName };
      res.write(`event: bot_thinking\ndata: ${JSON.stringify(payload)}\n\n`);
    } else {
      // Bot's turn but nothing in flight — kick the orchestrator.
      // Idempotent: runTurn serializes per game.
      ai.orchestrator.scheduleTurn(req.game.id);
    }
  });

  app.post('/api/games/:gameId/action', requireIdentity, (req, res) => {
    const { action } = parseAction(req);
    if (!action) return res.status(400).json({ error: 'missing action' });
    if (req.game.status !== 'active') {
      return res.status(409).json({ error: 'game ended' });
    }

    let plugin;
    try { plugin = getPlugin(registry, req.game.gameType); }
    catch { return res.status(500).json({ error: 'plugin unavailable' }); }

    // Turn ownership check (only if state declares activeUserId).
    // `resign` is exempt: leaving a game must work even when it is not
    // your turn (e.g. while the opponent/bot is the active player).
    const activeUserId = req.game.state.activeUserId;
    if (action.type !== 'resign'
        && typeof activeUserId === 'number' && activeUserId !== req.user.id) {
      return res.status(422).json({ error: 'not your turn' });
    }

    const txn = db.transaction(() => {
      const result = plugin.applyAction({
        state: req.game.state,
        action,
        actorId: req.user.id,
        rng: makeRng(Date.now()),
      });
      if (result.error) return { http: 422, body: { error: result.error } };

      const newState = result.state;
      writeGameState(db, req.game.id, newState);

      const actorSeat = seatOfState(newState, req.user.id)
        ?? seatOfState(req.game.state, req.user.id)
        ?? seatForUser(req.game, req.user.id);

      const turnRows = [];
      if (result.summary) {
        turnRows.push(appendTurnEntry(db, req.game.id, actorSeat, result.summary.kind, result.summary));
      }

      if (result.ended) {
        // N-player plugins set winnerSeat (int); 2P plugins set winnerSide
        // ('a'/'b'/'draw'). Normalize to seat + draw flag.
        const winnerSeat = Number.isInteger(newState.winnerSeat) ? newState.winnerSeat
          : newState.winnerSide === 'a' ? 0
          : newState.winnerSide === 'b' ? 1
          : null;
        const isDraw = newState.winnerSide === 'draw' || newState.isDraw === true;
        endGame(db, req.game.id, {
          endedReason: newState.endedReason ?? 'plugin',
          winnerSeat,
          isDraw,
          finalState: newState,
        });
        const endedSummary = {
          kind: 'game-ended',
          reason: newState.endedReason ?? 'plugin',
          winnerSeat,
          winnerSide: isDraw ? 'draw' : sideOfSeat(winnerSeat),
        };
        turnRows.push(appendTurnEntry(db, req.game.id, actorSeat, 'game-ended', endedSummary));
      }

      const view = plugin.publicView({ state: newState, viewerId: req.user.id });
      return {
        http: 200,
        body: { state: view, ended: !!result.ended, scoreDelta: result.scoreDelta ?? null },
        turnRows,
      };
    });

    const out = txn();
    if (out.http === 200) {
      sse.broadcast(req.game.id, { type: 'update' });
      // If the next active player is a bot (or it's a concurrent-discard phase
      // where activeUserId is null and the bot may still need to act), schedule
      // an AI turn.
      if (ai) {
        const nextActiveUserId = out.body?.state?.activeUserId;
        if (typeof nextActiveUserId === 'number') {
          const isBot = db.prepare("SELECT is_bot FROM users WHERE id = ?").get(nextActiveUserId)?.is_bot === 1;
          if (isBot) ai.orchestrator.scheduleTurn(req.game.id);
        } else if (nextActiveUserId == null) {
          // Concurrent phase (e.g. discard): check if this game has a bot session.
          const sess = db.prepare("SELECT bot_user_id FROM ai_sessions WHERE game_id = ?").get(req.game.id);
          if (sess) ai.orchestrator.scheduleTurn(req.game.id);
        }
      }
      for (const row of out.turnRows ?? []) {
        sse.broadcast(req.game.id, {
          type: 'turn',
          payload: {
            turnNumber: row.turnNumber,
            seat: row.seat,
            side: row.side,
            kind: row.kind,
            summary: row.summary,
            createdAt: row.createdAt,
          },
        });
      }
    }
    res.status(out.http).json(out.body);
  });

  // -- AI stall resolution --
  app.post('/api/games/:gameId/ai/retry', requireIdentity, (req, res) => {
    if (!ai) return res.status(500).json({ error: 'ai subsystem not enabled' });
    const sess = getAiSession(db, req.game.id);
    if (!sess) return res.status(404).json({ error: 'no AI session' });
    if (sess.stalledAt == null) return res.status(422).json({ error: 'not stalled' });
    clearStall(db, req.game.id);
    ai.orchestrator.scheduleTurn(req.game.id);
    res.json({ ok: true });
  });

  // Trash-talk inbox. The user types into the opp-card; the message gets
  // queued onto the AI session and prepended to the next bot prompt so the
  // bot can react in its banter. Echoed back over SSE so other tabs of the
  // same user see their own message land.
  app.post('/api/games/:gameId/chat', requireIdentity, (req, res) => {
    if (!ai) return res.status(404).json({ error: 'no AI session' });
    const sess = getAiSession(db, req.game.id);
    if (!sess) return res.status(404).json({ error: 'no AI session' });
    const raw = req.body?.text;
    if (typeof raw !== 'string') return res.status(400).json({ error: 'text required' });
    const text = raw.trim().slice(0, 200);
    if (!text) return res.status(400).json({ error: 'empty message' });
    const userSide = sideOfSeat(seatOfState(req.game.state, req.user.id) ?? seatForUser(req.game, req.user.id));
    appendUserMessage(db, req.game.id, text);
    sse.broadcast(req.game.id, {
      type: 'user_chat',
      payload: { side: userSide, userId: req.user.id, friendlyName: req.user.friendlyName, text, sentAt: Date.now() },
    });
    res.json({ ok: true });
  });

  app.post('/api/games/:gameId/ai/abandon', requireIdentity, (req, res) => {
    if (!ai) return res.status(500).json({ error: 'ai subsystem not enabled' });
    const sess = getAiSession(db, req.game.id);
    if (!sess) return res.status(404).json({ error: 'no AI session' });
    db.prepare("UPDATE games SET status='ended', ended_reason=?, winner_seat=NULL, updated_at=? WHERE id=?")
      .run('ai_stalled', Date.now(), req.game.id);
    sse.broadcast(req.game.id, { type: 'ended', payload: { reason: 'ai_stalled' } });
    res.json({ ok: true });
  });

  // Mount each plugin's auxiliary routes
  for (const plugin of Object.values(registry)) {
    if (!plugin.auxRoutes) continue;
    for (const [name, route] of Object.entries(plugin.auxRoutes)) {
      const path = `/api/games/:gameId/${name}`;
      const method = route.method.toLowerCase();
      if (typeof app[method] !== 'function') {
        throw new Error(`plugin(${plugin.id}).auxRoutes['${name}']: unsupported method ${route.method}`);
      }
      // Wrap handler so it only runs for matching game_type
      app[method](path, requireIdentity, (req, res, next) => {
        if (req.game.gameType !== plugin.id) return next();
        return route.handler(req, res, next);
      });
    }
  }
}

function parseAction(req) {
  if (!req.body || typeof req.body !== 'object') return { action: null };
  const { type, payload } = req.body;
  if (typeof type !== 'string' || type.length === 0) return { action: null };
  return { action: { type, payload: payload ?? {} } };
}

function makeRng(seed) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
