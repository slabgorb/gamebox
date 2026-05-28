---
story_id: E3-4
jira_key: null
epic: E3
workflow: tdd
---
# Story E3-4: Turn engine (applyAction): apply moves, bumps, swap, Sorry!, win + auto-pass

## Story Details
- **ID:** E3-4
- **Jira Key:** (none—standalone project g-1)
- **Workflow:** tdd
- **Stack Parent:** E3-2 (feat/E3-2-legal-move-enumeration)

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-05-28T11:32:26Z
**Round-Trip Count:** 1

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-28T06:50:00Z | 2026-05-28T10:51:14Z | 4h 1m |
| red | 2026-05-28T10:51:14Z | 2026-05-28T10:59:37Z | 8m 23s |
| green | 2026-05-28T10:59:37Z | 2026-05-28T11:05:34Z | 5m 57s |
| spec-check | 2026-05-28T11:05:34Z | 2026-05-28T11:07:03Z | 1m 29s |
| verify | 2026-05-28T11:07:03Z | 2026-05-28T11:10:15Z | 3m 12s |
| review | 2026-05-28T11:10:15Z | 2026-05-28T11:19:54Z | 9m 39s |
| green | 2026-05-28T11:19:54Z | 2026-05-28T11:22:38Z | 2m 44s |
| spec-check | 2026-05-28T11:22:38Z | 2026-05-28T11:23:13Z | 35s |
| verify | 2026-05-28T11:23:13Z | 2026-05-28T11:24:00Z | 47s |
| review | 2026-05-28T11:24:00Z | 2026-05-28T11:31:33Z | 7m 33s |
| spec-reconcile | 2026-05-28T11:31:33Z | 2026-05-28T11:32:26Z | 53s |
| finish | 2026-05-28T11:32:26Z | - | - |

## Sm Assessment

**Routing decision:** E3-4 selected as next work — the only story in either epic with satisfied dependencies. Its build-order predecessors (E3-1 skeleton, E3-2 legal-move enumeration, E3-3 slide/bump primitives) are all merged. E2 (Risk LLM) remains parked behind the E2-2 GO/NO-GO branch decision.

**Readiness:** Story context is freshly prepared — the prior commit inherited E3-3's three deferred review findings (mover-exclusion contract, input-trust boundary, wrap-around note) directly into this session's Story Context. TEA must encode findings #1 and #2 as explicit RED tests:
- Mover-exclusion: mover landing on a foreign-slide start ends at `finalIndex` and is absent from its own bump list.
- Trust boundary: `applySorryAction` validates actor/turn/move-legality *before* calling `resolveLanding`; no defensive guards pushed into the pure helper.

Finding #3 (wrap-around geometry) is informational — out of scope unless geometry gains a wrapping slide.

**Scope guardrails:** This is the execution layer only (`applySorryAction` in `plugins/sorry/server/actions.js`) — move application, slide/bump resolution wiring, win detection, turn advance with auto-pass, and `activeUserId` consistency for the orchestrator gate. No AI adapter (E3-5), no client UI (E3-6).

**Handoff:** → Hamlet (TEA) for RED phase. Write the failing tests first.

## TEA Assessment

**Tests Required:** Yes
**Reason:** Core engine logic with 9 ACs and 2 inherited review contracts — full TDD coverage warranted.

**Test Files:**
- `test/sorry/actions.test.js` — 14 tests covering `applySorryAction` contract, AC1–AC9, and inherited E3-3 findings #1/#2.

**Tests Written:** 14 tests covering 9 ACs + 2 inherited contracts + 1 return-shape contract + 1 unknown-action guard.
**Status:** RED — 12 of 14 failing against the `{ error: 'not implemented' }` stub. The 2 passing tests (`applySorryAction is a function`; `unknown action type rejected`) pass because the stub trivially satisfies them; both remain valid regression guards once implemented. Verified by testing-runner: zero precondition failures, all 6 sibling sorry suites stay green (69 passing).

**Coverage map:**
- AC1 illegal moveId → `'move is not legal'`, no state, no mutation
- AC2 unknown participant → `'unknown participant'`; out-of-turn → `'not your turn'`; both no-mutation
- AC3 out → `zone:'track'`, `index:START_EXIT`, turn switches, card discarded, opponent draws, activeUserId mirrors
- AC4 card 2 → same player, draws again, activeUserId unchanged
- AC5 landing on opponent → bumped to `start`/index 0; mover takes the square
- AC6 sorry → target opponent to Start, own pawn placed on target square
- AC7 win → `ended:true`, `scoreDelta:{[winner]:1}`, `winner:'a'`, activeUserId=winner, `summary.kind:'win'`
- AC8 auto-pass → unusable drawn card discarded, turn bounces, resolved player faces next card
- AC9 invariant → `activeUserId === sides[currentPlayer]` on ordinary returns
- finding#1 mover-exclusion → mover slides to `finalIndex`, never self-bumps; genuine swept victim still bumped
- finding#2 trust boundary → unknown action type rejected cleanly, no mutation (validation precedes slide resolution)

### Rule Coverage

| Rule (JS lang-review) | Test(s) | Status |
|------------------------|---------|--------|
| #4 equality / coercion | AC4 (`card === 2` branch), AC3/AC5 exact-index asserts | failing |
| #8 test quality (no vacuous asserts) | self-check across all 14 tests | pass |
| #10 error handling (clean `{ error }` rejections) | AC1, AC2 (×2), finding#2 | failing/guard |
| #11 input validation / trust boundary | finding#2, AC2 unknown-participant | failing/guard |

**Rules checked:** 4 of 13 lang-review checks are applicable to this pure server-logic module (RED phase). N/A here: #2 async, #3 prototype pollution, #5 DOM, #6 Node shell, #7 regex, #9 module scope, #12 deps, #13 fix-regressions — these are Dev-phase implementation concerns, not RED test targets.
**Self-check:** 0 vacuous assertions found.

### Notes for Dev (Puck)
- **The geometry conflict is the trap** (see Design Deviations + Delivery Findings): `out` must place the pawn at `START_EXIT[side]` and must NOT run `resolveLanding` — square 4 is a b-owned slide start that would otherwise carry side a forward to 9.
- **Mover-exclusion (finding #1):** resolve the landing with the mover still at its origin (or removed from the pawn map), then place the mover at `finalIndex` *after*. Do not leave the mover on a swept square when calling `resolveLanding`.
- **Trust boundary (finding #2):** validate actor / turn / move-legality *before* touching `resolveLanding`. Keep defensive guards out of the pure helper.
- **`activeUserId` (AC9):** mirror `sides[currentPlayer]` on every ordinary return; keep it on the winner for a win. Bot wake-ups deadlock silently if this drifts.

**Handoff:** To Puck (Dev) for GREEN implementation.

## Architect Assessment (spec-check)

**Spec Alignment:** Aligned (one Major deviation already resolved per higher-authority AC; two minor extras)
**Mismatches Found:** 3 — none requiring hand-back

- **`out` placement skips `resolveLanding`** (Ambiguous spec — Behavioral, Major)
  - Spec: Scope says "Run `resolveLanding` for every track landing"; AC-3 says the out pawn ends at "`index: START_EXIT[side]`". These collide because `START_EXIT.a === 4` is a b-owned slide start that `resolveLanding` would fire.
  - Code: `out` places the pawn at `START_EXIT[side]` with a final-square bump but no slide resolution — matching AC-3.
  - Recommendation: **A — Update spec.** AC-3 is the higher-authority source and the implementation honors it; the scope sentence should be amended to state explicitly that `out` is a placement, not a sliding landing. Already logged by TEA and Dev. **Caveat for Reviewer/geometry owner:** confirm that square 4 being both `START_EXIT.a` and a `SLIDES.b` start is intended geometry — if the *intended* rule were "out slides," AC-3 itself would be wrong. The code cannot resolve that; it correctly defers to the authoritative AC and surfaces the question rather than silently overriding it.

- **`out` bumps an occupant on the start-exit square** (Extra in code — Behavioral, Minor)
  - Spec: No AC covers an occupied start-exit square.
  - Code: An opponent track pawn sitting on `START_EXIT[side]` is bumped to Start when the out pawn is placed.
  - Recommendation: **A — Update spec / accept.** This is correct Sorry! behavior (landing on an occupant bumps it) and is consistent with `resolveLanding`'s final-square rule. Non-blocking.

- **`back` / `split` / `swap` implemented without dedicated tests** (Extra in code vs test suite — Behavioral, Minor)
  - Spec: Story scope lists all six move kinds as in-scope; the RED suite exercises only `out`, `forward`, `sorry`.
  - Code: All six kinds implemented; `swap` performs post-swap slide resolution and `split` threads two legs sequentially.
  - Recommendation: **D — Defer.** Dev already filed this as a Gap finding. TEA's verify phase or a follow-up should add coverage for swap's post-swap slide and the 7-split's two-leg bump interactions. Not blocking — the kinds are in-scope and behave reasonably; they are simply unverified by tests.

**Decision:** Proceed to review (verify phase next). No hand-back to Dev — every mismatch is either resolved per the higher-authority AC or a non-blocking, already-logged follow-up.

**Re-check (after rework round 1):** The rework threaded the host-supplied `rng` through `applySorryAction` → `advanceTurn` → `draw()` and strengthened four test assertions. Neither change alters any AC behavior — card draws remain server-authoritative inside `advanceTurn`; only the RNG *source* changed from a dead `state.rng`/`Math.random` fallback to the seeded generator the host passes. This *improves* alignment with the cross-plugin seeded-RNG contract and resolves the Reviewer's HIGH finding. No new mismatches; spec alignment still **Aligned**. Proceed to verify.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `plugins/sorry/server/actions.js` — replaced the E3-1 stub with the full `applySorryAction` turn engine (validation, all six move kinds, slide/bump resolution with mover-exclusion, win detection, `advanceTurn` with auto-pass, `activeUserId` mirroring).

**Tests:** 14/14 passing (GREEN). Full sorry suite 81/81; full repo suite 1039 pass / 1 skip / 0 fail — no regressions. Verified by testing-runner.

**Design notes:**
- **Mover-exclusion (finding #1):** `resolveAndPlace` calls `resolveLanding` with the mover still at its origin, filters the mover out of the bump list, then places it at `finalIndex` — so a mover landing on a foreign slide start slides forward and never self-bumps.
- **Trust boundary (finding #2):** all validation (participant → action type → turn → legality) runs before any move application; rejection paths return `{ error }` with no clone/mutation. `resolveLanding` is never reached for a rejected action.
- **`out` placement (deviation):** placed at `START_EXIT[side]` with a final-square bump but no slide resolution (see Design Deviations).
- **`activeUserId` (AC9):** mirrored to `sides[currentPlayer]` on every ordinary return; held on the winner for a win.
- **Return contract:** mirrors backgammon — `{ state, ended, scoreDelta?, summary }` on success, `{ error }` on rejection.

**Wiring:** `plugin.js` exports `applyAction: applySorryAction` (signature unchanged) — engine is live in the plugin manifest.

**Branch:** `feat/E3-4-turn-engine-apply-action` (pushed)

**Handoff:** To Portia (Reviewer) for code review.

## TEA Assessment (verify)

**Phase:** finish
**Status:** GREEN confirmed (quality-pass: tests PASS; lint/typecheck not configured — skipped)

### Simplify Report

**Teammates:** reuse, quality, efficiency
**Files Analyzed:** 2 (`plugins/sorry/server/actions.js`, `test/sorry/actions.test.js`)

| Teammate | Status | Findings |
|----------|--------|----------|
| simplify-reuse | 3 findings | extract `opponent`/`actorSide` cross-plugin; extract test helpers |
| simplify-quality | 3 findings | draw() try/catch; rng default bypass; unused `lastEvent` |
| simplify-efficiency | clean | none |

**Applied:** 0 high-confidence fixes
**Flagged for Review:** 0
**Noted/Deferred:** 1 (shared test helpers)
**Reverted:** 0

**Triage rationale (all findings declined — technical evaluation, not blind application):**
- **reuse #1/#2 (extract `opponent`/`actorSide` to a shared cross-plugin module) — DISMISSED.** This codebase keeps each plugin self-contained; backgammon deliberately has its *own* `actorSide`. There is no shared-plugin-code pattern to join. Applying would expand E3-4's scope into the backgammon plugin and invent infrastructure for a one-line helper — net-negative per pragmatic-restraint. The "duplication" is intentional encapsulation.
- **reuse #3 (extract `startFour`/`makePawns`/`makeState` to a shared test helper) — DEFERRED.** Legitimate DRY, but would modify `slides.test.js` (outside this story's diff) and `makeState` is unique to `actions.test.js`. ~2 trivial fixtures of shared surface; low value, non-zero risk. Optional follow-up.
- **quality #4 (`draw()` can throw; no try/catch in `advanceTurn`) — DISMISSED (non-blocking).** `deck.js`'s `draw` reshuffles the discard pile when the deck empties; both empty simultaneously is impossible mid-game (45 cards recirculate), and the auto-pass guard caps draws at 8. The throw is unreachable in normal play.
- **quality #5 (`state.rng: undefined` bypasses `draw`'s default) — DISMISSED (false positive).** JS default parameters apply on explicit `undefined`, so `draw({ rng: undefined })` correctly falls back to `Math.random`. The finding is technically incorrect.
- **quality #6 (`lastEvent: null` unused in `makeState`) — DISMISSED.** `makeState` mirrors the real `state.js` shape (which includes `lastEvent`); the fidelity is intentional and harmless.

**Overall:** simplify: clean (no fixes applied; tree identical to Dev's verified GREEN — full repo suite 1039 pass / 1 skip / 0 fail).

**Handoff:** To Portia (Reviewer) for code review.

### Verify (re-pass after rework round 1)

**Status:** GREEN confirmed (quality-pass: tests PASS; lint/typecheck not configured — skipped). Full repo suite 1039 pass / 1 skip / 0 fail.

**Simplify:** No re-fan-out. The rework delta (`git diff 2c16adb..HEAD`) is a strict simplification — `advanceTurn`/`applySorryAction` gained an `rng` parameter, the dead `state.rng` reference was deleted, and four test assertions were tightened. This *removes* complexity rather than adding any; the prior round's full reuse/quality/efficiency fan-out already covered `actions.js` comprehensively and applied nothing. No new simplification surface introduced.

**Overall:** simplify: clean. **Handoff:** To Portia (Reviewer) for re-review.

## Subagent Results (re-review)

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 0 smells; 1039 pass/1 skip/0 fail | N/A |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — covered by Reviewer |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — covered by Reviewer (draw-throw + guard loop) |
| 4 | reviewer-test-analyzer | Yes | findings | 2 | confirmed 0 blocking; 1 deferred (out-bump), 1 dismissed (Low :75) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings |
| 6 | reviewer-type-design | Yes | findings | 2 | rng fix CONFIRMED correct; 2 non-blocking (guard loop, split aliasing) |
| 7 | reviewer-security | Yes | findings | 1 | 1 non-blocking (draw-throw on corrupted state); rng/proto/leak all clean |
| 8 | reviewer-simplifier | Yes | findings | 1 | dismissed (circular stylistic nit on assert form) |
| 9 | reviewer-rule-checker | Yes | clean | 0 | all 13 rules pass; #8 tightened, #10 AC override confirmed |

**All received:** Yes (6 enabled returned, 3 disabled pre-filled)
**Total findings:** 0 blocking; HIGH from round 1 RESOLVED; remainder Medium/Low non-blocking

## Reviewer Assessment (Re-Review)

**Verdict:** APPROVED

**HIGH finding resolved:** `applySorryAction({ state, action, actorId, rng = Math.random })` now threads `rng` into `advanceTurn` and both `draw()` calls (`actions.js:104,109,119,134,162`); the dead `state.rng` is gone. Confirmed correct by [TYPE] and [SEC] and by direct inspection — the host's seeded `rng` (`routes.js:234`) is now consumed, matching buraco/cribbage/risk/rummikub/words. The `Math.random` default is only reached in tests.

**Observations (≥5):**
- **[VERIFIED]** rng threading correct — `actions.js:134` destructures `rng = Math.random` (function ref, not a called value), passed at `:162`, consumed at `:109/:119`. Resolves the round-1 HIGH.
- **[VERIFIED]** test rigor restored — `finding#2` asserts exact `'unknown action: teleport'` (`:367`); AC8 discard checks use `assert.equal(..., true)`; contract test checks `pawns`/`ended===false`/`summary.kind`; `finding#1` redundant assert replaced with a mover-identity check. [RULE] #8 now clean.
- **[SEC][MEDIUM, non-blocking]** `draw()` throws `'sorry: no cards left to draw'` if deck+discard are both empty (`deck.js:23`), uncaught in `advanceTurn` (`actions.js:162`). Unreachable in normal play — 45 cards always recirculate (discard reshuffles into deck), and only one `drawnCard` is ever in flight — so deck+discard cannot both empty during a real game. Reachable only via a corrupted/hand-crafted state, where the route layer surfaces a 500 (not a silent swallow). Hardening opportunity, not a defect in scope.
- **[TYPE][LOW, non-blocking]** 8-iteration auto-pass guard (`:114`) commits silently if no legal move appears in 8 draws — practically unreachable (five 1s + four 2s guarantee a Start pawn can always exit). Worth a future stalemate signal.
- **[TYPE][LOW, non-blocking]** `split` case aliases `state.pawns` before the first clone (`:75`); safe today because `applyLeg` always clones before writing. A local `clonePawns` would make the no-mutation invariant self-evident.
- **[TEST][MEDIUM, deferred]** out-bump path and `back`/`split`/`swap` move kinds remain without dedicated tests — already filed Gap; recommend a follow-up, not blocking (not part of the story's required test set).
- **[SIMPLE][dismissed]** `assert.equal(x.includes(y), true)` vs `assert.ok(x.includes(y))` — circular stylistic preference; both are correct and non-vacuous.
- **[DOC]** disabled — no doc analysis; comments in `actions.js` read accurately against the code (spot-checked the `out`/mover-exclusion comments).

**Data flow traced:** untrusted `actorId`/`action.payload.moveId` → `actorSide` identity check + `legalMoves().find()` equality → only a server-generated move object proceeds; rejection paths return `{ error }` before any `clonePawns`, so no mutation and no injection surface. Safe.

**Devil's Advocate (re-review):** The fix could be cosmetic — does threading `rng` actually change anything, or did Puck just rename a variable to silence the reviewer? Inspection says it is real: the parameter is destructured from the args the host genuinely passes (`routes.js:234`), the dead `state.rng` is deleted, and both `draw()` sites consume the live `rng`; a test passing a seeded `rng` would now see deterministic draws where before it could not. Could the fix have *introduced* a regression? The only behavioral change is the RNG *source*; all 14 tests plus the full 1039-test suite stay green, and the win/auto-pass/bump paths are untouched. The sharpest remaining attack is the corrupted-state `draw()` throw — a hostile caller feeding a hand-built state with an empty deck and empty discard would get a 500 instead of a clean `{ error }`. But that state is unreachable through the legal action surface (the engine owns deck/discard; the caller only supplies `actorId` + `moveId`), and even when forced, the failure is loud (500 + route catch), not silent data corruption. The untested swap-onto-foreign-slide path is the place a future refactor could silently break a rule, which is exactly why it is flagged for follow-up coverage rather than waved away. None of this rises to blocking: the contract violation that justified the round-1 rejection is genuinely gone, and what remains is hardening and coverage debt that does not threaten correctness of the shipped behavior. Approve.

**Dispatch tags present:** [EDGE] (disabled), [SILENT] (disabled — covered: draw-throw + guard loop), [TEST], [DOC] (disabled), [TYPE], [SEC], [SIMPLE], [RULE].

**Handoff:** To Oberon (Architect) for spec-reconcile, then Prospero (SM) for finish.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 0 smells; 1039 pass/1 skip/0 fail | N/A |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — domain covered by Reviewer directly |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — domain covered by Reviewer directly (rng fallback + auto-pass loop) |
| 4 | reviewer-test-analyzer | Yes | findings | 10 | confirmed 4, deferred 3, dismissed 3 |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings |
| 6 | reviewer-type-design | Yes | findings | 4 | confirmed 1 (HIGH), dismissed 3 |
| 7 | reviewer-security | Yes | findings | 3 | confirmed 0, dismissed 3 (with rationale) |
| 8 | reviewer-simplifier | Yes | findings | 5 | confirmed 0, dismissed 5 (style/non-blocking) |
| 9 | reviewer-rule-checker | Yes | findings | 5 | confirmed 4 (test #8), dismissed 1 (#10 per guardrail) |

**All received:** Yes (6 enabled returned, 3 disabled pre-filled)
**Total findings:** 1 confirmed HIGH (blocking), 7 confirmed non-blocking (Medium/Low), 12 dismissed/deferred (with rationale)

### Rule Compliance (JS lang-review checklist — exhaustive)

| Rule | Verdict | Evidence |
|------|---------|----------|
| #1 silent error swallowing | 1 note | `applyChosenMove` default→null surfaced at :145 (compliant); `advanceTurn` 8-iter guard commits silently if no legal move (Low, :114) |
| #2 async pitfalls | PASS | module is fully synchronous — no async/await/Promise |
| #3 prototype pollution | PASS (note) | `{ [winnerUserId]:1 }` (:159) uses server-issued userId, identical to backgammon scoreDelta — trusted, no new surface |
| #4 equality/coercion | PASS | all `===`/`!==`; `playedCard === 2` strict, `'sorry'` never coerces |
| #5 DOM security | N/A | server-side module |
| #6 Node.js specific | PASS | ESM imports only; no require/exec/fs/env/Buffer |
| #7 regex safety | N/A | no regex |
| #8 test quality | 4 VIOLATIONS | vacuous `assert.ok` at test :75, :285, :286, :367 (Low/Medium, non-blocking) |
| #9 module/scope | PASS | const/let correct; no `var`; leaf consumer, no circular deps |
| #10 error handling | DISMISSED | `{ error: <string> }` mandated by story Technical Guardrails ("Mirror backgammon… `{ error }` on rejection") — valid AC override of the thrown-string rule |
| #11 input validation | PASS | actorId/action.type/moveId all validated before use at trust boundary (:135-142) |
| #12 dependency hygiene | PASS | no console.log, no secrets, no package.json change |
| #13 fix regressions | N/A | net-new implementation, not a fix diff |

### Observations (≥5)

- **[TYPE][HIGH]** `advanceTurn` draws via `state.rng` (`plugins/sorry/server/actions.js:109,119`), but `buildInitialState` never writes `rng` into state (`state.js:20-30` keys exclude it) — so `state.rng` is always `undefined` and `draw()` silently falls back to `Math.random`, ignoring the seeded `rng` the host passes to `applyAction` (`src/server/routes.js:234`). Every other multiplayer plugin destructures `rng` from the action args (`buraco/cribbage/risk/rummikub/words actions.js`). This is a dead-field reference masked by a silent fallback and a divergence from a system-wide contract. **BLOCKING.**
- **[TEST][MEDIUM]** `finding#2` test asserts `assert.ok(result.error)` (`test :367`) — vacuous; passes for any truthy value. AC1/AC2 use exact-message `assert.equal`. Corroborated by [RULE] #8. Should assert `assert.equal(result.error, 'unknown action: teleport')`.
- **[TEST][MEDIUM]** `back`, `split` (7-split), `swap` (11-swap) move kinds are implemented but have zero dedicated tests; the swap's post-swap slide path (opponent pre-placed at mover origin, possibly inside the swept range) is genuinely untested. In-scope code, but not part of the story's required test set — already deferred by Dev/Architect.
- **[TEST][LOW]** redundant `assert.notEqual(mover.zone,'start')` after `assert.equal(mover.zone,'track')` (`test :348`) — tautological.
- **[RULE][LOW]** truthy `assert.ok` on object/boolean at `test :75, :285, :286` — mechanical #8 matches; prefer explicit value/`true` assertions.
- **[SEC][LOW]** reflected `action.type` in `unknown action: ${action?.type}` (`:137`) — benign in JSON context, identical to backgammon's pattern; harden only if error strings are ever rendered as HTML. Non-blocking.
- **[SEC][LOW]** 8-iteration auto-pass guard (`:114`) commits silently if neither player can move for 8 draws — practically unreachable (five 1s + four 2s always free a Start pawn), but a silent fallback worth a future stalemate signal. Non-blocking.
- **[SIMPLE][LOW]** draw-loop duplication, swap/sorry double-clone, `out` nested loop, `applyChosenMove(state)` over-broad param, `placeOffTrack` thin wrapper — all clarity/micro-perf; current code is correct and readable. Non-blocking.
- **[VERIFIED]** Mover-exclusion (inherited finding #1) — `resolveAndPlace` skips the mover in the bump loop (`:26-28`) then places it at `finalIndex` (`:30`); `finding#1` test passes (mover→43, never Start). Complies with the E3-3 inherited contract.
- **[VERIFIED]** Trust boundary (inherited finding #2) — participant/type/turn/legality checks (`:135-142`) all precede `applyChosenMove`/`resolveLanding`; rejection paths return before any `clonePawns`. AC1/AC2 `deepEqual` confirm no mutation.
- **[VERIFIED]** `activeUserId` invariant (AC9) — set to `next.sides[next.currentPlayer]` on every ordinary return (`:163`) and to the winner on a win (`:157`). AC9 + AC7 confirm.

### Devil's Advocate

Assume this engine is broken. The most damning thread is the RNG one: the author *believed* they were drawing from a seeded generator — the code reads `state.rng` as if it were a real field — but it is phantom. The game has been shipping its entire card sequence off `Math.random`, and nobody noticed because random-looking output is exactly what a broken RNG and a working RNG both produce. That is the worst kind of bug: invisible, plausible, and only exposed the day someone tries to reproduce a game from a seed for an audit, a bug report, or a bot-training corpus (which is literally this repo's Sprint-2 theme). On that day, Sorry! alone will be irreproducible, and the investigation will burn hours before someone greps `state.rng` and finds it was never set. A malicious or confused caller is a lesser worry — validation is genuinely tight: `actorId` is checked against `sides`, `action.type` must equal `'move'`, and `moveId` can only select a server-generated move, so no move object can be forged and no rejection mutates state. The computed-key `scoreDelta` could in theory pollute the prototype, but `userId` is server-issued, not caller-supplied, and the identical pattern lives in backgammon — so that is a codebase-wide question, not an E3-4 regression. The thinner ice is coverage: `swap`, `split`, and `back` are live code with no tests. A confused 11-swap onto a foreign slide start runs `resolveAndPlace` against a map where the opponent already sits at the mover's origin — if that origin falls inside the swept range, the opponent could be bumped a second time, unintentionally. No test pins that behavior, so a future refactor could silently invert it. None of these except the RNG defect rises to blocking, but the RNG defect is enough: it is a real, fixable divergence from a contract every sibling plugin honors, and "it still works because Math.random" is precisely the rationalization an adversarial review exists to reject.

## Reviewer Assessment

**Verdict:** REJECTED

| Severity | Issue | Location | Fix Required |
|----------|-------|----------|--------------|
| [HIGH] | `advanceTurn` draws with `state.rng` — a field never set on state — silently falling back to `Math.random` and ignoring the seeded `rng` the host passes to `applyAction`. Diverges from buraco/cribbage/risk/rummikub/words, which all thread `rng` from the action args. | `plugins/sorry/server/actions.js:134` (signature), `:104` (advanceTurn param), `:109,:119` (draw calls) | Destructure `rng` in `applySorryAction({ state, action, actorId, rng })`, pass it into `advanceTurn(state, pawnsAfter, playedCard, rng)`, and use that `rng` in both `draw(...)` calls. Remove the dead `state.rng` reference. |

**Non-blocking (fix opportunistically alongside the HIGH, or defer):**
- [TEST] `test :367` — replace `assert.ok(result.error)` with `assert.equal(result.error, 'unknown action: teleport')` to match AC1/AC2 rigor.
- [TEST] `test :75/:285/:286` — prefer explicit assertions over truthy `assert.ok`; remove redundant `:348`.
- [TEST] Add coverage for `back`/`split`/`swap` (esp. swap-onto-foreign-slide-start) — already filed as a deferred Gap.

**Dispatch tags present:** [EDGE] (disabled — covered by Reviewer), [SILENT] (disabled — covered by Reviewer: rng fallback + auto-pass loop), [TEST], [DOC] (disabled), [TYPE], [SEC], [SIMPLE], [RULE].

**Handoff:** Back to Puck (Dev) for the HIGH fix (green rework).

## Dev Assessment (rework — round 1)

**Implementation Complete:** Yes
**Review finding addressed:** HIGH (seeded-RNG divergence) — RESOLVED.

**Files Changed:**
- `plugins/sorry/server/actions.js` — `applySorryAction` now destructures `rng = Math.random` from the action args and threads it into `advanceTurn(state, pawnsAfter, playedCard, rng)`, which uses it in both `draw(...)` calls. The dead `state.rng` reference is gone. This matches the cross-plugin contract (buraco/cribbage/risk/rummikub/words) and consumes the seeded `rng` the host passes at `src/server/routes.js:234`.
- `test/sorry/actions.test.js` — strengthened the flagged assertions: contract test now checks `result.state.pawns`, `ended === false`, and `summary.kind === 'out'`; AC8 uses `assert.equal(..., true)` for discard membership; `finding#2` asserts the exact message `'unknown action: teleport'`; the redundant `notEqual(zone,'start')` is replaced with a mover-identity check (`mover.id === 0`).

**Tests:** 14/14 passing (GREEN). Full repo suite 1039 pass / 1 skip / 0 fail — no regressions. Verified by testing-runner.

**Not addressed (deferred, per Reviewer "or defer"):** `back`/`split`/`swap` dedicated test coverage — remains the previously-filed Gap; out of this story's required test set.

**Branch:** `feat/E3-4-turn-engine-apply-action` (pushed — commit 6185b21)

**Handoff:** To Portia (Reviewer) for re-review.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Conflict** (non-blocking): AC-3 fixes the out pawn at `index: START_EXIT[side]`, but the scope line "Run `resolveLanding` for every track landing" would carry it elsewhere — `START_EXIT.a === 4` and `SLIDES.b` owns a slide at start `4`, so resolving the landing on an `a` out-move would slide the pawn to `(4+5)%60 = 9`. Affects `plugins/sorry/server/actions.js` (the `out` branch must place the pawn at `START_EXIT[side]` WITHOUT running slide resolution). *Found by TEA during test design.*

### Reviewer (code review)
- **Improvement** (non-blocking): `draw()` throws `'sorry: no cards left to draw'` when deck+discard are both empty; `advanceTurn` does not catch it. Affects `plugins/sorry/server/actions.js:162` (wrap `advanceTurn` in try/catch and return `{ error }`, or guarantee the path is unreachable). Practically unreachable in normal play — flagged as future hardening. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): The 8-iteration auto-pass guard in `advanceTurn` commits silently if no legal move is found; consider surfacing a stalemate signal. Affects `plugins/sorry/server/actions.js:114`. *Found by Reviewer during code review.*
- **Conflict** (blocking → RESOLVED in rework): `applySorryAction` ignored the host-supplied seeded `rng` (passed at `src/server/routes.js:234`) and reads a non-existent `state.rng`, silently using `Math.random` for all `advanceTurn`/auto-pass draws. Affects `plugins/sorry/server/actions.js` (destructure `rng` in the signature and thread it to both `draw()` calls; drop the dead `state.rng`). Diverges from buraco/cribbage/risk/rummikub/words. *Found by Reviewer during code review.*

### TEA (test verification)
- **Improvement** (non-blocking): `startFour`/`makePawns` test fixtures are duplicated between `test/sorry/actions.test.js` and `test/sorry/slides.test.js`. Affects both test files (extract to a shared `test/sorry/` helper module in a future cleanup — declined here to avoid touching an out-of-story file). *Found by TEA during test verification.*

### Dev (implementation — rework round 1)
- **Resolved**: The HIGH seeded-RNG finding is fixed — `rng` is now threaded from the host through `applySorryAction` into the `draw()` calls; the dead `state.rng` reference is removed. No new upstream findings from the rework.

### Dev (implementation)
- **Gap** (non-blocking): The `back`, `split` (7-split), and `swap` (11-swap) move kinds are implemented per the story scope but have NO dedicated test coverage — the RED suite exercises only `out`, `forward`, and `sorry`. Affects `test/sorry/actions.test.js` (a follow-up should add tests for back/split/swap, especially the swap's post-swap slide resolution and the 7-split's two-leg bump interactions). *Found by Dev during implementation.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Out-move tested as a placement that does NOT trigger slide resolution**
  - Spec source: context-story-E3-4.md — Scope Boundaries vs AC-3
  - Spec text: AC-3 — "After applying a legal `out` move (card 1 or 2), the moved pawn has `zone: 'track'` and `index: START_EXIT[side]`"; Scope — "Run `resolveLanding` for every track landing"
  - Implementation: The AC3 test asserts the out pawn rests at `index === START_EXIT.a` (4) and is NOT carried to square 9, even though square 4 is a foreign (b-owned) slide start that `resolveLanding` would trigger.
  - Rationale: AC-3 is the more specific, higher-authority source (story context AC > general scope sentence). Resolving the conflict in AC-3's favor means `out` is a placement, not a slide-triggering landing.
  - Severity: minor
  - Forward impact: Dev must special-case the `out` branch to skip `resolveLanding` (or exempt the start-exit square); Reviewer should confirm the chosen resolution. E3-6 board rendering will assume the pawn rests at `START_EXIT` after an out move.

### Dev (implementation)
- **`out` move bumps an occupant but does not run `resolveLanding`**
  - Spec source: context-story-E3-4.md — Scope Boundaries vs AC-3 (inherited from TEA's test-design deviation)
  - Spec text: Scope — "Run `resolveLanding` for every track landing"; AC-3 — out pawn ends at "`index: START_EXIT[side]`"
  - Implementation: The `out` case in `applyChosenMove` places the pawn at `START_EXIT[side]` and bumps any opponent track pawn already on that square, but does NOT call `resolveLanding` — so the b-owned slide at square 4 does not fire for an `a` out-move.
  - Rationale: AC-3 (higher authority) fixes the pawn at the start-exit square; running `resolveLanding` would slide it to 9. The final-square bump is retained so the rule "landing on an occupant bumps it" still holds for out placements.
  - Severity: minor
  - Forward impact: Reviewer should confirm this resolution is the intended rule. E3-6 board rendering assumes the pawn rests at `START_EXIT` after an out move.

### Reviewer (audit)
- **TEA deviation — "Out-move tested as a placement that does NOT trigger slide resolution"** → ✓ ACCEPTED by Reviewer: sound. AC-3 ("`index: START_EXIT[side]`") is higher authority than the general scope sentence; pinning the out pawn at the start-exit square is the correct reading. The geometry coincidence (square 4 = `START_EXIT.a` = `SLIDES.b` start) is a genuine question for the geometry owner, but resolving it in AC-3's favor and surfacing the question is the right call — not silently overriding the AC.
- **Dev deviation — "`out` move bumps an occupant but does not run `resolveLanding`"** → ✓ ACCEPTED by Reviewer: sound and consistent with `resolveLanding`'s final-square bump rule. Retaining the occupant bump while suppressing the slide is correct Sorry! behavior under the AC-3 reading.
- **UNDOCUMENTED divergence (seeded-RNG contract):** Every other multiplayer plugin threads the host-supplied `rng` from `applyAction`'s args into its draw/shuffle; `applySorryAction` instead reads a non-existent `state.rng` and falls back to `Math.random`. This divergence from the cross-plugin contract was not logged by TEA or Dev. Severity: **High** (see Reviewer Assessment — blocking). Must be fixed, not merely documented. → ✓ RESOLVED in rework round 1 (commit 6185b21): `rng` is now threaded from the args; the divergence is closed and the implementation matches the cross-plugin contract.

### Architect (reconcile)
- **Verification of existing entries:** The TEA (test design) and Dev (implementation) deviations on `out`-placement-without-slide are accurate — spec sources (`context-story-E3-4.md` Scope Boundaries vs AC-3) exist and are quoted correctly, the implementation descriptions match `plugins/sorry/server/actions.js` (the `out` case places at `START_EXIT[side]` with a final-square bump, no `resolveLanding`), and the forward-impact notes (E3-6 board rendering) are sound. All six fields present on each. No corrections needed.
- **Seeded-RNG contract divergence (recorded for audit; resolved during this story):**
  - Spec source: cross-plugin contract — `src/server/routes.js:234` (`plugin.applyAction({ ..., rng: makeRng(Date.now()) })`) and the convention in `plugins/{buraco,cribbage,risk,rummikub,words}/server/actions.js`.
  - Spec text: each sibling plugin destructures `rng` in its action entrypoint, e.g. `export function applyCribbageAction({ state, action, actorId, rng })`, and threads it into its draw/shuffle calls; the host supplies the seeded generator at the call site.
  - Implementation: the original E3-4 implementation read a non-existent `state.rng` (never set by `buildInitialState`) and fell back to `Math.random` for all `advanceTurn`/auto-pass draws, ignoring the host-supplied seeded `rng`.
  - Rationale: oversight — `state.rng` looked like a seeded source but was always `undefined`; the cross-plugin pattern was not followed.
  - Severity: major (resolved before merge — Reviewer round-1 HIGH; fixed in commit 6185b21 by destructuring `rng` in the signature and threading it to both `draw()` calls).
  - Forward impact: none remaining — E3-4 now matches the cross-plugin seeded-RNG contract; no downstream story inherits the defect.
- **AC deferrals:** None. All nine ACs (AC1–AC9) plus both inherited E3-3 contracts are implemented and tested. The `back`/`split`/`swap` items are untested in-scope *code* (a coverage Gap filed for follow-up), not deferred ACs.

---

## Story Context

E3-4 is the core execution layer of the Sorry! plugin. It wires together:
- E3-1: plugin skeleton, deck, geometry, initial state
- E3-2: legal-move enumeration for all card types
- E3-3: slide traversal and bumping resolution primitives

E3-4 replaces the stub in `plugins/sorry/server/actions.js` with the full `applySorryAction` implementation, which:
- Validates actor identity, turn ownership, and move legality
- Applies all move kinds: `out`, `forward`, `back`, `split` (7-split), `swap` (11-swap), `sorry` (bump + place)
- Runs `resolveLanding` to handle slide resolution and bumps
- Detects win conditions (all four pawns in home zone)
- Advances turn with auto-pass logic for players with no legal move
- Maintains `activeUserId` consistency for orchestrator gate logic

See `sprint/context/context-story-E3-4.md` for full business context, technical guardrails, scope boundaries, and acceptance criteria.

### Inherited from E3-3 Review

Three findings deferred from E3-3's code review (APPROVED):

1. **Mover-exclusion is a contract E3-4 must uphold (silent-bug risk).**
   `resolveLanding({ pawns, side, landingIndex })` does not know which pawn is moving—it bumps *every* `zone:'track'` pawn on a swept square. E3-4 must ensure the mover is not present in `pawns` at a swept square when `resolveLanding` is called. Resolve using a pawn map where the mover is still at origin, then place mover at `finalIndex` *after*. Add an explicit test: mover landing on a foreign-slide start must end at `finalIndex` and must *not* appear in its own bump list.

2. **`resolveLanding` does no input validation—E3-4 owns the trust boundary.**
   An out-of-enum `side` or non-array `pawns.a`/`pawns.b` can cause silent errors. `applySorryAction` already validates actor/turn/move-legality before slide resolution, so invalid inputs should be impossible—keep it that way. Validate before resolving. Do not push defensive guards into the pure helper; the boundary belongs at the caller.

3. **Wrap-around (`% TRACK_LEN`) is untested at geometry level (informational).**
   No current slide crosses index 59, so modular arithmetic is structurally unexercised. Not an E3-4 concern unless geometry gains a wrapping slide; noted so assumption is visible.

**Reference:** Full detail in `sprint/archive/E3-3-session.md`.