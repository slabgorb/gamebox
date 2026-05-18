// test/ai-risk-player.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseAction } from '../plugins/risk/server/ai/risk-player.js';
import { FakeLlmClient } from '../src/server/ai/fake-llm-client.js';
import { InvalidLlmMove, InvalidLlmResponse } from '../src/server/ai/errors.js';

const persona = { id: 'amos', displayName: 'Amos', systemPrompt: 'you are amos' };

function attackState() {
  return {
    phase: 'attack', currentPlayer: 0,
    territories: {
      N1: { owner: 0, armies: 6 }, N2: { owner: 1, armies: 1 },
      N3: { owner: 0, armies: 1 },
      E1: { owner: 1, armies: 1 }, E2: { owner: 1, armies: 1 },
      E3: { owner: 1, armies: 1 }, E4: { owner: 1, armies: 1 },
      S1: { owner: 1, armies: 1 }, S2: { owner: 1, armies: 1 },
      S3: { owner: 1, armies: 1 }, W1: { owner: 1, armies: 1 },
      W2: { owner: 1, armies: 1 }, W3: { owner: 1, armies: 1 },
    },
    reinforcePool: 0, setupPools: [0, 0], sides: { a: 7, b: 8 }, activeUserId: 7,
  };
}

test('chooseAction returns the action whose id the LLM picked, plus banter', async () => {
  const llm = new FakeLlmClient([{ text: '{"moveId":"attack:N1->N2","banter":"Belta takes it"}', sessionId: 'sess-1' }]);
  const r = await chooseAction({ llm, persona, sessionId: null, state: attackState(), botPlayerIdx: 0 });
  assert.equal(r.action.type, 'attack');
  assert.deepEqual(r.action.payload, { from: 'N1', to: 'N2', force: 5 });
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
