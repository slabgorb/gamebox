// src/clients/sorry/Board.tsx
// The board surface: the inline SVG board (Board4P) plus DOM overlays for live
// pawns and clickable legal-move hotspots. The SVG and the overlay share the
// 16×16/1600px grid (board-geometry.js), so every overlay lands exactly on a
// drawn cell.
import type { SorryView, SorrySide, LegalMove } from "../shared/contracts/sorry";
import { Board4P } from "./Board4P";
import { pawnCenter, parkCenter, moveDestCenter, toPct } from "./board-geometry.js";

export interface BoardProps {
  view: SorryView;
  onPick: (moveId: string) => void;
}

const SIDES: SorrySide[] = ["a", "b"];

// Live sides map onto two diagonally opposite quadrants of the 4-player board.
const SIDE_CHECKER: Record<SorrySide, string> = {
  a: "assets/checker-red.png",
  b: "assets/checker-blue.png",
};

// The source pawn a move acts on (split moves carry it on their first leg).
function movePawnId(move: LegalMove): number | undefined {
  return move.pawnId ?? move.legs?.[0]?.pawnId;
}

export function Board({ view, onPick }: BoardProps) {
  const legalMoves: LegalMove[] = view.legalMoves ?? [];
  const turnSide = view.currentPlayer;

  // Pawns that can move this turn — ringed so it's obvious which pieces are live.
  const movableIds = new Set(
    legalMoves.map(movePawnId).filter((id): id is number => id != null),
  );

  // Collapse moves that land on the same square into one hotspot — several Start
  // pawns coming out share a destination, which otherwise stacks identical
  // overlapping targets (only the top one was clickable). Keep the first move's
  // id for the click.
  const targets = new Map<string, { moveId: string; left: string; top: string }>();
  for (const move of legalMoves) {
    const center = moveDestCenter(turnSide, move);
    if (!center) continue;
    const pos = toPct(center);
    const key = `${pos.left}|${pos.top}`;
    if (!targets.has(key)) targets.set(key, { moveId: move.id, left: pos.left, top: pos.top });
  }

  return (
    <div className="board-surface">
      <Board4P />

      {/* Live pawns — every pawn of both sides, placed from the public view.
          Parked pawns (start/home) are laid out as a centred cluster keyed to
          their rank among same-zone pawns, so leftover pawns never slump low. */}
      {SIDES.map((side) => {
        const pawns = view.pawns[side];
        const parkRank = new Map<number, { rank: number; count: number }>();
        for (const zone of ["start", "home"] as const) {
          const inZone = pawns.filter((p) => p.zone === zone).sort((a, b) => a.id - b.id);
          inZone.forEach((p, i) => parkRank.set(p.id, { rank: i, count: inZone.length }));
        }
        return pawns.map((pawn) => {
          const parked = parkRank.get(pawn.id);
          const pos = toPct(
            parked
              ? parkCenter(side, pawn.zone, parked.rank, parked.count)
              : pawnCenter(side, pawn.zone, pawn.index, pawn.id),
          );
          const movable = side === turnSide && movableIds.has(pawn.id);
          return (
            <div
              key={`pawn-${side}-${pawn.id}`}
              className={`pawn pawn-live side-${side} zone-${pawn.zone}${movable ? " movable" : ""}`}
              data-pawn={`${side}-${pawn.id}`}
              data-zone={pawn.zone}
              data-index={pawn.index}
              style={{ left: pos.left, top: pos.top }}
            >
              <img className="pawn-svg" src={SIDE_CHECKER[side]} alt="" draggable={false} />
            </div>
          );
        });
      })}

      {/* Legal-move hotspots — only the active viewer receives legalMoves, so
          these appear only when it is the player's turn. Deduped by destination. */}
      {[...targets.values()].map((t) => (
        <button
          key={`pick-${t.moveId}`}
          type="button"
          className="sorry-target"
          data-pick={t.moveId}
          style={{ left: t.left, top: t.top }}
          onClick={() => onPick(t.moveId)}
          aria-label={`Play move ${t.moveId}`}
        />
      ))}
    </div>
  );
}
