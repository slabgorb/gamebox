// E6-4 Task 1 — deterministic knowledge-matrix tracker.
//
// The tracker's contract (AC #1): seed from the bot's OWN hand, OWN ledger,
// and the PUBLIC log only; propagate to fixpoint; never mark a false
// certainty. It must never read state.envelope or another seat's
// hands/ledgers — the poison tests prove that behaviorally.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTracker } from '../plugins/clue/server/ai/knowledge.js';
import {
  baseState, determinedDeal, fullLedger0, poison, SOLUTION,
} from './_helpers/clue-fixtures.js';

function determinedState() {
  return baseState({ ledgers: [fullLedger0(), [], []] });
}

test('solves a fully-determined envelope by elimination', () => {
  const t = buildTracker({ state: determinedState(), seat: 0 });
  assert.deepEqual(t.envelopeSolution(), SOLUTION);
  assert.equal(t.isEnvelope('scarlett'), true);
  assert.equal(t.isEnvelope('rope'), true);
  assert.equal(t.isEnvelope('study'), true);
});

test('own hand pins holderOf to the own seat, never the envelope', () => {
  const t = buildTracker({ state: baseState(), seat: 0 });
  for (const card of determinedDeal().hands[0]) {
    assert.equal(t.holderOf(card), 0, `own card ${card} located at own seat`);
    assert.equal(t.isEnvelope(card), false);
  }
});

test('own ledger entry pins the shower, not the envelope', () => {
  const s = baseState({ ledgers: [[{ fromSeat: 1, card: 'candlestick' }], [], []] });
  const t = buildTracker({ state: s, seat: 0 });
  assert.equal(t.holderOf('candlestick'), 1);
  assert.equal(t.isEnvelope('candlestick'), false);
});

test('never marks a false certainty: partial info yields nulls, not guesses', () => {
  const s = determinedState();
  s.ledgers[0] = s.ledgers[0].slice(0, 3); // white, green, candlestick from seat 1
  const t = buildTracker({ state: s, seat: 0 });
  assert.equal(t.envelopeSolution(), null);
  for (const card of ['white', 'green', 'candlestick']) {
    assert.equal(t.holderOf(card), 1);
  }
  // Unseen cards stay undetermined — a pin here would be a misdeduction.
  assert.equal(t.holderOf('revolver'), null);
  assert.equal(t.isEnvelope('rope'), false);
});

test('never reads the envelope or other seats\' hands/ledgers (poison test)', () => {
  const clean = buildTracker({ state: determinedState(), seat: 0 });
  const t = buildTracker({ state: poison(determinedState()), seat: 0 });
  assert.deepEqual(t.envelopeSolution(), clean.envelopeSolution());
  assert.deepEqual(t.envelopeSolution(), SOLUTION);
});

// NOTE: a single no-refute yields only a negative fact, which is observable
// only through a downstream pin — the two tests below make the exclusion
// load-bearing (a tracker that ignored no-refute entries could not reach
// either conclusion). A bare holderOf()!==seat assertion would be vacuous.
test('unanimous no-refute pins the unheld suggested card to the envelope', () => {
  // Bot holds knife and hall itself; it suggests { plum, knife, hall } and
  // nobody refutes. plum is not in the bot's hand, not in seat 1, not in
  // seat 2 -> it can only be the envelope suspect.
  const s = baseState({
    hands: [['knife', 'hall', 'mustard', 'white', 'green', 'peacock'], [], []],
    log: [
      { type: 'suggest', bySeat: 0, suspect: 'plum', weapon: 'knife', room: 'hall' },
      { type: 'no-refute', seat: 1 },
      { type: 'no-refute', seat: 2 },
    ],
  });
  const t = buildTracker({ state: s, seat: 0 });
  assert.equal(t.isEnvelope('plum'), true);
  // Envelope uniqueness: the other suspects are now not-envelope.
  assert.deepEqual(t.envelopeCandidates('suspect'), ['plum']);
});

test('refute clause resolution: observer pins the shown card when it holds the other two', () => {
  // Seat 1 suggests { green, knife, hall }; seat 2 refutes. The bot (seat 0,
  // a bystander) holds green and knife itself, so seat 2 must hold hall.
  const s = baseState({
    hands: [['green', 'knife', 'mustard', 'kitchen', 'ballroom', 'library'], [], []],
    log: [
      { type: 'suggest', bySeat: 1, suspect: 'green', weapon: 'knife', room: 'hall' },
      { type: 'refute', bySeat: 2, ofSeat: 1 },
    ],
  });
  const t = buildTracker({ state: s, seat: 0 });
  assert.equal(t.holderOf('hall'), 2);
});

test('hand saturation: a fully-shown hand excludes that seat from every other card', () => {
  // Seat 1's full 6-card hand is in the bot's ledger. Seat 1 then SUGGESTS
  // { plum, knife, hall } (a suggester never passes on its own suggestion,
  // so no no-refute entry exists for seat 1); seat 2 passes; the bot refutes.
  // plum: not the bot's (own hand), not seat 2's (no-refute), and not seat
  // 1's — ONLY because its hand is saturated. Envelope it is.
  const seat1Hand = ['scarlett', 'candlestick', 'leadpipe', 'kitchen', 'ballroom', 'library'];
  const s = baseState({
    hands: [['knife', 'hall', 'mustard', 'white', 'green', 'lounge'], [], []],
    ledgers: [seat1Hand.map((card) => ({ fromSeat: 1, card })), [], []],
    log: [
      { type: 'suggest', bySeat: 1, suspect: 'plum', weapon: 'knife', room: 'hall' },
      { type: 'no-refute', seat: 2 },
      { type: 'refute', bySeat: 0, ofSeat: 1 },
    ],
  });
  const t = buildTracker({ state: s, seat: 0 });
  assert.equal(t.isEnvelope('plum'), true);
});

test('4-seat hand sizes: 18 cards deal 5/5/4/4 — no premature saturation', () => {
  // Seats 0 and 1 hold FIVE cards each (18 round-robin over 4). The bot has
  // seen 4 of seat 1's cards. A tracker that saturates every hand at
  // floor(18/4)=4 would wrongly exclude seat 1's fifth card and pin BOTH
  // remaining suspects to the envelope — a false certainty.
  const s = baseState({
    seats: [7, 8, 9, 10],
    seatSuspect: ['scarlett', 'mustard', 'white', 'green'],
    eliminated: [false, false, false, false],
    hands: [['mustard', 'white', 'knife', 'kitchen', 'ballroom'], [], [], []],
    ledgers: [[
      { fromSeat: 1, card: 'green' }, { fromSeat: 1, card: 'peacock' },
      { fromSeat: 1, card: 'candlestick' }, { fromSeat: 1, card: 'leadpipe' },
      { fromSeat: 2, card: 'revolver' }, { fromSeat: 2, card: 'wrench' },
      { fromSeat: 2, card: 'diningroom' }, { fromSeat: 2, card: 'billiardroom' },
      { fromSeat: 3, card: 'library' }, { fromSeat: 3, card: 'lounge' },
      { fromSeat: 3, card: 'hall' }, { fromSeat: 3, card: 'conservatory' },
    ], [], [], []],
  });
  const t = buildTracker({ state: s, seat: 0 });
  // scarlett/plum: one is seat 1's unseen fifth card, the other is the
  // envelope suspect — genuinely undetermined.
  assert.equal(t.envelopeSolution(), null);
  assert.equal(t.isEnvelope('scarlett'), false);
  assert.equal(t.isEnvelope('plum'), false);
  assert.deepEqual([...t.envelopeCandidates('suspect')].sort(), ['plum', 'scarlett']);
  // The weapon IS determined (5 of 6 located in seats -> rope is envelope).
  assert.equal(t.isEnvelope('rope'), true);
});

test('query API: unseen* lists exactly the cards the bot has not located', () => {
  const t = buildTracker({ state: baseState(), seat: 0 }); // own hand only
  assert.deepEqual(
    [...t.unseenSuspects()].sort(),
    ['green', 'peacock', 'plum', 'scarlett', 'white'], // all but own 'mustard'
  );
  assert.deepEqual(
    [...t.unseenWeapons()].sort(),
    ['candlestick', 'leadpipe', 'revolver', 'rope', 'wrench'], // all but own 'knife'
  );
  assert.equal(t.unseenRooms().includes('kitchen'), false); // own card
  assert.equal(t.unseenRooms().includes('study'), true);
});

test('redundant clause when the bot was the suggester does not corrupt the pin', () => {
  const s = baseState({
    ledgers: [[{ fromSeat: 1, card: 'green' }], [], []],
    log: [
      { type: 'suggest', bySeat: 0, suspect: 'green', weapon: 'rope', room: 'study' },
      { type: 'refute', bySeat: 1, ofSeat: 0 },
    ],
  });
  const t = buildTracker({ state: s, seat: 0 });
  assert.equal(t.holderOf('green'), 1);
  assert.equal(t.isEnvelope('green'), false);
});
