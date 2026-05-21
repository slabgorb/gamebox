// test/ai-risk-player.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseAction } from '../plugins/risk/server/ai/risk-player.js';
import { FakeLlmClient } from '../src/server/ai/fake-llm-client.js';
import { InvalidLlmMove, InvalidLlmResponse } from '../src/server/ai/errors.js';
import { allTerritories } from '../plugins/risk/server/map.js';

const persona = { id: 'amos', displayName: 'Amos', systemPrompt: 'you are amos' };

// alaska (you, 6) borders the enemy alberta -> a legal attack.
function attackState() {
  const territories = {};
  for (const id of allTerritories()) territories[id] = { owner: 1, armies: 1 };
  territories.alaska = { owner: 0, armies: 6 };
  territories.alberta = { owner: 1, armies: 1 };
  territories.nwt = { owner: 0, armies: 1 };
  return {
    phase: 'attack', currentPlayer: 0, territories,
    reinforcePool: 0, setupPools: [0, 0], sides: { a: 7, b: 8 }, activeUserId: 7,
  };
}

test('chooseAction returns the action whose id the LLM picked, plus banter', async () => {
  const llm = new FakeLlmClient([{ text: '{"moveId":"attack:alaska->alberta","banter":"Belta takes it"}', sessionId: 'sess-1' }]);
  const r = await chooseAction({ llm, persona, sessionId: null, state: attackState(), botPlayerIdx: 0 });
  assert.equal(r.action.type, 'attack');
  assert.deepEqual(r.action.payload, { from: 'alaska', to: 'alberta', force: 5 });
  assert.equal(r.banter, 'Belta takes it');
  assert.equal(r.sessionId, 'sess-1');
  assert.deepEqual(r.sequenceTail, []);
});

test('chooseAction throws InvalidLlmMove when LLM picks an id outside the shortlist', async () => {
  const llm = new FakeLlmClient([{ text: '{"moveId":"attack:Z9->Z8","banter":"nope"}' }]);
  await assert.rejects(
    () => chooseAction({ llm, persona, sessionId: null, state: attackState(), botPlayerIdx: 0 }),
    InvalidLlmMove,
  );
});

test('chooseAction throws InvalidLlmResponse on unparseable text', async () => {
  const llm = new FakeLlmClient([{ text: 'I refuse to answer' }]);
  await assert.rejects(
    () => chooseAction({ llm, persona, sessionId: null, state: attackState(), botPlayerIdx: 0 }),
    InvalidLlmResponse,
  );
});

test('no legal moves throws', async () => {
  const llm = new FakeLlmClient([{ text: '{"moveId":"x","banter":"y"}' }]);
  const s = attackState(); s.phase = 'gameover';
  await assert.rejects(() => chooseAction({ llm, persona, sessionId: null, state: s, botPlayerIdx: 0 }));
});

test('chooseAction shortlist always includes end-attack in attack phase', async () => {
  // Construct an attack-phase state where 6+ attacks all out-score end-attack,
  // so the unfixed slice(0,6) would drop end-attack.
  const territories = {};
  for (const id of allTerritories()) territories[id] = { owner: 1, armies: 1 };
  // Six high-army frontier territories — each generates one or more attacks
  // whose `armies - target_armies` advantage > -0.5 (end-attack's score).
  territories.alaska   = { owner: 0, armies: 8 };
  territories.alberta  = { owner: 1, armies: 1 };  // alaska -> alberta
  territories.nwt      = { owner: 1, armies: 1 };  // alaska -> nwt
  territories.ontario  = { owner: 0, armies: 8 };
  territories.greenland = { owner: 1, armies: 1 }; // ontario -> greenland
  territories.quebec   = { owner: 1, armies: 1 };  // ontario -> quebec
  territories.brazil   = { owner: 0, armies: 8 };
  territories.venezuela = { owner: 1, armies: 1 }; // brazil -> venezuela
  territories.north_africa = { owner: 1, armies: 1 }; // brazil -> north_africa
  const state = {
    phase: 'attack', currentPlayer: 0, territories,
    reinforcePool: 0, setupPools: [0, 0], sides: { a: 7, b: 8 }, activeUserId: 7,
  };

  // Capture the prompt text so we can confirm what shortlist the model saw.
  let capturedPrompt = '';
  const llm = {
    async send({ prompt }) {
      capturedPrompt = prompt;
      return { text: '{"moveId":"end-attack","banter":"enough"}', sessionId: 's' };
    },
  };
  const r = await chooseAction({ llm, persona, sessionId: null, state, botPlayerIdx: 0 });
  assert.match(capturedPrompt, /end-attack/, 'shortlist must include end-attack');
  assert.equal(r.action.type, 'end-attack');
});
