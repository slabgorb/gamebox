import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction, reinforcementFor } from '../plugins/risk/server/actions.js';

function stateOwning(ids0, armies = 1) {
  const territories = {};
  const all = ['N1','N2','N3','E1','E2','E3','E4','S1','S2','S3','W1','W2','W3'];
  for (const id of all) territories[id] = { owner: ids0.includes(id) ? 0 : 1, armies };
  return {
    phase: 'reinforce', currentPlayer: 0, territories,
    reinforcePool: 0, setupPools: [0, 0], fortifyUsed: false,
    lastCombat: null, winner: null, log: [], sides: { a: 7, b: 8 }, activeUserId: 7,
  };
}

test('reinforcementFor: max(3, floor(n/3)) + owned continent bonuses', () => {
  // Owns all of Norland (3, +2) plus E1 -> 4 territories: floor(4/3)=1 -> max(3,1)=3, +2 = 5
  assert.equal(reinforcementFor(stateOwning(['N1','N2','N3','E1']), 0), 5);
  // Owns 9 scattered, no full continent: floor(9/3)=3 -> max(3,3)=3, +0 = 3
  assert.equal(reinforcementFor(stateOwning(['N1','N2','E1','E2','E3','S1','S2','W1','W2']), 0), 3);
});

test('deploy spends the reinforce pool then advances to attack', () => {
  const s = stateOwning(['N1', 'N2', 'N3', 'E1']);
  s.reinforcePool = 5;
  const r = applyRiskAction({ state: s, action: { type: 'deploy', payload: { placements: { N1: 5 } } }, actorId: 7 });
  assert.equal(r.error, undefined);
  assert.equal(r.state.territories.N1.armies, 6);
  assert.equal(r.state.phase, 'attack');
  assert.equal(r.state.reinforcePool, 0);
  assert.equal(r.state.activeUserId, 7);
});

test('deploy rejects wrong total', () => {
  const s = stateOwning(['N1', 'N2', 'N3', 'E1']);
  s.reinforcePool = 5;
  const r = applyRiskAction({ state: s, action: { type: 'deploy', payload: { placements: { N1: 4 } } }, actorId: 7 });
  assert.match(r.error, /pool/);
});

test('rejects action from the player who is not active', () => {
  const s = stateOwning(['N1']);
  s.reinforcePool = 3;
  const r = applyRiskAction({ state: s, action: { type: 'deploy', payload: { placements: { N1: 3 } } }, actorId: 8 });
  assert.match(r.error, /not your turn/);
});
