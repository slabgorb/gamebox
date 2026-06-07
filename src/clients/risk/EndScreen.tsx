import type { RiskView } from "../shared/contracts/risk";
import { seatLabel } from "./themes";

export function EndScreen({
  view,
  seatNames,
}: {
  view: RiskView;
  seatNames?: (string | undefined)[];
}) {
  const won = view.winner === view.youAre;
  const nameOf = (seat: number | null | undefined) =>
    seat == null ? "Nobody" : seatNames?.[seat] ?? seatLabel(seat);
  const n = view.seats?.length ?? 2;
  // Final standings: winner first, then eliminated seats in reverse order.
  const order =
    n > 2
      ? [view.winner, ...[...(view.eliminationOrder ?? [])].reverse()].filter(
          (s): s is number => s != null,
        )
      : null;
  return (
    <div className="end">
      <h1>{won ? "Victory" : "Defeat"}</h1>
      <p>{nameOf(view.winner)} controls the world.</p>
      {order && (
        <ol style={{ listStyle: "decimal", margin: "10px auto", display: "inline-block", textAlign: "left" }}>
          {order.map((seat) => (
            <li key={seat}>
              {nameOf(seat)}
              {seat === view.youAre ? " (you)" : ""}
            </li>
          ))}
        </ol>
      )}
      <a className="end-lobby" href="/">
        Back to lobby
      </a>
    </div>
  );
}
