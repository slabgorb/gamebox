// src/clients/sorry/board-geometry.js
//
// The 1:1 geometry contract between the baked board image and the client
// overlay — the same principle as the backgammon parquet renderer's CSS_FIT.
// scripts/render-sorry-board.py bakes the board on a GRID×GRID cell grid at
// CELL px per cell; this module maps every pawn location and move destination
// to the matching pixel centre so the React overlay lands exactly on the
// printed cells. KEEP THESE CONSTANTS IN SYNC WITH render-sorry-board.py.

export const BOARD_IMAGE = "assets/sorry-board.png";
export const GRID = 16;
export const CELL = 100;
export const BOARD_PX = GRID * CELL; // 1600

// Engine geometry mirror (plugins/sorry/server/geometry.js).
export const START_EXIT = { a: 4, b: 34 };
export const SAFETY_ENTRY = { a: 1, b: 31 };
export const SLIDES = {
  a: [{ start: 9, length: 4 }, { start: 34, length: 5 }],
  b: [{ start: 39, length: 4 }, { start: 4, length: 5 }],
};

// Absolute track index (0..59) → {row, col} on the perimeter ring, clockwise
// from the top-left corner: across the top, down the right, back along the
// bottom, up the left. 16 + 15 + 15 + 14 = 60 distinct cells.
export function trackCell(index) {
  const i = ((index % 60) + 60) % 60;
  if (i <= 15) return { row: 0, col: i };
  if (i <= 30) return { row: i - 15, col: GRID - 1 };
  if (i <= 45) return { row: GRID - 1, col: 45 - i };
  return { row: 60 - i, col: 0 };
}

// Safety lanes run inward from each side's safety entry toward Home:
//   a — down column 1 (rows 1..5); b — up column 14 (rows 14..10).
const SAFETY_CELL = {
  a: (idx) => ({ row: 1 + idx, col: 1 }),
  b: (idx) => ({ row: GRID - 2 - idx, col: GRID - 2 }),
};
// Home sits just past the last safety square.
const HOME_CELL = { a: { row: 6, col: 1 }, b: { row: 9, col: GRID - 2 } };
// Start pens are interior 2×2 clusters, diagonally opposite.
const START_CENTER = { a: { row: 2.5, col: 3.5 }, b: { row: 13.5, col: 12.5 } };

function cellCenter({ row, col }) {
  return { x: (col + 0.5) * CELL, y: (row + 0.5) * CELL };
}

// Pixel centre for a pawn at {zone,index} owned by `side`. Multiple pawns in
// Start/Home are fanned out by `pawnId` so they don't fully overlap.
export function pawnCenter(side, zone, index, pawnId = 0) {
  if (zone === "track") return cellCenter(trackCell(index));
  if (zone === "safety") return cellCenter(SAFETY_CELL[side](index));
  if (zone === "home") {
    const c = cellCenter(HOME_CELL[side]);
    return { x: c.x + ((pawnId % 2) - 0.5) * CELL * 0.5, y: c.y + (Math.floor(pawnId / 2) - 0.5) * CELL * 0.5 };
  }
  // start
  const s = START_CENTER[side];
  const dx = ((pawnId % 2) - 0.5) * 0.9;
  const dy = (Math.floor(pawnId / 2) - 0.5) * 0.9;
  return cellCenter({ row: s.row + dy, col: s.col + dx });
}

// Pixel centre for a legal move's destination (where its clickable hotspot
// goes). Single-destination kinds carry `to`; split moves use their first leg.
export function moveDestCenter(side, move) {
  const dest = move.to ?? move.legs?.[0]?.to;
  if (!dest) return null;
  return pawnCenter(side, dest.zone, dest.index, move.pawnId ?? 0);
}

// Convert an absolute pixel point to a percentage of the board, so the overlay
// scales with the responsive <img>.
export function toPct({ x, y }) {
  return { left: `${(x / BOARD_PX) * 100}%`, top: `${(y / BOARD_PX) * 100}%` };
}
