// src/clients/risk/Board.tsx
// Antique campaign-map renderer — a fully vector parchment board with no
// base image. Bottom to top it draws: the parchment sea + grain, a faint
// graticule, decorative sea-route arcs, wood-grain continents with inked
// coastlines and a brass inlay band, then the interactive layer —
// targetable outlines, the selection glow, place-name labels, click
// hotspots, army tokens (which carry ownership color), and the from→to
// march arrow. Geometry and the
// antique palette come from ./map-geometry.js (ported from the Claude
// Design project "Improving Risk board map").
import type { RiskView } from "../shared/contracts/risk";
import { seatFill, seatInk } from "./themes";
import type { Pending } from "./ActionBar";
import {
  TERRITORIES,
  CONTINENTS_META,
  SEA_ROUTES,
  MAP_SIZE,
  MAP_VIEWBOX,
} from "./map-geometry.js";

export interface BoardProps {
  view: RiskView;
  onPick: (id: string) => void;
  selected: string | null;
  plan?: Pending["plan"];
  to?: string | null;
}

type Pt = number[]; // [x, y]
type Ring = Pt[];
type TerritoryGeom = {
  name: string;
  continent: string;
  label: { x: number; y: number };
  r: number;
  neighbors: string[];
  poly: Ring[];
  callout?: Pt;
};
type ContinentMeta = {
  name: string;
  bonus: number;
  color: string;
  paper: string;
  ink: string;
  label: { x: number; y: number; size: number };
  sil: Ring[];
};
type Route = { a: Pt; b: Pt; bow: number };

const T = TERRITORIES as Record<string, TerritoryGeom>;
const C = CONTINENTS_META as Record<string, ContinentMeta>;
const ROUTES = SEA_ROUTES as Route[];
const { w: MW, h: MH } = MAP_SIZE as { w: number; h: number };
const VB = MAP_VIEWBOX as { x: number; y: number; w: number; h: number };
const CONT_KEYS = Object.keys(C);

// Faint lat/long graticule across the whole canvas.
const GRID: { x1: number; y1: number; x2: number; y2: number }[] = [];
for (let i = 1; i < 5; i++) GRID.push({ x1: 0, y1: i * 160, x2: MW, y2: i * 160 });
for (let i = 1; i < 8; i++) GRID.push({ x1: i * 200, y1: 0, x2: i * 200, y2: MH });

function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}
// Largest landmass first, so small overlapping shapes (India over the
// Middle East landmass, archipelago islands) paint and hit-test on top.
const DRAW_ORDER = Object.keys(T).sort(
  (a, b) =>
    Math.max(...T[b].poly.map(ringArea)) - Math.max(...T[a].poly.map(ringArea)),
);

function ringD(ring: Ring): string {
  let d = `M ${ring[0][0]} ${ring[0][1]}`;
  for (let i = 1; i < ring.length; i++) d += ` L ${ring[i][0]} ${ring[i][1]}`;
  return d + " Z";
}
function polyD(poly: Ring[]): string {
  return poly.map(ringD).join(" ");
}

// Decorative sea-route arc — control point bowed perpendicular to a→b
// (mirrors the design's arc()). `bow` scales the bulge.
function bowArc(a: Pt, b: Pt, bow: number): string {
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const cx = (mx - dy * bow).toFixed(0);
  const cy = (my + dx * bow).toFixed(0);
  return `M ${a[0]} ${a[1]} Q ${cx} ${cy} ${b[0]} ${b[1]}`;
}

// Curved arc between two label points for the selected-source highlight.
function arcPath(
  a: { x: number; y: number },
  b: { x: number; y: number },
  bias = 0.16,
) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const mx = (a.x + b.x) / 2 + -uy * dist * bias;
  const my = (a.y + b.y) / 2 + ux * dist * bias;
  return `M ${a.x} ${a.y} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.x} ${b.y}`;
}

// Alaska↔Kamchatka is the antimeridian adjacency: two short arcs exiting
// opposite frame edges rather than one stretched span.
function wrapArcs(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  const left = a.x < b.x ? a : b;
  const right = a.x < b.x ? b : a;
  return [
    arcPath(left, { x: VB.x - 30, y: left.y }, -0.18),
    arcPath(right, { x: VB.x + VB.w + 30, y: right.y }, -0.18),
  ];
}

function ArmyToken({
  x,
  y,
  owner,
  armies,
  selected,
  colors,
}: {
  x: number;
  y: number;
  owner: number | null;
  armies: number;
  selected: boolean;
  colors?: number[];
}) {
  if (owner == null) return null;
  const fill = seatFill(owner, colors);
  const ink = seatInk(owner, colors);
  const stack = armies >= 10 ? 3 : armies >= 5 ? 2 : 1;
  const r = selected ? 18 : 14;
  return (
    <g transform={`translate(${x},${y})`} pointerEvents="none">
      {stack >= 3 && (
        <g transform="translate(-3.5,-3.5)">
          <circle r={r} fill={fill} stroke={ink} strokeWidth="1.2" opacity="0.85" />
        </g>
      )}
      {stack >= 2 && (
        <g transform="translate(-2,-2)">
          <circle r={r} fill={fill} stroke={ink} strokeWidth="1.2" opacity="0.92" />
        </g>
      )}
      <ellipse cx="0" cy={r + 2} rx={r * 0.92} ry="2.6" fill="#3c1e05" opacity="0.28" />
      <circle r={r} fill={fill} stroke={ink} strokeWidth="2" />
      <circle r={r} fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
      <path
        d={`M ${-r * 0.6} ${-r * 0.55} a ${r * 0.92} ${r * 0.92} 0 0 1 ${r * 1.2} 0`}
        fill="none"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1.1"
      />
      <text
        x="0"
        y={r >= 18 ? 6.5 : 5.5}
        textAnchor="middle"
        fontFamily="var(--serif-display)"
        fontWeight="800"
        fontSize={armies >= 10 ? (selected ? 17 : 14) : selected ? 18 : 15.5}
        fill="#fdf3d6"
        style={{ paintOrder: "stroke", stroke: "rgba(40,20,5,0.55)", strokeWidth: 0.8 }}
      >
        {armies}
      </text>
      {selected && (
        <circle r={r + 4} fill="none" stroke="var(--brass-2)" strokeWidth="2.2" opacity="0.95">
          <animate attributeName="r" values={`${r + 3};${r + 6};${r + 3}`} dur="1.4s" repeatCount="indefinite" />
        </circle>
      )}
    </g>
  );
}

export function Board({ view, onPick, selected, plan = {}, to = null }: BoardProps) {
  const selectedId = selected ?? null;
  const targetable = new Set<string>();
  if (selectedId && view.phase === "attack" && T[selectedId]) {
    for (const n of T[selectedId].neighbors) {
      const t = view.territories[n];
      if (t && t.owner !== view.youAre) targetable.add(n);
    }
  }

  // Selected-source adjacency arcs (drawn brighter than the static routes).
  const seaEdgesForSelected = (() => {
    if (!selectedId || !T[selectedId]) return [];
    const a = T[selectedId].label;
    return T[selectedId].neighbors.map((n) => {
      const b = T[n].label;
      const dx = b.x - a.x;
      const wrap = Math.abs(dx) > MW * 0.55;
      const enemy =
        view.phase === "attack" &&
        view.territories[n]?.owner != null &&
        view.territories[n]?.owner !== view.youAre;
      return { id: n, a, b, wrap, enemy };
    });
  })();

  return (
    <div className="map-frame">
      <span className="map-corner-screw tl" />
      <span className="map-corner-screw tr" />
      <span className="map-corner-screw bl" />
      <span className="map-corner-screw br" />
      <div className="map-mat">
        <div className="map-inlay">
          <svg
            className="risk-map"
            viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
            xmlns="http://www.w3.org/2000/svg"
            preserveAspectRatio="xMidYMid meet"
          >
            <defs>
              <radialGradient id="r-sea" cx="50%" cy="40%" r="78%">
                <stop offset="0%" stopColor="#f6e8c4" />
                <stop offset="55%" stopColor="#ecd9a8" />
                <stop offset="100%" stopColor="#d6bb84" />
              </radialGradient>
              <filter id="r-grain">
                <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" result="n" />
                <feColorMatrix
                  in="n"
                  values="0 0 0 0 0.36  0 0 0 0 0.24  0 0 0 0 0.08  0 0 0 0.07 0"
                />
              </filter>
              <filter id="r-wood" x="-4%" y="-4%" width="108%" height="108%">
                <feTurbulence type="fractalNoise" baseFrequency="0.016 0.17" numOctaves="5" seed="11" result="wn" />
                <feColorMatrix in="wn" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" result="wg" />
                <feComposite in="wg" in2="SourceGraphic" operator="in" result="wgc" />
                <feMerge>
                  <feMergeNode in="SourceGraphic" />
                  <feMergeNode in="wgc" />
                </feMerge>
              </filter>
              <filter id="r-wood-v" x="-4%" y="-4%" width="108%" height="108%">
                <feTurbulence type="fractalNoise" baseFrequency="0.17 0.016" numOctaves="5" seed="17" result="wn" />
                <feColorMatrix in="wn" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 0.5 0" result="wg" />
                <feComposite in="wg" in2="SourceGraphic" operator="in" result="wgc" />
                <feMerge>
                  <feMergeNode in="SourceGraphic" />
                  <feMergeNode in="wgc" />
                </feMerge>
              </filter>
              <filter id="r-line-shadow" x="-15%" y="-15%" width="130%" height="130%">
                <feDropShadow dx="0" dy="0.7" stdDeviation="0.5" floodColor="#160b03" floodOpacity="0.4" />
              </filter>
            </defs>

            {/* Parchment sea + grain */}
            <rect x="0" y="0" width={MW} height={MH} fill="url(#r-sea)" />
            <rect x="0" y="0" width={MW} height={MH} filter="url(#r-grain)" pointerEvents="none" />

            {/* Graticule */}
            <g stroke="#9a7038" strokeWidth="0.5" opacity="0.34" pointerEvents="none">
              {GRID.map((d, i) => (
                <line key={`g${i}`} x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} />
              ))}
            </g>

            {/* Decorative sea routes */}
            <g
              className="routes"
              fill="none"
              stroke="#6a4424"
              strokeWidth="1.6"
              strokeDasharray="6 6"
              strokeLinecap="round"
              opacity="0.55"
              pointerEvents="none"
            >
              {ROUTES.map((r, i) => (
                <path key={`r${i}`} d={bowArc(r.a, r.b, r.bow)} />
              ))}
            </g>

            {/* Continent landmass base fill */}
            <g className="land-fill" pointerEvents="none">
              {CONT_KEYS.map((k) =>
                C[k].sil.map((ring, i) => (
                  <path key={`lf-${k}-${i}`} d={ringD(ring)} fill={C[k].paper} stroke="none" />
                )),
              )}
            </g>

            {/* Territory wood-grain fills */}
            <g className="terr-fill" pointerEvents="none">
              {DRAW_ORDER.map((id, i) => (
                <path
                  key={`tf-${id}`}
                  d={polyD(T[id].poly)}
                  fill={C[T[id].continent].paper}
                  filter={i % 2 ? "url(#r-wood-v)" : "url(#r-wood)"}
                  stroke="none"
                />
              ))}
            </g>

            {/* Targetable enemy wash (attack phase) */}
            <g className="target-wash" pointerEvents="none">
              {[...targetable].map((id) => (
                <path key={`tw-${id}`} d={polyD(T[id].poly)} fill="#a13b2a" opacity="0.2" />
              ))}
            </g>

            {/* Territory seams */}
            <g className="terr-borders" fill="none" filter="url(#r-line-shadow)" pointerEvents="none">
              {DRAW_ORDER.map((id) => (
                <path
                  key={`tb-${id}`}
                  d={polyD(T[id].poly)}
                  stroke="#e7dab4"
                  strokeWidth="1"
                  strokeLinejoin="round"
                  opacity="0.7"
                />
              ))}
            </g>

            {/* Inked coastlines + brass inlay band */}
            <g className="coast" fill="none" pointerEvents="none">
              {CONT_KEYS.map((k) =>
                C[k].sil.map((ring, i) => (
                  <path key={`cs-${k}-${i}`} d={ringD(ring)} stroke={C[k].ink} strokeWidth="2.2" strokeLinejoin="round" />
                )),
              )}
            </g>
            <g className="inlay-band" fill="none" opacity="0.4" pointerEvents="none">
              {CONT_KEYS.map((k) =>
                C[k].sil.map((ring, i) => (
                  <path key={`ib-${k}-${i}`} d={ringD(ring)} stroke="#caa24f" strokeWidth="0.8" />
                )),
              )}
            </g>

            {/* Selection glow + targetable outlines */}
            {selectedId && T[selectedId] && (
              <path
                className="sel-glow"
                d={polyD(T[selectedId].poly)}
                fill="#fbe79a"
                fillOpacity="0.18"
                stroke="var(--brass-2)"
                strokeWidth="3"
                strokeLinejoin="round"
                pointerEvents="none"
              />
            )}
            <g className="targets" fill="none" pointerEvents="none">
              {[...targetable].map((id) => (
                <path key={`tg-${id}`} d={polyD(T[id].poly)} stroke="#a13b2a" strokeWidth="2.4" strokeLinejoin="round" strokeDasharray="7 5">
                  <animate attributeName="stroke-dashoffset" from="0" to="-24" dur="1.1s" repeatCount="indefinite" />
                </path>
              ))}
            </g>

            {/* Selected-source adjacency arcs */}
            {selectedId && (
              <g className="edges-selected" pointerEvents="none">
                {seaEdgesForSelected.map(({ id, a, b, wrap, enemy }) => {
                  const paths = wrap ? wrapArcs(a, b) : [arcPath(a, b)];
                  const stroke = enemy ? "#a13b2a" : "#5a3a1f";
                  const halo = "rgba(251,232,160,0.85)";
                  return (
                    <g key={`edge-${id}`}>
                      {paths.map((d, i) => (
                        <g key={i}>
                          <path d={d} stroke={halo} strokeWidth="6" fill="none" strokeLinecap="round" />
                          <path d={d} stroke={stroke} strokeWidth="3" strokeDasharray="7 5" strokeLinecap="round" fill="none">
                            <animate attributeName="stroke-dashoffset" from="0" to="-26" dur="1.3s" repeatCount="indefinite" />
                          </path>
                        </g>
                      ))}
                    </g>
                  );
                })}
              </g>
            )}

            {/* Callout leader lines for ocean-placed place names */}
            <g className="leaders" pointerEvents="none">
              {Object.entries(T)
                .filter(([, g]) => g.callout)
                .map(([id, g]) => {
                  const [cx, cy] = g.callout as [number, number];
                  return (
                    <g key={`ld-${id}`}>
                      <line x1={cx} y1={cy - 5} x2={g.label.x} y2={g.label.y} stroke="#4a2f14" strokeWidth="1" opacity="0.6" />
                      <circle cx={cx} cy={cy - 5} r="1.7" fill="#4a2f14" opacity="0.75" />
                    </g>
                  );
                })}
            </g>

            {/* Territory place names */}
            <g className="terr-labels" pointerEvents="none">
              {Object.entries(T).map(([id, g]) => {
                const onOcean = !!g.callout;
                const lx = onOcean ? g.callout![0] : g.label.x;
                const ly = onOcean ? g.callout![1] : g.label.y + 28;
                const style = onOcean
                  ? { paintOrder: "stroke" as const, stroke: "#f4e9ca", strokeWidth: 1 }
                  : { paintOrder: "stroke" as const, stroke: "rgba(16,9,3,0.92)", strokeWidth: 1.7 };
                return (
                  <text
                    key={`tl-${id}`}
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    fontFamily="var(--serif-map-sc)"
                    fontSize="15.5"
                    fontWeight="600"
                    letterSpacing="0.2"
                    fill={onOcean ? "#22150a" : "#f7eccf"}
                    style={style}
                  >
                    {g.name}
                  </text>
                );
              })}
            </g>

            {/* Click hotspots — transparent polygon per territory */}
            <g className="hotspots">
              {DRAW_ORDER.map((id) => {
                const g = T[id];
                const isSel = id === selectedId;
                const isTarget = targetable.has(id);
                return (
                  <path
                    key={`hit-${id}`}
                    className={`region clickable${isSel ? " sel" : ""}${isTarget ? " targetable" : ""}`}
                    d={polyD(g.poly)}
                    fill="transparent"
                    data-pick={id}
                    style={{ cursor: "pointer" }}
                    onClick={() => onPick(id)}
                  >
                    <title>{g.name}</title>
                  </path>
                );
              })}
            </g>

            {/* Army tokens + queued deploy "+k" */}
            <g className="armies" pointerEvents="none">
              {Object.entries(T).map(([id, g]) => {
                const t = view.territories[id];
                if (!t) return null;
                const isSel = id === selectedId;
                const planned = plan?.[id];
                return (
                  <g key={`tok-${id}`}>
                    <ArmyToken x={g.label.x} y={g.label.y} owner={t.owner} armies={t.armies} selected={isSel} colors={view.colors} />
                    {planned ? (
                      <text
                        x={g.label.x + 24}
                        y={g.label.y - 12}
                        textAnchor="middle"
                        fontFamily="var(--serif-display)"
                        fontWeight="900"
                        fontSize="17"
                        fill="var(--brass-1)"
                        style={{ paintOrder: "stroke", stroke: "#2a1810", strokeWidth: 3 }}
                      >
                        {`+${planned}`}
                      </text>
                    ) : null}
                  </g>
                );
              })}
            </g>

            {/* March arrow — from → to during attack/fortify */}
            {selectedId && to && T[selectedId] && T[to] && (() => {
              const a = T[selectedId].label;
              const b = T[to].label;
              const dx = b.x - a.x;
              const dy = b.y - a.y;
              const dist = Math.hypot(dx, dy) || 1;
              const ux = dx / dist;
              const uy = dy / dist;
              const radA = T[selectedId].r * 0.6;
              const radB = T[to].r * 0.6;
              const ax = a.x + ux * radA;
              const ay = a.y + uy * radA;
              const bx = b.x - ux * radB;
              const by = b.y - uy * radB;
              const mx = (ax + bx) / 2 + -uy * dist * 0.16;
              const my = (ay + by) / 2 + ux * dist * 0.16;
              const path = `M ${ax} ${ay} Q ${mx} ${my} ${bx} ${by}`;
              const action = view.phase === "attack" ? "#a13b2a" : "#1f4e6e";
              return (
                <g className="march-arrow" pointerEvents="none">
                  <defs>
                    <marker id="r-march-head" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="6" markerHeight="6" orient="auto">
                      <path d="M 0 0 L 12 6 L 0 12 L 3 6 Z" fill={action} stroke="#2a1810" strokeWidth="0.6" strokeLinejoin="round" />
                    </marker>
                  </defs>
                  <path d={path} stroke="#fbf2d6" strokeWidth="10" fill="none" opacity="0.78" strokeLinecap="round" />
                  <path d={path} stroke={action} strokeWidth="4" fill="none" strokeLinecap="round" markerEnd="url(#r-march-head)" strokeDasharray="10 6">
                    <animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1.3s" repeatCount="indefinite" />
                  </path>
                </g>
              );
            })()}
          </svg>
          <div className="map-inner-shadow" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}
