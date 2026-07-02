// Deterministic knowledge-matrix tracker for the Clue bot.
//
// Reads ONLY the bot's own hand, its own ledger, and the public log —
// never the envelope or another seat's private state. Every inference is
// sound Clue constraint propagation, so the tracker can be wrong about
// nothing it claims to know (the "never misdeduces" guarantee).
import { SUSPECTS, WEAPONS, ROOMS, ALL_CARDS } from '../cards.js';

const ENVELOPE = 'envelope';
const CATEGORY_CARDS = { suspect: SUSPECTS, weapon: WEAPONS, room: ROOMS };

// 18 cards deal round-robin: earlier seats absorb the remainder.
function handSize(seatCount, seat) {
  return Math.floor(18 / seatCount) + (seat < 18 % seatCount ? 1 : 0);
}

export function buildTracker({ state, seat }) {
  const seatCount = state.seats.length;
  const ownHand = state.hands[seat];
  const ownLedger = state.ledgers[seat];

  // possible: card -> Set of locations (seat indices and ENVELOPE) the card
  // could still occupy. A singleton set is a proven location.
  const possible = new Map();
  for (const card of ALL_CARDS) {
    possible.set(card, new Set([...Array(seatCount).keys(), ENVELOPE]));
  }

  const pin = (card, loc) => {
    const set = possible.get(card);
    if (set && set.has(loc)) possible.set(card, new Set([loc]));
  };
  const exclude = (card, loc) => {
    const set = possible.get(card);
    if (set && set.size > 1) set.delete(loc);
  };

  // --- Seed: own hand is exhaustive knowledge of one location.
  for (const card of ownHand) pin(card, seat);
  for (const card of ALL_CARDS) {
    if (!ownHand.includes(card)) exclude(card, seat);
  }

  // --- Seed: own ledger — cards other seats have shown this bot.
  for (const { fromSeat, card } of ownLedger) pin(card, fromSeat);

  // --- Seed: public log — no-refute passes and refute clauses per episode.
  const clauses = []; // { seat, cards: [suspect, weapon, room] }
  let episode = null;
  for (const entry of state.log) {
    if (entry.type === 'suggest') {
      episode = [entry.suspect, entry.weapon, entry.room];
    } else if (entry.type === 'no-refute' && episode) {
      for (const card of episode) exclude(card, entry.seat);
    } else if (entry.type === 'refute' && episode) {
      clauses.push({ seat: entry.bySeat, cards: episode });
    }
  }

  // --- Propagate to fixpoint.
  const snapshot = () => {
    let n = clauses.length;
    for (const set of possible.values()) n += set.size * 31;
    return n;
  };
  let before;
  do {
    before = snapshot();

    // Hand saturation: a seat with all its cards located holds nothing else.
    for (let s = 0; s < seatCount; s++) {
      const held = ALL_CARDS.filter((c) => {
        const set = possible.get(c);
        return set.size === 1 && set.has(s);
      });
      if (held.length === handSize(seatCount, s)) {
        for (const card of ALL_CARDS) {
          if (!held.includes(card)) exclude(card, s);
        }
      }
    }

    // Envelope structure: exactly one card per category is in the envelope.
    for (const cards of Object.values(CATEGORY_CARDS)) {
      const candidates = cards.filter((c) => possible.get(c).has(ENVELOPE));
      if (candidates.length === 1) pin(candidates[0], ENVELOPE);
      const proven = cards.find((c) => {
        const set = possible.get(c);
        return set.size === 1 && set.has(ENVELOPE);
      });
      if (proven) {
        for (const other of cards) {
          if (other !== proven) exclude(other, ENVELOPE);
        }
      }
    }

    // Clause resolution: "seat P holds >=1 of these three".
    for (let i = clauses.length - 1; i >= 0; i--) {
      const { seat: p, cards } = clauses[i];
      const satisfied = cards.some((c) => {
        const set = possible.get(c);
        return set.size === 1 && set.has(p);
      });
      if (satisfied) { clauses.splice(i, 1); continue; }
      const open = cards.filter((c) => possible.get(c).has(p));
      if (open.length === 1) { pin(open[0], p); clauses.splice(i, 1); }
    }
  } while (snapshot() !== before);

  // --- Query API (pure reads over the propagated matrix).
  const located = (card) => {
    const set = possible.get(card);
    return set.size === 1 ? [...set][0] : null;
  };
  const isEnvelope = (card) => located(card) === ENVELOPE;
  const envelopeCandidates = (category) =>
    (CATEGORY_CARDS[category] ?? []).filter((c) => possible.get(c).has(ENVELOPE));
  const unseen = (cards) => cards.filter((c) => located(c) === null);

  return {
    seatCount,
    holderOf: (card) => located(card),
    isEnvelope,
    envelopeCandidates,
    envelopeSolution() {
      const suspect = envelopeCandidates('suspect');
      const weapon = envelopeCandidates('weapon');
      const room = envelopeCandidates('room');
      if (suspect.length !== 1 || weapon.length !== 1 || room.length !== 1) return null;
      if (!isEnvelope(suspect[0]) || !isEnvelope(weapon[0]) || !isEnvelope(room[0])) return null;
      return { suspect: suspect[0], weapon: weapon[0], room: room[0] };
    },
    unseenSuspects: () => unseen(SUSPECTS),
    unseenWeapons: () => unseen(WEAPONS),
    unseenRooms: () => unseen(ROOMS),
  };
}
