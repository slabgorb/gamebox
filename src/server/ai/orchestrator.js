import { getAiSession, listAiSessions, markStalled, clearStall, setPendingSequence, clearPendingSequence, setClaudeSessionId, bumpResumeCount, rotateClaudeSession, peekUserMessages, clearUserMessages } from './agent-session.js';
import { winSeatsFromState } from '../win-result.js';

// Resume the same claude CLI session this many times before rotating to a
// fresh one. Resumes hit the prompt cache (huge latency win) but each one
// appends the prior turn to the conversation, so input cost grows with
// every resume. Rotating periodically caps the bloat.
const MAX_RESUMES_PER_SESSION = 10;

// Hard cap on how many consecutive LLM-driven actions the orchestrator will
// chain in a single wake-up before yielding. A bot turn can be a long run of
// actions — several in the same phase (e.g. Risk: deploy → attack* →
// end-attack → fortify/end-turn). We keep driving the bot for as long as it
// is still the active player; this cap is only a backstop so a phase that
// never relinquishes the bot (LLM looping, an accepted no-op) can't recurse
// without bound. Sized well above a worst-case Risk turn.
const MAX_TURN_DEPTH = 40;

// Backstop on how many bot turns one external wake-up will chain across a game.
const MAX_BOT_PASSES = 60;
import { InvalidLlmResponse, InvalidLlmMove } from './errors.js';
import { TimeoutError, SubprocessFailed, ParseError, EmptyResponse } from './llm-client.js';
import { appendTurnEntry } from '../history.js';

function rngFor(gameId) {
  let s = (Date.now() ^ (gameId * 9301 + 49297)) >>> 0;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

// Phases that have a single mechanical outcome — skip the LLM and apply
// the action directly. Entries are either:
//   - a (state, rng) => action factory (the action is deterministic and
//     no banter is solicited), OR
//   - an object { action, banter? } where `action` is the same factory
//     and `banter: { hint }` opts into a non-blocking banter side-call
//     fired after the action is applied.
const autoActions = {
  backgammon: {
    // CROSS-BUG-3: bot signals INTENT only. The engine stores pendingRoll
    // (kind 'roll-initial') and pauses; the human's client picks it up,
    // physically rolls 1d6, and POSTs the value back as roll-initial. No
    // server-side RNG for dice values on the bot path.
    'initial-roll': () => ({
      type: 'roll-initial',
      payload: { throwParams: [] },
    }),
    // Same shape for pre-roll: the bot signals intent; the human's client
    // resolves 2d6 and POSTs the values back. Auto-roll still skips the
    // LLM "roll vs offer-double" decision (tradeoff — the bot can't offer
    // the cube but still accepts/declines doubles via LLM).
    'pre-roll': () => ({
      type: 'roll',
      payload: { throwParams: [] },
    }),
  },
  cribbage: {
    // 'show' is mechanical: both players acknowledge to continue. A blocking
    // LLM call here cost up to 2 round-trips per hand for no decision value.
    // The optional banter side-call lets the bot still chirp at hand-count
    // time without blocking the update broadcast.
    show: {
      action: () => ({ type: 'next' }),
      banter: { hint: 'show-ack' },
    },
  },
};

function normalizeAutoEntry(entry) {
  return typeof entry === 'function' ? { action: entry, banter: null } : entry;
}

function stallReasonFor(err) {
  if (err instanceof TimeoutError) return 'timeout';
  if (err instanceof InvalidLlmMove) return 'illegal_move';
  if (err instanceof InvalidLlmResponse || err instanceof ParseError) return 'invalid_response';
  if (err instanceof SubprocessFailed || err instanceof EmptyResponse) return 'subprocess_error';
  return 'subprocess_error';
}

function botPlayerIdxOf(state, botUserId) {
  // N-player plugins declare seats: [userId, ...]; 2P plugins keep sides {a, b}.
  if (Array.isArray(state.seats)) {
    const i = state.seats.indexOf(botUserId);
    return i === -1 ? 1 : i;
  }
  return state.sides?.a === botUserId ? 0 : 1;
}

// The single source of truth for concurrent-phase eligibility. In phases with
// no single active player (activeUserId == null) — cribbage discard/show,
// backgammon initial-roll — a bot may act if it hasn't yet submitted its half.
// BOTH the scan predicate (botEligible) and _runBot's act-or-skip gate call
// this, so a future fourth concurrent phase is added in exactly one place.
// Self-contained: returns false unless activeUserId is null.
function botMustActConcurrently(state, botUserId) {
  if (state.activeUserId != null) return false;
  const botPlayerIdx = botPlayerIdxOf(state, botUserId);
  const botSideKey = botPlayerIdx === 0 ? 'a' : 'b';
  return (
    // Cribbage concurrent phases
    (state.phase === 'discard' && state.pendingDiscards?.[botPlayerIdx] == null) ||
    (state.phase === 'show' && state.acknowledged?.[botPlayerIdx] === false) ||
    // Backgammon initial-roll: both sides roll; bot acts if its side hasn't rolled yet.
    (state.turn?.phase === 'initial-roll' && state.initialRoll?.[botSideKey] == null)
  );
}

// Mirror of _runBot's act-or-skip gate, used by the scan loop to pick the next
// bot to drive. Shares the concurrent-phase block with _runBot via
// botMustActConcurrently, so the two cannot drift.
function botEligible(state, botUserId) {
  // CROSS-BUG-3 continuation gate: bot is paused while an action awaits
  // client-side dice resolution.
  if (state.pendingCombat || state.pendingRoll) return false;
  if (state.activeUserId === botUserId) return true;
  if (state.activeUserId != null) return false;
  return botMustActConcurrently(state, botUserId);
}

// Single place the orchestrator marks a game ended, so every bot-action path
// records winnerSeats identically.
function writeEndGame(db, gameId, newState) {
  const { winnerSeats, isDraw } = winSeatsFromState(newState);
  db.prepare("UPDATE games SET status='ended', ended_reason=?, winner_seats=?, is_draw=? WHERE id=?")
    .run(newState.endedReason ?? 'plugin',
         winnerSeats == null ? null : JSON.stringify(winnerSeats),
         isDraw ? 1 : 0, gameId);
}

export function createOrchestrator({ db, llm, llmByGameType, sse, personas, adapters, logger = console }) {
  const inFlight = new Map();

  async function _runBot(gameId, sess, depth = 0) {
    // Re-read the session each invocation so a self-recursion (draining a
    // cached pendingSequence, or continuing a multi-action turn) sees the
    // freshest claude session id / pending sequence we just persisted.
    const session = getAiSession(db, gameId, sess.botUserId);
    if (!session) {
      logger.warn?.(`[ai] runTurn: no ai_sessions row for game ${gameId} bot ${sess.botUserId}`);
      return;
    }
    const gameRow = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId);
    if (!gameRow || gameRow.status !== 'active') return;
    const state = JSON.parse(gameRow.state);
    // CROSS-BUG-3 continuation gate: while a bot action is awaiting
    // client-side dice resolution (pendingCombat in Risk; pendingRoll in
    // backgammon), the bot is paused. The human's resolved POST will
    // clear the pending state and the next wake-up runs the next bot action.
    if (state.pendingCombat || state.pendingRoll) return;
    // Allow bot to act when activeUserId is explicitly theirs, OR when
    // activeUserId is null (concurrent phases: discard, show) and the bot
    // hasn't yet submitted its half.
    const botPlayerIdx = botPlayerIdxOf(state, session.botUserId);
    if (state.activeUserId !== session.botUserId &&
        !botMustActConcurrently(state, session.botUserId)) return;

    const persona = personas.get(session.personaId);
    const adapter = adapters[gameRow.game_type];
    if (!persona || !adapter) {
      const detail = !persona ? `unknown persona ${session.personaId}` : `no AI adapter for game_type ${gameRow.game_type}`;
      logger.error?.(`[ai] game ${gameId}: ${detail}`);
      markStalled(db, gameId, session.botUserId, 'invalid_response');
      // Compute bot side from state so the client knows where to render the banner.
      const botSide = botPlayerIdx === 0 ? 'a' : 'b';
      sse.broadcast(gameId, {
        type: 'bot_stalled',
        payload: {
          side: botSide,
          personaId: session.personaId,
          displayName: persona?.displayName ?? 'AI',
          reason: 'invalid_response',
        },
      });
      return;
    }
    const botSide = botPlayerIdx === 0 ? 'a' : 'b';

    // Select the LLM client for this game type (Risk → Sonnet, others →
    // Haiku). Falls back to the shared client when no per-type map is wired.
    const gameLlm = llmByGameType?.[gameRow.game_type] ?? llm;

    // Mechanical phases (e.g., backgammon initial-roll) bypass the LLM.
    const phaseKey = state.turn?.phase ?? state.phase;
    const autoForGame = autoActions[gameRow.game_type];
    if (autoForGame && autoForGame[phaseKey]) {
      const autoEntry = normalizeAutoEntry(autoForGame[phaseKey]);
      const rng = rngFor(gameId);
      const action = autoEntry.action(state, rng);
      const result = adapter.plugin.applyAction({
        state, action, actorId: session.botUserId, rng,
      });
      if (result.error) {
        logger.warn?.(`[ai] game ${gameId} auto-action ${phaseKey} rejected: ${result.error}`);
        markStalled(db, gameId, session.botUserId, 'invalid_response');
        sse.broadcast(gameId, {
          type: 'bot_stalled',
          payload: { side: botSide, personaId: persona.id, displayName: persona.displayName, reason: 'invalid_response' },
        });
        return;
      }
      const newState = result.state;
      let turnRow = null;
      const tx = db.transaction(() => {
        db.prepare("UPDATE games SET state = ?, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(newState), Date.now(), gameId);
        if (result.summary) {
          turnRow = appendTurnEntry(db, gameId, botPlayerIdx, result.summary.kind, result.summary);
        }
        if (result.ended) {
          writeEndGame(db, gameId, newState);
        }
      });
      tx();
      clearStall(db, gameId, session.botUserId);
      sse.broadcast(gameId, { type: 'update', payload: {} });
      if (turnRow) {
        sse.broadcast(gameId, {
          type: 'turn',
          payload: {
            turnNumber: turnRow.turnNumber,
            side: turnRow.side,
            kind: turnRow.kind,
            summary: turnRow.summary,
            createdAt: turnRow.createdAt,
          },
        });
      }
      // Optional fire-and-forget banter side-call. The auto-action and its
      // update are already on the wire; banter floats in 1–10s later as a
      // separate SSE event. Failures are logged, never surfaced.
      if (autoEntry.banter && typeof adapter.chooseBanter === 'function') {
        Promise.resolve()
          .then(() => adapter.chooseBanter({
            llm: gameLlm, persona, state: newState, botPlayerIdx, hint: autoEntry.banter.hint,
          }))
          .then(({ banter }) => {
            if (banter) sse.broadcast(gameId, {
              type: 'banter',
              payload: { side: botSide, personaId: persona.id, displayName: persona.displayName, text: banter },
            });
          })
          .catch(err => logger.warn?.(`[ai] game ${gameId} banter side-call failed: ${err.message}`));
      }
      // Recurse so the bot can act in the new phase (e.g. pre-roll) without
      // waiting on an external SSE wake-up. Depth=0 guard prevents runaway:
      // at most two consecutive auto-actions per external trigger (handles
      // back-to-back initial-roll ties).
      if (!result.ended &&
          (newState.activeUserId === session.botUserId || newState.activeUserId == null) &&
          depth === 0) {
        await _runBot(gameId, session, 1);
      }
      return;
    }

    // Drain pending-sequence cache — no LLM call needed.
    if (session.pendingSequence && session.pendingSequence.length > 0) {
      const [head, ...rest] = session.pendingSequence;
      const result = adapter.plugin.applyAction({
        state, action: head, actorId: session.botUserId, rng: rngFor(gameId),
      });
      if (result.error) {
        clearPendingSequence(db, gameId, session.botUserId);
        markStalled(db, gameId, session.botUserId, 'illegal_move');
        sse.broadcast(gameId, {
          type: 'bot_stalled',
          payload: { side: botSide, personaId: persona.id, displayName: persona.displayName, reason: 'illegal_move' },
        });
        return;
      }
      const newState = result.state;
      let turnRow = null;
      const tx = db.transaction(() => {
        db.prepare("UPDATE games SET state = ?, updated_at = ? WHERE id = ?")
          .run(JSON.stringify(newState), Date.now(), gameId);
        if (result.summary) {
          turnRow = appendTurnEntry(db, gameId, botPlayerIdx, result.summary.kind, result.summary);
        }
        if (rest.length > 0 && newState.turn?.phase === 'moving') {
          setPendingSequence(db, gameId, session.botUserId, rest);
        } else {
          clearPendingSequence(db, gameId, session.botUserId);
        }
        if (result.ended) {
          writeEndGame(db, gameId, newState);
        }
      });
      tx();
      sse.broadcast(gameId, { type: 'update', payload: {} });
      if (turnRow) {
        sse.broadcast(gameId, {
          type: 'turn',
          payload: {
            turnNumber: turnRow.turnNumber,
            side: turnRow.side,
            kind: turnRow.kind,
            summary: turnRow.summary,
            createdAt: turnRow.createdAt,
          },
        });
      }
      // Recurse to drain the next cached move immediately, if any. Bounded
      // by the tail length (drain shrinks the cache each call).
      if (!result.ended && rest.length > 0 && newState.activeUserId === session.botUserId) {
        await _runBot(gameId, session, depth + 1);
      }
      return;
    }

    sse.broadcast(gameId, {
      type: 'bot_thinking',
      payload: { side: botSide, personaId: persona.id, displayName: persona.displayName },
    });

    // Drain user trash talk into the upcoming prompt. Peek (don't clear)
    // so a retried/stalled turn doesn't lose the message — it's only
    // cleared after the bot successfully acts.
    const userMessages = peekUserMessages(db, gameId, session.botUserId).map(m => m.text);

    let lastError;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        // Resume the prior claude session for this game so the CLI hits
        // its prompt cache (persona system prompt + prior turns), dropping
        // per-turn latency from ~80s to a few seconds. Rotate after
        // MAX_RESUMES_PER_SESSION turns to cap conversation bloat.
        const resuming = session.claudeSessionId
          && (session.resumeCount ?? 0) < MAX_RESUMES_PER_SESSION;
        const r = await adapter.chooseAction({
          llm: gameLlm, persona, sessionId: resuming ? session.claudeSessionId : null,
          state, botPlayerIdx, rng: rngFor(gameId),
          userMessages,
        });
        if (r.usedLlm === false) {
          // Adapter short-circuited (e.g., cribbage pegging with one legal
          // card) — no subprocess was launched, so don't burn a resume slot.
        } else if (resuming) {
          bumpResumeCount(db, gameId, session.botUserId);
          session.resumeCount = (session.resumeCount ?? 0) + 1;
        } else if (r.sessionId) {
          // Fresh session — either no prior or just rotated. Reset counter.
          if (session.claudeSessionId) rotateClaudeSession(db, gameId, session.botUserId);
          setClaudeSessionId(db, gameId, session.botUserId, r.sessionId);
          session.claudeSessionId = r.sessionId;
          session.resumeCount = 0;
        }

        // Re-read fresh state inside the write transaction and re-apply.
        // Race-prone case: cribbage 'discard' (and other concurrent phases)
        // — the human may have submitted while the LLM was in flight, and
        // applying against the stale snapshot would clobber their entry.
        // Re-applying against the freshest state lets both writes land.
        let newState, result, freshState, turnRow = null;
        const updateGame = db.prepare("UPDATE games SET state = ?, updated_at = ? WHERE id = ?");
        const tx = db.transaction(() => {
          const freshRow = db.prepare("SELECT state, status FROM games WHERE id = ?").get(gameId);
          if (!freshRow || freshRow.status !== 'active') { result = { error: 'game no longer active' }; return; }
          freshState = JSON.parse(freshRow.state);
          result = adapter.plugin.applyAction({
            state: freshState, action: r.action, actorId: session.botUserId, rng: rngFor(gameId),
          });
          if (result.error) return;
          newState = result.state;
          updateGame.run(JSON.stringify(newState), Date.now(), gameId);
          if (result.summary) {
            turnRow = appendTurnEntry(db, gameId, botPlayerIdx, result.summary.kind, result.summary);
          }
          if (result.ended) {
            writeEndGame(db, gameId, newState);
          }
        });
        tx();
        if (result.error) {
          lastError = new InvalidLlmMove(`engine rejected action: ${result.error}`, []);
          logger.warn?.(`[ai] game ${gameId} attempt ${attempt + 1} engine-rejected ${JSON.stringify(r.action)}: ${result.error}`);
          continue;
        }
        clearStall(db, gameId, session.botUserId);
        if (Array.isArray(r.sequenceTail) && r.sequenceTail.length > 0) {
          setPendingSequence(db, gameId, session.botUserId, r.sequenceTail);
        }
        // Bot consumed any pending trash talk in its prompt — clear so we
        // don't double-feed the same message on the next turn.
        if (userMessages.length > 0) clearUserMessages(db, gameId, session.botUserId);

        if (r.banter != null) {
          sse.broadcast(gameId, {
            type: 'banter',
            payload: { side: botSide, personaId: persona.id, displayName: persona.displayName, text: r.banter },
          });
        }
        sse.broadcast(gameId, { type: 'update', payload: {} });
        if (turnRow) {
          sse.broadcast(gameId, {
            type: 'turn',
            payload: {
              turnNumber: turnRow.turnNumber,
              side: turnRow.side,
              kind: turnRow.kind,
              summary: turnRow.summary,
              createdAt: turnRow.createdAt,
            },
          });
        }

        // Keep driving the bot while it is STILL the active player and the
        // game is live. A bot turn can be a run of consecutive actions, some
        // in the same phase (Risk: deploy → attack* → end-attack →
        // fortify/end-turn; cribbage: pegging → show acks). Recurse rather
        // than waiting for an external wake-up (SSE reconnect / page refresh)
        // to advance each step — that's what made the Risk bot need a manual
        // refresh per action. A cached sequence tail drains with no extra cap
        // (already bounded by its own length); the LLM-driven continue is
        // bounded by MAX_TURN_DEPTH so a phase that never yields the bot
        // can't recurse forever.
        const hasCachedTail = Array.isArray(r.sequenceTail) && r.sequenceTail.length > 0;
        if (!result.ended && newState.activeUserId === session.botUserId &&
            (hasCachedTail || depth < MAX_TURN_DEPTH)) {
          await _runBot(gameId, session, depth + 1);
        }
        return;
      } catch (err) {
        lastError = err;
        logger.warn?.(`[ai] game ${gameId} attempt ${attempt + 1} failed: ${err.message}`);
      }
    }

    const reason = stallReasonFor(lastError);
    markStalled(db, gameId, session.botUserId, reason);
    sse.broadcast(gameId, {
      type: 'bot_stalled',
      payload: { side: botSide, personaId: persona.id, displayName: persona.displayName, reason },
    });
  }

  // Drive every bot eligible to act in this game, in seat order, re-scanning
  // after each bot so a turn that passes bot->bot is continued in the same
  // wake-up. _runBot re-checks its own gate and no-ops if it fails, so this
  // scan only needs to avoid infinite looping.
  async function _runOnce(gameId) {
    // Bots already driven in THIS wake-up. A bot that stalled (or otherwise
    // failed to advance the turn) is not re-driven within the same scan —
    // that would loop on the same failing decision and clobber its stall
    // reason. A later external wake-up (fresh _runOnce) gets a fresh set and
    // retries the stalled bot, preserving the single-bot retry semantics.
    const attempted = new Set();
    for (let pass = 0; pass < MAX_BOT_PASSES; pass++) {
      const gameRow = db.prepare("SELECT state, status FROM games WHERE id = ?").get(gameId);
      if (!gameRow || gameRow.status !== 'active') return;
      const state = JSON.parse(gameRow.state);
      const sessions = listAiSessions(db, gameId);
      if (sessions.length === 0) return;
      const eligible = sessions.find(
        s => !attempted.has(s.botUserId) && botEligible(state, s.botUserId),
      );
      if (!eligible) return;
      attempted.add(eligible.botUserId);
      await _runBot(gameId, eligible);
    }
  }

  async function runTurn(gameId) {
    const prev = inFlight.get(gameId) ?? Promise.resolve();
    let release;
    const next = prev.then(async () => {
      try { await _runOnce(gameId); } finally { release(); }
    });
    next.catch(() => {});
    const settled = new Promise(r => { release = r; });
    inFlight.set(gameId, settled);
    settled.then(() => {
      if (inFlight.get(gameId) === settled) inFlight.delete(gameId);
    });
    return next;
  }

  function scheduleTurn(gameId) {
    runTurn(gameId).catch(err => logger.error?.(`[ai] runTurn(${gameId}) failed: ${err.stack || err}`));
  }

  function isInFlight(gameId) {
    return inFlight.has(gameId);
  }

  return { runTurn, scheduleTurn, isInFlight };
}
