// E6-5 Task 6 — pure async-refute pause helpers (AC2). The prompt shows ONLY
// cards the refuter both holds and were suggested; the server re-validates.
// Fixtures are engine-consistent per-viewer views: seats [7,8,9], seat 2
// (userId 9) is the refuter, so the engine sets activeUserId = 9 during the
// pause for EVERY viewer's view.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMyRefute, refuteChoices } from '../src/clients/clue/refute-prompt.js';

const SUGGESTION = {
  bySeat: 0, suspect: 'green', weapon: 'knife', room: 'hall',
  refuterSeat: 2, shownCard: null,
};

// The refuter's own view (userId 9, seat 2). Hand order deliberately does NOT
// match suspect/weapon/room order.
function refuterView(over = {}) {
  return {
    youAreSeat: 2, seats: [7, 8, 9], phase: 'refute', currentSeat: 0,
    activeUserId: 9, hand: ['library', 'knife', 'green'],
    suggestion: { ...SUGGESTION }, ...over,
  };
}

// The suggester's view of the same pause (userId 7, seat 0).
function suggesterView(over = {}) {
  return {
    youAreSeat: 0, seats: [7, 8, 9], phase: 'refute', currentSeat: 0,
    activeUserId: 9, hand: ['mustard', 'kitchen'],
    suggestion: { ...SUGGESTION }, ...over,
  };
}

test('refuteChoices = held cards among the suggested three, in suspect/weapon/room order', () => {
  // Hand lists library first — output must follow s/w/r order, not hand order.
  assert.deepEqual(refuteChoices(refuterView()), ['green', 'knife']);
});

test('refuteChoices excludes held cards that were not suggested', () => {
  // 'library' is held but the suggested room is 'hall'.
  assert.equal(refuteChoices(refuterView()).includes('library'), false);
});

test('refuteChoices includes a matching room card', () => {
  const v = refuterView({ hand: ['hall', 'green'] });
  assert.deepEqual(refuteChoices(v), ['green', 'hall']);
});

test('refuteChoices is empty when the viewer holds none of the three', () => {
  assert.deepEqual(refuteChoices(refuterView({ hand: ['mustard', 'kitchen'] })), []);
});

test('refuteChoices degrades to [] on missing suggestion or malformed hand', () => {
  assert.deepEqual(refuteChoices(refuterView({ suggestion: null })), []);
  assert.deepEqual(refuteChoices(refuterView({ hand: undefined })), []);
  assert.deepEqual(refuteChoices(null), []);
});

test('isMyRefute is true only for the active refuter in the refute phase', () => {
  assert.equal(isMyRefute(refuterView(), 9), true);
  // The suggester is not the refuter — even though it is "their" suggestion.
  assert.equal(isMyRefute(suggesterView(), 7), false);
  // A third seat spectating the pause.
  assert.equal(isMyRefute(suggesterView({ youAreSeat: 1, hand: [] }), 8), false);
});

test('isMyRefute is false outside the refute phase or without a suggestion', () => {
  assert.equal(isMyRefute(refuterView({ phase: 'suggest' }), 9), false);
  assert.equal(isMyRefute(refuterView({ phase: 'accuse-or-pass' }), 9), false);
  assert.equal(isMyRefute(refuterView({ suggestion: null }), 9), false);
  assert.equal(isMyRefute(null, 9), false);
});
