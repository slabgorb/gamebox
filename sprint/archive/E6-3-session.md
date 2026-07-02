---
story_id: "E6-3"
jira_key: ""
epic: ""
workflow: "tdd"
---
# Story E6-3: Clue board geometry + dice movement (grid/rooms/doors/secret passages, BFS, render harness)

## Story Details
- **ID:** E6-3
- **Points:** 8
- **Priority:** p2
- **Workflow:** tdd
- **Implementation Plan:** docs/superpowers/plans/2026-07-01-clue-board-geometry.md (Plan 2 of 4, 8 tasks)
- **Stack Parent:** E6-2 (done — action reducers complete)

## Technical Approach

This story implements the board geometry module (grid + 9 room polygons + doors + 2 secret-passage edges), an offline `rsvg-convert` render/overlap harness, and the `roll`/`move`/`secretPassage` movement actions — integrated into the existing `'move'` phase and the shipped E6-2 `doEnterRoom` reducer. The implementation follows Plan 2 (8 tasks):

**Architecture:**
- **Task 1: `geometry.js`** — Grid (24×25), 9 rooms, 17 doors, 2 secret-passage edges. `buildGeometry(data)` factory with non-overlap/adjacency/count/symmetry assertions.
- **Task 2: Offline `rsvg-convert` render harness** — `plugins/clue/tools/render-board.mjs`, pure `buildBoardSvg()` function + CLI that shells to `rsvg-convert`. Risk-pattern eyeball verification for overlaps.
- **Task 3: `movement.js`** — Reachable-squares self-avoiding walk (orthogonal, **canonical exact-count on corridors**, blocking, no-revisit-in-turn, ≤die into rooms with excess pips ignored).
- **Task 4: Place pawns on start squares** — All 6 suspect pawns start on canonical `START_SQUARES` in `buildInitialState`; add `pendingRoll: null`.
- **Task 5: `roll` action** — Client-supplied die value (1–6); record to `pendingRoll`; stay in `'move'` phase; clear `pendingRoll` on all turn transitions (`doEnterRoom`, `doPass`, `doAccuse` wrong-accusation branch).
- **Task 6: `move` action** — Corridor destination (exact `die` steps) → `'accuse-or-pass'`; room destination (≤`die` steps via door) → delegates to existing `doEnterRoom` → `'suggest'`. Rejects unreachable/malformed targets.
- **Task 7: `secretPassage` action** — Corner-room leap (no roll), lands in opposite corner, ends move → `'suggest'` via `doEnterRoom`.
- **Task 8: Surface reachable moves in `cluePublicView`** — Awaiting-roll affordance (shows `{ needsRoll: true, secretPassage: <roomId|null> }`); after-roll affordance (shows `{ needsRoll: false, pendingRoll, squares, rooms }`). Visible **only to `viewerId === activeUserId`**.

**Phase model:** Integrates into the existing `'move'` phase — does NOT introduce `pending-roll`/`moving` phases. Roll→move sub-state is carried by `state.pendingRoll` (null = await roll, non-null = await move). Preserves all 30+ shipped E6-1/E6-2 tests.

**Room entry:** `move { room }` → delegates to existing `doEnterRoom` (AC#2). Corridor `move { square }` → new accuse-or-pass phase path.

**Geometry injection:** `applyClueAction`/`cluePublicView` gain optional `geo=BOARD` arg so movement logic unit-tests against synthetic mini-board, decoupled from traced coords. Backward-compatible with Plan 1 callers (they pass no `geo`).

**Dice client-side:** `roll` action records client-supplied value; server never generates RNG (backgammon pending-roll pattern).

**Tech Stack:** Node ≥20, ESM, `node --test`. Pure `geometry.js` / `movement.js` exports. Reuses E6-1/E6-2 `buildInitialState`/`applyClueAction`/`cluePublicView`.

## Acceptance Criteria

1. **geometry.js** (grid + 9 rooms + doors + 2 secret-passage edges) verified offline via the rsvg-convert render harness with non-overlapping room polygons.
2. **roll** (client-supplied value) + **move** (grid square) actions enforce orthogonal, no-revisit, no-move-through-occupied movement and route room entry through the existing enterRoom reducer; entering a room ends the move.

## Implementation Constraints

- **Do NOT introduce new phase values.** The engine uses `phase: 'move'|'suggest'|'refute'|'accuse-or-pass'|'ended'`. Roll/move/secretPassage all operate WITHIN `'move'`; roll/move sub-state is `state.pendingRoll`.
- **"Cannot leave and re-enter the same room in one turn"** — `legalMoves` excludes the turn-start room from reachable rooms.
- **Blocked doorway unusable** — `legalMoves` skips thresholds occupied by other pawns.
- **Exact-count on corridors** — Corridor destination requires **exactly** `die` steps; room entry requires **≤** `die` steps (excess ignored).
- **Preserved test invariants:** All 30+ Plan 1 E6-1/E6-2 tests stay green. Intentional change: `test/clue-state.test.js` "pawns off-board" assertion flips to "pawns on start squares" (flagged in Plan 1, pre-approved).

## Out of Scope (Explicitly Flagged)

- React client + client-mirror geometry (Plan 4)
- Bots / knowledge tracker / shortlist / auto-refute (Plan 3)
- `plugin.js` manifest + registration in `src/plugins/index.js` (Plan 4)
- "Suggest-in-place when pawn is dragged into a room by another player" turn-flow affordance (Plan 4 / Delivery Finding)

The **server geometry module + offline render harness ARE in scope**; the client mirror is not.

## Delivery Findings

<!-- Append-only. Each agent writes under its own subheading. -->

### TEA (test design)

- **Conflict** (non-blocking): The plan's Task 6/7 delegate room entry to the existing `doEnterRoom`, but `doEnterRoom` validates the room against the static `ROOMS` catalog (`plugins/clue/server/actions.js:28`), which rejects the synthetic geometry room ids (`ra`/`rb`) that the plan's own tests (and mine) use via injected `geo`. Affects `plugins/clue/server/actions.js` (room validation in `doEnterRoom` must become geometry-aware — e.g., validate membership against `geo.rooms` — or `doMove`/`doSecretPassage` must own validation via `legalMoves`/`secretPassageDest` and bypass the catalog check). *Found by TEA during test design.*
- **Improvement** (non-blocking): The plan's `secretPassageDest` sketch (`geo.secretPassages[roomId] ?? null`) is unsafe for prototype-chain keys — `secretPassages['__proto__']` returns `Object.prototype` (truthy), not `undefined`. Affects `plugins/clue/server/rules/movement.js` (use an own-property-safe lookup, e.g. `Object.hasOwn` or a null-prototype object/Map). A test now pins the `null` behavior. *Found by TEA during test design.*

### Dev (implementation)

- Both TEA findings above are RESOLVED in commit `d82814e` (geometry-aware `doEnterRoom`, `Object.hasOwn` passage lookup) — see Dev deviations for details.
- **Improvement** (non-blocking): The render harness's output artifacts are not gitignored — a future `git add .` could accidentally commit them. Affects `.gitignore` (add `docs/clue-board.svg` and `docs/clue-board.png`; the plan marks them throwaway). Artifacts were generated for AC#1 verification, eyeballed, and deleted this session. *Found by Dev during implementation.*

### Reviewer (code review)

- **Gap** (non-blocking): The public `enterRoom` action teleports a pawn to any room with no roll and no reachability check — Plan 1's abstract-room contract, deliberately retained, but it becomes a client cheat vector the moment Plan 4 registers `plugin.js`. Affects `plugins/clue/server/actions.js` (Plan 4 must gate direct `enterRoom` behind reachability, restrict it to server-internal use, or drop it from the public switch once the client speaks roll/move). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `legalMoves` trusts `state.pendingRoll` unconditionally — a corrupted state (e.g., a future bot writing `pendingRoll: 100` directly) would trigger a combinatorial walk explosion. Affects `plugins/clue/server/rules/movement.js` (consider clamping die to 1–6 at the walk boundary when Plan 3 introduces non-reducer state writers). *Found by Reviewer during code review.*

## Design Deviations

<!-- Append-only. Each agent writes under its own subheading. -->

### TEA (test design)
- No deviations from spec. All seed tests from the implementation plan (Tasks 1–8) were adopted verbatim; additional tests only tighten coverage of constraints the spec already states (blocked-doorway exit/entry, exact-count parity, strict input typing, copy-on-write immutability, `pendingRoll` clearing on the accuse branch, view leak guards for spectators/eliminated seats).

### Dev (implementation)
- **`doEnterRoom` validates rooms against injected geometry instead of the static catalog**
  - Spec source: docs/superpowers/plans/2026-07-01-clue-board-geometry.md, Task 6 sketch (and Plan 1's as-built `doEnterRoom`)
  - Spec text: "if (!ROOMS.includes(room)) return { error: `invalid room '${room}'` }" (Plan 1 code the plan's Task 6 delegates to unchanged)
  - Implementation: `doEnterRoom(state, seat, payload, geo)` validates `typeof room === 'string' && Object.hasOwn(geo.rooms, room)`; error message unchanged
  - Rationale: Resolves TEA's Conflict finding — the plan's own Task 6/7 tests enter synthetic rooms (`ra`/`rb`) via injected `geo`, which the catalog check rejects. Default `geo = BOARD` carries exactly the catalog rooms, so all Plan 1 callers observe identical behavior (verified: 115/115 green including Plan 1's `invalid room 'attic'` assertion).
  - Severity: minor
  - Forward impact: none — external contract unchanged for real-board callers; Plan 3/4 callers use the default geometry
- **`secretPassageDest` uses an own-property lookup, not bare bracket access**
  - Spec source: docs/superpowers/plans/2026-07-01-clue-board-geometry.md, Task 3 sketch
  - Spec text: "return geo.secretPassages[roomId] ?? null"
  - Implementation: `Object.hasOwn(geo.secretPassages, roomId) ? geo.secretPassages[roomId] : null`
  - Rationale: Resolves TEA's Improvement finding — bare bracket access returns `Object.prototype` (truthy) for `'__proto__'`; TEA's test pins `null` for prototype-chain keys
  - Severity: minor
  - Forward impact: none

### Reviewer (audit)
- **TEA "No deviations from spec"** → ✓ ACCEPTED by Reviewer: verified — every plan seed test present verbatim in the committed test files; the additions strictly tighten stated constraints (checked blocked-doorway, parity, typing, immutability, accuse-clearing, and view-guard tests against the plan's constraint list).
- **Dev "`doEnterRoom` validates rooms against injected geometry instead of the static catalog"** → ✓ ACCEPTED by Reviewer: the plan's Task 6 was internally inconsistent (its own tests enter synthetic rooms that the catalog check rejects); this resolution follows the spec-authority hierarchy (story/plan tests over inherited Plan 1 code), preserves the error message and default-geometry behavior exactly (Plan 1's `invalid room 'attic'` test still green), and hardens with a string-type + own-property check.
- **Dev "`secretPassageDest` uses an own-property lookup"** → ✓ ACCEPTED by Reviewer: strictly safer than the plan's sketch; behavior identical for all real room ids; pinned by test.
- No undocumented deviations found: I diffed the plan's Tasks 1–8 interfaces against the implementation — signatures, phase transitions, `pendingRoll` lifecycle, and view shapes all match the spec text.

## Branch Strategy

**Branch Strategy:** trunk-based (branching skipped — work happens on the default branch `main`)
**Repo:** g-1 (path `.`)
**Base Branch:** main

## Sm Assessment

**Setup Status:** Complete
**Jira:** Skipped — this project does not use Jira (jira_key intentionally empty)
**Session File:** Created with story details, technical approach, ACs, constraints, and out-of-scope flags
**Context Files:** `sprint/context/context-epic-E6.md` and `sprint/context/context-story-E6-3.md` both present
**Branch:** Trunk-based on `main` per repos topology — no feature branch created (stack parent E6-2 already merged to main)
**Implementation Plan:** `docs/superpowers/plans/2026-07-01-clue-board-geometry.md` (Plan 2 of 4, 8 tasks)
**Workflow:** tdd (8-point story) — setup → red → green → review → finish

**Handoff:** To Deep Thought (TEA) for the red phase — write failing tests covering the two ACs (geometry + render harness verification; roll/move movement rules integrating with the shipped E6-2 `doEnterRoom` reducer), honoring the implementation constraints (no new phase values, exact-count corridors, `pendingRoll` sub-state).

## TEA Assessment

**Tests Required:** Yes
**Reason:** 8-point feature story adding a geometry module, movement algorithm, and three new reducer actions — core engine behavior.

**Test Files:**
- `test/clue-geometry.test.js` (new) — grid dims, 9 catalog rooms, AC#1 non-overlap (rasterized), cellar/room disjointness + non-corridor, door adjacency + canonical counts (17), secret-passage symmetry/endpoints, distinct corridor start squares, `buildGeometry` pure-factory on a synthetic board, `buildBoardSvg` harness smoke (rooms/doors/starts rendered).
- `test/clue-movement.test.js` (new) — `legalMoves` on a synthetic 6×6 board: orthogonal-only, exact-count on corridors (incl. distance-parity check), room entry ≤ die with excess ignored, no-re-enter-start-room, corridor blocking (land + pass-through), blocked doorway from BOTH sides (sealed exit, sealed entry), `occupiedSquares` semantics, falsy `pendingRoll` → no moves, `secretPassageDest` incl. prototype-key safety.
- `test/clue-actions-movement.test.js` (new) — `roll` (records value, stays in `'move'`; rejects 0/7/2.5/'3'/missing payload/double-roll/wrong seat/wrong phase/non-participant), `pendingRoll` clearing on `pass`/`enterRoom`/wrong-accusation-advance, `move` (corridor → `'accuse-or-pass'`; room → `doEnterRoom` → `'suggest'`; rejects unreachable/malformed/stringly targets and wrong seat; input-state immutability), `secretPassage` (leap → `'suggest'`; rejects corridor start, post-roll use, passage-less rooms).
- `test/clue-state.test.js` (modified) — pre-approved flip: pawns start on `START_SQUARES` (was off-board); new `pendingRoll: null` initial-state test.
- `test/clue-view.test.js` (modified) — movement surfacing: needsRoll affordance (with/without secret passage), after-roll squares/rooms, leak guards (non-active seat, spectator, eliminated seat, non-move phase), `pendingRoll` public to all viewers.

**Tests Written:** 36 new/modified tests covering both ACs (plus all 8 plan tasks)
**Status:** RED (verified — see below), ready for Dev

**RED verification (testing-runner, RUN_ID E6-3-tea-red):** 53 tests total: 48 pass, 5 fail. All 5 failing files fail at module load with `ERR_MODULE_NOT_FOUND` for `plugins/clue/server/geometry.js` — the expected RED signature. All 6 Plan 1 test files that don't import geometry (cards, refute-walk, suggest, refute, accuse, pass) stay green.

**Commit:** `13c4cad` — `test(clue): add failing tests for E6-3 (geometry, movement BFS, roll/move/secretPassage, view surfacing)`

### Rule Coverage

| Rule (lang-review/javascript.md) | Test(s) | Status |
|------|---------|--------|
| #3 prototype/object safety | `secretPassageDest is not fooled by prototype-chain keys` | failing (file load) |
| #4 equality/coercion (strict types, no truthy traps) | `roll rejects ... stringly-typed die value`, `move rejects malformed and stringly-typed targets`, `pendingRoll falsy -> no moves` | failing (file load) |
| #8 test quality (no vacuous assertions) | Self-check pass over all new tests; strengthened one iteration with a count guard (`secret-passage endpoints`, 4-entry assertion) | done |
| #9 module/scope (copy-on-write contract) | `move does not mutate the input state` | failing (file load) |
| #10 error handling (specific error surfaces) | Every rejection test asserts a specific `error` message via `assert.match` | failing (file load) |
| #11 input validation at boundaries | `roll rejects non-1-6 values...`, `roll rejects a missing payload...`, `roll by a non-participant`, `move rejects an unreachable / diagonal / pre-roll square` | failing (file load) |

**Rules checked:** 6 of 6 applicable lang-review rules have test coverage (#1/#2/#5/#6/#7/#12 not applicable: pure synchronous reducer/geometry code, no DOM, no shell/fs at test surface, no regex on user input, no deps added).
**Self-check:** 1 potentially vacuous iteration found and fixed (empty-map loop guarded with a count assertion); 0 `let _ =` / `assert(true)` patterns.

**Handoff:** To Trillian (Dev) for GREEN — implement `geometry.js`, `tools/render-board.mjs`, `rules/movement.js`, and the `roll`/`move`/`secretPassage` reducer + state/view edits per the plan. Note the two Delivery Findings: `doEnterRoom` catalog validation vs injected geometry, and own-property-safe secret-passage lookup.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `plugins/clue/server/geometry.js` (new) — `GRID` 24×25, `BOARD_DATA` (9 seed room polygons, 17 doors, cellar, secret passages), `START_SQUARES`, `SECRET_PASSAGES`, `buildGeometry(data)` factory (rasterized `roomCells` via center-point-in-poly, `cellToRoom`, `cellarCells`, `inBounds`/`isCorridor`, `doorsBySquare`/`doorsByRoom` indexes), `BOARD` singleton, catalog-id guard.
- `plugins/clue/tools/render-board.mjs` (new) — pure `buildBoardSvg(geo, starts)` (translucent room fills so overlaps blend visibly, cellar shading, red door thresholds, blue start rings) + import-safe CLI that writes `docs/clue-board.{svg,png}` via `rsvg-convert` (`execFileSync`, array args).
- `plugins/clue/server/rules/movement.js` (new) — `occupiedSquares` (corridor pawns only, mover excluded), `legalMoves` self-avoiding orthogonal walk (exact-count corridors, ≤die room entry with excess ignored, blocking incl. door thresholds both sides, turn-start room excluded), own-property-safe `secretPassageDest`.
- `plugins/clue/server/state.js` — pawns start on `START_SQUARES` (copies), `pendingRoll: null` added to initial state.
- `plugins/clue/server/actions.js` — `applyClueAction` gains `geo = BOARD`; new `doRoll` (integer 1–6, single roll per turn, `'move'` phase only), `doMove` (corridor → `'accuse-or-pass'`; room → `doEnterRoom` → `'suggest'`), `doSecretPassage` (corner leap instead of rolling, via `doEnterRoom`); `pendingRoll` cleared in `doEnterRoom`, `doPass`, and the wrong-accusation advance branch; `doEnterRoom` room validation is geometry-aware (see deviation log).
- `plugins/clue/server/view.js` — `cluePublicView` gains `geo = BOARD`; public `pendingRoll`; `movement` affordance (`needsRoll`/`secretPassage` awaiting roll, `squares`/`rooms` after roll) disclosed only to non-eliminated `viewerId === activeUserId` in the `'move'` phase.

**Tests:** 115/115 passing (GREEN — verified by testing-runner, RUN_ID E6-3-dev-green; includes all Plan 1 E6-1/E6-2 tests)
**AC#1 offline verification:** Render harness run (`node plugins/clue/tools/render-board.mjs`), PNG eyeballed: no overlapping room fills, all 17 door thresholds on corridor cells touching their rooms, 6 start rings on the correct board edges, cellar shaded center. Artifacts deleted afterward (throwaway per plan).
**Branch:** main (trunk-based, pushed — commits `13c4cad` tests, `d82814e` implementation)

**Handoff:** To Arthur Dent (Reviewer) for the review phase.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 1 (console.log in CLI guard) | confirmed 0, dismissed 1 (guarded CLI tool output at render-board.mjs:63–74; test run produced no artifacts, proving the guard holds on import), deferred 0 |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings — domain assessed by Reviewer (see [EDGE] items) |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings — domain assessed by Reviewer (see [SILENT] item) |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings — domain assessed by Reviewer (see [TEST] item) |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings — domain assessed by Reviewer (see [DOC] item) |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings — domain assessed by Reviewer (see [TYPE] item) |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings — domain assessed by Reviewer (see [SEC] items) |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings — domain assessed by Reviewer (see [SIMPLE] item) |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings — Rule Compliance section below is the exhaustive manual pass |

**All received:** Yes (1 enabled subagent returned; 8 disabled via settings, domains covered manually)
**Total findings:** 3 confirmed (1 Medium logged as Delivery Finding for Plan 4, 2 Low), 1 dismissed (with rationale), 0 deferred

## Reviewer Assessment

**Verdict:** APPROVED

**Preflight:** 115/115 tests green; no lint tooling configured in this repo (pre-existing, not introduced here); working tree clean apart from pre-existing planning docs; both story commits pushed to origin/main.

**Data flow traced:** client action `{type:'move', payload:{square:[c,r]}}` → `applyClueAction` (participant check via `actorSeat`, actions.js:12–13) → `doMove` (turn guard :44, phase guard :45, roll-first guard :46) → `legalMoves` (pure function over injected geometry; self-avoiding walk movement.js:38–49 with corridor/occupancy/visited checks at :45) → strict-equality membership test (actions.js:57–58, numbers only — stringly coords fail) → `structuredClone` copy → new state. Safe because every hop validates before mutating a clone, and the input state is never touched (pinned by the immutability test).

**Pattern observed:** Geometry-injection seam (`geo = BOARD` defaults at actions.js:16 and view.js:8) mirrors the established `cluePublicView` hidden-information seam — algorithms unit-test against synthetic boards while production callers get the real board with zero call-site changes. Good pattern, consistently applied across actions/view/movement.

**Error handling:** Every reducer guard returns a distinct `{ error: '<specific message>' }` (actions.js:31–36 roll; :44–46, 51, 59 move; :67–72 secretPassage; :85–90 enterRoom) matching the Plan 1 convention; state-construction failures throw `Error` with a message (state.js:16). No silent fallbacks in server code.

**Observations (severity-tagged):**
1. `[SEC]` **[MEDIUM → logged as Delivery Finding, non-blocking]** The public `enterRoom` action (actions.js:20) still teleports a pawn to any valid room with no roll and no reachability check — Plan 1's abstract-room behavior, deliberately retained by the plan (its Task 5 switch sketch keeps the case, and Plan 1 tests exercise it directly). Unexploitable today (no `plugin.js`, no transport — engine is a tested library), but it becomes a cheat vector the moment Plan 4 registers the plugin. Recorded as a Gap for Plan 4 below. Not blocking this story: the AC explicitly requires routing room entry *through* the existing reducer, and removing/gating it now would break Plan 1's shipped contract before Plan 4 owns the wiring decision.
2. `[EDGE]` **[LOW]** `buildGeometry` does not validate that each `door.room` id exists in `rooms` — a typo'd door in authored data would surface as a phantom enterable room id in `legalMoves`. Fully covered for the real `BOARD` by the geometry tests (door counts + adjacency force valid ids); only hand-authored future data is at risk, and the render harness would visually expose it. Non-blocking.
3. `[EDGE]` **[LOW]** The correct-accusation branch ends the game via `endWith` without clearing `pendingRoll`; a stale die value remains in the terminal state. Harmless: phase `'ended'` yields `movement: null` for every viewer (view.js:28 gate) and no further actions apply; the wrong-accusation *advance* branch does clear it (actions.js:199). Non-blocking.
4. `[VERIFIED]` Leak guard: `movement` reachability is disclosed only to the non-eliminated `viewerId === activeUserId` in phase `'move'` — view.js:27–28 computes `isActive` with all three conditions; tests pin non-active seat, spectator, eliminated seat, and non-move phase all receiving `null`. Complies with the epic's hidden-information-seam principle; no aggregate private containers added to the view (envelope/hands/ledgers still structurally absent, pinned by Plan 1's leak-guard test which still passes).
5. `[VERIFIED]` Prototype safety (rule #3): both user-influenced object lookups are own-property-guarded — `secretPassageDest` at movement.js:21 (`Object.hasOwn`), room validation at actions.js:88 (`typeof === 'string' && Object.hasOwn`). Tests pin `'__proto__'`/`'constructor'` → `null`. Map-based `doorsBySquare` lookups are inherently safe.
6. `[VERIFIED]` Exact-count + blocking semantics (AC#2): corridor destinations only added when `steps === die` (movement.js walk), room entry added at `steps + 1 <= die`; occupied squares block both landing and pass-through (:45), and blocked door thresholds seal rooms from BOTH sides (:55 exit-side skip; entry-side unreachable because the threshold square itself is never steppable). Distance-parity test pins that a die=2 cannot land 1 square away.
7. `[VERIFIED]` `pendingRoll` lifecycle: set only by validated `doRoll` (integer 1–6, single roll, actions.js:31–36); cleared on every turn transition — `doEnterRoom` :94, `doPass` :214, wrong-accusation advance :199 — each pinned by a dedicated test.
8. `[TEST]` `[VERIFIED]` Test quality: 115 tests, no `.only`/`.skip`, no vacuous assertions found (TEA's self-check fixed the one weak iteration); negative cases cover every reducer guard; an immutability test enforces the `structuredClone` copy-on-write contract; Plan 1's 48 tests all still green with the single pre-approved assertion flip.
9. `[SILENT]` `[VERIFIED]` No swallowed errors in server code; the render CLI's `try/catch` (render-board.mjs:67–73) reports the `rsvg-convert` failure to stderr with the message and still writes the SVG — appropriate for an offline tool.
10. `[TYPE]` `[VERIFIED]` Input typing is strict throughout: `Number.isInteger` for the die, `Array.isArray` + strict `===` on coordinates (no coercion — `['2','3']` rejected, test-pinned), `typeof room === 'string'` before the room lookup.
11. `[SIMPLE]` `[VERIFIED]` No over-engineering: the walk is a direct recursive enumeration (bounded at 4-branching × die ≤ 6), no premature memoization/abstraction; geometry factory computes exactly the indexes the consumers use. Nothing to simplify without losing clarity.
12. `[DOC]` `[VERIFIED]` Comments state constraints, not narration (e.g., movement.js header documents exact-count/blocking semantics; geometry.js header pins the coordinate frame and refinement loop; view.js notes the disclosure rule). No stale comments — the one Plan 1 comment invalidated by this story ("Plan 2 assigns start squares", state.js) was updated in place.

### Rule Compliance

Exhaustive pass of `.pennyfarthing/gates/lang-review/javascript.md` (no `.claude/rules/` or `SOUL.md` in this repo) against all 6 changed production files `[RULE]`:

| # | Check | Result |
|---|-------|--------|
| 1 | Silent error swallowing | PASS — no empty catches; CLI catch logs and degrades gracefully (render-board.mjs:67–73); no `JSON.parse` in diff |
| 2 | Promise/async pitfalls | PASS — only top-level `await import()` inside the CLI guard; no floating promises, no async iteration |
| 3 | Prototype pollution / object safety | PASS — `Object.hasOwn` at movement.js:21 and actions.js:88; Maps for square-keyed indexes; no `Object.assign` from input |
| 4 | Equality/coercion | PASS with note — all comparisons `===`/`!==`/`Number.isInteger`; the one falsy check (`if (!die)`, movement.js:26) is deliberate spec'd behavior ("falsy pendingRoll → no moves"), safe because `doRoll` makes 0 unrepresentable, and test-pinned |
| 5 | DOM/browser security | N/A — no DOM; SVG is built from server-authored geometry only, no user input interpolated |
| 6 | Node.js security | PASS — `execFileSync` with array args (render-board.mjs:69), no `exec` interpolation, no variable `require`, no env secrets |
| 7 | Regex safety | PASS — no `new RegExp` from input; test regexes are literals |
| 8 | Test quality | PASS — no truthy-style assertions, no `.only`/`.skip`, mocks unused (pure functions), meaningful assertions throughout |
| 9 | Module/scope | PASS — `const`/`let` only; explicit `.js`/`.mjs` extensions; import graph is acyclic (cards ← geometry ← {state, actions, view, movement-consumers}; movement ← {actions, view}) |
| 10 | Error handling patterns | PASS — reducers return `{ error: string }` per the plugin's established contract (not thrown strings); the one `throw` is a proper `Error` with message (state.js:16) |
| 11 | Input validation | PASS — every action payload validated at the reducer boundary (die integer/range, coordinate shape, room membership, turn/phase guards); non-participants rejected before dispatch |
| 12 | Dependency/config hygiene | PASS — no new deps; `console.*` only inside the CLI entry guard of an offline tool, unreachable via import (proven: test suite runs produce no output/artifacts) |
| 13 | Fix-introduced regressions | N/A — no fix commits in this story |

### Devil's Advocate

Assume this code is broken and I'm the one who has to explain why over a cup of tea. First, the cheater: nothing stops a client from skipping `roll`/`move` entirely and sending `enterRoom { room: 'study' }` every turn — free teleport, infinite suggestion engine, and it passes every guard because Plan 1 defined exactly that behavior. Today there is no transport (no `plugin.js`, no registration), so the attack surface is theoretical, but Plan 4 will make it real the day it registers the plugin — hence my Gap finding; if that finding gets lost, this becomes a genuine exploit. Second, the confused player: `pass` is legal in phase `'move'` before rolling, so a player can skip their turn outright. That is a mild departure from strict tabletop rules (you must normally roll), but it is the plan's documented escape hatch for the empty-`legalMoves` corner and affects no information or fairness invariant — noted, not actionable here. Third, the corrupted state: if some future caller writes `pendingRoll: 100` directly into state (bypassing `doRoll`), the self-avoiding walk explodes combinatorially (4-ary branching, depth 100) and could hang the process. No action can produce that value today, and reducers are the only sanctioned writers, so I rate it a latent-robustness note for Plan 3's bot layer rather than a finding. Fourth, malformed geometry: a door placed on a room cell is skipped by the `isCorridor` check (movement.js:55), a door naming a nonexistent room is my Low finding #2, and a room with zero doors is sealed forever — all caught for the real board by the canonical-count tests and the render harness. Fifth, the walk itself: could `visited.delete` on backtrack (movement.js:48) readmit a square and create a cycle? No — deletion happens only after the recursive branch fully unwinds, which is precisely what makes it a correct self-avoiding-walk enumeration rather than plain BFS; the distance-parity test would fail otherwise. I tried to break it; the tests got there first.

**Handoff:** To Slartibartfast (SM) for finish-story.

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-07-02T03:32:41Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-01T22:56:49+00:00 | 2026-07-02T03:11:16Z | 4h 14m |
| red | 2026-07-02T03:11:16Z | 2026-07-02T03:20:18Z | 9m 2s |
| green | 2026-07-02T03:20:18Z | 2026-07-02T03:27:46Z | 7m 28s |
| review | 2026-07-02T03:27:46Z | 2026-07-02T03:32:41Z | 4m 55s |
| finish | 2026-07-02T03:32:41Z | - | - |