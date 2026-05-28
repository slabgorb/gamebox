import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialState } from '../../plugins/sorry/server/state.js';
import { applySorryAction } from '../../plugins/sorry/server/actions.js';
import { legalMoves } from '../../plugins/sorry/server/rules/legal-moves.js';

const participants = [{ side: 'a', userId: 11 }, { side: 'b', userId: 22 }];

// A tiny deterministic PRNG so the shuffle (and thus the opening card) is
// reproducible across runs without leaning on Math.random.
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('the opening never deadlocks: side a can always either move or legally pass', () => {
  // No silent settling. The opening card may be unplayable (every pawn in Start,
  // only a 1/2 leaves Start), in which case a pass must be legal and advance the
  // turn — instead of the engine silently burning cards.
  for (let seed = 1; seed <= 100; seed++) {
    const s = buildInitialState({ participants, rng: mulberry32(seed) });
    assert.equal(s.currentPlayer, 'a', `seed ${seed}: the opening is always side a's turn`);
    const moves = legalMoves(s);
    if (moves.length === 0) {
      const r = applySorryAction({ state: s, action: { type: 'pass' }, actorId: 11 });
      assert.equal(r.error, undefined, `seed ${seed}: pass rejected on a no-move opening`);
      assert.equal(r.state.currentPlayer, 'b', `seed ${seed}: a no-move opening passes to b`);
    }
  }
});

test('initial state places 4 pawns per side in Start and draws the first card', () => {
  // The opening is always side a's turn now (no auto-settle); rng: () => 0 deals a 1.
  const s = buildInitialState({ participants, rng: () => 0 });
  assert.deepEqual(s.sides, { a: 11, b: 22 });
  assert.equal(s.pawns.a.length, 4);
  assert.equal(s.pawns.b.length, 4);
  assert.ok(s.pawns.a.every((p) => p.zone === 'start'), 'all of a in start');
  assert.ok(s.pawns.b.every((p) => p.zone === 'start'), 'all of b in start');
  assert.equal(s.currentPlayer, 'a');
  assert.notEqual(s.drawnCard, undefined);
  assert.notEqual(s.drawnCard, null);
  // The drawn card accounts for the 45th card.
  assert.equal(s.deck.length + s.discard.length + 1, 45);
  assert.equal(s.winner, null);
  assert.equal(s.lastEvent, null);
  assert.equal(s.activeUserId, 11);
});

test('initial pawns are uniquely identified within a side', () => {
  const s = buildInitialState({ participants });
  const aIds = s.pawns.a.map((p) => p.id);
  assert.equal(new Set(aIds).size, 4, 'pawn ids are distinct within side a');
});

test('top-level rng (the engine call convention) makes the first draw deterministic', () => {
  // The host engine calls initialState({ participants, rng, variant }) — rng is
  // passed at the top level, matching cribbage/buraco/words. Exercise that interface.
  const s1 = buildInitialState({ participants, rng: () => 0 });
  const s2 = buildInitialState({ participants, rng: () => 0 });
  assert.equal(s1.drawnCard, s2.drawnCard);
  assert.deepEqual(s1.deck, s2.deck);
});

test('buildInitialState rejects the wrong number of participants', () => {
  assert.throws(() => buildInitialState({ participants: [{ side: 'a', userId: 11 }] }), /2 participants/i);
  assert.throws(
    () => buildInitialState({ participants: [...participants, { side: 'a', userId: 33 }] }),
    /2 participants/i,
  );
  assert.throws(() => buildInitialState({ participants: undefined }), /2 participants/i);
});

test("buildInitialState rejects a missing side 'a' or 'b'", () => {
  assert.throws(
    () => buildInitialState({ participants: [{ side: 'a', userId: 11 }, { side: 'a', userId: 22 }] }),
    /side/i,
  );
});

test('buildInitialState rejects a participant missing userId (side a)', () => {
  assert.throws(
    () => buildInitialState({ participants: [{ side: 'a' }, { side: 'b', userId: 22 }] }),
    /userId/i,
  );
});

test('buildInitialState rejects a participant missing userId (side b)', () => {
  // Symmetric case — guards against the `||` being mistyped as `&&`.
  assert.throws(
    () => buildInitialState({ participants: [{ side: 'a', userId: 11 }, { side: 'b' }] }),
    /userId/i,
  );
});

test('buildInitialState rejects two participants sharing the same userId', () => {
  assert.throws(
    () => buildInitialState({ participants: [{ side: 'a', userId: 7 }, { side: 'b', userId: 7 }] }),
    /distinct/i,
  );
});
