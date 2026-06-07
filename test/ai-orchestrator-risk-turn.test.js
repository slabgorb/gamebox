// Regression: a Risk bot turn is a run of consecutive actions across phases
// (reinforce-deploy → end-attack → end-turn). The Risk AI returns one action
// at a time with an empty sequenceTail, and several of those actions stay in
// the same phase. The orchestrator must drive the whole turn to completion in
// a single wake-up; otherwise the human has to refresh the page once per
// stalled bot action to push the turn forward.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/server/db.js';
import { createAiSession, getAiSession } from '../src/server/ai/agent-session.js';
import { createOrchestrator } from '../src/server/ai/orchestrator.js';
import riskPlugin from '../plugins/risk/plugin.js';
import { chooseAction as riskChoose } from '../plugins/risk/server/ai/risk-player.js';
import { allTerritories } from '../plugins/risk/server/map.js';
import { insertGame } from './_helpers/games.js';

const HUMAN_IDX = 1, BOT_IDX = 0;

test('orchestrator: drives a full Risk turn (reinforce→attack→fortify→end-turn) in one wake-up', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'orch-risk-'));
  const db = openDb(join(dir, 'test.db'));
  const now = Date.now();
  const humanId = db.prepare("INSERT INTO users (email,friendly_name,color,created_at) VALUES ('h@x','H','#000',?) RETURNING id").get(now).id;
  const botId = db.prepare("INSERT INTO users (email,friendly_name,color,is_bot,created_at) VALUES ('b@x','Bot','#fff',1,?) RETURNING id").get(now).id;
  const aId = Math.min(humanId, botId), bId = Math.max(humanId, botId);

  // Deterministic, combat-free turn. Bot owns only N1+N2 with 1 army each
  // and a pool of 1: the deploy can only reach 2 armies, so the attack phase
  // has zero attack moves (needs >=3) and offers only `end-attack`; fortify
  // offers just `end-turn` + one move, so the phase-ending ids never fall
  // out of the AI's top-6 shortlist. The bot stays the active player until
  // endTurn flips it. Insertion order (N1, N2 first) makes the deploy target
  // deterministic.
  const territories = { N1: { owner: BOT_IDX, armies: 1 }, N2: { owner: BOT_IDX, armies: 1 } };
  for (const id of allTerritories()) {
    if (!territories[id]) territories[id] = { owner: HUMAN_IDX, armies: 1 };
  }
  const state = {
    phase: 'reinforce',
    currentPlayer: BOT_IDX,
    territories,
    reinforcePool: 1,
    setupPools: [0, 0],
    fortifyUsed: false,
    lastCombat: null,
    winner: null,
    log: [],
    sides: { a: botId, b: humanId },   // bot is player 0 (the current player)
    activeUserId: botId,
  };

  const gameId = insertGame(db, { players: [aId, bId], gameType: 'risk', state: state });
  createAiSession(db, { gameId, botUserId: botId, personaId: 'admiral-vonnegut' });

  const events = [];
  const sse = { broadcast: (gid, ev) => events.push({ gid, ...ev }) };
  const persona = { id: 'admiral-vonnegut', displayName: 'Admiral Vonnegut', color: '#7a5c3e', glyph: '★', systemPrompt: 'you are the admiral' };
  const personas = new Map([['admiral-vonnegut', persona]]);

  // Phase-aware fake LLM: deploy in reinforce, stop attacking, then end the
  // turn. Echoes a real shortlist id out of the prompt so the move is legal.
  const llm = {
    calls: [],
    async send({ prompt, sessionId }) {
      this.calls.push({ prompt, sessionId });
      let moveId;
      if (/Current phase: reinforce/.test(prompt)) moveId = prompt.match(/- (deploy:\d+):/)[1];
      else if (/Current phase: attack/.test(prompt)) moveId = 'end-attack';
      else if (/Current phase: fortify/.test(prompt)) moveId = 'end-turn';
      else throw new Error(`unexpected phase in prompt:\n${prompt}`);
      return { text: JSON.stringify({ moveId, banter: 'for the homeland' }), sessionId: 'rs' };
    },
  };
  const adapters = { risk: { plugin: riskPlugin, chooseAction: riskChoose } };
  const orch = createOrchestrator({ db, llm, sse, personas, adapters });

  await orch.runTurn(gameId);

  const after = JSON.parse(db.prepare("SELECT state FROM games WHERE id = ?").get(gameId).state);
  assert.equal(llm.calls.length, 3, 'deploy + end-attack + end-turn all driven in one wake-up');
  assert.ok(after.log.some(e => e.kind === 'end-turn'), 'turn ended (end-turn logged)');
  assert.equal(after.activeUserId, humanId, 'turn handed back to the human — bot did not stall mid-turn');
  assert.equal(getAiSession(db, gameId).stalledAt, null, 'bot did not stall');
});
