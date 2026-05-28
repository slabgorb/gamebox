// The canonical Sorry! deck: 45 cards. Rank 1 appears five times; every other
// rank four times. Standard Sorry! has no 6 or 9.
export const RANK_COUNTS = { 1: 5, 2: 4, 3: 4, 4: 4, 5: 4, 7: 4, 8: 4, 10: 4, 11: 4, 12: 4, sorry: 4 };

function shuffle(cards, rng) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeck(rng = Math.random) {
  const cards = [];
  for (const [rank, n] of Object.entries(RANK_COUNTS)) {
    const value = rank === 'sorry' ? 'sorry' : Number(rank);
    for (let i = 0; i < n; i++) cards.push(value);
  }
  return shuffle(cards, rng);
}

// Pops the top card. If the deck is empty, the discard pile is shuffled to form
// a fresh deck first. Pure: returns the next {card, deck, discard} without
// mutating the inputs.
export function draw({ deck, discard, rng = Math.random }) {
  let d = deck.slice();
  let disc = discard.slice();
  if (d.length === 0) {
    if (disc.length === 0) throw new Error('sorry: no cards left to draw');
    d = shuffle(disc, rng);
    disc = [];
  }
  const [card, ...rest] = d;
  return { card, deck: rest, discard: disc };
}
