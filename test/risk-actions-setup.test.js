import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';
import { buildInitialState } from '../plugins/risk/server/state.js';

function rngFrom(seq) { let i = 0; return () => seq[i++ % seq.length]; }

function setupState() {
  const s = buildInitialState({
    participants: [{ userId: 7, side: 'a' }, { userId: 8, side: 'b' }],
    rng: rngFrom([0.1, 0.4, 0.7, 0.2, 0.9, 0.5, 0.3, 0.6, 0.8, 0.0, 0.15, 0.45]),
  });
  s.setupPools = [2, 2]; // shrink for the test
  return s;
}

test('setup-deploy: player 0 spends pool, control passes to player 1', () => {
  const s = setupState();
  const myTerr = Object.keys(s.territories).filter(id => s.territories[id].owner === 0);
  const r = applyRiskAction({
    state: s, actorId: 7,
    action: { type: 'setup-deploy', payload: { placements: { [myTerr[0]]: 2 } } },
  });
  assert.equal(r.error, undefined);
  assert.equal(r.state.phase, 'setup');
  assert.equal(r.state.currentPlayer, 1);
  assert.equal(r.state.activeUserId, 8);
  assert.equal(r.state.setupPools[0], 0);
  assert.equal(r.state.territories[myTerr[0]].armies, 3);
});

test('setup-deploy: after both pools spent, enter reinforce with computed pool', () => {
  let s = setupState();
  const t0 = Object.keys(s.territories).filter(id => s.territories[id].owner === 0);
  const t1 = Object.keys(s.territories).filter(id => s.territories[id].owner === 1);
  s = applyRiskAction({ state: s, actorId: 7,
    action: { type: 'setup-deploy', payload: { placements: { [t0[0]]: 2 } } } }).state;
  const r = applyRiskAction({ state: s, actorId: 8,
    action: { type: 'setup-deploy', payload: { placements: { [t1[0]]: 2 } } } });
  assert.equal(r.error, undefined);
  assert.equal(r.state.phase, 'reinforce');
  assert.equal(r.state.currentPlayer, 0);
  assert.equal(r.state.activeUserId, 7);
  assert.ok(r.state.reinforcePool >= 3);
});

test('setup-deploy onto an unowned territory is rejected', () => {
  const s = setupState();
  const enemy = Object.keys(s.territories).find(id => s.territories[id].owner === 1);
  const r = applyRiskAction({ state: s, actorId: 7,
    action: { type: 'setup-deploy', payload: { placements: { [enemy]: 2 } } } });
  assert.match(r.error, /not owned/);
});
