// src/clients/risk/Header.tsx
// Wood plank header with brass RISK plate, leather phase tag, faction
// crest card, and exit controls — antique campaign-map theme handoff.
import type { RiskView } from "../shared/contracts/risk";
import { ExitControls } from "./ExitControls";
import { MuteToggle } from "./MuteToggle";

interface Props {
  view: RiskView;
  factionName: string;
  factionColor?: string | null;
  // Display names by seat (multiplayer roster strip).
  seatNames?: (string | undefined)[];
  onResign: () => void;
}

const PHASE_LABEL: Record<string, string> = {
  setup: "Setup",
  reinforce: "Reinforce",
  attack: "Attack",
  fortify: "Fortify",
  gameover: "Endgame",
};

function CrestSvg({ color }: { color: string }) {
  // Derive a darker ink from any hex by clamping to a fixed dark tone —
  // we draw the outline against the player tint regardless of source.
  const dark = "#1a0e08";
  return (
    <span className="crest" aria-hidden="true">
      <svg viewBox="0 0 24 24" width="22" height="22">
        <path
          d="M 12 2 L 22 6 V 14 q 0 5 -10 8 q -10 -3 -10 -8 V 6 z"
          fill={color}
          stroke={dark}
          strokeWidth="1"
        />
        <path d="M 12 6 v 12 M 4 9 h 16" stroke={dark} strokeWidth="1" />
        <circle cx="12" cy="11" r="2.6" fill="#fbe79a" stroke={dark} strokeWidth="0.8" />
      </svg>
    </span>
  );
}

function SeatStrip({ view, seatNames }: { view: RiskView; seatNames?: (string | undefined)[] }) {
  const seats = view.seats ?? [];
  if (seats.length <= 2) return null;
  const tallies = seats.map((_, seat) => {
    let terr = 0, armies = 0;
    for (const t of Object.values(view.territories)) {
      if (t.owner === seat) { terr += 1; armies += t.armies; }
    }
    return { terr, armies };
  });
  return (
    <div className="seat-strip" aria-label="players">
      {seats.map((_, seat) => {
        const dead = view.eliminated?.[seat] === true;
        const current = view.currentPlayer === seat && !dead;
        const name = seatNames?.[seat] ?? `Player ${seat + 1}`;
        const cards = view.cardCounts?.[seat] ?? 0;
        return (
          <span key={seat} className={`seat-chip${current ? " current" : ""}${dead ? " dead" : ""}`}>
            <span className="dot" style={{ background: `var(--p${seat}-1)` }} />
            <span>{name}{seat === view.youAre ? " (you)" : ""}</span>
            {!dead && (
              <span className="tally">{`${tallies[seat].terr}t · ${tallies[seat].armies}a · ${cards}c`}</span>
            )}
          </span>
        );
      })}
    </div>
  );
}

export function Header({ view, factionName, factionColor, seatNames, onResign }: Props) {
  const yourMove = view.youAre === view.currentPlayer;
  const phaseLabel = PHASE_LABEL[view.phase] ?? view.phase;
  const pipClass = `p${view.currentPlayer}`;
  const crestColor = factionColor || `var(--p${view.youAre ?? 0}-1)`;
  // Test contract: a "Phase: <phase>" substring must remain in the DOM.
  // We keep the lowercase phase id alongside the display label so the
  // existing /phase: attack/i assertions stay green.
  return (
    <header className="risk-header">
      <span className="screw tl" />
      <span className="screw tr" />
      <span className="screw bl" />
      <span className="screw br" />
      <div className="brass-plate">
        <span className="rivet tl" />
        <span className="rivet tr" />
        <span className="rivet bl" />
        <span className="rivet br" />
        <span className="star">✦</span>
        <span>RISK</span>
        <span className="star">✦</span>
      </div>
      <div className="phase-tag" aria-live="polite">
        <span className={`turn-pip ${pipClass}`} />
        {`Phase: ${view.phase}`}
        <span className="phase-divider">·</span>
        <span className="phase-name">{phaseLabel}</span>
        <span className="phase-divider">·</span>
        {yourMove ? "Your move" : "Awaiting opponent"}
      </div>
      <div className="faction-card">
        <CrestSvg color={crestColor} />
        <span>{factionName}</span>
      </div>
      <span className="header-controls">
        <MuteToggle />
        <ExitControls onResign={onResign} />
      </span>
      <SeatStrip view={view} seatNames={seatNames} />
    </header>
  );
}
