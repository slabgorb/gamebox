// Shared fixtures for the E6-4 Clue bot tests (knowledge / shortlist /
// chooseAction / integration).
//
// The determined 3-seat deal is globally consistent: envelope is
// { scarlett, rope, study }, and the 18 dealt cards split 6/6/6.
// Hand sizes derive from the round-robin deal: seat s holds
// floor(18/n) + (s < 18 % n ? 1 : 0) cards.
import { buildGeometry } from '../../plugins/clue/server/geometry.js';

// Deterministic LCG used across suites (mirrors backgammon-fixtures).
export function det(seed = 0) {
  let s = seed;
  return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
}

export const SEATS3 = [7, 8, 9];

// Synthetic 6x6 board (same as test/clue-movement.test.js): room ra with door
// threshold [2,1]; room rb with door threshold [3,4]; secret passage ra<->rb.
export function miniGeo() {
  return buildGeometry({
    cols: 6, rows: 6,
    rooms: {
      ra: { poly: [[0, 0], [2, 0], [2, 2], [0, 2]] },
      rb: { poly: [[4, 4], [6, 4], [6, 6], [4, 6]] },
    },
    doors: [{ room: 'ra', square: [2, 1] }, { room: 'rb', square: [3, 4] }],
    secretPassages: { ra: 'rb', rb: 'ra' },
    cellar: null,
  });
}

// Envelope { scarlett, rope, study }; every other card dealt exactly once.
export function determinedDeal() {
  return {
    envelope: { suspect: 'scarlett', weapon: 'rope', room: 'study' },
    hands: [
      ['mustard', 'knife', 'kitchen', 'ballroom', 'library', 'lounge'],
      ['white', 'green', 'candlestick', 'leadpipe', 'hall', 'conservatory'],
      ['peacock', 'plum', 'revolver', 'wrench', 'diningroom', 'billiardroom'],
    ],
  };
}

// Seat 0's ledger once seats 1 and 2 have shown it their full hands:
// with these 12 facts plus its own hand the bot has located all 18 dealt
// cards, so the envelope follows by elimination.
export function fullLedger0() {
  const { hands } = determinedDeal();
  return [
    ...hands[1].map((card) => ({ fromSeat: 1, card })),
    ...hands[2].map((card) => ({ fromSeat: 2, card })),
  ];
}

export const SOLUTION = { suspect: 'scarlett', weapon: 'rope', room: 'study' };

// Full E6-1/E6-3 state shape. Pawns for the three seated suspects only;
// mustard/white sit in rooms so they never block corridor walks.
export function baseState(overrides = {}) {
  const { envelope, hands } = determinedDeal();
  return {
    seats: [...SEATS3],
    phase: 'move',
    currentSeat: 0,
    activeUserId: SEATS3[0],
    envelope,
    hands: structuredClone(hands),
    pawns: {
      scarlett: { square: [2, 2] },
      mustard: { room: 'rb' },
      white: { room: 'rb' },
    },
    weapons: {
      candlestick: 'kitchen', knife: 'ballroom', leadpipe: 'conservatory',
      revolver: 'diningroom', rope: 'billiardroom', wrench: 'library',
    },
    seatSuspect: ['scarlett', 'mustard', 'white'],
    eliminated: [false, false, false],
    ledgers: [[], [], []],
    suggestion: null,
    pendingRoll: null,
    log: [],
    ...overrides,
  };
}

// --- Sub-state builders (bot = seat 0 unless stated) ---

// phase 'move', no roll yet. inRoom puts the bot pawn in a room (miniGeo ids
// 'ra'/'rb' or a real room). solved gives the bot the full ledger.
export function topOfTurnState({ inRoom = null, solved = false } = {}) {
  const s = baseState();
  if (inRoom) s.pawns.scarlett = { room: inRoom };
  if (solved) s.ledgers[0] = fullLedger0();
  return s;
}

// phase 'move' with a rolled die. blocked seals the bot in room ra behind an
// occupied door threshold (no legal moves at all).
export function movementState({ pendingRoll = 3, blocked = false } = {}) {
  const s = baseState({ pendingRoll });
  if (blocked) {
    s.pawns.scarlett = { room: 'ra' };
    s.pawns.mustard = { square: [2, 1] };
  }
  return s;
}

// phase 'suggest'; the bot pawn is in a real catalog room (doSuggest requires
// suggesting the room you are in, and validates against the card catalog).
export function suggestState({ room = 'hall', solved = false } = {}) {
  const s = baseState({ phase: 'suggest' });
  s.pawns.scarlett = { room };
  if (solved) s.ledgers[0] = fullLedger0();
  return s;
}

export function accusePassState({ solved = false } = {}) {
  const s = baseState({ phase: 'accuse-or-pass' });
  s.pawns.scarlett = { room: 'hall' };
  if (solved) s.ledgers[0] = fullLedger0();
  return s;
}

// phase 'refute' with the bot as the refuter (default seat 2). The bot's hand
// is overridden so it holds the given matching cards.
export function refuteState({ botSeat = 2, botHand = ['green', 'knife'] } = {}) {
  const s = baseState({ phase: 'refute' });
  s.hands[botSeat] = [...botHand];
  s.suggestion = {
    bySeat: 0, suspect: 'green', weapon: 'knife', room: 'hall',
    refuterSeat: botSeat, shownCard: null,
  };
  s.activeUserId = s.seats[botSeat];
  return s;
}

// Corrupt everything the bot must never read: the envelope, every OTHER
// seat's hand, and every OTHER seat's ledger. Any bot layer that reads a
// poisoned field produces a different result than on the clean state.
export function poison(state, ownSeat = 0) {
  const p = structuredClone(state);
  p.envelope = { suspect: 'plum', weapon: 'wrench', room: 'kitchen' };
  p.hands = p.hands.map((h, i) => (i === ownSeat ? h : ['CORRUPT']));
  p.ledgers = p.ledgers.map((l, i) => (i === ownSeat ? l : [{ fromSeat: ownSeat, card: 'CORRUPT' }]));
  return p;
}
