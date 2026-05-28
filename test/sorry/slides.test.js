import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveLanding } from '../../plugins/sorry/server/rules/slides.js';
import { SLIDES, TRACK_LEN } from '../../plugins/sorry/server/geometry.js';

// --- helpers -------------------------------------------------------------

const startFour = () => Array.from({ length: 4 }, (_, i) => ({ id: i, zone: 'start', index: 0 }));

// Build a `{ a: [...], b: [...] }` pawn map. Every pawn defaults to Start
// (zone 'start', index 0) so nothing is incidentally on the track; tests
// place specific pawns by id via `placements`.
function makePawns(placements = {}) {
  const sides = { a: startFour(), b: startFour() };
  for (const [side, list] of Object.entries(placements)) {
    for (const p of list) sides[side][p.id] = { id: p.id, zone: p.zone, index: p.index };
  }
  return sides;
}

// Slide constants are derived from geometry, never hard-coded (E3-3 guardrail).
const FOREIGN_TO_A = SLIDES.b[0]; // side 'a' is foreign to a 'b'-owned slide
const OWN_OF_A = SLIDES.a[0]; // side 'a' owns this slide
const slideEnd = (s) => (s.start + s.length) % TRACK_LEN;

// A track index that is not the start of any slide (9, 34, 39, 4 are starts).
const NON_SLIDE_INDEX = 20;

// =========================================================================
// AC1 — resolveLanding is exported, returns the right shape, and is pure
// =========================================================================

test('AC1: resolveLanding is a function exported from rules/slides.js', () => {
  assert.equal(typeof resolveLanding, 'function');
});

test('AC1: returns an object with exactly { finalIndex, bumped }', () => {
  const result = resolveLanding({ pawns: makePawns(), side: 'a', landingIndex: NON_SLIDE_INDEX });
  assert.deepEqual(Object.keys(result).sort(), ['bumped', 'finalIndex'], 'exactly two keys');
  assert.ok(Number.isInteger(result.finalIndex), 'finalIndex must be an integer track square');
  assert.ok(Array.isArray(result.bumped), 'bumped must be an array');
});

test('AC1: does not mutate the input pawns (pure function)', () => {
  const pawns = makePawns({
    a: [{ id: 1, zone: 'track', index: FOREIGN_TO_A.start + 1 }],
    b: [{ id: 0, zone: 'track', index: slideEnd(FOREIGN_TO_A) }],
  });
  const before = structuredClone(pawns);
  resolveLanding({ pawns, side: 'a', landingIndex: FOREIGN_TO_A.start });
  assert.deepEqual(pawns, before, 'pawns must be untouched after resolution');
});

// =========================================================================
// AC2 — non-slide landing: finalIndex == landingIndex, occupant bumped
// =========================================================================

test('AC2: a non-slide landing leaves finalIndex === landingIndex', () => {
  const result = resolveLanding({ pawns: makePawns(), side: 'a', landingIndex: NON_SLIDE_INDEX });
  assert.equal(result.finalIndex, NON_SLIDE_INDEX);
  assert.deepEqual(result.bumped, [], 'empty square → nothing bumped');
});

test('AC2: an opponent track pawn on the landing square is bumped', () => {
  const pawns = makePawns({ b: [{ id: 2, zone: 'track', index: NON_SLIDE_INDEX }] });
  const result = resolveLanding({ pawns, side: 'a', landingIndex: NON_SLIDE_INDEX });
  assert.equal(result.finalIndex, NON_SLIDE_INDEX);
  assert.deepEqual(result.bumped, [{ side: 'b', pawnId: 2 }]);
});

test('AC2: a track pawn NOT on the landing square is left alone', () => {
  const pawns = makePawns({ b: [{ id: 0, zone: 'track', index: NON_SLIDE_INDEX + 5 }] });
  const result = resolveLanding({ pawns, side: 'a', landingIndex: NON_SLIDE_INDEX });
  assert.deepEqual(result.bumped, []);
});

// =========================================================================
// AC3 — foreign-color slide triggers, sweeps the path, bumps own + opponent
// =========================================================================

test('AC3: landing on a foreign slide start carries the pawn to (start+length)%60', () => {
  const result = resolveLanding({ pawns: makePawns(), side: 'a', landingIndex: FOREIGN_TO_A.start });
  assert.equal(result.finalIndex, slideEnd(FOREIGN_TO_A), 'finalIndex = (start + length) % TRACK_LEN');
});

test('AC3: every track pawn in the swept path is bumped (own and opponent)', () => {
  const mid = FOREIGN_TO_A.start + 2; // strictly inside the swept range
  const end = slideEnd(FOREIGN_TO_A);
  const pawns = makePawns({
    a: [{ id: 1, zone: 'track', index: mid }], // own pawn caught in the path
    b: [{ id: 3, zone: 'track', index: end }], // opponent on the final square
  });
  const result = resolveLanding({ pawns, side: 'a', landingIndex: FOREIGN_TO_A.start });
  assert.equal(result.finalIndex, end);
  const keys = result.bumped.map((x) => `${x.side}:${x.pawnId}`).sort();
  assert.deepEqual(keys, ['a:1', 'b:3'], 'both own and opponent pawns in the path are bumped');
});

test('AC3: a track pawn past the slide end is not swept', () => {
  const outside = (FOREIGN_TO_A.start + FOREIGN_TO_A.length + 3) % TRACK_LEN;
  const pawns = makePawns({ b: [{ id: 0, zone: 'track', index: outside }] });
  const result = resolveLanding({ pawns, side: 'a', landingIndex: FOREIGN_TO_A.start });
  assert.deepEqual(result.bumped, [], 'pawn beyond the swept range is untouched');
});

test('AC3: multiple pawns across the swept path are all bumped', () => {
  const end = slideEnd(FOREIGN_TO_A);
  const pawns = makePawns({
    a: [
      { id: 0, zone: 'track', index: FOREIGN_TO_A.start + 1 },
      { id: 2, zone: 'track', index: FOREIGN_TO_A.start + 3 },
    ],
    b: [{ id: 1, zone: 'track', index: end }],
  });
  const result = resolveLanding({ pawns, side: 'a', landingIndex: FOREIGN_TO_A.start });
  assert.equal(result.bumped.length, 3, 'all three pawns in the path are bumped');
});

test('AC3: ownership is symmetric — side b sliding on an a-owned slide triggers', () => {
  const result = resolveLanding({ pawns: makePawns(), side: 'b', landingIndex: OWN_OF_A.start });
  assert.equal(result.finalIndex, slideEnd(OWN_OF_A), 'b is foreign to an a-slide → it triggers');
});

// =========================================================================
// AC4 — own-color slide is not triggered (no movement, no sweep)
// =========================================================================

test('AC4: landing on an own-color slide start does not move the pawn', () => {
  const result = resolveLanding({ pawns: makePawns(), side: 'a', landingIndex: OWN_OF_A.start });
  assert.equal(result.finalIndex, OWN_OF_A.start, 'own-color slide: pawn stays at landingIndex');
});

test('AC4: own-color slide does not sweep pawns further along the would-be path', () => {
  const wouldBeSwept = OWN_OF_A.start + 2; // only bumped IF the slide had triggered
  const pawns = makePawns({ b: [{ id: 0, zone: 'track', index: wouldBeSwept }] });
  const result = resolveLanding({ pawns, side: 'a', landingIndex: OWN_OF_A.start });
  assert.equal(result.finalIndex, OWN_OF_A.start);
  assert.deepEqual(result.bumped, [], 'no sweep → a pawn in the would-be path is safe');
});

test('AC4: own-color slide still bumps an occupant on the landing square itself', () => {
  const pawns = makePawns({ b: [{ id: 1, zone: 'track', index: OWN_OF_A.start }] });
  const result = resolveLanding({ pawns, side: 'a', landingIndex: OWN_OF_A.start });
  assert.equal(result.finalIndex, OWN_OF_A.start);
  assert.deepEqual(result.bumped, [{ side: 'b', pawnId: 1 }], 'final-square bump applies without a slide');
});

test('AC4: ownership is symmetric — side b on its own slide does not trigger', () => {
  const result = resolveLanding({ pawns: makePawns(), side: 'b', landingIndex: SLIDES.b[0].start });
  assert.equal(result.finalIndex, SLIDES.b[0].start, 'b on a b-slide → no trigger');
});

// =========================================================================
// AC5 — only zone === 'track' pawns participate; safety/start/home immune
// =========================================================================

test('AC5: a safety-zone pawn on a swept slide square is never bumped', () => {
  const mid = FOREIGN_TO_A.start + 1;
  const pawns = makePawns({ b: [{ id: 0, zone: 'safety', index: mid }] });
  const result = resolveLanding({ pawns, side: 'a', landingIndex: FOREIGN_TO_A.start });
  assert.deepEqual(result.bumped, [], 'safety pawns are off the shared track');
});

test('AC5: start and home pawns are immune even when their index collides', () => {
  const end = slideEnd(FOREIGN_TO_A);
  const pawns = makePawns({
    a: [{ id: 0, zone: 'start', index: end }],
    b: [{ id: 1, zone: 'home', index: end }],
  });
  const result = resolveLanding({ pawns, side: 'a', landingIndex: FOREIGN_TO_A.start });
  assert.deepEqual(result.bumped, [], 'only zone === track pawns participate in bumping');
});

// =========================================================================
// Return contract — every bumped entry is well-formed
// =========================================================================

test('contract: each bumped entry carries a valid side and a pawnId', () => {
  const pawns = makePawns({ b: [{ id: 3, zone: 'track', index: FOREIGN_TO_A.start + 1 }] });
  const { bumped } = resolveLanding({ pawns, side: 'a', landingIndex: FOREIGN_TO_A.start });
  assert.equal(bumped.length, 1);
  for (const entry of bumped) {
    assert.ok(entry.side === 'a' || entry.side === 'b', 'side must be "a" or "b"');
    assert.equal(typeof entry.pawnId, 'number');
  }
});
