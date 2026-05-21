import { playerIndex } from './state.js';

export function riskPublicView({ state, viewerId }) {
  const youAre = playerIndex(state, viewerId);
  // Hands, deck, and discard are private information — never ship their
  // identities to a client. The viewer sees only their own hand and a count
  // of the opponent's.
  const { hands, deck, discard, ...rest } = state;
  const view = { ...rest, youAre };
  if (Array.isArray(hands)) {
    const isPlayer = youAre === 0 || youAre === 1;
    view.hand = isPlayer ? (hands[youAre] ?? []) : [];
    const oppIdx = youAre === 0 ? 1 : youAre === 1 ? 0 : null;
    view.opponentCardCount = oppIdx === null ? 0 : (hands[oppIdx]?.length ?? 0);
  }
  return view;
}
