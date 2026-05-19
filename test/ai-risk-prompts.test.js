import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTurnPrompt, parseLlmResponse } from '../plugins/risk/server/ai/prompts.js';
import { allTerritories } from '../plugins/risk/server/map.js';

const territories = {};
for (const id of allTerritories()) territories[id] = { owner: 1, armies: 1 };
territories.alaska = { owner: 0, armies: 6 };
territories.nwt = { owner: 1, armies: 2 };
territories.alberta = { owner: 0, armies: 1 };

const state = {
  phase: 'attack', currentPlayer: 0,
  territories,
  sides: { a: 7, b: 8 },
};
const shortlist = [
  { id: 'attack:alaska->nwt', summary: 'attack alaska->nwt with 5', score: 4 },
  { id: 'end-attack', summary: 'stop attacking', score: -0.5 },
];

test('buildTurnPrompt includes phase, board, shortlist ids and the JSON footer', () => {
  const p = buildTurnPrompt({ state, shortlist, botPlayerIdx: 0, userMessages: [] });
  assert.match(p, /attack/i);
  assert.match(p, /alaska/);
  assert.match(p, /attack:alaska->nwt/);
  assert.match(p, /moveId/);
});

test('buildTurnPrompt surfaces opponent trash talk when present', () => {
  const p = buildTurnPrompt({ state, shortlist, botPlayerIdx: 0, userMessages: ['you are toast'] });
  assert.match(p, /you are toast/);
});

test('parseLlmResponse extracts moveId + banter, tolerates code fences', () => {
  const r = parseLlmResponse('```json\n{"moveId":"attack:alaska->nwt","banter":"Belta takes all"}\n```');
  assert.equal(r.moveId, 'attack:alaska->nwt');
  assert.equal(r.banter, 'Belta takes all');
});

test('parseLlmResponse throws on missing moveId', () => {
  assert.throws(() => parseLlmResponse('{"banter":"hi"}'), /moveId/);
});
