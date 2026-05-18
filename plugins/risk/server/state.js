import { allTerritories } from './map.js';

export const SETUP_ARMIES = 20;

export function buildInitialState({ participants, rng }) {
  const a = participants.find(p => p.side === 'a').userId;
  const b = participants.find(p => p.side === 'b').userId;

  const shuffled = allTerritories();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const territories = {};
  shuffled.forEach((id, idx) => { territories[id] = { owner: idx % 2, armies: 1 }; });

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
