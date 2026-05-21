// src/clients/risk/History.tsx
// Parchment chronicle of recent turns — italic IM Fell English prose
// with a leading turn marker and a trailing verdict pip. Turn numbers
// are derived from end-turn entries in the log (the contract carries no
// explicit turn field).
import type { RiskLogEntry } from "../shared/contracts/risk";
import { TERRITORIES } from "./map-geometry.js";

const T = TERRITORIES as Record<string, { name: string }>;
const tName = (id: string | undefined): string => (id && T[id]?.name) || id || "?";

type Stamped = { entry: RiskLogEntry; turn: number };

function stampTurns(log: RiskLogEntry[]): Stamped[] {
  let turn = 1;
  const out: Stamped[] = [];
  for (const entry of log) {
    out.push({ entry, turn });
    if (entry.kind === "end-turn") turn += 1;
  }
  return out;
}

function renderLine(
  entry: RiskLogEntry,
  turn: number,
  key: number,
  nameOf: (p?: number) => string,
) {
  const turnMarker = <span className="turn-marker">T{turn}</span>;
  const who = <b>{nameOf(entry.player)}</b>;
  if (entry.kind === "attack") {
    return (
      <li key={key}>
        {turnMarker}
        <span>
          {who} marched from <span className="from">{tName(entry.from)}</span>{" "}
          on <span className="to">{tName(entry.to)}</span>.
        </span>
        <span className={`verdict-pip ${entry.captured ? "win" : "lose"}`}>
          {entry.captured ? "Captured" : "Repulsed"}
        </span>
      </li>
    );
  }
  if (entry.kind === "fortify") {
    return (
      <li key={key}>
        {turnMarker}
        <span>
          {who} reinforced <span className="from">{tName(entry.from)}</span> →{" "}
          <span className="to">{tName(entry.to)}</span>.
        </span>
        <span className="verdict-pip">×{entry.count ?? 1}</span>
      </li>
    );
  }
  if (entry.kind === "deploy" || entry.kind === "setup-deploy") {
    return (
      <li key={key}>
        {turnMarker}
        <span>{who} mustered new levies.</span>
        <span className="verdict-pip">deploy</span>
      </li>
    );
  }
  if (entry.kind === "end-turn") {
    return (
      <li key={key}>
        {turnMarker}
        <span>
          Turn to <b>{nameOf(entry.next)}</b>.
        </span>
        <span className="verdict-pip">turn</span>
      </li>
    );
  }
  return null;
}

interface HistoryProps {
  log?: RiskLogEntry[];
  youAre?: number | null;
  yourName?: string;
  opponentName?: string;
}

export function History({
  log = [],
  youAre = null,
  yourName,
  opponentName,
}: HistoryProps) {
  const nameOf = (p?: number): string => {
    if (p == null) return "—";
    if (youAre != null && p === youAre) return yourName || `Player ${p + 1}`;
    if (youAre != null && p !== youAre) return opponentName || `Player ${p + 1}`;
    return `Player ${p + 1}`;
  };
  const stamped = stampTurns(log);
  const tail = stamped.slice(-6).reverse();
  const currentTurn = stamped.length ? stamped[stamped.length - 1].turn : 1;
  return (
    <section className="chronicle">
      <h3>
        <span>Chronicle</span>
        <span className="turn-no">TURN {currentTurn}</span>
      </h3>
      {tail.length === 0 ? (
        <div className="chronicle-empty">The page is blank — no moves yet.</div>
      ) : (
        <ol>
          {tail.map(({ entry, turn }, i) =>
            renderLine(entry, turn, i, nameOf),
          )}
        </ol>
      )}
    </section>
  );
}
