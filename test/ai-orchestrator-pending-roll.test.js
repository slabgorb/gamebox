// CROSS-BUG-3: AC4 + AC6 — orchestrator-level.
//
// AC4: when the bot wakes up in pre-roll / initial-roll, the orchestrator
// must NOT materialize dice values from rng. Instead the action it submits
// to the engine results in state.pendingRoll being set; state.turn.dice and
// state.initialRoll[botSide] stay unset until the human's client resolves
// the physics.
//
// AC6: when state.pendingRoll is already set and runTurn fires (e.g. an SSE
// nudge while waiting on the human's physics), the orchestrator's
// continuation gate keeps the bot paused — no LLM call, no state change.
//
// These tests fail today because src/server/ai/orchestrator.js still has
// `Math.floor(rng() * 6) + 1` in the pre-roll / initial-roll auto-actions
// and the continuation gate doesn't check pendingRoll.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/server/db.js';
import { FakeLlmClient } from '../src/server/ai/fake-llm-client.js';
import { bootAiSubsystem } from '../src/server/ai/index.js';
import { createAiSession, getAiSession } from '../src/server/ai/agent-session.js';
import { buildInitialState } from '../plugins/backgammon/server/state.js';
import { insertGame } from './_helpers/games.js';

function bootBackgammon({ stateMutator }) {
  const dir = mkdtempSync(join(tmpdir(), 'orch-pendingroll-'));
  const db = openDb(join(dir, 'test.db'));
  const now = Date.now();
  const events = [];
  const sse = { broadcast: (gid, ev) => events.push({ gid, ...ev }) };
  const llm = new FakeLlmClient([]); // none expected
  const personaDir = join(process.cwd(), 'data', 'ai-personas');
  const { orchestrator } = bootAiSubsystem({ db, sse, llm, personaDir });

  const humanId = db.prepare("INSERT INTO users (email,friendly_name,color,created_at) VALUES ('h@x','H','#000',?) RETURNING id").get(now).id;
  const botId = db.prepare("SELECT id FROM users WHERE is_bot = 1 LIMIT 1").get().id;
  const aId = Math.min(humanId, botId), bId = Math.max(humanId, botId);

  const state = buildInitialState({
    participants: [{ userId: aId, side: 'a' }, { userId: bId, side: 'b' }],
  });
  state.sides = { a: botId, b: humanId }; // bot is side 'a'
  state.activeUserId = botId;
  stateMutator(state);

  const gameId = insertGame(db, { players: [aId, bId], gameType: 'backgammon', state: state });
  createAiSession(db, { gameId, botUserId: botId, personaId: 'colonel-pip' });

  return { db, gameId, botId, humanId, events, orchestrator, llm };
}

test('AC4: bot wake-up in pre-roll leaves dice unset and sets pendingRoll (no server-side RNG)', async () => {
  const { db, gameId, orchestrator } = bootBackgammon({
    stateMutator(state) {
      state.turn.phase = 'pre-roll';
      state.turn.activePlayer = 'a'; // bot is side 'a'
    },
  });

  await orchestrator.runTurn(gameId);

  const final = JSON.parse(db.prepare("SELECT state FROM games WHERE id = ?").get(gameId).state);

  assert.equal(final.turn.phase, 'pre-roll', 'phase must NOT advance to moving until physics resolves');
  assert.equal(final.turn.dice, null, 'no server-generated dice values present');
  assert.ok(final.pendingRoll, 'pendingRoll must be set after bot wake-up');
  assert.equal(final.pendingRoll.kind, 'roll');
});

test('AC4: bot wake-up in initial-roll leaves the bot side initialRoll null and sets pendingRoll(kind=roll-initial)', async () => {
  const { db, gameId, orchestrator } = bootBackgammon({
    stateMutator(state) {
      // Default initial-roll, both sides null. Bot is side 'a'.
    },
  });

  await orchestrator.runTurn(gameId);

  const final = JSON.parse(db.prepare("SELECT state FROM games WHERE id = ?").get(gameId).state);

  assert.equal(final.turn.phase, 'initial-roll');
  assert.equal(final.initialRoll.a, null, 'bot side initial-roll value NOT generated server-side');
  assert.ok(final.pendingRoll, 'pendingRoll must be set after bot wake-up');
  assert.equal(final.pendingRoll.kind, 'roll-initial');
});

test('AC6: orchestrator runTurn is a no-op while state.pendingRoll is set (continuation paused)', async () => {
  const { db, gameId, orchestrator, llm } = bootBackgammon({
    stateMutator(state) {
      state.turn.phase = 'pre-roll';
      state.turn.activePlayer = 'a';
      state.pendingRoll = { player: 'a', kind: 'roll' }; // already waiting on physics
    },
  });

  const before = db.prepare("SELECT state FROM games WHERE id = ?").get(gameId).state;
  const llmCallsBefore = llm.calls?.length ?? 0;

  await orchestrator.runTurn(gameId);

  const after = db.prepare("SELECT state FROM games WHERE id = ?").get(gameId).state;
  assert.equal(after, before, 'state must not change while pendingRoll is set');
  const llmCallsAfter = llm.calls?.length ?? 0;
  assert.equal(llmCallsAfter, llmCallsBefore, 'no LLM call while pendingRoll is set');

  const sess = getAiSession(db, gameId);
  assert.equal(sess.stalledAt, null, 'pause is NOT a stall — bot is healthy, just waiting');
});
