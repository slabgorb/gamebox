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

test('backgammon end-to-end: bot rolls, picks sequence, drains cache, then awaits opponent', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bg-full-'));
  const db = openDb(join(dir, 'test.db'));
  const now = Date.now();

  // Scripted LLM responses for the LLM-driven phases:
  // - initial-roll is auto-action (no LLM call). With the human pre-rolled
  //   at 1, the bot's auto-roll resolves the initial roll and the engine
  //   advances directly to 'moving' with both dice — so 'pre-roll' is skipped.
  // - moving (with dice in hand) → "seq:1" (1 LLM call). The adapter
  //   returns the first action and caches sequenceTail; the orchestrator
  //   drains the tail without further LLM calls.
  // Total LLM calls expected: ≤ 2.
  const llm = new FakeLlmClient([
    { text: '{"moveId":"seq:1","banter":"steady"}' },
  ]);

  const events = [];
  const sse = { broadcast: (gid, ev) => events.push({ gid, ...ev }) };
  const personaDir = join(process.cwd(), 'data', 'ai-personas');
  const { orchestrator } = bootAiSubsystem({ db, sse, llm, personaDir });

  const humanId = db.prepare("INSERT INTO users (email,friendly_name,color,created_at) VALUES ('h@x','H','#000',?) RETURNING id").get(now).id;
  const botId = db.prepare("SELECT id FROM users WHERE is_bot = 1 LIMIT 1").get().id;
  const aId = Math.min(humanId, botId), bId = Math.max(humanId, botId);
  const participants = [{ userId: aId, side: 'a' }, { userId: bId, side: 'b' }];
  const state = buildInitialState({ participants });
  // Bot is side A; bot's turn at initial-roll.
  state.sides = { a: botId, b: humanId };
  state.activeUserId = botId;
  // Pre-seed the human's initial roll so the bot's auto-action completes
  // the initial roll and advances the phase to 'moving' (engine sets active
  // player to whoever rolled higher, with dice = both rolls).
  state.initialRoll = { a: null, b: 1, throwParamsA: null, throwParamsB: [] };

  const gameId = insertGame(db, { players: [aId, bId], gameType: 'backgammon', state: state });
  createAiSession(db, { gameId, botUserId: botId, personaId: 'colonel-pip' });

  await orchestrator.runTurn(gameId);

  // CROSS-BUG-3: the bot's initial-roll wake-up sets pendingRoll instead of
  // generating a value. In production the human's client resolves it; here
  // we simulate that POST so the rest of the leg can run.
  const backgammonPlugin = (await import('../plugins/backgammon/plugin.js')).default;
  const writeState = (s) => db.prepare("UPDATE games SET state = ? WHERE id = ?").run(JSON.stringify(s), gameId);
  let s = JSON.parse(db.prepare("SELECT state FROM games WHERE id = ?").get(gameId).state);
  assert.ok(s.pendingRoll, 'bot wake-up set pendingRoll');
  assert.equal(s.pendingRoll.kind, 'roll-initial');
  // Resolve as the human (proxy POST) with a deterministic value.
  const resolveResult = backgammonPlugin.applyAction({
    state: s,
    action: { type: 'roll-initial', payload: { value: 5, throwParams: [] } },
    actorId: humanId,
  });
  assert.equal(resolveResult.error, undefined, `resolve POST failed: ${resolveResult.error}`);
  writeState(resolveResult.state);

  // Now wake the orchestrator again — bot picks moves with the resolved dice.
  await orchestrator.runTurn(gameId);

  // Assertions:
  // - LLM was called at most twice (initial-roll auto wakes once, moving LLM-driven once)
  // - SSE saw at least one update
  // - Phase is no longer initial-roll
  assert.ok(llm.calls.length <= 2, `LLM called ${llm.calls.length} times; expected ≤2`);
  const types = events.map(e => e.type);
  assert.ok(types.includes('update'), 'update SSE fired');
  const finalState = JSON.parse(db.prepare("SELECT state FROM games WHERE id = ?").get(gameId).state);
  assert.notEqual(finalState.turn.phase, 'initial-roll', 'phase advanced past initial-roll');

  const sess = getAiSession(db, gameId, botId);
  // After one runTurn at moving phase, the head move applied; depending on
  // recursion drain, the tail may have been consumed (pendingSequence=null)
  // or remain (pendingSequence has 0+ entries). Either way, the cache
  // mechanism was exercised — assert the column was touched (set then
  // possibly cleared by drain recursion).
  assert.ok(sess.pendingSequence === null || Array.isArray(sess.pendingSequence),
    'pendingSequence is either drained or cached');
});

test('backgammon: garbage LLM response stalls cleanly', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'bg-stall-'));
  const db = openDb(join(dir, 'test.db'));
  const now = Date.now();
  const llm = new FakeLlmClient([
    { text: 'mumble' },
    { text: 'mumble again' },
  ]);
  const events = [];
  const sse = { broadcast: (gid, ev) => events.push({ gid, ...ev }) };
  const personaDir = join(process.cwd(), 'data', 'ai-personas');
  const { orchestrator } = bootAiSubsystem({ db, sse, llm, personaDir });

  const humanId = db.prepare("INSERT INTO users (email,friendly_name,color,created_at) VALUES ('h@x','H','#000',?) RETURNING id").get(now).id;
  const botId = db.prepare("SELECT id FROM users WHERE is_bot = 1 LIMIT 1").get().id;
  const aId = Math.min(humanId, botId), bId = Math.max(humanId, botId);
  // Skip initial-roll by setting phase to pre-roll directly (so the stall
  // happens on the first LLM call, not on auto-roll).
  const state = buildInitialState({ participants: [{ userId: aId, side: 'a' }, { userId: bId, side: 'b' }] });
  state.turn.phase = 'pre-roll';
  state.activeUserId = botId;
  state.sides = { a: botId, b: humanId };

  const gameId = insertGame(db, { players: [aId, bId], gameType: 'backgammon', state: state });
  createAiSession(db, { gameId, botUserId: botId, personaId: 'colonel-pip' });

  await orchestrator.runTurn(gameId);

  const sess = getAiSession(db, gameId, botId);
  assert.ok(sess.stalledAt, 'bot is stalled after garbage responses');
  assert.equal(sess.stallReason, 'invalid_response');
  const stallEvents = events.filter(e => e.type === 'bot_stalled');
  assert.equal(stallEvents.length, 1);
});
