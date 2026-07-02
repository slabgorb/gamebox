import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cluePublicView } from '../plugins/clue/server/view.js';
import { buildGeometry } from '../plugins/clue/server/geometry.js';

// Hand-built 3-seat state with an in-flight, already-refuted suggestion.
function fixture() {
  return {
    seats: [7, 8, 9],
    phase: 'accuse-or-pass',
    currentSeat: 0,
    activeUserId: 7,
    envelope: { suspect: 'plum', weapon: 'rope', room: 'study' },
    hands: [['mustard', 'knife'], ['scarlett', 'library'], ['green', 'hall', 'wrench']],
    pawns: { scarlett: { room: 'hall' }, mustard: { room: null }, white: { room: null },
             green: { room: null }, peacock: { room: null }, plum: { room: 'hall' } },
    weapons: { candlestick: 'kitchen', knife: 'hall', leadpipe: 'library',
               revolver: 'lounge', rope: 'ballroom', wrench: 'study' },
    seatSuspect: ['scarlett', 'mustard', 'white'],
    eliminated: [false, false, false],
    ledgers: [[{ fromSeat: 2, card: 'green' }], [], []],
    suggestion: { bySeat: 0, suspect: 'green', weapon: 'knife', room: 'hall',
                  refuterSeat: 2, shownCard: 'green' },
    log: [{ type: 'suggest', bySeat: 0, suspect: 'green', weapon: 'knife', room: 'hall' },
          { type: 'no-refute', seat: 1 },
          { type: 'refute', bySeat: 2, ofSeat: 0 }],
  };
}

test('viewer sees own seat, hand, and ledger', () => {
  const v = cluePublicView({ state: fixture(), viewerId: 7 });
  assert.equal(v.youAreSeat, 0);
  assert.deepEqual(v.hand, ['mustard', 'knife']);
  assert.deepEqual(v.ledger, [{ fromSeat: 2, card: 'green' }]);
});

test('non-participant is a spectator with no hand/ledger', () => {
  const v = cluePublicView({ state: fixture(), viewerId: 999 });
  assert.equal(v.youAreSeat, null);
  assert.deepEqual(v.hand, []);
  assert.deepEqual(v.ledger, []);
});

test('LEAK GUARD: envelope and aggregate hands/ledgers are structurally absent', () => {
  // A substring scan is unsound here: card ids (scarlett, library, ...) also
  // appear as legitimate PUBLIC identifiers in seatSuspect/pawns/weapons. The
  // sound guarantee is structural — the view must expose NO aggregate private
  // container, and each viewer must receive exactly their OWN hand and ledger.
  const src = fixture();
  for (const viewerId of [7, 8, 9, 999]) {
    const v = cluePublicView({ state: fixture(), viewerId });
    assert.equal(v.envelope, undefined, 'no envelope key');
    assert.equal(v.hands, undefined, 'no aggregate hands array');
    assert.equal(v.ledgers, undefined, 'no aggregate ledgers array');
    const seat = v.youAreSeat;
    assert.deepEqual(v.hand, seat === null ? [] : src.hands[seat], 'own hand only');
    assert.deepEqual(v.ledger, seat === null ? [] : src.ledgers[seat], 'own ledger only');
  }
});

test('shownCard is visible ONLY to the suggester', () => {
  assert.equal(cluePublicView({ state: fixture(), viewerId: 7 }).suggestion.shownCard, 'green');
  assert.equal(cluePublicView({ state: fixture(), viewerId: 8 }).suggestion.shownCard, null);
  assert.equal(cluePublicView({ state: fixture(), viewerId: 9 }).suggestion.shownCard, null);
});

test('public board fields are exposed to everyone', () => {
  const v = cluePublicView({ state: fixture(), viewerId: 8 });
  assert.deepEqual(v.weapons, fixture().weapons);
  assert.deepEqual(v.seatSuspect, ['scarlett', 'mustard', 'white']);
  assert.equal(v.log.length, 3);
  assert.equal(v.suggestion.refuterSeat, 2);
});

// The "no in-flight suggestion" branch: the plan's fixture always carries a
// suggestion, so the null path (start of turn / after resolution) is untested.
test('a null suggestion passes through as null for every viewer', () => {
  const s = fixture();
  s.suggestion = null;
  for (const viewerId of [7, 8, 9, 999]) {
    assert.equal(cluePublicView({ state: s, viewerId }).suggestion, null);
  }
});

// --- E6-3: movement surfacing (active seat only) -----------------------------

function moveGeo() {
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

// Seat 0 (userId 7) on turn in phase 'move'.
function moveState(overrides = {}) {
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
    weapons: {}, seatSuspect: ['scarlett', 'mustard'],
    eliminated: [false, false], ledgers: [[], []],
    suggestion: null, pendingRoll: null, log: [],
    ...overrides,
  };
}

test('active seat awaiting a roll sees a needsRoll affordance', () => {
  const s = moveState();
  s.pawns.scarlett = { room: 'ra' }; // in a corner room
  const v = cluePublicView({ state: s, viewerId: 7, geo: moveGeo() });
  assert.equal(v.pendingRoll, null);
  assert.deepEqual(v.movement, { needsRoll: true, secretPassage: 'rb' });
});

test('awaiting-roll affordance has no secret passage from a corridor square', () => {
  const v = cluePublicView({ state: moveState(), viewerId: 7, geo: moveGeo() });
  assert.deepEqual(v.movement, { needsRoll: true, secretPassage: null });
});

test('active seat after rolling sees reachable squares and rooms', () => {
  const v = cluePublicView({ state: moveState({ pendingRoll: 1 }), viewerId: 7, geo: moveGeo() });
  assert.equal(v.movement.needsRoll, false);
  assert.equal(v.movement.pendingRoll, 1);
  assert.equal(new Set(v.movement.squares.map((s) => s.join(','))).has('2,3'), true);
});

test('LEAK GUARD: reachable moves are hidden from the non-active seat', () => {
  const v = cluePublicView({ state: moveState({ pendingRoll: 1 }), viewerId: 8, geo: moveGeo() });
  assert.equal(v.movement, null);
});

test('LEAK GUARD: reachable moves are hidden from spectators', () => {
  const v = cluePublicView({ state: moveState({ pendingRoll: 1 }), viewerId: 999, geo: moveGeo() });
  assert.equal(v.movement, null);
});

// The die value itself is public table knowledge — everyone sees it.
test('pendingRoll is visible to every viewer', () => {
  for (const viewerId of [7, 8, 999]) {
    const v = cluePublicView({ state: moveState({ pendingRoll: 4 }), viewerId, geo: moveGeo() });
    assert.equal(v.pendingRoll, 4, `viewer ${viewerId} sees the public die value`);
  }
});

test('movement is null outside the move phase', () => {
  const v = cluePublicView({ state: moveState({ phase: 'suggest', pendingRoll: null }), viewerId: 7, geo: moveGeo() });
  assert.equal(v.movement, null);
});

test('movement is null for an eliminated seat even if marked active', () => {
  const v = cluePublicView({ state: moveState({ eliminated: [true, false] }), viewerId: 7, geo: moveGeo() });
  assert.equal(v.movement, null);
});
