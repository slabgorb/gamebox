// plugins/risk/client/map-geometry.js
// Single client-side source of Risk map structure. The browser cannot import
// server/map.js (outside the served clientDir), so structure is duplicated
// here and drift-guarded by test/risk-map-geometry.test.js.
//
// Geometry is a PLANAR GRAPH: VERTICES are shared corner points; each
// territory is an ordered loop of vertex ids. Adjacent same-continent tiles
// share a 2-3 vertex subsequence so their wobbled coastlines fit jigsaw
// style. `path` is precomputed from the vertices via map-paths.js so the
// drift guard (which only knows about `path`) and the continent rail in
// app.js keep working unchanged; board.js uses the richer vertex data.
// Coordinate space: SVG viewBox "0 0 800 600".

import { buildEdgeCache, territoryPath } from './map-paths.js';

export const CONTINENT_BONUS = { norland: 2, ostmark: 3, sudreach: 2, westfen: 2 };

// Continent display metadata (antique names differ from the engine keys).
export const CONTINENTS_META = {
  norland:  { name: 'Niedersachsen', bonus: 2, color: '#7a4218', fill: '#ead5a4', scroll: { x: 200, y: 26 } },
  ostmark:  { name: 'Franken',       bonus: 3, color: '#6e2810', fill: '#efcf94', scroll: { x: 614, y: 24 } },
  sudreach: { name: 'Schwaben',      bonus: 2, color: '#4e2a44', fill: '#ead7b0', scroll: { x: 540, y: 397 } },
  westfen:  { name: 'Westfalen',     bonus: 2, color: '#2c4a18', fill: '#e2d4a3', scroll: { x: 162, y: 286 } },
};

export const VERTICES = {
  // NIEDERSACHSEN — top-left island
  n_a: { x: 38, y: 96 }, n_b: { x: 76, y: 60 }, n_c: { x: 136, y: 44 },
  n_d: { x: 200, y: 38 }, n_e: { x: 262, y: 46 }, n_f: { x: 324, y: 62 },
  n_g: { x: 374, y: 96 }, n_h: { x: 388, y: 156 }, n_i: { x: 374, y: 218 },
  n_j: { x: 348, y: 274 }, n_k: { x: 286, y: 306 }, n_l: { x: 208, y: 312 },
  n_m: { x: 132, y: 302 }, n_nn: { x: 64, y: 282 }, n_o: { x: 28, y: 232 },
  n_p: { x: 22, y: 168 }, n_q: { x: 36, y: 124 },
  n_x: { x: 216, y: 150 }, n_x_n: { x: 208, y: 92 },
  n_x_e: { x: 292, y: 186 }, n_x_w: { x: 124, y: 142 },

  // FRANKEN — top-right island
  f_a: { x: 436, y: 76 }, f_b: { x: 482, y: 46 }, f_c: { x: 554, y: 34 },
  f_d: { x: 622, y: 36 }, f_e: { x: 686, y: 50 }, f_f: { x: 752, y: 78 },
  f_g: { x: 788, y: 132 }, f_h: { x: 792, y: 198 }, f_i: { x: 792, y: 264 },
  f_j: { x: 776, y: 326 }, f_k: { x: 740, y: 386 }, f_l: { x: 678, y: 410 },
  f_m: { x: 598, y: 412 }, f_n: { x: 524, y: 400 }, f_o: { x: 462, y: 376 },
  f_p: { x: 438, y: 312 }, f_q: { x: 426, y: 244 }, f_r: { x: 420, y: 178 },
  f_s: { x: 426, y: 118 },
  f_x: { x: 612, y: 224 }, f_x_n: { x: 618, y: 138 }, f_x_e: { x: 700, y: 244 },
  f_x_s: { x: 604, y: 322 }, f_x_w: { x: 528, y: 232 },

  // WESTFALEN — bottom-left island
  w_a: { x: 22, y: 332 }, w_b: { x: 66, y: 304 }, w_c: { x: 136, y: 294 },
  w_d: { x: 202, y: 300 }, w_e: { x: 266, y: 312 }, w_f: { x: 302, y: 358 },
  w_g: { x: 308, y: 414 }, w_h: { x: 296, y: 480 }, w_i: { x: 268, y: 546 },
  w_j: { x: 220, y: 586 }, w_k: { x: 150, y: 596 }, w_l: { x: 78, y: 580 },
  w_m: { x: 36, y: 540 }, w_n: { x: 14, y: 482 }, w_o: { x: 10, y: 414 },
  w_p: { x: 14, y: 364 },
  w_x: { x: 184, y: 414 }, w_x_n: { x: 190, y: 348 },
  w_x_e: { x: 248, y: 432 }, w_x_w: { x: 100, y: 410 },

  // SCHWABEN — bottom-right island (3 in a row)
  s_a: { x: 314, y: 432 }, s_b: { x: 366, y: 418 }, s_c: { x: 442, y: 408 },
  s_d: { x: 520, y: 406 }, s_e: { x: 596, y: 414 }, s_f: { x: 664, y: 422 },
  s_g: { x: 736, y: 424 }, s_h: { x: 786, y: 458 }, s_i: { x: 778, y: 520 },
  s_j: { x: 744, y: 566 }, s_k: { x: 678, y: 584 }, s_l: { x: 596, y: 594 },
  s_m: { x: 510, y: 596 }, s_n: { x: 442, y: 590 }, s_o: { x: 376, y: 582 },
  s_p: { x: 320, y: 568 }, s_q: { x: 302, y: 520 }, s_r: { x: 300, y: 468 },
  s_x_32_a: { x: 448, y: 462 }, s_x_32_b: { x: 444, y: 528 },
  s_x_21_a: { x: 600, y: 466 }, s_x_21_b: { x: 600, y: 538 },
};

// `path` is filled in below from `vertices`.
export const TERRITORIES = {
  // NIEDERSACHSEN
  N1: { name: 'Anhalt', continent: 'norland', neighbors: ['N2', 'N3', 'W3'],
    label: { x: 130, y: 102 }, terrain: 'mountain',
    vertices: ['n_a', 'n_b', 'n_c', 'n_d', 'n_x_n', 'n_x', 'n_x_w', 'n_q'] },
  N2: { name: 'Lippe', continent: 'norland', neighbors: ['N1', 'N3'],
    label: { x: 300, y: 110 }, terrain: 'marsh',
    vertices: ['n_d', 'n_e', 'n_f', 'n_g', 'n_h', 'n_i', 'n_x_e', 'n_x', 'n_x_n'] },
  N3: { name: 'Braunschweig', continent: 'norland', neighbors: ['N1', 'N2', 'E1'],
    label: { x: 200, y: 236 }, terrain: 'plain',
    vertices: ['n_q', 'n_x_w', 'n_x', 'n_x_e', 'n_i', 'n_j', 'n_k', 'n_l', 'n_m', 'n_nn', 'n_o', 'n_p'] },

  // FRANKEN
  E1: { name: 'Bayreuth', continent: 'ostmark', neighbors: ['E2', 'E4', 'N3'],
    label: { x: 526, y: 132 }, terrain: 'mountain',
    vertices: ['f_a', 'f_b', 'f_c', 'f_d', 'f_x_n', 'f_x', 'f_x_w', 'f_p', 'f_q', 'f_r', 'f_s'] },
  E4: { name: 'Ansbach', continent: 'ostmark', neighbors: ['E3', 'E1', 'S1'],
    label: { x: 704, y: 130 }, terrain: 'mountain',
    vertices: ['f_d', 'f_e', 'f_f', 'f_g', 'f_h', 'f_i', 'f_x_e', 'f_x', 'f_x_n'] },
  E2: { name: 'Bamberg', continent: 'ostmark', neighbors: ['E1', 'E3', 'W2'],
    label: { x: 510, y: 332 }, terrain: 'forest',
    vertices: ['f_p', 'f_x_w', 'f_x', 'f_x_s', 'f_m', 'f_n', 'f_o'] },
  E3: { name: 'Würzburg', continent: 'ostmark', neighbors: ['E2', 'E4'],
    label: { x: 700, y: 318 }, terrain: 'forest',
    vertices: ['f_i', 'f_j', 'f_k', 'f_l', 'f_m', 'f_x_s', 'f_x', 'f_x_e'] },

  // WESTFALEN
  W3: { name: 'Waldeck', continent: 'westfen', neighbors: ['W1', 'W2', 'N1'],
    label: { x: 98, y: 354 }, terrain: 'plain',
    vertices: ['w_a', 'w_b', 'w_c', 'w_d', 'w_x_n', 'w_x', 'w_x_w', 'w_o', 'w_p'] },
  W2: { name: 'Nassau', continent: 'westfen', neighbors: ['W1', 'W3', 'E2'],
    label: { x: 240, y: 360 }, terrain: 'forest',
    vertices: ['w_d', 'w_e', 'w_f', 'w_g', 'w_x_e', 'w_x', 'w_x_n'] },
  W1: { name: 'Schaumburg', continent: 'westfen', neighbors: ['W2', 'W3', 'S3'],
    label: { x: 164, y: 512 }, terrain: 'marsh',
    vertices: ['w_o', 'w_x_w', 'w_x', 'w_x_e', 'w_g', 'w_h', 'w_i', 'w_j', 'w_k', 'w_l', 'w_m', 'w_n'] },

  // SCHWABEN
  S3: { name: 'Hohenlohe', continent: 'sudreach', neighbors: ['S2', 'W1'],
    label: { x: 370, y: 500 }, terrain: 'forest',
    vertices: ['s_a', 's_b', 's_c', 's_x_32_a', 's_x_32_b', 's_n', 's_o', 's_p', 's_q', 's_r'] },
  S2: { name: 'Fürstenberg', continent: 'sudreach', neighbors: ['S1', 'S3'],
    label: { x: 520, y: 502 }, terrain: 'marsh',
    vertices: ['s_c', 's_d', 's_e', 's_x_21_a', 's_x_21_b', 's_l', 's_m', 's_n', 's_x_32_b', 's_x_32_a'] },
  S1: { name: 'Hohenzollern', continent: 'sudreach', neighbors: ['S2', 'E4'],
    label: { x: 696, y: 504 }, terrain: 'plain',
    vertices: ['s_e', 's_f', 's_g', 's_h', 's_i', 's_j', 's_k', 's_l', 's_x_21_b', 's_x_21_a'] },
};

// Default coastline wobble. board.js rebuilds its own caches per render with
// matching parameters so the on-screen tile outline equals the cached `path`.
export const COAST_JITTER = 5;

// Precompute each territory's drawable path from its vertex loop. Keeps the
// drift guard happy (`typeof path === 'string'`) and gives board.js a base.
{
  const ec = buildEdgeCache(VERTICES, COAST_JITTER, '');
  for (const g of Object.values(TERRITORIES)) g.path = territoryPath(g, VERTICES, ec);
}

export const SEA_LABELS = [
  { x: 412, y: 360, text: 'MARE   INTERREGNUM', size: 11, tracking: 0.35, rot: 0 },
];

export const LANDMARKS = [
  { x: 110, y: 195, kind: 'city',     name: 'Dessau' },
  { x: 304, y: 154, kind: 'fortress', name: 'Detmold' },
  { x: 540, y: 254, kind: 'city',     name: 'Bamberg' },
  { x: 718, y: 196, kind: 'fortress', name: 'Ansbach' },
  { x: 358, y: 530, kind: 'city',     name: 'Hall' },
  { x: 158, y: 405, kind: 'fortress', name: 'Wiesbaden' },
];
