import { areAdjacent } from './map.js';

// Each validator returns null when valid, or an error string when not.

export function validateDeploy(state, playerIdx, placements, pool) {
  if (!placements || typeof placements !== 'object') return 'placements required';
  let sum = 0;
  for (const [id, n] of Object.entries(placements)) {
    if (!Number.isInteger(n) || n < 0) return `negative or non-integer count for ${id}`;
    const t = state.territories[id];
    if (!t) return `unknown territory ${id}`;
    if (t.owner !== playerIdx) return `territory ${id} not owned`;
    sum += n;
  }
  if (sum !== pool) return `placements must spend exactly the pool (${pool}), got ${sum}`;
  return null;
}

export function validateAttack(state, playerIdx, { from, to, force }) {
  const f = state.territories[from];
  const t = state.territories[to];
  if (!f || !t) return 'unknown territory';
  if (f.owner !== playerIdx) return `source ${from} not owned`;
  if (t.owner === playerIdx) return `target ${to} is not an enemy territory`;
  if (!areAdjacent(from, to)) return `${from} and ${to} are not adjacent`;
  if (!Number.isInteger(force) || force < 2 || force >= f.armies) {
    return `force must be an integer in 2..${f.armies - 1}`;
  }
  return null;
}

export function validateFortify(state, playerIdx, { from, to, count }) {
  const f = state.territories[from];
  const t = state.territories[to];
  if (!f || !t) return 'unknown territory';
  if (!areAdjacent(from, to)) return `${from} and ${to} are not adjacent`;
  if (f.owner !== playerIdx || t.owner !== playerIdx) return 'both territories must be owned';
  if (!Number.isInteger(count) || count < 1 || count >= f.armies) {
    return `must leave >=1 army behind (count 1..${f.armies - 1})`;
  }
  return null;
}

// A trade-in is three distinct, in-hand cards forming a valid set: three of a
// kind, three distinct troop types, or any two cards plus a wild.
function isValidCardSet(cards) {
  // Any set containing a wild is valid (a wild substitutes for any troop type).
  // The deck holds only two wilds, so a three-wild set never arises in play.
  if (cards.some(c => c.type === 'wild')) return true;
  const types = new Set(cards.map(c => c.type));
  return types.size === 1 || types.size === 3; // three-of-a-kind or three-distinct
}

export function validateTradeIn(state, playerIdx, cardIndices) {
  const hand = state.hands?.[playerIdx];
  if (!Array.isArray(hand)) return 'no hand to trade from';
  if (!Array.isArray(cardIndices) || cardIndices.length !== 3) {
    return 'a trade-in must be exactly three cards';
  }
  const seen = new Set();
  for (const i of cardIndices) {
    if (!Number.isInteger(i) || i < 0 || i >= hand.length) return `card index ${i} not in hand`;
    if (seen.has(i)) return `duplicate card index ${i}`;
    seen.add(i);
  }
  if (!isValidCardSet(cardIndices.map(i => hand[i]))) {
    return 'not a valid set (need three of a kind, three distinct, or two cards plus a wild)';
  }
  return null;
}
