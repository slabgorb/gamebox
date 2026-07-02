// E6-5 Task 2 — plugin.js manifest + registration + contract round-trip.
// Everything here drives the REGISTERED surface (plugin.initialState /
// applyAction / publicView), never module internals: this is the exact
// contract src/server/routes.js invokes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import cluePlugin from '../plugins/clue/plugin.js';
import { validatePlugin, buildRegistry } from '../src/server/plugins.js';
import { plugins } from '../src/plugins/index.js';
import { det } from './_helpers/clue-fixtures.js';

const parts = (n) => Array.from({ length: n }, (_, i) => ({ userId: 100 + i, seat: i }));

test('clue plugin passes platform validation with a 3-4 player manifest', () => {
  assert.doesNotThrow(() => validatePlugin(cluePlugin));
  assert.equal(cluePlugin.id, 'clue');
  assert.equal(cluePlugin.displayName, 'Clue');
  assert.deepEqual(cluePlugin.players, { min: 3, max: 4 });
  assert.equal(cluePlugin.clientDir, 'plugins/clue/client');
});

test('clue is registered in the shared registry (key === id, full map validates)', () => {
  assert.ok(plugins.clue, 'plugins.clue missing from src/plugins/index.js');
  assert.doesNotThrow(() => buildRegistry(plugins));
  assert.equal(plugins.clue.id, 'clue');
});

test('initialState builds 3- and 4-seat games; engine enforces the same 3-4 bounds', () => {
  const s3 = cluePlugin.initialState({ participants: parts(3), rng: det(4) });
  assert.deepEqual(s3.seats, [100, 101, 102]);
  assert.equal(s3.phase, 'move');
  assert.equal(s3.currentSeat, 0);
  assert.equal(s3.activeUserId, 100);
  assert.equal(s3.pendingRoll, null);

  const s4 = cluePlugin.initialState({ participants: parts(4), rng: det(4) });
  assert.deepEqual(s4.seats, [100, 101, 102, 103]);
  assert.equal(s4.seatSuspect.length, 4);

  // Manifest {min:3, max:4} must agree with the engine's own guard.
  assert.throws(() => cluePlugin.initialState({ participants: parts(2), rng: det(4) }), /3-4/);
  assert.throws(() => cluePlugin.initialState({ participants: parts(5), rng: det(4) }), /3-4/);
});

test('publicView never leaks the envelope, other hands, or other ledgers', () => {
  const state = cluePlugin.initialState({ participants: parts(3), rng: det(4) });
  for (const viewerId of state.seats) {
    const v = cluePlugin.publicView({ state, viewerId });
    assert.equal('envelope' in v, false, 'envelope must not be a view field');
    assert.equal('hands' in v, false, 'hands must not be a view field');
    assert.equal('ledgers' in v, false, 'ledgers must not be a view field');
    assert.deepEqual(v.hand, state.hands[state.seats.indexOf(viewerId)], 'own hand only');
  }
  // Spectator / non-participant view degrades safely.
  const spectator = cluePlugin.publicView({ state, viewerId: 999 });
  assert.equal(spectator.youAreSeat, null);
  assert.deepEqual(spectator.hand, []);
  assert.equal(spectator.movement, null);
});

test('client-side dice contract: roll{value} round-trips; bad values are rejected', () => {
  const state = cluePlugin.initialState({ participants: parts(3), rng: det(4) });

  // The die value is supplied by the client — the server never RNGs it.
  const rolled = cluePlugin.applyAction({
    state, action: { type: 'roll', payload: { value: 5 } }, actorId: 100,
  });
  assert.equal(rolled.error, undefined);
  assert.equal(rolled.state.pendingRoll, 5);
  assert.equal(rolled.state.phase, 'move');
  assert.equal(rolled.state.activeUserId, 100, 'roll does not hand the turn away');

  // Values-less and out-of-range rolls are engine-rejected (the bot's roll
  // intent must therefore be intercepted, never applied — F8b).
  assert.match(cluePlugin.applyAction({
    state, action: { type: 'roll', payload: {} }, actorId: 100,
  }).error ?? '', /die value/);
  assert.match(cluePlugin.applyAction({
    state, action: { type: 'roll', payload: { value: 7 } }, actorId: 100,
  }).error ?? '', /die value/);
  assert.match(cluePlugin.applyAction({
    state: rolled.state, action: { type: 'roll', payload: { value: 3 } }, actorId: 100,
  }).error ?? '', /already rolled/);
});

test('movement flows from the view: the active viewer moves to a disclosed square', () => {
  const state = cluePlugin.initialState({ participants: parts(3), rng: det(4) });
  const rolled = cluePlugin.applyAction({
    state, action: { type: 'roll', payload: { value: 5 } }, actorId: 100,
  }).state;

  const v = cluePlugin.publicView({ state: rolled, viewerId: 100 });
  assert.equal(v.movement.needsRoll, false);
  assert.equal(v.movement.pendingRoll, 5);
  assert.ok(Array.isArray(v.movement.squares) && v.movement.squares.length > 0,
    'active viewer is told the reachable squares');

  // Reachability is NOT disclosed to the other seats.
  assert.equal(cluePlugin.publicView({ state: rolled, viewerId: 101 }).movement, null);

  const sq = v.movement.squares[0];
  const moved = cluePlugin.applyAction({
    state: rolled, action: { type: 'move', payload: { square: sq } }, actorId: 100,
  });
  assert.equal(moved.error, undefined);
  assert.deepEqual(moved.state.pawns[moved.state.seatSuspect[0]], { square: [sq[0], sq[1]] });
  assert.equal(moved.state.pendingRoll, null);
  assert.equal(moved.state.phase, 'accuse-or-pass');

  // An unreachable square is rejected.
  assert.match(cluePlugin.applyAction({
    state: rolled, action: { type: 'move', payload: { square: [0, 0] } }, actorId: 100,
  }).error ?? '', /not reachable/);
});

test('room entry through the registered surface advances to suggest', () => {
  const state = cluePlugin.initialState({ participants: parts(3), rng: det(4) });
  const entered = cluePlugin.applyAction({
    state, action: { type: 'enterRoom', payload: { room: 'hall' } }, actorId: 100,
  });
  assert.equal(entered.error, undefined);
  assert.equal(entered.state.phase, 'suggest');
  assert.deepEqual(entered.state.pawns[entered.state.seatSuspect[0]], { room: 'hall' });
});

test('hostile input is rejected at the registered surface', () => {
  const state = cluePlugin.initialState({ participants: parts(3), rng: det(4) });

  // Non-participant actors are refused outright.
  assert.equal(cluePlugin.applyAction({
    state, action: { type: 'pass' }, actorId: 999,
  }).error, 'not a participant');

  // Unknown action types are refused with a specific error.
  assert.match(cluePlugin.applyAction({
    state, action: { type: 'nonsense' }, actorId: 100,
  }).error ?? '', /unknown action/);

  // Prototype-key room ids never validate (Object.hasOwn guard).
  assert.match(cluePlugin.applyAction({
    state, action: { type: 'enterRoom', payload: { room: '__proto__' } }, actorId: 100,
  }).error ?? '', /invalid room/);
});
