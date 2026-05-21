---
story_id: E2-8
jira_key: null
epic: E2
workflow: tdd
---
# Story E2-8: Risk cards engine mechanics (deck, award, trade-in, private hands)

## Story Details
- **ID:** E2-8
- **Jira Key:** null (not yet created)
- **Workflow:** tdd
- **Stack Parent:** none (E2-8 is entry point of critical path)

## Acceptance Criteria

1. 44-card deck built (42 territory cards typed Infantry/Cavalry/Artillery round-robin + 2 wild), shuffled deterministically per game seed
2. A card is awarded at end of turn only when the player captured >=1 territory that turn; no card otherwise
3. Trade-in accepts the three valid set shapes (3 same, 3 distinct, 2+wild) and rejects invalid sets via validate.js
4. Trade-in grants escalating bonus armies per the canonical sequence (4,6,8,10,12,15,+5...) tracked by tradeInCount
5. A traded set grants +2 armies placed on one owned territory matching a card in the set
6. Player holding >=5 cards at reinforcement start MUST trade before deploying (forced trade-in enforced)
7. view.js exposes own hand fully but only opponent card COUNT, never identities
8. reinforcementFor includes traded bonus armies; deck reshuffles from discard when exhausted

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-05-21T17:38:58Z
**Round-Trip Count:** 1

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-21T16:17:51Z | 2026-05-21T16:19:10Z | 1m 19s |
| red | 2026-05-21T16:19:10Z | 2026-05-21T16:52:31Z | 33m 21s |
| green | 2026-05-21T16:52:31Z | 2026-05-21T17:00:40Z | 8m 9s |
| spec-check | 2026-05-21T17:00:40Z | 2026-05-21T17:04:02Z | 3m 22s |
| green | 2026-05-21T17:04:02Z | 2026-05-21T17:06:09Z | 2m 7s |
| spec-check | 2026-05-21T17:06:09Z | 2026-05-21T17:06:46Z | 37s |
| verify | 2026-05-21T17:06:46Z | 2026-05-21T17:10:19Z | 3m 33s |
| review | 2026-05-21T17:10:19Z | 2026-05-21T17:20:00Z | 9m 41s |
| green | 2026-05-21T17:20:00Z | 2026-05-21T17:26:24Z | 6m 24s |
| spec-check | 2026-05-21T17:26:24Z | 2026-05-21T17:26:57Z | 33s |
| verify | 2026-05-21T17:26:57Z | 2026-05-21T17:30:31Z | 3m 34s |
| review | 2026-05-21T17:30:31Z | 2026-05-21T17:37:48Z | 7m 17s |
| spec-reconcile | 2026-05-21T17:37:48Z | 2026-05-21T17:38:58Z | 1m 10s |
| finish | 2026-05-21T17:38:58Z | - | - |

## Sm Assessment

**Setup Complete:** Yes
**Branch:** feat/E2-8-risk-cards-engine (from main)
**Workflow:** tdd (phased) → next phase: red (TEA)

**Story scope:** Implement canonical Risk territory cards in the existing 2-player engine. Entry point of the re-sequenced critical path E2-8 → E2-9 → E2-1 (pilot rerun). 8 ACs cover deck construction, card-award-on-capture, trade-in set validation + escalating bonus, territory-match +2, forced trade at ≥5 cards, private-hand view redaction, and reinforcement integration.

**Implementation surface (for TEA/Dev):**
- `plugins/risk/server/state.js` — add deck, per-player hands, tradeInCount
- `plugins/risk/server/actions.js` — card award at end-of-turn, trade-in action, reinforcementFor() bonus integration
- `plugins/risk/server/validate.js` — trade-in set validator (3-same / 3-distinct / 2+wild)
- `plugins/risk/server/view.js` — redact opponent card identities (count only)
- `plugins/risk/server/map.js` — 42 territory names → 42 territory cards
- `src/clients/shared/contracts/risk.ts` — add card-related state fields
- Tests: `risk-state.test.js`, `risk-actions-*.test.js`, `risk-validate.test.js`, `risk-full-game.test.js`

**Watch-out (from PM):** This story invalidates the 46 cardless pilot games in `data/risk-corpus/pilot/` — they will be discarded when E2-1 reruns. Not this story's concern, but noted for downstream awareness.

**Handoff:** To TEA for RED phase — write failing tests covering all 8 ACs.

## TEA Assessment

**Tests Required:** Yes
**Reason:** Engine feature with 8 ACs — full TDD.

**Test Files:**
- `test/risk-cards-deck.test.js` — AC1: 44-card deck composition (42 territory + 2 wild), one card per map territory, three troop types, wilds carry no territory, deterministic shuffle, empty starting hands, tradeInCount 0.
- `test/risk-cards-award.test.js` — AC2: card awarded only on a capturing turn (and the negative control); AC8: empty deck reshuffles discard to satisfy an award.
- `test/risk-cards-trade-in.test.js` — AC3: set-shape validation (3-same / 3-distinct / 2+wild accepted; two-same+one-diff, wrong size, out-of-range index, wrong player, wrong phase rejected, with no-mutation guards); AC4: escalating bonus 4,6,8,10,12,15 then 20,25; AC5: territory-match +2; AC6: forced trade at ≥5 cards; AC8: bonus lands in reinforcePool.
- `test/risk-cards-view.test.js` — AC7: own hand visible, opponent count only, no raw `hands` leak, spectator masking, board still public.

**Tests Written:** 24 new tests covering all 8 ACs.
**Status:** RED (24 failing, 0 pre-existing regressions — 13/13 prior tests pass).

### Card Contract (pinned by the tests — Dev must implement to match)

- **Card shape:** `{ territory: <mapId>, type: 'infantry'|'cavalry'|'artillery' }` for the 42 territory cards; `{ territory: null, type: 'wild' }` for the 2 wilds.
- **State additions:** `state.deck` (array), `state.hands` (`[ [], [] ]` by player index), `state.discard` (array), `state.tradeInCount` (number, starts 0), plus a per-turn capture marker (Dev's choice of field name).
- **Trade-in action:** `{ type: 'trade-in', payload: { cardIndices: [i, j, k] } }`, legal only in the `reinforce` phase. Removes the 3 cards (to discard), increments `tradeInCount`, adds the escalating bonus to `reinforcePool`, and applies the +2 territory-match if any traded card names an owned territory.
- **Escalating bonus by trade number:** 4, 6, 8, 10, 12, 15, then +5 each (20, 25, …), indexed by `tradeInCount` at trade time.
- **Forced trade:** in `reinforce` with hand length ≥5, a `deploy` is rejected (error matching /trade/i) until a set is traded.
- **View shape:** `riskPublicView` returns `hand` (viewer's own array) and `opponentCardCount` (number); the raw `hands` array must NOT appear on the view object.

### Rule Coverage

| Lang-review rule (javascript.md) | Test(s) | Status |
|------|---------|--------|
| #4 equality / explicit value checks | deck composition asserts exact types/counts, not truthiness | failing |
| #8 test quality (no vacuous assertions) | self-checked; guarded the deck-determinism test against undefined==undefined vacuous pass | n/a |
| #11 input validation (reject bad input, no mutation) | trade-in rejects bad set shapes / out-of-range index / wrong phase / wrong player, with no-mutation guards | mixed (positive cases failing, rejection cases pass by default) |
| info-leak / least-disclosure | private-hand view: no raw `hands` leak, spectator masking | failing |

**Rules checked:** 4 of 13 lang-review rules are directly testable at this engine layer (the rest — DOM/XSS, child_process, regex, deps — are not applicable to a pure rules engine).
**Self-check:** 1 vacuous pass found and fixed (deck-determinism test now guards `Array.isArray(deck) && length===44` before deepEqual).

**Handoff:** To Dev (Puck) for GREEN implementation.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `plugins/risk/server/state.js` — `buildDeck` (44 cards, round-robin types + 2 wild, shuffled after the territory shuffle); initial state gains `deck`, `discard`, `hands`, `tradeInCount`, `capturedThisTurn`.
- `plugins/risk/server/actions.js` — `applyTradeIn` (delegates to `validateTradeIn`, then escalating bonus, territory-match +2, into reinforcePool), forced-trade gate in `applyDeploy`, `capturedThisTurn` set on resolved capture, card award + `drawCard`/reshuffle in `endTurn`.
- `plugins/risk/server/validate.js` — `validateTradeIn(state, playerIdx, cardIndices)` (shape, distinct in-range indices, valid set), matching the sibling validator pattern.
- `plugins/risk/server/view.js` — redacts `hands`/`deck`/`discard`; exposes `hand` + `opponentCardCount`.
- `plugins/risk/server/ai/legal-moves.js` — `findTradeInSet` + a `trade-in` reinforce move; withholds deploy moves when forced (≥5 cards). [E2-9 overlap — see deviations]
- `src/clients/shared/contracts/risk.ts` — `Card`/`CardType`, `hand`/`opponentCardCount` on `RiskView`, `trade-in` action + log kind.

**Tests:** 932/932 passing, 1 skipped (GREEN). Card tests now 28 (added rng-reshuffle determinism, capturedThisTurn-reset, two-wild, deck/discard-absence). `risk-full-game.test.js` and all pre-existing tests pass.
**Branch:** feat/E2-8-risk-cards-engine (pushed)

**Rework (round-trip 1):** Addressed all Reviewer findings — HIGH reshuffle now rng-shuffles (rng threaded through endTurn); rule #8 assert.match; rule #4 explicit comparisons; view strips internal fields; stale comment fixed.

**Handoff:** To Architect (Oberon) for spec-check re-validation.

## Architect Assessment (spec-check)

**Spec Alignment:** Drift detected
**Mismatches Found:** 1 (plus 2 Dev-logged deviations reviewed and accepted)

- **Trade-in set/shape validation lives in `actions.js`, not `validate.js`** (Different behavior — architectural, Minor)
  - Spec: AC-3 — "Trade-in accepts the three valid set shapes ... and rejects invalid sets **via validate.js**". Story context Technical Guardrails repeats "trade-in set validator" under `validate.js`.
  - Code: `isValidSet` and the index/shape/in-range checks are defined inside `applyTradeIn` in `actions.js`. `validate.js` is untouched, while its three siblings (`validateDeploy/validateAttack/validateFortify`) establish the pattern `applyX` → `validateX(...)`.
  - Recommendation: **B (fix code)** — extract `validateTradeIn(state, playerIdx, cardIndices)` into `validate.js` (shape: exactly 3, distinct in-range indices, valid set), and call it from `applyTradeIn`. Keep the bonus/territory-match/discard mutation in `actions.js`. Behavior is already correct and fully tested, so all 24 card tests must stay green after the move. Rationale: AC-3 is explicit, the validator pattern is unambiguous, and E2-9 (cards-aware AI) + E2-10 (UI) will add card validation that should sit beside it. This was not logged as a Dev deviation.

**Accepted (no action):**
- Dev's minimal trade-in enumeration in `legal-moves.js` (Extra in code vs E2-8 scope) — Option A: justified; the feature is otherwise unreachable and the existing full-game test would hang. E2-9 builds on it.
- Dev's redaction of `deck`/`discard` in `view.js` beyond AC-7's literal wording — Option A: security-correct least-disclosure; accepted.

**Decision:** Hand back to Dev (Puck) for the AC-3 validator relocation. All other ACs (1,2,4,5,6,7,8) are aligned and tested.

### Re-check (spec-check, 2nd pass)

**Spec Alignment:** Aligned. Puck extracted `validateTradeIn(state, playerIdx, cardIndices)` into `validate.js` (validate.js:52), and `applyTradeIn` now delegates to it (actions.js:127) — matching the `applyX → validateX` sibling pattern. AC-3 satisfied. All 928 tests green. No remaining mismatches.

**Decision:** Proceed to verify (TEA).

### Re-check (spec-check, 3rd pass — post-review rework)

**Spec Alignment:** Aligned. The rework corrected the Reviewer's HIGH finding: `drawCard` now `shuffle(s.discard, rng ?? Math.random)` (actions.js:158) with `rng` threaded through `endTurn`, satisfying AC-8's "reshuffles." All other changes (assert.match test rigor, rule #4 explicit comparisons, view stripping internal fields, corrected comments) are corrective and introduce no new spec drift. 932 tests green.

**Decision:** Proceed to verify (TEA).

## TEA Assessment (verify)

**Phase:** finish
**Status:** GREEN confirmed (928 passing, 1 skipped; `pf check` PASS — lint/typecheck not configured)

### Simplify Report

**Teammates:** reuse, quality, efficiency
**Files Analyzed:** 6 (5 server files + TS contract)

| Teammate | Status | Findings |
|----------|--------|----------|
| simplify-reuse | 4 findings | shuffle dup (high), clone/board-eval dup (high), ownedCount/ownedIds (med), opponentIdx ternary (med) |
| simplify-quality | 2 findings | contract redaction doc (low), handSize wrapper (low) |
| simplify-efficiency | 2 findings | redundant null-coalescing in findTradeInSet (high), nonWild two-pass (med) |

**Applied (2 high-confidence, in-scope):**
- Replaced the local `shuffleInPlace` with the shared `shuffle()` from `src/shared/cards/deck.js` — byte-identical Fisher-Yates with injected rng, so seeded determinism is preserved (verified: `risk-state.test.js` still green).
- Removed the redundant `(byType[c.type] ?? (byType[c.type] = []))` null-coalescing in `findTradeInSet`; `byType` is pre-seeded with all four card-type keys.

**Declined (out of scope / pre-existing code, not introduced by E2-8):**
- Export `clone()` and dedupe into `board-eval.js` (reuse, high) — `clone()` and `board-eval.js` are pre-existing and outside this story's diff; refactoring them expands scope and risk. Left for a dedicated cleanup.
- `ownedCount`/`ownedIds` dedup (reuse, med) — pre-existing `ownedCount` in actions.js.
- `opponentIdx` ternary repeated 5× (reuse, med) — pre-existing pattern across the engine.

**Noted (low/medium, no change):**
- `nonWild` two-pass map+filter in `findTradeInSet` (efficiency, med) — negligible at hand sizes ≤ ~5; readability is acceptable.
- `handSize()` wrapper (quality, low) — a named helper reads better than the inline optional chain; kept.
- Contract doc for redacted fields (quality, low) — `view.js` already documents the redaction; not duplicated into the contract.

**Overall:** simplify: applied 2 fixes
**Quality Checks:** All passing (no regression after simplify)
**Handoff:** To Reviewer (Portia) for code review.

### Simplify Report (verify, 2nd pass — post-rework)

Re-ran all three simplify teammates on the reworked production files; `pf check` PASS (932 tests green, no regression).

| Teammate | Status | Findings |
|----------|--------|----------|
| simplify-reuse | clean | rework introduced no new duplication; `drawCard → shuffle()` reuse correct |
| simplify-quality | 2 findings | `winner != null` (pre-existing, out of diff), view comment wording (low) |
| simplify-efficiency | 1 high + minors | `rng ?? Math.random` fallback (high), oppIdx ternary (med), handSize/clone/deployCandidates (low) |

**Applied:** 0 (no in-scope high-confidence fix).
**Dismissed (with rationale):**
- [SIMPLE high] Remove `rng ?? Math.random` in `drawCard` — premise is wrong: `risk-cards-award.test.js`'s "empty deck reshuffles" test invokes end-turn with no rng and hits the reshuffle, so removing the fallback throws `undefined is not a function`. The fallback is a deliberate safety net; kept.
**Flagged (no change — medium/low or pre-existing):** oppIdx nested ternary (view.js, my code, cosmetic — medium, not auto-applied); `state.winner != null` loose-equality (pre-existing `syncActiveUser`, not in this story's diff); `handSize`/`clone`/`deployCandidates`/`applyAttack` rng-comment (low, several pre-existing).

**Overall:** simplify: clean (no fixes applied; 1 high-confidence finding dismissed as incorrect)
**Handoff:** To Reviewer (Portia) for code review.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (928 pass, 0 smells) | N/A |
| 2 | reviewer-edge-hunter | Yes | findings | 8 | confirmed 2, dismissed 4, deferred 2 |
| 3 | reviewer-silent-failure-hunter | Yes | findings | 2 | confirmed 0, dismissed 2 |
| 4 | reviewer-test-analyzer | Yes | findings | 9 | confirmed 5, dismissed 2, deferred 2 |
| 5 | reviewer-comment-analyzer | Yes | findings | 4 | confirmed 2, dismissed 0, deferred 2 |
| 6 | reviewer-type-design | Yes | findings | 5 | confirmed 1, dismissed 1, deferred 3 |
| 7 | reviewer-security | Yes | findings | 2 | confirmed 1, dismissed 1 |
| 8 | reviewer-simplifier | Yes | findings | 5 | confirmed 0, deferred 5 (optional polish) |
| 9 | reviewer-rule-checker | Yes | findings | 8 | confirmed 4 (rule #8), downgraded 4 (rules #3/#4, server-keyed) |

**All received:** Yes (9 returned, 8 with findings)
**Total findings:** 1 HIGH + several MEDIUM/LOW confirmed; full triage below.

### Rule Compliance (lang-review/javascript.md, 13 rules)

The rule-checker enumerated 67 instances across the 5 changed `.js` files. Rules #2 (async), #5 (DOM), #6 (Node), #7 (regex), #12 (deps), #13 (fix-regressions) — N/A or 0 violations. #1, #9, #10, #11 — compliant (validators reject before mutation; ESM imports introduce no cycle: state.js→deck.js is terminal; error-string convention followed). Violations confirmed/triaged:

- **#8 test quality (4) — CONFIRMED, cannot dismiss (rule match):** `risk-cards-trade-in.test.js:55,62,68,81` use `assert.ok(r.error)` — passes on *any* truthy error, not the specific rejection. Must use `assert.match` on the message. Corroborated by [TEST].
- **#4 equality/coercion (2) — CONFIRMED, LOW (rule match, downgraded severity):** `legal-moves.js:60` truthy `.length` checks → `> 0`; `actions.js:138` `if (c.territory && …)` on a string → `!== null`.
- **#3 prototype pollution (2) — DOWNGRADED to LOW:** `byType[c.type]` (legal-moves:54) and `s.territories[c.territory]` (actions:138) are bracket lookups, but the keys are **server-built** (deck cards / map ids), not user input. Rule #3's precondition is "bracket notation with *user input*"; client supplies only integer `cardIndices`. Defense-in-depth nicety, not an exposure.

### Devil's Advocate

Assume this code is broken. The most damning thread: **AC8 says the deck "reshuffles from discard when exhausted," and it does not.** `drawCard` performs `s.deck = s.discard` — a re-stack, not a shuffle — and the docstring affirmatively claims "reshuffling the discard pile back into the deck." A player (or a future fine-tuned bot trained on this corpus) who tracks the public trade-in log knows the exact order of every card that will be drawn for the rest of the game once the deck recycles: the privacy the view layer carefully enforces is undone the moment the deck cycles. Three independent specialists flagged this; it is not a stylistic quibble, it is an AC-wording violation plus a lying comment.

What else could bite? A confused integrator reads `RiskView` and sees `hand?`/`opponentCardCount?` as optional, writes a null-guard, and never realizes the runtime always sets them — or worse, the runtime quietly ships `capturedThisTurn` and `tradeInCount` that the contract never declares, so the wire shape and the type drift apart. A malicious client cannot poison `byType`/`territories` today (keys are server-built), but the moment someone routes a client-named card through that path, the bracket writes become a prototype-pollution seam. And the test suite gives false comfort: four rejection tests assert only that *some* error occurred — a phase-routing regression that returns the wrong error would sail through green, and the `capturedThisTurn` reset has no test, so deleting that one line would silently award a card every turn forever. The feature *looks* done because 928 tests pass; several of those tests are watching the wrong thing.

### Rule-by-rule wiring & data-flow checks

- [VERIFIED] Trade-in input is validated before any mutation — `validateTradeIn` (validate.js:52) runs first in `applyTradeIn` (actions.js:126) and returns before `reinforcePool`/`hands` change. Complies with lang-review #11.
- [VERIFIED] Private-hand redaction works for the hand identities — `view.js:8` destructures `hands/deck/discard` out; player sees own hand + opponent count only; spectator gets `[]`/`0`. (Captures are visible on the public board, so `capturedThisTurn` leaking is not a *secret* leak — but see LOW finding on contract drift.)
- [VERIFIED] No import cycle from the new `state.js → src/shared/cards/deck.js` edge — deck.js has no imports (rule-checker #9).
- [VERIFIED] Action routing `reinforce:trade-in` matches the `${phase}:${type}` switch key and the legal-moves emitter — confirmed by [TYPE].

## Reviewer Assessment

**Verdict:** REJECTED

| Severity | Issue | Location | Fix Required |
|----------|-------|----------|--------------|
| [HIGH] | [SEC][EDGE][DOC] AC8 says deck "reshuffles" but `drawCard` does `s.deck = s.discard` with no shuffle; docstring falsely claims "reshuffling"; recycled deck is drawn in predictable order (info advantage, CWE-330). | `plugins/risk/server/actions.js:152` (`drawCard`) | Thread `rng` into `endTurn`→`drawCard`; `shuffle(s.discard, rng)` before it becomes the deck; correct the docstring. |
| [MEDIUM] | [TEST][RULE] Four rejection tests use `assert.ok(r.error)` — pass on any error, not the specific rejection (lang-review #8). | `test/risk-cards-trade-in.test.js:55,62,68,81` | Replace with `assert.match(r.error, /…/)` pinning the expected message. |
| [MEDIUM] | [TEST] No coverage for the `capturedThisTurn` reset — deleting the reset in `endTurn` would award a card every subsequent turn undetected. | `test/risk-cards-award.test.js` | Add a test: capture turn (card drawn) → later non-capture turn for same player → assert hand does NOT grow. |
| [LOW] | [RULE] Truthy checks on numbers/strings (lang-review #4). | `legal-moves.js:60`, `actions.js:138` | Use explicit `> 0` and `!== null`. |
| [LOW] | [TYPE][EDGE] `view.js` ships `capturedThisTurn`/`tradeInCount` not declared on `RiskView` (contract/runtime drift). | `view.js:8`, `risk.ts` | Strip `capturedThisTurn` in the destructure, or declare both on `RiskView`. |
| [LOW] | [SEC][TYPE][DOC] `isValidCardSet` accepts any set containing a wild (incl. 3 wilds — physically unreachable with 2 wilds); comment `// any 2 + a wild` understates it. | `validate.js:46` | Tighten guard (wilds === 1 → true) and/or correct the comment. |
| [LOW] | [SIMPLE] Optional polish: redundant `?? 0`/`?? []` in `applyTradeIn`, `nonWild` two-pass in `findTradeInSet`, single-use `handSize` wrapper. | `actions.js:133,144`, `legal-moves.js:63` | Optional; not required for approval. |

**Dismissed (with rationale):**
- [SILENT] `drawCard` silent no-op on missing `deck`/`hands` (legacy state) — consistent with the codebase's existing non-migration of in-flight games (map-migration precedent); not a new bug class. Pre-existing behavior, not introduced by E2-8.
- [TEST] "spectator assertion is vacuous" — incorrect: `assert.ok(v.hand === undefined || v.hand.length === 0)` *fails* for any non-empty hand (a leak), so it does catch identity leaks. Dismissed.
- [SEC] 3-wild "auth bypass" — unreachable: hands are server-authoritative and the deck holds only 2 wilds; the client supplies indices, not card objects. Folded into the LOW `isValidCardSet` polish.

**Primary blocker:** the reshuffle (HIGH). Findings are testable → routing back to **TEA (red)** to add the reshuffle-shuffles test + the `assert.match` and `capturedThisTurn`-reset coverage, then Dev for the implementation.

**Handoff:** Back to TEA (Hamlet) for rework.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### Reviewer (code review)
- **Gap** (blocking): AC-8 reshuffle is unimplemented — `drawCard` re-stacks the discard without shuffling. Affects `plugins/risk/server/actions.js` (thread `rng` into `endTurn`→`drawCard`, call `shuffle` before reuse, fix the docstring). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `RiskView` contract omits `capturedThisTurn`/`tradeInCount` that the runtime view ships. Affects `plugins/risk/server/view.js` + `src/clients/shared/contracts/risk.ts`. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): four trade-in rejection tests assert only `assert.ok(r.error)`; should pin the message with `assert.match`. Affects `test/risk-cards-trade-in.test.js`. *Found by Reviewer during code review.*

### Dev (implementation)
- **Improvement** (non-blocking): `legal-moves.js` now emits a `trade-in` move but always trades the first valid set it finds, ignoring escalation timing and board value. Affects `plugins/risk/server/ai/legal-moves.js` and the AI prompt/board-eval (E2-9 should make set selection and trade timing strategic). *Found by Dev during implementation.*
- **Gap** (non-blocking): The card award fires only on the resolved-combat capture path in `applyAttack`. If a future code path captures territory by another route, it must also set `capturedThisTurn`. Affects `plugins/risk/server/actions.js`. *Found by Dev during implementation.*

### TEA (test design)
- **Improvement** (non-blocking): The card-state contract is defined by the new tests but not yet in the TS contract. Affects `src/clients/shared/contracts/risk.ts` (Dev must add `deck`, `hands`, `discard`, `tradeInCount`, plus the per-turn capture flag, and the view's `hand` + `opponentCardCount` shape). *Found by TEA during test design.*
- **Gap** (non-blocking): `state.js` builds the deck with the same `rng` stream that shuffles territories. Dev must shuffle territories FIRST then build/shuffle the deck, or the existing `risk-state.test.js` determinism/split assertions will shift. The existing suite guards this, but flagging so it isn't a surprise. Affects `plugins/risk/server/state.js`. *Found by TEA during test design.*
- **Question** (non-blocking): The card award fires at end-of-turn for the player who just finished (currentPlayer before the flip in `endTurn`). Dev must set a "captured this turn" marker in the resolved-capture branch of `applyAttack` and consume+reset it in `endTurn`. Affects `plugins/risk/server/actions.js`. *Found by TEA during test design.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- **Reshuffle now actually shuffles (resolves Reviewer HIGH)**
  - Spec source: context-story-E2-8.md, AC-8
  - Spec text: "deck reshuffles from discard when exhausted"
  - Implementation: `drawCard` now calls `shuffle(s.discard, rng ?? Math.random)` before the discard becomes the new deck; `rng` is threaded `applyRiskAction → endTurn(s, rng) → drawCard(s, idx, rng)`. Docstring corrected. Added a determinism test asserting the rng-shuffled order. Also: 4 rejection tests now `assert.match` the message; added two-wild, deck/discard-absence, and capturedThisTurn-reset tests; rule #4 explicit comparisons (`> 0`, `!== null`); view strips `capturedThisTurn`/`tradeInCount`; `isValidCardSet` comment corrected; `findTradeInSet` nonWild reuses `byType`.
  - Rationale: AC-8 says "reshuffles"; the prior re-stack left draw order predictable. Reviewer flagged HIGH (corroborated by [SEC]/[EDGE]/[DOC]).
  - Severity: was HIGH, now resolved
  - Forward impact: none — reshuffle is rare in 2P (forced-trade keeps the deck from emptying); real games pass the seeded rng so reshuffle is reproducible.
- **Relocated trade-in validation to `validate.js` (resolves spec-check Option B)**
  - Spec source: context-story-E2-8.md, AC-3
  - Spec text: "Trade-in accepts the three valid set shapes ... and rejects invalid sets via validate.js"
  - Implementation: Extracted `validateTradeIn(state, playerIdx, cardIndices)` into `validate.js` (shape, distinct in-range indices, valid-set check); `applyTradeIn` now calls it, matching the `applyX → validateX` sibling pattern. Behavior unchanged — all 24 card tests stay green.
  - Rationale: Architect (spec-check) correctly flagged that validation belonged beside `validateDeploy/Attack/Fortify`. Fixed per Option B.
  - Severity: trivial (resolved)
  - Forward impact: none — E2-9/E2-10 card validation now has a consistent home.
- **Added minimal trade-in enumeration to `legal-moves.js` (overlaps E2-9)**
  - Spec source: context-story-E2-8.md, Scope Boundaries ("Cards-aware AI: legal-move enumeration for trade-ins → E2-9")
  - Spec text: "Cards-aware AI: legal-move enumeration for trade-ins ... → E2-9"
  - Implementation: Added a `findTradeInSet` helper + a `trade-in` legal move in the reinforce case of `enumerateLegalMoves`. When holding ≥5 cards, deploy moves are withheld so the only legal move is the trade-in.
  - Rationale: The forced-trade rule (AC6) made the existing `risk-full-game.test.js` bot-vs-bot sim hang — the cards-unaware AI had zero legal moves at ≥5 cards. Without an enumerable trade-in, the feature is unreachable by the only driver. This is the minimum wiring to keep the engine functional and the existing test green.
  - Severity: minor
  - Forward impact: E2-9 should BUILD ON this enumeration (prompt-shape change, board-eval card valuation, smarter set selection), not re-add basic trade-in enumeration. The current heuristic always trades the first found set whenever one exists.
- **Redacted `deck` and `discard` in `view.js` beyond the literal AC7 wording**
  - Spec source: context-story-E2-8.md, AC-7
  - Spec text: "view.js exposes own hand fully but only opponent card COUNT, never identities"
  - Implementation: The view strips `hands`, `deck`, AND `discard`. AC7 names only hands.
  - Rationale: Shipping deck/discard order to a client leaks future-draw information, defeating the private-information design AC7 establishes. Least-disclosure correctness; no test required it but a reviewer would flag the leak.
  - Severity: minor
  - Forward impact: E2-10 (card UI) may want `deck`/`discard` *counts* — it should add explicit count fields rather than re-exposing the arrays.

### TEA (test design)
- **Trade-in validation tested through `applyRiskAction`, not a `validate.js` unit export**
  - Spec source: context-story-E2-8.md, AC-3
  - Spec text: "Trade-in accepts the three valid set shapes ... and rejects invalid sets via validate.js"
  - Implementation: Tests drive `{type:'trade-in'}` through the public `applyRiskAction` contract and assert the returned error string + no-mutation, rather than importing a named validator from validate.js.
  - Rationale: Avoids coupling the test suite to an export name/signature that does not exist yet, giving Dev freedom to place the validator where it fits. Behavior-level assertions still fully pin AC-3. Dev is still expected to house the set-validation logic in validate.js per the AC.
  - Severity: minor
  - Forward impact: none — if Dev adds a validate.js unit export, these behavior tests still pass.

### Reviewer (audit)
- Dev: validator relocation to validate.js → ✓ ACCEPTED (resolved the spec-check Option B; correct).
- Dev: minimal trade-in enumeration in legal-moves.js (E2-9 overlap) → ✓ ACCEPTED (necessary to make the feature reachable; correctly scoped, E2-9 builds on it).
- Dev: redaction of deck/discard in view.js beyond AC-7 wording → ✓ ACCEPTED (least-disclosure; correct) — BUT the same redaction missed `capturedThisTurn`/`tradeInCount` (see LOW findings); the *intent* is right, the execution is incomplete.
- TEA: behavior-driven trade-in tests instead of validate.js unit export → ✓ ACCEPTED (validator now lives in validate.js anyway).
- **UNDOCUMENTED deviation (Reviewer-found):** AC-8 says the deck "reshuffles from discard when exhausted." `drawCard` (actions.js:152) re-stacked the discard (`s.deck = s.discard`) without shuffling. Severity: HIGH (AC violation + predictable-draw info advantage). → ✗ FLAGGED in review #1 → ✓ RESOLVED in rework: `drawCard` now `shuffle(s.discard, rng ?? Math.random)` with rng threaded through `endTurn`; verified by re-review (security CLEAN, edge/comment confirm), AC-8 satisfied.

### Architect (reconcile)

Verified all prior deviation entries (TEA, Dev, Reviewer) against the final code, the story context (`context-story-E2-8.md`), the epic context, and sibling ACs (E2-9 AI / E2-10 UI). All entries are accurate, all cited spec sources exist, and the implementation descriptions match the merged code.

- **AC accountability:** All 8 ACs DONE (none DESCOPED or deferred). AC-1 deck/shuffle, AC-2 award-on-capture, AC-3 trade-in validation (in `validate.js`), AC-4 escalating bonus, AC-5 territory-match +2, AC-6 forced trade ≥5, AC-7 private-hand view, AC-8 reinforce-pool integration + rng reshuffle — all implemented and tested (932 green).
- **Prior deviations confirmed sound:** validator-location fix (→ validate.js); minimal `legal-moves.js` trade-in enumeration (E2-9 overlap — E2-9 must build on it, not re-add); view redaction extended to `deck`/`discard`/`capturedThisTurn`/`tradeInCount` (least-disclosure); AC-8 reshuffle fix. No entry inaccurate; no field missing.
- **No additional (undocumented) deviations found.** Residual Reviewer findings (stale `validateTradeIn`/`findTradeInSet` docstrings; compound `assert.ok` in deck/view tests; `cardIndices: number[]` vs tuple; pre-existing `sides`/`activeUserId`/`endedReason` view drift) are quality/precision nits, not spec deviations — the code satisfies every AC. Deferred (Option D) to E2-9/E2-10, which touch these files.

---

## Subagent Results

(Review #2 — post-rework re-review; supersedes the review #1 table above.)

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (932 pass, 0 smells) | N/A |
| 2 | reviewer-edge-hunter | Yes | findings | 5 | confirmed 0, dismissed/deferred 5 (all low/unreachable) |
| 3 | reviewer-silent-failure-hunter | Yes | findings | 3 | dismissed 3 (rng fallback safety-net; legacy-state consistent with existing behavior) |
| 4 | reviewer-test-analyzer | Yes | findings | 6 | dismissed 3 (2 HIGH misreads verified against code, 1 not-vacuous), deferred 3 (low/med precision) |
| 5 | reviewer-comment-analyzer | Yes | findings | 2 | confirmed 2 (LOW stale docstrings — non-blocking) |
| 6 | reviewer-type-design | Yes | findings | 3 | deferred 3 (all LOW/pre-existing; prior drift RESOLVED) |
| 7 | reviewer-security | Yes | clean | none | N/A — reshuffle HIGH resolved, redaction confirmed |
| 8 | reviewer-simplifier | Yes | findings | 2 | deferred 2 (oppIdx ternary, discard ?? [] — cosmetic) |
| 9 | reviewer-rule-checker | Yes | findings | 3 | confirmed prior #4/#8 FIXED; 3 residual LOW (pre-existing != ; 2 compound asserts) |

**All received:** Yes (9 returned, 7 with findings)
**Total findings:** 0 confirmed Critical/High; ~9 confirmed/deferred Low/Medium (non-blocking); 2 prior-HIGH misreads dismissed with code-level verification.

## Reviewer Assessment

**Verdict:** APPROVED

Re-review after rework (round-trip 1). The review #1 blocking HIGH (AC-8 reshuffle re-stack without shuffling) is **resolved**: `drawCard` now `shuffle(s.discard, rng ?? Math.random)` with `rng` threaded `applyRiskAction → endTurn → drawCard`. All prior rule violations confirmed fixed by [RULE]: the four `assert.ok` rejection tests now `assert.match`; rule #4 truthy checks now explicit (`> 0`, `!== null`); no import cycle (deck.js is a leaf).

**Data flow traced:** client `trade-in` payload → `validateTradeIn` (Array.isArray, length===3, Number.isInteger, in-range, dedup, valid-set) → only validated indices reach state; cards read from server-side hand. Safe — no client value reaches `s.territories`/`s.deck` unvalidated. [SEC] returned CLEAN.
**Private info:** [SEC][TYPE] confirm `view.js` strips `hands/deck/discard/capturedThisTurn/tradeInCount`; only own `hand` + `opponentCardCount` exposed. Prior contract drift resolved.
**Reshuffle:** [EDGE][SEC] confirm Fisher-Yates with game rng; predictable-order vuln gone.

**Dismissed (with evidence):**
- [TEST] "reshuffle test reuses one rng instance" (rated high) — FALSE: `rngFrom(99)` is called twice (award test lines 101 & 108) → two independent generators from position 0; comparison valid.
- [TEST] "capturedThisTurn-reset test doesn't prove the reset" (rated high) — FALSE: traced — removing the reset leaves the flag true into player 1's end-turn, drawing a spurious card (`hands[1].length===1`), which the assertion catches.
- [SILENT] "remove rng ?? Math.random fallback" (rated high) — dismissed: real games always pass rng (both endTurn call sites + orchestrator/routes); the fallback is a safety net and is required for the rng-less reshuffle test. Non-blocking.

**Confirmed non-blocking (Low/Medium):**
- [DOC] `validateTradeIn` function docstring and `findTradeInSet` docstring still say "two cards plus a wild" while the corrected inline comment says "any set containing a wild" — minor doc inconsistency.
- [TEST] compound `assert.ok(... && ...)` in deck/view tests (rule #8, correct but imprecise on failure); two-wild test asserts only no-rejection; spectator assertion imprecise; deck different-seed assertion absent.
- [SIMPLE] `oppIdx` nested ternary, `discard ?? []` gold-plating.
- [TYPE] `cardIndices: number[]` (tuple), optional `hand?`/`opponentCardCount?`, pre-existing `sides`/`activeUserId`/`endedReason` view drift.
- [EDGE] 3-wild set (unreachable, 2 wilds in deck), forced-trade empty-moves (unreachable by pigeonhole), drawCard both-piles-empty (unreachable in 2P with forced-trade), `state.winner != null` loose equality (pre-existing, not in changed lines).

None block: all are Low/Medium, several pre-existing or unreachable. The 8 ACs are met and tested (932 green). Recommend the [DOC] doc-accuracy and [TEST] precision items be folded into E2-9/E2-10 (which touch these files) rather than bouncing a green, AC-complete story.

**Handoff:** To Architect (Oberon) for spec-reconcile.