import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClueAction } from '../plugins/clue/server/actions.js';

// 3-seat state, seat 0 (userId 7) on turn in phase 'move'.
function fixture() {
  return {
    seats: [7, 8, 9],
    phase: 'move',
    currentSeat: 0,
    activeUserId: 7,
    envelope: { suspect: 'plum', weapon: 'rope', room: 'study' },
    hands: [['mustard'], ['green', 'knife'], ['library']],
    pawns: Object.fromEntries(['scarlett', 'mustard', 'white', 'green', 'peacock', 'plum']
      .map((s) => [s, { room: null }])),
    weapons: { candlestick: 'kitchen', knife: 'ballroom', leadpipe: 'library',
               revolver: 'lounge', rope: 'diningroom', wrench: 'study' },
    seatSuspect: ['scarlett', 'mustard', 'white'],
    eliminated: [false, false, false],
    ledgers: [[], [], []],
    suggestion: null,
    log: [],
  };
}

test('enterRoom places the seat pawn and moves to suggest phase', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'enterRoom', payload: { room: 'hall' } }, actorId: 7 });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.state.pawns.scarlett, { room: 'hall' });
  assert.equal(r.state.phase, 'suggest');
});

test('enterRoom rejects a non-current seat and bad rooms', () => {
  assert.match(applyClueAction({ state: fixture(), action: { type: 'enterRoom', payload: { room: 'hall' } }, actorId: 8 }).error, /not your turn/);
  assert.match(applyClueAction({ state: fixture(), action: { type: 'enterRoom', payload: { room: 'attic' } }, actorId: 7 }).error, /invalid room/);
});

test('suggest requires being in the named room', () => {
  const s = fixture();
  s.phase = 'suggest';
  s.pawns.scarlett = { room: 'hall' };
  const wrong = applyClueAction({ state: s, action: { type: 'suggest', payload: { suspect: 'green', weapon: 'knife', room: 'library' } }, actorId: 7 });
  assert.match(wrong.error, /room you are in/);
});

test('suggest drags pawn+weapon in, finds refuter, pauses on that human', () => {
  const s = fixture();
  s.phase = 'suggest';
  s.pawns.scarlett = { room: 'hall' };
  // seat1 holds 'green' -> is the refuter.
  const r = applyClueAction({ state: s, action: { type: 'suggest', payload: { suspect: 'green', weapon: 'knife', room: 'hall' } }, actorId: 7 });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.state.pawns.green, { room: 'hall' });   // dragged in
  assert.equal(r.state.weapons.knife, 'hall');               // dragged in
  assert.equal(r.state.phase, 'refute');
  assert.equal(r.state.suggestion.refuterSeat, 1);
  assert.equal(r.state.activeUserId, 8);                      // paused on the refuter
  assert.deepEqual(r.state.log.at(-1), { type: 'suggest', bySeat: 0, suspect: 'green', weapon: 'knife', room: 'hall' });
});

test('suggest nobody can disprove -> accuse-or-pass, passes logged', () => {
  const s = fixture();
  s.phase = 'suggest';
  s.pawns.scarlett = { room: 'hall' };
  s.hands = [['mustard'], ['peacock'], ['revolver']]; // no one holds green/wrench/hall
  const r = applyClueAction({ state: s, action: { type: 'suggest', payload: { suspect: 'green', weapon: 'wrench', room: 'hall' } }, actorId: 7 });
  assert.equal(r.state.phase, 'accuse-or-pass');
  assert.equal(r.state.suggestion.refuterSeat, null);
  assert.equal(r.state.activeUserId, 7); // back to the suggester
  const passLog = r.state.log.filter((e) => e.type === 'no-refute').map((e) => e.seat);
  assert.deepEqual(passLog, [1, 2]);
});

// --- Paranoid extras (beyond the plan) ---

// The plan tests enterRoom out-of-turn and bad-room, but not the phase guard.
// Entering a room is only legal in the 'move' phase; other phases must reject.
test('enterRoom rejects when not in the move phase', () => {
  const s = fixture();
  s.phase = 'suggest';
  const r = applyClueAction({ state: s, action: { type: 'enterRoom', payload: { room: 'hall' } }, actorId: 7 });
  assert.match(r.error, /phase/);
});

// suggest phase + turn guards: the plan only covers the room-you-are-in check.
test('suggest rejects a non-current seat', () => {
  const s = fixture();
  s.phase = 'suggest';
  s.pawns.scarlett = { room: 'hall' };
  const r = applyClueAction({ state: s, action: { type: 'suggest', payload: { suspect: 'green', weapon: 'knife', room: 'hall' } }, actorId: 8 });
  assert.match(r.error, /not your turn/);
});

test('suggest rejects when not in the suggest phase', () => {
  const s = fixture(); // phase is 'move'
  s.pawns.scarlett = { room: 'hall' };
  const r = applyClueAction({ state: s, action: { type: 'suggest', payload: { suspect: 'green', weapon: 'knife', room: 'hall' } }, actorId: 7 });
  assert.match(r.error, /phase/);
});

// Input validation (lang-review #11): garbage suspect/weapon must be rejected
// with a category-specific error before any state mutation.
test('suggest validates the suspect and weapon against the catalog', () => {
  const s = fixture();
  s.phase = 'suggest';
  s.pawns.scarlett = { room: 'hall' };
  assert.match(applyClueAction({ state: s, action: { type: 'suggest', payload: { suspect: 'banana', weapon: 'knife', room: 'hall' } }, actorId: 7 }).error, /invalid suspect/);
  assert.match(applyClueAction({ state: s, action: { type: 'suggest', payload: { suspect: 'green', weapon: 'bazooka', room: 'hall' } }, actorId: 7 }).error, /invalid weapon/);
});

// Prototype-pollution safety (lang-review #3): the suggested suspect/weapon
// become object keys (pawns[suspect], weapons[weapon]). A '__proto__' payload
// must be rejected by the allow-list, never mutate the prototype.
test('suggest rejects prototype-pollution payloads instead of mutating Object.prototype', () => {
  const s = fixture();
  s.phase = 'suggest';
  s.pawns.scarlett = { room: 'hall' };
  const r = applyClueAction({ state: s, action: { type: 'suggest', payload: { suspect: '__proto__', weapon: 'knife', room: 'hall' } }, actorId: 7 });
  assert.match(r.error, /invalid suspect/);
  assert.equal(r.state, undefined); // rejected before any mutation; no state applied
});

// Actor identity: someone not seated at the table is never a participant.
test('a non-participant actor is rejected', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'enterRoom', payload: { room: 'hall' } }, actorId: 999 });
  assert.match(r.error, /not a participant/);
});

// Unknown action types must be rejected explicitly, not silently ignored.
test('unknown action types are rejected', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'teleport', payload: {} }, actorId: 7 });
  assert.match(r.error, /unknown action/);
});

// Reducer purity: applyClueAction must not mutate the caller's state object.
// The plan relies on structuredClone; this proves it, catching any in-place edit.
test('applyClueAction does not mutate the input state', () => {
  const s = fixture();
  const r = applyClueAction({ state: s, action: { type: 'enterRoom', payload: { room: 'hall' } }, actorId: 7 });
  assert.equal(s.phase, 'move');                    // original untouched
  assert.deepEqual(s.pawns.scarlett, { room: null }); // original pawn not moved
  assert.notEqual(r.state, s);                      // a fresh object was returned
});
