import { allTerritories } from './map.js';
import { shuffle } from '../../../src/shared/cards/deck.js';

// Starting armies per player count. The 2P figure is the long-standing house
// rule (not canonical 40); 3P/4P follow the canonical rulebook.
export const SETUP_ARMIES_BY_COUNT = { 2: 20, 3: 35, 4: 30 };
export const SETUP_ARMIES = SETUP_ARMIES_BY_COUNT[2]; // legacy export

const CARD_TYPES = ['infantry', 'cavalry', 'artillery'];

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

  return {
    phase: 'setup',
    currentPlayer: 0,
    territories,
    reinforcePool: 0,
    setupPools: Array(n).fill(SETUP_ARMIES_BY_COUNT[n]),
    fortifyUsed: false,
    lastCombat: null,
    winner: null,
    seats,
    eliminated: Array(n).fill(false),
    eliminationOrder: [],
    activeUserId: seats[0],
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
