// src/clients/risk/CardTray.tsx
// Campaign-desk card tray: the player's own Risk cards, an opponent count,
// and a trade-in control. When the hand reaches the forced-trade threshold
// (>=5) on the player's reinforce step, a blocking modal compels a trade so
// the deploy soft-lock (server rejects deploy at >=5 cards) can't happen.
import { useState, useEffect } from "react";
import type { RiskView, RiskAction } from "../shared/contracts/risk";
import { isValidCardSet, cardLabel } from "./card-rules";

const FORCED_TRADE_AT = 5;

interface Props {
  view: RiskView;
  post: (a: RiskAction) => void | Promise<void>;
}

export function CardTray({ view, post }: Props) {
  const hand = view.hand;
  const [selected, setSelected] = useState<number[]>([]);

  // Reset the selection whenever the hand changes out from under us (a
  // completed trade, a drawn card, or a turn flip) so stale indices can't
  // point at the wrong cards.
  const handKey = (hand ?? []).map((c) => `${c.type}:${c.territory}`).join("|");
  useEffect(() => {
    setSelected([]);
  }, [handKey]);

  // No card state in this game (e.g. setup before any capture): render nothing.
  if (!Array.isArray(hand)) return null;

  const yourTurn = view.youAre === view.currentPlayer;
  const canTrade = view.phase === "reinforce" && yourTurn;
  const mustTrade = canTrade && hand.length >= FORCED_TRADE_AT;
  // Guard against stale indices: when the hand shrinks (a completed trade, an
  // SSE update) `selected` can still reference indices past the new hand for
  // the one render before the reset effect fires. Treat that as not-a-set
  // rather than indexing undefined into isValidCardSet.
  const validSet =
    selected.length === 3 &&
    selected.every((i) => i < hand.length) &&
    isValidCardSet(selected.map((i) => hand[i]));

  function toggle(i: number) {
    setSelected((cur) => {
      if (cur.includes(i)) return cur.filter((x) => x !== i);
      if (cur.length >= 3) return cur; // a set is exactly three
      return [...cur, i];
    });
  }

  function submit() {
    if (!validSet) return;
    // cardIndices are positional indices into view.hand. This is valid only
    // because the server hand is order-preserving and append-only (trade-in
    // filters by index, draw appends — neither reorders), so client and
    // server indices agree. The server re-validates bounds/dups/set shape.
    post({ type: "trade-in", payload: { cardIndices: [...selected] } });
    setSelected([]);
  }

  const bonus = view.nextTradeBonus;

  const handList = (
    <ul className="card-tray__hand" data-testid="card-tray-hand">
      {hand.map((card, i) => {
        const on = selected.includes(i);
        return (
          // Stable key: a trade-in removes cards mid-list, so a bare index key
          // would make React reuse the wrong <li> nodes for the survivors. The
          // :i suffix disambiguates the two identical wild cards.
          <li key={`${card.type}:${card.territory}:${i}`}>
            <button
              type="button"
              className={`hand-card${on ? " selected" : ""} type-${card.type}`}
              data-testid="hand-card"
              data-index={i}
              aria-pressed={on}
              disabled={!canTrade}
              onClick={() => toggle(i)}
            >
              {cardLabel(card)}
            </button>
          </li>
        );
      })}
    </ul>
  );

  const tradeControls = (
    <div className="card-tray__actions">
      {bonus != null && (
        <span className="card-tray__bonus" data-testid="next-trade-bonus">
          {`Set grants +${bonus} armies`}
        </span>
      )}
      <button
        type="button"
        className="brass-btn"
        data-testid="trade-in-btn"
        disabled={!canTrade || !validSet}
        onClick={submit}
      >
        Trade in set
      </button>
    </div>
  );

  return (
    <div className="card-tray" data-testid="card-tray">
      <div className="card-tray__head">
        <span className="card-tray__title">Your cards</span>
        <span className="card-tray__opp" data-testid="opponent-card-count">
          {(view.seats?.length ?? 2) > 2 && view.cardCounts
            ? view.cardCounts
                .map((c, seat) => ({ c, seat }))
                .filter(({ seat }) => seat !== view.youAre && !view.eliminated?.[seat])
                .map(({ c, seat }) => `P${seat + 1}: ${c}`)
                .join(" · ")
            : `Opponent holds ${view.opponentCardCount ?? 0}`}
        </span>
      </div>

      {/* When a trade is forced, the modal below is the sole renderer of the
          hand + controls — gating the inline body on !mustTrade avoids mounting
          a duplicate (and AT-visible) interactive copy beneath the overlay. */}
      {!mustTrade && (hand.length === 0 ? (
        <p className="card-tray__empty">No cards yet — capture a territory to earn one.</p>
      ) : (
        <>
          {handList}
          {canTrade && tradeControls}
        </>
      ))}

      {mustTrade && (
        <div className="trade-modal" role="dialog" aria-modal="true" data-testid="must-trade-modal">
          <div className="trade-modal__panel">
            <h2 className="trade-modal__title">Trade in a card set</h2>
            <p className="trade-modal__msg">
              {`You hold ${hand.length} cards. You must trade in a set before you can deploy.`}
            </p>
            {handList}
            {tradeControls}
          </div>
        </div>
      )}
    </div>
  );
}
