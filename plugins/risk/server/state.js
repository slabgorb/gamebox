import { allTerritories } from './map.js';

export const SETUP_ARMIES = 20;

const CARD_TYPES = ['infantry', 'cavalry', 'artillery'];

function shuffleInPlace(arr, rng) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// 44-card Risk deck: one territory card per map territory (troop type assigned
// round-robin) plus two wilds, shuffled from the same rng stream.
export function buildDeck(rng) {
  const cards = allTerritories().map((territory, i) => ({ territory, type: CARD_TYPES[i % 3] }));
  cards.push({ territory: null, type: 'wild' });
  cards.push({ territory: null, type: 'wild' });
  return shuffleInPlace(cards, rng);
}

export function buildInitialState({ participants, rng }) {
  const a = participants.find(p => p.side === 'a').userId;
  const b = participants.find(p => p.side === 'b').userId;

  const shuffled = shuffleInPlace(allTerritories(), rng);
  const territories = {};
  shuffled.forEach((id, idx) => { territories[id] = { owner: idx % 2, armies: 1 }; });

  // Deck is built AFTER the territory shuffle so existing territory-split
  // determinism is preserved (the rng stream order is unchanged up to here).
  const deck = buildDeck(rng);

  return {
    phase: 'setup',
    currentPlayer: 0,
    territories,
    reinforcePool: 0,
    setupPools: [SETUP_ARMIES, SETUP_ARMIES],
    fortifyUsed: false,
    lastCombat: null,
    winner: null,
    log: [],
    sides: { a, b },
    activeUserId: a,
    deck,
    discard: [],
    hands: [[], []],
    tradeInCount: 0,
    capturedThisTurn: false,
  };
}

export function playerIndex(state, userId) {
  if (state.sides.a === userId) return 0;
  if (state.sides.b === userId) return 1;
  return null;
}

export function userIdOf(state, playerIdx) {
  return playerIdx === 0 ? state.sides.a : state.sides.b;
}
