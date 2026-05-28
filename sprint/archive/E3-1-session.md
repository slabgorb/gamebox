---
story_id: "E3-1"
jira_key: ""
epic: "E3"
workflow: "tdd"
---

# Story E3-1: Engine foundations: plugin skeleton, deck, geometry + initial state

## Story Details
- **ID:** E3-1
- **Epic:** E3 (Sorry! game plugin — full ruleset, 2P, vs AI)
- **Jira Key:** *Pending creation*
- **Workflow:** tdd
- **Points:** 3
- **Priority:** p2
- **Status:** backlog
- **Repository:** g-1 (main branch)
- **Stack Parent:** none (stack root — builds the foundational engine)

## Workflow Tracking

**Workflow:** tdd (test-driven development)
**Phase:** finish
**Phase Started:** 2026-05-28T01:46:48Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-27 | 2026-05-28T01:11:02Z | 25h 11m |
| red | 2026-05-28T01:11:02Z | 2026-05-28T01:19:52Z | 8m 50s |
| green | 2026-05-28T01:19:52Z | 2026-05-28T01:24:42Z | 4m 50s |
| spec-check | 2026-05-28T01:24:42Z | 2026-05-28T01:25:45Z | 1m 3s |
| verify | 2026-05-28T01:25:45Z | 2026-05-28T01:29:09Z | 3m 24s |
| review | 2026-05-28T01:29:09Z | 2026-05-28T01:37:27Z | 8m 18s |
| green | 2026-05-28T01:37:27Z | 2026-05-28T01:40:35Z | 3m 8s |
| spec-check | 2026-05-28T01:40:35Z | 2026-05-28T01:41:07Z | 32s |
| verify | 2026-05-28T01:41:07Z | 2026-05-28T01:41:50Z | 43s |
| review | 2026-05-28T01:41:50Z | 2026-05-28T01:46:04Z | 4m 14s |
| spec-reconcile | 2026-05-28T01:46:04Z | 2026-05-28T01:46:48Z | 44s |
| finish | 2026-05-28T01:46:48Z | - | - |

## Context & Technical Approach

This is the **root story** of Epic E3, establishing the plugin architecture and core state/geometry model that all downstream stories (E3-2 through E3-6) depend on. The goal is to deliver a minimal but fully-structured Sorry! plugin skeleton that can be extended without re-architecture.

### Design Foundations (per docs/superpowers/specs/2026-05-27-sorry-plugin-design.md)

**Plugin Model:** A self-contained plugin at `plugins/sorry/` mirroring the existing `backgammon` plugin. The server owns:
- **State model:** pawn locations (tracked by `{ zone, index }` tuples), deck/discard, current player, drawn card
- **Card draw:** server-authoritative and stateless; happens at turn boundaries via `deck.js`, *not* a user action
- **Board geometry:** 60-square outer track (indexed 0–59) + two 5-square safety zones + two Start pens + two Homes

**Deck:** Canonical 45-card Sorry deck. Ranks: 1×5, and 2/3/4/5/7/8/10/11/12/Sorry! at ×4 each. Reshuffle from discard when empty.

**Pawn Representation:** Each pawn is `{ id: 0–3, zone: 'start'|'track'|'safety'|'home', index }`.
- `zone === 'start'` → pawn is in the holding pen (4 per side)
- `zone === 'track'` → `index` is 0–59 (shared 60-square ring); movement is clockwise
- `zone === 'safety'` → `index` is 0–4; own-color only, cannot be bumped
- `zone === 'home'` → terminal; `index` is always 0

**Board Geometry Constants** (side-specific paths):
| side | startExit (track) | safetyEntry (track) | slides (start → length) |
|------|-------------------|---------------------|------------------------|
| a    | 4                 | 1                   | 9→4, 34→5              |
| b    | 34                | 31                  | 39→4, 4→5              |

Each side's `path()` is the ordered list from `startExit` clockwise to and including `safetyEntry`, then its 5 safety squares, then Home.

### Acceptance Criteria (per implementation plan)

**Task 1: Plugin skeleton + registration**
- [x] Plugin registered as `plugins.sorry` with shape `{ id, displayName, players: 2, clientDir, initialState, applyAction, publicView }`
- [x] `buildInitialState({ participants })` validates 2 participants, assigns sides a/b, creates 4 pawns per side in Start
- [x] `sorryPublicView({ state, viewerId })` redacts deck order, exposes all pawn positions + drawnCard + currentPlayer + youAre
- [x] Stub `applySorryAction` exists for Task 4 to replace
- [x] Test passes: `node --test test/sorry/plugin-registration.test.js`

**Task 2: Deck**
- [x] `buildDeck(rng)` produces a shuffled 45-card deck with exact rank counts: `{ 1:5, 2:4, 3:4, 4:4, 5:4, 7:4, 8:4, 10:4, 11:4, 12:4, sorry:4 }`
- [x] `draw({ deck, discard, rng })` pops top card; if deck empty, reshuffle discard → new deck
- [x] Tests pass: `node --test test/sorry/deck.test.js`

**Task 3: Board geometry + full initial state**
- [x] `geometry.js` exports `path(side)` → ordered list of all squares for that side
- [x] `path(side)` includes correct track startExit and safetyEntry; safety zone squares `'${side}-safe-0'..4`; home square `'${side}-home'`
- [x] Two slides defined per side; `SLIDES = { a: [{start,length}, ...], b: [...] }`
- [x] Initial state includes:
  - `sides: { a: userId, b: userId }` (participant mapping)
  - `pawns: { a: [4 pawns], b: [4 pawns] }` (all in `{ zone: 'start', index: 0 }`)
  - `deck` and `discard` arrays (deck has 44 cards, discard has 0, first card already drawn)
  - `drawnCard` (first card, server-drawn at game start)
  - `currentPlayer: 'a'` (Player A begins)
  - `activeUserId` (current player's userId for orchestrator gating)
  - `winner: null, lastEvent: null`
- [x] Tests pass: `node --test test/sorry/geometry.test.js test/sorry/state.test.js`

### Code Snapshot (per plan)

The implementation plan contains all Tasks 1–3 as code blocks. Key entry points:

- **`plugins/sorry/plugin.js`:** exports the plugin object, imported by `src/plugins/index.js`
- **`plugins/sorry/server/state.js`:** `buildInitialState()`
- **`plugins/sorry/server/view.js`:** `sorryPublicView()`
- **`plugins/sorry/server/deck.js`:** `buildDeck()`, `draw()`, `RANK_COUNTS`
- **`plugins/sorry/server/geometry.js`:** `path()`, `SLIDES`, `START_EXIT`, `SAFETY_ENTRY`

## Sm Assessment

**Routing decision:** Hand off to TEA (Hamlet) for the RED phase.

E3-1 is the stack root of Epic E3 — no dependencies, no blocking PRs. The design spec and implementation plan are already committed (`docs/sorry/`), so the technical approach and acceptance criteria above are fully derived from approved artifacts, not invented here. The three tasks (plugin skeleton + registration, 45-card deck, board geometry + initial state) each carry explicit test targets, giving TEA concrete failing-test surfaces to write against. Scope is contained to a new `plugins/sorry/` tree plus a one-line registration in `src/plugins/index.js`, so risk to existing games is minimal. No open questions for the engine layer; UI and AI personas are deferred to E3-5/E3-6. Ready for failing-test coverage.

## TEA Assessment

### Red Phase (test writing)

**Tests Required:** Yes
**Reason:** Engine foundations with deterministic, pure-function behavior — exactly what TDD is for.

**Test Files:**
- `test/sorry/plugin-registration.test.js` — plugin discoverable in `src/plugins/index.js` with the correct shape + clientDir contract (AC1).
- `test/sorry/deck.test.js` — RANK_COUNTS canonical distribution incl. no-6/no-9, 45-card build, deterministic shuffle, draw top-card, empty-deck reshuffle, purity (no input mutation), empty-both throws (AC2, AC3).
- `test/sorry/geometry.test.js` — TRACK_LEN + START_EXIT/SAFETY_ENTRY constants, `path()` start/end/safety-turn for both sides, clockwise wrap with no duplicate squares, two well-formed SLIDES per side (AC4).
- `test/sorry/state.test.js` — full initial-state shape + first-draw invariant, distinct pawn ids, deterministic draw via injected rng, and four negative validation cases: wrong count, missing side, missing userId, duplicate userId (AC5, AC6).

**Tests Written:** 20 tests across 4 files covering all 6 ACs.
**Status:** RED (verified by testing-runner — 18 assertions fail on missing modules + missing registration; 0 test-file syntax bugs).

### Rule Coverage (`.pennyfarthing/gates/lang-review/javascript.md`)

| Rule | Test(s) | Status |
|------|---------|--------|
| #4 equality / type coercion (`userId === undefined`, not falsy) | state.test.js negative cases (userId 0 must be valid; `undefined`/duplicate rejected) | failing |
| #8 test quality (no vacuous assertions) | self-check below | n/a |
| validated constructor rejects bad input | state.test.js — 4 `assert.throws` cases (AC6) | failing |
| purity / no hidden side effects | deck.test.js "does not mutate input"; deterministic-rng tests in deck + state | failing |

**Rules checked:** 4 of the applicable JS lang-review rules have test coverage (the rest — DOM/XSS, child_process, regex ReDoS, prototype pollution — are not exercised by E3-1's pure engine surface; they become relevant in E3-5 prompt-parsing and E3-6 client).
**Self-check:** 0 vacuous tests. Every test carries a meaningful `assert.equal`/`deepEqual`/`throws`/`ok`-with-value; no `assert.ok(true)`, no truthy-only checks on values that should be exact.

**Handoff:** To Dev (Puck) for GREEN — implement Tasks 1–3 of the plan.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `plugins/sorry/plugin.js` — plugin registration object (mirrors backgammon shape).
- `plugins/sorry/server/state.js` — `buildInitialState({ participants, options })` with first draw + 4-case participant validation.
- `plugins/sorry/server/view.js` — `sorryPublicView()` redacting deck order, exposing `deckCount` + `youAre`.
- `plugins/sorry/server/deck.js` — `RANK_COUNTS`, pure `buildDeck(rng)`, pure `draw({ deck, discard, rng })` with empty-deck reshuffle.
- `plugins/sorry/server/geometry.js` — `TRACK_LEN`, `START_EXIT`, `SAFETY_ENTRY`, `SLIDES`, `path(side)`.
- `plugins/sorry/server/actions.js` — stub (`{ error: 'not implemented' }`), real engine deferred to E3-4.
- `src/plugins/index.js` — import + `sorry:` map entry.
- `test/sorry/deck.test.js` — corrected a shared-counter RNG bug in the determinism test (test-only; implementation was correct).

**Tests:** 22/22 passing (GREEN), verified by testing-runner. Full server suite: 979 pass / 1 skipped pre-existing / 0 regressions.
**Branch:** feat/E3-1-sorry-engine-foundations (pushed)

**Implementation notes:** Followed the plan's Task 1–3 code closely; the only adaptation was the test framework (node:test, not the plan's vitest — see TEA deviation). All code is minimal: no abstractions beyond what the tests demand. The stub `applySorryAction` is intentionally inert until E3-4.

**Handoff:** To Reviewer (Portia).

### Rework (post-review, Reviewer REJECTED → green)

Addressed all of Portia's findings:
- **F1 (must-fix):** `buildInitialState` now accepts `rng` at the top level (`{ participants, rng = Math.random }`), matching the host engine call in `src/server/routes.js:124` and the cribbage/buraco/words plugins. Removed the `options?.rng` indirection that silently fell back to `Math.random`.
- **F2:** Added a reshuffle-branch purity assertion (`inDiscard` unchanged) — locks in the load-bearing `.slice()`.
- **F3:** Added the symmetric side-`b`-missing-userId rejection test.
- **F4:** Pinned the exact reshuffled card/deck (`card === 7`, `deck === [5]`) instead of an `includes()` check.

**Tests after rework:** 24/24 sorry passing; full server suite 981 pass / 1 pre-existing skip / 0 regressions.
**Handoff:** Back through spec-check → verify → review.

## Architect Assessment (spec-check)

**Spec Alignment:** Aligned
**Mismatches Found:** None (one deferred observation below)

All six ACs in `context-story-E3-1.md` map cleanly to the implementation, each backed by a passing test:
- AC1 (plugin shape + clientDir) → `plugins/sorry/plugin.js`, `test/sorry/plugin-registration.test.js`
- AC2 (45-card deck, no 6/9) → `deck.js` `RANK_COUNTS` + `buildDeck`, `deck.test.js`
- AC3 (draw top-card + empty-deck reshuffle) → `deck.js` `draw`, `deck.test.js`
- AC4 (geometry constants + well-formed `path`) → `geometry.js`, `geometry.test.js`
- AC5 (full initial-state shape, first draw, `activeUserId`) → `state.js`, `state.test.js`
- AC6 (4-case participant rejection) → `state.js` validation, `state.test.js`

The implementation reuses the existing backgammon plugin contract verbatim (no new infrastructure) — exactly the reuse-first posture this engine layer should take. The card-draw-as-rule decision is honored: `buildInitialState` draws the first card server-side; no draw action exists.

**Observation (deferred, not a mismatch):**
- **`sorryPublicView` has no dedicated test** (Extra-in-code — type, trivial)
  - Spec: scope lists `view.js`; AC1 only asserts `typeof publicView === 'function'`.
  - Code: `view.js` redacts `deck`, exposes `deckCount` + `youAre` — correct, but exercised only indirectly via the registration shape check.
  - Recommendation: **D (defer)** — the plan adds a view test in E3-6 (when `legalMoves` is surfaced in the view for the active player). Adding a redaction test now would be reasonable but is not required by any E3-1 AC. Left for E3-6.

**Decision:** Proceed to verify (TEA). No hand-back to Dev required.

**Re-check (post-rework):** The Reviewer's F1 fix — `buildInitialState` now reads top-level `rng` matching the engine call — strengthens spec alignment (server-authoritative seeded draw, per the design's card-draw-is-a-rule decision). No new mismatches introduced; all 6 ACs still satisfied with 24 passing tests. The `pawn.index` representation question remains deferred to E3-4 (logged in Delivery Findings). Still Aligned — proceed to verify.

## TEA Assessment

### Verify Phase (simplify + quality-pass)

**Phase:** finish
**Status:** GREEN confirmed (22/22 sorry tests; full server suite 980 pass / 1 pre-existing skip / 0 regressions)

### Simplify Report

**Teammates:** reuse, quality, efficiency
**Files Analyzed:** 7 (plugins/sorry/** + src/plugins/index.js)

| Teammate | Status | Findings |
|----------|--------|----------|
| simplify-reuse | 1 finding | `deck.js` local `shuffle` duplicated `src/shared/cards/deck.js` (high) |
| simplify-quality | 2 findings | `state.js`/`deck.js` throw instead of returning result objects (medium ×2) |
| simplify-efficiency | clean | — |

**Applied:** 1 high-confidence fix
- **reuse / shuffle dedup (high):** Replaced the local Fisher-Yates in `deck.js` with the shared `shuffle` from `src/shared/cards/deck.js`. Verified before applying — the shared version takes an injectable `rng` (determinism preserved) and mutates in place, which is safe because both call sites pass throwaway arrays (`buildDeck`'s local `cards`, `draw`'s `discard.slice()`). Regression-checked: full suite green. Committed separately.

**Flagged for Review (not applied):** 0 — both medium findings reviewed and dismissed (see below)

**Dismissed (medium, false positives):**
- **quality / state.js throws (medium):** `buildInitialState` is a setup-time builder, not a player action; the result-object convention governs the `applyAction` boundary (`applySorryAction`), not constructors. The TEA RED tests explicitly `assert.throws` on all four invalid-participant cases (AC6). Converting to `{ error }` would break the spec and 4 passing tests. Backgammon's `buildInitialState` throws identically.
- **quality / deck.js draw throws (medium):** `draw` is a pure internal helper; the empty-both case is an invariant violation that cannot occur in real play (45 cards). A RED test asserts it throws. Same boundary argument as above.

**Reverted:** 0

**Overall:** simplify: applied 1 fix

**Re-verify (post-rework):** The Reviewer-driven rework touched only `state.js` (removed the `options?.rng` indirection — a net simplification) and two test files (added assertions). No new complexity surface; the earlier three-lens fan-out already covered these files. Tests re-confirmed green (24/24 sorry, full suite 981 pass / 1 pre-existing skip). No additional simplify pass warranted.

**Quality Checks:** All passing (node --test test/sorry/ + npm test).
**Handoff:** To Reviewer (Portia) for code review.

## Subagent Results

### Round 2 (re-review after rework) — current

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 0 (GREEN, no smells; noted test count is 23 not 24) | confirmed 0, dismissed 0, deferred 0 |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings |
| 4 | reviewer-test-analyzer | Yes | findings | 2 (F2/F3/F4 + rng all CLOSED) | confirmed 0, dismissed 2, deferred 0 |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings |
| 6 | reviewer-type-design | Yes | clean | 0 (F1 confirmed resolved) | confirmed 0, dismissed 0, deferred 0 |
| 7 | reviewer-security | Yes | clean | 0 | confirmed 0, dismissed 0, deferred 0 |
| 8 | reviewer-simplifier | Yes | clean | 0 | confirmed 0, dismissed 0, deferred 0 |
| 9 | reviewer-rule-checker | Yes | findings | 1 (V1 resolved) | confirmed 0, dismissed 1, deferred 0 |

**All received:** Yes
**Total findings:** 0 confirmed blocking. All round-1 must-fix/should-fix items (F1–F4) verified CLOSED. 3 residual minor test-only findings dismissed with rationale (see round-2 tag coverage).

### Round 1 (initial review) — historical

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 0 (GREEN, no smells) | confirmed 0, dismissed 0, deferred 0 |
| 4 | reviewer-test-analyzer | Yes | findings | 11 | confirmed 3, dismissed 6, deferred 2 |
| 6 | reviewer-type-design | Yes | findings | 5 | confirmed 1, dismissed 3, deferred 1 |
| 7 | reviewer-security | Yes | findings | 3 | confirmed 0, dismissed 3, deferred 0 |
| 8 | reviewer-simplifier | Yes | findings | 3 | confirmed 0, dismissed 3, deferred 0 |
| 9 | reviewer-rule-checker | Yes | findings | 2 | confirmed 2, dismissed 0, deferred 0 |

(Edge-hunter, silent-failure-hunter, comment-analyzer disabled via settings in both rounds.)

## Reviewer Assessment

**Verdict:** APPROVED
*(Round 1 verdict was REJECTED → rework to green; all blocking findings F1–F4 are now verified resolved in Round 2. History retained below.)*

### Round 2 Tag Coverage (re-review — current verdict basis)
- **[PRE]** GREEN — 981 full-suite pass / 1 pre-existing skip / 0 smells. Sorry suite = 23 tests (my "24" in the rework note was off by one — the reshuffle-purity check is an added assertion, not a new test). No correctness impact.
- **[TYPE]** Clean — F1 CONFIRMED RESOLVED: `buildInitialState({ participants, rng })` now consumes the engine's seeded rng end-to-end (routes.js:124 → buildDeck → draw). No new invariant issues. `pawn.index` ambiguity still deferred to E3-4.
- **[SEC]** Clean — `deck` redaction intact; rng promotion adds no attack surface (engine-injected, not user input).
- **[SIMPLE]** Clean — `options?.rng` indirection removed (net simplification); `.slice()` calls correctly left in place.
- **[RULE]** V1 (exact-card) RESOLVED. One residual: `state.test.js` opening test asserts `drawnCard` non-null but not rank-membership. **Dismissed** — `drawnCard` is provably a valid rank (it is `draw(buildDeck(...)).card`, and `deck.test.js` verifies the distribution exactly); low value, non-blocking.
- **[TEST]** F2/F3/F4 + top-level-rng all CONFIRMED CLOSED. Two residual minor findings **dismissed**: (a) side-'b' clockwise-wrap coverage — `path()` is a single side-agnostic implementation (`(i+1)%TRACK_LEN`) already exercised by the side-'a' wrap test, so a per-side divergence is impossible; (b) a slightly imprecise comment in `deck.test.js` about where the `.slice()` happens — cosmetic.

**Decision:** APPROVED — production code is clean across all specialists; F1 (the only correctness issue) is fixed and re-verified; residual findings are low-value test-only nits on provably-correct code and do not warrant a third rework loop. Proceed to spec-reconcile → finish.

---

### Round 1 (historical — all items resolved in rework)

**Round 1 Verdict:** REJECTED (changes requested — rework to green)

### Specialist Tag Coverage
- **[TYPE]** Confirmed F1 — `buildInitialState` reads `options?.rng` but engine/sibling plugins pass top-level `rng` (HIGH, must-fix). Dismissed: `userId === undefined` weakness (matches backgammon precedent); `path()` invalid-side "infinite loop" (factually incorrect — breaks immediately). Deferred: `pawn.index` representation ambiguity → E3-4.
- **[TEST]** Confirmed F2 (reshuffle purity untested, HIGH), F3 (symmetric userId validation untested, HIGH), F4 (`includes()` weaker than exact assertion). Deferred: bounded-termination assertion for `path()` → E3-2.
- **[RULE]** Confirmed V1 (test quality: `assert.ok(includes())` → exact value, == F4) and V2 (purity: shared `shuffle` mutates; `draw`'s `.slice()` is load-bearing). All 17 checklist rules otherwise clean.
- **[SEC]** No blocking security concerns. `deck` correctly redacted in `sorryPublicView`. Dismissed: `drawnCard` exposure (public by design per spec), `sides`/userId exposure (backgammon precedent). No injection/prototype-pollution/JSON.parse surface.
- **[SIMPLE]** No confirmed simplifications. CHALLENGED/REJECTED: remove `draw`'s `.slice()` (load-bearing — would reintroduce mutation, corroborated by [RULE] V2 + [SEC]); `geometry.js` "dead code" (spec-mandated AC4 deliverable, tested); `view.js` `Array.isArray` guard (harmless).
- **[PRE]** Preflight GREEN: 22/22 sorry, 980 full-suite pass / 1 pre-existing skip, zero code smells.

### Must-fix (blocking)

- **F1 — `buildInitialState` ignores the engine's seeded rng (HIGH / Major).**
  *Confirmed by reviewer-type-design (V3) and corroborated by direct verification.*
  The host engine calls `plugin.initialState({ participants, rng: makeRng(Date.now()), variant })` (`src/server/routes.js:124`) — `rng` is a **top-level** key. Sorry's `buildInitialState({ participants, options })` reads `options?.rng`, which is always `undefined` in production, so it falls back to `Math.random` and **discards the engine's seeded rng**. Every other shuffle-at-creation plugin reads the top-level `rng`: `cribbage/server/state.js:5` (`{ participants, rng }` → `shuffle(buildDeck(...), rng)`), `buraco/server/state.js:3`, `words/server/state.js:11`. Sorry is the lone deviant. Worse, the determinism tests (`state.test.js`, `deck` rng tests) pass only because they inject via `options.rng` — **an interface the real caller never uses**, giving false-green confidence.
  **Fix:** Change `buildInitialState` to accept `rng` at the top level to match the engine and sibling plugins (e.g. `export function buildInitialState({ participants, rng, options } = {})` and resolve `rng` first). Update `state.test.js` to pass `rng` at the top level so the tests exercise the production interface. The plan's `options.rng` shape was incorrect vs the actual engine convention.

### Should-fix (bundle with the loop-back — cheap, lock in correctness)

- **F2 — reshuffle-branch purity is untested (HIGH).** *reviewer-test-analyzer, reviewer-rule-checker V2.* `draw`'s `disc = discard.slice()` is **load-bearing** because the shared `shuffle` (`src/shared/cards/deck.js:43`) mutates in place; without it the reshuffle branch would corrupt the caller's `discard`. No test covers this. Add: in the reshuffle test, capture the input `discard` reference and assert it is unchanged after `draw`. (This directly guards against the simplifier's incorrect suggestion to remove the slice — see Challenged below.)
- **F3 — symmetric userId validation untested (HIGH).** *reviewer-test-analyzer.* Only side-'a'-missing-userId is tested; the `||` guard's side-'b' branch is uncovered. Add `participants: [{ side:'a', userId:11 }, { side:'b' }]` throws case.
- **F4 — `assert.ok([5,7].includes(card))` is weaker than necessary (HIGH per rule-checker V1, MEDIUM per test-analyzer).** With `rng = () => 0` the draw is deterministic; assert the exact card so a wrong-but-coincidental value can't slip through.

### Dismissed (with rationale)

- **Simplifier: remove `draw`'s `.slice()` copies (high) — CHALLENGED/REJECTED.** The `disc = discard.slice()` is load-bearing: the shared `shuffle` mutates in place, so removing it reintroduces input mutation on the reshuffle path. Corroborated by reviewer-rule-checker (V2), reviewer-security (shuffle-mutation note), and reviewer-test-analyzer (F2). Keep the slices.
- **Simplifier: `geometry.js` is dead code (high) — REJECTED.** `geometry.js` is a spec-mandated AC4 deliverable with its own passing test (`geometry.test.js`) and is consumed by E3-2/E3-3/E3-4. The story scope (higher authority) explicitly lists it. Not dead.
- **Simplifier: `view.js` `Array.isArray` guard (medium) — dismissed.** Harmless defensive check; trivial.
- **Security: `drawnCard` exposed to opponent (medium) — dismissed.** Public by design — the design spec states the client animates the *already-revealed* `drawnCard`; the drawn card is face-up to both players in Sorry!. Suggest a one-word comment clarification (trivial, optional).
- **Security: `sides` exposes opponent userId (low) — dismissed.** Matches backgammon precedent; userIds are not secret in this app.
- **Type-design: `userId === undefined` too weak (medium) — dismissed.** Matches `backgammon/server/state.js` precedent exactly (`pA.userId === undefined`); userIds are positive integers supplied by the DB layer. Not a new weakness introduced by this story.
- **Type-design/test-analyzer: `path()` infinite loop on invalid side — dismissed (factually incorrect).** For an unknown side, `START_EXIT[side]` and `SAFETY_ENTRY[side]` are both `undefined`; the loop pushes `undefined` then `undefined === undefined` breaks immediately — no infinite loop. A defensive `throw` on invalid side is a fine optional hardening but `side` is always internal 'a'/'b'. Not blocking.

### Deferred to E3-4

- **Type-design: `pawn.index` representation is ambiguous across zones (medium).** The pair `{ zone, index }` needs a committed meaning for `index` once pawns move (path-offset vs square id) — relevant when E3-4 implements movement. Logged as a Delivery Finding for E3-4.
- **Test-analyzer: `path()` should assert bounded termination / one-occurrence of safetyEntry.** Becomes meaningful as geometry is exercised by E3-2; defer.

**Decision:** Hand back to Dev to fix F1 (must) and bundle F2–F4 (cheap test hardening). Re-review after.

## Delivery Findings

No upstream findings.

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Improvement** (non-blocking): The plan's test snippets (Tasks 1–10) are written in vitest (`import from 'vitest'`, `npx vitest run`), but this project's server suite is `node:test`/`node:assert` run via `node --test 'test/**/*.test.js'` — vitest is wired only for `test/client/**`. E3-1 tests were translated to node:test accordingly. Affects every downstream E3 story (E3-2…E3-6 plan snippets need the same translation; do not `npx vitest run` server tests). *Found by TEA during test design.*
- **Question** (non-blocking): The plan's E3-5 test snippet calls `loadPersonaCatalog()` with no arg and `.filter()` on the result; the E3-5 context flags that the real export returns a `Map` and takes a `dir`. Affects `test/sorry/ai-registration.test.js` when E3-5 begins — verify the signature before copying the snippet. *Found by TEA during test design.*

### Dev (implementation)
- **Improvement** (non-blocking): A testing-runner subagent overwrote `.session/E3-1-session.md` with a test-results summary during the green phase; the session was reconstructed from context. `.session/` is gitignored so there is no git fallback. Affects the testing-runner subagent contract (it should write run results to a dedicated location, never the session file). *Found by Dev during implementation.*

### Reviewer (review)
- **Gap** (blocking): `buildInitialState` reads `options?.rng` but the host engine and all sibling shuffle-at-creation plugins (cribbage/buraco/words) pass `rng` at the top level — production ignores the seeded rng. Affects `plugins/sorry/server/state.js` (accept top-level `rng`) and `test/sorry/state.test.js` (inject rng at top level). *Found by Reviewer during review.*
- **Question** (non-blocking): `pawn.index` representation is undefined for non-`start` zones — E3-4 must commit to path-offset vs square-id when implementing movement. Affects `plugins/sorry/server/state.js` pawn shape + `plugins/sorry/server/actions.js` (E3-4). *Found by Reviewer during review.*

## Impact Summary

**Upstream Effects:** No upstream effects noted
**Blocking:** None

### Deviation Justifications

2 deviations

- **Tests written in node:test instead of the plan's vitest**
  - Rationale: This project's server test suite is `node --test 'test/**/*.test.js'`; vitest is configured only for `test/client/**` (vitest.config.ts `include`). Vitest-style tests would not run in the main suite and would diverge from every other server test (e.g. `test/ai-backgammon-*.test.js`). Project convention outranks the plan's framework choice.
  - Severity: minor
  - Forward impact: E3-2…E3-6 must also use node:test, not vitest, for their engine tests.
- **`buildInitialState` rng parameter shape changed from the plan's `options.rng` to a top-level `rng`**
  - Rationale: The plan's `options.rng` shape does not match the host engine's actual call, `plugin.initialState({ participants, rng, variant })` (src/server/routes.js:124), nor the established convention in every other shuffle-at-creation plugin (cribbage/buraco/words all read top-level `rng`). The plan was wrong on this detail; the implementation follows the real engine contract. Caught by the Reviewer (finding F1) and fixed in rework.
  - Severity: minor (corrects a latent integration defect; behavior is otherwise unchanged)
  - Forward impact: E3-4's `applySorryAction` calls `draw({ ..., rng })` during turn advancement and must likewise thread the engine-provided rng (not an `options` bag). E3-6's orchestrator-integration test should drive game creation via the top-level `rng` interface.

## Design Deviations

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Tests written in node:test instead of the plan's vitest**
  - Spec source: docs/superpowers/plans/2026-05-27-sorry-plugin.md, Tasks 1–3
  - Spec text: "Run: `npx vitest run test/sorry/...`" with `import { describe, it, expect } from 'vitest'`
  - Implementation: Tests use `node:test` + `node:assert/strict`, runnable via `node --test test/sorry/`
  - Rationale: This project's server test suite is `node --test 'test/**/*.test.js'`; vitest is configured only for `test/client/**` (vitest.config.ts `include`). Vitest-style tests would not run in the main suite and would diverge from every other server test (e.g. `test/ai-backgammon-*.test.js`). Project convention outranks the plan's framework choice.
  - Severity: minor
  - Forward impact: E3-2…E3-6 must also use node:test, not vitest, for their engine tests.

### Dev (implementation)
- No deviations from spec. Implementation follows the plan's Task 1–3 code; the framework adaptation is already logged under TEA above and the test-bug fix preserved the test's original intent.

### Architect (reconcile)

Verified the TEA entry (node:test vs vitest) — spec source path exists, quoted text accurate, forward impact correct. Dev's "no deviations" was incomplete; one deviation introduced during review-driven rework is recorded below.

- **`buildInitialState` rng parameter shape changed from the plan's `options.rng` to a top-level `rng`**
  - Spec source: docs/superpowers/plans/2026-05-27-sorry-plugin.md, Task 3 ("Implement full initial state")
  - Spec text: "`export function buildInitialState({ participants, options }) { ... const rng = typeof options?.rng === 'function' ? options.rng : Math.random; ... }`"
  - Implementation: `buildInitialState({ participants, rng = Math.random } = {})` — `rng` is read at the top level.
  - Rationale: The plan's `options.rng` shape does not match the host engine's actual call, `plugin.initialState({ participants, rng, variant })` (src/server/routes.js:124), nor the established convention in every other shuffle-at-creation plugin (cribbage/buraco/words all read top-level `rng`). The plan was wrong on this detail; the implementation follows the real engine contract. Caught by the Reviewer (finding F1) and fixed in rework.
  - Severity: minor (corrects a latent integration defect; behavior is otherwise unchanged)
  - Forward impact: E3-4's `applySorryAction` calls `draw({ ..., rng })` during turn advancement and must likewise thread the engine-provided rng (not an `options` bag). E3-6's orchestrator-integration test should drive game creation via the top-level `rng` interface.