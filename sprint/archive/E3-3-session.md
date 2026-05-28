---
story_id: "E3-3"
jira_key: "E3-3"
epic: "E3"
workflow: "tdd"
---
# Story E3-3: Slide traversal + bumping rules

## Story Details
- **ID:** E3-3
- **Jira Key:** E3-3
- **Workflow:** tdd
- **Stack Parent:** E3-1 (done); E3-2 (legal-move enumeration) merged to main
- **Points:** 2

## Story Context

### Overview

Implement slide traversal and bumping logic for the Sorry! engine. When a pawn lands on a foreign-color slide start square, it travels the length of that slide, bumping all pawns (own or opponent) in the swept path back to their Start zone. Landing on your own color's slide does nothing special. This is a critical rules engine component that connects to move application (E3-4).

### Technical Approach

Create two modules per the plan (Task 5):

1. **`plugins/sorry/server/rules/slides.js`** — The `resolveLanding` function is the core of this story:
   - Takes `{ pawns, side, landingIndex }` representing a pawn landing on a track square
   - Detects if there is a foreign-color slide starting at `landingIndex` using geometry constants
   - If no slide: bumps only the pawn (if any) on the landing square itself
   - If slide found: advances the pawn to the end of the slide, then bumps every pawn strictly between start and end (inclusive of swept squares)
   - Returns `{ finalIndex, bumped: [{side, pawnId}, ...] }`

2. **`plugins/sorry/server/geometry.js`** — Already defined in E3-1 expansion (or Task 3 of the plan if E3-1 was skeleton-only). Provides:
   - `SLIDES = { a: [...], b: [...] }` — two slides per color with `{start, length}`
   - `TRACK_LEN = 60`
   - Helper constants (`START_EXIT`, `SAFETY_ENTRY`)
   - `path(side)` function returning ordered list of all squares for a side

#### Key Rules

**Bumping logic:**
- A pawn bumped is sent back to `{ zone: 'start', index: 0 }`
- Bumping applies to both own-color and opponent pawns in the slide path
- Safety and Home zones are never affected by slides (slides are track-only)

**Slide condition:**
- A slide is "foreign" if its color does not match the landing pawn's side
- Landing on own color's slide start square does NOT trigger a slide

**Edge cases:**
- Track wrapping (slide end may wrap around track 0 boundary) uses modulo arithmetic
- Empty landing square (no pawn to bump) is valid
- Multiple pawns swept by one slide are all bumped

### Acceptance Criteria

1. **Geometry integrity**: Slides are defined per `geometry.js`; all tests use constants from there
2. **Single bump**: Landing on an empty square with no foreign slide → no bumped pawns
3. **Foreign-slide bump**: Landing on a foreign-color slide start → pawn travels to end and all pawns in path are bumped
4. **Own-color slide no-op**: Landing on own-color slide start → no movement, no bumps
5. **Own-color bump in foreign slide**: If a pawn of the landing side is in the swept path, it is bumped too
6. **Multiple pawns bumped**: One slide triggers multiple bumps if multiple pawns occupy swept squares
7. **Test coverage**: Full coverage of `resolveLanding` per test/sorry/slides.test.js

### Dependencies

- **geometry.js** constants (`SLIDES`, `TRACK_LEN`) — must be consistent with the rules
- **Legal-moves.js** (E3-2) — no direct dep, but used in E3-4 when moves are applied
- No changes to other modules in this story

### Deliverables

- `plugins/sorry/server/rules/slides.js` — complete with proper `resolveLanding` export
- `test/sorry/slides.test.js` — all tests passing
- One git commit: `feat(sorry): slide traversal and bumping`

## Sm Assessment

Story is well-scoped (2pt) and unblocked: E3-1 (geometry/skeleton) and E3-2 (legal moves) are both merged to main. Branched cleanly from fresh main after closing E3-2's lingering PR #69. The deliverable is a single focused module, `plugins/sorry/server/rules/slides.js` with `resolveLanding`, plus its test file — a natural TDD candidate.

**Note for TEA (red phase):** The context's description of `geometry.js` (line 33) is inherited from the plan and is slightly uncertain about what E3-1 actually exported (`SLIDES`, `TRACK_LEN`, `path()`). Verify the real geometry constants on main before writing tests, and anchor the failing tests to the actual exported shape rather than the plan's assumed names. If geometry exports differ, log a Delivery Finding rather than reshaping geometry in this story.

Handing off to Hamlet (TEA) for the red phase.

## TEA Assessment

**Tests Required:** Yes
**Reason:** Pure rules function with well-defined behavioral contract — ideal TDD target.

**Test Files:**
- `test/sorry/slides.test.js` — 16 tests covering all 5 ACs plus the return contract.

**Tests Written:** 16 tests, RED-verified (module `slides.js` absent → `ERR_MODULE_NOT_FOUND`).
**Status:** RED (failing — ready for Dev)

### Coverage Map (AC → tests)

| AC | Behavior | Tests |
|----|----------|-------|
| AC1 | export + exact `{finalIndex, bumped}` shape + purity | 3 (function type, shape/`Array.isArray`/`Number.isInteger`, no-mutation deepEqual) |
| AC2 | non-slide landing: `finalIndex===landingIndex`, occupant bumped | 3 (empty square, opponent bumped, off-square untouched) |
| AC3 | foreign slide triggers, sweeps path, bumps own+opp | 5 (end = `(start+length)%TRACK_LEN`, own+opp both bumped, past-end untouched, multi-pawn sweep, symmetric b-on-a) |
| AC4 | own-color slide suppressed; final-square bump still applies | 4 (no move, no sweep, landing-square still bumps, symmetric b-on-b) |
| AC5 | only `zone==='track'` participates | 2 (safety immune on swept square, start+home immune on collision) |
| contract | bumped entries well-formed | 1 (side ∈ {a,b}, pawnId is number) |

### Rule Coverage (JS lang-review)

| Rule | Test | Status |
|------|------|--------|
| #4 `Array.isArray` for arrays | AC1 shape test asserts `Array.isArray(result.bumped)` | failing |
| Purity / no input mutation | AC1 `structuredClone` deepEqual before/after | failing |
| Exact return shape (no leaked internals) | AC1 `Object.keys(result).sort() === ['bumped','finalIndex']` | failing |
| No hard-coded geometry | All slide coords derived from imported `SLIDES`/`TRACK_LEN` | failing |

**Rules checked:** Applicable JS-review rules for a pure resolver are covered (array typing, purity, return contract). DOM/Node/regex/prototype-pollution rules are N/A for this side-effect-free module.
**Self-check:** No vacuous assertions — every test asserts a concrete value or membership; no `let _ =`, no `assert(true)`, no always-None checks.

### Notes for Dev (Puck)

- `resolveLanding({ pawns, side, landingIndex })` receives `pawns` (the `{a:[],b:[]}` map), **not** full state. The mover is NOT in `pawns` at `landingIndex` — the caller (E3-4) places it at `finalIndex` afterward, so do not exclude any pawn by id; just bump whatever `zone:'track'` pawns sit on swept squares.
- Slide lookup: find the slide whose `start === landingIndex` across **both** colors. If its owner color `=== side` → own-color, suppress (no sweep), `finalIndex = landingIndex`. If owner `!== side` → foreign, `finalIndex = (start+length)%TRACK_LEN`, sweep `start..start+length` inclusive (mod 60).
- Always bump track pawns sitting on `finalIndex` even in the non-slide / own-color case (final-square rule).
- Run tests with `node --test test/sorry/slides.test.js` (NOT vitest — see Design Deviations).

**Handoff:** To Puck (Dev) for the GREEN phase.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `plugins/sorry/server/rules/slides.js` (new) — exports `resolveLanding({ pawns, side, landingIndex })`; pure, ~50 lines.

**Tests:** 18/18 passing (GREEN). Full sorry suite 67/67, no regressions.
**Branch:** `feat/E3-3-slide-traversal-bumping` (pushed, tracking origin)

**Implementation notes:**
- Slide lookup iterates `['a','b']` and matches `SLIDES[color].find(s => s.start === landingIndex)`.
- `triggers = slide !== null && owner !== side` — own-color slides are inert.
- `finalIndex = triggers ? (start+length)%TRACK_LEN : landingIndex`.
- Bump set: triggered → swept squares `start..start+length` (mod 60, inclusive); otherwise → just `finalIndex` (final-square bump for the non-slide/own-color case).
- Only `zone === 'track'` pawns are bumped; safety/start/home are skipped. No input mutation.
- No abstractions beyond what the tests demand; no other files touched (single-file deliverable per guardrail).

**Handoff:** To Portia (Reviewer) for code review.

## Architect Assessment (spec-check)

**Spec Alignment:** Aligned
**Mismatches Found:** None

Verified each AC in `context-story-E3-3.md` against `plugins/sorry/server/rules/slides.js`:

- AC1 — `resolveLanding` exported; returns exactly `{ finalIndex, bumped }`; pure (no input mutation). ✓
- AC2 — non-slide landing: `finalIndex === landingIndex`; track occupant on the square bumped; other zones ignored. ✓
- AC3 — foreign slide: `finalIndex = (start + length) % TRACK_LEN`; swept set covers `start..start+length` inclusive (mod 60); both own and opponent track pawns in path bumped. ✓
- AC4 — own-color slide (`owner === side`) is inert: no sweep, `finalIndex === landingIndex`; final-square occupant still bumped, matching "returns as if a plain landing". ✓
- AC5 — only `zone === 'track'` pawns considered; safety/start/home immune. ✓

Guardrail compliance: single-file deliverable, slide coords imported from `geometry.js` (no hard-coding), modular arithmetic via `% TRACK_LEN`, sides hard-limited to `['a','b']`. All honored. Implementation is minimal — no scope creep.

**Forward note (informational, not a mismatch):** `resolveLanding` excludes the mover from `bumped` by *contract* — it assumes the caller has not placed the mover into `pawns` at a swept square. E3-4 (turn engine) must uphold this when wiring move application, particularly for back-moves / 11-swaps that could land on a slide start from ahead. Already documented in TEA/Dev notes; flagged here for E3-4 traceability.

**Decision:** Proceed to verify (TEA).

## TEA Assessment (verify)

**Phase:** finish
**Status:** GREEN confirmed

### Simplify Report

**Teammates:** reuse, quality, efficiency
**Files Analyzed:** 2 (`plugins/sorry/server/rules/slides.js`, `test/sorry/slides.test.js`)

| Teammate | Status | Findings |
|----------|--------|----------|
| simplify-reuse | 3 findings | `startFour`≈`mkStartPawns` dup (high); shared `makePawns` builder (med); `legal-moves.js:71` inline-filter dup (high, **out of scope**) |
| simplify-quality | 3 findings | `startFour`/`makePawns` naming vs `mk*` (med×2); missing `--- helpers ---` comment (low — **false positive**, comment present at line 6) |
| simplify-efficiency | clean | Set membership, ternary, exhaustive loops all justified — no over-engineering |

**Applied:** 0 high-confidence fixes.
**Flagged for Review:** 2 medium-confidence naming findings (cosmetic; left as-is).
**Noted:** 1 low-confidence finding (false positive — separator comment is present).
**Reverted:** 0.

**Rationale for applying nothing:** The two high-confidence reuse fixes both require touching files outside this story's scope — extracting a shared fixture would create `test/sorry/_fixtures.js` and edit `legal-moves.test.js`, and the `legal-moves.js:71` dup lives in an E3-2 file not in this diff. The story's scope boundary is explicit ("Single output file... no other files are created or modified"). Per spec-authority, story scope outranks an opportunistic refactor. Both findings are preserved as non-blocking Delivery Findings for future cleanup. The medium naming findings are cosmetic and below the auto-apply bar.

**Overall:** simplify: clean (no actionable in-scope findings)

**Quality Checks:** `pf check` PASSED — tests 1025/1026 (1 pre-existing unrelated skip), lint/typecheck N/A (no config / not TS), exit 0. No regressions.

**Handoff:** To Portia (Reviewer) for code review.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (GREEN 1025/1025; 0 smells) | N/A |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings |
| 4 | reviewer-test-analyzer | Yes | findings | 7 | confirmed 2 (non-blocking), deferred 2, dismissed 3 |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings |
| 6 | reviewer-type-design | Yes | findings | 5 | confirmed 2 (non-blocking), dismissed 3 |
| 7 | reviewer-security | Yes | findings | 2 | confirmed 2 (non-blocking, downgraded to LOW) |
| 8 | reviewer-simplifier | Yes | findings | 4 | dismissed 4 (style / spec-mandated) |
| 9 | reviewer-rule-checker | Yes | clean | none (13 rules, 47 instances, 0 violations) | N/A |

**All received:** Yes (6 enabled returned, 3 disabled)
**Total findings:** 4 confirmed (all non-blocking), 2 deferred to E3-4, 10 dismissed (with rationale)

## Reviewer Assessment

**Verdict:** APPROVED

No Critical or High findings. The implementation is a correct, minimal pure helper matching all five ACs and the AC-mandated return shape. All confirmed findings are non-blocking (MEDIUM test-coverage gaps and LOW defensive-robustness/style), documented below and forwarded to E3-4 where relevant.

**Data flow traced:** `resolveLanding({ pawns, side, landingIndex })` → slide lookup over the static `SLIDES` constant → `triggers` decision → swept-square `Set` → `bumped` list filtered to `zone==='track'` → returns `{ finalIndex, bumped }`. No mutation of inputs (AC1 purity test via `structuredClone`). No I/O, no network, no user strings. Safe.

**Pattern observed:** Mirrors the sibling `legal-moves.js` rules module — ESM import from `../geometry.js`, single pure exported function, geometry derived from constants (no hard-coding). Consistent with E3-2.

### Rule Compliance (JS lang-review checklist)

Backed by reviewer-rule-checker's exhaustive pass (13 rules / 47 instances / 0 violations), independently spot-checked:

| Rule | Applies | Verdict |
|------|---------|---------|
| #1 Silent error swallowing | no try/catch, no JSON.parse | Compliant |
| #2 Async/promise pitfalls | fully synchronous | Compliant |
| #3 Prototype pollution | `SLIDES[color]`/`pawns[color]` keyed by hard-coded `['a','b']`, not user input | Compliant |
| #4 Equality/coercion | `===`/`!==` throughout (lines 19, 28, 43); `Set.has(0)` safe for track 0 | Compliant |
| #5 DOM/browser | server module, none present | N/A |
| #6 Node.js specifics | no require/exec/fs/env/Buffer | Compliant |
| #7 Regex safety | no regex | N/A |
| #8 Test quality | strict `node:assert`; exact-value assertions; no `.only`/`.skip` | Compliant |

### Observations

1. `[VERIFIED]` Slide lookup correct — `slides.js:18-25`: slide starts (9/34/39/4) are distinct, so first-match `break` is unambiguous; confirmed against rule-checker (clean) and simplifier (verbose-but-correct).
2. `[VERIFIED]` Trigger logic sound — `slides.js:28`: `slide !== null && owner !== side` short-circuits before `owner` (null when no slide) is ever compared; type-design confirmed no null-comparison bug.
3. `[VERIFIED]` Swept range + modular arithmetic — `slides.js:34-38`: `k=0..length` inclusive matches `finalIndex=(start+length)%TRACK_LEN`, correctly including the final square for the final-square bump rule.
4. `[VERIFIED]` Return shape exact — `slides.js:49` returns exactly `{finalIndex, bumped}` with `bumped` entries `{side, pawnId}`, matching AC1's mandated shape; AC1 test guards against extra keys.
5. `[MEDIUM][TEST]` Wrap-around modulo structurally untested — `slides.test.js`: no slide in current geometry crosses index 59, so both `% TRACK_LEN` sites are unexercised; a regression dropping the modulo would pass. Code is correct; exercising it needs a synthetic wrapping slide in `geometry.js` (out of this story's single-file scope). Non-blocking → Delivery Finding for E3-4/geometry follow-up.
6. `[MEDIUM][TEST]` Multi-pawn bump asserts count only — `slides.test.js:116` checks `bumped.length===3` without identities; a label-scramble bug would still be caught by the sibling AC3 identity test (`slides.test.js:95`), so the gap is partial. Non-blocking improvement recommended.
7. `[LOW][SEC][TYPE]` No validation of `side`/`pawns` — `slides.js:14,42`: an out-of-enum `side` makes every slide "foreign"; a non-array `pawns[color]` throws an uncontextualized `TypeError`. Raised by two specialists. Defensive only — internal helper, server-authoritative caller, no AC/rule requires it; Dev was directed to minimalism. Non-blocking → forwarded to E3-4 (caller should guarantee/validate state shape).
8. `[RULE]` Exhaustive lang-review pass clean — reviewer-rule-checker checked all 13 applicable JavaScript rules across 47 instances and found 0 violations (strict equality throughout, no prototype-pollution path since `color` is the hard-coded `['a','b']` literal, no silent error swallowing, no async/regex/Node pitfalls). Confirmed.
9. `[LOW][SIMPLE][TYPE]` Lookup uses two `let`-null vars instead of a flattened `find` — `slides.js:16-25`: stylistic; the current form is readable and consistent with the sibling module. Dismissed.
9. `[DISMISSED][TYPE]` Suggestion to rename bumped `side`→`color` — context-story-E3-3.md AC1 mandates `bumped` entries be `{side, pawnId}`; renaming would violate the spec and break the tests. Dismissed citing the AC.
10. `[DEFERRED][TEST][TYPE]` Mover-exclusion is a documentary contract, unenforced — appropriately E3-4's concern (the caller must not place the mover in `pawns` at a swept square). Already documented by TEA/Dev/Architect; carried forward.

### Devil's Advocate

Suppose this code is broken. The most credible attack is the **unvalidated boundary**: `resolveLanding` trusts that `side ∈ {'a','b'}` and that `pawns.a`/`pawns.b` are arrays. If E3-4 ever wires a websocket-deserialized state straight into this helper without schema validation, a crafted or corrupted payload either crashes the turn-engine worker (`for...of` on a non-array → `TypeError`) or — more insidiously — passes a bogus `side` that makes *every* slide fire as foreign, silently corrupting the game. The function offers no tripwire, so the failure surfaces far from its cause. Second, the **wrap-around modulo is dead under current geometry**: no slide crosses square 59, so `% TRACK_LEN` is never exercised. A future geometry that adds a wrapping slide (entirely plausible for a re-themed board) could regress on a dropped modulo and every existing test would still pass — false confidence baked in. Third, the **mover-exclusion contract is honor-system**: if E3-4's back-move or 11-swap path lands a pawn on a slide start *from ahead* and the mover is still in `pawns` at that index, the mover self-bumps to Start — a real, silent rules bug, and nothing here or in the tests catches it. Fourth, the **count-only multi-pawn assertion** would mask a side-label swap on multi-bump slides if the sibling identity test were ever weakened. 

Weighing these: all four are real but none is a defect *within E3-3's scope* — the code correctly implements the specified pure contract, and three of the four are integration concerns that belong to E3-4 (where the caller and live state exist) or to a geometry change that doesn't exist yet. They are documented as Delivery Findings so they cannot silently slip. Verdict stands: **APPROVED**, with E3-4 explicitly inheriting the validation and mover-exclusion concerns.

**Handoff:** To Prospero (SM) for finish-story.

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-05-28T09:59:41Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-28 | 2026-05-28T09:43:32Z | 9h 43m |
| red | 2026-05-28T09:43:32Z | 2026-05-28T09:48:06Z | 4m 34s |
| green | 2026-05-28T09:48:06Z | 2026-05-28T09:49:42Z | 1m 36s |
| spec-check | 2026-05-28T09:49:42Z | 2026-05-28T09:50:46Z | 1m 4s |
| verify | 2026-05-28T09:50:46Z | 2026-05-28T09:53:31Z | 2m 45s |
| review | 2026-05-28T09:53:31Z | 2026-05-28T09:58:51Z | 5m 20s |
| spec-reconcile | 2026-05-28T09:58:51Z | 2026-05-28T09:59:41Z | 50s |
| finish | 2026-05-28T09:59:41Z | - | - |

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- No upstream findings during implementation. Geometry exports (`SLIDES`, `TRACK_LEN`) and the `pawns` shape were exactly as the story context described; `resolveLanding` consumes them cleanly with no changes needed elsewhere.

### TEA (test verification)
- **Improvement** (non-blocking): `plugins/sorry/server/rules/legal-moves.js:71` inlines the filter `pawn.zone === 'track' || pawn.zone === 'safety'`, duplicating the `ownTrackOrSafety()` helper already defined at line 35 of the same file. Affects `plugins/sorry/server/rules/legal-moves.js` (replace the inline check with the helper). Out of scope for E3-3 (that file is E3-2, already merged); surfaced by the simplify-reuse pass for a future cleanup. *Found by TEA during test verification.*
- **Improvement** (non-blocking): The two sorry test files duplicate a trivial start-pawn factory (`startFour` here vs `mkStartPawns` in `legal-moves.test.js`) and use divergent helper names. A shared `test/sorry/_fixtures.js` would DRY this up, but extraction was deliberately NOT done in E3-3 because the story scope forbids creating/modifying files beyond `slides.js`/`slides.test.js`. Affects `test/sorry/` (consider a shared fixtures module when scope allows). *Found by TEA during test verification.*

### Reviewer (code review)
- **Improvement** (non-blocking): `resolveLanding` performs no input validation — an out-of-enum `side` makes every slide fire as foreign, and a non-array `pawns.a`/`pawns.b` throws an uncontextualized `TypeError`. Affects the **E3-4 caller** (`plugins/sorry/server/actions.js` / turn engine — must guarantee or validate `{a:[],b:[]}` state shape and a valid `side` before calling, or add guards at integration). Flagged by reviewer-security + reviewer-type-design. *Found by Reviewer during code review.*
- **Gap** (non-blocking): The `% TRACK_LEN` wrap-around in both `finalIndex` and the swept-set loop is structurally untested — no slide in current `geometry.js` crosses index 59. Affects `plugins/sorry/server/geometry.js` + `test/sorry/slides.test.js` (a wrapping slide, or a wrap-around-targeted test, would be needed to cover it). Code is correct; relevant if geometry gains a wrapping slide. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): The mover-exclusion contract (caller must not place the mover in `pawns` at a swept square) is unenforced and untested. Affects **E3-4** (`plugins/sorry/server/actions.js` — should uphold the contract, especially for back-moves / 11-swaps that can land on a slide start from ahead). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): The multi-pawn AC3 test (`test/sorry/slides.test.js:116`) asserts `bumped.length===3` only, not identities; consider the key-sort identity pattern used at `slides.test.js:95`. Affects `test/sorry/slides.test.js`. *Found by Reviewer during code review.*

### TEA (test design)
- **Improvement** (non-blocking): The E3-3 AC text (context-story-E3-3.md, AC6) specifies `npx vitest run` as the test command, but the project's actual test infrastructure is `node --test` (node:test / node:assert) per `package.json` `"test": "node --test 'test/**/*.test.js'"` and every existing sorry test. Future story ACs in epic E3 should reference `node --test`, not vitest, for server-side suites. Affects `sprint/context/context-story-E3-*.md` (AC wording). *Found by TEA during test design.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- No deviations from spec. Implemented `resolveLanding` exactly per the story context and TEA's tests: foreign-slide lookup across both colors, own-color suppression, `(start+length)%TRACK_LEN` end, full-path sweep, final-square bump, track-zone-only bumping, pure (no mutation).

### TEA (test design)
- **Tests use node:test runner instead of vitest**
  - Spec source: context-story-E3-3.md, AC6
  - Spec text: "`npx vitest run test/sorry/slides.test.js` exits green"
  - Implementation: Tests use `node:test` + `node:assert/strict` and run via `node --test test/sorry/slides.test.js`
  - Rationale: The project's actual test runner is node:test (`package.json` test script; all existing sorry tests). vitest is configured only for client/dice bundles (`test:client`). Writing the spec's literal vitest command would produce a suite that cannot run against the server module. Matching real infrastructure is mandatory for tests to execute.
  - Severity: minor
  - Forward impact: none — behavioral coverage is identical; only the runner differs.

### Reviewer (audit)
- **Dev "No deviations from spec"** → ✓ ACCEPTED by Reviewer: verified against the diff — the implementation matches context-story-E3-3.md exactly (foreign-slide lookup, own-color suppression, modular end, full-path sweep, final-square bump, track-only, pure). Agrees with author reasoning.
- **TEA "Tests use node:test runner instead of vitest"** → ✓ ACCEPTED by Reviewer: the project's real runner is `node --test` (`package.json` test script; all sibling sorry suites). The spec's literal `vitest` command would not execute against the server module. Sound deviation; behavioral coverage is unchanged.
- No undocumented spec deviations found. The validation gaps and test-coverage observations raised in review are not spec deviations (the spec required neither input validation nor wrap-around coverage) — they are recorded as non-blocking Delivery Findings for E3-4.

### Architect (reconcile)
- No additional deviations found. Audited the full manifest against context-story-E3-3.md, context-epic-E3.md, and sibling story ACs:
  - **Dev (implementation)** "No deviations" — verified accurate; `resolveLanding` matches the context's technical guardrails (single file, geometry-derived, modular, track-only, pure) exactly.
  - **TEA (test design)** "node:test instead of vitest" — verified: all 6 fields present; spec source confirmed real (context-story-E3-3.md AC6 reads "`npx vitest run test/sorry/slides.test.js` exits green"); implementation description matches the actual suite (`node:test`/`node:assert`); forward impact "none" is correct (behavioral coverage identical). Deviation is sound — the project's real runner is `node --test` per `package.json`.
  - **AC accountability:** all five ACs (AC1 export/shape/purity, AC2 non-slide bump, AC3 foreign-slide sweep, AC4 own-color inert, AC5 track-only) are DONE and test-covered. No ACs deferred or descoped — the AC-deferral cross-check is a no-op.
  - The review's non-blocking findings (input validation, wrap-around coverage, mover-exclusion enforcement) describe behavior the spec did not require of this pure helper; they are correctly carried as Delivery Findings for E3-4, not retroactive deviations.