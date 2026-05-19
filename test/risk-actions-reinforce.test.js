import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction, reinforcementFor } from '../plugins/risk/server/actions.js';
import { allTerritories, continentTerritories } from '../plugins/risk/server/map.js';

function stateOwning(ids0, armies = 1) {
  const territories = {};
  for (const id of allTerritories()) {
    territories[id] = { owner: ids0.includes(id) ? 0 : 1, armies };
  }
  return {
    phase: 'reinforce', currentPlayer: 0, territories,
    reinforcePool: 0, setupPools: [0, 0], fortifyUsed: false,
    lastCombat: null, winner: null, log: [], sides: { a: 7, b: 8 }, activeUserId: 7,
  };
}

test('reinforcementFor: max(3, floor(n/3)) + owned continent bonuses', () => {
  // Own all of South America (4 territories, +2) plus 1 elsewhere = 5 territories:
  // floor(5/3)=1 -> max(3,1)=3, +2 = 5
  const sAmericaPlus = [...continentTerritories('samerica'), 'alaska'];
  assert.equal(reinforcementFor(stateOwning(sAmericaPlus), 0), 5);

  // Own all of Australia (4, +2) plus all of South America (4, +2) = 8 territories:
  // floor(8/3)=2 -> max(3,2)=3, +2+2 = 7
  const auPlusSa = [
    ...continentTerritories('australia'),
    ...continentTerritories('samerica'),
  ];
  assert.equal(reinforcementFor(stateOwning(auPlusSa), 0), 7);

  // Own 10 scattered, no full continent: floor(10/3)=3 -> max(3,3)=3, +0 = 3
  const scattered = [
    'alaska', 'greenland', 'iceland', 'great_britain',
    'north_africa', 'east_africa', 'middle_east', 'india',
    'japan', 'eastern_australia',
  ];
  assert.equal(reinforcementFor(stateOwning(scattered), 0), 3);
});

test('deploy spends the reinforce pool then advances to attack', () => {
  const s = stateOwning(['alaska', 'nwt']);
  s.reinforcePool = 5;
  const r = applyRiskAction({
    state: s,
    action: { type: 'deploy', payload: { placements: { alaska: 5 } } },
    actorId: 7,
  });
  assert.equal(r.error, undefined);
  assert.equal(r.state.territories.alaska.armies, 6);
  assert.equal(r.state.phase, 'attack');
  assert.equal(r.state.reinforcePool, 0);
  assert.equal(r.state.activeUserId, 7);
});

test('deploy rejects wrong total', () => {
  const s = stateOwning(['alaska', 'nwt']);
  s.reinforcePool = 5;
  const r = applyRiskAction({
    state: s,
    action: { type: 'deploy', payload: { placements: { alaska: 4 } } },
    actorId: 7,
  });
  assert.match(r.error, /pool/);
});

test('rejects action from the player who is not active', () => {
  const s = stateOwning(['alaska']);
  s.reinforcePool = 3;
  const r = applyRiskAction({
    state: s,
    action: { type: 'deploy', payload: { placements: { alaska: 3 } } },
    actorId: 8,
  });
  assert.match(r.error, /not your turn/);
});
