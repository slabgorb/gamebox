import { playerIndex } from './state.js';
import { tradeBonus } from './actions.js';

export function riskPublicView({ state, viewerId }) {
  const youAre = playerIndex(state, viewerId);
  // Hands, deck, and discard are private information — never ship their
  // identities to a client. The viewer sees only their own hand and per-seat
  // card counts. capturedThisTurn / tradeInCount are internal engine
  // bookkeeping and are not part of the RiskView contract.
  const { hands, deck, discard, capturedThisTurn, tradeInCount, ...rest } = state;
  const view = { ...rest, youAre };
  if (Array.isArray(hands)) {
    const isPlayer = youAre !== null && youAre >= 0;
    view.hand = isPlayer ? (hands[youAre] ?? []) : [];
    view.cardCounts = hands.map(h => h?.length ?? 0);
    // Legacy 2P field: the other seat's count (first seat that isn't you).
    const oppIdx = isPlayer ? (youAre === 0 ? 1 : 0) : null;
    view.opponentCardCount = oppIdx === null ? 0 : (hands[oppIdx]?.length ?? 0);
    // Derived: how many bonus armies the NEXT trade-in grants. The raw
    // tradeInCount counter stays private; the client only needs the figure
    // to label the trade-in control (AC: "shows the bonus it will grant").
    view.nextTradeBonus = tradeBonus(tradeInCount ?? 0);
  }
  return view;
}
