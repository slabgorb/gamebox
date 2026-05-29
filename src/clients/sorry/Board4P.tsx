// src/clients/sorry/Board4P.tsx
// The Sorry! board surface, drawn inline as an SVG — the canonical pinwheel from
// the approved brainstorm mock (._mock_gen_reference.js). One reference side
// (start circle, 5-cell safety lane climbing to a home star, two edge slides)
// is rotated 90°×k for the four seats:
//
//   top    (k=0) → blue   — engine side a, the opponent
//   right  (k=1) → green  — decorative
//   bottom (k=2) → red    — engine side b, "you" (viewer anchored here)
//   left   (k=3) → orange — decorative
//
// The whole surface is rotated per viewer (Board.tsx) so the human's colour is
// always at the bottom; every text label counter-rotates by -rotation so it
// reads upright regardless of the flip (the brainstorm chose upright labels over
// per-seat flipping). HOME stars carry no label.
//
// Live slides (top/bottom edges) are derived from the engine geometry
// (slideSegments) so a painted arrow always sits on a square that actually
// slides; the decorative side edges (green/orange) carry illustrative slides
// only — they never host live pawns.
import { slideSegments } from "./board-geometry.js";

const CELL = 100;
const N = 16;
const SIZE = N * CELL; // 1600
const MID = (N - 1) / 2; // 7.5, the rotation centre in cell coords
const CX = (col: number) => (col + 0.5) * CELL;
const CY = (row: number) => (row + 0.5) * CELL;

interface Palette {
  mid: string;
  deep: string;
  lite: string;
  ink: string;
}

const BLUE: Palette = { mid: "#2c647f", deep: "#163448", lite: "#6ba6c4", ink: "#fff5e8" };
const GREEN: Palette = { mid: "#3e9a5c", deep: "#1a5a30", lite: "#7ac09a", ink: "#fff5e8" };
const RED: Palette = { mid: "#b8332a", deep: "#6a1408", lite: "#d8645a", ink: "#fff5e8" };
const ORANGE: Palette = { mid: "#d4863a", deep: "#7a4a18", lite: "#e8b070", ink: "#fff5e8" };

interface Cell {
  row: number;
  col: number;
}

// Rotate a cell 90°×k clockwise about the board centre (7.5, 7.5), matching the
// mock's rot(): col' = 7.5 + dc·cos - dr·sin, row' = 7.5 + dc·sin + dr·cos.
function rot({ row, col }: Cell, k: number): Cell {
  const dc = col - MID;
  const dr = row - MID;
  const co = [1, 0, -1, 0][k & 3];
  const si = [0, 1, 0, -1][k & 3];
  return {
    col: round(MID + dc * co - dr * si),
    row: round(MID + dc * si + dr * co),
  };
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

// Reference-side furniture, in the top-seat (k=0) frame.
const REF = {
  start: { row: 2.6, col: 4 } as Cell,
  home: { row: 6.6, col: 1 } as Cell,
  safety: [1, 2, 3, 4, 5].map((r) => ({ row: r, col: 1 }) as Cell),
  label: { row: 2.6 - 0.96, col: 4 } as Cell, // lifted above the start cluster
  // Illustrative slides for the decorative side edges only.
  slides: [
    { from: { row: 0, col: 5 } as Cell, to: { row: 0, col: 8 } as Cell },
    { from: { row: 0, col: 10 } as Cell, to: { row: 0, col: 14 } as Cell },
  ],
};

type SeatKey = "top" | "right" | "bottom" | "left";
interface Seat {
  key: SeatKey;
  k: number;
}
const SEATS: Seat[] = [
  { key: "top", k: 0 },
  { key: "right", k: 1 },
  { key: "bottom", k: 2 },
  { key: "left", k: 3 },
];

// Seat colour is viewer-relative. The side edges are always decorative
// green/orange; the two live edges (top = engine a, bottom = engine b) are red
// for the viewer's seat and blue for the opponent's, so the seat circle always
// matches the colour of the pawns sitting on it.
function seatPalette(key: SeatKey, redSeat: SeatKey): Palette {
  if (key === "right") return GREEN;
  if (key === "left") return ORANGE;
  return key === redSeat ? RED : BLUE;
}

// Per-seat furniture, computed by rotating the reference. Exported (START/HOME/
// SAFETY) so the geometry drift guard can assert the overlay stays aligned with
// what is drawn — engine a maps to the top seat, engine b to the bottom seat.
export const START: Record<SeatKey, Cell> = Object.fromEntries(
  SEATS.map((s) => [s.key, rot(REF.start, s.k)]),
) as Record<SeatKey, Cell>;
export const HOME: Record<SeatKey, Cell> = Object.fromEntries(
  SEATS.map((s) => [s.key, rot(REF.home, s.k)]),
) as Record<SeatKey, Cell>;
export const SAFETY: Record<SeatKey, { cells: [number, number][] }> = Object.fromEntries(
  SEATS.map((s) => [s.key, { cells: REF.safety.map((c) => { const r = rot(c, s.k); return [r.row, r.col] as [number, number]; }) }]),
) as Record<SeatKey, { cells: [number, number][] }>;

function trackCells(): [number, number][] {
  const out: [number, number][] = [];
  for (let c = 0; c < N; c++) out.push([0, c]);
  for (let r = 1; r < N; r++) out.push([r, N - 1]);
  for (let c = N - 2; c >= 0; c--) out.push([N - 1, c]);
  for (let r = N - 2; r >= 1; r--) out.push([r, 0]);
  return out;
}

function starPath(cx: number, cy: number, r: number, points = 5): string {
  const inner = r * 0.5;
  const pts: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = (Math.PI / points) * i - Math.PI / 2;
    const rr = i % 2 === 0 ? r : inner;
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr]);
  }
  return (
    pts
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" ") + " Z"
  );
}

function Slide({ from, to, color }: { from: Cell; to: Cell; color: Palette }) {
  const x1 = CX(from.col), y1 = CY(from.row);
  const x2 = CX(to.col), y2 = CY(to.row);
  const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
  const arrowSize = 34;
  const ex = x2 - dx * arrowSize;
  const ey = y2 - dy * arrowSize;
  let tri: string;
  if (dx === 1) tri = `${x2 - 6},${y2 - 30} ${x2 + 26},${y2} ${x2 - 6},${y2 + 30}`;
  else if (dx === -1) tri = `${x2 + 6},${y2 - 30} ${x2 - 26},${y2} ${x2 + 6},${y2 + 30}`;
  else if (dy === 1) tri = `${x2 - 30},${y2 - 6} ${x2},${y2 + 26} ${x2 + 30},${y2 - 6}`;
  else tri = `${x2 - 30},${y2 + 6} ${x2},${y2 - 26} ${x2 + 30},${y2 + 6}`;
  return (
    <g>
      <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={color.deep} strokeWidth="16" strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={color.mid} strokeWidth="9" strokeLinecap="round" />
      <circle cx={x1} cy={y1} r="22" fill={color.mid} stroke={color.deep} strokeWidth="3" />
      <circle cx={x1} cy={y1} r="6" fill={color.deep} />
      <polygon points={tri} fill={color.mid} stroke={color.deep} strokeWidth="3" strokeLinejoin="round" />
    </g>
  );
}

function SafetyLane({ seat, color }: { seat: Seat; color: Palette }) {
  return (
    <g>
      {SAFETY[seat.key].cells.map(([r, c], i) => (
        <rect
          key={i}
          x={c * CELL + 8}
          y={r * CELL + 8}
          width={CELL - 16}
          height={CELL - 16}
          fill={color.mid}
          stroke={color.deep}
          strokeWidth="4"
          rx="6"
        />
      ))}
    </g>
  );
}

function HomeStar({ seat, color }: { seat: Seat; color: Palette }) {
  const h = HOME[seat.key];
  const cx = CX(h.col), cy = CY(h.row);
  return (
    <g>
      <path d={starPath(cx, cy, 76, 5)} fill="#1a1208" />
      <path d={starPath(cx, cy, 70, 5)} fill={color.mid} stroke={color.deep} strokeWidth="3" />
      <circle cx={cx} cy={cy} r="22" fill="#1a1208" />
      <circle cx={cx} cy={cy} r="22" fill="none" stroke={color.lite} strokeWidth="2" opacity="0.5" />
    </g>
  );
}

function StartCircle({ seat, color }: { seat: Seat; color: Palette }) {
  const s = START[seat.key];
  const cx = CX(s.col), cy = CY(s.row);
  return (
    <g>
      <circle data-testid={`start-circle-${seat.key}`} cx={cx} cy={cy} r="135" fill={color.mid} stroke={color.deep} strokeWidth="6" />
      <circle cx={cx} cy={cy} r="135" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
      <circle cx={cx} cy={cy} r="118" fill="none" stroke={color.deep} strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
    </g>
  );
}

// Upright START label, positioned above each seat's start circle. The glyph is
// always upright; it counter-rotates by -rotation to survive the board flip.
function StartLabel({ seat, color, rotation }: { seat: Seat; color: Palette; rotation: number }) {
  const p = rot(REF.label, seat.k);
  const x = CX(p.col), y = CY(p.row);
  return (
    <text
      data-testid={`start-label-${seat.key}`}
      x={x}
      y={y}
      textAnchor="middle"
      dominantBaseline="central"
      fontSize="28"
      fontWeight="800"
      fontFamily='"Playfair Display", Georgia, serif'
      fill={color.ink}
      letterSpacing="0.16em"
      transform={`rotate(${-rotation} ${x} ${y})`}
      style={{ textShadow: "0 2px 0 rgba(0,0,0,0.35)" }}
    >
      START
    </text>
  );
}

// Engine-derived live slides (top & bottom edges), coloured by the seat that
// owns the edge they sit on — top edge takes the top seat's colour, bottom edge
// the bottom seat's, so a slide always matches the pawns that travel it.
function liveSlides(redSeat: SeatKey) {
  return slideSegments().map((s) => ({
    from: { row: s.from[0], col: s.from[1] } as Cell,
    to: { row: s.to[0], col: s.to[1] } as Cell,
    color: seatPalette(s.from[0] === 0 ? "top" : "bottom", redSeat),
  }));
}

// Decorative slides for the side (green/orange) seats — illustrative only,
// rotated from the reference. These edges never carry live pawns.
function decorSlides() {
  const out: { from: Cell; to: Cell; color: Palette }[] = [];
  for (const seat of SEATS) {
    if (seat.key !== "left" && seat.key !== "right") continue;
    const color = seatPalette(seat.key, "bottom");
    for (const s of REF.slides) {
      out.push({ from: rot(s.from, seat.k), to: rot(s.to, seat.k), color });
    }
  }
  return out;
}

export function Board4P({ rotation = 0, redSeat = "bottom" }: { rotation?: number; redSeat?: SeatKey }) {
  const cells = trackCells();
  const pal = (key: SeatKey) => seatPalette(key, redSeat);
  return (
    <svg
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="board-svg"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="parchment" cx="50%" cy="40%" r="80%">
          <stop offset="0%" stopColor="#f7ebc8" />
          <stop offset="65%" stopColor="#e6d4a2" />
          <stop offset="100%" stopColor="#c8b072" />
        </radialGradient>
        <radialGradient id="medallion" cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor="#fff5d8" />
          <stop offset="55%" stopColor="#f3e5b6" />
          <stop offset="100%" stopColor="#c8a868" />
        </radialGradient>
        <filter id="boardNoise" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="4" />
          <feColorMatrix values="0 0 0 0 0.4  0 0 0 0 0.28  0 0 0 0 0.12  0 0 0 0.22 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>

      <rect width={SIZE} height={SIZE} fill="url(#parchment)" />
      <rect width={SIZE} height={SIZE} fill="transparent" filter="url(#boardNoise)" opacity="0.5" />

      {[[180, 220], [1420, 180], [260, 1450], [1380, 1380], [820, 250], [1450, 820], [820, 1400], [250, 820]].map(
        ([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={6 + (i % 3) * 2} fill="#7a4818" opacity={0.18} />
        ),
      )}

      <rect x="20" y="20" width={SIZE - 40} height={SIZE - 40} fill="none" stroke="#1a1208" strokeWidth="3" />
      <rect x="30" y="30" width={SIZE - 60} height={SIZE - 60} fill="none" stroke="#1a1208" strokeWidth="1" />

      {cells.map(([r, c], i) => (
        <rect
          key={i}
          x={c * CELL + 4}
          y={r * CELL + 4}
          width={CELL - 8}
          height={CELL - 8}
          fill="#f7eccb"
          stroke="#1a1208"
          strokeWidth="3"
          rx="3"
        />
      ))}

      {decorSlides().map((s, i) => (
        <Slide key={`decor-slide-${i}`} from={s.from} to={s.to} color={s.color} />
      ))}
      {liveSlides(redSeat).map((s, i) => (
        <Slide key={`slide-${i}`} from={s.from} to={s.to} color={s.color} />
      ))}

      {SEATS.map((seat) => <SafetyLane key={`safe-${seat.key}`} seat={seat} color={pal(seat.key)} />)}
      {SEATS.map((seat) => <HomeStar key={`home-${seat.key}`} seat={seat} color={pal(seat.key)} />)}
      {SEATS.map((seat) => <StartCircle key={`start-${seat.key}`} seat={seat} color={pal(seat.key)} />)}
      {SEATS.map((seat) => <StartLabel key={`label-${seat.key}`} seat={seat} color={pal(seat.key)} rotation={rotation} />)}

      {/* Neutral centre chrome — counter-rotates so the wordmark never flips. */}
      <g
        data-testid="board-medallion"
        transform={`rotate(${-rotation} ${SIZE / 2} ${SIZE / 2})`}
      >
        <circle cx={SIZE / 2} cy={SIZE / 2} r="186" fill="#1a1208" />
        <circle cx={SIZE / 2} cy={SIZE / 2} r="176" fill="url(#medallion)" stroke="#8a6a2a" strokeWidth="3" />
        <text
          x={SIZE / 2}
          y={SIZE / 2 - 28}
          textAnchor="middle"
          fontSize="17"
          fontWeight="700"
          fontFamily='"Playfair Display", Georgia, serif'
          fill="#5a3a18"
          letterSpacing="0.4em"
        >
          GAMEBOX
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 24}
          textAnchor="middle"
          fontSize="64"
          fontWeight="800"
          fontStyle="italic"
          fontFamily='"Playfair Display", Georgia, serif'
          fill="#7a1a08"
          letterSpacing="0.02em"
          style={{ textShadow: "2px 2px 0 rgba(0,0,0,0.18)" }}
        >
          SORRY!
        </text>
        <text
          x={SIZE / 2}
          y={SIZE / 2 + 64}
          textAnchor="middle"
          fontSize="13"
          fontStyle="italic"
          fontFamily="Georgia, serif"
          fill="#5a3a18"
          letterSpacing="0.06em"
        >
          the slidy diagonal chasing game
        </text>
      </g>
    </svg>
  );
}
