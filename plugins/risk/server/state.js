import { allTerritories } from './map.js';
import { shuffle } from '../../../src/shared/cards/deck.js';

// Starting armies per player count. The 2P figure is the long-standing house
// rule (not canonical 40); 3P/4P follow the canonical rulebook.
export const SETUP_ARMIES_BY_COUNT = { 2: 20, 3: 35, 4: 30 };
export const SETUP_ARMIES = SETUP_ARMIES_BY_COUNT[2]; // legacy export

const CARD_TYPES = ['infantry', 'cavalry', 'artillery'];

// Size of the seat palette (mirrors SEAT_LABEL/SEAT_HEX in client themes.ts).
// A colour "pick" is an index into this palette; picks outside 0..3 are invalid.
export const PALETTE_SIZE = 4;

// 44-card Risk deck: one territory card per map territory (troop type assigned
// round-robin) plus two wilds, shuffled from the same rng stream.
export function buildDeck(rng) {
  const cards = allTerritories().map((territory, i) => ({ territory, type: CARD_TYPES[i % 3] }));
  cards.push({ territory: null, type: 'wild' });
  cards.push({ territory: null, type: 'wild' });
  return shuffle(cards, rng);
}

// Sort participants into seat order. Entries carry `seat` (canonical); the
// legacy `side` field ('a'/'b') is honoured as a fallback so old harnesses
// keep working.
function seatOrder(participants) {
  return [...participants]
    .map(p => ({ userId: p.userId, seat: p.seat ?? (p.side === 'a' ? 0 : 1) }))
    .sort((x, y) => x.seat - y.seat)
    .map(p => p.userId);
}

export function buildInitialState({ participants, rng }) {
  const seats = seatOrder(participants);
  const n = seats.length;
  if (n < 2 || n > 4) throw new Error(`risk takes 2-4 players; got ${n}`);

  const shuffled = shuffle(allTerritories(), rng);
  const territories = {};
  shuffled.forEach((id, idx) => { territories[id] = { owner: idx % n, armies: 1 }; });

  // Deck is built AFTER the territory shuffle so existing territory-split
  // determinism is preserved (the rng stream order is unchanged up to here).
  const deck = buildDeck(rng);

  // Per-seat colour (palette-slot index). Defaults to the identity seat→slot
  // mapping so an unconfigured game renders exactly as before; a participant
  // may pick a slot via `color`. Colour is user input, so an out-of-range or
  // non-integer pick falls back to the seat's default slot.
  const colorByUser = new Map(participants.map(p => [p.userId, p.color]));
  const colors = seats.map((userId, seatIdx) => {
    const pick = colorByUser.get(userId);
    return Number.isInteger(pick) && pick >= 0 && pick < PALETTE_SIZE ? pick : seatIdx;
  });

  // Turn order is decided by a seeded d6 roll-off, not fixed to seat 0. Highest
  // roll goes first; ties break to the lowest seat index (deterministic — a
  // re-roll would hang on a constant-value rng). Rolls are drawn AFTER the deck
  // build so the territory split above is byte-identical to the old engine.
  const turnOrderRolls = seats.map(() => Math.floor(rng() * 6) + 1);
  const currentPlayer = firstPlayer({ turnOrderRolls });

  return {
    phase: 'setup',
    currentPlayer,
    turnOrderRolls,
    colors,
    territories,
    reinforcePool: 0,
    setupPools: Array(n).fill(SETUP_ARMIES_BY_COUNT[n]),
    fortifyUsed: false,
    lastCombat: null,
    winner: null,
    seats,
    eliminated: Array(n).fill(false),
    eliminationOrder: [],
    activeUserId: seats[currentPlayer],
    deck,
    discard: [],
    hands: Array.from({ length: n }, () => []),
    tradeInCount: 0,
    capturedThisTurn: false,
    log: [],
  };
}

// Canonical states carry seats: [userId, ...]. The legacy 2P shape
// (sides: {a, b}) is still accepted so old fixtures and harnesses work.
function seatsOf(state) {
  if (Array.isArray(state.seats)) return state.seats;
  if (state.sides) return [state.sides.a, state.sides.b];
  return [];
}

export function playerCount(state) {
  return seatsOf(state).length;
}

// The roll-off winner: the seat holding the highest turn-order roll (ties break
// to the lowest seat index — deterministic). This is the "first player" who
// deploys first in setup and takes the first reinforce turn. Returns 0 for
// legacy states with no recorded roll-off so old fixtures keep seat-0-first.
export function firstPlayer(state) {
  const rolls = state?.turnOrderRolls;
  if (!Array.isArray(rolls) || rolls.length === 0) return 0;
  let best = 0;
  for (let i = 1; i < rolls.length; i++) {
    if (rolls[i] > rolls[best]) best = i;
  }
  return best;
}

export function playerIndex(state, userId) {
  const i = seatsOf(state).indexOf(userId);
  return i === -1 ? null : i;
}

export function userIdOf(state, playerIdx) {
  return seatsOf(state)[playerIdx];
}

export function isEliminated(state, playerIdx) {
  return state.eliminated?.[playerIdx] === true;
}

export function liveSeats(state) {
  return seatsOf(state).map((_, i) => i).filter(i => !isEliminated(state, i));
}
