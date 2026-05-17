import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';

function fortifyState() {
  const territories = {};
  const all = ['N1','N2','N3','E1','E2','E3','E4','S1','S2','S3','W1','W2','W3'];
  for (const id of all) {
    if (id === 'N1') territories[id] = { owner: 0, armies: 5 };
    else if (id === 'N2') territories[id] = { owner: 0, armies: 1 };
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
    action: { type: 'fortify', payload: { from: 'N1', to: 'N2', count: 3 } },
  });
  assert.equal(r.error, undefined);
  assert.equal(r.state.territories.N1.armies, 2);
  assert.equal(r.state.territories.N2.armies, 4);
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
    action: { type: 'fortify', payload: { from: 'N1', to: 'E1', count: 1 } },
  });
  assert.match(r.error, /adjacent|owned/);
});
