import { CONTINENTS, continentBonus, neighborsOf } from '../map.js';
import { findTradeInSet } from './legal-moves.js';
import { tradeBonus } from '../actions.js';

// Held cards are a strategic asset: each guarantees future reinforcements and a
// completable set unlocks an escalating army bonus. Valued modestly (per-card +
// a set bonus) so it informs card-economy play without overriding territory and
// continent decisions — AC-4 requires it present but not dominating. Reuses the
// engine's set-detector so "what counts as a tradeable set" lives in one place.
function cardValue(hand) {
  if (!Array.isArray(hand) || hand.length === 0) return 0;
  const completeSet = findTradeInSet(hand) !== null;
  return 0.5 * hand.length + (completeSet ? 1 : 0);
}

export function evaluateBoard(state, p) {
  const terr = state.territories;
  const owned = Object.keys(terr).filter(id => terr[id].owner === p);

  let continentScore = 0;
  let partialProgress = 0;
  for (const key of Object.keys(CONTINENTS)) {
    const ids = CONTINENTS[key].territories;
    const mine = ids.filter(id => terr[id].owner === p).length;
    if (mine === ids.length) continentScore += continentBonus(key) * 3;
    else partialProgress += (mine / ids.length) * continentBonus(key);
  }

  let frontierRatio = 0;
  let exposedBorders = 0;
  for (const id of owned) {
    for (const n of neighborsOf(id)) {
      if (terr[n].owner !== p) {
        exposedBorders += 1;
        frontierRatio += (terr[id].armies - terr[n].armies);
      }
    }
  }

  const breakdown = {
    territories: owned.length,
    continentScore,
    partialProgress,
    frontierRatio: frontierRatio * 0.2,
    exposurePenalty: -exposedBorders * 0.5,
    cardValue: cardValue(state.hands?.[p]),
  };
  const total = breakdown.territories
    + breakdown.continentScore
    + breakdown.partialProgress
    + breakdown.frontierRatio
    + breakdown.exposurePenalty
    + breakdown.cardValue;
  return { total, breakdown };
}

// Positional (no dice simulation, deterministic) score for a candidate action.
export function scoreCandidate(state, p, action) {
  const t = state.territories;
  if (action.type === 'attack') {
    const { from, to } = action.payload;
    const advantage = t[from].armies - t[to].armies; // bigger = easier
    const targetValue = t[to].owner === p ? 0 : 1;
    return advantage + targetValue;
  }
  if (action.type === 'end-attack' || action.type === 'end-turn') return -0.5;
  if (action.type === 'trade-in') {
    // Cashing a set adds the escalating bonus to the reinforce pool. Score it as
    // the board plus that bonus so trade-in ranks above an ordinary deploy's
    // positional delta — and climbs as the bonus grows — instead of falling
    // through to the no-op baseline and being ranked dead last (then ignored).
    return evaluateBoard(state, p).total + tradeBonus(state.tradeInCount ?? 0);
  }
  // deploy / setup-deploy / fortify: score the resulting board positionally.
  const after = JSON.parse(JSON.stringify(state));
  if (action.type === 'deploy' || action.type === 'setup-deploy') {
    for (const [id, n] of Object.entries(action.payload.placements)) after.territories[id].armies += n;
  } else if (action.type === 'fortify') {
    const { from, to, count } = action.payload;
    after.territories[from].armies -= count;
    after.territories[to].armies += count;
  }
  return evaluateBoard(after, p).total;
}
