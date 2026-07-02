// SVG board rendered ENTIRELY from the geometry mirror + the server view.
// No rule logic lives here: reachability comes from view.movement (disclosed
// only to the active viewer), pawn/weapon positions from the view.
import {
  ROOMS_GEO, DOORS, CELLAR_POLY, GRID, CELL, PAWN_COLORS, SECRET_PASSAGES,
} from "./board-geometry.js";
import type { ClueView, RoomId, SuspectId, WeaponId } from "../shared/contracts/clue";

const pts = (poly: number[][]) =>
  poly.map(([c, r]) => `${c * CELL},${r * CELL}`).join(" ");

const WEAPON_GLYPHS: Record<WeaponId, string> = {
  candlestick: "🕯", knife: "🗡", leadpipe: "〣",
  revolver: "🔫", rope: "➰", wrench: "🔧",
};

// Centroid of a room polygon (for clustering room occupants).
function roomCenter(room: RoomId): [number, number] {
  const poly = ROOMS_GEO[room].poly;
  const cx = poly.reduce((a, [c]) => a + c, 0) / poly.length;
  const cy = poly.reduce((a, [, r]) => a + r, 0) / poly.length;
  return [cx * CELL, cy * CELL];
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

  // Cluster pawns/weapons that share a room so tokens never overlap.
  const roomSlot = new Map<RoomId, number>();
  const nextSlot = (room: RoomId) => {
    const n = roomSlot.get(room) ?? 0;
    roomSlot.set(room, n + 1);
    return n;
  };

  return (
    <svg
      className="clue-board"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Clue board"
    >
      {/* corridor grid */}
      {Array.from({ length: GRID.cols + 1 }, (_, c) => (
        <line key={`gc${c}`} className="clue-grid" x1={c * CELL} y1={0} x2={c * CELL} y2={H} />
      ))}
      {Array.from({ length: GRID.rows + 1 }, (_, r) => (
        <line key={`gr${r}`} className="clue-grid" x1={0} y1={r * CELL} x2={W} y2={r * CELL} />
      ))}

      {/* cellar */}
      <polygon className="clue-cellar" points={pts(CELLAR_POLY)} />
      <text
        className="clue-cellar-label"
        x={((CELLAR_POLY[0][0] + CELLAR_POLY[1][0]) / 2) * CELL}
        y={((CELLAR_POLY[0][1] + CELLAR_POLY[2][1]) / 2) * CELL}
      >
        CLUE
      </text>

      {/* rooms */}
      {(Object.entries(ROOMS_GEO) as [RoomId, { poly: number[][]; label: number[] }][]).map(
        ([id, g]) => (
          <g key={id}>
            <polygon
              data-room={id}
              className={`clue-room${reachRooms.has(id) ? " is-reachable" : ""}`}
              points={pts(g.poly)}
              onClick={reachRooms.has(id) ? () => onPickRoom(id) : undefined}
            />
            <text className="clue-room-label" x={g.label[0] * CELL} y={g.label[1] * CELL}>
              {id}
              {SECRET_PASSAGES[id as keyof typeof SECRET_PASSAGES] ? " ⤢" : ""}
            </text>
          </g>
        ),
      )}

      {/* door thresholds */}
      {DOORS.map((d, i) => (
        <rect
          key={i}
          data-door={d.room}
          className="clue-door"
          x={d.square[0] * CELL + 3}
          y={d.square[1] * CELL + 3}
          width={CELL - 6}
          height={CELL - 6}
        />
      ))}

      {/* reachable corridor squares (active viewer only) */}
      {reachSquares.map(([c, r]) => (
        <rect
          key={`sq-${c}-${r}`}
          className="clue-reach"
          data-square={`${c},${r}`}
          x={c * CELL}
          y={r * CELL}
          width={CELL}
          height={CELL}
          onClick={() => onPickSquare([c, r])}
        />
      ))}

      {/* weapon tokens (public state: weapon -> room) */}
      {(Object.entries(view.weapons) as [WeaponId, RoomId][]).map(([w, room]) => {
        const [cx, cy] = roomCenter(room);
        const slot = nextSlot(room);
        return (
          <text
            key={w}
            className="clue-weapon"
            data-weapon={w}
            x={cx - CELL + slot * (CELL * 0.9)}
            y={cy + CELL * 0.9}
          >
            {WEAPON_GLYPHS[w]}
          </text>
        );
      })}

      {/* pawns: on a corridor square, or clustered inside their room */}
      {(Object.entries(view.pawns) as [SuspectId, { room?: RoomId; square?: [number, number] }][]).map(
        ([suspect, loc]) => {
          let cx: number;
          let cy: number;
          if (loc.square) {
            cx = loc.square[0] * CELL + CELL / 2;
            cy = loc.square[1] * CELL + CELL / 2;
          } else if (loc.room) {
            const [rx, ry] = roomCenter(loc.room);
            const slot = nextSlot(loc.room);
            cx = rx - CELL + slot * (CELL * 0.9);
            cy = ry - CELL * 0.35;
          } else {
            return null;
          }
          return (
            <circle
              key={suspect}
              data-pawn={suspect}
              className="clue-pawn"
              cx={cx}
              cy={cy}
              r={CELL / 2 - 3}
              fill={PAWN_COLORS[suspect]}
            />
          );
        },
      )}
    </svg>
  );
}
