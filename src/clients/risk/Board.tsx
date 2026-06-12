// src/clients/risk/Board.tsx
// Parchment world-map renderer. The base image (risk-map.jpg) already
// inks the territory borders, placenames, continent banners, and the
// "ARMIES OF RISK" legend strip; this SVG overlay paints only:
//   - faint owner-tint discs behind each held territory
//   - circular hit targets (the base map shows the borders)
//   - sea-route adjacency arcs (always for the selected source)
//   - army tokens with brass rims and stacking shadows
//   - the from→to march arrow during attack/fortify
//   - opaque legend overlays atop the printed key with held-state pips
import type { RiskView } from "../shared/contracts/risk";
import { seatFill, seatInk } from "./themes";
import type { Pending } from "./ActionBar";
import {
  TERRITORIES,
  CONTINENTS_META,
  LEGEND_LAYOUT,
  MAP_IMAGE,
  MAP_SIZE,
} from "./map-geometry.js";

export interface BoardProps {
  view: RiskView;
  onPick: (id: string) => void;
  selected: string | null;
  plan?: Pending["plan"];
  to?: string | null;
}

type TerritoryGeom = {
  name: string;
  continent: string;
  label: { x: number; y: number };
  r: number;
  neighbors: string[];
};
type ContinentMeta = { name: string; bonus: number; color: string };
type LegendBox = { x: number; y: number; w: number; h: number };

const T = TERRITORIES as Record<string, TerritoryGeom>;
const C = CONTINENTS_META as Record<string, ContinentMeta>;
const L = LEGEND_LAYOUT as Record<string, LegendBox>;
const { w: MW, h: MH } = MAP_SIZE as { w: number; h: number };

// Curved arc from a→b. `bias` controls perpendicular bulge.
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

// Alaska↔Kamchatka is the antimeridian adjacency: draw as two short
// arcs exiting opposite map edges instead of one stretched arc across
// the whole board.
function wrapArcs(
  a: { x: number; y: number },
  b: { x: number; y: number },
  mapW: number,
) {
  const left = a.x < b.x ? a : b;
  const right = a.x < b.x ? b : a;
  return [
    arcPath(left, { x: -30, y: left.y }, -0.18),
    arcPath(right, { x: mapW + 30, y: right.y }, -0.18),
  ];
}

function ArmyToken({
  x,
  y,
  owner,
  armies,
  selected,
}: {
  x: number;
  y: number;
  owner: number | null;
  armies: number;
  selected: boolean;
}) {
  if (owner == null) return null;
  const fill = seatFill(owner);
  const ink = seatInk(owner);
  const stack = armies >= 10 ? 3 : armies >= 5 ? 2 : 1;
  const r = selected ? 21 : 17;
  return (
    <g transform={`translate(${x},${y})`} pointerEvents="none">
      {stack >= 3 && (
        <g transform="translate(-4,-4)">
          <circle r={r} fill={fill} stroke={ink} strokeWidth="1.3" opacity="0.85" />
        </g>
      )}
      {stack >= 2 && (
        <g transform="translate(-2.5,-2.5)">
          <circle r={r} fill={fill} stroke={ink} strokeWidth="1.3" opacity="0.92" />
        </g>
      )}
      <ellipse cx="1.5" cy={r + 2.5} rx={r * 0.85} ry="2.4" fill="#2a1810" opacity="0.4" />
      <circle r={r} fill={fill} stroke={ink} strokeWidth="1.8" />
      <circle r={r - 4} fill="none" stroke="#fbe79a" strokeWidth="1" opacity="0.7" />
      <circle r={r - 4} fill="none" stroke="#2a1810" strokeWidth="0.4" opacity="0.5" />
      <path
        d={`M ${-r * 0.62} ${-r * 0.55} a ${r * 0.95} ${r * 0.95} 0 0 1 ${r * 1.22} 0`}
        fill="none"
        stroke="rgba(255,255,255,0.4)"
        strokeWidth="1.2"
      />
      <text
        x="0"
        y={r >= 21 ? 7.5 : 6}
        textAnchor="middle"
        fontFamily="var(--serif-display)"
        fontWeight="900"
        fontSize={armies >= 10 ? (selected ? 20 : 16) : selected ? 22 : 18}
        fill="#fbf2d6"
        style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.6)", strokeWidth: 0.8 }}
      >
        {armies}
      </text>
      {selected && (
        <circle r={r + 4} fill="none" stroke="var(--brass-2)" strokeWidth="2.4" opacity="0.95">
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

  // Sea routes are the entire adjacency graph (the map prints no
  // internal land seams between continents — every edge is a sea route
  // visually). We only render the arcs for the selected source.
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
      <img className="map-image" src={MAP_IMAGE} alt="Risk world map" />
      <svg
        className="risk-map"
        viewBox={`0 0 ${MW} ${MH}`}
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <radialGradient id="r-map-vignette" cx="50%" cy="50%" r="62%">
            <stop offset="0%" stopColor="#fff0c0" stopOpacity="0" />
            <stop offset="70%" stopColor="#8a5018" stopOpacity="0" />
            <stop offset="100%" stopColor="#3a2008" stopOpacity="0.45" />
          </radialGradient>
        </defs>

        <rect width={MW} height={MH} fill="url(#r-map-vignette)" pointerEvents="none" />

        {/* Owner wash — faint circular tint behind each held territory */}
        <g className="territory-washes" pointerEvents="none">
          {Object.entries(T).map(([id, g]) => {
            const t = view.territories[id];
            if (!t || t.owner == null) return null;
            const fill = seatFill(t.owner);
            return (
              <circle
                key={`wash-${id}`}
                cx={g.label.x}
                cy={g.label.y}
                r={g.r * 0.95}
                fill={fill}
                opacity="0.16"
              />
            );
          })}
        </g>

        {/* Selected-source sea-route arcs */}
        {selectedId && (
          <g className="edges-selected" pointerEvents="none">
            {seaEdgesForSelected.map(({ id, a, b, wrap, enemy }) => {
              const paths = wrap ? wrapArcs(a, b, MW) : [arcPath(a, b)];
              const stroke = enemy ? "#a13b2a" : "#5a3a1f";
              const halo = "rgba(251,232,160,0.85)";
              return (
                <g key={`edge-${id}`}>
                  {paths.map((d, i) => (
                    <g key={i}>
                      <path d={d} stroke={halo} strokeWidth="6" fill="none" strokeLinecap="round" />
                      <path
                        d={d}
                        stroke={stroke}
                        strokeWidth="3"
                        strokeDasharray="7 5"
                        strokeLinecap="round"
                        fill="none"
                      >
                        <animate
                          attributeName="stroke-dashoffset"
                          from="0"
                          to="-26"
                          dur="1.3s"
                          repeatCount="indefinite"
                        />
                      </path>
                    </g>
                  ))}
                </g>
              );
            })}
          </g>
        )}

        {/* Click hotspots — invisible circles around each label point */}
        <g className="hotspots">
          {Object.entries(T).map(([id, g]) => {
            const isSel = id === selectedId;
            const isTarget = targetable.has(id);
            return (
              <g
                key={`hit-${id}`}
                className={`region clickable${isSel ? " sel" : ""}${isTarget ? " targetable" : ""}`}
              >
                {isTarget && (
                  <circle cx={g.label.x} cy={g.label.y} r={g.r * 0.7} fill="#a13b2a" opacity="0.14" />
                )}
                {isSel && (
                  <circle cx={g.label.x} cy={g.label.y} r={g.r * 0.7} fill="#fbe79a" opacity="0.22" />
                )}
                <circle
                  cx={g.label.x}
                  cy={g.label.y}
                  r={g.r}
                  fill="transparent"
                  className="hit"
                  data-pick={id}
                  style={{ cursor: "pointer" }}
                  onClick={() => onPick(id)}
                >
                  <title>{g.name}</title>
                </circle>
                {isTarget && (
                  <circle
                    cx={g.label.x}
                    cy={g.label.y}
                    r={g.r * 0.78}
                    fill="none"
                    stroke="#a13b2a"
                    strokeWidth="2"
                    strokeDasharray="5 4"
                  >
                    <animate attributeName="stroke-dashoffset" from="0" to="-18" dur="1.1s" repeatCount="indefinite" />
                  </circle>
                )}
              </g>
            );
          })}
        </g>

        {/* Army tokens (and queued deploy "+k" overlay) */}
        <g className="armies" pointerEvents="none">
          {Object.entries(T).map(([id, g]) => {
            const t = view.territories[id];
            if (!t) return null;
            const isSel = id === selectedId;
            const planned = plan?.[id];
            return (
              <g key={`tok-${id}`}>
                <ArmyToken x={g.label.x} y={g.label.y} owner={t.owner} armies={t.armies} selected={isSel} />
                {planned ? (
                  <text
                    x={g.label.x + 28}
                    y={g.label.y - 14}
                    textAnchor="middle"
                    fontFamily="var(--serif-display)"
                    fontWeight="900"
                    fontSize="18"
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

        {/* Continent legend overlays — opaque strips over the printed key */}
        <g className="continent-legend">
          {Object.entries(C).map(([key, meta]) => {
            const box = L[key];
            if (!box) return null;
            const ids = Object.entries(T)
              .filter(([, g]) => g.continent === key)
              .map(([id]) => id);
            const owners = ids.map((id) => view.territories[id]?.owner ?? null);
            const mine = owners.filter((o) => o === view.youAre).length;
            const theirs = owners.filter((o) => o != null && o !== view.youAre).length;
            const allMine = mine === ids.length;
            const allTheirs = theirs === ids.length;
            const pipMax = box.w - 80;
            const pipW = Math.min(8, pipMax / ids.length - 1);
            const pipGap = 1.5;
            const pipRowWidth = ids.length * pipW + (ids.length - 1) * pipGap;
            const pipStartX = box.x + box.w - 8 - pipRowWidth;
            const pipY = box.y + box.h - 6;
            return (
              <g key={`legend-${key}`} className="legend-btn" pointerEvents="none">
                <rect x={box.x} y={box.y} width={box.w} height={box.h} fill={meta.color} stroke="#1a0e08" strokeWidth="1.4" rx="3" />
                <rect x={box.x + 1} y={box.y + 1} width={box.w - 2} height={box.h * 0.4} fill="white" opacity="0.12" rx="2" />
                {(allMine || allTheirs) && (
                  <rect
                    x={box.x}
                    y={box.y}
                    width={box.w}
                    height={box.h}
                    fill={allMine ? "var(--brass-1)" : "#1f4e6e"}
                    opacity={allMine ? 0.32 : 0.34}
                    rx="3"
                  />
                )}
                {allMine && (
                  <rect x={box.x + 1} y={box.y + 1} width={box.w - 2} height={box.h - 2} fill="none" stroke="var(--brass-2)" strokeWidth="1.6" strokeDasharray="3 2" rx="3" />
                )}
                <text
                  x={box.x + 8}
                  y={box.y + 14}
                  fontFamily="var(--serif-display)"
                  fontSize="11"
                  fontWeight="800"
                  fill="#fbf2d6"
                  letterSpacing="0.04em"
                  style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.75)", strokeWidth: 0.9 }}
                >
                  {meta.name.toUpperCase()}
                </text>
                <text
                  x={box.x + box.w - 9}
                  y={box.y + 15}
                  textAnchor="end"
                  fontFamily="var(--serif-display)"
                  fontSize="14"
                  fontWeight="900"
                  fill="#fbf2d6"
                  style={{ paintOrder: "stroke", stroke: "rgba(0,0,0,0.75)", strokeWidth: 1 }}
                >
                  {`+${meta.bonus}`}
                </text>
                {ids.map((id, i) => {
                  const o = view.territories[id]?.owner ?? null;
                  const fill = o == null ? "rgba(255,255,255,0.32)" : seatFill(o);
                  const stroke = o == null ? "rgba(0,0,0,0.55)" : seatInk(o);
                  return (
                    <rect
                      key={id}
                      x={pipStartX + i * (pipW + pipGap)}
                      y={pipY - 4}
                      width={pipW}
                      height={4}
                      rx="0.8"
                      fill={fill}
                      stroke={stroke}
                      strokeWidth="0.4"
                    />
                  );
                })}
                <text
                  x={box.x + 8}
                  y={box.y + box.h - 5}
                  fontFamily="var(--mono, monospace)"
                  fontSize="8"
                  fill="rgba(251,242,214,0.9)"
                  letterSpacing="0.06em"
                >
                  {`${mine}/${ids.length}`}
                </text>
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
          const radA = T[selectedId].r * 0.7;
          const radB = T[to].r * 0.7;
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
                <marker id="march-head" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="6" markerHeight="6" orient="auto">
                  <path d="M 0 0 L 12 6 L 0 12 L 3 6 Z" fill={action} stroke="#2a1810" strokeWidth="0.6" strokeLinejoin="round" />
                </marker>
              </defs>
              <path d={path} stroke="#fbf2d6" strokeWidth="10" fill="none" opacity="0.78" strokeLinecap="round" />
              <path d={path} stroke={action} strokeWidth="4" fill="none" strokeLinecap="round" markerEnd="url(#march-head)" strokeDasharray="10 6">
                <animate attributeName="stroke-dashoffset" from="0" to="-32" dur="1.3s" repeatCount="indefinite" />
              </path>
            </g>
          );
        })()}
      </svg>
    </div>
  );
}
