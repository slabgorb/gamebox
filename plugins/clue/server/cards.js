// Canonical Clue: The Classic Edition catalog. Card ids are lowercase strings.
import { shuffle } from '../../../src/shared/cards/deck.js';

export const SUSPECTS = ['scarlett', 'mustard', 'white', 'green', 'peacock', 'plum'];
export const WEAPONS = ['candlestick', 'knife', 'leadpipe', 'revolver', 'rope', 'wrench'];
export const ROOMS = [
  'kitchen', 'ballroom', 'conservatory', 'diningroom', 'billiardroom',
  'library', 'lounge', 'hall', 'study',
];
export const ALL_CARDS = [...SUSPECTS, ...WEAPONS, ...ROOMS];

export function categoryOf(card) {
  if (SUSPECTS.includes(card)) return 'suspect';
  if (WEAPONS.includes(card)) return 'weapon';
  if (ROOMS.includes(card)) return 'room';
  return null;
}

// Pick one card per category for the hidden envelope, then shuffle and deal the
// remaining 18 round-robin into `seatCount` hands (some hands hold one more).
export function dealCards(rng, seatCount) {
  const suspect = shuffle(SUSPECTS.slice(), rng)[0];
  const weapon = shuffle(WEAPONS.slice(), rng)[0];
  const room = shuffle(ROOMS.slice(), rng)[0];
  const envelope = { suspect, weapon, room };

  const remaining = ALL_CARDS.filter((c) => c !== suspect && c !== weapon && c !== room);
  const dealDeck = shuffle(remaining.slice(), rng); // 18 cards
  const hands = Array.from({ length: seatCount }, () => []);
  dealDeck.forEach((card, i) => { hands[i % seatCount].push(card); });

  return { envelope, hands };
}
