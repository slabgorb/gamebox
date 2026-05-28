export function sorryPublicView({ state, viewerId }) {
  let youAre = null;
  if (state.sides?.a === viewerId) youAre = 'a';
  else if (state.sides?.b === viewerId) youAre = 'b';
  // Redact deck order; expose everything else (filled out in later stories).
  const { deck, ...rest } = state;
  return { ...rest, deckCount: Array.isArray(deck) ? deck.length : 0, youAre };
}
