// Presentation mirror of plugins/clue/server/geometry.js. The client renders
// the board from these numbers; it NEVER computes movement/rules — the server
// is authoritative. test/clue-board-drift.test.js pins this to the engine.
export const CELL = 26; // px per grid square (presentation only)
export const GRID = { cols: 24, rows: 25 };

export const ROOMS_GEO = {
  kitchen:      { poly: [[0, 1], [6, 1], [6, 7], [0, 7]],        label: [1.6, 4.2] },
  ballroom:     { poly: [[8, 2], [16, 2], [16, 8], [8, 8]],      label: [10, 5] },
  conservatory: { poly: [[18, 1], [24, 1], [24, 5], [18, 5]],    label: [18.3, 3.3] },
  diningroom:   { poly: [[0, 9], [8, 9], [8, 16], [0, 16]],      label: [1.6, 12.9] },
  billiardroom: { poly: [[18, 8], [24, 8], [24, 13], [18, 13]],  label: [21, 10.2] },
  library:      { poly: [[17, 14], [23, 14], [23, 18], [17, 18]], label: [19.1, 16.6] },
  lounge:       { poly: [[0, 19], [7, 19], [7, 25], [0, 25]],    label: [2.2, 22.2] },
  hall:         { poly: [[9, 18], [15, 18], [15, 25], [9, 25]],  label: [11.2, 21.6] },
  study:        { poly: [[17, 21], [24, 21], [24, 25], [17, 25]], label: [19.5, 23.2] },
};

export const CELLAR_POLY = [[10, 10], [15, 10], [15, 17], [10, 17]];

export const DOORS = [
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
];

export const SECRET_PASSAGES = {
  kitchen: 'study', study: 'kitchen',
  conservatory: 'lounge', lounge: 'conservatory',
};

export const START_SQUARES = {
  white: [9, 0], green: [14, 0], peacock: [23, 6],
  plum: [23, 19], mustard: [0, 17], scarlett: [7, 24],
};

// Canonical pawn colours — pinned to the E6-4 persona `color` fields by the
// drift guard (portraits and roster chips use the same values).
export const PAWN_COLORS = {
  scarlett: '#c0392b', mustard: '#d4a017', white: '#ecf0f1',
  green: '#27ae60', peacock: '#2980b9', plum: '#8e44ad',
};
