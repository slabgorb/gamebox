import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';
import { allTerritories } from '../plugins/risk/server/map.js';

// alaska and nwt are both owned by player 0 and adjacent — a legal fortify
// edge. alaska is NOT adjacent to indonesia, so that's a legal "non-adjacent"
// counter-example.
function fortifyState() {
  const territories = {};
  for (const id of allTerritories()) {
    if (id === 'alaska') territories[id] = { owner: 0, armies: 5 };
    else if (id === 'nwt') territories[id] = { owner: 0, armies: 1 };
    else territories[id] = { owner: 1, armies: 1 };
  }
  return {
    phase: 'fortify', currentPlayer: 0,
    territories,
    reinforcePool: 0, setupPools: [0, 0], fortifyUsed: false,
    lastCombat: null, winner: null, log: [], sides: { a: 7, b: 8 }, activeUserId: 7,
  };
}

test('fortify moves armies between adjacent owned territories and ends the turn', () => {
  const r = applyRiskAction({
    state: fortifyState(), actorId: 7,
    action: { type: 'fortify', payload: { from: 'alaska', to: 'nwt', count: 3 } },
  });
  assert.equal(r.error, undefined);
  assert.equal(r.state.territories.alaska.armies, 2);
  assert.equal(r.state.territories.nwt.armies, 4);
  assert.equal(r.state.phase, 'reinforce'); // turn passed
  assert.equal(r.state.currentPlayer, 1);
  assert.equal(r.state.activeUserId, 8);
  assert.equal(r.state.fortifyUsed, false); // reset for the new turn
  assert.ok(r.state.reinforcePool >= 3); // computed for player 1
});

test('end-turn skips fortify and passes the turn', () => {
  const r = applyRiskAction({ state: fortifyState(), actorId: 7, action: { type: 'end-turn' } });
  assert.equal(r.state.phase, 'reinforce');
  assert.equal(r.state.currentPlayer, 1);
  assert.equal(r.state.activeUserId, 8);
});

test('illegal fortify (non-adjacent) is rejected', () => {
  const r = applyRiskAction({
    state: fortifyState(), actorId: 7,
    action: { type: 'fortify', payload: { from: 'alaska', to: 'indonesia', count: 1 } },
  });
  assert.match(r.error, /adjacent|owned/);
});
