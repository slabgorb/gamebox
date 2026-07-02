import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRID, BOARD, BOARD_DATA, START_SQUARES, SECRET_PASSAGES, buildGeometry,
} from '../plugins/clue/server/geometry.js';
import { ROOMS, SUSPECTS } from '../plugins/clue/server/cards.js';
import { buildBoardSvg } from '../plugins/clue/tools/render-board.mjs';

const ortho = ([c, r]) => [[c, r - 1], [c, r + 1], [c + 1, r], [c - 1, r]];
const key = ([c, r]) => `${c},${r}`;

test('grid is the traced 24 x 25', () => {
  assert.equal(GRID.cols, 24);
  assert.equal(GRID.rows, 25);
  assert.equal(BOARD.cols, 24);
  assert.equal(BOARD.rows, 25);
});

test('geometry rooms are exactly the 9 catalog rooms', () => {
  assert.deepEqual(Object.keys(BOARD.rooms).sort(), [...ROOMS].sort());
});

test('AC#1: room polygons are pairwise non-overlapping (rasterized to cells)', () => {
  const ids = Object.keys(BOARD.roomCells);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = BOARD.roomCells[ids[i]];
      const b = BOARD.roomCells[ids[j]];
      for (const cell of a) {
        assert.ok(!b.has(cell), `rooms ${ids[i]} and ${ids[j]} both cover cell ${cell}`);
      }
    }
  }
});

test('cellar cells never overlap a room', () => {
  for (const cell of BOARD.cellarCells) {
    assert.ok(!BOARD.cellToRoom.has(cell), `cellar cell ${cell} is also a room cell`);
  }
});

// The cellar is non-playable: it must not read as walkable corridor either.
test('cellar cells are not corridor', () => {
  assert.ok(BOARD.cellarCells.size > 0, 'board has a cellar');
  for (const cell of BOARD.cellarCells) {
    const sq = cell.split(',').map(Number);
    assert.equal(BOARD.isCorridor(sq), false, `cellar cell ${cell} reads as corridor`);
  }
});

test('every door square is a corridor cell orthogonally adjacent to its room', () => {
  for (const d of BOARD.doors) {
    assert.ok(BOARD.isCorridor(d.square), `door for ${d.room} at ${d.square} is not corridor`);
    const roomCells = BOARD.roomCells[d.room];
    const adjacent = ortho(d.square).some((nb) => roomCells.has(key(nb)));
    assert.ok(adjacent, `door for ${d.room} at ${d.square} is not adjacent to the room`);
  }
});

test('door counts per room are canonical (total 17)', () => {
  const counts = {};
  for (const d of BOARD.doors) counts[d.room] = (counts[d.room] ?? 0) + 1;
  assert.deepEqual(counts, {
    kitchen: 1, ballroom: 4, conservatory: 1, diningroom: 2, billiardroom: 2,
    library: 2, lounge: 1, hall: 3, study: 1,
  });
  assert.equal(BOARD.doors.length, 17);
});

test('secret passages are symmetric and connect the 4 corner rooms', () => {
  assert.deepEqual(SECRET_PASSAGES, {
    kitchen: 'study', study: 'kitchen', conservatory: 'lounge', lounge: 'conservatory',
  });
  for (const [from, to] of Object.entries(SECRET_PASSAGES)) {
    assert.equal(SECRET_PASSAGES[to], from, `${from}->${to} is not mutual`);
  }
});

// Every secret-passage endpoint must be a real room on the built board — a
// typo'd id here would silently produce a passage to nowhere.
test('secret-passage endpoints all exist in BOARD.rooms', () => {
  assert.equal(Object.keys(BOARD.secretPassages).length, 4, 'board carries the 4 passage entries');
  for (const [from, to] of Object.entries(BOARD.secretPassages)) {
    assert.ok(BOARD.rooms[from], `passage source '${from}' is not a board room`);
    assert.ok(BOARD.rooms[to], `passage destination '${to}' is not a board room`);
  }
});

test('all six suspects have a corridor start square', () => {
  assert.deepEqual(Object.keys(START_SQUARES).sort(), [...SUSPECTS].sort());
  for (const s of SUSPECTS) {
    assert.ok(BOARD.isCorridor(START_SQUARES[s]), `start for ${s} not corridor`);
  }
});

// Two pawns may never share a corridor square, so shared start squares would
// make the initial state illegal by the game's own movement rules.
test('start squares are pairwise distinct', () => {
  const keys = Object.values(START_SQUARES).map(key);
  assert.equal(new Set(keys).size, 6, 'six distinct start squares');
});

test('buildGeometry is a pure factory (works on a synthetic 6x6 board)', () => {
  const mini = buildGeometry({
    cols: 6, rows: 6,
    rooms: { ra: { poly: [[0, 0], [2, 0], [2, 2], [0, 2]] } },
    doors: [{ room: 'ra', square: [2, 1] }],
    secretPassages: {},
    cellar: null,
  });
  assert.ok(mini.roomCells.ra.has('1,1'));
  assert.equal(mini.isCorridor([1, 1]), false); // inside ra
  assert.equal(mini.isCorridor([2, 1]), true);  // door threshold is corridor
  assert.equal(mini.isCorridor([9, 9]), false); // out of bounds
  assert.deepEqual(mini.doorsBySquare.get('2,1'), ['ra']);
});

test('BOARD_DATA room ids and BOARD are consistent', () => {
  assert.deepEqual(Object.keys(BOARD_DATA.rooms).sort(), [...ROOMS].sort());
  assert.equal(BOARD_DATA.cols, GRID.cols);
  assert.equal(BOARD_DATA.rows, GRID.rows);
});

test('buildBoardSvg renders every room, door, and start (harness smoke)', () => {
  const svg = buildBoardSvg(BOARD, START_SQUARES);
  assert.match(svg, /^<svg/);
  for (const id of ROOMS) assert.ok(svg.includes(`data-room="${id}"`), `svg missing room ${id}`);
  for (const s of SUSPECTS) assert.ok(svg.includes(`data-start="${s}"`), `svg missing start ${s}`);
  assert.equal((svg.match(/data-door=/g) || []).length, 17);
});
