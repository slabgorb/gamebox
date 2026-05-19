import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBoard, scoreCandidate } from '../plugins/risk/server/ai/board-eval.js';
import { allTerritories, continentTerritories } from '../plugins/risk/server/map.js';

function fullNamerica() {
  const terr = {};
  for (const id of allTerritories()) terr[id] = { owner: 1, armies: 1 };
  for (const id of continentTerritories('namerica')) terr[id] = { owner: 0, armies: 3 };
  return { phase: 'attack', currentPlayer: 0, territories: terr };
}

test('owning a whole continent scores higher than owning the same count scattered', () => {
  const held = fullNamerica();
  const scattered = fullNamerica();
  // Move one North America territory to the enemy and give player 0 a
  // far-away one of equal count instead.
  scattered.territories.alaska = { owner: 1, armies: 1 };
  scattered.territories.south_africa = { owner: 0, armies: 3 };
  assert.ok(evaluateBoard(held, 0).total > evaluateBoard(scattered, 0).total);
});

test('evaluateBoard returns a breakdown object', () => {
  const r = evaluateBoard(fullNamerica(), 0);
  assert.equal(typeof r.total, 'number');
  assert.ok(r.breakdown && typeof r.breakdown === 'object');
});

test('scoreCandidate prefers attacking a weaker target', () => {
  // alaska is adjacent to both nwt and alberta.
  const s = {
    phase: 'attack', currentPlayer: 0,
    territories: {
      alaska: { owner: 0, armies: 8 }, nwt: { owner: 1, armies: 1 },
      alberta: { owner: 1, armies: 7 },
    },
  };
  const easy = scoreCandidate(s, 0, { type: 'attack', payload: { from: 'alaska', to: 'nwt', force: 7 } });
  const hard = scoreCandidate(s, 0, { type: 'attack', payload: { from: 'alaska', to: 'alberta', force: 7 } });
  assert.ok(easy > hard);
});
