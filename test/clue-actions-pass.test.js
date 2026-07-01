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
    suggestion: { bySeat: 0, suspect: 'x', weapon: 'y', room: 'z', refuterSeat: 2, shownCard: 'green' },
    log: [],
  };
}

test('pass advances to the next seat and resets to move phase', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'pass', payload: {} }, actorId: 7 });
  assert.equal(r.error, undefined);
  assert.equal(r.state.currentSeat, 1);
  assert.equal(r.state.phase, 'move');
  assert.equal(r.state.activeUserId, 8);
  assert.equal(r.state.suggestion, null);
});

test('pass from the last seat wraps to seat 0', () => {
  const s = fixture();
  s.currentSeat = 2; s.activeUserId = 9;
  const r = applyClueAction({ state: s, action: { type: 'pass', payload: {} }, actorId: 9 });
  assert.equal(r.state.currentSeat, 0);
  assert.equal(r.state.activeUserId, 7);
});

test('pass skips eliminated seats', () => {
  const s = fixture();
  s.eliminated = [false, true, false];
  const r = applyClueAction({ state: s, action: { type: 'pass', payload: {} }, actorId: 7 });
  assert.equal(r.state.currentSeat, 2); // skips eliminated seat 1
});

test('pass in the move phase is allowed (declined to move)', () => {
  const s = fixture();
  s.phase = 'move'; s.suggestion = null;
  const r = applyClueAction({ state: s, action: { type: 'pass', payload: {} }, actorId: 7 });
  assert.equal(r.state.currentSeat, 1);
  assert.equal(r.state.phase, 'move');
});

test('pass rejected when it is not your turn', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'pass', payload: {} }, actorId: 8 });
  assert.match(r.error, /not your turn/);
});

// --- Paranoid extras (beyond the plan) ---

// pass is only legal in 'move' or 'accuse-or-pass'. During 'refute' the game is
// waiting on the refuter, so the suggester (still the current seat) cannot pass
// the turn along. Use the current seat so the PHASE guard is what rejects, not
// the turn guard.
test('pass is rejected in the refute phase', () => {
  const s = fixture();
  s.phase = 'refute'; // currentSeat is still 0 (the suggester)
  const r = applyClueAction({ state: s, action: { type: 'pass', payload: {} }, actorId: 7 });
  assert.match(r.error, /phase/);
});

// Reducer purity: pass must not mutate the caller's state.
test('pass does not mutate the input state', () => {
  const s = fixture();
  applyClueAction({ state: s, action: { type: 'pass', payload: {} }, actorId: 7 });
  assert.equal(s.currentSeat, 0);        // original untouched
  assert.equal(s.phase, 'accuse-or-pass');
  assert.notEqual(s.suggestion, null);   // original suggestion still present
});
