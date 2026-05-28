import { legalMoves } from './rules/legal-moves.js';

export function sorryPublicView({ state, viewerId }) {
  let youAre = null;
  if (state.sides?.a === viewerId) youAre = 'a';
  else if (state.sides?.b === viewerId) youAre = 'b';
  // Redact deck order; expose everything else.
  const { deck, ...rest } = state;
  const view = { ...rest, deckCount: Array.isArray(deck) ? deck.length : 0, youAre };
  // Server-authoritative move legality: only the viewer whose turn it is sees
  // the legal moves. The client reads this array; it never recomputes legality.
  if (youAre !== null && state.currentPlayer === youAre) {
    view.legalMoves = legalMoves(state);
  }
  return view;
}
