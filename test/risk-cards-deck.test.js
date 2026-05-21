import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialState } from '../plugins/risk/server/state.js';
import { allTerritories } from '../plugins/risk/server/map.js';

// Mulberry32 — deterministic PRNG (same generator the full-game test uses).
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PARTICIPANTS = [{ userId: 11, side: 'a' }, { userId: 22, side: 'b' }];

// AC1: 44-card deck = 42 territory cards (one per map territory, types
// round-robin Infantry/Cavalry/Artillery) + 2 wild cards.
test('initial state builds a 44-card deck with empty hands', () => {
  const s = buildInitialState({ participants: PARTICIPANTS, rng: rngFrom(1) });
  assert.ok(Array.isArray(s.deck), 'state.deck should be an array');
  assert.equal(s.deck.length, 44, 'deck is 42 territory cards + 2 wilds');
  assert.ok(Array.isArray(s.hands), 'state.hands should be an array');
  assert.equal(s.hands.length, 2, 'one hand per player');
  assert.deepEqual(s.hands, [[], []], 'hands start empty — Risk deals no cards at setup');
  assert.equal(s.tradeInCount, 0, 'no trades have happened yet');
});

test('deck has exactly one territory card per territory, plus two wilds', () => {
  const s = buildInitialState({ participants: PARTICIPANTS, rng: rngFrom(2) });
  const wilds = s.deck.filter(c => c.type === 'wild');
  const territoryCards = s.deck.filter(c => c.type !== 'wild');
  assert.equal(wilds.length, 2, 'exactly two wild cards');
  assert.equal(territoryCards.length, 42, 'exactly 42 territory cards');

  const onCards = territoryCards.map(c => c.territory).sort();
  const expected = allTerritories().slice().sort();
  assert.deepEqual(onCards, expected, 'one card per map territory, no dupes, no strays');

  const types = new Set(territoryCards.map(c => c.type));
  assert.deepEqual([...types].sort(), ['artillery', 'cavalry', 'infantry'],
    'territory cards use the three canonical troop types');
});

test('wild cards carry no territory', () => {
  const s = buildInitialState({ participants: PARTICIPANTS, rng: rngFrom(3) });
  const wilds = s.deck.filter(c => c.type === 'wild');
  assert.equal(wilds.length, 2);
  for (const w of wilds) {
    assert.equal(w.territory, null, 'wild cards have territory === null');
  }
});

// AC1: deterministic shuffle — same seed yields the same deck order.
test('same rng seed yields an identical deck order (deterministic shuffle)', () => {
  const a = buildInitialState({ participants: PARTICIPANTS, rng: rngFrom(42) });
  const b = buildInitialState({ participants: PARTICIPANTS, rng: rngFrom(42) });
  // Guard against a vacuous pass: two undefined decks are trivially "equal".
  assert.ok(Array.isArray(a.deck) && a.deck.length === 44, 'deck must exist to compare');
  assert.deepEqual(a.deck, b.deck, 'identical seed must reproduce identical deck order');
});
