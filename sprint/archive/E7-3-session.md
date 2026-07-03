---
story_id: "E7-3"
jira_key: ""
epic: "E7"
workflow: "tdd"
---
# Story E7-3: Pawn move reverts after page refresh (move not persisted like the suggestion log)

## Story Details
- **ID:** E7-3
- **Title:** Pawn move reverts after page refresh (move not persisted like the suggestion log)
- **Type:** bug
- **Jira Key:** (none)
- **Points:** 3
- **Priority:** p1
- **Workflow:** tdd
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-07-03T10:51:39Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-03T08:46:15Z | 2026-07-03T08:47:42Z | 1m 27s |
| red | 2026-07-03T08:47:42Z | 2026-07-03T10:44:53Z | 1h 57m |
| green | 2026-07-03T10:44:53Z | 2026-07-03T10:46:29Z | 1m 36s |
| review | 2026-07-03T10:46:29Z | 2026-07-03T10:51:39Z | 5m 10s |
| finish | 2026-07-03T10:51:39Z | - | - |

## Technical Approach

**Problem Statement**
During the first Clue playtest, a pawn move reverted after a page refresh:
- Human (Scarlett) moved to conservatory
- Page refreshed → pawn returned to pre-move position
- Suggestion history persisted correctly → issue is isolated to pawn location

**Root Cause Hypothesis**
Divergence in state serialization/rehydration between `move` and `suggest` actions:
1. The `move` action may not write pawn-location to persisted state row
2. OR `cluePublicView` rehydration rebuilds pawn state from stale persisted data on reload

**Investigation Path**

1. **Reproduce systematically**
   - Start a Clue game and move a human-controlled pawn mid-game
   - Record the room/square before and after
   - Refresh the page and verify pawn position

2. **Trace state persistence (move vs suggest)**
   - `src/server/routes.js` - POST `/api/games/:id/action` handler
   - `src/server/games.js` - action dispatch logic
   - `src/server/db.js` - game state write for move vs suggest
   - `plugins/clue/server` - move action apply (does it return updated state?)

3. **Trace state rehydration**
   - `cluePublicView` function - how it rebuilds board state on page load
   - Where pawn locations are sourced (persisted row vs in-memory state)
   - Compare: suggestion log read path vs pawn location read path

4. **Fix candidate locations**
   - If write is missing: ensure move action updates persisted state row (like suggest does)
   - If rehydration is stale: validate persisted data freshness before rebuild

5. **Lock with regression test**
   - Create test: `POST move` → read persisted state → reload → verify pawn location
   - Ensure no regression in suggestion history or other state

## Acceptance Criteria
- A pawn move survives a page refresh — after reload the pawn is at its moved-to room/square, not the pre-move position.
- Root cause is identified (persisted vs rehydrated pawn state) and locked with a regression test that persists state after a move and re-reads it.
- Suggestion history and other already-correct state stay correct (no regression).

## Delivery Findings

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Conflict** (blocking): The story's stated root cause — "a `move` is not persisted the same way the suggestion log is" — does not reproduce on current main. A full-stack HTTP reproduction (roll → move → re-read the persisted DB row AND the rehydrated `GET /api/games/:id` view) shows the moved pawn persists identically for both a corridor-square move and a room entry. `writeGameState` (`src/server/state.js`) serialises the *whole* state, so `pawns` and `log` cannot diverge; `cluePublicView` (`plugins/clue/server/view.js:47`) returns `state.pawns` verbatim on reload. Affects the whole premise of E7-3 — there is no server-side fix to implement against this seam.
- **Conflict** (non-blocking): The real playtest game (`game.db` id 8: Keith/scarlett + 3 bots) proves moves persist — Scarlett suggested from the conservatory (`state.log[2]`), which is only legal while standing in it, so her conservatory move *did* persist before she moved on to the hall and lounge. Game 8 is instead frozen on The Tortoise's turn (`activeUserId:28`, `phase:move`), which looks like the mid-play hang tracked in **E7-5**, not a pawn revert.
- **Improvement** (non-blocking): Genuine latent bug found while ruling out the client — `useGameState.resync()` (`src/clients/shared/useGameState.ts`) has no request-ordering guard. On mount it fires one fetch, then every SSE `update` fires another; an older fetch resolving after a newer one overwrites `view` with stale state (a visual-only revert; server stays correct). This does NOT explain the refresh symptom (the first post-refresh fetch already returns the persisted moved state), so it is a *separate* finding, not the E7-3 root cause. Affects `useGameState.ts` (epoch/sequence-guard resync). Suggest its own story.

*Found by TEA during test design.*

### Dev (implementation)
- No upstream findings during implementation. Verified TEA's regression guard runs GREEN (3/3); no code required for E7-3 per the falsified-hypothesis finding and the Option-1 decision.

*Found by Dev during implementation.*

### Reviewer (code review)
- **Gap** (non-blocking): Pre-existing suite failure unrelated to E7-3 — `test/sorry/client-files.test.js:38` asserts `plugins/sorry/client/assets/checker-red.png` and `checker-blue.png` exist, but only `card-back.png` is on disk (the working tree also shows those PNGs deleted). Last touched by `50619e0`, long before this story. Affects `plugins/sorry/client/assets/` (likely just needs `npm run build:client`, not a code fix). Surfaced here only because preflight ran the whole suite; explicitly OUT of scope for E7-3.

*Found by Reviewer during code review.*

## Design Deviations

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Delivered a passing regression guard instead of a failing (RED) test**
  - Spec source: context-story-E7-3.md, AC-2
  - Spec text: "Root cause is identified ... and locked with a regression test that persists state after a move and re-reads it."
  - Implementation: `test/clue-move-persistence.test.js` — 3 tests (square move, room entry, log-preservation) that persist a move and re-read it via the real action route + `GET` rehydration. They PASS on current main.
  - Rationale: The hypothesised root cause was falsified (see Delivery Findings). Fabricating a failing test for a non-existent server bug would violate test integrity. The suite still satisfies AC-2's "regression test that persists and re-reads" and guards the behaviour against future regression.
  - Severity: major
  - Forward impact: RED phase produced no work for Dev on the named seam. Story needs a user decision on direction (see the AskUserQuestion in the TEA report) before it can proceed to GREEN.

### Dev (implementation)
- **No implementation performed — zero code changed**
  - Spec source: E7-3 session scope + TEA Assessment
  - Spec text: "Investigate ... locate the divergence between persisted and in-memory pawn state, then fix so a move survives reload."
  - Implementation: None. TEA falsified the root-cause hypothesis (the move already persists and rehydrates correctly) and the user chose Option 1 (lock the behaviour). The regression guard `test/clue-move-persistence.test.js` was already committed by TEA (`276ccaf`) and is GREEN (3/3). There is no defect to fix on this seam.
  - Rationale: Writing code to "fix" a behaviour that already works would be scope creep against a non-existent bug. The minimal correct action is to verify the guard is green and forward to review.
  - Severity: major
  - Forward impact: The reported live symptom is folded into E7-5 (mid-play hang). The latent client resync-race is deferred to its own story. Neither is in scope for E7-3.

### Reviewer (audit)
- **TEA: "Delivered a passing regression guard instead of a failing (RED) test"** → ✓ ACCEPTED by Reviewer: Sound. I independently reproduced the persistence path and reviewed the evidence — the moved pawn persists via `writeGameState` and rehydrates via `cluePublicView`, so no honest failing test exists against this seam. Fabricating one would violate test integrity. The green guard satisfies AC-2's "regression test that persists state after a move and re-reads it," which is verified GREEN (3/3).
- **Dev: "No implementation performed — zero code changed"** → ✓ ACCEPTED by Reviewer: Sound. The behaviour already works; adding a "fix" would be scope creep against a non-existent defect. Correct minimalist call.
- No undocumented deviations found. The one caveat I record: AC-2 literally reads "Root cause is identified." The root cause of the *reported live symptom* was not positively identified (it is unreproducible on current main; leading theories are the pre-E7-2 playtest build and the E7-5 hang). This is not a blocker — the user explicitly chose Option 1, which reframes AC-2 as "mark the live revert unreproducible + fold into E7-5." Deferring to that documented decision (story scope is the highest spec authority).

## Sm Assessment

**Setup decisions (Slartibartfast):**
- **Workflow:** `tdd` (phased) as specified in the backlog — correct for a defect. This bug needs a failing repro test *first* (move → persist → reload → assert pawn position) so the fix is provably locked, not just observed once by hand.
- **Repo:** g-1 (`.`), trunk-based — no feature branch; work lands on the default branch.
- **Jira:** none (kanban story); claim step explicitly skipped.
- **Merge gate:** clear — no open PRs blocking new work.

**Routing rationale:** RED phase → **tea** (Deep Thought). TEA should reproduce the revert, then write a failing test at the persistence seam. The description already points at the likely divergence — `move` vs `suggest` state-write in `src/server/routes.js` / `games.js` / `db.js`, the clue move apply in `plugins/clue/server`, and the persisted-state → `cluePublicView` rehydration. Recommend `systematic-debugging` to locate the exact divergence before asserting on it. Scarlett-to-conservatory is the concrete repro to encode.

## TEA Assessment

**Tests Required:** Yes (regression guard) — but the reported bug did NOT reproduce.
**Reason:** systematic-debugging Phases 1–3 falsified the story's root cause. Pawn moves persist identically to the suggestion log through the real action route + rehydration (evidence in Delivery Findings). No failing (RED) test is honestly writable against the named seam.

**Test Files:**
- `test/clue-move-persistence.test.js` — 3 tests: corridor-square move survives reload, room entry survives reload, move preserves the suggestion log (AC3). All GREEN on current main.

**Status:** GREEN guard, not RED. The persistence seam works; the suite locks it so a future per-field write or log-derived rehydration breaks loudly.

**Investigation (evidence):**
| Check | Result |
|-------|--------|
| Full-stack HTTP repro (roll → move → DB row + GET view) | pawn PERSISTED, no revert |
| `writeGameState` | serialises whole state; `pawns`+`log` can't diverge |
| `cluePublicView:47` | returns `state.pawns` verbatim on reload |
| client (`useGameState`, HTML shell) | fresh fetch on mount; no cache/SW/localStorage; `no-store` |
| orchestrator clobber window | closed by the re-read-fresh fix on 2026-05-12 (pre-playtest) |
| real game 8 | scarlett's conservatory move persisted (suggested from it, log[2]); game frozen on a bot turn → E7-5 hang |

**User decision (Keith, seat-0 playtester):** Option 1 — **lock it + fold into E7-5**. Keep the green regression guard, mark the live revert unreproducible on current main, and treat game 8's frozen bot-turn as the E7-5 mid-play hang (evidence recorded in Delivery Findings for E7-5 to absorb).

**Handoff → Dev (Trillian):** No implementation required. The regression guard (`test/clue-move-persistence.test.js`, committed `276ccaf`) is already GREEN. Verify it runs green and forward to Reviewer — there is no bug to fix on this seam. The latent client resync-race (Delivery Findings) is explicitly OUT of scope for E7-3; it wants its own story.

## Dev Assessment

**Implementation Complete:** N/A — no code changed. Root-cause hypothesis was falsified by TEA; user chose Option 1 (lock the behaviour). Per minimalist discipline, the correct action is to change nothing and forward the green guard.

**Files Changed:** none (Dev). The regression guard `test/clue-move-persistence.test.js` was authored + committed by TEA at `276ccaf`.

**Tests:** 3/3 passing (GREEN) — verified `node --test test/clue-move-persistence.test.js`.

**Working tree:** no uncommitted changes attributable to this story. (Pre-existing, unrelated working-tree noise — sorry/* PNG deletions, E7-1 clue client assets, public/ tmux configs — predates E7-3 and is not touched.)

**Handoff:** To Reviewer (Arthur Dent) — review the regression guard + the falsified-hypothesis writeup; confirm the Option-1 disposition and the E7-5 fold.

## Subagent Results

Only `preflight` is enabled in this project (`workflow.reviewer_subagents`); the other eight are toggled off, so their rows are pre-filled as disabled and their domains are covered by the reviewer directly (see Rule Compliance + observations).

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | findings | 1 (pre-existing, unrelated) | confirmed 0 for this diff, deferred 1 (sorry-plugin asset gap, out of scope) |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings (test quality covered by reviewer + JS checklist #8) |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings (JS lang-review checklist applied by reviewer) |

**All received:** Yes (1 enabled subagent returned; 8 disabled via settings)
**Total findings:** 0 confirmed against this diff, 0 dismissed, 1 deferred (pre-existing sorry-plugin asset gap, out of scope for E7-3)

## Reviewer Assessment

**Verdict:** APPROVED

The diff under review is a single new file — `test/clue-move-persistence.test.js` (154 lines, no production code). It is a regression guard, and my job is to prove the guard is sound rather than to approve a fix (there is no fix — the reported bug was falsified upstream, and the user chose Option 1 to lock the behaviour). I reproduced the persistence path independently and read every line of the test.

**Observations (7; ≥5 required):**
- `[VERIFIED]` The suite genuinely exercises persistence AND rehydration — evidence: `test/clue-move-persistence.test.js:88` asserts the raw persisted DB row (`SELECT state`) and `:93` asserts the rehydrated `GET /api/games/1` view. A break in either `writeGameState` or `cluePublicView` fails the test. Not vacuous.
- `[VERIFIED]` False-positive guard present — `:82-86` asserts Scarlett *starts* at `{square:[7,24]}` before `:88/:93` assert she moved to `[7,23]`, so a pass cannot be a coincidence of the start position.
- `[VERIFIED]` AC-3 (log untouched) is really tested — `:141` seeds a suggestion log, `:150` re-reads it after a move via `GET`, asserting `deepEqual(priorLog)`. Guards the reporter's exact framing ("log intact, pawn should be too").
- `[LOW]` Geometry coupling — `[7,23]` (`:74`) and `[7,21]→lounge` (`:113`) with die 1 depend on the real `BOARD` (`START_SQUARES.scarlett`, lounge door). A geometry change could break these, but failure is loud and the test includes a diagnostic message (`:114` prints the rejection body). Acceptable — inherent to testing the real action route.
- `[LOW]` `JSON.parse` in the `call` helper (`:81`) has no try/catch (JS checklist #1). In test code a malformed body throws = a loud test failure, which is desirable; and it mirrors the existing `test/action-route.test.js` helper. Not a defect.
- `[LOW]` In-memory db is not explicitly closed. Matches the existing convention in `test/action-route.test.js`; `:memory:` is ephemeral and GC'd, and the http server IS closed in every `finally` (no port/listener leak).
- `[VERIFIED]` Isolation & determinism — each test builds its own express app, `openDb(':memory:')`, and `listen(0)` (OS port); seeded mulberry32 RNG (seed 42) makes `initialState` deterministic. No shared state, no timing dependence (preflight corroborates: no smells).

**Dispatch tags** (8 specialist subagents disabled via settings; reviewer covers each domain):
- `[EDGE]` disabled — edge paths in a test file are the assertions themselves; enumerated above (start square, square move, room entry, log seed). No unhandled boundary.
- `[SILENT]` disabled — no swallowed errors; the only `try/finally` (`:79/:104/:147`) closes the server and re-raises assertion failures. No empty catch.
- `[TEST]` disabled — covered directly + JS checklist #8: no `toBeTruthy`/vacuous asserts (uses `assert.deepEqual` on concrete values), no `.only`/`.skip`, no unmocked spies, no snapshots.
- `[DOC]` disabled — file header + inline comments accurately describe the falsified-hypothesis rationale; not stale.
- `[TYPE]` disabled — N/A (JS test, no type surface; no `SOUL.md`/rules files exist in this repo).
- `[SEC]` disabled — N/A (no user input, no auth surface; a synthetic in-memory db seeded by the test).
- `[SIMPLE]` disabled — helpers (`seedState`/`setupApp`/`call`) mirror the established `test/action-route.test.js` shape; no over-engineering. No dead code.
- `[RULE]` disabled — JS lang-review checklist applied below.

### Rule Compliance (JS lang-review checklist)

Enumerated every applicable check against the one changed file:
- **#1 silent errors:** PASS — no empty catch / swallowed rejection. `JSON.parse` at `:81` is unguarded but in test code a throw is a loud failure and matches the existing helper. Noted LOW, not a violation.
- **#2 async pitfalls:** PASS — all `call()`/`startServer()` awaited; no floating promises; no async `forEach`.
- **#4 equality/coercion:** PASS — `node:assert/strict`; `deepEqual`/`equal` on concrete values.
- **#8 test quality:** PASS — meaningful assertions, no vacuous checks, no `.only`/`.skip`, no snapshots, no unmocked spies.
- **#9 module/scope:** PASS — `import` + `const`; the single `let s = 42` is a legitimately reassigned RNG accumulator.
- **#12 hygiene:** PASS — no `console.log`, no secrets, no misplaced deps.
- #3/#5/#6/#7/#10/#11/#13: N/A — no prototype access on user input, no DOM, no child_process/require-with-variable, no user RegExp, no thrown strings, no external user input, no fix-diff to re-scan.

**Data flow traced:** test HTTP `POST .../action {move}` → `applyClueAction` → `writeGameState` (persist) → `GET .../:id` → `cluePublicView` (rehydrate) → assertion. The test follows the same input path a real client uses on refresh; safe because assertions pin both the storage and the read-back.

**Pattern observed:** route-level integration test mirroring `test/action-route.test.js` (in-memory db, header identity middleware, ephemeral server) at `test/clue-move-persistence.test.js:37-75`. Good, consistent pattern.

**Error handling:** the move test asserts `status === 200` before asserting position (`:116`), and prints the rejection body on failure (`:114`) — failures are diagnosable, not silent.

### Devil's Advocate

Let me argue this change is worthless or wrong. First claim: "the test passes vacuously, so it guards nothing." I checked — it does not. It asserts a concrete before-state (`{square:[7,24]}`) and a concrete after-state at two independent layers (the raw `games.state` row and the `publicView` returned by `GET`). If a future refactor made `writeGameState` write per-field and drop `pawns`, or made `cluePublicView` reconstruct pawn position from the log, at least one assertion breaks. That is a real guard, not theatre. Second claim: "you approved a bug story without fixing the bug." True in letter, but the bug was demonstrated non-existent on current main by a full-stack reproduction AND by the actual playtest artifact (game 8, where Scarlett's conservatory move is proven persisted because she legally suggested from that room). The user, who is the playtester, was shown that evidence and explicitly chose to lock the behaviour and fold the residual symptom into E7-5. Approving here is honoring a documented decision, not rubber-stamping. Third claim: "the geometry coupling makes this test flaky." No — flaky implies non-deterministic. This test is fully deterministic (seeded RNG, fixed coordinates). It is *brittle* to a board-geometry change, which is different: such a change would fail it loudly and legibly (a 422 with the rejection body printed), pointing a future engineer straight at the coupling. Fourth claim: "a malicious/confused actor breaks it." There is no untrusted surface — the test constructs its own in-memory db and identity. Fifth, the strongest real concern: "the suite isn't fully green (1 failure)." I confirmed that failure is the Sorry-plugin asset test, untouched by this commit, caused by gitignored build artifacts missing from disk — recorded as a non-blocking Delivery Finding and out of scope. Nothing in the devil's-advocate pass uncovered a new blocking finding.

**Handoff:** To SM (Slartibartfast) for finish-story.