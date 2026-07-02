# Clue Board Geometry + Dice Movement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the board geometry module (grid + 9 room polygons + doors + 2 secret passages), an offline `rsvg-convert` render/overlap harness, and the `roll`/`move`/`secretPassage` movement actions — integrated into the **existing** `'move'` phase and the shipped `doEnterRoom` reducer — to the headless Clue engine.

**Architecture:** Pure ES-module functions under `plugins/clue/server/`. Geometry is authored offline as integer grid data and verified via a machine-checkable non-overlap assertion + an SVG→PNG eyeball harness (the Risk map pattern). Movement reachability is a self-avoiding-walk enumeration (BFS/DFS to depth = die) that respects orthogonal-only movement, no-revisit, blocking, and no-re-enter-same-room. Movement functions take geometry as an injected argument so the algorithm is tested against a tiny synthetic board, decoupled from the real board's exact traced coordinates. Room entry routes through Plan 1's `doEnterRoom` (entering a room ends the move → `'suggest'`); no new phase is introduced.

**Tech Stack:** Node ≥20, ESM, `node --test` + `node:assert/strict`. Offline render shells to `rsvg-convert` (SVG→PNG). Reuses `plugins/clue/server/cards.js` (`ROOMS`, `SUSPECTS`) and Plan 1's `actions.js`/`state.js`/`view.js`.

## Global Constraints

- **Node ≥20, ESM** (`"type": "module"`); all imports use explicit `.js` extensions.
- **Tests:** `node --test` with `node:test` + `node:assert/strict`; test files live at repo root `test/clue-*.test.js` (flat dir, matching `test/risk-*.test.js`).
- **No server-side dice RNG.** Dice are client-side: the `roll` action records a client-supplied integer `value` (1–6); the server never generates it. This is the backgammon `pendingRoll` pause pattern.
- **Do NOT introduce new phase values.** The as-built engine uses `phase: 'move'|'suggest'|'refute'|'accuse-or-pass'|'ended'`. `roll`/`move`/`secretPassage` all operate WITHIN the existing `'move'` phase; the roll/move sub-state is distinguished by `state.pendingRoll` (`null` ⇒ awaiting roll, non-null ⇒ awaiting move). Room entry calls the existing `doEnterRoom` reducer (→ `'suggest'`). The 30+ Plan 1 tests (`test/clue-*.test.js` for E6-1/E6-2) MUST stay green — the only intentional change to a Plan 1 test is the "pawns start off-board" assertion in `test/clue-state.test.js`, which Plan 1 itself flagged ("Plan 2 assigns start squares").
- **Plugin contract signatures (exact, backward-compatible extensions):**
  - `applyClueAction({ state, action, actorId, geo = BOARD }) → { state } | { error } | { state, ended: true, summary }` — `geo` is an OPTIONAL injected geometry (defaults to the real `BOARD`). Plan 1 callers pass no `geo` and are unaffected.
  - `cluePublicView({ state, viewerId, geo = BOARD }) → view` — `geo` optional, defaults to `BOARD`.
  - `buildGeometry(data) → geo` — pure factory; `BOARD = buildGeometry(BOARD_DATA)`.
  - `legalMoves(state, geo, seat) → { squares: [[c,r],...], rooms: [roomId,...] }`.
  - `secretPassageDest(geo, roomId) → roomId | null`.
- **Card ids are lowercase strings** and geometry room ids MUST equal the catalog: `ROOMS = ['kitchen','ballroom','conservatory','diningroom','billiardroom','library','lounge','hall','study']` (from `cards.js`). Suspect ids for start squares: `scarlett mustard white green peacock plum`.
- **Coordinate framework (see Board Geometry Reference below):** integer grid, columns `0..23` (left→right), rows `0..24` (top→bottom, y increases downward). One grid square = 10 SVG units (the reference art `docs/Cluedo_board_text.svg` uses a 10-unit cell). Squares are addressed `[col, row]`. Locations are `{ room: <roomId> }` or `{ square: [col, row] }`.
- **`structuredClone`** is the state-copy primitive (matches Plan 1's `const clone = (s) => structuredClone(s)`).

---

## Roadmap (this plan is Plan 2 of 4)

The spec (`docs/superpowers/specs/2026-07-01-clue-clone-design.md`) is decomposed into four sub-plans:

1. **Core deduction engine (shipped, E6-1/E6-2)** — cards, deal, state, suggest/refute/accuse/pass, `cluePublicView`. Rooms are abstract; `enterRoom` places a pawn directly.
2. **Board geometry + movement (THIS PLAN, E6-3)** — `geometry.js` traced from `docs/Cluedo_board_text.svg`, offline `rsvg-convert` render + non-overlap harness, `roll`/`move`/`secretPassage` actions routing room entry through the existing `doEnterRoom`, reachable-squares BFS surfaced in `cluePublicView` for the seat on turn.
3. **Bots (E6-4+)** — knowledge tracker, shortlist, persona pick, auto-refute, six suspect personas.
4. **Client + integration (E6-5+)** — React board (mirrors this geometry), `plugin.js`, registration, drift guard + client fixtures, async-pause end-to-end.

**Plan 2 deliverable:** `plugins/clue/server/geometry.js`, `plugins/clue/server/rules/movement.js`, `plugins/clue/tools/render-board.mjs`, additive edits to `actions.js`/`state.js`/`view.js`, and tests — all `node --test` green. Still no `plugin.js` and no registration (Plan 4). This remains a tested engine library.

**Explicitly OUT of scope for Plan 2 (do NOT build — flagged as deferred):**
- React client / client mirror geometry app, and the **client half** of the drift guard + client fixtures (Plan 4). The server `geometry.js` module + its offline verification (render harness + non-overlap assertion) IS in scope.
- Bots / knowledge-tracker / shortlist / auto-refute (Plan 3).
- `plugin.js` manifest + registration in `src/plugins/index.js` (Plan 4).
- **"Suggest-in-place without moving"** when a pawn was dragged into a room by another player's suggestion (spec §5/§10). This is a turn-flow affordance, not a movement primitive; it is deferred to Plan 4 and recorded as a Delivery Finding.

---

## Board Geometry Reference (established from `docs/Cluedo_board_text.svg`)

This section pins the coordinate framework, grid dimensions, room identities/extents, door squares, secret passages, and start squares — enough for Dev to begin. **Exact notched room polygons and exact door thresholds are refined offline via the render harness (Task 2); the seed values below are internally consistent (all pass the Task 1 assertions) but are approximations of the true board.**

### Coordinate framework
- Reference SVG `viewBox="-10 -4 260 260"`; the `floor` path and all room rectangles are drawn on a **10-unit grid** (coordinates are multiples of 10).
- Grid model: `GRID = { cols: 24, rows: 25 }`. Columns `0..23`, rows `0..24`. `[col,row] → SVG rect at (col*10, row*10, 10, 10)`. Cell center = `(col*10+5, row*10+5)`.
- **Confirmed by the six start-circle placements** in the SVG (`<use href="#start" transform="translate(x,y)">`, where `(x,y)` is the cell center): white `(95,5)`, green `(145,5)`, peacock `(235,65)`, plum `(235,195)`, mustard `(5,175)`, scarlett `(75,245)` → cols reach 23, rows reach 24 ⇒ 24×25 grid.

### Start squares (canonical; `START_SQUARES`, keyed by suspect id)
| Suspect | Pawn color | `[col,row]` | Edge |
|---|---|---|---|
| white | White | `[9,0]` | top |
| green | Green | `[14,0]` | top |
| peacock | Blue | `[23,6]` | right |
| plum | Purple | `[23,19]` | right |
| mustard | Yellow | `[0,17]` | left |
| scarlett | Red | `[7,24]` | bottom |

All six pawns are on the board at all times (canonical, regardless of player count) — `buildInitialState` places every suspect on its start square (Task 4).

### Rooms (9) — seed rectangles + label anchors
Room ids MUST match `cards.js` `ROOMS`. Polygons are rectilinear rings of integer `[col,row]` grid-corner points (refine to notched shapes offline). `label` is a `[col,row]` anchor (from the SVG text anchors ÷10) for the render harness.

| Room id | Quadrant | Seed poly (grid corners) | Covered cells | label |
|---|---|---|---|---|
| `kitchen` | top-left | `[[0,1],[6,1],[6,7],[0,7]]` | cols 0–5, rows 1–6 | `[1.6,4.2]` |
| `ballroom` | top-center | `[[8,2],[16,2],[16,8],[8,8]]` | cols 8–15, rows 2–7 | `[10,5]` |
| `conservatory` | top-right | `[[18,1],[24,1],[24,5],[18,5]]` | cols 18–23, rows 1–4 | `[18.3,3.3]` |
| `diningroom` | left-center | `[[0,9],[8,9],[8,16],[0,16]]` | cols 0–7, rows 9–15 | `[1.6,12.9]` |
| `billiardroom` | right-center-upper | `[[18,8],[24,8],[24,13],[18,13]]` | cols 18–23, rows 8–12 | `[21,10.2]` |
| `library` | right-center-lower | `[[17,14],[23,14],[23,18],[17,18]]` | cols 17–22, rows 14–17 | `[19.1,16.6]` |
| `lounge` | bottom-left | `[[0,19],[7,19],[7,25],[0,25]]` | cols 0–6, rows 19–24 | `[2.2,22.2]` |
| `hall` | bottom-center | `[[9,18],[15,18],[15,25],[9,25]]` | cols 9–14, rows 18–24 | `[11.2,21.6]` |
| `study` | bottom-right | `[[17,21],[24,21],[24,25],[17,25]]` | cols 17–23, rows 21–24 | `[19.5,23.2]` |

**Cellar** (central stairway; holds the envelope; NOT a playable room, NOT in `ROOMS`): seed poly `[[10,10],[15,10],[15,17],[10,17]]` (cols 10–14, rows 10–16). Corridor = every in-bounds cell that is neither a room cell nor a cellar cell.

### Doors (17 total; canonical counts) — seed threshold squares
A **door** is the corridor square immediately outside a room's doorway. Model: `DOORS = [{ room, square: [col,row] }, ...]`. The threshold square must be a corridor cell orthogonally adjacent to ≥1 cell of its room (Task 1 asserts this). Entering the room from the threshold costs one step and ends the move (excess pips ignored).

| Room | Door count (canonical) | Seed threshold squares |
|---|---|---|
| `kitchen` | 1 | `[4,7]` |
| `ballroom` | 4 | `[7,4]`, `[16,4]`, `[10,8]`, `[14,8]` |
| `conservatory` | 1 | `[18,5]` |
| `diningroom` | 2 | `[8,11]`, `[7,8]` |
| `billiardroom` | 2 | `[17,10]`, `[20,13]` |
| `library` | 2 | `[16,16]`, `[19,13]` |
| `lounge` | 1 | `[7,21]` |
| `hall` | 3 | `[10,17]`, `[13,17]`, `[8,21]` |
| `study` | 1 | `[16,22]` |

### Secret passages (confirmed from the SVG `#tunnel` markers)
The SVG places two `#tunnel` marker pairs by stroke color: magenta `#ff00ff` at `(50,10)`≈Kitchen and `(240,220)`≈Study; teal `#006666` at `(0,200)`≈Lounge and `(230,50)`≈Conservatory. So:
- **Kitchen ↔ Study** (magenta)
- **Conservatory ↔ Lounge** (teal)

`SECRET_PASSAGES = { kitchen:'study', study:'kitchen', conservatory:'lounge', lounge:'conservatory' }` — a symmetric adjacency over the four corner rooms. A secret passage is taken **instead of rolling** (no die), moves the pawn to the opposite corner, and — like entering a room — ends the move and transitions to `'suggest'`.

### Movement rules (encoded server-side)
- Move exactly `die` orthogonal squares (N/S/E/W, never diagonal); may not revisit a square in the same turn (self-avoiding walk).
- No two pawns on one corridor square; may not move *through* an occupied corridor square. Rooms hold unlimited pawns/weapons.
- Corridor destinations require **exactly** `die` steps (you must spend all pips). Entering a room requires a doorway reachable in **≤ `die`** steps (excess ignored) and ends the move.
- A blocked doorway (threshold square occupied) cannot be used.
- **Cannot leave and re-enter the same room in one turn** — the turn-start room is excluded from reachable rooms.
- Reachable squares/rooms are computed server-side and surfaced in `cluePublicView` **only** for `viewerId === activeUserId`.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `plugins/clue/server/geometry.js` | `GRID` const, `BOARD_DATA` (rooms/doors/cellar/secret passages), `START_SQUARES`, `buildGeometry(data)` factory (computes room cells, `isCorridor`, door indexes), `BOARD = buildGeometry(BOARD_DATA)`. Offline-authored, integer-grid. |
| `plugins/clue/tools/render-board.mjs` | `buildBoardSvg(geo, starts) → svgString` (pure) + a CLI `main` that writes `docs/clue-board.svg` and shells `rsvg-convert` → `docs/clue-board.png`. The Risk-pattern eyeball harness. |
| `plugins/clue/server/rules/movement.js` | `occupiedSquares`, `legalMoves(state, geo, seat)` (self-avoiding-walk reachability), `secretPassageDest(geo, room)`. Pure; geometry injected. |
| `plugins/clue/server/actions.js` (modify) | Add `roll`/`move`/`secretPassage` to `applyClueAction` (with `geo = BOARD` default); add `doRoll`/`doMove`/`doSecretPassage`; add `pendingRoll` clearing to `doEnterRoom`/`doPass`/`doAccuse`. |
| `plugins/clue/server/state.js` (modify) | Place all 6 pawns on `START_SQUARES`; add `pendingRoll: null` to initial state. |
| `plugins/clue/server/view.js` (modify) | Surface `pendingRoll` + a `movement` object (reachable squares/rooms or roll/secret-passage affordance) for `viewerId === activeUserId` only. |
| `test/clue-geometry.test.js` | Grid dims, rooms match `ROOMS`, non-overlap assertion, door adjacency/counts, secret-passage symmetry, start squares corridor, `buildBoardSvg` smoke. |
| `test/clue-movement.test.js` | `movement.js` reachability against a synthetic mini-board (orthogonal, exact-count, no-revisit, blocking, room-entry ≤die, no-re-enter, secret-passage dest). |
| `test/clue-actions-movement.test.js` | `roll`/`move`/`secretPassage` reducers (synthetic geo + backward-compat checks). |
| `test/clue-state.test.js` (modify) | Update the "pawns off-board" assertion → pawns on start squares; assert `pendingRoll: null`. |
| `test/clue-view.test.js` (modify) | Add movement-surfacing assertions (active seat only). |

---

## Task 1: `geometry.js` — grid, rooms, doors, secret passages, `buildGeometry`

**Files:**
- Create: `plugins/clue/server/geometry.js`
- Test: `test/clue-geometry.test.js` (also exercises Task 2's `buildBoardSvg`)

**Interfaces:**
- Consumes: `ROOMS` from `./cards.js`.
- Produces:
  - `GRID = { cols: 24, rows: 25 }`.
  - `BOARD_DATA` — `{ cols, rows, rooms: { [id]: { poly, label } }, doors: [{room, square}], secretPassages, cellar: { poly } }`.
  - `START_SQUARES` — `{ [suspectId]: [col,row] }` for all 6 suspects.
  - `SECRET_PASSAGES` — `{ [roomId]: roomId }` (symmetric over the 4 corners).
  - `buildGeometry(data) → geo` where `geo = { cols, rows, rooms, doors, secretPassages, roomCells, cellarCells, cellToRoom, inBounds, isCorridor, doorsBySquare, doorsByRoom }`.
    - `roomCells: { [roomId]: Set<"c,r"> }`, `cellarCells: Set<"c,r">`, `cellToRoom: Map<"c,r", roomId>`.
    - `inBounds([c,r]) → bool`, `isCorridor([c,r]) → bool` (in-bounds AND not a room cell AND not a cellar cell).
    - `doorsBySquare: Map<"c,r", roomId[]>`, `doorsByRoom: Map<roomId, [c,r][]>`.
  - `BOARD = buildGeometry(BOARD_DATA)`.

- [ ] **Step 1: Write the failing test**

Create `test/clue-geometry.test.js`:

```js
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

test('all six suspects have a corridor start square', () => {
  assert.deepEqual(Object.keys(START_SQUARES).sort(), [...SUSPECTS].sort());
  for (const s of SUSPECTS) {
    assert.ok(BOARD.isCorridor(START_SQUARES[s]), `start for ${s} not corridor`);
  }
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

test('buildBoardSvg renders every room, door, and start (harness smoke)', () => {
  const svg = buildBoardSvg(BOARD, START_SQUARES);
  assert.match(svg, /^<svg/);
  for (const id of ROOMS) assert.ok(svg.includes(`data-room="${id}"`), `svg missing room ${id}`);
  for (const s of SUSPECTS) assert.ok(svg.includes(`data-start="${s}"`), `svg missing start ${s}`);
  assert.equal((svg.match(/data-door=/g) || []).length, 17);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-geometry.test.js`
Expected: FAIL — `Cannot find module '.../plugins/clue/server/geometry.js'` (and the render-board import).

- [ ] **Step 3: Write minimal implementation**

Create `plugins/clue/server/geometry.js`:

```js
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

// SEED geometry — internally consistent (passes all Task 1 assertions) but an
// approximation of the true board. Refine notched polygons + exact door
// thresholds offline via tools/render-board.mjs.  Room ids MUST match ROOMS.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clue-geometry.test.js` (requires Task 2's `render-board.mjs` to exist for the `buildBoardSvg` import — implement Task 2 first if running in strict order, OR temporarily comment the two `buildBoardSvg`-dependent assertions, then re-enable after Task 2). Recommended: implement Task 1 data + Task 2 harness together, then run this file once.
Expected: PASS (all geometry assertions green).

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/server/geometry.js test/clue-geometry.test.js
git commit -m "feat(clue): board geometry (grid, 9 rooms, 17 doors, secret passages)"
```

---

## Task 2: Offline render harness (`render-board.mjs`)

Reuses the Risk map-render-harness pattern: author `geometry.js`, render SVG→PNG via `rsvg-convert`, eyeball for OVERLAPS (same-quadrant gaps are invisible; only overlaps matter — which is why the programmatic non-overlap assertion lives in Task 1's test). This task provides the pure `buildBoardSvg` (unit-tested in Task 1) plus a CLI that shells to `rsvg-convert`.

**Files:**
- Create: `plugins/clue/tools/render-board.mjs`
- Test: covered by `test/clue-geometry.test.js` (`buildBoardSvg` smoke assertions, Task 1).

**Interfaces:**
- Consumes: `BOARD`, `START_SQUARES` from `../server/geometry.js`.
- Produces: `buildBoardSvg(geo = BOARD, starts = START_SQUARES) → svgString` — a self-contained SVG with a grid, one `<polygon data-room="<id>">` per room (distinct translucent fills so overlaps show as blended color), cellar shading, one `<rect data-door="<room>">` per door, and one `<circle data-start="<suspect>">` per start square. CLI `main` (run directly) writes `docs/clue-board.svg` and shells `rsvg-convert docs/clue-board.svg -o docs/clue-board.png`.

- [ ] **Step 1: Confirm the failing import**

The Task 1 test already imports `buildBoardSvg` from this module and asserts on its output (`buildBoardSvg renders every room...`). Run:

Run: `node --test test/clue-geometry.test.js`
Expected: FAIL — `Cannot find module '.../plugins/clue/tools/render-board.mjs'`.

- [ ] **Step 2: Write the implementation**

Create `plugins/clue/tools/render-board.mjs`:

```js
// Offline render harness (Risk map pattern). Composes the board geometry into a
// standalone SVG and (via CLI) shells to rsvg-convert to produce a PNG to eyeball
// for OVERLAPS. Room polygons must be clean non-overlapping (enforced
// programmatically in test/clue-geometry.test.js); door squares must sit on the
// corridor grid adjacent to their room.
//
//   node plugins/clue/tools/render-board.mjs   # writes docs/clue-board.{svg,png}
import { BOARD, START_SQUARES } from '../server/geometry.js';

const CELL = 10; // px per grid square
const ROOM_FILLS = [
  '#e6194B', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#469990',
];

export function buildBoardSvg(geo = BOARD, starts = START_SQUARES) {
  const W = geo.cols * CELL;
  const H = geo.rows * CELL;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
  ];

  // Grid lines.
  for (let c = 0; c <= geo.cols; c++) {
    parts.push(`<line x1="${c * CELL}" y1="0" x2="${c * CELL}" y2="${H}" stroke="#eeeeee"/>`);
  }
  for (let r = 0; r <= geo.rows; r++) {
    parts.push(`<line x1="0" y1="${r * CELL}" x2="${W}" y2="${r * CELL}" stroke="#eeeeee"/>`);
  }

  // Cellar shading (non-playable centre).
  for (const k of geo.cellarCells) {
    const [c, r] = k.split(',').map(Number);
    parts.push(`<rect x="${c * CELL}" y="${r * CELL}" width="${CELL}" height="${CELL}" fill="#000000" fill-opacity="0.25"/>`);
  }

  // Room polygons — translucent so any overlap renders as a blended patch.
  Object.entries(geo.rooms).forEach(([id, def], i) => {
    const pts = def.poly.map(([x, y]) => `${x * CELL},${y * CELL}`).join(' ');
    parts.push(`<polygon data-room="${id}" points="${pts}" fill="${ROOM_FILLS[i % ROOM_FILLS.length]}" fill-opacity="0.45" stroke="#333333"/>`);
    if (def.label) {
      parts.push(`<text x="${def.label[0] * CELL}" y="${def.label[1] * CELL}" font-size="7" fill="#111111">${id}</text>`);
    }
  });

  // Door thresholds (red squares) and secret-passage note.
  for (const d of geo.doors) {
    parts.push(`<rect data-door="${d.room}" x="${d.square[0] * CELL + 2}" y="${d.square[1] * CELL + 2}" width="${CELL - 4}" height="${CELL - 4}" fill="#cc0000"/>`);
  }

  // Start squares (blue rings).
  for (const [suspect, [c, r]] of Object.entries(starts)) {
    parts.push(`<circle data-start="${suspect}" cx="${c * CELL + CELL / 2}" cy="${r * CELL + CELL / 2}" r="${CELL / 2 - 1}" fill="none" stroke="#0000cc" stroke-width="1.5"/>`);
  }

  parts.push('</svg>');
  return parts.join('\n');
}

// CLI: write SVG + shell to rsvg-convert. Guarded so importing this module in
// tests never touches the filesystem or spawns a process.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const { writeFileSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const svg = buildBoardSvg();
  writeFileSync('docs/clue-board.svg', svg);
  try {
    execFileSync('rsvg-convert', ['docs/clue-board.svg', '-o', 'docs/clue-board.png']);
    console.log('wrote docs/clue-board.svg and docs/clue-board.png');
  } catch (err) {
    console.error('wrote docs/clue-board.svg; rsvg-convert failed:', err.message);
  }
}
```

- [ ] **Step 3: Run the harness test to verify it passes**

Run: `node --test test/clue-geometry.test.js`
Expected: PASS (including the three `buildBoardSvg` assertions).

- [ ] **Step 4: Manual offline verification (the eyeball loop)**

Run: `node plugins/clue/tools/render-board.mjs`
Then open `docs/clue-board.png`. Verify: no two room fills overlap into a blended patch; each red door square sits on a white corridor cell touching its room; blue start rings sit on the board edges matching the reference art. If anything is off, edit `BOARD_DATA` in `geometry.js` and re-run — this is the offline refinement loop; the non-overlap + door-adjacency assertions (Task 1) are the machine-checkable backstop. **`docs/clue-board.svg` and `docs/clue-board.png` are throwaway render artifacts — do not commit them.**

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/tools/render-board.mjs
git commit -m "feat(clue): offline rsvg-convert board render harness"
```

---

## Task 3: `movement.js` — reachable-squares BFS (self-avoiding walk)

**Files:**
- Create: `plugins/clue/server/rules/movement.js`
- Test: `test/clue-movement.test.js`

**Interfaces:**
- Consumes: a `geo` object (from `buildGeometry`); reads `state.pendingRoll`, `state.seatSuspect`, `state.pawns`.
- Produces:
  - `occupiedSquares(state, exceptSuspect) → Set<"c,r">` — corridor squares occupied by pawns other than `exceptSuspect` (pawns in rooms don't block).
  - `legalMoves(state, geo, seat) → { squares: [[c,r],...], rooms: [roomId,...] }` — corridor squares reachable by a self-avoiding orthogonal walk of length **exactly** `state.pendingRoll`, and rooms enterable via a doorway in **≤** `pendingRoll` steps. Excludes the turn-start room (no re-enter). Returns empty arrays when `pendingRoll` is falsy.
  - `secretPassageDest(geo, roomId) → roomId | null`.

- [ ] **Step 1: Write the failing test**

Create `test/clue-movement.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildGeometry } from '../plugins/clue/server/geometry.js';
import { legalMoves, secretPassageDest, occupiedSquares } from '../plugins/clue/server/rules/movement.js';

// Synthetic 6x6 board: room ra (cols 0-1, rows 0-1) with door threshold [2,1];
// room rb (cols 4-5, rows 4-5) with door threshold [3,4]; secret passage ra<->rb.
function miniGeo() {
  return buildGeometry({
    cols: 6, rows: 6,
    rooms: {
      ra: { poly: [[0, 0], [2, 0], [2, 2], [0, 2]] },
      rb: { poly: [[4, 4], [6, 4], [6, 6], [4, 6]] },
    },
    doors: [{ room: 'ra', square: [2, 1] }, { room: 'rb', square: [3, 4] }],
    secretPassages: { ra: 'rb', rb: 'ra' },
    cellar: null,
  });
}

// Minimal state: legalMoves reads only pendingRoll, seatSuspect, pawns.
function st(pawns, pendingRoll) {
  return { pendingRoll, seatSuspect: ['scarlett', 'mustard'], pawns };
}
const asSet = (squares) => new Set(squares.map(([c, r]) => `${c},${r}`));

test('die=1: reachable = orthogonal corridor neighbours only (no diagonal)', () => {
  const s = st({ scarlett: { square: [2, 2] }, mustard: { room: 'rb' } }, 1);
  const { squares, rooms } = legalMoves(s, miniGeo(), 0);
  assert.deepEqual(asSet(squares), asSet([[2, 1], [2, 3], [3, 2], [1, 2]]));
  assert.ok(!asSet(squares).has('3,3')); // diagonal excluded
  assert.deepEqual(rooms, []);           // room entry would be 2 steps > die
});

test('exact-count: die=2 does not include the start square, and reaches ra', () => {
  const s = st({ scarlett: { square: [2, 2] }, mustard: { room: 'rb' } }, 2);
  const { squares, rooms } = legalMoves(s, miniGeo(), 0);
  assert.ok(!asSet(squares).has('2,2'));  // may not stay put
  assert.ok(rooms.includes('ra'));        // reach door [2,1] in 1, enter in 2
});

test('room entry ignores excess pips (die > distance to door)', () => {
  const s = st({ scarlett: { square: [2, 1] }, mustard: { room: 'rb' } }, 5);
  const { rooms } = legalMoves(s, miniGeo(), 0);
  assert.ok(rooms.includes('ra')); // enter in 1 step though die=5
});

test('no re-enter the same room in one turn', () => {
  const s = st({ scarlett: { room: 'ra' }, mustard: { room: 'rb' } }, 6);
  const { rooms } = legalMoves(s, miniGeo(), 0);
  assert.ok(!rooms.includes('ra'), 'cannot re-enter start room');
  assert.ok(rooms.includes('rb'), 'can reach the other room within 6 steps');
});

test('blocking: cannot pass through or land on an occupied square', () => {
  const s = st({ scarlett: { square: [2, 2] }, mustard: { square: [2, 3] } }, 2);
  const { squares } = legalMoves(s, miniGeo(), 0);
  assert.ok(!asSet(squares).has('2,3'), 'occupied square excluded');
  assert.ok(!asSet(squares).has('2,4'), 'cannot pass through [2,3] to reach [2,4]');
});

test('occupiedSquares ignores the mover and room-bound pawns', () => {
  const s = st({ scarlett: { square: [2, 2] }, mustard: { room: 'rb' } }, 1);
  const occ = occupiedSquares(s, 'scarlett');
  assert.equal(occ.size, 0); // mustard is in a room, scarlett is excluded
});

test('pendingRoll falsy -> no moves', () => {
  const s = st({ scarlett: { square: [2, 2] }, mustard: { room: 'rb' } }, null);
  assert.deepEqual(legalMoves(s, miniGeo(), 0), { squares: [], rooms: [] });
});

test('secretPassageDest returns the opposite corner or null', () => {
  assert.equal(secretPassageDest(miniGeo(), 'ra'), 'rb');
  assert.equal(secretPassageDest(miniGeo(), 'rb'), 'ra');
  assert.equal(secretPassageDest(miniGeo(), 'nowhere'), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-movement.test.js`
Expected: FAIL — `Cannot find module '.../plugins/clue/server/rules/movement.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `plugins/clue/server/rules/movement.js`:

```js
// Reachable-squares enumeration for the Clue move phase. Pure; geometry is
// injected so the algorithm is tested against a synthetic board. Movement is a
// self-avoiding orthogonal walk: corridor destinations require EXACTLY `die`
// steps; a room is enterable via a doorway in <= `die` steps (excess ignored),
// and entry ends the move. Occupied corridor squares block passage; the
// turn-start room cannot be re-entered.
const key = ([c, r]) => `${c},${r}`;
const ortho = ([c, r]) => [[c, r - 1], [c, r + 1], [c + 1, r], [c - 1, r]];

export function occupiedSquares(state, exceptSuspect) {
  const occ = new Set();
  for (const [suspect, loc] of Object.entries(state.pawns)) {
    if (suspect === exceptSuspect) continue;
    if (loc && Array.isArray(loc.square)) occ.add(key(loc.square));
  }
  return occ;
}

export function secretPassageDest(geo, roomId) {
  return geo.secretPassages[roomId] ?? null;
}

export function legalMoves(state, geo, seat) {
  const die = state.pendingRoll;
  if (!die) return { squares: [], rooms: [] };

  const suspect = state.seatSuspect[seat];
  const loc = state.pawns[suspect];
  const startRoom = loc && loc.room ? loc.room : null;
  const occ = occupiedSquares(state, suspect);

  const squares = new Set(); // "c,r" reachable at EXACTLY `die`
  const rooms = new Set();   // rooms enterable at <= `die`

  // From a corridor square `sq` already reached in `steps`, try entering an
  // adjacent room (via a door at this square) and continue the walk.
  function walk(sq, steps, visited) {
    for (const rm of geo.doorsBySquare.get(key(sq)) ?? []) {
      if (rm !== startRoom && steps + 1 <= die) rooms.add(rm);
    }
    if (steps === die) { squares.add(key(sq)); return; }
    for (const nb of ortho(sq)) {
      const k = key(nb);
      if (!geo.isCorridor(nb) || occ.has(k) || visited.has(k)) continue;
      visited.add(k);
      walk(nb, steps + 1, visited);
      visited.delete(k);
    }
  }

  if (startRoom) {
    // Exit through each door: stepping onto the (unoccupied) threshold is step 1.
    for (const dsq of geo.doorsByRoom.get(startRoom) ?? []) {
      if (occ.has(key(dsq)) || !geo.isCorridor(dsq)) continue; // blocked doorway
      walk(dsq, 1, new Set([key(dsq)]));
    }
  } else if (loc && Array.isArray(loc.square)) {
    walk(loc.square, 0, new Set([key(loc.square)]));
  }

  return {
    squares: [...squares].map((s) => s.split(',').map(Number)),
    rooms: [...rooms],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clue-movement.test.js`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/server/rules/movement.js test/clue-movement.test.js
git commit -m "feat(clue): reachable-squares BFS (orthogonal, exact-count, blocking, no-re-enter)"
```

---

## Task 4: Place pawns on start squares + `pendingRoll` in `buildInitialState`

Plan 1 left `pawns[s] = { room: null }` with the comment "Plan 2 assigns start squares." This task delivers that: all six suspect pawns start on their `START_SQUARES` corridor cell, and the state gains `pendingRoll: null`. **This intentionally changes ONE Plan 1 assertion** (`test/clue-state.test.js` "all 6 pawns exist off-board").

**Files:**
- Modify: `plugins/clue/server/state.js`
- Modify (test): `test/clue-state.test.js`

**Interfaces:**
- Consumes: `START_SQUARES` from `./geometry.js`.
- Produces: initial `state.pawns[suspect] = { square: [col,row] }` for all 6 suspects; `state.pendingRoll = null`. All other Plan 1 fields unchanged.

- [ ] **Step 1: Update the Plan 1 test to the new (correct) behaviour**

In `test/clue-state.test.js`, REPLACE the test `each seat controls a distinct suspect; all 6 pawns exist off-board` with:

```js
import { START_SQUARES } from '../plugins/clue/server/geometry.js';

test('each seat controls a distinct suspect; all 6 pawns start on their start square', () => {
  const s = buildInitialState({ participants: parts(4), rng: seededRng(3) });
  assert.equal(s.seatSuspect.length, 4);
  assert.equal(new Set(s.seatSuspect).size, 4);
  for (const sus of s.seatSuspect) assert.ok(SUSPECTS.includes(sus));
  assert.equal(Object.keys(s.pawns).length, 6);
  for (const sus of SUSPECTS) {
    assert.deepEqual(s.pawns[sus], { square: [...START_SQUARES[sus]] });
  }
});

test('initial state awaits a roll (pendingRoll null)', () => {
  const s = buildInitialState({ participants: parts(3), rng: seededRng(7) });
  assert.equal(s.pendingRoll, null);
});
```

(The `import { START_SQUARES }` line goes at the top of the file with the other imports.)

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-state.test.js`
Expected: FAIL — pawns are `{ room: null }`, not `{ square: [...] }`; and `pendingRoll` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `plugins/clue/server/state.js`, update the import and the pawn placement + add `pendingRoll`:

```js
import { shuffle } from '../../../src/shared/cards/deck.js';
import { SUSPECTS, WEAPONS, ROOMS, dealCards } from './cards.js';
import { START_SQUARES } from './geometry.js';
```

Replace the pawn-placement block:

```js
  // All six suspect pawns are on the board at all times (canonical). Each starts
  // on its canonical corridor start square (see geometry.js START_SQUARES).
  const pawns = {};
  SUSPECTS.forEach((s) => { pawns[s] = { square: [...START_SQUARES[s]] }; });
```

And add `pendingRoll: null` to the returned state object (alongside `suggestion: null`):

```js
    suggestion: null,
    pendingRoll: null,
    log: [],
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/clue-state.test.js`
Expected: PASS (all state tests, including the two updated ones).

Also run the full Plan 1 suite to confirm nothing else regressed:

Run: `node --test test/clue-*.test.js`
Expected: PASS (Plan 1 suggest/refute/accuse/pass/view tests still green; the enterRoom/suggest fixtures build their own pawns, so they are unaffected).

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/server/state.js test/clue-state.test.js
git commit -m "feat(clue): place pawns on start squares, add pendingRoll to initial state"
```

---

## Task 5: `roll` action + `pendingRoll` lifecycle

Adds the client-supplied die-value action and threads `pendingRoll` clearing through the existing turn-transition reducers so a stale roll never leaks into the next seat's turn.

**Files:**
- Modify: `plugins/clue/server/actions.js`
- Test: `test/clue-actions-movement.test.js`

**Interfaces:**
- Consumes: `BOARD` from `./geometry.js` (default `geo`).
- Produces:
  - `applyClueAction` gains `geo = BOARD` in its destructured args and a `case 'roll'`.
  - `doRoll(state, seat, payload)` — currentSeat, phase `'move'`, `pendingRoll === null`, integer `value` 1–6 → sets `next.pendingRoll = value`; stays in `'move'`; `activeUserId` unchanged.
  - `doEnterRoom`, `doPass`, `doAccuse` (wrong-accusation branch) each set `next.pendingRoll = null` on the transitions they own.

- [ ] **Step 1: Write the failing test**

Create `test/clue-actions-movement.test.js` (this file grows in Tasks 6–7):

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClueAction } from '../plugins/clue/server/actions.js';
import { buildGeometry } from '../plugins/clue/server/geometry.js';

// Synthetic board shared with the movement unit tests.
function miniGeo() {
  return buildGeometry({
    cols: 6, rows: 6,
    rooms: {
      ra: { poly: [[0, 0], [2, 0], [2, 2], [0, 2]] },
      rb: { poly: [[4, 4], [6, 4], [6, 6], [4, 6]] },
    },
    doors: [{ room: 'ra', square: [2, 1] }, { room: 'rb', square: [3, 4] }],
    secretPassages: { ra: 'rb', rb: 'ra' },
    cellar: null,
  });
}

// 2-seat state, seat 0 (userId 7) on turn in phase 'move'.
function fixture() {
  return {
    seats: [7, 8],
    phase: 'move',
    currentSeat: 0,
    activeUserId: 7,
    envelope: { suspect: 'plum', weapon: 'rope', room: 'study' },
    hands: [['mustard'], ['green']],
    pawns: { scarlett: { square: [2, 2] }, mustard: { room: 'rb' },
             white: { square: [0, 5] }, green: { square: [5, 0] },
             peacock: { square: [0, 3] }, plum: { square: [5, 5] } },
    weapons: {},
    seatSuspect: ['scarlett', 'mustard'],
    eliminated: [false, false],
    ledgers: [[], []],
    suggestion: null,
    pendingRoll: null,
    log: [],
  };
}

test('roll records a client-supplied die value and stays in move phase', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'roll', payload: { value: 3 } }, actorId: 7, geo: miniGeo() });
  assert.equal(r.error, undefined);
  assert.equal(r.state.pendingRoll, 3);
  assert.equal(r.state.phase, 'move');
  assert.equal(r.state.activeUserId, 7);
});

test('roll rejects non-1-6 values, double roll, wrong seat, wrong phase', () => {
  assert.match(applyClueAction({ state: fixture(), action: { type: 'roll', payload: { value: 0 } }, actorId: 7, geo: miniGeo() }).error, /1-6|die/);
  assert.match(applyClueAction({ state: fixture(), action: { type: 'roll', payload: { value: 7 } }, actorId: 7, geo: miniGeo() }).error, /1-6|die/);
  assert.match(applyClueAction({ state: fixture(), action: { type: 'roll', payload: { value: 2.5 } }, actorId: 7, geo: miniGeo() }).error, /1-6|die/);
  const rolled = { ...fixture(), pendingRoll: 4 };
  assert.match(applyClueAction({ state: rolled, action: { type: 'roll', payload: { value: 3 } }, actorId: 7, geo: miniGeo() }).error, /already rolled/);
  assert.match(applyClueAction({ state: fixture(), action: { type: 'roll', payload: { value: 3 } }, actorId: 8, geo: miniGeo() }).error, /not your turn/);
  const suggesting = { ...fixture(), phase: 'suggest' };
  assert.match(applyClueAction({ state: suggesting, action: { type: 'roll', payload: { value: 3 } }, actorId: 7, geo: miniGeo() }).error, /phase/);
});

test('pass clears a leftover pendingRoll for the next seat', () => {
  const s = { ...fixture(), pendingRoll: 5 };
  const r = applyClueAction({ state: s, action: { type: 'pass', payload: {} }, actorId: 7 });
  assert.equal(r.state.pendingRoll, null);
  assert.equal(r.state.currentSeat, 1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-actions-movement.test.js`
Expected: FAIL — `unknown action 'roll'` (and `pass` leaves `pendingRoll` at 5).

- [ ] **Step 3: Write minimal implementation**

In `plugins/clue/server/actions.js`:

Add imports at the top (below the existing imports):

```js
import { BOARD } from './geometry.js';
import { legalMoves, secretPassageDest } from './rules/movement.js';
```

Change the `applyClueAction` signature and switch to accept `geo` and route `roll` (the `move`/`secretPassage` cases are added in Tasks 6–7):

```js
export function applyClueAction({ state, action, actorId, geo = BOARD }) {
  const seat = actorSeat(state, actorId);
  if (seat === null) return { error: 'not a participant' };
  switch (action.type) {
    case 'roll': return doRoll(state, seat, action.payload);
    case 'move': return doMove(state, seat, action.payload, geo);
    case 'secretPassage': return doSecretPassage(state, seat, geo);
    case 'enterRoom': return doEnterRoom(state, seat, action.payload);
    case 'suggest': return doSuggest(state, seat, action.payload);
    case 'refute': return doRefute(state, seat, action.payload);
    case 'accuse': return doAccuse(state, seat, action.payload);
    case 'pass': return doPass(state, seat);
    default: return { error: `unknown action '${action.type}'` };
  }
}
```

Add `doRoll` (place near `doEnterRoom`):

```js
function doRoll(state, seat, payload) {
  if (seat !== state.currentSeat) return { error: 'not your turn' };
  if (state.phase !== 'move') return { error: `cannot roll in phase '${state.phase}'` };
  if (state.pendingRoll != null) return { error: 'already rolled this turn' };
  const value = payload?.value;
  if (!Number.isInteger(value) || value < 1 || value > 6) {
    return { error: 'die value must be an integer 1-6' };
  }
  const next = clone(state);
  next.pendingRoll = value;
  return { state: next };
}
```

Thread `pendingRoll` clearing into the three transition reducers. In `doEnterRoom`, add `next.pendingRoll = null;` before the `return`:

```js
  const next = clone(state);
  next.pawns[next.seatSuspect[seat]] = { room };
  next.pendingRoll = null;
  next.phase = 'suggest';
  next.activeUserId = next.seats[seat];
  return { state: next };
```

In `doPass`, add `next.pendingRoll = null;` before the `return`:

```js
  const next = clone(state);
  const nseat = nextSeat(next, seat);
  next.currentSeat = nseat;
  next.phase = 'move';
  next.activeUserId = next.seats[nseat];
  next.suggestion = null;
  next.pendingRoll = null;
  return { state: next };
```

In `doAccuse`, in the wrong-accusation advance branch, add `next.pendingRoll = null;` before its `return`:

```js
  const nseat = nextSeat(next, seat);
  next.currentSeat = nseat;
  next.phase = 'move';
  next.activeUserId = next.seats[nseat];
  next.suggestion = null;
  next.pendingRoll = null;
  return { state: next };
```

> **Note for the implementer:** `doMove` and `doSecretPassage` are referenced by the switch but not yet defined — add temporary stubs `function doMove(){ return { error: 'not implemented' }; }` and `function doSecretPassage(){ return { error: 'not implemented' }; }` at the end of the file so the module loads; Tasks 6–7 replace them. (Same stub-then-replace pattern Plan 1 used for refute/accuse/pass.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/clue-actions-movement.test.js`
Expected: PASS (3 tests).

Run: `node --test test/clue-*.test.js`
Expected: PASS (adding `pendingRoll: null` to `doPass`/`doAccuse`/`doEnterRoom` transitions is inert for Plan 1 tests, which don't assert on `pendingRoll`).

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/server/actions.js test/clue-actions-movement.test.js
git commit -m "feat(clue): roll action (client-supplied die) + pendingRoll lifecycle"
```

---

## Task 6: `move` action (corridor destination + room entry via `doEnterRoom`)

**Files:**
- Modify: `plugins/clue/server/actions.js` (replace the `doMove` stub)
- Test: `test/clue-actions-movement.test.js`

**Interfaces:**
- Consumes: `legalMoves(state, geo, seat)` from `movement.js`; `doEnterRoom` (existing).
- Produces: `doMove(state, seat, payload, geo)` handling `{ type: 'move', payload: { square: [c,r] } | { room } }`:
  - Guards: currentSeat, phase `'move'`, `pendingRoll != null`.
  - `{ room }` → must be in `legalMoves(...).rooms` → delegate to `doEnterRoom(state, seat, { room })` (which clears `pendingRoll`, places the pawn, → `'suggest'`). This is the AC#2 "route room entry through the existing enterRoom reducer; entering a room ends the move" requirement.
  - `{ square }` → must be in `legalMoves(...).squares` → set `next.pawns[suspect] = { square }`, clear `pendingRoll`, phase → `'accuse-or-pass'` (per spec §5: no room reached → accuse-or-pass), `activeUserId` unchanged.
  - Unreachable / malformed target → `{ error }`.

- [ ] **Step 1: Write the failing test**

Append to `test/clue-actions-movement.test.js`:

```js
test('move to a reachable corridor square ends movement at accuse-or-pass', () => {
  const s = { ...fixture(), pendingRoll: 1 }; // scarlett at [2,2]
  const r = applyClueAction({ state: s, action: { type: 'move', payload: { square: [2, 3] } }, actorId: 7, geo: miniGeo() });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.state.pawns.scarlett, { square: [2, 3] });
  assert.equal(r.state.pendingRoll, null);
  assert.equal(r.state.phase, 'accuse-or-pass');
  assert.equal(r.state.activeUserId, 7);
});

test('move rejects an unreachable / diagonal / pre-roll square', () => {
  const rolled = { ...fixture(), pendingRoll: 1 };
  assert.match(applyClueAction({ state: rolled, action: { type: 'move', payload: { square: [3, 3] } }, actorId: 7, geo: miniGeo() }).error, /not reachable/);
  const notRolled = fixture(); // pendingRoll null
  assert.match(applyClueAction({ state: notRolled, action: { type: 'move', payload: { square: [2, 3] } }, actorId: 7, geo: miniGeo() }).error, /roll/);
});

test('move into a reachable room routes through enterRoom (-> suggest)', () => {
  // scarlett on ra door threshold [2,1], die 1 -> may enter ra.
  const s = { ...fixture(), pendingRoll: 1 };
  s.pawns = { ...s.pawns, scarlett: { square: [2, 1] } };
  const r = applyClueAction({ state: s, action: { type: 'move', payload: { room: 'ra' } }, actorId: 7, geo: miniGeo() });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.state.pawns.scarlett, { room: 'ra' });
  assert.equal(r.state.phase, 'suggest');
  assert.equal(r.state.pendingRoll, null);
});

test('move rejects entering an unreachable room', () => {
  const s = { ...fixture(), pendingRoll: 1 }; // scarlett at [2,2], rb far away
  assert.match(applyClueAction({ state: s, action: { type: 'move', payload: { room: 'rb' } }, actorId: 7, geo: miniGeo() }).error, /not reachable/);
});

test('move rejects the wrong seat', () => {
  const s = { ...fixture(), pendingRoll: 1 };
  assert.match(applyClueAction({ state: s, action: { type: 'move', payload: { square: [2, 3] } }, actorId: 8, geo: miniGeo() }).error, /not your turn/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-actions-movement.test.js`
Expected: FAIL — `doMove` stub returns `{ error: 'not implemented' }`.

- [ ] **Step 3: Write minimal implementation**

In `plugins/clue/server/actions.js`, replace the `doMove` stub with:

```js
function doMove(state, seat, payload, geo) {
  if (seat !== state.currentSeat) return { error: 'not your turn' };
  if (state.phase !== 'move') return { error: `cannot move in phase '${state.phase}'` };
  if (state.pendingRoll == null) return { error: 'roll before moving' };

  const { squares, rooms } = legalMoves(state, geo, seat);

  if (payload?.room != null) {
    if (!rooms.includes(payload.room)) return { error: 'that room is not reachable this turn' };
    // Entering a room ends the move; route through the existing reducer.
    return doEnterRoom(state, seat, { room: payload.room });
  }

  const sq = payload?.square;
  const reachable = Array.isArray(sq)
    && squares.some(([c, r]) => c === sq[0] && r === sq[1]);
  if (!reachable) return { error: 'that square is not reachable this turn' };

  const next = clone(state);
  next.pawns[next.seatSuspect[seat]] = { square: [sq[0], sq[1]] };
  next.pendingRoll = null;
  next.phase = 'accuse-or-pass';
  next.activeUserId = next.seats[seat];
  return { state: next };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/clue-actions-movement.test.js`
Expected: PASS (roll + move tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/server/actions.js test/clue-actions-movement.test.js
git commit -m "feat(clue): move action (corridor + room entry via doEnterRoom)"
```

---

## Task 7: `secretPassage` action (corner-room leap, no roll)

**Files:**
- Modify: `plugins/clue/server/actions.js` (replace the `doSecretPassage` stub)
- Test: `test/clue-actions-movement.test.js`

**Interfaces:**
- Consumes: `secretPassageDest(geo, roomId)` from `movement.js`; `doEnterRoom` (existing).
- Produces: `doSecretPassage(state, seat, geo)` handling `{ type: 'secretPassage' }`:
  - Guards: currentSeat, phase `'move'`, `pendingRoll == null` (a passage is taken instead of rolling), pawn currently in a corner room that has a passage.
  - Effect: `doEnterRoom(state, seat, { room: destination })` — the leap lands you in the opposite corner room and, like any room entry, ends the move → `'suggest'`.
  - Not in a passage room / already rolled → `{ error }`.

- [ ] **Step 1: Write the failing test**

Append to `test/clue-actions-movement.test.js`:

```js
test('secret passage leaps to the opposite corner and offers a suggestion', () => {
  const s = fixture(); // pendingRoll null, phase 'move'
  s.pawns = { ...s.pawns, scarlett: { room: 'ra' } };
  const r = applyClueAction({ state: s, action: { type: 'secretPassage', payload: {} }, actorId: 7, geo: miniGeo() });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.state.pawns.scarlett, { room: 'rb' });
  assert.equal(r.state.phase, 'suggest');
  assert.equal(r.state.pendingRoll, null);
});

test('secret passage rejected when not in a passage room', () => {
  const s = fixture(); // scarlett on a corridor square
  assert.match(applyClueAction({ state: s, action: { type: 'secretPassage', payload: {} }, actorId: 7, geo: miniGeo() }).error, /no secret passage/);
});

test('secret passage rejected after rolling', () => {
  const s = { ...fixture(), pendingRoll: 4 };
  s.pawns = { ...s.pawns, scarlett: { room: 'ra' } };
  assert.match(applyClueAction({ state: s, action: { type: 'secretPassage', payload: {} }, actorId: 7, geo: miniGeo() }).error, /after rolling/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-actions-movement.test.js`
Expected: FAIL — `doSecretPassage` stub returns `{ error: 'not implemented' }`.

- [ ] **Step 3: Write minimal implementation**

In `plugins/clue/server/actions.js`, replace the `doSecretPassage` stub with:

```js
function doSecretPassage(state, seat, geo) {
  if (seat !== state.currentSeat) return { error: 'not your turn' };
  if (state.phase !== 'move') return { error: `cannot use a secret passage in phase '${state.phase}'` };
  if (state.pendingRoll != null) return { error: 'cannot use a secret passage after rolling' };
  const loc = state.pawns[state.seatSuspect[seat]];
  const from = loc && loc.room ? loc.room : null;
  const dest = from ? secretPassageDest(geo, from) : null;
  if (!dest) return { error: 'no secret passage from your location' };
  // The leap lands in the opposite corner room and ends the move (-> suggest).
  return doEnterRoom(state, seat, { room: dest });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/clue-actions-movement.test.js`
Expected: PASS (roll + move + secretPassage tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/server/actions.js test/clue-actions-movement.test.js
git commit -m "feat(clue): secret-passage leap action (corner rooms, no roll)"
```

---

## Task 8: Surface reachable moves in `cluePublicView` (active seat only)

**Files:**
- Modify: `plugins/clue/server/view.js`
- Test: `test/clue-view.test.js`

**Interfaces:**
- Consumes: `BOARD` (default `geo`), `legalMoves`, `secretPassageDest`.
- Produces: `cluePublicView({ state, viewerId, geo = BOARD })` gains:
  - top-level `pendingRoll: state.pendingRoll ?? null` (public — the die value everyone sees).
  - `movement` — non-null ONLY when `viewerId === state.activeUserId`, that seat is not eliminated, and `phase === 'move'`. Shape:
    - awaiting roll (`pendingRoll == null`): `{ needsRoll: true, secretPassage: <roomId|null> }` (the passage destination if the pawn is in a corner room).
    - after roll: `{ needsRoll: false, pendingRoll, squares: [[c,r],...], rooms: [roomId,...] }`.
  - For every other viewer (including the currentSeat when it is NOT the active input seat, e.g. during `refute`), `movement` is `null` — mirroring the existing rule that reachability is disclosed only to `activeUserId`.

- [ ] **Step 1: Write the failing test**

Append to `test/clue-view.test.js`:

```js
import { buildGeometry } from '../plugins/clue/server/geometry.js';

function moveGeo() {
  return buildGeometry({
    cols: 6, rows: 6,
    rooms: {
      ra: { poly: [[0, 0], [2, 0], [2, 2], [0, 2]] },
      rb: { poly: [[4, 4], [6, 4], [6, 6], [4, 6]] },
    },
    doors: [{ room: 'ra', square: [2, 1] }, { room: 'rb', square: [3, 4] }],
    secretPassages: { ra: 'rb', rb: 'ra' },
    cellar: null,
  });
}

// Seat 0 (userId 7) on turn in phase 'move'.
function moveState(overrides = {}) {
  return {
    seats: [7, 8],
    phase: 'move',
    currentSeat: 0,
    activeUserId: 7,
    envelope: { suspect: 'plum', weapon: 'rope', room: 'study' },
    hands: [['mustard'], ['green']],
    pawns: { scarlett: { square: [2, 2] }, mustard: { room: 'rb' },
             white: { square: [0, 5] }, green: { square: [5, 0] },
             peacock: { square: [0, 3] }, plum: { square: [5, 5] } },
    weapons: {}, seatSuspect: ['scarlett', 'mustard'],
    eliminated: [false, false], ledgers: [[], []],
    suggestion: null, pendingRoll: null, log: [],
    ...overrides,
  };
}

test('active seat awaiting a roll sees a needsRoll affordance', () => {
  const s = moveState();
  s.pawns.scarlett = { room: 'ra' }; // in a corner room
  const v = cluePublicView({ state: s, viewerId: 7, geo: moveGeo() });
  assert.equal(v.pendingRoll, null);
  assert.deepEqual(v.movement, { needsRoll: true, secretPassage: 'rb' });
});

test('active seat after rolling sees reachable squares and rooms', () => {
  const v = cluePublicView({ state: moveState({ pendingRoll: 1 }), viewerId: 7, geo: moveGeo() });
  assert.equal(v.movement.needsRoll, false);
  assert.equal(v.movement.pendingRoll, 1);
  assert.equal(new Set(v.movement.squares.map((s) => s.join(','))).has('2,3'), true);
});

test('LEAK GUARD: reachable moves are hidden from the non-active seat', () => {
  const v = cluePublicView({ state: moveState({ pendingRoll: 1 }), viewerId: 8, geo: moveGeo() });
  assert.equal(v.movement, null);
});

test('movement is null outside the move phase', () => {
  const v = cluePublicView({ state: moveState({ phase: 'suggest', pendingRoll: null }), viewerId: 7, geo: moveGeo() });
  assert.equal(v.movement, null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-view.test.js`
Expected: FAIL — `v.movement` is `undefined`; `v.pendingRoll` is `undefined`.

- [ ] **Step 3: Write minimal implementation**

In `plugins/clue/server/view.js`, add imports at the top:

```js
import { BOARD } from './geometry.js';
import { legalMoves, secretPassageDest } from './rules/movement.js';
```

Change the signature to `export function cluePublicView({ state, viewerId, geo = BOARD }) {`.

After the `suggestion` block and before the `return`, compute `movement`:

```js
  let movement = null;
  const isActive = seat !== null && viewerId === state.activeUserId && !state.eliminated[seat];
  if (isActive && state.phase === 'move') {
    if (state.pendingRoll == null) {
      const loc = state.pawns[state.seatSuspect[seat]];
      const room = loc && loc.room ? loc.room : null;
      movement = { needsRoll: true, secretPassage: room ? secretPassageDest(geo, room) : null };
    } else {
      const { squares, rooms } = legalMoves(state, geo, seat);
      movement = { needsRoll: false, pendingRoll: state.pendingRoll, squares, rooms };
    }
  }
```

Add `pendingRoll` and `movement` to the returned object (near `winnerSeat`):

```js
    winnerSeat: state.winnerSeat ?? null,
    pendingRoll: state.pendingRoll ?? null,
    movement,
    // envelope, hands, ledgers are intentionally NOT copied out.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/clue-view.test.js`
Expected: PASS (Plan 1 view tests still green — they add `pendingRoll:null`/`movement:null` keys but assert only on specific fields; the new movement tests pass).

- [ ] **Step 5: Run the full clue suite and commit**

Run: `node --test test/clue-*.test.js`
Expected: PASS (all clue tests green — Plan 1 E6-1/E6-2 + Plan 2 E6-3).

```bash
git add plugins/clue/server/view.js test/clue-view.test.js
git commit -m "feat(clue): surface reachable moves in cluePublicView for the active seat"
```

---

## Self-Review

**1. Spec coverage (E6-3 slice — spec §3, §4-pawns, §5-movement):**
- AC#1 — `geometry.js` (grid + 9 rooms + doors + 2 secret-passage edges), verified offline via `rsvg-convert`, non-overlapping room polygons via a programmatic assertion → Task 1 (data + non-overlap/adjacency/count/symmetry assertions) + Task 2 (render harness). ✅
- AC#2 — `roll` (client-supplied die) + `move` enforcing orthogonal movement, no-revisit-in-turn, no-move-through-occupied; room entry routed through the existing `enterRoom` reducer; entering a room ends the move; reachable squares via BFS to depth = die surfaced in `cluePublicView` for `activeUserId` only → Tasks 3 (reachability), 5 (roll), 6 (move), 8 (view). ✅
- Secret-passage leap (corner room → opposite corner, no roll) → Task 7. ✅
- "Cannot leave and re-enter the same room in one turn" → Task 3 (`legalMoves` excludes `startRoom`), tested. ✅
- All 6 pawns start on canonical start squares (spec §4 "all 6 pawns on the board") → Task 4. ✅
- Blocked doorway (occupied threshold) unusable → Task 3 (`occ.has(dsq)` skip), covered by blocking test. ✅
- **Deferred, flagged (NOT built):** React client + client mirror geometry + client half of drift guard/fixtures (Plan 4); bots (Plan 3); `plugin.js` + registration (Plan 4); "suggest-in-place when dragged into a room" turn-flow affordance (Plan 4 / Delivery Finding). Reachability edge case: if `legalMoves` returns empty (no legal corridor destination and no enterable room — rare on the open board), the player's escape hatch is `pass` (allowed in phase `'move'`, clears `pendingRoll`). ✅

**2. Placeholder scan:** No TBD/TODO in code steps; every code step shows complete code. The `doMove`/`doSecretPassage` stubs introduced in Task 5 are explicitly replaced with full implementations in Tasks 6–7 (same stub-then-replace pattern Plan 1 used for refute/accuse/pass). Seed geometry coordinates are labelled approximations refined via the Task 2 harness, but they are internally consistent and pass every Task 1 assertion as written. ✅

**3. Type consistency:** `applyClueAction({state, action, actorId, geo=BOARD})`, `cluePublicView({state, viewerId, geo=BOARD})`, `buildGeometry(data)→geo`, `legalMoves(state, geo, seat)→{squares:[[c,r]], rooms:[id]}`, `secretPassageDest(geo, room)→id|null`, `occupiedSquares(state, exceptSuspect)→Set`. Location shape `{square:[col,row]}` / `{room:id}` is used identically in `state.js`, `movement.js`, `actions.js`, `view.js`. `pendingRoll` (int|null) is initialized in Task 4 and cleared on every turn transition (Task 5). Geometry `geo` fields (`isCorridor`, `doorsBySquare`, `doorsByRoom`, `secretPassages`, `roomCells`, `cellarCells`) are produced by `buildGeometry` (Task 1) and consumed by `movement.js` (Task 3) and the harness (Task 2) with matching names. Room ids everywhere are the `cards.js` catalog ids. ✅

---

## Execution Handoff

Plan complete. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task with two-stage review between tasks (superpowers:subagent-driven-development).
2. **Inline Execution** — batch execution with checkpoints (superpowers:executing-plans).

**Implementation ordering note:** Task 1's test imports `buildBoardSvg` from Task 2's module, so implement Task 1 (data) and Task 2 (harness) as a pair before running `test/clue-geometry.test.js`. Tasks 3–8 are strictly sequential (movement → state → roll → move → secretPassage → view).
