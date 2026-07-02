import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../plugins/clue/server/geometry.js';
import { legalMoves, secretPassageDest, occupiedSquares } from '../plugins/clue/server/rules/movement.js';

// Synthetic 6x6 board: room ra (cols 0-1, rows 0-1) with door threshold [2,1];
// room rb (cols 4-5, rows 4-5) with door threshold [3,4]; secret passage ra<->rb.
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

// Minimal state: legalMoves reads only pendingRoll, seatSuspect, pawns.
function st(pawns, pendingRoll) {
  return { pendingRoll, seatSuspect: ['scarlett', 'mustard'], pawns };
}
const asSet = (squares) => new Set(squares.map(([c, r]) => `${c},${r}`));

test('die=1: reachable = orthogonal corridor neighbours only (no diagonal)', () => {
  const s = st({ scarlett: { square: [2, 2] }, mustard: { room: 'rb' } }, 1);
  const { squares, rooms } = legalMoves(s, miniGeo(), 0);
  assert.deepEqual(asSet(squares), asSet([[2, 1], [2, 3], [3, 2], [1, 2]]));
  assert.ok(!asSet(squares).has('3,3')); // diagonal excluded
  assert.deepEqual(rooms, []);           // room entry would be 2 steps > die
});

test('exact-count: die=2 does not include the start square, and reaches ra', () => {
  const s = st({ scarlett: { square: [2, 2] }, mustard: { room: 'rb' } }, 2);
  const { squares, rooms } = legalMoves(s, miniGeo(), 0);
  assert.ok(!asSet(squares).has('2,2'));  // may not stay put
  assert.ok(rooms.includes('ra'));        // reach door [2,1] in 1, enter in 2
});

// Corridor destinations must consume ALL pips: a square at Manhattan distance 1
// is unreachable by any self-avoiding orthogonal walk of exactly 2 steps.
test('exact-count: die=2 excludes distance-1 corridor squares (all pips spent)', () => {
  const s = st({ scarlett: { square: [2, 2] }, mustard: { room: 'rb' } }, 2);
  const { squares } = legalMoves(s, miniGeo(), 0);
  assert.ok(!asSet(squares).has('2,3'), 'distance-1 square reachable only with 1 pip left over');
  assert.ok(asSet(squares).has('2,4'), 'distance-2 square is a valid exact-count destination');
});

test('room entry ignores excess pips (die > distance to door)', () => {
  const s = st({ scarlett: { square: [2, 1] }, mustard: { room: 'rb' } }, 5);
  const { rooms } = legalMoves(s, miniGeo(), 0);
  assert.ok(rooms.includes('ra')); // enter in 1 step though die=5
});

test('no re-enter the same room in one turn', () => {
  const s = st({ scarlett: { room: 'ra' }, mustard: { room: 'rb' } }, 6);
  const { rooms } = legalMoves(s, miniGeo(), 0);
  assert.ok(!rooms.includes('ra'), 'cannot re-enter start room');
  assert.ok(rooms.includes('rb'), 'can reach the other room within 6 steps');
});

test('blocking: cannot pass through or land on an occupied square', () => {
  const s = st({ scarlett: { square: [2, 2] }, mustard: { square: [2, 3] } }, 2);
  const { squares } = legalMoves(s, miniGeo(), 0);
  assert.ok(!asSet(squares).has('2,3'), 'occupied square excluded');
  assert.ok(!asSet(squares).has('2,4'), 'cannot pass through [2,3] to reach [2,4]');
});

// "A blocked doorway (threshold square occupied) cannot be used" — exit side.
// ra has exactly one door; with an opponent parked on it the room is sealed.
test('blocked doorway: pawn cannot leave a room whose only threshold is occupied', () => {
  const s = st({ scarlett: { room: 'ra' }, mustard: { square: [2, 1] } }, 6);
  assert.deepEqual(legalMoves(s, miniGeo(), 0), { squares: [], rooms: [] });
});

// Blocked doorway — entry side: rb's only threshold is occupied, so rb is
// unenterable even with a huge die, while ra stays reachable.
test('blocked doorway: room with occupied threshold cannot be entered', () => {
  const s = st({ scarlett: { square: [2, 4] }, mustard: { square: [3, 4] } }, 6);
  const { rooms } = legalMoves(s, miniGeo(), 0);
  assert.ok(!rooms.includes('rb'), 'rb sealed behind its occupied threshold');
  assert.ok(rooms.includes('ra'), 'ra still enterable (door 4 steps away, die 6)');
});

test('occupiedSquares ignores the mover and room-bound pawns', () => {
  const s = st({ scarlett: { square: [2, 2] }, mustard: { room: 'rb' } }, 1);
  const occ = occupiedSquares(s, 'scarlett');
  assert.equal(occ.size, 0); // mustard is in a room, scarlett is excluded
});

test('occupiedSquares reports corridor pawns other than the mover', () => {
  const s = st({ scarlett: { square: [2, 2] }, mustard: { square: [2, 3] } }, 1);
  const occ = occupiedSquares(s, 'scarlett');
  assert.deepEqual([...occ], ['2,3']);
});

test('pendingRoll falsy -> no moves', () => {
  const s = st({ scarlett: { square: [2, 2] }, mustard: { room: 'rb' } }, null);
  assert.deepEqual(legalMoves(s, miniGeo(), 0), { squares: [], rooms: [] });
});

test('secretPassageDest returns the opposite corner or null', () => {
  assert.equal(secretPassageDest(miniGeo(), 'ra'), 'rb');
  assert.equal(secretPassageDest(miniGeo(), 'rb'), 'ra');
  assert.equal(secretPassageDest(miniGeo(), 'nowhere'), null);
});

// Plain-object lookup hazard: obj['__proto__'] returns Object.prototype (truthy
// garbage), not undefined. The lookup must be own-property-safe.
test('secretPassageDest is not fooled by prototype-chain keys', () => {
  assert.equal(secretPassageDest(miniGeo(), '__proto__'), null);
  assert.equal(secretPassageDest(miniGeo(), 'constructor'), null);
});

// E6-4 Task 7 (E6-3 Reviewer finding): legalMoves trusted pendingRoll
// unconditionally. shortlist.js is the first NON-REDUCER caller (doRoll's
// 1-6 validation no longer guards it), so the die is clamped at the walk
// boundary. Note: the plan suggested pendingRoll:100, but an unclamped
// self-avoiding walk of depth 100 explodes combinatorially and would HANG
// the red suite — 7 proves the same clamp and fails fast instead.
test('die clamp: an over-range roll behaves exactly like 6', () => {
  const at = (roll) => legalMoves(st({ scarlett: { square: [2, 2] }, mustard: { room: 'rb' } }, roll), miniGeo(), 0);
  const seven = at(7);
  const six = at(6);
  assert.deepEqual(asSet(seven.squares), asSet(six.squares));
  assert.deepEqual([...seven.rooms].sort(), [...six.rooms].sort());
});

test('die clamp: a fractional roll floors to the integer walk depth', () => {
  const at = (roll) => legalMoves(st({ scarlett: { square: [2, 2] }, mustard: { room: 'rb' } }, roll), miniGeo(), 0);
  const frac = at(3.9);
  const three = at(3);
  assert.deepEqual(asSet(frac.squares), asSet(three.squares));
  assert.deepEqual([...frac.rooms].sort(), [...three.rooms].sort());
});

test('die clamp: sub-1 and negative rolls yield no moves', () => {
  const at = (roll) => legalMoves(st({ scarlett: { square: [2, 2] }, mustard: { room: 'rb' } }, roll), miniGeo(), 0);
  assert.deepEqual(at(-5), { squares: [], rooms: [] });
  assert.deepEqual(at(0.5), { squares: [], rooms: [] });
});
