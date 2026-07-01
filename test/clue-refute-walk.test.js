import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRefuterWalk } from '../plugins/clue/server/refute.js';

const base = (hands) => ({ seats: [10, 11, 12, 13], hands, eliminated: [false, false, false, false] });
const named = { suspect: 'green', weapon: 'knife', room: 'hall' };

test('first left seat that holds a named card is the refuter', () => {
  // suggester=0. seat1 holds none, seat2 holds 'knife'.
  const s = base([['plum'], ['rope', 'study'], ['knife', 'library'], ['green']]);
  const r = findRefuterWalk(s, 0, named);
  assert.deepEqual(r.passes, [1]);
  assert.equal(r.refuterSeat, 2);
});

test('walk wraps around past the highest seat', () => {
  // suggester=2. Walk order: 3, 0, 1. seat3/seat0 hold none, seat1 holds 'hall'.
  const s = base([['plum'], ['hall'], ['rope'], ['study']]);
  const r = findRefuterWalk(s, 2, named);
  assert.deepEqual(r.passes, [3, 0]);
  assert.equal(r.refuterSeat, 1);
});

test('nobody can disprove: all others pass, refuterSeat null', () => {
  // Only the suggester (seat0) holds any named card.
  const s = base([['green', 'knife', 'hall'], ['plum'], ['rope'], ['study']]);
  const r = findRefuterWalk(s, 0, named);
  assert.deepEqual(r.passes, [1, 2, 3]);
  assert.equal(r.refuterSeat, null);
});

test('eliminated players still refute', () => {
  const s = base([['plum'], ['green'], ['rope'], ['study']]);
  s.eliminated = [false, true, false, false]; // seat1 out but still holds 'green'
  const r = findRefuterWalk(s, 0, named);
  assert.equal(r.refuterSeat, 1);
  assert.deepEqual(r.passes, []);
});

// --- Paranoid extras (beyond the plan) ---

// The plan only exercises 4-seat walks. Verify the wrap arithmetic in a 3-seat
// game so an off-by-one in `% n` cannot hide behind the 4-seat cases.
test('3-seat walk order is correct (suggester in the middle)', () => {
  const s = { seats: [10, 11, 12], hands: [['plum'], ['study'], ['knife']], eliminated: [false, false, false] };
  // suggester=1. Walk order: 2, 0. seat2 holds 'knife' -> refuter immediately.
  const r = findRefuterWalk(s, 1, named);
  assert.equal(r.refuterSeat, 2);
  assert.deepEqual(r.passes, []);
});

// A refuter holding MORE THAN ONE named card is still just the first holder;
// the walk must stop at that seat and not keep collecting passes past it.
test('a seat holding multiple named cards is still a single refuter and stops the walk', () => {
  const s = base([['plum'], ['green', 'knife', 'hall'], ['rope'], ['study']]);
  const r = findRefuterWalk(s, 0, named);
  assert.equal(r.refuterSeat, 1);
  assert.deepEqual(r.passes, []);
});
