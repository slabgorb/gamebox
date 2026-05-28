// src/clients/sorry/Board.tsx
// The baked board image (the parquet trick — see scripts/render-sorry-board.py)
// is the entire board surface; this component only overlays the live state:
// pawn tokens positioned by zone/index, and a clickable hotspot for each legal
// move destination. No board cells are drawn in the DOM.
import type { SorryView, SorrySide, LegalMove } from "../shared/contracts/sorry";
import {
  BOARD_IMAGE,
  pawnCenter,
  moveDestCenter,
  toPct,
} from "./board-geometry.js";

export interface BoardProps {
  view: SorryView;
  onPick: (moveId: string) => void;
  selected: string | null;
}

const SIDES: SorrySide[] = ["a", "b"];

export function Board({ view, onPick, selected }: BoardProps) {
  const legalMoves: LegalMove[] = view.legalMoves ?? [];
  const turnSide = view.currentPlayer;

  return (
    <div className="sorry-board">
      <img className="board-image" src={BOARD_IMAGE} alt="Sorry! board" />

      {/* Pawn tokens — every pawn of both sides, placed from the public view. */}
      {SIDES.map((side) =>
        view.pawns[side].map((pawn) => {
          const pos = toPct(pawnCenter(side, pawn.zone, pawn.index, pawn.id));
          return (
            <div
              key={`pawn-${side}-${pawn.id}`}
              className={`sorry-pawn side-${side} zone-${pawn.zone}`}
              data-pawn={`${side}-${pawn.id}`}
              data-zone={pawn.zone}
              data-index={pawn.index}
              style={{ left: pos.left, top: pos.top }}
            >
              <span className="pawn-id">{pawn.id + 1}</span>
            </div>
          );
        }),
      )}

      {/* Legal-move hotspots — only the active viewer receives legalMoves, so
          these appear only when it is the player's turn. */}
      {legalMoves.map((move) => {
        const center = moveDestCenter(turnSide, move);
        if (!center) return null;
        const pos = toPct(center);
        const isSelected = selected === move.id;
        return (
          <button
            key={`pick-${move.id}`}
            type="button"
            className={`sorry-target${isSelected ? " selected" : ""}`}
            data-pick={move.id}
            style={{ left: pos.left, top: pos.top }}
            onClick={() => onPick(move.id)}
            aria-label={`Play move ${move.id}`}
          />
        );
      })}
    </div>
  );
}
