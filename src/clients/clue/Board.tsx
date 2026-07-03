// SVG board rendered from the geometry mirror + the server view, re-themed to the
// Claude Design "parlour mystery" handoff (2026-07-03): green felt in a walnut
// frame, parchment rooms, brass weapon medallions, checker-token pawns. No rule
// logic here — reachability (active viewer only) and token positions come from
// `view`; the server stays authoritative.
import {
  ROOMS_GEO, DOORS, CELLAR_POLY, GRID, CELL, SECRET_PASSAGES,
} from "./board-geometry.js";
import { SUSPECT_CHECKER, WEAPON_ICONS } from "./board-art.js";
import type { ClueView, RoomId, SuspectId, WeaponId } from "../shared/contracts/clue";

// Axis-aligned bounding box of a room polygon, in board pixels. Every Clue room
// is a rectangle, so the bbox rect IS the room shape.
function bbox(poly: number[][]) {
  const cs = poly.map((p) => p[0]);
  const rs = poly.map((p) => p[1]);
  const minC = Math.min(...cs);
  const minR = Math.min(...rs);
  return {
    x: minC * CELL,
    y: minR * CELL,
    w: (Math.max(...cs) - minC) * CELL,
    h: (Math.max(...rs) - minR) * CELL,
  };
}

export function Board({
  view,
  onPickSquare,
  onPickRoom,
}: {
  view: ClueView;
  onPickSquare: (sq: [number, number]) => void;
  onPickRoom: (room: RoomId) => void;
}) {
  const W = GRID.cols * CELL;
  const H = GRID.rows * CELL;
  const canMove = view.movement != null && view.movement.needsRoll === false;
  const reachRooms = new Set<RoomId>(canMove ? view.movement!.rooms : []);
  const reachSquares: [number, number][] = canMove ? view.movement!.squares : [];
  const youSuspect: SuspectId | null =
    view.youAreSeat != null ? view.seatSuspect[view.youAreSeat] : null;

  // Weapon medallions: per-room slot offset so two weapons in one room don't
  // overlap (the design mock assumed one weapon per room).
  const weaponSlot = new Map<RoomId, number>();
  const weaponTokens = (Object.entries(view.weapons) as [WeaponId, RoomId][]).map(
    ([w, room]) => {
      const b = bbox(ROOMS_GEO[room].poly);
      const n = weaponSlot.get(room) ?? 0;
      weaponSlot.set(room, n + 1);
      return { w, x: b.x + 22 + n * 22, y: b.y + b.h * 0.3 };
    },
  );

  // Pawns clustered in a room get a centered horizontal spread.
  const roomPawns: Partial<Record<RoomId, SuspectId[]>> = {};
  for (const [id, loc] of Object.entries(view.pawns) as [SuspectId, { room?: RoomId }][]) {
    if (loc.room) (roomPawns[loc.room] ||= []).push(id);
  }
  const roomIndex = new Map<RoomId, number>();

  return (
    <svg className="clue-board" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Clue mansion board">
      <defs>
        <radialGradient id="clue-feltGrad" cx="50%" cy="34%" r="75%">
          <stop offset="0%" stopColor="#2f7d50" />
          <stop offset="60%" stopColor="#1b4d33" />
          <stop offset="100%" stopColor="#0c2a1c" />
        </radialGradient>
        <linearGradient id="clue-parchGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#efe4c2" />
          <stop offset="100%" stopColor="#ddcb9c" />
        </linearGradient>
        <linearGradient id="clue-brassStrip" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbe79a" />
          <stop offset="55%" stopColor="#c9a14e" />
          <stop offset="100%" stopColor="#8a6a24" />
        </linearGradient>
        <radialGradient id="clue-brassMed" cx="38%" cy="32%" r="72%">
          <stop offset="0%" stopColor="#fbe79a" />
          <stop offset="55%" stopColor="#c9a14e" />
          <stop offset="100%" stopColor="#6a4a14" />
        </radialGradient>
        <filter id="clue-tokShadow" x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2.2" floodColor="#000" floodOpacity="0.5" />
        </filter>
        <filter id="clue-feltN">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .05 0" />
        </filter>
      </defs>

      {/* felt */}
      <rect x={0} y={0} width={W} height={H} fill="url(#clue-feltGrad)" />
      <rect x={0} y={0} width={W} height={H} fill="#000" filter="url(#clue-feltN)" />

      {/* corridor grid */}
      {Array.from({ length: GRID.cols + 1 }, (_, c) => (
        <line key={`gc${c}`} x1={c * CELL} y1={0} x2={c * CELL} y2={H} stroke="rgba(240,235,215,0.07)" strokeWidth={1} />
      ))}
      {Array.from({ length: GRID.rows + 1 }, (_, r) => (
        <line key={`gr${r}`} x1={0} y1={r * CELL} x2={W} y2={r * CELL} stroke="rgba(240,235,215,0.07)" strokeWidth={1} />
      ))}

      {/* rooms (parchment) */}
      {(Object.entries(ROOMS_GEO) as [RoomId, { poly: number[][]; label: number[] }][]).map(
        ([id, g]) => {
          const b = bbox(g.poly);
          const reachable = reachRooms.has(id);
          return (
            <g key={id}>
              <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={5} fill="url(#clue-parchGrad)" stroke="#8a6234" strokeWidth={2} />
              <rect
                data-room={id}
                className={`clue-room${reachable ? " is-reachable" : ""}`}
                x={b.x} y={b.y} width={b.w} height={b.h} rx={5}
                fill={reachable ? "rgba(200,147,46,.3)" : "transparent"}
                stroke={reachable ? "#e6b652" : "transparent"}
                strokeWidth={2.5}
                onClick={reachable ? () => onPickRoom(id) : undefined}
              />
              <text className="clue-room-label" x={g.label[0] * CELL} y={g.label[1] * CELL} textAnchor="middle">
                {id}
              </text>
              {SECRET_PASSAGES[id as keyof typeof SECRET_PASSAGES] && (
                <text className="clue-secret" x={b.x + b.w - 15} y={b.y + 16}>⤢</text>
              )}
            </g>
          );
        },
      )}

      {/* cellar / accusation envelope */}
      {(() => {
        const b = bbox(CELLAR_POLY);
        const cx = b.x + b.w / 2;
        return (
          <g style={{ pointerEvents: "none" }}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={7} fill="#16281d" stroke="#3a2606" strokeWidth={2} />
            <rect x={b.x + 7} y={b.y + 7} width={b.w - 14} height={b.h - 14} rx={4} fill="none" stroke="rgba(217,178,90,.32)" strokeWidth={1} />
            <text className="clue-envelope-title" x={cx} y={b.y + 66} textAnchor="middle">CLUE</text>
            <text className="clue-envelope-sub" x={cx} y={b.y + 85} textAnchor="middle">THE ACCUSATION</text>
            <circle cx={cx} cy={b.y + 132} r={16} fill="#6e1f18" stroke="#37100b" strokeWidth={1.5} />
            <circle cx={cx} cy={b.y + 132} r={16} fill="none" stroke="rgba(255,220,180,.25)" strokeWidth={1} />
            <text className="clue-envelope-q" x={cx} y={b.y + 138} textAnchor="middle">?</text>
          </g>
        );
      })()}

      {/* door thresholds (brass bars) */}
      {DOORS.map((d, i) => {
        const b = bbox(ROOMS_GEO[d.room as RoomId].poly);
        const [c, r] = d.square;
        const bx = c * CELL;
        const by = r * CELL;
        const onVertEdge = (c + 1) * CELL <= b.x || c * CELL >= b.x + b.w;
        const transform = onVertEdge ? `rotate(90 ${bx + CELL / 2} ${by + CELL / 2})` : undefined;
        return (
          <rect
            key={i}
            data-door={d.room}
            x={bx + 4} y={by + CELL / 2 - 3} width={18} height={6} rx={2}
            fill="url(#clue-brassStrip)" stroke="#2a1608" strokeWidth={0.6}
            transform={transform}
          />
        );
      })}

      {/* reachable corridor squares (active viewer only) */}
      {reachSquares.map(([c, r]) => (
        <rect
          key={`sq-${c}-${r}`}
          data-square={`${c},${r}`}
          className="clue-reach"
          x={c * CELL + 2} y={r * CELL + 2} width={22} height={22} rx={3}
          fill="rgba(200,147,46,.55)" stroke="#e6b652" strokeWidth={1.5}
          onClick={() => onPickSquare([c, r])}
        />
      ))}

      {/* weapons: brass medallions */}
      {weaponTokens.map(({ w, x, y }) => (
        <g key={w} data-weapon={w} transform={`translate(${x},${y})`}>
          <circle r={12} fill="url(#clue-brassMed)" stroke="#2a1608" strokeWidth={1.4} filter="url(#clue-tokShadow)" />
          <circle r={9} fill="none" stroke="rgba(58,33,4,.5)" strokeWidth={1} />
          <path d={WEAPON_ICONS[w].icon} fill="none" stroke="#3a2606" strokeWidth={WEAPON_ICONS[w].sw} strokeLinecap="round" strokeLinejoin="round" />
          <title>{w}</title>
        </g>
      ))}

      {/* pawns: checker tokens (gold ring on your own) */}
      {(Object.entries(view.pawns) as [SuspectId, { room?: RoomId; square?: [number, number] }][]).map(
        ([suspect, loc]) => {
          let cx: number;
          let cy: number;
          let sz: number;
          if (loc.square) {
            cx = loc.square[0] * CELL + CELL / 2;
            cy = loc.square[1] * CELL + CELL / 2;
            sz = 24;
          } else if (loc.room) {
            const b = bbox(ROOMS_GEO[loc.room].poly);
            const list = roomPawns[loc.room]!;
            const idx = (roomIndex.get(loc.room) ?? -1) + 1;
            roomIndex.set(loc.room, idx);
            const n = list.length;
            cx = b.x + b.w / 2 + (idx - (n - 1) / 2) * 26;
            cy = b.y + b.h * 0.68;
            sz = 25;
          } else {
            return null;
          }
          return (
            <g key={suspect}>
              {suspect === youSuspect && (
                <circle
                  cx={cx} cy={cy} r={sz / 2 + 3} fill="none" stroke="#e6b652" strokeWidth={2}
                  style={{ filter: "drop-shadow(0 0 3px rgba(230,182,82,.8))" }}
                />
              )}
              <image
                data-pawn={suspect}
                href={`assets/checker-${SUSPECT_CHECKER[suspect]}.png`}
                x={cx - sz / 2} y={cy - sz / 2} width={sz} height={sz}
                filter="url(#clue-tokShadow)"
              />
              <title>{suspect}</title>
            </g>
          );
        },
      )}
    </svg>
  );
}
