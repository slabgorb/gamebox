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

function BreakdownCard({ title, breakdown }: { title: string; breakdown: BreakdownGroup }) {
  return (
    <div className="breakdown-card">
      <h3>
        {title} — {breakdown.total}
      </h3>
      <ul>
        {breakdown.items.map((item, i) => (
          <li key={i}>
            <div className="say">{item.say}</div>
            <div className="mini-cards">
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
  const ndLabel = isDealer ? "Opponent (non-dealer)" : "You (non-dealer)";
  const dLabel = isDealer ? "You (dealer)" : "Opponent (dealer)";
  const loserScore = wonMatch ? scoresOpp : scoresMe;
  const skunked = isMatchEnd && loserScore < 91;
  return (
    <div className="show-wrap">
      {isMatchEnd && (
        <h2 className="show-head">
          {wonMatch
            ? skunked
              ? `Game! You skunked them, ${scoresMe} to ${scoresOpp}.`
              : `Game! You won, ${scoresMe} to ${scoresOpp}.`
            : skunked
              ? `Game. You were skunked, ${scoresOpp} to ${scoresMe}.`
              : `Game. They won, ${scoresOpp} to ${scoresMe}.`}
        </h2>
      )}
      <BreakdownCard title={ndLabel} breakdown={breakdown.nonDealer} />
      <BreakdownCard title={dLabel} breakdown={breakdown.dealer} />
      <BreakdownCard title="Crib" breakdown={breakdown.crib} />
      {isMatchEnd ? (
        <a href="/" className="show-lobby-btn">
          Back to lobby
        </a>
      ) : (
        <button
          type="button"
          disabled={myAcknowledged}
          onClick={onAcknowledge}
        >
          {myAcknowledged ? "Waiting for opponent…" : "Continue"}
        </button>
      )}
    </div>
  );
}
