import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';
import { buildInitialState, firstPlayer } from '../plugins/risk/server/state.js';

function rngFrom(seq) { let i = 0; return () => seq[i++ % seq.length]; }

function setupState() {
  const s = buildInitialState({
    participants: [{ userId: 7, side: 'a' }, { userId: 8, side: 'b' }],
    rng: rngFrom([0.1, 0.4, 0.7, 0.2, 0.9, 0.5, 0.3, 0.6, 0.8, 0.0, 0.15, 0.45]),
  });
  s.setupPools = [2, 2]; // shrink for the test
  return s;
}

// E5-3: turn order (incl. setup deploy order) is decided by a seeded roll-off,
// so the first player is derived from state, not assumed to be seat 0.
test('setup-deploy: first player spends pool, control passes to the next seat', () => {
  const s = setupState();
  const first = firstPlayer(s);           // roll-off winner deploys first
  const next = first === 0 ? 1 : 0;       // 2P: the other seat
  const myTerr = Object.keys(s.territories).filter(id => s.territories[id].owner === first);
  const r = applyRiskAction({
    state: s, actorId: s.seats[first],
    action: { type: 'setup-deploy', payload: { placements: { [myTerr[0]]: 2 } } },
  });
  assert.equal(r.error, undefined);
  assert.equal(r.state.phase, 'setup');
  assert.equal(r.state.currentPlayer, next);
  assert.equal(r.state.activeUserId, s.seats[next]);
  assert.equal(r.state.setupPools[first], 0);
  assert.equal(r.state.territories[myTerr[0]].armies, 3);
});

test('setup-deploy: after both pools spent, enter reinforce with the winner first', () => {
  let s = setupState();
  const first = firstPlayer(s);
  const second = first === 0 ? 1 : 0;
  const tFirst = Object.keys(s.territories).filter(id => s.territories[id].owner === first);
  const tSecond = Object.keys(s.territories).filter(id => s.territories[id].owner === second);
  s = applyRiskAction({ state: s, actorId: s.seats[first],
    action: { type: 'setup-deploy', payload: { placements: { [tFirst[0]]: 2 } } } }).state;
  const r = applyRiskAction({ state: s, actorId: s.seats[second],
    action: { type: 'setup-deploy', payload: { placements: { [tSecond[0]]: 2 } } } });
  assert.equal(r.error, undefined);
  assert.equal(r.state.phase, 'reinforce');
  assert.equal(r.state.currentPlayer, first);        // winner takes the first turn
  assert.equal(r.state.activeUserId, s.seats[first]);
  assert.ok(r.state.reinforcePool >= 3);
});

test('setup-deploy onto an unowned territory is rejected', () => {
  const s = setupState();
  const first = firstPlayer(s);
  // A territory the active (first) player does not own.
  const enemy = Object.keys(s.territories).find(id => s.territories[id].owner !== first);
  const r = applyRiskAction({ state: s, actorId: s.seats[first],
    action: { type: 'setup-deploy', payload: { placements: { [enemy]: 2 } } } });
  assert.match(r.error, /not owned/);
});
