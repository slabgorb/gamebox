import { Card as CardImg } from "../shared/Card";
import type { Card, PeggingState } from "../shared/contracts/cribbage";

const PIP: Record<string, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 10, Q: 10, K: 10,
};

export function isPlayable(card: Card, peg: PeggingState): boolean {
  return peg.running + PIP[card.rank] <= 31;
}

interface Props {
  pegging: PeggingState;
}

export function Pegging({ pegging }: Props) {
  return (
    <>
      {pegging.lastTrick && pegging.lastTrick.cards.length > 0 && (
        <div className="last-trick">
          <div className="last-trick__label">
            {pegging.lastTrick.kind === "31"
              ? `31 for ${pegging.lastTrick.points}`
              : `Go for ${pegging.lastTrick.points}`}
          </div>
          <div className="last-trick__cards">
            {pegging.lastTrick.cards.map((c, i) => (
              <CardImg key={c.id ?? i} card={c} />
            ))}
          </div>
        </div>
      )}
      <div className="running-total">Running: {pegging.running}</div>
      {pegging.history.map((c, i) => (
        <CardImg key={c.id ?? `h${i}`} card={c} />
      ))}
    </>
  );
}
