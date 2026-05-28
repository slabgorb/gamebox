import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialState } from '../../plugins/sorry/server/state.js';

const participants = [{ side: 'a', userId: 11 }, { side: 'b', userId: 22 }];

test('initial state places 4 pawns per side in Start and draws the first card', () => {
  const s = buildInitialState({ participants });
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

test('injected rng makes the first draw deterministic', () => {
  const s1 = buildInitialState({ participants, options: { rng: () => 0 } });
  const s2 = buildInitialState({ participants, options: { rng: () => 0 } });
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

test('buildInitialState rejects a participant missing userId', () => {
  assert.throws(
    () => buildInitialState({ participants: [{ side: 'a' }, { side: 'b', userId: 22 }] }),
    /userId/i,
  );
});

test('buildInitialState rejects two participants sharing the same userId', () => {
  assert.throws(
    () => buildInitialState({ participants: [{ side: 'a', userId: 7 }, { side: 'b', userId: 7 }] }),
    /distinct/i,
  );
});
