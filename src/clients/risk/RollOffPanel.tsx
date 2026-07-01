// src/clients/risk/RollOffPanel.tsx
// Setup-phase display of the pre-game roll-off (E5-7 AC4). Shows each seat's
// d6 and marks who won the first move. Renders nothing until the roll-off
// exists on the view.
import { rollOffRows } from "./rollOff";
import { seatFill, seatLabel } from "./themes";

interface RollOffView {
  turnOrderRolls?: number[];
  colors?: number[];
}

export function RollOffPanel({ view }: { view: RollOffView }) {
  const rows = rollOffRows(view.turnOrderRolls);
  if (rows.length === 0) return null;

  return (
    <div className="rolloff-panel" aria-label="Turn-order roll-off">
      <h3 className="rolloff-title">Roll-off for first move</h3>
      <ul className="rolloff-rows">
        {rows.map((r) => (
          <li
            key={r.seat}
            className={r.isWinner ? "rolloff-row rolloff-row--winner" : "rolloff-row"}
            data-seat={r.seat}
            data-winner={r.isWinner ? "true" : undefined}
          >
            <span
              className="rolloff-swatch"
              style={{ background: seatFill(r.seat, view.colors) }}
              aria-hidden="true"
            />
            <span className="rolloff-name">{seatLabel(r.seat, view.colors)}</span>
            <span className="rolloff-die">{r.roll}</span>
            {r.isWinner && <span className="rolloff-crown"> — goes first</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
