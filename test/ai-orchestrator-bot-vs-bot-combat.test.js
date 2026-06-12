// Regression: in a multi-bot game a bot can attack another bot. A bot's
// `attack` action only signals intent — the engine sets state.pendingCombat
// and hands activeUserId to the defender, who is expected to POST the resolved
// dice (the client-side physics). When the defender is ALSO a bot there is no
// client to do that, so the orchestrator must resolve the combat server-side.
// Before the fix the orchestrator paused on pendingCombat and the game
// deadlocked. The existing 4P test masks this by resolving combat in its own
// harness; this test drives the real orchestrator with no such stand-in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/server/db.js';
import { createAiSession, getAiSession } from '../src/server/ai/agent-session.js';
import { createOrchestrator } from '../src/server/ai/orchestrator.js';
import riskPlugin from '../plugins/risk/plugin.js';
import { chooseAction as riskChoose, resolvePendingCombat } from '../plugins/risk/server/ai/risk-player.js';
import { allTerritories } from '../plugins/risk/server/map.js';
import { insertGame } from './_helpers/games.js';

test('orchestrator: resolves a bot-vs-bot pendingCombat server-side instead of deadlocking', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-botcombat-'));
  const db = openDb(join(dir, 'test.db'));
  const now = Date.now();
  const attackerId = db.prepare("INSERT INTO users (email,friendly_name,color,is_bot,created_at) VALUES ('a@x','Atk','#a00',1,?) RETURNING id").get(now).id;
  const defenderId = db.prepare("INSERT INTO users (email,friendly_name,color,is_bot,created_at) VALUES ('d@x','Def','#00a',1,?) RETURNING id").get(now).id;
  const aId = Math.min(attackerId, defenderId), bId = Math.max(attackerId, defenderId);

  // east_africa and congo are adjacent in the canonical map. The attacker bot
  // (seat 0) owns everything except congo, which the defender bot (seat 1)
  // holds with a single army; an overwhelming attack force makes capture (and
  // thus the defender's elimination → game over) effectively certain.
  const territories = {};
  for (const id of allTerritories()) territories[id] = { owner: 0, armies: 1 };
  territories.east_africa = { owner: 0, armies: 30 };
  territories.congo = { owner: 1, armies: 1 };

  const state = {
    phase: 'attack',
    currentPlayer: 0,
    territories,
    reinforcePool: 0,
    setupPools: [0, 0],
    fortifyUsed: false,
    lastCombat: null,
    winner: null,
    log: [],
    sides: { a: attackerId, b: defenderId },
    // pendingCombat hands the turn to the defender (seat 1) as physics proxy.
    activeUserId: defenderId,
    pendingCombat: { from: 'east_africa', to: 'congo', force: 29, attackerIdx: 0, defenderIdx: 1 },
  };

  const gameId = insertGame(db, { players: [aId, bId], gameType: 'risk', state });
  createAiSession(db, { gameId, botUserId: attackerId, personaId: 'admiral-vonnegut' });
  createAiSession(db, { gameId, botUserId: defenderId, personaId: 'major-robert' });

  const personas = new Map([
    ['admiral-vonnegut', { id: 'admiral-vonnegut', displayName: 'Admiral Vonnegut', systemPrompt: 'x' }],
    ['major-robert', { id: 'major-robert', displayName: 'Major Robert', systemPrompt: 'x' }],
  ]);
  // The attacker bot may continue its turn after the capture; if the capture
  // ends the game this is never called. End the turn on any LLM prompt so the
  // test can't hang.
  const llm = {
    async send({ prompt }) {
      const moveId = /Current phase: fortify/.test(prompt) ? 'end-turn' : 'end-attack';
      return { text: JSON.stringify({ moveId, banter: '' }), sessionId: 's' };
    },
  };
  const sse = { broadcast: () => {} };
  const adapters = { risk: { plugin: riskPlugin, chooseAction: riskChoose, resolvePending: resolvePendingCombat } };
  const orch = createOrchestrator({ db, llm, sse, personas, adapters });

  await orch.runTurn(gameId);

  const after = JSON.parse(db.prepare("SELECT state FROM games WHERE id = ?").get(gameId).state);
  assert.ok(!after.pendingCombat, 'pendingCombat resolved, not left dangling (no deadlock)');
  assert.equal(getAiSession(db, gameId, defenderId).stalledAt, null, 'defender bot did not stall');
  assert.equal(getAiSession(db, gameId, attackerId).stalledAt, null, 'attacker bot did not stall');
});

// After a bot attacks another bot mid-turn, the engine pauses the attacker on
// pendingCombat. Once the orchestrator resolves that combat server-side the
// attacker must RESUME and finish its turn in the SAME wake-up. Otherwise the
// attacker is left active mid-turn until an external wake-up (a page refresh,
// via the SSE-subscribe reschedule) nudges it — the "I keep refreshing to
// unblock bots" symptom.
test('orchestrator: attacker resumes its turn after a mid-turn bot-vs-bot combat (no refresh needed)', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-resume-'));
  const db = openDb(join(dir, 'test.db'));
  const now = Date.now();
  const attackerId = db.prepare("INSERT INTO users (email,friendly_name,color,is_bot,created_at) VALUES ('a2@x','Atk','#a00',1,?) RETURNING id").get(now).id;
  const defenderId = db.prepare("INSERT INTO users (email,friendly_name,color,is_bot,created_at) VALUES ('d2@x','Def','#00a',1,?) RETURNING id").get(now).id;
  const humanId = db.prepare("INSERT INTO users (email,friendly_name,color,created_at) VALUES ('h2@x','Hum','#0a0',?) RETURNING id").get(now).id;

  // east_africa is the attacker's only multi-army territory, and congo (a
  // defender holding) is its only enemy neighbour — so the bot's sole legal
  // attack targets the defender bot. The defender also holds south_africa, so
  // losing congo does not eliminate it and the game continues.
  const territories = {};
  for (const id of allTerritories()) territories[id] = { owner: 0, armies: 1 };
  territories.east_africa = { owner: 0, armies: 10 };
  territories.congo = { owner: 1, armies: 1 };
  territories.south_africa = { owner: 1, armies: 1 };
  territories.argentina = { owner: 2, armies: 1 };
  territories.brazil = { owner: 2, armies: 1 };

  const state = {
    phase: 'attack',
    currentPlayer: 0,
    territories,
    reinforcePool: 0,
    setupPools: [0, 0, 0],
    fortifyUsed: false,
    lastCombat: null,
    winner: null,
    log: [],
    seats: [attackerId, defenderId, humanId],
    activeUserId: attackerId,
  };

  const gameId = insertGame(db, { players: [attackerId, defenderId, humanId], gameType: 'risk', state });
  createAiSession(db, { gameId, botUserId: attackerId, personaId: 'admiral-vonnegut' });
  createAiSession(db, { gameId, botUserId: defenderId, personaId: 'major-robert' });

  const personas = new Map([
    ['admiral-vonnegut', { id: 'admiral-vonnegut', displayName: 'Admiral Vonnegut', systemPrompt: 'x' }],
    ['major-robert', { id: 'major-robert', displayName: 'Major Robert', systemPrompt: 'x' }],
  ]);
  // First attack-phase decision (the attacker's) issues the one legal attack;
  // every later one ends the phase. Bots deploy the first shortlisted move and
  // end their turn in fortify.
  let attacked = false;
  const llm = {
    async send({ prompt }) {
      let moveId;
      if (/Current phase: reinforce/.test(prompt)) moveId = prompt.match(/- (deploy:\d+):/)[1];
      else if (/Current phase: attack/.test(prompt)) {
        const m = !attacked && prompt.match(/- (attack:[a-z_]+->[a-z_]+):/);
        if (m) { attacked = true; moveId = m[1]; } else moveId = 'end-attack';
      } else if (/Current phase: fortify/.test(prompt)) moveId = 'end-turn';
      else throw new Error(`unexpected phase:\n${prompt}`);
      return { text: JSON.stringify({ moveId, banter: '' }), sessionId: 's' };
    },
  };
  const sse = { broadcast: () => {} };
  const adapters = { risk: { plugin: riskPlugin, chooseAction: riskChoose, resolvePending: resolvePendingCombat } };
  const orch = createOrchestrator({ db, llm, sse, personas, adapters });

  await orch.runTurn(gameId);

  const after = JSON.parse(db.prepare("SELECT state FROM games WHERE id = ?").get(gameId).state);
  assert.ok(attacked, 'the attacker actually launched its attack');
  assert.ok(!after.pendingCombat, 'combat resolved');
  assert.notEqual(after.activeUserId, attackerId,
    'attacker is not left stuck active mid-turn — it resumed and finished in one wake-up');
  assert.equal(after.activeUserId, humanId,
    'both bot turns completed without a refresh; play handed to the human');
});
