// src/clients/sorry/board-geometry.js
//
// The 1:1 geometry contract between the inline SVG board (Board4P.tsx) and the
// pawn overlay. Board4P draws on a GRID×GRID cell grid at CELL px per cell;
// this module maps every pawn location and move destination to the matching
// cell centre so the React overlay lands exactly on the drawn cells.
// KEEP THESE CONSTANTS IN SYNC WITH Board4P.tsx (START / HOME / SAFETY).
//
// The engine is 2-player (sides a, b). Visually those occupy two diagonally
// opposite quadrants of the 4-player board: side a → the red top-left quadrant,
// side b → the blue bottom-right quadrant. The green/orange quadrants are board
// ART only and carry no pawns.

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

// The drawn slide arrows, derived from the engine SLIDES above so they always
// land on the squares where a slide actually fires. Each segment runs from the
// slide's start square to its end (start+length), tagged with its owner side
// (engine a → red quadrant, engine b → blue quadrant). The board renders these
// instead of hand-placed arrows, so a painted arrow can never disagree with the
// engine — landing on one always triggers the slide for a foreign-colour pawn.
export function slideSegments() {
  const segs = [];
  for (const side of ["a", "b"]) {
    for (const s of SLIDES[side]) {
      const from = trackCell(s.start);
      const to = trackCell((s.start + s.length) % 60);
      segs.push({ side, from: [from.row, from.col], to: [to.row, to.col] });
    }
  }
  return segs;
}

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

// Safety lanes run inward toward Home, matching Board4P.tsx's drawn cells:
//   a — down column 1 (rows 2..6); b — up column 14 (rows 13..9).
const SAFETY_CELL = {
  a: (idx) => ({ row: 2 + idx, col: 1 }),
  b: (idx) => ({ row: 13 - idx, col: GRID - 2 }),
};
// Home sits just past the last safety square (Board4P HOME a/c).
export const HOME_CELL = { a: { row: 7.5, col: 1 }, b: { row: 8.5, col: GRID - 2 } };
// Start pens are interior clusters in diagonally opposite quadrants
// (Board4P START a/c).
export const START_CENTER = { a: { row: 2.5, col: 4 }, b: { row: 13.5, col: 11 } };

// The five safety cells for a live side, in entry→home order. Exposed so the
// drift guard can assert these stay aligned with Board4P.tsx's drawn cells.
export function safetyCells(side) {
  return [0, 1, 2, 3, 4].map((idx) => SAFETY_CELL[side](idx));
}

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
