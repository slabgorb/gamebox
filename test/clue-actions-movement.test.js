import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClueAction } from '../plugins/clue/server/actions.js';
import { buildGeometry } from '../plugins/clue/server/geometry.js';

// Synthetic board shared with the movement unit tests.
function miniGeo() {
  return buildGeometry({
    cols: 6, rows: 6,
    rooms: {
      ra: { poly: [[0, 0], [2, 0], [2, 2], [0, 2]] },
      rb: { poly: [[4, 4], [6, 4], [6, 6], [4, 6]] },
    },
    doors: [{ room: 'ra', square: [2, 1] }, { room: 'rb', square: [3, 4] }],
    secretPassages: { ra: 'rb', rb: 'ra' },
    cellar: null,
  });
}

// 2-seat state, seat 0 (userId 7) on turn in phase 'move'.
function fixture() {
  return {
    seats: [7, 8],
    phase: 'move',
    currentSeat: 0,
    activeUserId: 7,
    envelope: { suspect: 'plum', weapon: 'rope', room: 'study' },
    hands: [['mustard'], ['green']],
    pawns: { scarlett: { square: [2, 2] }, mustard: { room: 'rb' },
             white: { square: [0, 5] }, green: { square: [5, 0] },
             peacock: { square: [0, 3] }, plum: { square: [5, 5] } },
    weapons: {},
    seatSuspect: ['scarlett', 'mustard'],
    eliminated: [false, false],
    ledgers: [[], []],
    suggestion: null,
    pendingRoll: null,
    log: [],
  };
}

// --- roll -------------------------------------------------------------------

test('roll records a client-supplied die value and stays in move phase', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'roll', payload: { value: 3 } }, actorId: 7, geo: miniGeo() });
  assert.equal(r.error, undefined);
  assert.equal(r.state.pendingRoll, 3);
  assert.equal(r.state.phase, 'move');
  assert.equal(r.state.activeUserId, 7);
});

test('roll rejects non-1-6 values, double roll, wrong seat, wrong phase', () => {
  assert.match(applyClueAction({ state: fixture(), action: { type: 'roll', payload: { value: 0 } }, actorId: 7, geo: miniGeo() }).error, /1-6|die/);
  assert.match(applyClueAction({ state: fixture(), action: { type: 'roll', payload: { value: 7 } }, actorId: 7, geo: miniGeo() }).error, /1-6|die/);
  assert.match(applyClueAction({ state: fixture(), action: { type: 'roll', payload: { value: 2.5 } }, actorId: 7, geo: miniGeo() }).error, /1-6|die/);
  const rolled = { ...fixture(), pendingRoll: 4 };
  assert.match(applyClueAction({ state: rolled, action: { type: 'roll', payload: { value: 3 } }, actorId: 7, geo: miniGeo() }).error, /already rolled/);
  assert.match(applyClueAction({ state: fixture(), action: { type: 'roll', payload: { value: 3 } }, actorId: 8, geo: miniGeo() }).error, /not your turn/);
  const suggesting = { ...fixture(), phase: 'suggest' };
  assert.match(applyClueAction({ state: suggesting, action: { type: 'roll', payload: { value: 3 } }, actorId: 7, geo: miniGeo() }).error, /phase/);
});

// Die values arrive from the client: a missing payload or a numeric STRING must
// be rejected outright (strict integer check, no type coercion).
test('roll rejects a missing payload and a stringly-typed die value', () => {
  assert.match(applyClueAction({ state: fixture(), action: { type: 'roll' }, actorId: 7, geo: miniGeo() }).error, /1-6|die/);
  assert.match(applyClueAction({ state: fixture(), action: { type: 'roll', payload: { value: '3' } }, actorId: 7, geo: miniGeo() }).error, /1-6|die/);
});

test('roll by a non-participant is rejected', () => {
  assert.match(applyClueAction({ state: fixture(), action: { type: 'roll', payload: { value: 3 } }, actorId: 99, geo: miniGeo() }).error, /not a participant/);
});

test('pass clears a leftover pendingRoll for the next seat', () => {
  const s = { ...fixture(), pendingRoll: 5 };
  const r = applyClueAction({ state: s, action: { type: 'pass', payload: {} }, actorId: 7 });
  assert.equal(r.state.pendingRoll, null);
  assert.equal(r.state.currentSeat, 1);
});

// enterRoom is a turn transition too: it must not leak a stale roll into the
// suggest phase. Uses a real catalog room, independent of injected geometry.
test('enterRoom clears a leftover pendingRoll', () => {
  const s = { ...fixture(), pendingRoll: 4 };
  const r = applyClueAction({ state: s, action: { type: 'enterRoom', payload: { room: 'study' } }, actorId: 7 });
  assert.equal(r.error, undefined);
  assert.equal(r.state.pendingRoll, null);
  assert.equal(r.state.phase, 'suggest');
});

// The wrong-accusation advance branch hands the turn to the next seat and must
// clear pendingRoll like every other transition. Needs 3 seats so the game
// continues past the elimination.
test('wrong accusation clears pendingRoll when the turn advances', () => {
  const s = {
    ...fixture(),
    seats: [7, 8, 9],
    hands: [['mustard'], ['green'], ['white']],
    seatSuspect: ['scarlett', 'mustard', 'white'],
    eliminated: [false, false, false],
    ledgers: [[], [], []],
    pendingRoll: 3,
  };
  const r = applyClueAction({ state: s, action: { type: 'accuse', payload: { suspect: 'green', weapon: 'knife', room: 'hall' } }, actorId: 7 });
  assert.equal(r.error, undefined);
  assert.equal(r.state.eliminated[0], true);
  assert.equal(r.state.currentSeat, 1);
  assert.equal(r.state.pendingRoll, null);
});

// --- move -------------------------------------------------------------------

test('move to a reachable corridor square ends movement at accuse-or-pass', () => {
  const s = { ...fixture(), pendingRoll: 1 }; // scarlett at [2,2]
  const r = applyClueAction({ state: s, action: { type: 'move', payload: { square: [2, 3] } }, actorId: 7, geo: miniGeo() });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.state.pawns.scarlett, { square: [2, 3] });
  assert.equal(r.state.pendingRoll, null);
  assert.equal(r.state.phase, 'accuse-or-pass');
  assert.equal(r.state.activeUserId, 7);
});

test('move rejects an unreachable / diagonal / pre-roll square', () => {
  const rolled = { ...fixture(), pendingRoll: 1 };
  assert.match(applyClueAction({ state: rolled, action: { type: 'move', payload: { square: [3, 3] } }, actorId: 7, geo: miniGeo() }).error, /not reachable/);
  const notRolled = fixture(); // pendingRoll null
  assert.match(applyClueAction({ state: notRolled, action: { type: 'move', payload: { square: [2, 3] } }, actorId: 7, geo: miniGeo() }).error, /roll/);
});

test('move rejects malformed and stringly-typed targets', () => {
  const s = { ...fixture(), pendingRoll: 1 };
  // no square and no room
  assert.ok(applyClueAction({ state: s, action: { type: 'move', payload: {} }, actorId: 7, geo: miniGeo() }).error);
  // coordinates must be numbers, not strings — no coercion
  assert.ok(applyClueAction({ state: s, action: { type: 'move', payload: { square: ['2', '3'] } }, actorId: 7, geo: miniGeo() }).error);
});

test('move into a reachable room routes through enterRoom (-> suggest)', () => {
  // scarlett on ra door threshold [2,1], die 1 -> may enter ra.
  const s = { ...fixture(), pendingRoll: 1 };
  s.pawns = { ...s.pawns, scarlett: { square: [2, 1] } };
  const r = applyClueAction({ state: s, action: { type: 'move', payload: { room: 'ra' } }, actorId: 7, geo: miniGeo() });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.state.pawns.scarlett, { room: 'ra' });
  assert.equal(r.state.phase, 'suggest');
  assert.equal(r.state.pendingRoll, null);
});

test('move rejects entering an unreachable room', () => {
  const s = { ...fixture(), pendingRoll: 1 }; // scarlett at [2,2], rb far away
  assert.match(applyClueAction({ state: s, action: { type: 'move', payload: { room: 'rb' } }, actorId: 7, geo: miniGeo() }).error, /not reachable/);
});

test('move rejects the wrong seat', () => {
  const s = { ...fixture(), pendingRoll: 1 };
  assert.match(applyClueAction({ state: s, action: { type: 'move', payload: { square: [2, 3] } }, actorId: 8, geo: miniGeo() }).error, /not your turn/);
});

// Reducers must copy-on-write (structuredClone contract): a successful move
// must leave the input state untouched.
test('move does not mutate the input state', () => {
  const s = { ...fixture(), pendingRoll: 1 };
  const snapshot = structuredClone(s);
  const r = applyClueAction({ state: s, action: { type: 'move', payload: { square: [2, 3] } }, actorId: 7, geo: miniGeo() });
  assert.equal(r.error, undefined);
  assert.deepEqual(s, snapshot, 'input state was mutated by doMove');
});

// --- secretPassage ----------------------------------------------------------

test('secret passage leaps to the opposite corner and offers a suggestion', () => {
  const s = fixture(); // pendingRoll null, phase 'move'
  s.pawns = { ...s.pawns, scarlett: { room: 'ra' } };
  const r = applyClueAction({ state: s, action: { type: 'secretPassage', payload: {} }, actorId: 7, geo: miniGeo() });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.state.pawns.scarlett, { room: 'rb' });
  assert.equal(r.state.phase, 'suggest');
  assert.equal(r.state.pendingRoll, null);
});

test('secret passage rejected when not in a passage room', () => {
  const s = fixture(); // scarlett on a corridor square
  assert.match(applyClueAction({ state: s, action: { type: 'secretPassage', payload: {} }, actorId: 7, geo: miniGeo() }).error, /no secret passage/);
});

test('secret passage rejected after rolling', () => {
  const s = { ...fixture(), pendingRoll: 4 };
  s.pawns = { ...s.pawns, scarlett: { room: 'ra' } };
  assert.match(applyClueAction({ state: s, action: { type: 'secretPassage', payload: {} }, actorId: 7, geo: miniGeo() }).error, /after rolling/);
});

test('secret passage rejected in a room without a passage', () => {
  const geoNoPassages = buildGeometry({
    cols: 6, rows: 6,
    rooms: {
      ra: { poly: [[0, 0], [2, 0], [2, 2], [0, 2]] },
      rb: { poly: [[4, 4], [6, 4], [6, 6], [4, 6]] },
    },
    doors: [{ room: 'ra', square: [2, 1] }, { room: 'rb', square: [3, 4] }],
    secretPassages: {},
    cellar: null,
  });
  const s = fixture();
  s.pawns = { ...s.pawns, scarlett: { room: 'ra' } };
  assert.match(applyClueAction({ state: s, action: { type: 'secretPassage', payload: {} }, actorId: 7, geo: geoNoPassages }).error, /no secret passage/);
});
