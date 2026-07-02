// E6-5 Task 1 — drift guard: the client presentation mirror
// (src/clients/clue/board-geometry.js) is pinned to the server's authoritative
// geometry (plugins/clue/server/geometry.js), the Risk-map pattern. The client
// renders from the mirror and NEVER recomputes rules; this suite is the only
// thing standing between the two copies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import {
  GRID as MG, ROOMS_GEO, DOORS, CELLAR_POLY, SECRET_PASSAGES as MSP,
  START_SQUARES as MSS, PAWN_COLORS, CELL,
} from '../src/clients/clue/board-geometry.js';
import {
  GRID, BOARD_DATA, START_SQUARES, SECRET_PASSAGES,
} from '../plugins/clue/server/geometry.js';
import { ROOMS, SUSPECTS } from '../plugins/clue/server/cards.js';
import { loadPersonaCatalog } from '../src/server/ai/persona-catalog.js';

test('grid dims mirror the server; CELL is a positive pixel size', () => {
  assert.deepEqual(MG, { cols: GRID.cols, rows: GRID.rows });
  assert.ok(Number.isFinite(CELL) && CELL > 0, `CELL must be a positive number, got ${CELL}`);
});

test('mirror rooms are exactly the catalog rooms', () => {
  assert.deepEqual(Object.keys(ROOMS_GEO).sort(), [...ROOMS].sort());
});

test('each room polygon + label matches the server BOARD_DATA', () => {
  for (const id of ROOMS) {
    assert.deepEqual(ROOMS_GEO[id].poly, BOARD_DATA.rooms[id].poly, `poly drift for ${id}`);
    assert.deepEqual(ROOMS_GEO[id].label, BOARD_DATA.rooms[id].label, `label drift for ${id}`);
  }
});

test('doors mirror the server door list exactly (order-independent, same count)', () => {
  const norm = (arr) => arr.map((d) => `${d.room}@${d.square[0]},${d.square[1]}`).sort();
  assert.deepEqual(norm(DOORS), norm(BOARD_DATA.doors));
  assert.equal(DOORS.length, BOARD_DATA.doors.length);
});

test('cellar, secret passages, and start squares mirror the server', () => {
  assert.deepEqual(CELLAR_POLY, BOARD_DATA.cellar.poly);
  assert.deepEqual(MSP, SECRET_PASSAGES);
  assert.deepEqual(MSS, START_SQUARES);
});

test('every suspect has a start square and a hex pawn colour; no extra keys', () => {
  for (const s of SUSPECTS) {
    assert.ok(Array.isArray(MSS[s]) && MSS[s].length === 2, `start square for ${s}`);
    assert.match(PAWN_COLORS[s] ?? '', /^#[0-9a-fA-F]{6}$/, `pawn colour for ${s}`);
  }
  assert.deepEqual(Object.keys(PAWN_COLORS).sort(), [...SUSPECTS].sort(),
    'PAWN_COLORS must cover exactly the six suspects');
});

test('pawn colours match the shipped E6-4 persona colours (canonical pairing)', () => {
  const catalog = loadPersonaCatalog(join(process.cwd(), 'data', 'ai-personas'));
  const personaFor = {
    scarlett: 'miss-scarlett',
    mustard: 'colonel-mustard',
    white: 'mrs-white',
    green: 'mr-green',
    peacock: 'mrs-peacock',
    plum: 'professor-plum',
  };
  for (const [suspect, personaId] of Object.entries(personaFor)) {
    const persona = catalog.get(personaId);
    assert.ok(persona, `persona ${personaId} missing from catalog`);
    assert.equal(PAWN_COLORS[suspect], persona.color,
      `${suspect} pawn colour must equal the ${personaId} persona colour`);
  }
});
