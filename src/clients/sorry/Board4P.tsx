// src/clients/sorry/Board4P.tsx
// The Sorry! board surface, drawn inline as an SVG (parchment + Gamebox
// palette) — ported from the Claude Design "Cabinet" 4-player handoff.
//
// The board is drawn for all four sides (a/b/c/d) so it reads as a full
// 1950s-style Sorry box, but only sides a and c carry live pawns — the engine
// is 2-player (see plugins/sorry/plugin.js). board-geometry.js maps the live
// sides onto this same 16×16 / 100px / 1600px grid, so pawn overlays land
// exactly on the drawn cells.
//
//   a → red    (top-left start, safety down the left, home at mid-left)
//   b → green  (top-right start, safety along top, home at mid-top)      [decor]
//   c → blue   (bottom-right start, safety up the right, home at mid-right)
//   d → orange (bottom-left start, safety along bottom, home at mid-bottom)[decor]

const CELL = 100;
const N = 16;
const SIZE = N * CELL; // 1600
const CX = (col: number) => (col + 0.5) * CELL;
const CY = (row: number) => (row + 0.5) * CELL;

type Side = "a" | "b" | "c" | "d";
interface Palette {
  mid: string;
  deep: string;
  lite: string;
  ink: string;
}

export const SIDE_COLOR: Record<Side, Palette> = {
  a: { mid: "#b8332a", deep: "#6a1408", lite: "#d8645a", ink: "#fff5e8" },
  b: { mid: "#3e9a5c", deep: "#1a5a30", lite: "#7ac09a", ink: "#fff5e8" },
  c: { mid: "#2c647f", deep: "#163448", lite: "#6ba6c4", ink: "#fff5e8" },
  d: { mid: "#d4863a", deep: "#7a4a18", lite: "#e8b070", ink: "#fff5e8" },
};

// ── Safety zones — 5 cells each, ending adjacent to HOME ──────────────
export const SAFETY: Record<Side, { cells: [number, number][]; dir: "down" | "up" | "left" | "right" }> = {
  a: { cells: [[2, 1], [3, 1], [4, 1], [5, 1], [6, 1]], dir: "down" },
  b: { cells: [[1, 13], [1, 12], [1, 11], [1, 10], [1, 9]], dir: "left" },
  c: { cells: [[13, 14], [12, 14], [11, 14], [10, 14], [9, 14]], dir: "up" },
  d: { cells: [[14, 2], [14, 3], [14, 4], [14, 5], [14, 6]], dir: "right" },
};

export const START: Record<Side, { row: number; col: number }> = {
  a: { row: 2.5, col: 4 },
  b: { row: 4, col: 13.5 },
  c: { row: 13.5, col: 11 },
  d: { row: 11, col: 2.5 },
};

export const HOME: Record<Side, { row: number; col: number }> = {
  a: { row: 7.5, col: 1 },
  b: { row: 1, col: 8 },
  c: { row: 8.5, col: 14 },
  d: { row: 14, col: 7.5 },
};

// ── Slides — two per side along that color's edge ─────────────────────
const SLIDES: Record<Side, { from: [number, number]; to: [number, number] }[]> = {
  a: [{ from: [0, 2], to: [0, 5] }, { from: [0, 9], to: [0, 13] }],
  b: [{ from: [2, 15], to: [5, 15] }, { from: [9, 15], to: [13, 15] }],
  c: [{ from: [15, 13], to: [15, 10] }, { from: [15, 6], to: [15, 2] }],
  d: [{ from: [13, 0], to: [10, 0] }, { from: [6, 0], to: [2, 0] }],
};

function trackCells(): [number, number][] {
  const out: [number, number][] = [];
  for (let c = 0; c < N; c++) out.push([0, c]);
  for (let r = 1; r < N; r++) out.push([r, N - 1]);
  for (let c = N - 2; c >= 0; c--) out.push([N - 1, c]);
  for (let r = N - 2; r >= 1; r--) out.push([r, 0]);
  return out;
}

function starPath(cx: number, cy: number, r: number, points = 6): string {
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

function Slide({
  from,
  to,
  color,
}: {
  from: [number, number];
  to: [number, number];
  color: Palette;
}) {
  const [r1, c1] = from;
  const [r2, c2] = to;
  const x1 = CX(c1), y1 = CY(r1);
  const x2 = CX(c2), y2 = CY(r2);
  const arrowSize = 38;
  const dx = Math.sign(x2 - x1), dy = Math.sign(y2 - y1);
  const ex = x2 - dx * arrowSize;
  const ey = y2 - dy * arrowSize;
  let tri: string;
  if (dx === 1) tri = `${x2 - 4},${y2 - 32} ${x2 + 30},${y2} ${x2 - 4},${y2 + 32}`;
  else if (dx === -1) tri = `${x2 + 4},${y2 - 32} ${x2 - 30},${y2} ${x2 + 4},${y2 + 32}`;
  else if (dy === 1) tri = `${x2 - 32},${y2 - 4} ${x2},${y2 + 30} ${x2 + 32},${y2 - 4}`;
  else tri = `${x2 - 32},${y2 + 4} ${x2},${y2 - 30} ${x2 + 32},${y2 + 4}`;
  return (
    <g>
      <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={color.deep} strokeWidth="14" strokeLinecap="round" />
      <line x1={x1} y1={y1} x2={ex} y2={ey} stroke={color.mid} strokeWidth="8" strokeLinecap="round" />
      <circle cx={x1} cy={y1} r="20" fill={color.mid} stroke={color.deep} strokeWidth="3" />
      <circle cx={x1} cy={y1} r="6" fill={color.deep} />
      <polygon points={tri} fill={color.mid} stroke={color.deep} strokeWidth="3" strokeLinejoin="round" />
    </g>
  );
}

function SafetyZone({ side }: { side: Side }) {
  const sz = SAFETY[side];
  const color = SIDE_COLOR[side];
  const labelMap: Record<Side, { x: number; y: number; rot: number }> = {
    a: { x: CX(1), y: CY(4), rot: -90 },
    b: { x: CX(11), y: CY(1), rot: 0 },
    c: { x: CX(14), y: CY(11), rot: 90 },
    d: { x: CX(4), y: CY(14), rot: 0 },
  };
  const lbl = labelMap[side];
  return (
    <g>
      {sz.cells.map(([r, c], i) => (
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
      {sz.cells.map(([r, c], i) => {
        const cx = CX(c), cy = CY(r);
        const d = sz.dir;
        let path = "";
        if (d === "down") path = `M${cx - 14},${cy - 10} L${cx},${cy + 14} L${cx + 14},${cy - 10}`;
        if (d === "up") path = `M${cx - 14},${cy + 10} L${cx},${cy - 14} L${cx + 14},${cy + 10}`;
        if (d === "right") path = `M${cx - 10},${cy - 14} L${cx + 14},${cy} L${cx - 10},${cy + 14}`;
        if (d === "left") path = `M${cx + 10},${cy - 14} L${cx - 14},${cy} L${cx + 10},${cy + 14}`;
        return (
          <path
            key={`v-${i}`}
            d={path}
            fill="none"
            stroke={color.ink}
            strokeWidth="4"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />
        );
      })}
      <text
        x={lbl.x}
        y={lbl.y + 6}
        textAnchor="middle"
        fontSize="18"
        fontWeight="700"
        fontFamily='"Playfair Display", Georgia, serif'
        fill={color.deep}
        letterSpacing="0.32em"
        transform={lbl.rot ? `rotate(${lbl.rot} ${lbl.x} ${lbl.y})` : undefined}
      >
        SAFETY ZONE
      </text>
    </g>
  );
}

function StartCircle({ side }: { side: Side }) {
  const s = START[side];
  const color = SIDE_COLOR[side];
  const cx = CX(s.col), cy = CY(s.row);
  return (
    <g>
      <circle cx={cx} cy={cy} r="128" fill={color.mid} stroke={color.deep} strokeWidth="6" />
      <circle cx={cx} cy={cy} r="128" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2" />
      <circle cx={cx} cy={cy} r="112" fill="none" stroke={color.deep} strokeWidth="1" strokeDasharray="3 4" opacity="0.6" />
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        fontSize="32"
        fontWeight="800"
        fontFamily='"Playfair Display", Georgia, serif'
        fill={color.ink}
        letterSpacing="0.22em"
        style={{ textShadow: "0 2px 0 rgba(0,0,0,0.35)" }}
      >
        START
      </text>
    </g>
  );
}

function HomeStar({ side }: { side: Side }) {
  const h = HOME[side];
  const color = SIDE_COLOR[side];
  const cx = CX(h.col), cy = CY(h.row);
  return (
    <g>
      <path d={starPath(cx, cy, 78, 6)} fill="#1a1208" />
      <path d={starPath(cx, cy, 72, 6)} fill={color.mid} stroke={color.deep} strokeWidth="2" />
      <circle cx={cx} cy={cy} r="34" fill="#1a1208" />
      <text
        x={cx}
        y={cy + 6}
        textAnchor="middle"
        fontSize="16"
        fontWeight="800"
        fontFamily='"Playfair Display", Georgia, serif'
        fill={color.ink}
        letterSpacing="0.14em"
      >
        HOME
      </text>
    </g>
  );
}

const ALL_SIDES: Side[] = ["a", "b", "c", "d"];

export function Board4P() {
  const cells = trackCells();
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

      {ALL_SIDES.map((side) =>
        SLIDES[side].map((s, i) => <Slide key={`${side}-${i}`} {...s} color={SIDE_COLOR[side]} />),
      )}

      {ALL_SIDES.map((side) => <SafetyZone key={side} side={side} />)}
      {ALL_SIDES.map((side) => <HomeStar key={side} side={side} />)}
      {ALL_SIDES.map((side) => <StartCircle key={side} side={side} />)}

      <circle cx={SIZE / 2} cy={SIZE / 2} r="190" fill="#1a1208" />
      <circle cx={SIZE / 2} cy={SIZE / 2} r="180" fill="url(#medallion)" stroke="#8a6a2a" strokeWidth="3" />
      <text
        x={SIZE / 2}
        y={SIZE / 2 + 26}
        textAnchor="middle"
        fontSize="92"
        fontWeight="800"
        fontStyle="italic"
        fontFamily='"Playfair Display", Georgia, serif'
        fill="#7a1a08"
        letterSpacing="0.04em"
        style={{ textShadow: "2px 2px 0 rgba(0,0,0,0.18)" }}
      >
        SORRY!
      </text>
      <text
        x={SIZE / 2}
        y={SIZE / 2 - 100}
        textAnchor="middle"
        fontSize="14"
        fontWeight="700"
        fontFamily='"Playfair Display", Georgia, serif'
        fill="#5a3a18"
        letterSpacing="0.32em"
      >
        ·  GAMEBOX  ·
      </text>
      <text
        x={SIZE / 2}
        y={SIZE / 2 + 90}
        textAnchor="middle"
        fontSize="13"
        fontStyle="italic"
        fontFamily="Georgia, serif"
        fill="#5a3a18"
        letterSpacing="0.06em"
      >
        the slidy diagonal chasing game · for two to four
      </text>
    </svg>
  );
}
