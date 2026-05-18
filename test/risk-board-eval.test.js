import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBoard, scoreCandidate } from '../plugins/risk/server/ai/board-eval.js';

const ALL = ['northern_reach', 'cordillera', 'atlantic_shore', 'britannia', 'europa',
  'persia', 'cathay', 'north_africa', 'equatorial', 'cape', 'amazonia', 'patagonia', 'australia'];

function fullNamerica() {
  const terr = {};
  for (const id of ALL) terr[id] = { owner: 1, armies: 1 };
  for (const id of ['northern_reach', 'cordillera', 'atlantic_shore']) terr[id] = { owner: 0, armies: 3 };
  return { phase: 'attack', currentPlayer: 0, territories: terr };
}

test('owning a whole continent scores higher than owning the same count scattered', () => {
  const held = fullNamerica();
  const scattered = fullNamerica();
  // Move one North America territory to the enemy, give player 0 a far-away one instead.
  scattered.territories.atlantic_shore = { owner: 1, armies: 1 };
  scattered.territories.north_africa = { owner: 0, armies: 3 };
  assert.ok(evaluateBoard(held, 0).total > evaluateBoard(scattered, 0).total);
});

test('evaluateBoard returns a breakdown object', () => {
  const r = evaluateBoard(fullNamerica(), 0);
  assert.equal(typeof r.total, 'number');
  assert.ok(r.breakdown && typeof r.breakdown === 'object');
});

test('scoreCandidate prefers attacking a weaker target', () => {
  // northern_reach is adjacent to both cordillera and atlantic_shore.
  const s = {
    phase: 'attack', currentPlayer: 0,
    territories: {
      northern_reach: { owner: 0, armies: 8 }, cordillera: { owner: 1, armies: 1 },
      atlantic_shore: { owner: 1, armies: 7 },
    },
  };
  const easy = scoreCandidate(s, 0, { type: 'attack', payload: { from: 'northern_reach', to: 'cordillera', force: 7 } });
  const hard = scoreCandidate(s, 0, { type: 'attack', payload: { from: 'northern_reach', to: 'atlantic_shore', force: 7 } });
  assert.ok(easy > hard);
});
