// Show breakdown — three paper panels (non-dealer, dealer, crib) with mini
// cards and per-item point totals.

import { Card as CardImg } from "../shared/Card";
import type {
  Card,
  BreakdownGroup,
  ShowBreakdown,
} from "../shared/contracts/cribbage";

interface Props {
  breakdown: ShowBreakdown;
  isDealer: boolean;
  isMatchEnd: boolean;
  myAcknowledged: boolean;
  scoresMe: number;
  scoresOpp: number;
  wonMatch: boolean;
  onAcknowledge: () => void;
}

function BreakdownBlock({
  title,
  eyebrow,
  breakdown,
}: {
  title: string;
  eyebrow?: string;
  breakdown: BreakdownGroup;
}) {
  return (
    <div className="bd breakdown-card">
      <div className="bd__head">
        <div className="bd__who">
          {title}
          {eyebrow && <em> {eyebrow}</em>}
        </div>
        <div className="bd__total">{breakdown.total}</div>
      </div>
      <ul className="bd__items">
        {breakdown.items.map((item, i) => (
          <li key={i} className="bd__item">
            <div className="bd__say">
              <span>{item.say}</span>
              {typeof item.points === "number" && (
                <span className="bd__say-pts">+{item.points}</span>
              )}
            </div>
            <div className="bd__cards">
              {item.cards.map((c: Card, j: number) => (
                <CardImg key={c.id ?? j} card={c} className="mini" />
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Show({
  breakdown,
  isDealer,
  isMatchEnd,
  myAcknowledged,
  scoresMe,
  scoresOpp,
  wonMatch,
  onAcknowledge,
}: Props) {
  const ndLabel = isDealer ? "Opponent" : "You";
  const dLabel = isDealer ? "You" : "Opponent";
  const loserScore = wonMatch ? scoresOpp : scoresMe;
  const skunked = isMatchEnd && loserScore < 91;
  return (
    <div className="show show-wrap">
      <div className="cribbage-eyebrow" style={{ textAlign: "center" }}>
        Hand counts
      </div>
      <h2 className="show-head show__head">
        {isMatchEnd ? (
          wonMatch ? (
            skunked ? (
              <>
                Game! You <em>skunked</em> them, {scoresMe} to {scoresOpp}.
              </>
            ) : (
              <>
                Game! You won, {scoresMe} to {scoresOpp}.
              </>
            )
          ) : skunked ? (
            <>
              Game. You were <em>skunked</em>, {scoresOpp} to {scoresMe}.
            </>
          ) : (
            <>
              Game. They won, {scoresOpp} to {scoresMe}.
            </>
          )
        ) : (
          <em>"Pegs forward — let's count 'em."</em>
        )}
      </h2>
      <div className="show__groups">
        <BreakdownBlock
          title={ndLabel}
          eyebrow="(non-dealer)"
          breakdown={breakdown.nonDealer}
        />
        <BreakdownBlock
          title={dLabel}
          eyebrow="(dealer)"
          breakdown={breakdown.dealer}
        />
        <BreakdownBlock title="Crib" breakdown={breakdown.crib} />
      </div>
      <div className="show__footer">
        <div className="show__meta">
          {isMatchEnd ? (
            <em>The cabinet beckons.</em>
          ) : (
            <em>Deal advances when you're both ready.</em>
          )}
        </div>
        {isMatchEnd ? (
          <a href="/" className="show-lobby-btn show__continue">
            Back to lobby
          </a>
        ) : (
          <button
            type="button"
            className="show__continue"
            disabled={myAcknowledged}
            onClick={onAcknowledge}
          >
            {myAcknowledged ? "Waiting for opponent…" : "Continue"}
          </button>
        )}
      </div>
    </div>
  );
}
