import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDeck, draw, RANK_COUNTS } from '../../plugins/sorry/server/deck.js';

test('RANK_COUNTS is the canonical Sorry! distribution (no 6 or 9)', () => {
  assert.deepEqual(RANK_COUNTS, {
    1: 5, 2: 4, 3: 4, 4: 4, 5: 4, 7: 4, 8: 4, 10: 4, 11: 4, 12: 4, sorry: 4,
  });
  // Standard Sorry! omits ranks 6 and 9.
  assert.equal(RANK_COUNTS[6], undefined);
  assert.equal(RANK_COUNTS[9], undefined);
});

test('buildDeck produces exactly 45 cards matching RANK_COUNTS', () => {
  const deck = buildDeck(() => 0.5);
  assert.equal(deck.length, 45);
  const counts = {};
  for (const c of deck) counts[c] = (counts[c] ?? 0) + 1;
  assert.deepEqual(counts, RANK_COUNTS);
});

test('buildDeck shuffles deterministically given an injected rng', () => {
  // Same rng sequence ⇒ identical deck (pure, no hidden Math.random).
  // Each rng needs its own counter so the second build replays from the start.
  const seq = [0.1, 0.9, 0.3, 0.7, 0.2];
  const makeRng = () => {
    let i = 0;
    return () => seq[i++ % seq.length];
  };
  assert.deepEqual(buildDeck(makeRng()), buildDeck(makeRng()));
});

test('draw returns the top card and shrinks the deck without touching discard', () => {
  const { card, deck, discard } = draw({ deck: [1, 2], discard: [3], rng: () => 0 });
  assert.equal(card, 1);
  assert.deepEqual(deck, [2]);
  assert.deepEqual(discard, [3]);
});

test('draw reshuffles the discard into a fresh deck when the deck is empty', () => {
  // rng = () => 0 makes the reshuffle deterministic: shuffle([5,7]) -> [7,5],
  // so the drawn card and remaining deck are exact, not merely "one of".
  const inDiscard = [5, 7];
  const { card, deck, discard } = draw({ deck: [], discard: inDiscard, rng: () => 0 });
  assert.equal(card, 7, 'exact reshuffled draw');
  assert.deepEqual(deck, [5], 'remaining reshuffled card');
  assert.deepEqual(discard, [], 'discard is emptied after reshuffle');
  // The reshuffle branch passes the discard to the (in-place mutating) shared
  // shuffle via a .slice() copy — assert that load-bearing copy holds and the
  // caller's input array is untouched.
  assert.deepEqual(inDiscard, [5, 7], 'reshuffle must not mutate the input discard');
});

test('draw does not mutate the input deck or discard arrays', () => {
  const inDeck = [1, 2];
  const inDiscard = [3];
  draw({ deck: inDeck, discard: inDiscard, rng: () => 0 });
  assert.deepEqual(inDeck, [1, 2], 'input deck must not be mutated (pure function)');
  assert.deepEqual(inDiscard, [3], 'input discard must not be mutated (pure function)');
});

test('draw throws when both deck and discard are empty', () => {
  assert.throws(() => draw({ deck: [], discard: [], rng: () => 0 }), /no cards/i);
});
