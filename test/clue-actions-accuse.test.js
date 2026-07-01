import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClueAction } from '../plugins/clue/server/actions.js';

function fixture() {
  return {
    seats: [7, 8, 9],
    phase: 'accuse-or-pass',
    currentSeat: 0,
    activeUserId: 7,
    envelope: { suspect: 'plum', weapon: 'rope', room: 'study' },
    hands: [['mustard'], ['green'], ['library']],
    pawns: {}, weapons: {},
    seatSuspect: ['scarlett', 'mustard', 'white'],
    eliminated: [false, false, false],
    ledgers: [[], [], []],
    suggestion: { bySeat: 0, suspect: 'x', weapon: 'y', room: 'z', refuterSeat: null, shownCard: null },
    log: [],
  };
}

test('correct accusation wins and ends the game', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'accuse', payload: { suspect: 'plum', weapon: 'rope', room: 'study' } }, actorId: 7 });
  assert.equal(r.ended, true);
  assert.equal(r.state.phase, 'ended');
  assert.equal(r.state.winnerSeat, 0);
  assert.equal(r.state.endedReason, 'accusation');
  assert.equal(r.state.activeUserId, null);
  assert.deepEqual(r.state.log.at(-1), { type: 'accuse', bySeat: 0, correct: true });
});

test('wrong accusation eliminates the accuser and advances the turn', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'accuse', payload: { suspect: 'plum', weapon: 'rope', room: 'hall' } }, actorId: 7 });
  assert.equal(r.ended, undefined);
  assert.deepEqual(r.state.eliminated, [true, false, false]);
  assert.equal(r.state.currentSeat, 1);
  assert.equal(r.state.phase, 'move');
  assert.equal(r.state.activeUserId, 8);
  assert.equal(r.state.suggestion, null);
  assert.deepEqual(r.state.log.at(-1), { type: 'accuse', bySeat: 0, correct: false });
});

test('wrong accusation that leaves one player standing ends the game', () => {
  const s = fixture();
  s.eliminated = [false, true, false]; // only seats 0 and 2 remain
  const r = applyClueAction({ state: s, action: { type: 'accuse', payload: { suspect: 'green', weapon: 'rope', room: 'study' } }, actorId: 7 });
  assert.equal(r.ended, true);
  assert.equal(r.state.winnerSeat, 2);
  assert.equal(r.state.endedReason, 'last-standing');
});

test('turn advance skips already-eliminated seats', () => {
  const s = fixture();
  s.eliminated = [false, true, false]; // seat1 already out
  s.currentSeat = 2; s.activeUserId = 9;
  // seat2 makes a wrong accusation -> should wrap to seat 0 (skipping eliminated seat1),
  // but seat2 being eliminated leaves seats {0} -> game ends with seat0 winner.
  const r = applyClueAction({ state: s, action: { type: 'accuse', payload: { suspect: 'green', weapon: 'knife', room: 'hall' } }, actorId: 9 });
  assert.equal(r.ended, true);
  assert.equal(r.state.winnerSeat, 0);
});

test('rejects accusation when it is not your turn', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'accuse', payload: { suspect: 'plum', weapon: 'rope', room: 'study' } }, actorId: 9 });
  assert.match(r.error, /not your turn/);
});

// --- Paranoid extras (beyond the plan) ---

// AC: accusation is allowed in phase 'move' OR 'accuse-or-pass'. The plan only
// exercises the accuse-or-pass path; prove a correct accusation straight from
// 'move' also wins.
test('a correct accusation made directly in the move phase wins', () => {
  const s = fixture();
  s.phase = 'move';
  s.suggestion = null;
  const r = applyClueAction({ state: s, action: { type: 'accuse', payload: { suspect: 'plum', weapon: 'rope', room: 'study' } }, actorId: 7 });
  assert.equal(r.ended, true);
  assert.equal(r.state.winnerSeat, 0);
});

// The phase guard: accusing mid-refute (or any other phase) must be rejected.
test('accusation is rejected in a non-accusable phase', () => {
  const s = fixture();
  s.phase = 'refute';
  const r = applyClueAction({ state: s, action: { type: 'accuse', payload: { suspect: 'plum', weapon: 'rope', room: 'study' } }, actorId: 7 });
  assert.match(r.error, /phase/);
});

// Input validation (lang-review #11): a malformed accusation is rejected, not
// silently treated as wrong (which would eliminate the accuser on a typo).
test('accusation validates suspect/weapon/room against the catalog', () => {
  assert.match(applyClueAction({ state: fixture(), action: { type: 'accuse', payload: { suspect: 'nobody', weapon: 'rope', room: 'study' } }, actorId: 7 }).error, /invalid suspect/);
  assert.match(applyClueAction({ state: fixture(), action: { type: 'accuse', payload: { suspect: 'plum', weapon: 'spork', room: 'study' } }, actorId: 7 }).error, /invalid weapon/);
  assert.match(applyClueAction({ state: fixture(), action: { type: 'accuse', payload: { suspect: 'plum', weapon: 'rope', room: 'attic' } }, actorId: 7 }).error, /invalid room/);
});

// A genuine skip: in a 4-seat game a wrong accusation that leaves >1 player must
// advance PAST an already-eliminated seat, not merely wrap by one. (The plan's
// "skips eliminated" case actually ends the game and never exercises nextSeat.)
test('wrong accusation in a 4-seat game advances past an eliminated seat', () => {
  const s = {
    seats: [7, 8, 9, 10],
    phase: 'accuse-or-pass',
    currentSeat: 0,
    activeUserId: 7,
    envelope: { suspect: 'plum', weapon: 'rope', room: 'study' },
    hands: [['mustard'], ['green'], ['library'], ['candlestick']],
    pawns: {}, weapons: {},
    seatSuspect: ['scarlett', 'mustard', 'white', 'green'],
    eliminated: [false, true, false, false], // seat1 already out
    ledgers: [[], [], [], []],
    suggestion: null,
    log: [],
  };
  const r = applyClueAction({ state: s, action: { type: 'accuse', payload: { suspect: 'green', weapon: 'knife', room: 'hall' } }, actorId: 7 });
  assert.equal(r.ended, undefined);          // seats 2 and 3 still live -> game continues
  assert.deepEqual(r.state.eliminated, [true, true, false, false]);
  assert.equal(r.state.currentSeat, 2);      // skipped eliminated seat 1
  assert.equal(r.state.activeUserId, 9);
});

// AC: the eliminated accuser "keeps refuting". A wrong accusation eliminates the
// seat but must NOT discard its hand, so it can still disprove later suggestions.
test('an eliminated accuser keeps its cards for future refutes', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'accuse', payload: { suspect: 'plum', weapon: 'rope', room: 'hall' } }, actorId: 7 });
  assert.deepEqual(r.state.hands[0], ['mustard']); // hand preserved despite elimination
  assert.equal(r.state.eliminated[0], true);
});
