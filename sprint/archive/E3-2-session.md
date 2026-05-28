---
story_id: "E3-2"
jira_key: ""
epic: "E3"
workflow: "tdd"
---

# Story E3-2: Legal-move enumeration for all cards (out, forward, back, 7-split, 11-swap, Sorry!)

## Story Details
- **ID:** E3-2
- **Epic:** E3 (Sorry! game plugin — full ruleset, 2P, vs AI)
- **Workflow:** tdd (test-driven development)
- **Points:** 3
- **Repository:** g-1 (main branch)
- **Stack Parent:** E3-1 (Engine foundations: plugin skeleton, deck, geometry + initial state)

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-05-28T04:49:29Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-28T16:00:00Z | 2026-05-28T04:29:20Z | -41440s |
| red | 2026-05-28T04:29:20Z | 2026-05-28T04:33:38Z | 4m 18s |
| green | 2026-05-28T04:33:38Z | 2026-05-28T04:35:53Z | 2m 15s |
| spec-check | 2026-05-28T04:35:53Z | 2026-05-28T04:37:01Z | 1m 8s |
| verify | 2026-05-28T04:37:01Z | 2026-05-28T04:39:19Z | 2m 18s |
| review | 2026-05-28T04:39:19Z | 2026-05-28T04:48:29Z | 9m 10s |
| spec-reconcile | 2026-05-28T04:48:29Z | 2026-05-28T04:49:29Z | 1m |
| finish | 2026-05-28T04:49:29Z | - | - |

## Context & Technical Approach

### Dependency & Build-Order Context

E3-2 is the second story in the E3 build-order chain, directly building on E3-1's delivered foundation:
- **Depends on:** E3-1 (engine foundations: skeleton, deck, geometry, initial state) ✓ MERGED (PR #68)
- **Unlocks:** E3-4 (turn engine / applyAction)
- **Parallel work possible with:** E3-3 (slide traversal + bumping rules); E3-4 requires both E3-2 and E3-3 complete before final integration

E3-1 delivers:
- `plugins/sorry/server/state.js` — buildInitialState, full state shape
- `plugins/sorry/server/geometry.js` — `path(side)`, START_EXIT, SAFETY_ENTRY, SLIDES constants
- `plugins/sorry/server/deck.js` — buildDeck, draw, 45-card deck model

### Design Goals

E3-2 is the **rules core** of the Sorry! plugin. With the board geometry and initial state in place from E3-1, this story teaches the engine which moves are actually legal for any given drawn card.

**Key design decisions:**
1. **Pure function, no side effects** — `legalMoves(state)` computes an array of move objects without mutating state, applying moves, resolving slides, or drawing cards.
2. **Move-object schema** — Every returned move carries stable fields (`id`, `kind`, `pawnId`, `to`, `legs`, `targetPawnId`) that all later consumers (turn engine, AI prompt builder, client) depend on.
3. **Derive all positions from `path(side)`** — Movement math is index arithmetic over the ordered path list produced by `path()`, not hard-coded track squares.
4. **2-player only** — Engine is hardcoded to sides 'a' and 'b'; no N-player generalization.

### Card-Driven Move Enumeration

Sorry! is natively **card-driven**: each of the 11 card ranks produces a different kind of move, and the enumeration must handle every special case:

| Card | Move Kind(s) | Pawn Source | Constraints |
|------|---|---|---|
| **1, 2** | `out` (1 pawn from Start → startExit) + `forward` (1 or 2 steps, track/safety only) | Start + track/safety | out moves only appear if Start pawns exist |
| **3, 5, 8, 12** | `forward` (exact steps, track/safety only) | track/safety | card 3 with all in Start yields empty list |
| **4** | `back` (−4 steps, track/safety only) | track/safety | undershoots before path start = no move |
| **10** | `forward` (+10) OR `back` (−1) — both offered | track/safety | either may be absent if it overshoots/underflows |
| **7** | `forward` (7 steps, single pawn) OR `split` (two pawns, steps summing to 7) | track/safety | split legs: all ordered pairs (1+6 through 6+1) with valid destinations |
| **11** | `forward` (+11, track pawns only) OR `swap` (exchange track positions with opponent) | track (safety excluded from swap) | track pawn ↔ opponent track pawn pairs |
| **Sorry!** | `sorry` (Start pawn → bumps opponent track pawn off track to Start) | Start (bumper) | requires at least one opponent pawn on track |

### Move-Object Schema

Each move object carries:
- `id` (string) — stable unique key within the current legal set (used by turn engine and AI to reference the choice)
- `kind` (string) — one of: `'out'`, `'forward'`, `'back'`, `'split'`, `'swap'`, `'sorry'`
- `pawnId` (string) — id of the primary pawn being moved (absent on `'split'`, which uses `legs` instead)
- `to` ({ zone, index }) — destination position (absent on `'split'`)
- `legs` (array of { pawnId, steps, to }) — for `'split'` only; two objects whose `steps` sum to 7
- `targetPawnId` (string) — for `'swap'` and `'sorry'`: the opponent pawn being displaced

### Safety-Zone Guardrails

- **Overshoot is illegal** — A pawn in safety (`zone: 'safety'`) that would need more steps than remain to reach Home produces no move. Exactly landing on Home is legal.
- **Home pawns never move** — Any pawn already at `zone: 'home'` is excluded from all enumerations.
- **Out/sorry/swap targets are track squares only** — `out` sends a Start pawn to startExit (track); `sorry` places the bumper onto the opponent's current track square; `swap` exchanges track positions. None may target safety or Home.

### Testing Strategy (TDD Red-Green)

#### Red Phase
Write failing tests for all 10 acceptance criteria covering:
- Card 1 all-in-Start → out-moves only
- Card 2 with mix of pawns → out + forward
- Card 3 all-in-Start → empty list (no track/safety pawns)
- Card 3 with one track pawn → forward-3 only
- Card 4 track pawn → back-4 destination
- Card 10 track pawn → both forward-10 and back-1 options
- Card 7 two track pawns → split with legs summing to 7, plus full-7 single-pawn moves
- Card 11 own and opponent on track → swap move present + forward-11
- Sorry! with opponent on track → sorry-move to opponent's square
- Safety-zone pawn overshooting Home → no move for that pawn

Test file: `test/sorry/legal-moves.test.js`

#### Green Phase
Implement `plugins/sorry/server/rules/legal-moves.js` with:
- `legalMoves(state)` function (exported)
- Pure function: no state mutation, no side effects
- Reuse `path(side)` from geometry.js for all position calculations
- Enumerate all card kinds with their full ruleset (no simplifications)

## Acceptance Criteria

1. **`legalMoves(state)` is exported from `plugins/sorry/server/rules/legal-moves.js` and is a pure function.** Calling it with any valid state object returns an array (possibly empty) of move objects without mutating the input or producing observable side effects.

2. **Cards 1 and 2 enumerate `out` moves for every pawn in Start.** Each out-move has `kind: 'out'`, a `pawnId`, and `to: { zone: 'track', index: START_EXIT[side] }`. When no pawns are in Start, no out-moves appear. Card 1 and card 2 also enumerate `forward` moves for any pawn already on the track or in the safety zone (steps = 1 and 2 respectively).

3. **Numeric forward cards (1, 2, 3, 5, 8, 12) enumerate `forward` moves for every track/safety pawn.** Each move has `kind: 'forward'`, `pawnId`, `steps`, and a `to` destination. Card 3 with all pawns in Start returns an empty list (no track/safety pawns to move).

4. **Card 4 enumerates `back` moves (−4 steps) for every track/safety pawn.** Kind is `'back'`; `to` is the path position 4 steps behind the pawn. A pawn whose backward destination would fall before the start of its path produces no move.

5. **Card 10 enumerates both forward (+10) and backward (−1) moves for every track/safety pawn.** Both a `forward` leg (steps=10) and a `back` leg (steps=−1) are offered for each eligible pawn; either may be absent if it would overshoot or underflow.

6. **Card 7 enumerates both single-pawn (full 7) and two-pawn split moves.** Single-pawn `forward` moves (steps=7) are offered for each track/safety pawn. Split moves have `kind: 'split'` and `legs: [{ pawnId, steps, to }, { pawnId, steps, to }]` where both legs are valid advances and the two steps sum to exactly 7. All (ordered) pairs of distinct track/safety pawns with all step distributions 1+6 through 6+1 that produce valid destinations are included.

7. **Card 11 enumerates both forward (+11) moves and `swap` moves.** Forward moves are offered for each own track pawn (kind `'forward'`, steps=11). Swap moves (`kind: 'swap'`) are offered for each pair of (own track pawn, opponent track pawn): the own pawn takes the opponent's track position and vice versa. Safety-zone pawns cannot be party to a swap.

8. **The Sorry! card enumerates `sorry` moves when at least one own pawn is in Start and at least one opponent pawn is on the track.** Each sorry-move has `kind: 'sorry'`, `pawnId` (a Start pawn), `targetPawnId` (the opponent pawn being bumped), and `to: { zone: 'track', index: <opponent's track index> }`. If there are no Start pawns or no opponent track pawns, the result is `[]`.

9. **Safety-zone overshoot is illegal.** For any card that would advance a safety-zone pawn beyond the last path position (Home), that pawn produces no move for that number of steps. Exactly landing on Home is legal.

10. **Test suite covers all card kinds and key edge cases.** `test/sorry/legal-moves.test.js` includes at minimum: card 1 all-in-Start → out-moves only; card 3 all-in-Start → empty list; card 4 track pawn → back-4 destination; card 7 two track pawns → split with legs summing to 7; card 11 own and opponent on track → swap move present; Sorry! with opponent on track → sorry-move to opponent's square; safety-zone pawn with card that overshoots Home → no move for that pawn.

## Scope

**In scope:**
- `plugins/sorry/server/rules/legal-moves.js` — exports `legalMoves(state)`
- `test/sorry/legal-moves.test.js` — TDD test suite covering all card kinds and edge cases
- Full card enumeration: out, forward, back, split (card 7), swap (card 11), sorry
- No-legal-move case: return `[]` when no move is possible
- Safety overshoot guard: filter invalid destinations

**Out of scope (deferred to other stories):**
- Slide traversal and bump resolution — `resolveLanding` belongs to E3-3
- Applying moves / advancing the turn — E3-4
- Drawing the next card — automatic rule inside turn advancement
- AI adapter, prompts, or client rendering — E3-5 and E3-6
- View layer exposing `legalMoves` to the client — noted as Task 9 decision; deferred

## Sm Assessment

**Setup decision:** Start E3-2 (legal-move enumeration) per Good Patron's direct request. Builds directly on E3-1's merged engine foundation (deck, geometry, initial state) and is the next build-order link in the chained E3 stories; unlocks E3-4 (turn engine).

- **Workflow:** tdd (phased) — first phase RED, owned by TEA.
- **Scope confirmed appropriate for 3 pts:** pure legal-move enumeration across all card kinds (out, forward, back, 7-split, 11-swap, Sorry!). Slides/bumping (E3-3), turn application (E3-4), AI (E3-5), and client (E3-6) are explicitly out of scope and deferred to their own stories.
- **Gates:** merge gate clear (no open PRs). Session file, branch `feat/E3-2-legal-move-enumeration` off `main`, and story context all present.
- **Routing:** hand off to TEA (Hamlet) to write failing tests covering all 10 ACs, including edge cases (overshoot guards, empty move lists, 7-split legs summing to 7, swap/Sorry! targeting rules).

## TEA Assessment

### Red Phase (test writing)

**Tests Required:** Yes
**Reason:** New rules-core module (`legalMoves`) with 10 ACs and many edge cases — pure logic, ideal for TDD.

**Test Files:**
- `test/sorry/legal-moves.test.js` — 25 tests covering all 10 ACs + edge cases.

**Tests Written:** 25 tests covering all 10 ACs.
**Status:** RED (failing — `ERR_MODULE_NOT_FOUND` on `plugins/sorry/server/rules/legal-moves.js`, which does not exist yet). Verified by Horatio (testing-runner), RUN_ID `E3-2-tea-red`.

**Coverage by AC:**
| AC | Behavior | Test(s) |
|----|----------|---------|
| 1 | exported, pure, always returns array, stable unique ids | `AC1:` (5 tests, incl. no-mutation via structuredClone) |
| 2 | cards 1/2 out-moves + forward; no out when no Start pawn | `AC2:` (3 tests) |
| 3 | numeric forward (3/8); card 3 all-Start → `[]` | `AC1` empty + `AC3:` (2 tests) |
| 4 | card 4 back-4; off-start underflow → no move | `AC4:` (2 tests) |
| 5 | card 10 forward+10 AND back-1; back-1 underflow omitted | `AC5:` (2 tests) |
| 6 | card 7 split legs sum 7 + full-7 forward; lone pawn no split | `AC6:` (3 tests) |
| 7 | card 11 swap + forward-11; safety pawn barred from swap | `AC7:` (3 tests) |
| 8 | Sorry! onto opp track pawn; empty when no opp/no Start | `AC8:` (3 tests) |
| 9 | safety overshoot illegal; exact-Home legal; Home pawns frozen | `AC9:` (3 tests) |
| 10 | suite covers all card kinds + edge cases | the suite itself |

### Rule Coverage (lang-review/javascript.md)

| Rule | Applied in tests |
|------|------------------|
| #4 equality/coercion | All assertions use `node:assert/strict` (deepEqual/equal are strict) |
| #8 test quality | No vacuous assertions — every test asserts concrete values; no `.only`/`.skip`; no truthy-only checks on always-true values |
| #9 module/scope | Imports the SUT by path; no side-effect imports |

**Rules checked:** 3 of 13 lang-review rules are directly testable at this layer (the rest — DOM/XSS, child_process, regex, secrets — do not apply to a pure enumeration function). Dev's own javascript.md gate will cover the implementation.
**Self-check:** 0 vacuous tests.

**Handoff:** To Dev (Puck) for implementation.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `plugins/sorry/server/rules/legal-moves.js` (new) — exports pure `legalMoves(state)`; enumerates out/forward/back/split/swap/sorry via index arithmetic over `path(side)` from E3-1's geometry. Helpers `pathPos`, `squareToLoc`, `advance`, `ownTrackOrSafety` are module-private.

**Tests:** 26/26 passing on `test/sorry/legal-moves.test.js`; 49/49 on the full `test/sorry/*.test.js` suite (no regression). Verified by Cobweb (testing-runner), RUN_ID `E3-2-dev-green`.
**Branch:** `feat/E3-2-legal-move-enumeration` (pushed to origin).

**Notes:**
- Followed the implementation plan's reference design (Task 4, lines 502–624) verbatim — it is already the minimal correct enumerator the tests demand. No abstractions added beyond the four small helpers the plan defines.
- Pure: builds `path()` locally, uses only `filter`/`map`; the no-mutation test (structuredClone equality) passes.
- Safety overshoot and off-start underflow are handled in one place (`advance` returns `null` when `target` leaves `[0, p.length-1]`), so every card kind inherits the guard.

**Handoff:** To Reviewer (Portia) for code review.

## Architect Assessment (spec-check)

**Spec Alignment:** Aligned
**Mismatches Found:** None

Verified all 10 ACs against `plugins/sorry/server/rules/legal-moves.js`:

- **AC1** — `legalMoves` exported, returns an array, pure (builds `path()` locally; only `filter`/`map`; no-mutation test passes). ✓
- **AC2** — out-moves to `START_EXIT[side]` for Start pawns (cards 1/2); no out-move when no Start pawn (loop guards `zone === 'start'`); forward via the numeric table. ✓
- **AC3** — numeric forward table `{1,2,3,5,8,12}`; card 3 all-Start yields `[]` (no track/safety pawns). ✓
- **AC4** — card 4 `back` −4; off-start underflow filtered (`advance` returns `null` on `target < 0`). ✓
- **AC5** — card 10 offers both forward +10 and back −1; each independently omitted on overshoot/underflow. ✓
- **AC6** — card 7 single full-7 forward plus all ordered distinct-pawn splits summing to 7 with both legs valid. ✓
- **AC7** — card 11 forward +11 and swap; correctly restricted to **track** pawns (`myTrack` filter, line 116) — safety pawns excluded from both, matching the AC's "each own track pawn" wording. ✓
- **AC8** — Sorry! enumerates Start-pawn × opponent-track-pawn; `[]` when no Start pawn or no opponent on track. ✓
- **AC9** — safety overshoot illegal and exact-Home landing legal (single boundary `target > p.length - 1` in `advance`); Home pawns never enumerated. ✓
- **AC10** — suite (26 tests) covers every card kind and the listed edge cases. ✓

**Reuse note:** Implementation derives all positions from E3-1's `path(side)` and `START_EXIT` — no duplicated geometry constants, exactly as the guardrail requires. The boundary guard lives in one place (`advance`), so every card kind inherits overshoot/underflow handling — clean, non-duplicated design.

**Observation (non-blocking, not a mismatch):** Forward-11 and forward-7 do not advance safety-zone pawns; this is per the AC wording and the plan. Downstream stories (E3-4) should be aware the move set is intentionally track-only for swap/11-forward. No action needed.

**Decision:** Proceed to review (TEA verify next).

## TEA Assessment (verify)

**Phase:** finish
**Status:** GREEN confirmed

### Simplify Report

**Teammates:** reuse, quality, efficiency
**Files Analyzed:** 2 (`plugins/sorry/server/rules/legal-moves.js`, `test/sorry/legal-moves.test.js`)

| Teammate | Status | Findings |
|----------|--------|----------|
| simplify-reuse | 2 findings | (1) high: `.filter(p => p.zone === 'track')` duplicated at 3 sites; (2) medium: add companion start/track helpers for consistency |
| simplify-quality | clean | Pure-enumeration pattern correct; imports use `.js`; consistent camelCase; no dead code |
| simplify-efficiency | clean | Helper functions focused; card-7/11 nested loops are intentional exhaustive enumeration; no over-engineering |

**Applied:** 1 high-confidence fix — extracted `trackPawns(pawns, side)` helper, replacing the repeated track filter at card-11 (myTrack/oppTrack) and Sorry! (oppTrack). Matches the existing `ownTrackOrSafety` pattern. Committed `ef746dc`.
**Flagged for Review:** 1 medium-confidence finding — adding an `ownStartPawns` helper. Not applied: the start-pawn filter appears only once (Sorry! card), so extraction would not reduce duplication; an unused helper is scope creep. Left inline.
**Noted:** 0 low-confidence observations.
**Reverted:** 0.

**Overall:** simplify: applied 1 fix

**Quality Checks:** `pf check` — all passing (tests PASS via `npm test`: 26/26 story, 49/49 full sorry suite; lint/typecheck not configured for this JS project, skipped). No regression after the refactor.

**Handoff:** To Reviewer (Portia) for code review.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (1007/1008 pass, 1 pre-existing skip; 0 smells) | N/A |
| 2 | reviewer-edge-hunter | Yes | findings | 6 | confirmed 2, dismissed 3, deferred 1 |
| 3 | reviewer-silent-failure-hunter | Yes | findings | 4 | confirmed 2 (Low/Med), dismissed 2 |
| 4 | reviewer-test-analyzer | Yes | findings | 9 | confirmed 3 (Low), dismissed 6 |
| 5 | reviewer-comment-analyzer | Yes | findings | 3 | confirmed 2 (Low), dismissed 1 |
| 6 | reviewer-type-design | Yes | findings | 8 | confirmed 2 (Low), dismissed 6 |
| 7 | reviewer-security | Yes | findings | 3 | confirmed 1 (Low), dismissed 2 |
| 8 | reviewer-simplifier | Yes | findings | 5 | confirmed 2 (Low), dismissed 3 |
| 9 | reviewer-rule-checker | Yes | findings | 5 | confirmed 3 (Low), dismissed 2 |

**All received:** Yes (9 returned, 8 with findings)
**Total findings:** 17 confirmed (all Low/Medium), 25 dismissed (with rationale), 1 deferred to E3-4

### Rule Compliance

Rules source: `.pennyfarthing/gates/lang-review/javascript.md` (13 checks). No `SOUL.md` or `.claude/rules/*.md` exist. Exhaustive enumeration over all 6 functions + 25 tests:

| Rule | Applies to | Verdict |
|------|-----------|---------|
| #1 silent error swallowing | all fns | Compliant — no try/catch, no `JSON.parse`, no `.catch` |
| #2 async pitfalls | all fns | Compliant — fully synchronous, no promises/forEach-async |
| #3 prototype pollution | `legalMoves` line 68 `card in numeric` | **VIOLATION (Low)** — `in`/bracket lookup on a plain-object dict keyed by `state.drawnCard`. Confirmed (rule match) but downgraded: `drawnCard` is server-built from the deck (ints 1–12 sans 6/9, `'sorry'`), never a prototype key. Fix: `Object.create(null)` or `Set`. |
| #4 equality/coercion | 22 comparisons | Compliant — all `===`; `assert.ok(findResult)` noted under #8 |
| #5 DOM security | — | N/A (server module) |
| #6 Node.js specific | imports | Compliant — no `require`/`child_process`/`fs`/`env` |
| #7 regex safety | `/-safe-(\d)$/` line 18 | **VIOLATION (Low)** — suffix match without `^` anchor. Confirmed (rule match) but downgraded: `sq` only ever comes from `path()`'s controlled output. Fix: `/^[ab]-safe-(\d)$/`. |
| #8 test quality | 25 tests | **VIOLATION (Low)** — AC1 schema test (`legal-moves.test.js`) iterates `moves` with no `moves.length > 0` guard → vacuous if empty (card-1 baseline always yields 4, so not vacuous in practice). The 11 `assert.ok(findResult)` sites are equivalent to `!== undefined` for `.find()` results (object\|undefined), so functional — style nit only. No `.only`/`.skip`, no snapshots. |
| #9 module/scope | 12 decls | Compliant — all `const`/arrow; static imports; no circular deps; pure on import |
| #10 error handling | 3 sites | Compliant — null-return is the deliberate contract for a pure enumerator |
| #11 input validation | `legalMoves` | Compliant — not an HTTP/API boundary; `state` is engine-internal |
| #12 dependency hygiene | — | Compliant — no `console.log`, secrets, or package.json changes |
| #13 fix regressions | — | N/A (new files) |

### Observations

- `[VERIFIED]` AC9 overshoot/exact-Home boundary — `advance` line 31 `if (target > p.length - 1) return null` rejects overshoot while permitting `target === p.length - 1` (Home); test at `legal-moves.test.js` AC9 confirms safe-4 + card 1 → `{zone:'home'}` and safe-3 + card 5 → no move. Complies with AC9 and the safety guardrail.
- `[VERIFIED]` Purity — `legalMoves` builds `path()` locally and uses only `filter`/`map`/`push` on a fresh `moves` array; never writes `state`. The structuredClone-equality test (AC1) passes. Complies with the "no side effects" guardrail.
- `[VERIFIED]` Reuse of geometry — all positions derive from E3-1's `path(side)`/`START_EXIT` (lines 1, 7, 27); no duplicated track constants. Complies with the "derive from path()" guardrail.
- `[EDGE][MEDIUM]` Own-pawn collision is not filtered for any move kind (card-7 split can route two own pawns to the same square; forward/back can land on an own-occupied square). **Out of E3-2's AC scope** — no AC mentions occupancy, and the plan's reference design omits it. Deferred to E3-4 (apply) as a tracked delivery finding; non-blocking for E3-2.
- `[SILENT][MEDIUM]` `pathPos` returns `-1` for a malformed track index or unknown zone (lines 8, 11), which `advance` then treats like a Start pawn (pos -1) and emits phantom moves. Non-blocking: `state` is server-authoritative in this diff. Recommended hardening: throw on unknown zone / `indexOf === -1`.
- `[SEC][RULE][LOW]` `card in numeric` prototype-pollution pattern — see rule #3. Trusted input today; cheap fix recommended.
- `[RULE][LOW]` regex missing `^` anchor — see rule #7.
- `[TEST][RULE][LOW]` AC1 schema-test loop lacks a non-empty guard — see rule #8.
- `[DOC][LOW]` `legalMoves` (sole export) has no JSDoc for the `state` shape or the two move shapes (`split` carries `legs`; others carry `pawnId`/`to`); inline comment at line 30 ("out of start") is slightly misleading vs. the accurate header. Recommended for E3-4 consumers.
- `[TYPE][LOW]` Move-shape asymmetry: `out` omits `steps`; `split` omits top-level `pawnId`/`to`. **Spec-compliant** (AC2 defines `out` without steps; AC6 defines `split` with `legs`). Forward-compat note: E3-4 must branch on `kind` — recorded as a delivery finding.

### Dismissed (with rationale)

- `[EDGE][TYPE][SIMPLE]` card-7 **split mirror duplicates** (`split:0:1:1:6` vs `split:1:6:0:1`) — **DISMISSED**: AC6 explicitly states "Duplicate unordered splits are acceptable — the turn engine selects by `id`." This is documented intended behavior, not a defect.
- `[EDGE][TYPE][TEST][DOC]` Sorry! card pins source to `startPawns[0]` — **DISMISSED**: AC8 specifies "`pawnId` (a Start pawn)" (singular); pawns in Start are interchangeable tokens, so one sorry-move per opponent target is the complete, non-redundant set. Matches the plan's reference design.
- `[TYPE]` introduce `MOVE_KINDS`/`ZONES` enums for stringly-typed fields — **DISMISSED (Low/style)**: no project rule requires enums; consistent with the existing JS plugin conventions (geometry.js/state.js use string literals). Not a rule match.
- `[SEC]` `squareToLoc` null-safety / `START_EXIT[side]` infinite loop on bad `side` — **DISMISSED**: `side`/`opp` are derived from server-authoritative `currentPlayer ∈ {a,b}`; the security specialist itself rated Low and confirmed no request-body path reaches these. ReDoS on `/-safe-(\d)$/`: specialist measured clean (fixed-width, no backtracking).
- `[SIMPLE]` inline `trackPawns`/`ownTrackOrSafety` — **DISMISSED**: `trackPawns` was just extracted in the verify pass (3 call sites); both helpers will be imported by E3-3/E3-4. Keeping them aids readability.
- `[TEST]` add card 5/12 tests, opponent-in-safety swap-target test, split-count assertion, distinct-leg assertion — **DISMISSED as non-blocking**: all 10 ACs already have meaningful coverage (49/49 pass); these are strengthening suggestions, recorded as a non-blocking improvement finding.

### Devil's Advocate

Let me argue this code is broken. The most damning case: `legalMoves` is a trust sieve. It performs zero validation on `state` and silently degrades on anything unexpected. Feed it a pawn whose `zone` is `'Track'` (capital T from a future serialization bug) and `pathPos` falls through to `return -1` — the pawn is now treated as if it were in Start, and a card-3 draw cheerfully emits a forward move from path position 2, a square the pawn never occupied. No throw, no log; the turn engine downstream applies a legal-looking move to a phantom origin and the board quietly corrupts. The same happens for a track `index` that isn't on the side's path (squares 2–3 for side a): `indexOf` returns -1 and the phantom-origin bug fires again. A confused future maintainer extending the deck with a "0" or re-using `'Sorry'` (capital S) gets an empty move list indistinguishable from a legitimate stalemate — the bug hides as "no moves available" and the game stalls with no diagnostic. A malicious or buggy caller passing `currentPlayer = '__proto__'` turns `state.pawns['__proto__']` into `Object.prototype`, and `for (const pawn of mine)` throws an uncaught `TypeError`, crashing the request. And `card = '__proto__'` makes `card in numeric` true, flowing `Object.prototype` in as `steps`, producing `NaN` arithmetic that slips past both numeric guards and dies on `undefined.endsWith`. On the rules front, nothing stops two of my own pawns from being routed onto the same square by a card-7 split, an illegal stack that the enumerator happily offers.

Rebuttal: every one of these requires a state object that the server itself never constructs. `buildInitialState` hardcodes `currentPlayer:'a'`, builds pawns via `mkPawns()` (zones from the fixed set, indices 0–3), and draws `drawnCard` from a deck of known literals. There is no HTTP→state path in this diff; `state` is engine-internal and server-authoritative. So the trust-sieve attacks are latent, not live — correctly Low/Medium hardening, not blockers. The own-pawn-collision is genuinely real, but it is uniformly absent across all move kinds and unmentioned by any AC or the plan; it belongs to E3-4's apply/validate step, and I have tracked it as a delivery finding rather than inventing scope to reject correct, complete in-scope work. The devil surfaced no in-scope correctness defect — only robustness debt against malformed state, which I document.

## Reviewer Assessment

**Verdict:** APPROVED

All 10 acceptance criteria are implemented correctly and verified (49/49 sorry-suite tests, 1007/1008 full suite — the one skip is a pre-existing live-CLI test). No Critical or High findings. The two highest-rated subagent findings (split mirror-duplicates `[EDGE]`/`[TYPE]`/`[SIMPLE]`; Sorry! `startPawns[0]` pinning `[TYPE]`/`[EDGE]`) are explicitly permitted by AC6 and AC8 respectively and are dismissed with citations.

**Confirmed findings (all non-blocking, Low/Medium):**

| Severity | Tag | Issue | Location |
|----------|-----|-------|----------|
| [MEDIUM] | [EDGE] | Own-pawn collision not filtered (any move kind) — **out of scope**, deferred to E3-4 | legal-moves.js:88–111 |
| [MEDIUM] | [SILENT] | `pathPos` `-1` on malformed track index / unknown zone → phantom moves (trusted input today) | legal-moves.js:8,11 |
| [LOW] | [SEC][RULE] | `card in numeric` prototype-pollution pattern (rule #3) | legal-moves.js:68 |
| [LOW] | [RULE] | regex `/-safe-(\d)$/` lacks `^` anchor (rule #7) | legal-moves.js:18 |
| [LOW] | [TEST][RULE] | AC1 schema-test loop lacks `moves.length > 0` guard (rule #8) | legal-moves.test.js (AC1) |
| [LOW] | [DOC] | `legalMoves` export lacks JSDoc; line-30 comment slightly misleading | legal-moves.js:30,39 |
| [LOW] | [TYPE] | Move-shape asymmetry (`out` no `steps`; `split` no top-level `pawnId`/`to`) — spec-compliant; E3-4 note | legal-moves.js:57,100 |
| [LOW] | [SILENT] | Unknown `drawnCard` → silent `[]` (deck is server-built) | legal-moves.js |
| [LOW] | [TEST] | Strengthening: add card 5/12, opponent-safety swap-target, split-count tests | legal-moves.test.js |

**Data flow traced:** `state.drawnCard` (server-built deck) → card branch → `advance()` index arithmetic over `path(side)` → `{zone,index}` move objects. Safe: no user-input path reaches `legalMoves` in this diff; all inputs are engine-authoritative.
**Pattern observed:** single-source boundary guard in `advance()` (legal-moves.js:26–32) — every card kind inherits overshoot/underflow handling. Good pattern.
**Error handling:** pure-function null-return contract; no throws. Acceptable for an enumerator, with the noted hardening debt against malformed state.

**Recommendation:** Merge E3-2. The Low rule-matches (rules #3/#7/#8) and the `pathPos` hardening are cheap and worth a fast-follow cleanup, but none block. The own-pawn-collision and the move-shape contract are tracked as delivery findings for E3-4.

**Handoff:** To SM (Prospero) for finish-story.

## Delivery Findings

No upstream findings.

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### Reviewer (review)
- **Gap** (non-blocking): `legalMoves` does not filter moves that land a pawn on a square occupied by one of the same player's own pawns (applies to forward/back/out/split/swap). Affects `plugins/sorry/server/actions.js` (E3-4 `applySorryAction` must reject or `legalMoves` must filter own-pawn collisions; decide where occupancy is enforced). *Found by Reviewer during review.*
- **Improvement** (non-blocking): Move-object contract for downstream consumers — `out` moves omit `steps`; `split` moves omit top-level `pawnId`/`to` (carry `legs`). Affects `plugins/sorry/server/actions.js` and `ai/sorry-player.js` (E3-4/E3-5 must branch on `kind` before reading positional fields; consider documenting the two shapes in a JSDoc on `legalMoves`). *Found by Reviewer during review.*
- **Improvement** (non-blocking): Defensive hardening of the pure enumerator — `pathPos` silently returns `-1` for unknown zone / off-path track index, and `card in numeric` / unknown `drawnCard` degrade silently. Affects `plugins/sorry/server/rules/legal-moves.js` (throw on unknown zone, use `Set`/`Object.create(null)` for the numeric lookup, anchor the `-safe-` regex). Low priority — inputs are server-authoritative today. *Found by Reviewer during review.*
- **Improvement** (non-blocking): Test strengthening — add explicit card 5/12 coverage, an opponent-in-safety swap-target rejection test, a split-count assertion (12 ordered splits for 2 pawns), and a `moves.length > 0` guard on the AC1 schema-test loop. Affects `test/sorry/legal-moves.test.js`. *Found by Reviewer during review.*

### Dev (implementation)
- No upstream findings. The plan's reference design mapped cleanly onto E3-1's delivered geometry and state shape; pawn ids are numeric (`0..3`), matching the tests' `typeof pawnId === 'number'` checks. No gaps, conflicts, or schema surprises for downstream stories (E3-3 slides, E3-4 turn engine).

### TEA (test verification)
- No upstream findings during test verification. Verify phase confirmed GREEN (26/26 story, 49/49 suite) after applying one high-confidence reuse fix; `pf check` passes.

### TEA (test design)
- No upstream findings. Story context (context-story-E3-2.md), epic context, and the implementation plan (Task 4, lines 400–637) are mutually consistent on the move-object schema and destination encoding (`{zone, index}` with track/safety/home). E3-1's delivered geometry (`path`, `START_EXIT`) and state shape match the plan; no gaps blocking implementation.

## Design Deviations

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### Architect (reconcile)

**Reconcile summary:** All cited spec sources verified to exist (`docs/superpowers/plans/2026-05-27-sorry-plugin.md`, `sprint/context/context-story-E3-2.md`, `context-epic-E3.md`). The existing TEA (test design) and Dev (implementation) deviation entries are accurate — spec text quoted correctly, implementation descriptions match the code, forward-impact assessments are sound. No ACs were deferred or descoped: all 10 E3-2 ACs are DONE (the session's "out of scope" lines are sibling-story boundaries E3-3..E3-6, not deferrals of E3-2's own ACs). One missed spec deviation, formalized below (the Reviewer flagged it in `### Reviewer (audit)`; recorded here in the canonical 6-field format for the audit manifest).

- **Own-pawn collision not excluded from legal moves**
  - Spec source: sprint/context/context-story-E3-2.md, AC-6; and the "Technical Guardrails" / "Safety-Zone Guardrails" sections
  - Spec text: AC-6 includes splits for "All (ordered) pairs of distinct track/safety pawns with all step distributions 1+6 through 6+1 that produce **valid destinations**"; the guardrails define legality only via overshoot/underflow and "Out/sorry/swap targets are track squares only" — **no AC or guardrail mentions a square occupied by the player's own pawn.**
  - Implementation: `legalMoves` filters destinations only by on-path validity (`advance` returns `null` on overshoot/underflow). It does not reject a destination occupied by another of the current player's pawns, for any move kind (a card-7 split can route two own pawns onto the same square; forward/back/out can land on an own-occupied square).
  - Rationale: The spec is silent on own-pawn occupancy and the plan's reference design (Task 4) omits it, so the code faithfully implements the ACs as written. Standard Sorry! forbids ending on a square occupied by your own pawn — a real rule, but enforcement belongs either to `legalMoves` (filter) or to E3-4's `applySorryAction` (reject at apply). Deciding the locus is an E3-4 design choice.
  - Severity: minor (no in-scope AC violated; behavior is correct per the documented contract)
  - Forward impact: E3-4 (`plugins/sorry/server/actions.js`) — must decide where own-pawn occupancy is enforced and add it; without it, applying an enumerated move could produce an illegal two-pawns-on-one-square state. Tracked as a Gap in `## Delivery Findings → ### Reviewer (review)`.

### Reviewer (audit)
- **Dev "No deviations from spec"** → ✓ ACCEPTED by Reviewer: confirmed the implementation matches the plan's reference design and all 10 ACs; no undocumented behavioral deviation in the in-scope move enumeration.
- **TEA "node:test idiom instead of vitest"** → ✓ ACCEPTED by Reviewer: the repo runs `node --test`; vitest tests would not execute. Sound, zero behavioral impact.
- **TEA "expanded coverage to 25 tests"** → ✓ ACCEPTED by Reviewer: additive coverage aligned with the ACs; strengthens the suite, no spec conflict.
- **Own-pawn collision not enforced (UNDOCUMENTED):** Spec/plan are silent on whether `legalMoves` must exclude destinations occupied by the player's own pawns; the code does not filter them (card-7 split can stack two own pawns, and forward/back can land on an own-occupied square). Not logged by TEA or Dev. Severity: Medium. Disposition: out of E3-2's AC scope (no AC mentions occupancy) → deferred to E3-4 as a delivery finding rather than flagged for rework. Recorded here so it is not lost.

### Dev (implementation)
- No deviations from spec. Implemented the plan's reference `legalMoves` design exactly (move-object schema, card-by-card enumeration, `path`-based index arithmetic); all 26 story tests pass without altering any test expectation.

### TEA (test design)
- **Tests written in node:test idiom instead of the plan's vitest snippet**
  - Spec source: docs/superpowers/plans/2026-05-27-sorry-plugin.md, Task 4 Step 1
  - Spec text: Reference test uses `import { describe, it, expect } from 'vitest'` and `npx vitest run`
  - Implementation: Test file uses `node:test` + `node:assert/strict`, matching the project's actual runner (`package.json` test script `node --test 'test/**/*.test.js'`) and the existing `test/sorry/*.test.js` files
  - Rationale: The repo has no vitest; vitest tests would not run under `npm test`. node:test is the established convention for every existing sorry test.
  - Severity: minor
  - Forward impact: none — move-object schema and assertions are identical to the plan; only the test framework differs.
- **Expanded coverage beyond the plan's 7 example tests to 25**
  - Spec source: context-story-E3-2.md, AC-10
  - Spec text: "Test suite covers all card kinds and key edge cases" (lists 7 minimum scenarios)
  - Implementation: Added tests for purity/no-mutation (AC1), no-out-when-no-Start (AC2), card-4 off-start underflow (AC4), card-10 back-1 underflow (AC5), lone-pawn no-split (AC6), safety-pawn barred from swap (AC7), both empty-result Sorry! variants (AC8), exact-Home landing legal + Home pawns frozen (AC9)
  - Rationale: AC-10 sets a *minimum*; the listed ACs imply negative/boundary cases the 7 examples omit. Paranoid coverage of the overshoot/underflow boundaries is where a card-driven enumerator silently corrupts play.
  - Severity: minor
  - Forward impact: none — additive coverage only; all align with documented ACs.