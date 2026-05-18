import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBoard, scoreCandidate } from '../plugins/risk/server/ai/board-eval.js';

function fullNorland() {
  const terr = {};
  const all = ['N1','N2','N3','E1','E2','E3','E4','S1','S2','S3','W1','W2','W3'];
  for (const id of all) terr[id] = { owner: 1, armies: 1 };
  for (const id of ['N1','N2','N3']) terr[id] = { owner: 0, armies: 3 };
  return { phase: 'attack', currentPlayer: 0, territories: terr };
}

test('owning a whole continent scores higher than owning the same count scattered', () => {
  const held = fullNorland();
  const scattered = fullNorland();
  // Move one Norland territory to the enemy, give player 0 a far-away one instead.
  scattered.territories.N3 = { owner: 1, armies: 1 };
  scattered.territories.S1 = { owner: 0, armies: 3 };
  assert.ok(evaluateBoard(held, 0).total > evaluateBoard(scattered, 0).total);
});

test('evaluateBoard returns a breakdown object', () => {
  const r = evaluateBoard(fullNorland(), 0);
  assert.equal(typeof r.total, 'number');
  assert.ok(r.breakdown && typeof r.breakdown === 'object');
});

test('scoreCandidate prefers attacking a weaker target', () => {
  const s = {
    phase: 'attack', currentPlayer: 0,
    territories: {
      N1: { owner: 0, armies: 8 }, N2: { owner: 1, armies: 1 },
      N3: { owner: 1, armies: 7 },
    },
  };
  const easy = scoreCandidate(s, 0, { type: 'attack', payload: { from: 'N1', to: 'N2', force: 7 } });
  const hard = scoreCandidate(s, 0, { type: 'attack', payload: { from: 'N1', to: 'N3', force: 7 } });
  assert.ok(easy > hard);
});
