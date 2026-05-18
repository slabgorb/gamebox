import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTurnPrompt, parseLlmResponse } from '../plugins/risk/server/ai/prompts.js';

const state = {
  phase: 'attack', currentPlayer: 0,
  territories: {
    northern_reach: { owner: 0, armies: 6 }, cordillera: { owner: 1, armies: 2 },
    atlantic_shore: { owner: 0, armies: 1 }, britannia: { owner: 1, armies: 1 },
    europa: { owner: 1, armies: 1 }, persia: { owner: 1, armies: 1 },
    cathay: { owner: 1, armies: 1 }, north_africa: { owner: 1, armies: 1 },
    equatorial: { owner: 1, armies: 1 }, cape: { owner: 1, armies: 1 },
    amazonia: { owner: 1, armies: 1 }, patagonia: { owner: 1, armies: 1 },
    australia: { owner: 1, armies: 1 },
  },
  sides: { a: 7, b: 8 },
};
const shortlist = [
  { id: 'attack:northern_reach->cordillera', summary: 'attack northern_reach->cordillera with 5', score: 4 },
  { id: 'end-attack', summary: 'stop attacking', score: -0.5 },
];

test('buildTurnPrompt includes phase, board, shortlist ids and the JSON footer', () => {
  const p = buildTurnPrompt({ state, shortlist, botPlayerIdx: 0, userMessages: [] });
  assert.match(p, /attack/i);
  assert.match(p, /northern_reach/);
  assert.match(p, /attack:northern_reach->cordillera/);
  assert.match(p, /moveId/);
});

test('buildTurnPrompt surfaces opponent trash talk when present', () => {
  const p = buildTurnPrompt({ state, shortlist, botPlayerIdx: 0, userMessages: ['you are toast'] });
  assert.match(p, /you are toast/);
});

test('parseLlmResponse extracts moveId + banter, tolerates code fences', () => {
  const r = parseLlmResponse('```json\n{"moveId":"attack:northern_reach->cordillera","banter":"Belta takes all"}\n```');
  assert.equal(r.moveId, 'attack:northern_reach->cordillera');
  assert.equal(r.banter, 'Belta takes all');
});

test('parseLlmResponse throws on missing moveId', () => {
  assert.throws(() => parseLlmResponse('{"banter":"hi"}'), /moveId/);
});
