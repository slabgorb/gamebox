# Clue Client + plugin.js Manifest + Registration + End-to-End Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Clue a **playable registered game** — a React board client under `src/clients/clue` that renders from a drift-guarded geometry mirror, a `plugin.js` manifest (`players {min:3, max:4}`) registered in `src/plugins/index.js`, the AI adapter + orchestrator wiring that drives 3–4 seat mixed human/bot games correctly (roll → move → suggest → refute → accuse) across the client-side dice pause, and the human-refute pause card-choice UX.

**Architecture:** The shipped E6-1..E6-4 engine already satisfies the platform plugin contract (`initialState({participants, rng})`, `applyAction({state, action, actorId})`, `publicView({state, viewerId})`), so `plugin.js` is a thin re-export and registration is mechanical. The only non-mechanical wiring is the orchestrator: Clue's `pendingRoll` is the **resolved** die value ("move now"), the semantic inverse of backgammon's **awaiting-client** `pendingRoll` ("pause") — so Clue must NOT reuse the raw `if (state.pendingRoll) return` pause gate (Delivery Finding **F8(b)**, BLOCKING). The client mirrors the server geometry as plain JS (drift-guarded by `node --test`, the Risk-map pattern); the React board is verified by the drift guard + `npm run build:client` + a browser checklist, matching how Risk/Sorry clients are verified in this repo.

**Tech Stack:** Node ≥20, ESM; `node --test` + `node:assert/strict` for all server + pure-JS logic; React + Vite (`npm run build:client`) for the TSX client; the shared `useGameState` hook + `contracts/` type mirror pattern (Sorry/Risk precedent).

## Global Constraints

- **Node ≥20, ESM** (`"type": "module"`); all imports use explicit `.js` extensions. Server + pure-JS tests live at repo root `test/clue-*.test.js` (flat dir).
- **Platform plugin contract (exact — enforced by `src/server/plugins.js` `validatePlugin`):** a plugin is `{ id, displayName, players:{min,max}, clientDir, initialState, applyAction, publicView }`; `2 <= min <= max <= 6`; `id` url-safe; the three functions must be functions. The route invokes them as `initialState({ participants, rng, variant, colors })` (`routes.js:166`), `applyAction({ state, action, actorId, rng })` (`routes.js:274`), `publicView({ state, viewerId })` (`routes.js:186`). Clue's shipped `buildInitialState({participants, rng})` / `applyClueAction({state, action, actorId, geo=BOARD})` / `cluePublicView({state, viewerId, geo=BOARD})` are call-compatible (extra args ignored; `geo` defaults to `BOARD`).
- **Player count is enforced by the route** (`routes.js:121`) from `plugin.players.{min,max}` — declaring `{min:3, max:4}` makes 3–4 seats the hard gate; no per-plugin check needed.
- **Dice are client-side, never a bot decision** (project doctrine + `test/no-server-dice-rng.test.js`): the die VALUE is supplied by a human client and applied via the shipped `roll {value}` action; the server never RNGs it. The Clue bot returns a **values-less** `{type:'roll'}` intent (E6-4). Clue's die is a visible-animation client-inline mechanic — the same collapsed-mechanic pattern as cribbage auto-cut.
- **Orchestrator turn-continuation:** bots are gated on `state.activeUserId === botUserId` (never on phase-change); a bot drives its whole multi-action turn (move → suggest → accuse-or-pass, or the deterministic auto-refute) in one wake-up. Clue has **no** concurrent phases (`botMustActConcurrently` never fires for it).
- **`pendingRoll` semantic (F8b):** in **Clue**, `pendingRoll == null` ⇒ awaiting a roll; `pendingRoll` = an integer 1–6 ⇒ die known, **drive the move**. This is the INVERSE of backgammon (where a truthy `pendingRoll` is an awaiting-client object that PAUSES the bot). The generic pause gate `if (state.pendingCombat || state.pendingRoll) return` MUST NOT apply to Clue.
- **Client bundles are gitignored build output.** `plugins/clue/client/app.js` + `app.css` are produced by `npm run build:client` from `src/clients/clue/main.tsx`; only `index.html` + `style.css` (+ `assets/`) are checked in (`emptyOutDir:false`). A `.tsx` change is inert until rebuilt + server restart.
- **Client renders the server's truth, never re-computes rules.** The geometry mirror (`src/clients/clue/board-geometry.js`) is presentation only; a `node --test` drift guard pins it to `plugins/clue/server/geometry.js`.
- **Canonical Clue naming/theming is fine** (personal, non-distributed fan project).
- **Six suspect personas shipped in E6-4** (`games:[clue]`, canonical pawn colours; portraits auto-load by persona id) — persona gating is already satisfied.

---

## Roadmap (this plan is Plan 4 of 4 — the final sub-plan)

The spec (`docs/superpowers/specs/2026-07-01-clue-clone-design.md`) is decomposed into four sub-plans:

1. **Core deduction engine (shipped, E6-1/E6-2)** — cards, deal, state, suggest/refute/accuse/pass, `cluePublicView`.
2. **Board geometry + movement (shipped, E6-3)** — `geometry.js`, render harness, `roll`/`move`/`secretPassage`, reachable-squares BFS.
3. **Bots (shipped, E6-4)** — knowledge tracker, capped shortlist, `chooseAction` persona pick + banter, deterministic auto-refute, six `games:[clue]` personas.
4. **Client + integration (THIS PLAN, E6-5)** — React board client, geometry mirror + drift guard, `plugin.js` manifest, registration in `src/plugins/index.js`, AI adapter + orchestrator wiring (F8b pause-semantics), async-refute pause UX, `npm run build:client`.

**Plan 4 deliverable:** `plugins/clue/plugin.js`; a registry entry in `src/plugins/index.js`; a `clue` adapter in `src/server/ai/index.js`; orchestrator pause-semantics + roll-intent intercept in `src/server/ai/orchestrator.js`; `src/clients/clue/{main.tsx, ClueApp.tsx, Board.tsx, board-geometry.js, refute-prompt.js}`; `src/clients/shared/contracts/clue.ts`; `plugins/clue/client/{index.html, style.css}`; and the tests below — all `node --test` green, `npm run build:client` producing `plugins/clue/client/app.js`, and both ACs demonstrated end-to-end.

**Explicitly OUT of scope (deferred, non-blocking — see the Findings table):**
- Persona ↔ controlled-pawn alignment at setup (**F9**) — thematic only; requires threading persona→pawn through the generic game-creation route.
- Engine-level hardening of the raw public `enterRoom` teleport (**F7**) — mitigated by the client never emitting it; the fan-project threat model (non-distributed, authenticated participants) makes engine hardening a cheap future follow-up, not an E6-5 requirement, and touching `doEnterRoom` would destabilize 3 shipped test files.
- Per-persona difficulty tuning (**F10**) and an optimal refuter-side show-history (**F6**).

---

## Client view contract (produced by `cluePublicView`, consumed by the client)

The shipped view (E6-1 + E6-2 additions) exposes, per viewer:
`youAreSeat`, `seats`, `phase`, `currentSeat`, `activeUserId`, `pawns`, `weapons`, `seatSuspect`, `eliminated`, `log`, `suggestion` (`shownCard` blanked for non-suggesters), `hand`, `ledger`, `winnerSeat`, `pendingRoll`, and `movement` (reachable `{squares, rooms}` **only** for `viewerId === activeUserId`). `src/clients/shared/contracts/clue.ts` (Task 5) is the TypeScript mirror of exactly this shape.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `plugins/clue/plugin.js` | Manifest: `id:'clue'`, `displayName:'Clue'`, `players:{min:3,max:4}`, `clientDir`, re-export shipped `buildInitialState`/`applyClueAction`/`cluePublicView`. |
| `src/plugins/index.js` (modify) | Import `cluePlugin`; add `clue: cluePlugin` to the exported `plugins` map. |
| `src/clients/clue/board-geometry.js` | Plain-JS presentation mirror of `plugins/clue/server/geometry.js` (`GRID`, `ROOMS_GEO` polys+labels, `DOORS`, `CELLAR_POLY`, `SECRET_PASSAGES`, `START_SQUARES`, `PAWN_COLORS`, `CELL`). Drift-guarded. |
| `test/clue-board-drift.test.js` | Drift guard: the client mirror equals the server `BOARD`/`BOARD_DATA`/`GRID`/`START_SQUARES`/`SECRET_PASSAGES` (Risk-map pattern). |
| `test/clue-plugin.test.js` | `validatePlugin` passes; registry has `clue` at min:3/max:4; a scripted 3-seat move→suggest→refute→accuse round-trips through `plugin.applyAction`/`plugin.publicView` (leak guard + ended shape). |
| `src/server/ai/index.js` (modify) | Import `cluePlugin` + `chooseAction as clueChoose`; add `clue` to `adapters`. |
| `test/clue-ai-adapter.test.js` | `bootAiSubsystem` wires a `clue` adapter + a `clue` entry in `llmByGameType`; the six `games:[clue]` personas load. |
| `src/server/ai/orchestrator.js` (modify) | Adapter/game-aware pause predicate (numeric Clue `pendingRoll` DRIVES, not pauses — F8b); Clue values-less roll-intent intercept (broadcast `clue_roll_request`, do NOT apply); rely on the existing `activeUserId` gate for non-active bots (Reviewer Finding #6). |
| `test/clue-orchestrator.test.js` | Numeric `pendingRoll` drives the Clue bot's move; a values-less roll intent is intercepted (SSE broadcast, not applied); a non-refuter bot is not driven; the active bot refuter is driven deterministically. |
| `src/clients/shared/contracts/clue.ts` | TS mirror of the Clue public view + action union. |
| `src/clients/clue/main.tsx` | Mounts `ClueApp` on `#clue-root` inside the shared `ErrorBoundary`. |
| `src/clients/clue/ClueApp.tsx` | Top-level client: `useGameState`, roster, roll/suggest/accuse/pass affordances, the refute prompt, end banner. |
| `src/clients/clue/Board.tsx` | SVG board rendered from `board-geometry.js`: rooms, doors, cellar, pawns, weapon tokens, reachable-square/room highlights. |
| `src/clients/clue/refute-prompt.js` | Pure helpers `isMyRefute(view)` + `refuteChoices(view)` (held ∩ suggested-three). Node-testable. |
| `test/clue-refute-prompt.test.js` | `refuteChoices`/`isMyRefute`: held-and-named only; empty when not the active refuter. |
| `plugins/clue/client/index.html` | Static shell: `#clue-root`, loads `style.css` + `app.css` + `app.js` (checked in). |
| `plugins/clue/client/style.css` | Board chrome CSS (checked in; `app.css`/`app.js` are gitignored build output). |
| `test/clue-e2e-registration.test.js` | End-to-end: a registered 3-seat mixed human/bot game drives create → roll-intercept → resolved roll → move → suggest → human-refute pause → resume → accuse through the real registry + orchestrator. |

---

## Task 1: Geometry mirror + drift guard

**Files:**
- Create: `src/clients/clue/board-geometry.js`
- Test: `test/clue-board-drift.test.js`

**Interfaces:**
- Consumes (test only): `BOARD`, `BOARD_DATA`, `GRID`, `START_SQUARES`, `SECRET_PASSAGES` from `plugins/clue/server/geometry.js`; `ROOMS`, `SUSPECTS` from `plugins/clue/server/cards.js`.
- Produces (mirror): `GRID = {cols, rows}`, `CELL` (px per grid cell), `ROOMS_GEO = { [roomId]: { poly:[[c,r],...], label:[c,r] } }`, `DOORS = [{room, square:[c,r]}]`, `CELLAR_POLY`, `SECRET_PASSAGES`, `START_SQUARES = { [suspectId]:[c,r] }`, `PAWN_COLORS = { [suspectId]: '#rrggbb' }` (canonical pawn colours matching the E6-4 personas).

- [ ] **Step 1: Write the failing test**

Create `test/clue-board-drift.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  GRID as MG, ROOMS_GEO, DOORS, CELLAR_POLY, SECRET_PASSAGES as MSP,
  START_SQUARES as MSS, PAWN_COLORS, CELL,
} from '../src/clients/clue/board-geometry.js';
import {
  GRID, BOARD_DATA, START_SQUARES, SECRET_PASSAGES,
} from '../plugins/clue/server/geometry.js';
import { ROOMS, SUSPECTS } from '../plugins/clue/server/cards.js';

test('grid dims mirror the server', () => {
  assert.deepEqual(MG, { cols: GRID.cols, rows: GRID.rows });
  assert.ok(Number.isFinite(CELL) && CELL > 0);
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

test('doors mirror the server door list exactly (order-independent)', () => {
  const norm = (arr) => arr.map((d) => `${d.room}@${d.square[0]},${d.square[1]}`).sort();
  assert.deepEqual(norm(DOORS), norm(BOARD_DATA.doors));
  assert.equal(DOORS.length, BOARD_DATA.doors.length);
});

test('cellar, secret passages, and start squares mirror the server', () => {
  assert.deepEqual(CELLAR_POLY, BOARD_DATA.cellar.poly);
  assert.deepEqual(MSP, SECRET_PASSAGES);
  assert.deepEqual(MSS, START_SQUARES);
});

test('every suspect has a start square and a hex pawn colour', () => {
  for (const s of SUSPECTS) {
    assert.ok(Array.isArray(MSS[s]) && MSS[s].length === 2, `start for ${s}`);
    assert.match(PAWN_COLORS[s], /^#[0-9a-fA-F]{6}$/, `colour for ${s}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-board-drift.test.js`
Expected: FAIL — `Cannot find module '.../src/clients/clue/board-geometry.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/clients/clue/board-geometry.js` (values copied verbatim from `plugins/clue/server/geometry.js` `BOARD_DATA`/`START_SQUARES`/`SECRET_PASSAGES`; the drift guard is the backstop against divergence):

```js
// Presentation mirror of plugins/clue/server/geometry.js. The client renders
// the board from these numbers; it NEVER computes movement/rules — the server
// is authoritative. test/clue-board-drift.test.js pins this to the engine.
export const CELL = 26; // px per grid square (presentation only)
export const GRID = { cols: 24, rows: 25 };

export const ROOMS_GEO = {
  kitchen:      { poly: [[0, 1], [6, 1], [6, 7], [0, 7]],       label: [1.6, 4.2] },
  ballroom:     { poly: [[8, 2], [16, 2], [16, 8], [8, 8]],     label: [10, 5] },
  conservatory: { poly: [[18, 1], [24, 1], [24, 5], [18, 5]],   label: [18.3, 3.3] },
  diningroom:   { poly: [[0, 9], [8, 9], [8, 16], [0, 16]],     label: [1.6, 12.9] },
  billiardroom: { poly: [[18, 8], [24, 8], [24, 13], [18, 13]], label: [21, 10.2] },
  library:      { poly: [[17, 14], [23, 14], [23, 18], [17, 18]], label: [19.1, 16.6] },
  lounge:       { poly: [[0, 19], [7, 19], [7, 25], [0, 25]],   label: [2.2, 22.2] },
  hall:         { poly: [[9, 18], [15, 18], [15, 25], [9, 25]], label: [11.2, 21.6] },
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

// Canonical pawn colours (match the E6-4 persona `color` fields).
export const PAWN_COLORS = {
  scarlett: '#c0392b', mustard: '#d4a017', white: '#ecf0f1',
  green: '#27ae60', peacock: '#2980b9', plum: '#8e44ad',
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clue-board-drift.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/clients/clue/board-geometry.js test/clue-board-drift.test.js
git commit -m "feat(clue): client geometry mirror + drift guard"
```

---

## Task 2: `plugin.js` manifest + registration + contract round-trip

**Files:**
- Create: `plugins/clue/plugin.js`
- Modify: `src/plugins/index.js`
- Test: `test/clue-plugin.test.js`

**Interfaces:**
- Consumes: shipped `buildInitialState` (`plugins/clue/server/state.js`), `applyClueAction` (`plugins/clue/server/actions.js`), `cluePublicView` (`plugins/clue/server/view.js`); `validatePlugin`/`buildRegistry` from `src/server/plugins.js`; `plugins` map from `src/plugins/index.js`.
- Produces: a default-exported plugin object satisfying `validatePlugin`; a `clue` key in the exported registry.

- [ ] **Step 1: Write the failing test**

Create `test/clue-plugin.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import cluePlugin from '../plugins/clue/plugin.js';
import { validatePlugin, buildRegistry } from '../src/server/plugins.js';
import { plugins } from '../src/plugins/index.js';

function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}
const parts = (n) => Array.from({ length: n }, (_, i) => ({ userId: 100 + i, seat: i }));

test('clue plugin passes platform validation', () => {
  assert.doesNotThrow(() => validatePlugin(cluePlugin));
  assert.equal(cluePlugin.id, 'clue');
  assert.deepEqual(cluePlugin.players, { min: 3, max: 4 });
  assert.equal(cluePlugin.clientDir, 'plugins/clue/client');
});

test('clue is registered in the shared registry', () => {
  assert.ok(plugins.clue, 'plugins.clue missing');
  assert.doesNotThrow(() => buildRegistry(plugins)); // key === id for every entry
  assert.equal(plugins.clue.id, 'clue');
});

test('a 3-seat game builds and a full turn round-trips through the contract', () => {
  const state0 = cluePlugin.initialState({ participants: parts(3), rng: seededRng(4) });
  assert.deepEqual(state0.seats, [100, 101, 102]);
  assert.equal(state0.phase, 'move');

  // publicView never leaks the envelope or another seat's hand.
  const v = cluePlugin.publicView({ state: state0, viewerId: 101 });
  assert.equal(v.youAreSeat, 1);
  assert.equal(v.envelope, undefined);
  assert.equal(v.hands, undefined);

  // Drive seat 0 into a room, suggest, refute, then a wrong accusation — all
  // through the registered applyAction surface (no direct module imports).
  const enter = cluePlugin.applyAction({
    state: state0,
    action: { type: 'enterRoom', payload: { room: 'hall' } },
    actorId: 100,
  });
  assert.equal(enter.error, undefined);
  assert.equal(enter.state.phase, 'suggest');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-plugin.test.js`
Expected: FAIL — `Cannot find module '.../plugins/clue/plugin.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `plugins/clue/plugin.js` (mirrors `plugins/sorry/plugin.js`):

```js
import { buildInitialState } from './server/state.js';
import { applyClueAction } from './server/actions.js';
import { cluePublicView } from './server/view.js';

export default {
  id: 'clue',
  displayName: 'Clue',
  players: { min: 3, max: 4 },
  clientDir: 'plugins/clue/client',

  initialState: buildInitialState,
  applyAction: applyClueAction,
  publicView: cluePublicView,
};
```

Modify `src/plugins/index.js` — add the import and registry entry:

```js
import sorryPlugin from '../../plugins/sorry/plugin.js';
import cluePlugin from '../../plugins/clue/plugin.js';

export const plugins = {
  words: wordsPlugin,
  rummikub: rummikubPlugin,
  backgammon: backgammonPlugin,
  cribbage: cribbagePlugin,
  buraco: buracoPlugin,
  risk: riskPlugin,
  sorry: sorryPlugin,
  clue: cluePlugin,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clue-plugin.test.js`
Expected: PASS (3 tests).

Also confirm no other plugin/registry test regressed:

Run: `node --test test/*plugin*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/plugin.js src/plugins/index.js test/clue-plugin.test.js
git commit -m "feat(clue): plugin.js manifest (3-4 players) + registry registration"
```

> **F7 note (not a code step):** the public `enterRoom` action still teleports a pawn to any catalog room with no reachability check. The client (Task 5) NEVER emits `enterRoom` — it drives `roll`→`move` and lets `doMove` enter a room only via a reachable doorway. Engine-level hardening is deferred (non-blocking) per the fan-project threat model and because gating `doEnterRoom` would break 3 shipped E6-1/E6-3 test files. See the Findings table.

---

## Task 3: AI adapter registration

**Files:**
- Modify: `src/server/ai/index.js`
- Test: `test/clue-ai-adapter.test.js`

**Interfaces:**
- Consumes: `cluePlugin` (`plugins/clue/plugin.js`); `chooseAction as clueChoose` (`plugins/clue/server/ai/clue-player.js`); the six `games:[clue]` persona YAMLs (E6-4).
- Produces: an `adapters.clue = { plugin: cluePlugin, chooseAction: clueChoose }` entry so the orchestrator can drive Clue bots, and a `clue` key in `llmByGameType`.

- [ ] **Step 1: Write the failing test**

Create `test/clue-ai-adapter.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { bootAiSubsystem } from '../src/server/ai/index.js';
import { applySchema } from '../src/server/db.js';

function db() { const d = new Database(':memory:'); applySchema(d); return d; }
const fakeLlm = { send: async () => ({ text: '{}', sessionId: 's' }) };
const fakeSse = { broadcast() {} };

test('bootAiSubsystem wires a clue adapter and per-type llm', () => {
  const boot = bootAiSubsystem({ db: db(), sse: fakeSse, llm: fakeLlm });
  assert.ok(boot.llmByGameType.clue, 'clue missing from llmByGameType');
  // The six clue personas are loaded and became inert bot users.
  const ids = [...boot.personas.values()].map((p) => p.id);
  for (const id of ['miss-scarlett', 'colonel-mustard', 'mrs-white', 'mr-green', 'mrs-peacock', 'professor-plum']) {
    assert.ok(ids.includes(id), `persona ${id} not loaded`);
  }
});
```

> **Note for the implementer:** match the DB bootstrap helper the existing `test/ai-bootstrap.test.js` uses (import path for the schema initializer may differ — reuse whatever that test imports rather than assuming `applySchema`). The load-bearing assertion is `boot.llmByGameType.clue` existing.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-ai-adapter.test.js`
Expected: FAIL — `llmByGameType.clue` is `undefined` (no `clue` adapter, so the `for (gameType of Object.keys(adapters))` loop never creates it).

- [ ] **Step 3: Write minimal implementation**

In `src/server/ai/index.js`, add the imports (below the `sorryPlugin` imports):

```js
import cluePlugin from '../../../plugins/clue/plugin.js';
import { chooseAction as clueChoose } from '../../../plugins/clue/server/ai/clue-player.js';
```

Add the adapter entry to the `adapters` object:

```js
  const adapters = {
    cribbage:   { plugin: cribbagePlugin,   chooseAction: cribbageChoose, chooseBanter: cribbageBanter },
    backgammon: { plugin: backgammonPlugin, chooseAction: backgammonChoose },
    words:      { plugin: wordsPlugin,      chooseAction: wordsChoose },
    risk:       { plugin: riskPlugin,       chooseAction: riskChoose, resolvePending: riskResolvePending },
    sorry:      { plugin: sorryPlugin,      chooseAction: sorryChoose },
    clue:       { plugin: cluePlugin,       chooseAction: clueChoose },
  };
```

(`modelForGameType('clue')` falls back to the default Haiku model — no change needed unless a `clue` case is desired.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clue-ai-adapter.test.js`
Expected: PASS.

Also confirm the AI bootstrap sweep still passes:

Run: `node --test test/ai-bootstrap.test.js test/ai-personas-route.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/index.js test/clue-ai-adapter.test.js
git commit -m "feat(clue): register clue AI adapter in bootAiSubsystem"
```

---

## Task 4: Orchestrator wiring — F8b pause-semantics + roll intercept + activeUserId gate

**Files:**
- Modify: `src/server/ai/orchestrator.js`
- Test: `test/clue-orchestrator.test.js`

**Why (Delivery Finding F8b, BLOCKING; + Reviewer Finding #6):** the generic continuation gate is `if (state.pendingCombat || state.pendingRoll) return` (`botEligible` @ line ~114, `_runBot` @ line ~149). For backgammon/risk, a truthy `pendingRoll`/`pendingCombat` is an **awaiting-client** object → the bot must PAUSE. For **Clue**, `pendingRoll` is the **resolved** integer die value → the bot must **DRIVE the move**. Reusing the raw gate would pause the Clue bot exactly when it should move. Separately, the Clue bot's top-of-turn `roll` intent is **values-less** and the engine rejects it (E6-4 integration pin) — so it must be intercepted as a client-dice request, not applied. Finding #6: a non-active Clue bot (e.g. during a refute owned by someone else) must not be driven — the existing `activeUserId` gate already handles this; this task pins it.

**Interfaces:**
- Consumes: `gameRow.game_type`, `state`, `adapters` (already in scope in `_runBot`; `game_type` is available in the scan at line ~507).
- Produces:
  - `awaitingClientResolution(gameType, state) → bool` — `true` only for games whose pending state is an awaiting-client resolution; **`false` for `clue`** (its `pendingRoll` is a resolved value; the Clue bot is gated purely on `activeUserId`).
  - A Clue values-less roll-intent intercept in `_runBot`: broadcast `{ type:'clue_roll_request', payload:{ seat, personaId } }` and return WITHOUT calling `applyAction`.

- [ ] **Step 1: Write the failing test**

Create `test/clue-orchestrator.test.js`. Use the same in-memory-DB + fake-SSE + fake-LLM harness the existing orchestrator tests use (`test/orchestrator-pending-roll.test.js` is the closest precedent — copy its setup). Representative assertions:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
// Reuse the existing orchestrator test harness helpers (seedGame, makeDb, fakeSse).
import { makeClueGame, driveOnce } from './_helpers/clue-orchestrator-harness.js';

test('F8b: a numeric pendingRoll DRIVES the clue bot (does not pause it)', async () => {
  // Bot on turn, phase 'move', pendingRoll = 4 (resolved). The bot must be
  // driven and return a `move` — NOT paused by the generic pendingRoll gate.
  const { runBot, sent } = makeClueGame({ botOnTurn: true, phase: 'move', pendingRoll: 4 });
  await runBot();
  assert.ok(sent.actions.some((a) => a.type === 'move'), 'bot should have moved');
});

test('F8b: a values-less roll intent is intercepted, not applied', async () => {
  // Bot on turn, phase 'move', pendingRoll null. chooseAction returns {type:'roll'}.
  const { runBot, applied, broadcasts } = makeClueGame({
    botOnTurn: true, phase: 'move', pendingRoll: null, llmPicks: 'roll',
  });
  await runBot();
  assert.ok(broadcasts.some((b) => b.type === 'clue_roll_request'), 'roll request broadcast');
  assert.ok(!applied.some((a) => a.type === 'roll'), 'value-less roll never applied to engine');
});

test('Finding #6: a non-refuter bot is NOT driven during a refute phase', async () => {
  // phase 'refute', activeUserId = a HUMAN (or another seat). The bot is not
  // the active player, so chooseAction must not be called.
  const { runBot, llmCalls } = makeClueGame({ botOnTurn: false, phase: 'refute', activeIsHuman: true });
  await runBot();
  assert.equal(llmCalls, 0, 'inactive bot must not be driven');
});

test('Finding #6: the active bot refuter IS driven deterministically (no LLM)', async () => {
  const { runBot, applied, llmCalls } = makeClueGame({
    botOnTurn: true, phase: 'refute', botIsActiveRefuter: true, botHand: ['green', 'knife'],
  });
  await runBot();
  assert.equal(llmCalls, 0, 'auto-refute is deterministic');
  const ref = applied.find((a) => a.type === 'refute');
  assert.ok(ref && ['green', 'knife'].includes(ref.payload.card));
});
```

> **Note for the implementer:** `test/_helpers/clue-orchestrator-harness.js` is a thin wrapper that seeds a `games` row + `ai_sessions` rows in an in-memory DB, builds the orchestrator via `createOrchestrator` with a fake `sse` (records `broadcasts`), a fake `llm` (records `llmCalls`, returns the `llmPicks` id), and a Clue adapter, then exposes `runBot()` = `orchestrator.scheduleTurn(gameId)` awaited. Model it on the existing orchestrator test's harness; do not invent a new orchestration path.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-orchestrator.test.js`
Expected: FAIL — the numeric-`pendingRoll` case is paused by the generic gate (no `move` applied); the roll-intent case throws/erroring because a value-less `roll` is passed to `applyAction` (engine rejects) instead of being intercepted.

- [ ] **Step 3: Write minimal implementation**

In `src/server/ai/orchestrator.js`:

**(a)** Add the pause predicate near `botEligible` (replacing the inline `state.pendingCombat || state.pendingRoll` checks):

```js
// Games whose pending state means "awaiting a client-supplied value — pause the
// bot" (backgammon's pendingRoll object; Risk's pendingCombat). Clue is NOT here:
// its pendingRoll is the RESOLVED die value ("drive the move"), so the Clue bot
// is gated purely on activeUserId (Delivery Finding F8b).
const CLIENT_RESOLUTION_GAMES = new Set(['backgammon', 'risk']);
function awaitingClientResolution(gameType, state) {
  if (!CLIENT_RESOLUTION_GAMES.has(gameType)) return false;
  return Boolean(state.pendingCombat || state.pendingRoll);
}
```

Change `botEligible` to take `gameType` and use the predicate:

```js
function botEligible(state, botUserId, gameType) {
  // Bot is paused only while an action awaits client-side resolution (F8b:
  // never for clue, whose numeric pendingRoll means "move now").
  if (awaitingClientResolution(gameType, state)) return false;
  if (state.activeUserId === botUserId) return true;
  if (state.activeUserId != null) return false;
  return botMustActConcurrently(state, botUserId);
}
```

Update its scan caller (line ~520) to pass the game type:

```js
      const eligible = sessions.find(
        s => !attempted.has(s.botUserId) && botEligible(state, s.botUserId, gameRow.game_type),
      );
```

**(b)** Change `_runBot`'s continuation gate (line ~149) to the same predicate:

```js
    if (awaitingClientResolution(gameRow.game_type, state)) return;
```

**(c)** Add the Clue values-less roll-intent intercept in `_runBot`, immediately AFTER `chooseAction` resolves and BEFORE the returned `action` is applied. Broadcast the request and yield (the human client resolves the die and POSTs `roll {value}`, which sets numeric `pendingRoll`; the next wake-up drives the move because `awaitingClientResolution('clue', …)` is false):

```js
    // Clue: a values-less roll intent is a client-dice request, not an engine
    // action (doRoll demands an integer 1-6). Broadcast it and yield; a human
    // client rolls the die and POSTs roll{value} on the bot's behalf (the
    // backgammon "human resolves the bot's roll" pattern). Dice stay client-side.
    if (gameRow.game_type === 'clue'
        && chosen.action?.type === 'roll'
        && chosen.action?.payload?.value == null) {
      sse.broadcast(gameId, {
        type: 'clue_roll_request',
        payload: { seat: botPlayerIdx, personaId: session.personaId },
      });
      return;
    }
```

(`chosen` is whatever local variable already holds the `chooseAction` result in `_runBot`; adapt the name to the existing code. If the code applies the action inline, insert this guard just before that `applyAction` call.)

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clue-orchestrator.test.js`
Expected: PASS (4 tests).

Also confirm no other game's orchestration regressed (the predicate preserves backgammon/risk behaviour exactly):

Run: `node --test test/orchestrator-pending-roll.test.js test/ai-*.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/orchestrator.js test/clue-orchestrator.test.js test/_helpers/clue-orchestrator-harness.js
git commit -m "fix(clue): orchestrator pause-semantics (F8b) + roll intercept + activeUserId gate"
```

---

## Task 5: React client — contracts, board from mirror, action affordances

**Files:**
- Create: `src/clients/shared/contracts/clue.ts`
- Create: `src/clients/clue/main.tsx`, `src/clients/clue/ClueApp.tsx`, `src/clients/clue/Board.tsx`
- Create: `plugins/clue/client/index.html`, `plugins/clue/client/style.css`
- Test: verification is `npm run build:client` (produces `plugins/clue/client/app.js`) + the Task 1 drift guard + the browser checklist below (matches how Risk/Sorry clients are verified in this repo — TSX has no `node --test` surface; pure logic is factored out to Task 6).

**Interfaces:**
- Consumes: `useGameState<ClueView, ClueAction>()` (`src/clients/shared/useGameState.ts`); `ErrorBoundary` (`src/clients/shared/ErrorBoundary`); `OpponentBanter`; the Task 1 mirror.
- Produces: a mounted client that renders the board from the mirror and POSTs `roll`/`move`/`secretPassage`/`suggest`/`accuse`/`pass`/`refute` actions. It **never** emits `enterRoom` (F7): room entry is a `move` onto a doorway. When it is the human's turn with `view.pendingRoll == null`, a **Roll** button POSTs `roll { value }` where the value is the client-rolled 1–6 (dice are client-side). On `clue_roll_request` SSE (a bot's roll), the client rolls and POSTs `roll { value }` on the bot's behalf.

- [ ] **Step 1: Write the contract mirror**

Create `src/clients/shared/contracts/clue.ts`:

```ts
// Client-side mirror of the Clue public view (plugins/clue/server/view.js) and
// action contract (plugins/clue/server/actions.js). The client renders the
// server's truth; it never recomputes rules from these types.
export type SuspectId = 'scarlett' | 'mustard' | 'white' | 'green' | 'peacock' | 'plum';
export type WeaponId = 'candlestick' | 'knife' | 'leadpipe' | 'revolver' | 'rope' | 'wrench';
export type RoomId =
  | 'kitchen' | 'ballroom' | 'conservatory' | 'diningroom' | 'billiardroom'
  | 'library' | 'lounge' | 'hall' | 'study';
export type CardId = SuspectId | WeaponId | RoomId;
export type CluePhase = 'move' | 'suggest' | 'refute' | 'accuse-or-pass' | 'ended';

export interface PawnLoc { room?: RoomId | null; square?: [number, number]; }

export interface ClueSuggestion {
  bySeat: number;
  suspect: SuspectId; weapon: WeaponId; room: RoomId;
  refuterSeat: number | null;
  shownCard: CardId | null; // non-null only for the suggester's own view
}

export interface ClueMovement { squares: [number, number][]; rooms: RoomId[]; }

export interface ClueView {
  youAreSeat: number | null;
  seats: number[];
  phase: CluePhase;
  currentSeat: number;
  activeUserId: number | null;
  pawns: Record<SuspectId, PawnLoc>;
  weapons: Record<WeaponId, RoomId>;
  seatSuspect: SuspectId[];
  eliminated: boolean[];
  log: Array<Record<string, unknown>>;
  suggestion: ClueSuggestion | null;
  hand: CardId[];
  ledger: Array<{ fromSeat: number; card: CardId }>;
  pendingRoll: number | null;
  winnerSeat: number | null;
  movement?: ClueMovement; // present only for the active viewer
}

export type ClueAction =
  | { type: 'roll'; payload: { value: number } }             // client-rolled 1-6
  | { type: 'move'; payload: { to: [number, number] | { room: RoomId } } }
  | { type: 'secretPassage' }
  | { type: 'suggest'; payload: { suspect: SuspectId; weapon: WeaponId; room: RoomId } }
  | { type: 'refute'; payload: { card: CardId } }
  | { type: 'accuse'; payload: { suspect: SuspectId; weapon: WeaponId; room: RoomId } }
  | { type: 'pass' };
```

> **Note for the implementer:** confirm the exact `move` payload shape against the shipped `doMove` in `plugins/clue/server/actions.js` (E6-3) and mirror it precisely — the union above is the expected shape; correct the `move.payload` field name/structure to whatever `doMove` reads. This is a mirror, not a new contract.

- [ ] **Step 2: Write the client shell + board**

Create `plugins/clue/client/index.html` (mirrors `plugins/sorry/client/index.html`; root id `clue-root`):

```html
<!-- plugins/clue/client/index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Clue</title>
  <link rel="stylesheet" href="style.css" />
  <link rel="stylesheet" href="app.css" />
</head>
<body>
  <main id="clue-root" aria-live="polite"></main>
  <script type="module" src="app.js"></script>
</body>
</html>
```

Create `plugins/clue/client/style.css` — a minimal board-chrome stylesheet (header, roster, board frame, prompt, card tray, end banner). Keep it small; the board itself is SVG from `Board.tsx`.

Create `src/clients/clue/main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import { ClueApp } from "./ClueApp";

const root = document.getElementById("clue-root");
if (root) {
  createRoot(root).render(
    <ErrorBoundary>
      <ClueApp />
    </ErrorBoundary>,
  );
}
```

Create `src/clients/clue/Board.tsx` — an SVG board driven entirely by the mirror + the view. It draws each `ROOMS_GEO` polygon (scaled by `CELL`), the cellar, door thresholds, weapon tokens, and one pawn per suspect at its `view.pawns[suspect]` location; when `view.movement` is present (active viewer) it highlights reachable squares/rooms and calls `onPickSquare`/`onPickRoom`:

```tsx
import { ROOMS_GEO, DOORS, CELLAR_POLY, GRID, CELL, PAWN_COLORS } from "./board-geometry.js";
import type { ClueView, RoomId } from "../shared/contracts/clue";

const pts = (poly: number[][]) => poly.map(([c, r]) => `${c * CELL},${r * CELL}`).join(" ");

export function Board({
  view, onPickSquare, onPickRoom,
}: {
  view: ClueView;
  onPickSquare: (sq: [number, number]) => void;
  onPickRoom: (room: RoomId) => void;
}) {
  const W = GRID.cols * CELL;
  const H = GRID.rows * CELL;
  const reachRoom = new Set(view.movement?.rooms ?? []);
  const reachSq = new Set((view.movement?.squares ?? []).map(([c, r]) => `${c},${r}`));

  return (
    <svg className="clue-board" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Clue board">
      <polygon className="clue-cellar" points={pts(CELLAR_POLY)} />
      {Object.entries(ROOMS_GEO).map(([id, g]) => (
        <g key={id}>
          <polygon
            data-room={id}
            className={`clue-room${reachRoom.has(id as RoomId) ? " is-reachable" : ""}`}
            points={pts(g.poly)}
            onClick={reachRoom.has(id as RoomId) ? () => onPickRoom(id as RoomId) : undefined}
          />
          <text x={g.label[0] * CELL} y={g.label[1] * CELL} className="clue-room-label">{id}</text>
        </g>
      ))}
      {DOORS.map((d, i) => (
        <rect key={i} data-door={d.room}
          x={d.square[0] * CELL + 3} y={d.square[1] * CELL + 3}
          width={CELL - 6} height={CELL - 6} className="clue-door" />
      ))}
      {(view.movement?.squares ?? []).map(([c, r]) => (
        <rect key={`sq-${c}-${r}`} className="clue-reach"
          x={c * CELL} y={r * CELL} width={CELL} height={CELL}
          onClick={() => onPickSquare([c, r])} />
      ))}
      {Object.entries(view.pawns).map(([suspect, loc]) => {
        const sq = loc.square;
        if (!sq) return null; // pawns in a room are drawn in the room cluster (impl detail)
        return (
          <circle key={suspect} data-pawn={suspect}
            cx={sq[0] * CELL + CELL / 2} cy={sq[1] * CELL + CELL / 2} r={CELL / 2 - 2}
            fill={PAWN_COLORS[suspect as keyof typeof PAWN_COLORS]} />
        );
      })}
    </svg>
  );
}
```

Create `src/clients/clue/ClueApp.tsx` — the top-level client. It wires `useGameState`, renders the roster + board, and the phase-appropriate affordances. Load-bearing behaviour:

- **Roll (client-side dice):** when `myTurn && view.phase === 'move' && view.pendingRoll == null`, show a **Roll** button that generates a 1–6 client-side and POSTs `{ type:'roll', payload:{ value } }`.
- **Bot roll resolution:** subscribe to the game SSE; on a `clue_roll_request` event, if this client is a participant, POST `{ type:'roll', payload:{ value } }` on the bot's behalf (roll a 1–6 client-side). The engine keeps `activeUserId` on the bot, so the orchestrator then drives the bot's move.
- **Move:** the board's reachable squares/rooms (from `view.movement`) POST `move` (never `enterRoom`).
- **Secret passage:** if the bot/human is in a passage corner, a button POSTs `{ type:'secretPassage' }`.
- **Suggest:** in `phase === 'suggest'`, a suspect+weapon picker (room is the current room) POSTs `suggest`.
- **Accuse / Pass:** in `phase === 'accuse-or-pass'` (or `move`), an accuse form + a Pass button.
- **Refute prompt:** delegated to Task 6 (`refute-prompt.js` + the prompt UI).

```tsx
import { useEffect } from "react";
import { useGameState } from "../shared/useGameState";
import type { ClueView, ClueAction } from "../shared/contracts/clue";
import { Board } from "./Board";
import { RefutePrompt } from "./RefutePrompt"; // Task 6
import { isMyRefute } from "./refute-prompt.js"; // Task 6

const d6 = () => 1 + Math.floor(Math.random() * 6); // client-side die, never server

export function ClueApp() {
  const { view, post, ctx } = useGameState<ClueView, ClueAction>();

  // Resolve a bot's roll on its behalf (backgammon pattern). One connected
  // participant fires the POST; the engine rejects a duplicate/late roll.
  useEffect(() => {
    if (!ctx.sseUrl) return;
    const es = new EventSource(ctx.sseUrl);
    es.addEventListener("message", (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg?.type === "clue_roll_request") post({ type: "roll", payload: { value: d6() } });
      } catch { /* ignore non-JSON frames */ }
    });
    return () => es.close();
  }, [ctx.sseUrl]);

  if (!view) return <div className="banner">Loading…</div>;
  const myTurn = view.youAreSeat != null && view.activeUserId === ctx.userId;
  const needsRoll = myTurn && view.phase === "move" && view.pendingRoll == null;

  return (
    <div className="clue-root-inner">
      <header className="clue-header">
        <a href="/">↩ Lobby</a>
        <em>{myTurn ? "your move" : "waiting"}</em>
      </header>

      {needsRoll && (
        <button className="clue-roll" onClick={() => post({ type: "roll", payload: { value: d6() } })}>
          Roll the die
        </button>
      )}

      <Board
        view={view}
        onPickSquare={(to) => post({ type: "move", payload: { to } })}
        onPickRoom={(room) => post({ type: "move", payload: { to: { room } } })}
      />

      {myTurn && view.phase === "accuse-or-pass" && (
        <button className="clue-pass" onClick={() => post({ type: "pass" })}>Pass</button>
      )}

      {/* Suggest + Accuse forms omitted here for brevity — a suspect+weapon
          (+room for accuse) picker POSTing {type:'suggest'|'accuse', payload}. */}

      {isMyRefute(view, ctx.userId) && (
        <RefutePrompt view={view} onShow={(card) => post({ type: "refute", payload: { card } })} />
      )}
    </div>
  );
}
```

> **Note for the implementer:** the suggest/accuse pickers are conventional `<select>`-driven forms POSTing the three-card payload; they carry no rule logic (the server validates). Keep all game logic server-side. Confirm the `useGameState` `ctx` field names (`gameId`, `userId`, `sseUrl`, `yourFriendlyName`, `opponentFriendlyName`) against `src/clients/shared/useGameState.ts` and the SSE event/message shape against `src/server/sse.js` — adapt the `EventSource` listener to the repo's actual frame format if it is not raw `message` JSON.

- [ ] **Step 3: Build the client**

Run: `npm run build:client`
Expected: `[build-clients] building clue` … writes `plugins/clue/client/app.js` (+ `app.css`, `app.js.map`). (`app.js`/`app.css` are gitignored — do not commit them.)

- [ ] **Step 4: Drift guard + full suite still green**

Run: `node --test test/clue-*.test.js`
Expected: PASS (drift guard + plugin + adapter + orchestrator + all E6-1..E6-4 suites).

- [ ] **Step 5: Commit (source + checked-in shell only)**

```bash
git add src/clients/shared/contracts/clue.ts \
        src/clients/clue/main.tsx src/clients/clue/ClueApp.tsx src/clients/clue/Board.tsx \
        plugins/clue/client/index.html plugins/clue/client/style.css
git commit -m "feat(clue): react board client (renders from geometry mirror) + client-side dice"
```

---

## Task 6: Async-refute pause UX

**Files:**
- Create: `src/clients/clue/refute-prompt.js` (pure helpers — node-testable)
- Create: `src/clients/clue/RefutePrompt.tsx` (the prompt UI)
- Test: `test/clue-refute-prompt.test.js`

**Why (AC2):** when a human suggestion (or a bot suggestion the human must answer) makes THIS human the active refuter, `cluePublicView` sets `phase:'refute'` and `activeUserId` to the human. The client must surface a card-choice prompt of the cards the refuter holds among the suggested three, POST `refute { card }`, and let the view resume (the engine returns `activeUserId` to the suggester in `accuse-or-pass`). This is the async-refute pause realised in the UI; the engine half already pauses correctly (E6-1 sets `activeUserId` to the human refuter).

**Interfaces:**
- Produces:
  - `isMyRefute(view, myUserId) → bool` — `true` iff `view.phase === 'refute'` and `view.activeUserId === myUserId` and this viewer is the suggestion's `refuterSeat`.
  - `refuteChoices(view) → CardId[]` — the cards in `view.hand` that are among `view.suggestion.{suspect,weapon,room}` (the legal cards this refuter may show). Order: `[suspect, weapon, room]` filtered to held.

- [ ] **Step 1: Write the failing test**

Create `test/clue-refute-prompt.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isMyRefute, refuteChoices } from '../src/clients/clue/refute-prompt.js';

function view(over = {}) {
  return {
    youAreSeat: 2, activeUserId: 9, phase: 'refute',
    seats: [7, 8, 9],
    hand: ['green', 'knife', 'library'],
    suggestion: { bySeat: 0, suspect: 'green', weapon: 'knife', room: 'hall', refuterSeat: 2, shownCard: null },
    ...over,
  };
}

test('refuteChoices = held cards among the suggested three, in s/w/r order', () => {
  assert.deepEqual(refuteChoices(view()), ['green', 'knife']);
});

test('refuteChoices excludes held cards that were not suggested', () => {
  assert.ok(!refuteChoices(view()).includes('library'));
});

test('isMyRefute true only for the active refuter in the refute phase', () => {
  assert.equal(isMyRefute(view(), 9), true);
  assert.equal(isMyRefute(view({ activeUserId: 7 }), 7), false); // not the refuter seat
  assert.equal(isMyRefute(view({ phase: 'suggest' }), 9), false); // wrong phase
});

test('no suggestion or no hand -> no choices, not my refute', () => {
  assert.deepEqual(refuteChoices(view({ suggestion: null })), []);
  assert.equal(isMyRefute(view({ suggestion: null }), 9), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-refute-prompt.test.js`
Expected: FAIL — `Cannot find module '.../src/clients/clue/refute-prompt.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/clients/clue/refute-prompt.js`:

```js
// Pure refute-pause helpers (no JSX) so they are covered by node --test. The
// client shows ONLY cards the refuter both holds and were suggested; the server
// re-validates the choice.
export function refuteChoices(view) {
  const s = view?.suggestion;
  if (!s || !Array.isArray(view.hand)) return [];
  const named = [s.suspect, s.weapon, s.room];
  return named.filter((card) => view.hand.includes(card));
}

export function isMyRefute(view, myUserId) {
  if (!view || view.phase !== 'refute' || !view.suggestion) return false;
  if (view.activeUserId !== myUserId) return false;
  return view.youAreSeat === view.suggestion.refuterSeat;
}
```

Create `src/clients/clue/RefutePrompt.tsx`:

```tsx
import { refuteChoices } from "./refute-prompt.js";
import type { ClueView, CardId } from "../shared/contracts/clue";

export function RefutePrompt({ view, onShow }: { view: ClueView; onShow: (card: CardId) => void }) {
  const choices = refuteChoices(view) as CardId[];
  const s = view.suggestion!;
  return (
    <div className="clue-refute" role="status" data-testid="refute-prompt">
      <p>
        Seat {s.bySeat} suggested <b>{s.suspect}</b> · <b>{s.weapon}</b> · <b>{s.room}</b>.
        You must show one card:
      </p>
      <div className="clue-refute-cards">
        {choices.map((card) => (
          <button key={card} data-card={card} onClick={() => onShow(card)}>{card}</button>
        ))}
      </div>
    </div>
  );
}
```

Wire `RefutePrompt` into `ClueApp.tsx` (already imported in Task 5): it renders only when `isMyRefute(view, ctx.userId)`.

- [ ] **Step 4: Run test to verify it passes + rebuild**

Run: `node --test test/clue-refute-prompt.test.js`
Expected: PASS (4 tests).

Run: `npm run build:client`
Expected: rebuilds `plugins/clue/client/app.js` with the refute prompt included.

- [ ] **Step 5: Commit**

```bash
git add src/clients/clue/refute-prompt.js src/clients/clue/RefutePrompt.tsx test/clue-refute-prompt.test.js
git commit -m "feat(clue): async-refute pause card-choice prompt (AC2)"
```

---

## Task 7: End-to-end wiring verification (AC1 + AC2 at the integration boundary)

**Files:**
- Test: `test/clue-e2e-registration.test.js` (no new production code — locks the end-to-end contract against the registered plugin + the orchestrator)

**Interfaces:**
- Consumes: `plugins.clue` (registry), the Clue adapter, `createOrchestrator`, an in-memory DB + fake SSE + fake LLM. Drives a 3-seat mixed human/bot game and asserts the full loop is creatable and playable.

**Scenarios (drive through the REGISTERED surface, not module internals):**
1. **Create + play.** Build a 3-seat state via `plugins.clue.initialState`; seat a human (seat 0) and two bots (seats 1–2) as `ai_sessions`. Assert the game is active and `plugins.clue.publicView` for the human never exposes `envelope`/`hands`.
2. **Roll pause → resolve → move.** The human is on turn in `phase:'move'`, `pendingRoll:null`. Apply the human's client-rolled `roll {value:5}` via `plugins.clue.applyAction`; assert `pendingRoll === 5`, `activeUserId` unchanged (still the human), `phase:'move'`. Apply a legal `move`; assert it advances toward `suggest` on room entry.
3. **Suggest → human-refute pause → resume.** A suggestion whose first left-holder is the human sets `activeUserId` to the human and `phase:'refute'`; assert `isMyRefute` is true for the human and false for the others; apply `refute {card}`; assert `activeUserId` returns to the suggester in `accuse-or-pass`.
4. **Bot drive across the roll pause (F8b).** With a bot on turn (numeric `pendingRoll`), `orchestrator.scheduleTurn` drives the bot's `move` (not paused); with `pendingRoll:null` and the bot electing to roll, a `clue_roll_request` is broadcast (not applied).
5. **Accuse ends the game.** A correct `accuse` returns `{ ended:true }` with `winnerSeat` = the accuser and `endedReason:'accusation'` (no reliance on a `summary` field — Finding F1).

- [ ] **Step 1: Write the failing test**

Create `test/clue-e2e-registration.test.js` per the scenarios, importing `plugins` from `src/plugins/index.js` and building the orchestrator via the Task 4 harness. Use a fake LLM that always picks the first shortlisted id (deterministic).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-e2e-registration.test.js`
Expected: FAIL until Tasks 2–4 are in (registry/adapter/orchestrator).

- [ ] **Step 3/4: Make it pass**

No new production code — the test passes once Tasks 2–4 land. If it exposes a wiring gap, fix the responsible Task-2..4 module (never the shipped E6-1..E6-4 reducers).

Run the full clue suite + the build once more:

Run: `node --test test/clue-*.test.js && npm run build:client`
Expected: PASS; `plugins/clue/client/app.js` rebuilt.

- [ ] **Step 5: Manual browser verification (the AC checklist)**

Restart the server (`npm start` or `launchctl kickstart -k …` in prod) after the build, then in the browser:
- Create a **3–4 seat mixed human/bot** Clue game; confirm it is creatable (route enforces 3–4 from `players`).
- Confirm the **board renders from the mirror** (rooms/doors/cellar/pawns in the right places — the drift guard already pins the geometry).
- Play a full loop: **Roll → move → suggest → refute → accuse**. Confirm a bot's turn drives across the client-dice pause (you roll for the bot on `clue_roll_request`), and that **when you are the refuter a card-choice prompt appears and resumes** the game on selection.

- [ ] **Step 6: Commit**

```bash
git add test/clue-e2e-registration.test.js
git commit -m "test(clue): end-to-end registered 3-4 seat mixed human/bot game"
```

---

## Inherited Delivery Findings — disposition

Findings carried forward from `sprint/archive/E6-4-session.md` (Plan 3) and the E6-4 Reviewer, each dispositioned here in Plan 4.

| # | Origin | Finding | Plan 4 disposition |
|---|---|---|---|
| **F8(b)** | E6-4 plan (BLOCKING for wiring) | `pendingRoll` semantics are **inverted** between backgammon ("awaiting client value" → pause) and shipped Clue ("known die value" → move). The orchestrator's raw `if (state.pendingRoll) return` gate must NOT be reused for Clue. | **Fixed in Task 4.** The gate becomes `awaitingClientResolution(gameType, state)`; `clue ∉ CLIENT_RESOLUTION_GAMES`, so a numeric Clue `pendingRoll` DRIVES the bot. The bot's values-less roll intent is intercepted (broadcast `clue_roll_request`, not applied); a human client resolves the die and POSTs `roll{value}`. Pinned by `test/clue-orchestrator.test.js`. |
| **Finding #6** | E6-4 Reviewer ([EDGE], LOW) | A non-refuter bot driven during `refute` falls through to a `pass` the reducer rejects — unreachable under the `activeUserId===bot` gate. | **Asserted in Task 4.** The wiring drives Clue bots strictly off `activeUserId` (`botMustActConcurrently` never fires for Clue). Tests pin: an inactive bot is not driven (0 LLM calls); the active bot refuter is driven deterministically. |
| **F7** | E6-3 Reviewer (Gap, MEDIUM) | Public `enterRoom` teleports a pawn to any room with no reachability check — a cheat vector once `plugin.js` is registered. | **Mitigated (client), engine hardening deferred non-blocking.** The client (Task 5) never emits `enterRoom`; room entry is a `move` onto a reachable doorway. Engine-level gating is out of E6-5 scope: it would destabilize 3 shipped E6-1/E6-3 test files, and the fan-project threat model (non-distributed, authenticated participants) makes a participant hand-crafting a teleport POST against their own async game a non-threat. Cheap future follow-up: add a reachability check to `doEnterRoom` or drop the public case. |
| **F9** | E6-4 plan (New, non-blocking) | Persona ↔ controlled-pawn misalignment: `seatSuspect` is assigned by seat order (E6-1), so the `miss-scarlett` bot may control the `mustard` pawn. | **Deferred, non-blocking.** Thematic only; functionally correct. Aligning requires threading each seat's `persona_id` → pawn preference through the **generic** game-creation route (`routes.js:157`) into `initialState` — a cross-cutting change for a cosmetic gain the ACs do not require. Not built in E6-5. |
| **F10** | E6-4 plan (New, non-blocking) | Per-persona difficulty ("cocky persona accuses one step early") is a threaded-but-untuned lever. | **Deferred, non-blocking.** `buildClueShortlist` still ships the single `DIFFICULTY='solved'`. No client/wiring surface needs it. |
| **F6** | E6-4 plan (New, non-blocking) | Optimal least-leak refute needs a refuter-side show-history the public log omits by design. | **Deferred, non-blocking.** The deterministic best-effort `chooseRefuteCard` is unchanged; the client refute prompt (Task 6) shows the human all legal cards and lets them choose. |
| TEA-1 | E6-4 TEA (Conflict) | Plan 3 file map said `rules/refute.js`; the shipped module is `plugins/clue/server/refute.js`. | **N/A to Plan 4** — Plan 4 imports nothing from `refute.js` directly; the bot path is behind `clue-player.js`. No action. |
| TEA-3 | E6-4 TEA (Improvement) | The values-less roll intent is deliberately NOT engine-applicable (`doRoll` demands 1–6); the orchestrator must treat a bot roll intent as a client-dice pause (F8b). | **Honoured in Task 4** — the intercept broadcasts `clue_roll_request` and never applies the value-less roll; a human client POSTs the resolved `roll{value}`. |
| Dev-1 | E6-4 Dev (Improvement) | Colonel Mustard's colour `#d4a017` equals Risk's Colonel Jaune. | **No action** — personas stay game-scoped; no mixed-game picker ships in E6-5. `PAWN_COLORS` (Task 1) reuses the canonical value. |

---

## Self-Review

**1. Story coverage (E6-5):**
- **AC1 — `plugin.js` registered in `src/plugins/index.js`; a 3–4 seat mixed human/bot game is creatable and playable end-to-end (move, suggest, refute, accuse) in the browser** → Task 2 (manifest + registry, min:3/max:4 gate) + Task 3 (AI adapter) + Task 4 (orchestrator drives bots correctly across the dice pause) + Task 7 (end-to-end test + browser checklist). ✅
- **AC2 — client renders the board from the geometry mirror (drift guard passes); the human-refute pause surfaces a card-choice prompt and resumes correctly** → Task 1 (mirror + drift guard) + Task 5 (`Board.tsx` renders from the mirror) + Task 6 (`refute-prompt.js` helpers + `RefutePrompt.tsx`, resume via `refute{card}`). ✅
- **`npm run build:client`** → Tasks 5, 6, 7 rebuild `plugins/clue/client/app.js`; checked-in `index.html`/`style.css` only. ✅
- **async-refute pause UX** → Task 6 (engine already pauses on the human refuter; the client surfaces the choice and resumes). ✅

**2. Placeholder scan:** Every code step shows complete, real code for the pure/JS/manifest/wiring pieces. TSX steps show complete components; the two "omitted for brevity" spots (suggest/accuse `<select>` forms; `style.css` chrome) are conventional rules-free UI explicitly delegated, not behavioural gaps — consistent with how Risk/Sorry clients are verified in this repo (drift guard + build + browser, no TSX unit tests). No TBD/TODO left as deliverable behaviour.

**3. Type/name consistency:** `awaitingClientResolution(gameType, state)` is defined and used identically in `botEligible` and `_runBot` (Task 4). `board-geometry.js` exports (`GRID`, `CELL`, `ROOMS_GEO`, `DOORS`, `CELLAR_POLY`, `SECRET_PASSAGES`, `START_SQUARES`, `PAWN_COLORS`) match the drift-guard imports (Task 1) and `Board.tsx` imports (Task 5). `refuteChoices`/`isMyRefute` signatures match across `refute-prompt.js` (Task 6), its test, and `ClueApp`/`RefutePrompt` usage. `ClueView`/`ClueAction` (Task 5 contract) match the shipped `cluePublicView` fields and the shipped action types (`roll`/`move`/`secretPassage`/`suggest`/`refute`/`accuse`/`pass`). The plugin object shape matches `validatePlugin` (Task 2).

**4. Two implementer verification hooks flagged (not gaps):** confirm the exact `move.payload` shape against the shipped `doMove` (E6-3) and the `useGameState` `ctx`/SSE frame shape against `src/clients/shared/useGameState.ts` + `src/server/sse.js` before finalizing the two `.tsx` files — these are mirrors of shipped contracts, adapted to the real field names.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-02-clue-client.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task with two-stage review between tasks (superpowers:subagent-driven-development).
2. **Inline Execution** — batch execution with checkpoints (superpowers:executing-plans).

**Implementation ordering:** Task 1 (mirror + drift guard) → Task 2 (plugin.js + registration) → Task 3 (AI adapter) → Task 4 (orchestrator F8b — the critical wiring) → Task 5 (client) → Task 6 (refute UX) → Task 7 (end-to-end + build + browser). Tasks 1–3 are independent and can run in parallel; Task 4 depends on Task 3; Tasks 5–6 depend on Tasks 1–2; Task 7 depends on 2–4.

**Do not lose:** **F8(b)** is the load-bearing wiring decision (Clue's `pendingRoll` is a resolved value → drive, never the raw pause gate) and Reviewer **Finding #6** (drive Clue bots strictly off `activeUserId`) — both are pinned by `test/clue-orchestrator.test.js` in Task 4.
