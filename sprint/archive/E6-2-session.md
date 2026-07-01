---
story_id: "E6-2"
jira_key: ""
epic: ""
workflow: "tdd"
---
# Story E6-2: Clue action reducers: refuter walk + suggest/refute/accuse/pass

## Story Details
- **ID:** E6-2
- **Points:** 5
- **Priority:** p1
- **Workflow:** tdd
- **Implementation Plan:** docs/superpowers/plans/2026-07-01-clue-core-engine.md (Tasks 4–8)
- **Stack Parent:** E6-1 (done — cards/state/view complete)

## Technical Approach

This story implements the action reducers and turn-advancing state machine for the Clue deduction engine (Tasks 4–8 of the core plan). The engine is pure ES-module functions under `plugins/clue/server/`, fully deterministic and testable via `node --test`.

**Architecture:**
- `findRefuterWalk(state, suggesterSeat, named)` — left-walking search for the first seat that can disprove a suggestion; returns seats that pass (`no-refute` log entries) and the first holder (or null).
- Action reducers in `applyClueAction({ state, action, actorId })`:
  - `enterRoom` (phase `move` → `suggest`): places the current seat's pawn in a room.
  - `suggest` (phase `suggest` → `refute` or `accuse-or-pass`): drags the named pawn+weapon in, computes refuter walk, pauses on the human refuter or returns to suggester if nobody can disprove.
  - `refute` (phase `refute` → `accuse-or-pass`): shows one valid held card, recorded to the suggester's private ledger only.
  - `accuse` (phase `move` or `accuse-or-pass` → `ended` or next turn): correct wins (winnerSeat, endedReason='accusation'); wrong eliminates the accuser and advances, with last-standing win (endedReason='last-standing').
  - `pass` (phase `move` or `accuse-or-pass` → `move`): advances to the next living seat (skips eliminated), clears suggestion.
- Helpers: `nextSeat(state, from)` (skip eliminated), `livingCount(state)` (end-game detection).

**Human-vs-bot boundary:**
- This story implements **human-style refute only** — the refuter is paused (activeUserId set) waiting for the human to choose which card to show.
- Bot auto-refute is deferred to E6-4 — do NOT implement bot refute here. The `refute` action will be invoked by the human client in E6-5, or by the bot framework in E6-4.

**Rooms modeled as abstract locations:** no grid geometry, no movement validation (deferred to Plan 2 E6-3). An `enterRoom` action places a pawn directly; no reachability rules.

**Tech Stack:**
- Node ≥20, ESM, `.js` extensions explicit
- Tests: `node --test` with `node:test` + `node:assert/strict`
- Reuses `findRefuterWalk`, `applyClueAction`, and helper exports from this story

## Acceptance Criteria

1. **findRefuterWalk:** Walks left from the suggester and returns the seats that could not disprove plus the first holder (or null); eliminated players still refute.
2. **suggest:** Validates you are in the named room, drags the named pawn+weapon into it, logs the suggestion and couldn't-disprove passes, then pauses on the human refuter (activeUserId) or returns to the suggester if nobody can disprove.
3. **refute:** Shows one valid held card recorded to the suggester's private ledger only, then phase -> accuse-or-pass.
4. **accuse:** Correct wins (winnerSeat, ended:true); wrong eliminates the accuser (who keeps refuting) and advances, with last-standing win; pass advances to the next living seat (skips eliminated) and resets to move phase.

## Delivery Findings

<!-- Append-only. Each agent writes under its own subheading. -->

### TEA (test design)
- **Question** (non-blocking): Task 7's interface prose says a correct accusation returns `{ state, ended: true, summary }`, but the plan's reference `endWith` helper returns only `{ state, ended: true }` — there is no `summary`. Affects `plugins/clue/server/actions.js` (`doAccuse`/`endWith`). The AC does not mention `summary`, so my tests do NOT assert it. Dev/Reviewer should decide whether to add a `summary` field or treat the prose as aspirational; either is compatible with the ACs.
- No other upstream issues. The plan (Tasks 4–8) is exceptionally complete: exact interfaces, error strings, and return shapes, all consistent with E6-1's existing exports (`SUSPECTS`/`WEAPONS`/`ROOMS`, `state` shape from `buildInitialState`).

### Dev (implementation)
- **Resolved** TEA's `summary` Question: I did NOT add a `summary` field to the correct-accusation return, following the plan's reference `endWith` (which omits it) and the minimalist discipline (no AC/test requires it). Reviewer may overrule if a client surface later needs it. Affects `plugins/clue/server/actions.js` (`endWith`).
- No upstream findings during implementation. The plan's reference code passed all 35 tests (incl. TEA's paranoid extras) unmodified.

### Reviewer (code review)
- **Improvement** (non-blocking): `doPass` (and by symmetry any active-turn reducer) has no `livingCount === 1` guard; `nextSeat` returns `from` if no other seat is living. Unreachable today (the accuse reducer ends the game at last-standing before this can occur), but a future path that eliminates players outside `doAccuse` could strand the turn. Affects `plugins/clue/server/actions.js` (`doPass`/`nextSeat`) — consider an assertion or explicit end-check if new elimination paths are added.
- **Improvement** (non-blocking): `applyClueAction` dereferences `action.type` before any null-check, so a null/undefined `action` throws a `TypeError` instead of returning `{ error }`. Internal API (E6-5 client constructs the action), so non-blocking. Affects `plugins/clue/server/actions.js:14` — a one-line guard would make the reducer total.
- No blocking upstream findings during code review.

## Design Deviations

<!-- Append-only. Each agent writes under its own subheading. -->

### TEA (test design)
- **Did not write a test for the `summary` field on a correct accusation**
  - Spec source: docs/superpowers/plans/2026-07-01-clue-core-engine.md, Task 7 interface (line 919)
  - Spec text: "Correct → `phase:'ended'`, `winnerSeat`, `endedReason:'accusation'`, returns `{ state, ended: true, summary }`"
  - Implementation: Tests assert `ended`, `winnerSeat`, `endedReason`, `activeUserId=null`, and the accuse log entry, but NOT a `summary` field.
  - Rationale: The plan's own reference `endWith` helper omits `summary` and no AC requires it; asserting it would contradict the reference implementation and manufacture a false RED. Logged as a Delivery Finding (Question) for Dev/Reviewer instead.
  - Severity: minor
  - Forward impact: none (if Dev adds `summary`, an extra test can be added in review without reworking existing tests)
- **Added tests beyond the plan's examples (strengthened coverage, not reduced)**
  - Spec source: sprint/context/context-story-E6-2.md, all 4 ACs
  - Spec text: the four acceptance criteria
  - Implementation: Added phase-guard, turn-guard, catalog-validation, prototype-pollution-rejection, non-participant, unknown-action, genuine 4-seat turn-skip, "eliminated accuser keeps cards", and reducer-purity (no-mutation) tests on top of the plan's happy-path examples.
  - Rationale: The plan's example tests are happy-path-heavy; these enforce lang-review #3 (prototype pollution) and #11 (input validation) and the reducer-purity invariant. All aligned to the plan's reference error strings/return shapes so they pass under the reference GREEN implementation.
  - Severity: minor
  - Forward impact: none (additive coverage)

### Dev (implementation)
- **Did not add the `summary` field to a correct accusation's return value**
  - Spec source: docs/superpowers/plans/2026-07-01-clue-core-engine.md, Task 7 interface (line 919)
  - Spec text: "Correct → ... returns `{ state, ended: true, summary }`"
  - Implementation: `endWith` returns `{ state, ended: true }` — no `summary` — matching the plan's own reference code block for `endWith`.
  - Rationale: The plan's prose and its reference code disagree; no AC and no test requires `summary`. Adding an unused field is scope creep (minimalist discipline). TEA flagged this; I resolved it toward the reference code.
  - Severity: minor
  - Forward impact: none (a client that wants a human-readable summary can add the field with a test in a later story without reworking `doAccuse`)
- **Implemented `actions.js` in one complete file rather than the plan's stub-then-replace task order**
  - Spec source: docs/superpowers/plans/2026-07-01-clue-core-engine.md, Tasks 5–8 (incremental steps)
  - Spec text: Task 5 stubs `refute`/`accuse`/`pass` to `{ error: 'not implemented' }`; Tasks 6–8 replace the stubs.
  - Implementation: Wrote the final `actions.js` with all five reducers implemented directly (no intermediate stubs committed).
  - Rationale: The stubs are a build-order convenience for incremental TDD, not a spec of a deliverable artifact. The final code is byte-for-byte the plan's end state and passes the full suite.
  - Severity: trivial
  - Forward impact: none

### Reviewer (audit)
- **TEA: did not test the `summary` field** → ✓ ACCEPTED by Reviewer: correct call — the plan's reference `endWith` never produces `summary` and no AC requires it; testing it would be a false RED.
- **TEA: added tests beyond the plan's examples** → ✓ ACCEPTED by Reviewer: additive coverage (phase/turn guards, catalog validation, `__proto__` rejection, reducer purity, genuine 4-seat turn-skip). All aligned to the reference contract; strengthens the suite.
- **Dev: did not add the `summary` field** → ✓ ACCEPTED by Reviewer: resolves the plan prose-vs-code contradiction toward the reference code; adding an unused field is scope creep. If E6-5's client needs a human-readable summary, add it with a test then.
- **Dev: implemented `actions.js` in one file (no committed stubs)** → ✓ ACCEPTED by Reviewer: the stubs are an incremental build order, not a deliverable; the final file matches the plan's end state and the full suite is green.
- No undocumented deviations found: the diff matches the plan (Tasks 4–8) and the four ACs; error strings, return shapes, and state transitions are exactly as specified.

## TEA Assessment

### Red Phase (test writing)

**Tests Required:** Yes
**Reason:** Core engine logic (reducers + refuter walk) — pure functions with rich branching; exactly what TDD is for.

**Test Files:**
- `test/clue-refute-walk.test.js` — `findRefuterWalk` left-walk search (AC-1)
- `test/clue-actions-suggest.test.js` — `enterRoom` + `suggest` reducers (AC-2)
- `test/clue-actions-refute.test.js` — `refute` reducer, private-ledger disclosure (AC-3)
- `test/clue-actions-accuse.test.js` — `accuse` reducer, elimination & win (AC-4)
- `test/clue-actions-pass.test.js` — `pass` reducer, turn advance (AC-4)

**Tests Written:** 35 tests across 5 files covering all 4 ACs (plan's canonical contract tests + paranoid extras).
**Status:** RED (failing — ready for Dev). Verified via `testing-runner`: all 5 new files fail with `ERR_MODULE_NOT_FOUND` (missing `plugins/clue/server/refute.js` + `actions.js`); the 18 pre-existing clue tests (cards/state/view) still pass. Clean RED — no test syntax or assertion errors.

**Commit:** `84f544d` — test(clue): add failing tests for E6-2

### Rule Coverage (JavaScript lang-review)

| Rule | Test(s) | Status |
|------|---------|--------|
| #3 prototype pollution | `suggest rejects prototype-pollution payloads instead of mutating Object.prototype` | failing (RED) |
| #11 input validation | `suggest validates the suspect and weapon`, `accusation validates suspect/weapon/room`, enterRoom bad-room | failing (RED) |
| #8 test quality (self-check) | strengthened the `__proto__` probe from a vacuous `{}.polluted` check to `assert.equal(r.state, undefined)` | applied |
| purity/no-mutation (correctness) | `applyClueAction does not mutate the input state`, refute + pass purity tests | failing (RED) |

**Rules checked:** 3 of 13 lang-review checks are directly test-enforceable at this layer (pure engine, no DOM/async/network/DB); the remainder (#1 silent errors, #2 async, #5 DOM, #6 Node, #7 regex, #12 deps) are not exercised by pure reducer code and are Dev self-review concerns.
**Self-check:** 1 vacuous assertion found and fixed (the `{}.polluted` probe → `r.state === undefined`). No `let _ =`, `assert(true)`, or always-None assertions remain.

**Handoff:** To Dev (Trillian) for GREEN — implement `refute.js` then `actions.js` per plan Tasks 4→8 in order (Task 5 stubs refute/accuse/pass, Tasks 6–8 replace the stubs). See the Delivery Finding re: `summary`.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `plugins/clue/server/refute.js` (new) — `findRefuterWalk(state, suggesterSeat, named)`: left-walking refuter search; eliminated players still refute.
- `plugins/clue/server/actions.js` (new) — `applyClueAction({ state, action, actorId })` with `enterRoom`/`suggest`/`refute`/`accuse`/`pass` reducers plus `nextSeat`/`livingCount`/`endWith` helpers. Pure (structuredClone), returns `{ state }` / `{ state, ended }` / `{ error }`.

**Tests:** 61/61 clue tests passing (GREEN) — 41 across the 5 new reducer files + 20 pre-existing (cards/state/view). Full project suite: **1,238 passing, 0 failing, 1 intentional skip** — no cross-cutting regressions. Verified via `testing-runner` (RUN_ID E6-2-dev-green).

**Commits (trunk-based on `main`):**
- `84f544d` — test(clue): failing tests (RED, by TEA)
- `6cbefc6` — feat(clue): action reducers (GREEN)

**Push:** Deferred to SM finish (trunk-based, no PR — matches how E6-1 reached `origin/main`). Code is committed locally on `main`; `origin/main` is currently 2 commits behind.

**Self-review:**
- ✅ All 4 ACs met (findRefuterWalk / suggest / refute / accuse+pass).
- ✅ Reuses E6-1 exports (`SUSPECTS`/`WEAPONS`/`ROOMS`, `state` shape); no changes to E6-1 files.
- ✅ Input validation on every reducer (catalog allow-lists reject `__proto__`/garbage before mutation) — lang-review #3 + #11.
- ✅ Reducers are pure (structuredClone); no in-place mutation of caller state.
- ⚠️ Not wired to a client/plugin manifest — that is explicitly E6-5's scope (this story is engine-only, per the plan Roadmap). No AC here requires wiring.

**Handoff:** To Reviewer (Arthur Dent) for code review.

**Branch Strategy:** trunk-based (branching skipped — work happens on the default branch `main`)
**Repo:** g-1 (path .)
**Base Branch:** main

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-07-01T21:41:52Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-01T21:23:48Z | - | - |
| red | 2026-07-01T21:23:48Z | 2026-07-01T21:33:07Z | 9m 19s |
| green | 2026-07-01T21:33:07Z | 2026-07-01T21:37:33Z | 4m 26s |
| review | 2026-07-01T21:37:33Z | 2026-07-01T21:41:52Z | 4m 19s |
| finish | 2026-07-01T21:41:52Z | - | - |

## Subagent Results

Only `reviewer-preflight` is enabled in `workflow.reviewer_subagents`; the other 8 specialists are disabled via settings, so their domains were assessed directly by the Reviewer (see the tagged observations in the assessment).

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 0 smells; 1238 pass / 0 fail / 1 pre-existing skip; clue 61/61 | N/A (clean) |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — edge cases assessed by Reviewer ([EDGE]) |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — error handling assessed by Reviewer ([SILENT]) |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings — test quality assessed by Reviewer ([TEST]) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings — comments assessed by Reviewer ([DOC]) |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings — type/shape design assessed by Reviewer ([TYPE]) |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings — security assessed by Reviewer ([SEC]) |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings — complexity assessed by Reviewer ([SIMPLE]) |
| 9 | reviewer-rule-checker | No | Skipped | disabled | Disabled via settings — rules assessed by Reviewer ([RULE]) |

**All received:** Yes (1 enabled subagent returned; 8 disabled via settings and assessed directly)
**Total findings:** 2 confirmed (both LOW/non-blocking), 0 dismissed, 0 deferred

## Reviewer Assessment

**Verdict:** APPROVED

**Data flow traced:** A user action `{ type, payload }` + `actorId` → `applyClueAction` → `actorSeat` maps `actorId` to a seat via `state.seats.indexOf` (rejects non-participants) → per-type reducer validates turn/phase, then validates every payload string against the `SUSPECTS`/`WEAPONS`/`ROOMS` allow-lists *before* using it (`actions.js:41-43,113-115`) → `structuredClone` → mutation on the clone only → returns `{ state }` / `{ state, ended }` / `{ error }`. Untrusted strings only ever become object keys after passing an allow-list, so `__proto__`/`constructor` payloads are rejected, not applied — safe.

**Pattern observed:** Pure reducer pattern — clone-then-mutate on every path (`actions.js:30,48,76,121,144`), result-type returns rather than exceptions for expected validation failures. Consistent and idiomatic; TEA's purity tests lock it in.

**Error handling:** Expected failures return `{ error: <string> }` (control flow); E6-1's `buildInitialState` throws `Error` for construction faults. This split is deliberate and defensible — not a lang-review #10 "throw a string" violation (nothing is thrown here). Verified `payload?.` / `payload ?? {}` guards prevent crashes on missing payloads (`actions.js:27,40,71,112`).

### Rule Compliance (JavaScript lang-review checklist)

Enumerated every applicable rule against both implementation files:
- **#1 Silent error swallowing** — [SILENT] No try/catch, no `.catch`, no `JSON.parse`. No swallowed errors. COMPLIANT.
- **#2 Async pitfalls** — Entirely synchronous; no `async`/`await`/promises/`forEach`-async. N/A.
- **#3 Prototype pollution** — [SEC] Every user-string-as-key (`pawns[suspect]`, `weapons[weapon]`) is allow-list-validated first (`actions.js:41-43,50-51,113-115`). `pawns[seatSuspect[seat]]` and `ledgers[bySeat]` use internal indices. COMPLIANT.
- **#4 Equality/coercion** — [TYPE] All comparisons `===`/`!==` (preflight loose_equality=0). `seat === null`, `refuterSeat === null` explicit. COMPLIANT.
- **#5 DOM security** — Server-only pure functions; no DOM. N/A.
- **#6 Node.js specific** — No `require`/`child_process`/`fs`/`process.env`/`Buffer`. N/A.
- **#7 Regex** — No regex in implementation. N/A.
- **#8 Test quality** — [TEST] 35 tests with meaningful assertions; TEA already fixed the one vacuous probe. Non-vacuous. COMPLIANT.
- **#9 Module/scope** — [SIMPLE] `const`/`let` only (var_usage=0); no circular deps (`actions.js`→`refute.js`→`cards.js`, acyclic); no side-effectful imports. COMPLIANT.
- **#10 Error handling** — Result-type `{error}` for validation; no thrown strings. COMPLIANT.
- **#11 Input validation** — [SEC] All boundary inputs (suspect/weapon/room/card/room-you-are-in/turn/phase) validated in every reducer. COMPLIANT.
- **#12 Dependency/config hygiene** — [DOC] No `console.log`, no secrets, no dep changes. COMPLIANT.

### Observations (tagged)

1. `[VERIFIED]` Reducer purity — every reducer clones before mutating; caller state never touched. Evidence: `actions.js:30,48,76,121,144` all `structuredClone`; TEA purity tests pass. Complies with the reducer-purity invariant.
2. `[VERIFIED]` [SEC][RULE] Prototype-pollution & input validation — user strings validated against allow-lists before key use. Evidence: `actions.js:41-43,50-51,113-115`. Complies lang-review #3, #11.
3. `[VERIFIED]` [EDGE] `findRefuterWalk` left-walk with wrap; eliminated players NOT skipped. Evidence: `refute.js:8-14` iterates all non-suggester seats with no `eliminated` check. Matches AC-1; TEA's wrap + eliminated + 3-seat + multi-card tests pass.
4. `[VERIFIED]` [SEC] Private-ledger disclosure — refute writes only `ledgers[suggestion.bySeat]` and `suggestion.shownCard`; E6-1's `cluePublicView` gates `shownCard` to the suggester. Evidence: `actions.js:77-78`. Matches AC-3.
5. `[VERIFIED]` [EDGE] Elimination/win logic — wrong accusation eliminates but preserves the hand (`actions.js:127`, no hand mutation), `livingCount===1`→last-standing (`128-130`), `nextSeat` skips eliminated (`89-96`). Matches AC-4; TEA's 4-seat-skip + keeps-cards tests pass.
6. `[LOW]` [EDGE][SILENT] `doPass`/`nextSeat` lack a `livingCount===1` guard; `nextSeat` returns `from` if no other seat is living (`actions.js:95,145`). Unreachable given the accuse reducer ends the game at last-standing, but undefended against future elimination paths. Logged as an Improvement finding. Non-blocking.
7. `[LOW]` [EDGE] `applyClueAction` derefs `action.type` before a null-check, so a null/undefined `action` throws `TypeError` rather than returning `{error}` (`actions.js:14,20`). Internal API; E6-5 constructs the action. Logged as an Improvement finding. Non-blocking.
8. `[VERIFIED]` [SIMPLE] No unnecessary complexity — helpers (`nextSeat`/`livingCount`/`endWith`) are minimal and shared by accuse+pass; no dead code (preflight unused_exports=0; exports are test-exercised, wiring is E6-5). Matches the plan exactly.
9. `[VERIFIED]` [DOC] Comments are accurate — `refute.js:1-3` correctly states eliminated players still refute; `actions.js:49,126` comments match behavior. No stale/misleading docs.

### Devil's Advocate

Assume this engine is broken and try to break it. **Malicious actor:** Can a non-seated user act? No — `actorSeat` returns null for an unknown `actorId` → `{error:'not a participant'}` before any branch. Can a player act out of turn? Every reducer's first guard is `seat !== state.currentSeat` (except `refute`, which correctly gates on `refuterSeat` since the refuter is *not* the current seat). Can a player refute with a card they don't hold, or a card not among the three named? Both rejected (`actions.js:73-74`). Can a refuter show a card to leak info to non-suggesters? No — only `ledgers[bySeat]` (the suggester) and `shownCard` (view-gated to suggester) are written. Can a payload poison the prototype? `__proto__`/`constructor` as suspect/weapon/room are not in the allow-lists → rejected before any key assignment; TEA's `__proto__` test asserts `{error}` with no state. **Confused user:** Suggesting the wrong room → `'must suggest the room you are in'`. Entering a room mid-refute → phase guard rejects. Accusing during refute → phase guard rejects. **Stressed state:** Missing `payload` → optional-chaining/`?? {}` guards prevent crashes; only a null `action` *object* throws (observation #7, internal API). **Boundary:** 3-seat vs 4-seat walks both covered; wrap arithmetic (`% n`) verified in both. **Envelope leak:** The reducers never copy `envelope` out; the disclosure seam is E6-1's `cluePublicView`, untouched here. The one thing I could not manufacture into a real (reachable) bug is the `doPass`/`nextSeat` no-living-seat case — it requires an elimination path that doesn't exist in this diff. Downgraded to LOW/Improvement rather than a blocker. Net: no reachable Critical/High defect.

**Wiring note:** This story is engine-only by design (plan Roadmap defers client/`plugin.js`/registration to E6-5). No AC here requires wiring; the "exports only used by tests" observation is expected scope, not dead code.

**Handoff:** To SM (Slartibartfast) for finish-story.