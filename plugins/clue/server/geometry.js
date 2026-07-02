// Offline-authored board geometry, traced from docs/Cluedo_board_text.svg.
// Integer grid: columns 0..cols-1 (left->right), rows 0..rows-1 (top->bottom).
// One grid square = 10 SVG units. Seed room polygons / door thresholds are
// refined offline via tools/render-board.mjs (rsvg-convert) + the non-overlap
// assertion in test/clue-geometry.test.js.
import { ROOMS } from './cards.js';

export const GRID = { cols: 24, rows: 25 };

const key = ([c, r]) => `${c},${r}`;

// Even-odd ray cast; `poly` is a closed ring of [x,y] grid-corner points.
function pointInPoly([x, y], poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const hits = (yi > y) !== (yj > y)
      && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (hits) inside = !inside;
  }
  return inside;
}

// Grid cells whose CENTER (c+0.5, r+0.5) lies inside the polygon.
function cellsOf(poly, cols, rows) {
  const cells = new Set();
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      if (pointInPoly([c + 0.5, r + 0.5], poly)) cells.add(key([c, r]));
    }
  }
  return cells;
}

export function buildGeometry(data) {
  const { cols, rows, rooms, doors, secretPassages, cellar } = data;

  const roomCells = {};
  const cellToRoom = new Map();
  for (const [id, def] of Object.entries(rooms)) {
    const cells = cellsOf(def.poly, cols, rows);
    roomCells[id] = cells;
    for (const k of cells) cellToRoom.set(k, id);
  }
  const cellarCells = cellar ? cellsOf(cellar.poly, cols, rows) : new Set();

  const inBounds = ([c, r]) => c >= 0 && c < cols && r >= 0 && r < rows;
  const isCorridor = (sq) => inBounds(sq)
    && !cellToRoom.has(key(sq)) && !cellarCells.has(key(sq));

  const doorsBySquare = new Map();
  const doorsByRoom = new Map();
  for (const d of doors) {
    const k = key(d.square);
    if (!doorsBySquare.has(k)) doorsBySquare.set(k, []);
    doorsBySquare.get(k).push(d.room);
    if (!doorsByRoom.has(d.room)) doorsByRoom.set(d.room, []);
    doorsByRoom.get(d.room).push([...d.square]);
  }

  return {
    cols, rows, rooms, doors, secretPassages,
    roomCells, cellarCells, cellToRoom,
    inBounds, isCorridor, doorsBySquare, doorsByRoom,
  };
}

// Symmetric secret-passage adjacency over the 4 corner rooms (from the SVG
// #tunnel markers: Kitchen<->Study, Conservatory<->Lounge).
export const SECRET_PASSAGES = {
  kitchen: 'study', study: 'kitchen',
  conservatory: 'lounge', lounge: 'conservatory',
};

// Canonical start squares (confirmed from the SVG start-circle placements).
export const START_SQUARES = {
  white: [9, 0], green: [14, 0], peacock: [23, 6],
  plum: [23, 19], mustard: [0, 17], scarlett: [7, 24],
};

// SEED geometry — internally consistent (passes all the geometry-test
// assertions) but an approximation of the true board. Refine notched polygons
// + exact door thresholds offline via tools/render-board.mjs. Room ids MUST
// match ROOMS.
export const BOARD_DATA = {
  cols: GRID.cols,
  rows: GRID.rows,
  rooms: {
    kitchen:      { poly: [[0, 1], [6, 1], [6, 7], [0, 7]],      label: [1.6, 4.2] },
    ballroom:     { poly: [[8, 2], [16, 2], [16, 8], [8, 8]],    label: [10, 5] },
    conservatory: { poly: [[18, 1], [24, 1], [24, 5], [18, 5]],  label: [18.3, 3.3] },
    diningroom:   { poly: [[0, 9], [8, 9], [8, 16], [0, 16]],    label: [1.6, 12.9] },
    billiardroom: { poly: [[18, 8], [24, 8], [24, 13], [18, 13]], label: [21, 10.2] },
    library:      { poly: [[17, 14], [23, 14], [23, 18], [17, 18]], label: [19.1, 16.6] },
    lounge:       { poly: [[0, 19], [7, 19], [7, 25], [0, 25]],  label: [2.2, 22.2] },
    hall:         { poly: [[9, 18], [15, 18], [15, 25], [9, 25]], label: [11.2, 21.6] },
    study:        { poly: [[17, 21], [24, 21], [24, 25], [17, 25]], label: [19.5, 23.2] },
  },
  cellar: { poly: [[10, 10], [15, 10], [15, 17], [10, 17]] },
  secretPassages: SECRET_PASSAGES,
  doors: [
    { room: 'kitchen', square: [4, 7] },
    { room: 'ballroom', square: [7, 4] },
    { room: 'ballroom', square: [16, 4] },
    { room: 'ballroom', square: [10, 8] },
    { room: 'ballroom', square: [14, 8] },
    { room: 'conservatory', square: [18, 5] },
    { room: 'diningroom', square: [8, 11] },
    { room: 'diningroom', square: [7, 8] },
    { room: 'billiardroom', square: [17, 10] },
    { room: 'billiardroom', square: [20, 13] },
    { room: 'library', square: [16, 16] },
    { room: 'library', square: [19, 13] },
    { room: 'lounge', square: [7, 21] },
    { room: 'hall', square: [10, 17] },
    { room: 'hall', square: [13, 17] },
    { room: 'hall', square: [8, 21] },
    { room: 'study', square: [16, 22] },
  ],
};

// Guard: geometry must only ever reference catalog room ids.
for (const id of Object.keys(BOARD_DATA.rooms)) {
  if (!ROOMS.includes(id)) throw new Error(`geometry room '${id}' is not a catalog room`);
}

export const BOARD = buildGeometry(BOARD_DATA);
