import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUSPECTS, WEAPONS, ROOMS, ALL_CARDS, categoryOf, dealCards,
} from '../plugins/clue/server/cards.js';

// Deterministic rng: fixed sequence so the deal is reproducible.
function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

test('catalog has canonical 6/6/9 = 21 distinct cards', () => {
  assert.equal(SUSPECTS.length, 6);
  assert.equal(WEAPONS.length, 6);
  assert.equal(ROOMS.length, 9);
  assert.equal(ALL_CARDS.length, 21);
  assert.equal(new Set(ALL_CARDS).size, 21);
});

test('categoryOf classifies each card and rejects unknowns', () => {
  assert.equal(categoryOf('scarlett'), 'suspect');
  assert.equal(categoryOf('rope'), 'weapon');
  assert.equal(categoryOf('library'), 'room');
  assert.equal(categoryOf('nope'), null);
});

test('dealCards: envelope is one-per-category, 18 dealt, disjoint, no duplicates', () => {
  for (const n of [3, 4]) {
    const { envelope, hands } = dealCards(seededRng(n), n);
    assert.ok(SUSPECTS.includes(envelope.suspect));
    assert.ok(WEAPONS.includes(envelope.weapon));
    assert.ok(ROOMS.includes(envelope.room));
    assert.equal(hands.length, n);
    const dealt = hands.flat();
    assert.equal(dealt.length, 18, `n=${n} deals all 18`);
    assert.equal(new Set(dealt).size, 18, 'no duplicate dealt cards');
    // Envelope cards are never dealt.
    for (const c of [envelope.suspect, envelope.weapon, envelope.room]) {
      assert.ok(!dealt.includes(c), `envelope card ${c} not dealt`);
    }
    // Dealt ∪ envelope == full catalog.
    const union = new Set([...dealt, envelope.suspect, envelope.weapon, envelope.room]);
    assert.equal(union.size, 21);
    // Round-robin fairness: hand sizes differ by at most 1.
    const sizes = hands.map(h => h.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  }
});

// AC: "Deterministic with seeded RNG (reproducible deals)." The plan's example
// tests never assert this — a non-seeded/global-RNG deal would still pass them.
test('dealCards is deterministic: the same seed reproduces the same deal', () => {
  for (const n of [3, 4]) {
    const a = dealCards(seededRng(42), n);
    const b = dealCards(seededRng(42), n);
    assert.deepEqual(a, b, `n=${n}: identical seed must reproduce identical deal`);
  }
});

// Constraint: shuffle() mutates in place, so the deal MUST pass .slice() copies.
// A missing copy would corrupt the module-level catalog for every later deal.
test('dealCards does not mutate the exported catalog arrays', () => {
  const suspectsBefore = [...SUSPECTS];
  const weaponsBefore = [...WEAPONS];
  const roomsBefore = [...ROOMS];
  const allBefore = [...ALL_CARDS];
  // Several deals with different seats/seeds — any in-place shuffle would show.
  dealCards(seededRng(1), 3);
  dealCards(seededRng(2), 4);
  dealCards(seededRng(3), 3);
  assert.deepEqual(SUSPECTS, suspectsBefore, 'SUSPECTS unchanged');
  assert.deepEqual(WEAPONS, weaponsBefore, 'WEAPONS unchanged');
  assert.deepEqual(ROOMS, roomsBefore, 'ROOMS unchanged');
  assert.deepEqual(ALL_CARDS, allBefore, 'ALL_CARDS unchanged');
});
