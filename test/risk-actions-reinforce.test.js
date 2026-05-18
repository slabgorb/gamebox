import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction, reinforcementFor } from '../plugins/risk/server/actions.js';

const ALL = ['northern_reach', 'cordillera', 'atlantic_shore', 'britannia', 'europa',
  'persia', 'cathay', 'north_africa', 'equatorial', 'cape', 'amazonia', 'patagonia', 'australia'];

function stateOwning(ids0, armies = 1) {
  const territories = {};
  for (const id of ALL) territories[id] = { owner: ids0.includes(id) ? 0 : 1, armies };
  return {
    phase: 'reinforce', currentPlayer: 0, territories,
    reinforcePool: 0, setupPools: [0, 0], fortifyUsed: false,
    lastCombat: null, winner: null, log: [], sides: { a: 7, b: 8 }, activeUserId: 7,
  };
}

test('reinforcementFor: max(3, floor(n/3)) + owned continent bonuses', () => {
  // Owns all of North America (3, +2) plus britannia -> 4 territories:
  // floor(4/3)=1 -> max(3,1)=3, +2 = 5
  assert.equal(reinforcementFor(stateOwning(
    ['northern_reach', 'cordillera', 'atlantic_shore', 'britannia']), 0), 5);
  // Owns 9 scattered, no full continent: floor(9/3)=3 -> max(3,3)=3, +0 = 3
  assert.equal(reinforcementFor(stateOwning(
    ['northern_reach', 'cordillera', 'britannia', 'europa', 'persia',
      'north_africa', 'equatorial', 'amazonia', 'patagonia']), 0), 3);
});

test('deploy spends the reinforce pool then advances to attack', () => {
  const s = stateOwning(['northern_reach', 'cordillera', 'atlantic_shore', 'britannia']);
  s.reinforcePool = 5;
  const r = applyRiskAction({ state: s, action: { type: 'deploy', payload: { placements: { northern_reach: 5 } } }, actorId: 7 });
  assert.equal(r.error, undefined);
  assert.equal(r.state.territories.northern_reach.armies, 6);
  assert.equal(r.state.phase, 'attack');
  assert.equal(r.state.reinforcePool, 0);
  assert.equal(r.state.activeUserId, 7);
});

test('deploy rejects wrong total', () => {
  const s = stateOwning(['northern_reach', 'cordillera', 'atlantic_shore', 'britannia']);
  s.reinforcePool = 5;
  const r = applyRiskAction({ state: s, action: { type: 'deploy', payload: { placements: { northern_reach: 4 } } }, actorId: 7 });
  assert.match(r.error, /pool/);
});

test('rejects action from the player who is not active', () => {
  const s = stateOwning(['northern_reach']);
  s.reinforcePool = 3;
  const r = applyRiskAction({ state: s, action: { type: 'deploy', payload: { placements: { northern_reach: 3 } } }, actorId: 8 });
  assert.match(r.error, /not your turn/);
});
