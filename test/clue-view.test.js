import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cluePublicView } from '../plugins/clue/server/view.js';

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
