// Acceptance (E4-1 Task 11): a 4-seat Risk game with one human + three bots,
// driven SERVER-SIDE through the DB + orchestrator, plays to a single winner.
//
// This proves the N-player platform end-to-end:
//   - game creation with one ai_session per bot seat
//   - the orchestrator's multi-bot drive loop: a single runTurn(gameId)
//     wake-up chains bot -> bot in seat order until control returns to a
//     non-bot (or the game ends)
//   - winner_seats recorded as a one-element array
//   - every bot seat (1, 2, 3) actually took turns
//
// turn_log vs state.log: the Risk plugin (and the production routes/orchestrator
// that drive it) only append a turn_log row when applyAction returns a
// `summary` — and Risk emits a summary ONLY on game-over/resign, never per
// ordinary deploy/attack/fortify. Risk's per-action record lives in
// state.log[], where each entry carries `player` = the actor's seat index. So
// the "all three bot seats acted" assertion is taken from state.log (the real
// per-turn instrument for this plugin); turn_log is still checked for the
// single game-ended row the orchestrator writes on termination.
//
// Combat note (CROSS-BUG-3): Risk dice are CLIENT-SIDE rules, not a bot/player
// decision. A bot's `attack` action only signals intent — the engine sets
// state.pendingCombat and flips activeUserId to the defender, who must POST the
// resolved rounds. The orchestrator pauses ALL bots while pendingCombat is set
// (botEligible returns false), exactly as it would wait for a human client to
// roll. So this harness stands in for that client: after every runTurn it
// resolves any pendingCombat deterministically (same rng the rest of the
// harness uses) and writes the result back, then drives again. This mirrors
// risk-full-game.test.js's resolveBotCombat, but routed through the DB so the
// orchestrator drives the real per-seat turns.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/server/db.js';
import { createGame, getGameById } from '../src/server/games.js';
import { createAiSession } from '../src/server/ai/agent-session.js';
import { createOrchestrator } from '../src/server/ai/orchestrator.js';
import { appendTurnEntry } from '../src/server/history.js';
import riskPlugin from '../plugins/risk/plugin.js';
import { chooseAction as riskChoose } from '../plugins/risk/server/ai/risk-player.js';
import { enumerateLegalMoves } from '../plugins/risk/server/ai/legal-moves.js';
import { resolveAttack } from '../plugins/risk/server/combat.js';

function rngFrom(seed) {
  // Mulberry32 — deterministic PRNG (same shape as the other Risk harnesses).
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic fake LLM: always picks the first (highest-scored) shortlist id
// printed in the prompt. Matches the real adapter contract — chooseAction
// parses {moveId,banter} out of llm.send().text and matches it against the
// shortlist it built, so returning the first listed id is always legal.
const firstMoveLlm = {
  async send({ prompt }) {
    const m = prompt.match(/^\s*-\s+([\w\-:>]+):/m);
    const moveId = m ? m[1] : 'end-attack';
    return { text: JSON.stringify({ moveId, banter: '.' }), sessionId: null };
  },
};

const STUB_PERSONA = { id: 'stub', displayName: 'Stub', systemPrompt: 'stub' };

function loadState(db, gameId) {
  return JSON.parse(db.prepare('SELECT state FROM games WHERE id = ?').get(gameId).state);
}

function writeState(db, gameId, state) {
  db.prepare('UPDATE games SET state = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(state), Date.now(), gameId);
  if (state.phase === 'gameover') {
    const winnerSeats = Number.isInteger(state.winner) ? JSON.stringify([state.winner]) : null;
    db.prepare("UPDATE games SET status='ended', ended_reason='plugin', winner_seats=? WHERE id=?")
      .run(winnerSeats, gameId);
  }
}

// Stand in for the client-side dice physics: when pendingCombat is set, resolve
// it deterministically and write the resulting state (+ turn_log) back. Whoever
// the engine made active (the defender) is the actor POSTing the resolved roll.
function resolveCombat(db, gameId, state, rng) {
  const pc = state.pendingCombat;
  const src = state.territories[pc.from];
  const tgt = state.territories[pc.to];
  const committed = src.armies - 1;
  const outcome = resolveAttack({ force: committed, defenders: tgt.armies }, rng);
  const action = {
    type: 'attack',
    payload: { from: pc.from, to: pc.to, force: pc.force, resolved: { rounds: outcome.rounds } },
  };
  const actorSeat = state.seats.indexOf(state.activeUserId);
  const out = riskPlugin.applyAction({ state, action, actorId: state.activeUserId, rng });
  assert.equal(out.error, undefined, `engine rejected resolved combat: ${out.error}`);
  writeState(db, gameId, out.state);
  // Mirror routes.js: a combat that ends the game emits a `game-over` summary;
  // record it in the shared turn_log so termination is logged like production.
  if (out.summary) appendTurnEntry(db, gameId, actorSeat, out.summary.kind, out.summary);
  return out.state;
}

// Apply the active HUMAN seat's action directly via the plugin (the human's
// client would POST this in production). Deterministic first-legal-move policy,
// mirroring the bots so the game converges. Records a turn_log entry under the
// human's seat so the human's progress is logged like the bots'.
function applyHumanAction(db, gameId, state, rng) {
  const seat = state.seats.indexOf(state.activeUserId);
  const moves = enumerateLegalMoves(state, seat);
  assert.ok(moves.length > 0, `no legal human moves in phase ${state.phase}`);
  const out = riskPlugin.applyAction({ state, action: moves[0].action, actorId: state.activeUserId, rng });
  assert.equal(out.error, undefined, `engine rejected human ${JSON.stringify(moves[0].action)}: ${out.error}`);
  if (out.summary) appendTurnEntry(db, gameId, seat, out.summary.kind, out.summary);
  writeState(db, gameId, out.state);
  return out.state;
}

test('4-player Risk: one human + three bots plays to a single winner, driven server-side', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'risk-4p-'));
  const db = openDb(join(dir, 'test.db'));
  const now = Date.now();

  // Seat 0 = human; seats 1, 2, 3 = bot personas (is_bot=1, persona_id each).
  const humanId = db.prepare(
    "INSERT INTO users (email,friendly_name,color,created_at) VALUES ('h@x','Human','#111',?) RETURNING id",
  ).get(now).id;
  const insBot = db.prepare(
    "INSERT INTO users (email,friendly_name,color,is_bot,persona_id,created_at) VALUES (?,?,?,1,?,?) RETURNING id",
  );
  const bot1 = insBot.get('ai+b1@bot.local', 'Bot1', '#a00', 'stub', now).id;
  const bot2 = insBot.get('ai+b2@bot.local', 'Bot2', '#0a0', 'stub', now).id;
  const bot3 = insBot.get('ai+b3@bot.local', 'Bot3', '#00a', 'stub', now).id;
  const seats = [humanId, bot1, bot2, bot3];

  const rng = rngFrom(12345);
  const initialState = riskPlugin.initialState({
    participants: seats.map((userId, seat) => ({ userId, seat })),
    rng,
  });
  const game = createGame(db, { userIds: seats, gameType: 'risk', initialState });
  const gameId = game.id;

  // One ai_session per bot seat (Task: game creation makes one per bot seat).
  for (const botUserId of [bot1, bot2, bot3]) {
    createAiSession(db, { gameId, botUserId, personaId: 'stub' });
  }

  const sse = { broadcast() {}, subscriberCount() { return 0; } };
  const personas = new Map([['stub', STUB_PERSONA]]);
  const adapters = { risk: { plugin: riskPlugin, chooseAction: riskChoose } };
  // Quiet logger: the orchestrator has a per-turn TEMP DIAGNOSTIC info log
  // that would otherwise spam hundreds of lines across a full game.
  const orch = createOrchestrator({
    db, llm: firstMoveLlm, llmByGameType: {}, sse, personas, adapters, logger: {},
  });

  const botUserIds = new Set([bot1, bot2, bot3]);

  // N-seat drive loop. Per pass:
  //   1. resolve any pendingCombat (the client-side dice physics), OR
  //   2. if the active seat is a bot, let the orchestrator drive ALL eligible
  //      bots in one wake-up (the multi-bot chain), OR
  //   3. if the active seat is the human, apply its first-legal-move directly.
  // The seat count is read from state.seats — no hardcoded 2.
  let guard = 0;
  while (getGameById(db, gameId).status === 'ended' ? false : ++guard) {
    if (guard > 6000) throw new Error('game did not terminate');
    let state = loadState(db, gameId);
    if (state.phase === 'gameover') break;

    if (state.pendingCombat) {
      resolveCombat(db, gameId, state, rng);
      continue;
    }

    const active = state.activeUserId;
    if (botUserIds.has(active)) {
      await orch.runTurn(gameId);
    } else {
      applyHumanAction(db, gameId, state, rng);
    }
  }

  const ended = getGameById(db, gameId);
  assert.strictEqual(ended.status, 'ended');
  assert.ok(Array.isArray(ended.winnerSeats) && ended.winnerSeats.length === 1,
    `expected one winner seat, got ${JSON.stringify(ended.winnerSeats)}`);

  // Every bot seat acted — read from state.log (Risk's real per-action record,
  // keyed by `player` = seat). See the file header for why turn_log is empty of
  // per-turn rows for this plugin.
  const finalState = loadState(db, gameId);
  const seatsThatActed = new Set(finalState.log.map(e => e.player));
  assert.ok([1, 2, 3].every(s => seatsThatActed.has(s)), 'all three bot seats took turns');

  // turn_log holds the orchestrator's game-ended row (the only summary Risk
  // emits), proving termination was recorded through the shared history table.
  const endedRows = db.prepare(
    "SELECT seat FROM turn_log WHERE game_id = ? AND kind = 'game-over'",
  ).all(gameId);
  assert.ok(endedRows.length >= 1, 'orchestrator recorded the game-over turn_log row');

  db.close();
});
