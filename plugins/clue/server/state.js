import { shuffle } from '../../../src/shared/cards/deck.js';
import { SUSPECTS, WEAPONS, ROOMS, dealCards } from './cards.js';
import { START_SQUARES } from './geometry.js';

// Order participants into a seat-indexed userId roster. `seat` is canonical;
// fall back to array position if a participant omits it.
function seatOrder(participants) {
  return participants
    .map((p, i) => ({ userId: p.userId, seat: Number.isInteger(p.seat) ? p.seat : i }))
    .sort((a, b) => a.seat - b.seat)
    .map((p) => p.userId);
}

export function buildInitialState({ participants, rng }) {
  const seats = seatOrder(participants);
  const n = seats.length;
  if (n < 3 || n > 4) throw new Error(`clue takes 3-4 players; got ${n}`);

  const { envelope, hands } = dealCards(rng, n);

  // Distribute the 6 weapons into 6 distinct rooms (canonical: any 6 of 9).
  const shuffledRooms = shuffle(ROOMS.slice(), rng);
  const weapons = {};
  WEAPONS.forEach((w, i) => { weapons[w] = shuffledRooms[i]; });

  // All six suspect pawns are on the board at all times (canonical). Each
  // starts on its corridor start square (see geometry.js START_SQUARES).
  const pawns = {};
  SUSPECTS.forEach((s) => { pawns[s] = { square: [...START_SQUARES[s]] }; });

  return {
    seats,
    phase: 'move',
    currentSeat: 0,
    activeUserId: seats[0],
    envelope,
    hands,
    pawns,
    weapons,
    seatSuspect: seats.map((_, i) => SUSPECTS[i]),
    eliminated: seats.map(() => false),
    ledgers: seats.map(() => []),
    suggestion: null,
    pendingRoll: null,
    log: [],
  };
}
