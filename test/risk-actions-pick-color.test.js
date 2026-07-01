import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';
import { allTerritories } from '../plugins/risk/server/map.js';

// E5-9 — per-seat colour picker: server colour-mutation action.
//
// A seated player picks their own palette slot during the setup phase via a
// new `pick-color` action. Because colours seed to the identity permutation
// (`state.colors = [0,1,2,3]` at 4P — every slot already taken) and Risk runs
// 2-4P, a "reject taken slots" rule would make 4P unpickable. So a pick SWAPS:
// the actor takes the target slot and whoever held it takes the actor's old
// slot. `state.colors` therefore stays an injection (all-distinct) for every
// player count — two seats can never silently share a colour (AC5).
//
// The action is self-scoped (writes only the ACTOR's seat), so unlike deploy/
// attack it is allowed for ANY seat during setup, not just currentPlayer.
//
// These fail RED because `pick-color` is not a known action yet.

function setupState(overrides = {}) {
  const seats = overrides.seats ?? [10, 11, 12, 13];
  const n = seats.length;
  const territories = {};
  allTerritories().forEach((id, i) => { territories[id] = { owner: i % n, armies: 1 }; });
  return {
    phase: 'setup',
    currentPlayer: 0,
    seats,
    territories,
    colors: seats.map((_, i) => i), // identity
    setupPools: seats.map(() => 5),
    turnOrderRolls: seats.map((_, i) => 6 - i),
    fortifyUsed: false,
    lastCombat: null,
    winner: null,
    log: [],
    activeUserId: seats[0],
    ...overrides,
  };
}

const pick = (state, actorId, color) =>
  applyRiskAction({ state, action: { type: 'pick-color', payload: { color } }, actorId });

test('pick-color: a seat takes a FREE slot (2P) without touching others', () => {
  const s = setupState({ seats: [10, 11], colors: [0, 1] });
  const r = pick(s, 10, 2); // seat 0 -> slot 2 (free)
  assert.equal(r.error, undefined);
  assert.equal(r.state.colors[0], 2);
  assert.equal(r.state.colors[1], 1); // untouched
});

test('pick-color: taking a TAKEN slot SWAPS the two seats (4P)', () => {
  const s = setupState(); // [0,1,2,3]
  const r = pick(s, 10, 2); // seat 0 takes slot 2 (held by seat 2)
  assert.equal(r.error, undefined);
  assert.equal(r.state.colors[0], 2); // actor got the target
  assert.equal(r.state.colors[2], 0); // displaced seat took actor's old slot
  assert.deepEqual(r.state.colors, [2, 1, 0, 3]);
});

test('pick-color: colours stay all-distinct after any pick (AC5 invariant)', () => {
  let s = setupState();
  for (const [actor, color] of [[10, 2], [13, 2], [11, 0], [12, 1]]) {
    const r = pick(s, actor, color);
    assert.equal(r.error, undefined);
    const c = r.state.colors;
    assert.equal(new Set(c).size, c.length, `duplicate colour after ${actor}->${color}: ${c}`);
    s = r.state;
  }
});

test('pick-color: a NON-current player may pick during setup (self-scoped, off-turn)', () => {
  const s = setupState({ currentPlayer: 0 });
  const r = pick(s, 12, 3); // seat 2 picks while seat 0 is current
  assert.equal(r.error, undefined); // NOT "not your turn"
  assert.equal(r.state.colors[2], 3);
});

test('pick-color: picking your own current slot is an idempotent no-op', () => {
  const s = setupState();
  const r = pick(s, 11, 1); // seat 1 already holds slot 1
  assert.equal(r.error, undefined);
  assert.deepEqual(r.state.colors, [0, 1, 2, 3]);
});

test('pick-color: an out-of-range or non-integer slot is rejected, colours unchanged', () => {
  for (const bad of [9, -1, 1.5, 4]) {
    const s = setupState();
    const r = pick(s, 10, bad);
    assert.ok(r.error, `expected error for color=${bad}`);
    assert.equal(r.state, undefined);
  }
});

test('pick-color: rejected once setup is over (only mutable during setup)', () => {
  const s = setupState({ phase: 'reinforce', currentPlayer: 0 });
  const r = pick(s, 10, 2);
  assert.ok(r.error, 'colours should be locked outside the setup phase');
});

test('pick-color: an unknown participant cannot pick', () => {
  const s = setupState();
  const r = pick(s, 999, 2);
  assert.ok(r.error);
});
