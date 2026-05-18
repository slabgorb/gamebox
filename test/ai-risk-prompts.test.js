import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTurnPrompt, parseLlmResponse } from '../plugins/risk/server/ai/prompts.js';

const state = {
  phase: 'attack', currentPlayer: 0,
  territories: {
    N1: { owner: 0, armies: 6 }, N2: { owner: 1, armies: 2 },
    N3: { owner: 0, armies: 1 },
    E1: { owner: 1, armies: 1 }, E2: { owner: 1, armies: 1 },
    E3: { owner: 1, armies: 1 }, E4: { owner: 1, armies: 1 },
    S1: { owner: 1, armies: 1 }, S2: { owner: 1, armies: 1 },
    S3: { owner: 1, armies: 1 }, W1: { owner: 1, armies: 1 },
    W2: { owner: 1, armies: 1 }, W3: { owner: 1, armies: 1 },
  },
  sides: { a: 7, b: 8 },
};
const shortlist = [
  { id: 'attack:N1->N2', summary: 'attack N1->N2 with 5', score: 4 },
  { id: 'end-attack', summary: 'stop attacking', score: -0.5 },
];

test('buildTurnPrompt includes phase, board, shortlist ids and the JSON footer', () => {
  const p = buildTurnPrompt({ state, shortlist, botPlayerIdx: 0, userMessages: [] });
  assert.match(p, /attack/i);
  assert.match(p, /N1/);
  assert.match(p, /attack:N1->N2/);
  assert.match(p, /moveId/);
});

test('buildTurnPrompt surfaces opponent trash talk when present', () => {
  const p = buildTurnPrompt({ state, shortlist, botPlayerIdx: 0, userMessages: ['you are toast'] });
  assert.match(p, /you are toast/);
});

test('parseLlmResponse extracts moveId + banter, tolerates code fences', () => {
  const r = parseLlmResponse('```json\n{"moveId":"attack:N1->N2","banter":"Belta takes all"}\n```');
  assert.equal(r.moveId, 'attack:N1->N2');
  assert.equal(r.banter, 'Belta takes all');
});

test('parseLlmResponse throws on missing moveId', () => {
  assert.throws(() => parseLlmResponse('{"banter":"hi"}'), /moveId/);
});
