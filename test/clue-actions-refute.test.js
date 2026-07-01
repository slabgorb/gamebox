import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClueAction } from '../plugins/clue/server/actions.js';

// seat 0 suggested green/knife/hall; seat 2 (userId 9) is the refuter and holds both green and knife.
function fixture() {
  return {
    seats: [7, 8, 9],
    phase: 'refute',
    currentSeat: 0,
    activeUserId: 9,
    envelope: { suspect: 'plum', weapon: 'rope', room: 'study' },
    hands: [['mustard'], ['library'], ['green', 'knife']],
    pawns: {}, weapons: {},
    seatSuspect: ['scarlett', 'mustard', 'white'],
    eliminated: [false, false, false],
    ledgers: [[], [], []],
    suggestion: { bySeat: 0, suspect: 'green', weapon: 'knife', room: 'hall', refuterSeat: 2, shownCard: null },
    log: [],
  };
}

test('refuter shows a valid card: recorded to suggester ledger only', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'refute', payload: { card: 'green' } }, actorId: 9 });
  assert.equal(r.error, undefined);
  assert.equal(r.state.suggestion.shownCard, 'green');
  assert.deepEqual(r.state.ledgers[0], [{ fromSeat: 2, card: 'green' }]);
  assert.deepEqual(r.state.ledgers[1], []);
  assert.deepEqual(r.state.log.at(-1), { type: 'refute', bySeat: 2, ofSeat: 0 });
  assert.equal(r.state.phase, 'accuse-or-pass');
  assert.equal(r.state.activeUserId, 7);
});

test('refuter may choose which matching card to show', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'refute', payload: { card: 'knife' } }, actorId: 9 });
  assert.equal(r.state.suggestion.shownCard, 'knife');
});

test('rejects a card not among the suggested three', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'refute', payload: { card: 'library' } }, actorId: 9 });
  assert.match(r.error, /not one of the suggested/);
});

test('rejects a card the refuter does not hold', () => {
  const s = fixture();
  s.suggestion = { bySeat: 0, suspect: 'green', weapon: 'wrench', room: 'hall', refuterSeat: 2, shownCard: null };
  // seat2 holds green but not wrench; showing wrench is illegal.
  const r = applyClueAction({ state: s, action: { type: 'refute', payload: { card: 'wrench' } }, actorId: 9 });
  assert.match(r.error, /do not hold/);
});

test('rejects a refute from someone who is not the refuter', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'refute', payload: { card: 'green' } }, actorId: 8 });
  assert.match(r.error, /not your card/);
});

// --- Paranoid extras (beyond the plan) ---

// A refute is only meaningful while a suggestion is pending in the 'refute'
// phase. Outside that window it must be rejected, not silently applied.
test('refute is rejected when there is no pending suggestion to refute', () => {
  const s = fixture();
  s.phase = 'accuse-or-pass';
  s.suggestion = null;
  const r = applyClueAction({ state: s, action: { type: 'refute', payload: { card: 'green' } }, actorId: 9 });
  assert.match(r.error, /no suggestion/);
});

// Private-ledger integrity is the whole point of refute: only the suggester
// learns the card. Confirm the input state is not mutated in place either.
test('refute does not mutate the caller state or leak into other ledgers', () => {
  const s = fixture();
  applyClueAction({ state: s, action: { type: 'refute', payload: { card: 'green' } }, actorId: 9 });
  assert.equal(s.suggestion.shownCard, null); // original untouched
  assert.deepEqual(s.ledgers[0], []);         // original ledger untouched
});
