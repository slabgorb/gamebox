---
story_id: "E5-2"
jira_key: ""
epic: "E5"
workflow: "tdd"
---
# Story E5-2: Territory trade-in bonus: verify it forces placement + record in log

## Story Details
- **ID:** E5-2
- **Jira Key:** (none - no Jira integration for g-1)
- **Workflow:** tdd
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-06-30T23:43:11Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-30T23:29:37Z | 2026-06-30T23:31:19Z | 1m 42s |
| red | 2026-06-30T23:31:19Z | 2026-06-30T23:35:08Z | 3m 49s |
| green | 2026-06-30T23:35:08Z | 2026-06-30T23:38:42Z | 3m 34s |
| review | 2026-06-30T23:38:42Z | 2026-06-30T23:43:11Z | 4m 29s |
| finish | 2026-06-30T23:43:11Z | - | - |

## Technical Approach

The territory trade-in bonus rule is already implemented in `plugins/risk/server/actions.js` at the `applyTradeIn` function (approximately line 144). The implementation:
- Auto-adds 2 armies to the first traded card whose territory the player owns
- Only applies once per trade-in event
- Currently silent (no logging or view output)

### Acceptance Criteria

1. **Test Coverage:** Write a test that locks the existing auto-+2 bonus behavior:
   - Verify forced placement on first owned matched territory
   - Verify it only applies once per trade
   - Test various card combinations and territory ownership scenarios

2. **Log Enrichment:** Enhance the trade-in log entry to record:
   - The bonus amount (2 armies)
   - Which territory received the bonus placement
   - Condition for bonus (owned matched territory)
   - This data will be consumed by E5-6 to surface the breakdown

## Implementation Notes

- The rule is already active; this story only adds visibility and test coverage
- No rule engine changes required
- Focus: test validation + logging/view model enrichment
- Downstream consumer: E5-6 (Reinforcement provenance story)

## Sm Assessment

**Scope is tight and well-bounded.** The +2 owned-matched-territory bonus already exists and works (`plugins/risk/server/actions.js` → `applyTradeIn`, ~line 144). This story is *characterization + enrichment*, not a new rule:

1. **Lock existing behavior with a test** — forced placement on the first owned matched traded card, fires once per trade, ownership-gated. These tests must pass against the *current* implementation (they characterize, not drive new behavior). The only genuinely RED test is the log-enrichment one.
2. **Enrich the trade-in log entry** — record bonus amount + which territory, on the `RiskLogEntry` contract, so E5-6 can itemize the reinforcement breakdown.

**Routing rationale:** tdd/phased. Handing to **tea** (Lord Melchett) for RED. Note the asymmetry for TEA: the behavior tests characterize already-passing logic, so the meaningful failing test is the log-metadata one — make sure that one genuinely goes red before GREEN.

**Watch items for downstream:**
- Don't regress existing trade-in tests (AC5). Find and run them first.
- The log-entry shape is a *contract* E5-6 depends on — name the fields deliberately, not ad hoc.
- No rules-engine churn — if the implementation needs to change to make a test pass, that's a signal the test is wrong, not the code. Verify against the real `applyTradeIn` path.

Jira: explicitly skipped — g-1 has no Jira integration. Branch: trunk-based, work on `main`.

## TEA Assessment

### Red Phase (test writing)

**Tests Required:** Yes
**Reason:** Story explicitly demands characterization of the existing +2 rule plus one new behavior (log enrichment).

**Test Files:**
- `test/risk-cards-trade-in.test.js` — appended 5 tests (1 genuinely RED, 4 characterization), under `E5-2 AC2/AC3/AC4` section headers.

**Tests Written:** 5 new (suite now 20 total) covering ACs 2, 3, 4, 5.
**Status:** RED — `node --test test/risk-cards-trade-in.test.js` → **19 pass / 1 fail**. The single failure is the intended one.

**The one RED test (drives GREEN):**
- `the trade-in log entry records the territory bonus when one fires` — asserts `entry.bonusTerritory === 'alaska'` and `entry.bonusArmies === 2`. Currently `undefined` because `applyTradeIn` pushes a bare `{ kind: 'trade-in', player }` (`plugins/risk/server/actions.js:155`).

**Characterization tests (already GREEN — guard against regression, NOT to be "made pass"):**
- AC2 `only one +2 is applied even when multiple traded cards match owned territories` — pins the `break` at actions.js:148. Asserts the *total* across alaska+nwt is 4, so it's robust to which territory wins.
- AC3 `a wild card (null territory) never triggers a territory bonus` + `with a wild in the set, only the real owned-territory card grants the +2` — pin the `c.territory !== null` guard at actions.js:146.
- AC4-negative `the trade-in log entry omits the bonus fields when no territory matched` — uses `?? null` so it tolerates either omitted or explicit-null fields. **This already passes**, so Dev must NOT set the bonus fields unconditionally — only when a match fires.
- AC1/AC5 already had coverage pre-story (lines 125–145, escalating-pool tests). Untouched, still green.

### Rule Coverage (JS lang-review checklist)

| Rule | Coverage | Status |
|------|----------|--------|
| #8 test-quality (no vacuous assertions) | Every new test asserts a concrete value; `assert.ok(entry)` is always followed by specific field assertions | pass |
| #4 equality/coercion | Tests use `assert.equal` (strict) and `?? null` rather than truthy checks on possibly-0/empty | pass |
| #1 silent errors / #2 async | N/A — `applyTradeIn` is synchronous, no promises in the trade path | n/a |

**Rules checked:** test-quality + equality are the applicable ones for a pure-sync rules-engine change. No DOM/Node-IO/regex surface in scope.
**Self-check:** 0 vacuous tests written; existing file had none.

**Handoff:** To Dev (Baldrick) for GREEN.

**GREEN instructions for Dev — minimal, contract-coordinated:**
1. In `plugins/risk/server/actions.js` `applyTradeIn`: capture the matched territory id + amount inside the existing loop (the `break` block), then include them on the pushed log entry **only when a match fired** — e.g. set locals `let bonusTerritory = null, bonusArmies = 0;` before the loop, assign in the matched branch, and push `{ kind: 'trade-in', player: playerIdx, ...(bonusTerritory ? { bonusTerritory, bonusArmies } : {}) }`. Do NOT change which territory is chosen, the amount, or the once-per-trade `break`.
2. In `src/clients/shared/contracts/risk.ts` `RiskLogEntry` (line 41): add `bonusTerritory?: string;` and `bonusArmies?: number;`. This is the E5-6 contract seam — these exact names are what the AC4 test and E5-6 will read.
3. Rebuild is NOT required for this story to be testable — the failing test exercises server `actions.js` directly via `applyRiskAction`. The `.tsx` client build only matters for E5-6's UI. (Still, `pf check`'s typecheck will validate the contract edit.)

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `plugins/risk/server/actions.js` — `applyTradeIn`: capture the matched territory id + amount (`bonusTerritory`/`bonusArmies` locals) inside the existing match loop, then spread them onto the `trade-in` log entry **only when a match fired** (`...(bonusTerritory !== null ? { bonusTerritory, bonusArmies } : {})`). Placement rule, the `+= 2` amount, and the once-per-trade `break` are untouched.
- `src/clients/shared/contracts/risk.ts` — `RiskLogEntry`: added optional `bonusTerritory?: string` and `bonusArmies?: number` (the E5-6 contract seam), with a comment tying them to the trade-in bonus.

**Tests:** 20/20 in `test/risk-cards-trade-in.test.js` (GREEN — the previously-RED log test now passes). Full suite: **1159 passed / 0 failed / 1 skipped** (the skip is pre-existing, not introduced here). No regressions.
**Branch:** main (trunk-based; commit `22c3a69`). RED tests landed in `657935a`.

**Typecheck note:** No `typecheck` npm script exists. `tsc --project tsconfig.client.json --noEmit` reports 13 **pre-existing** errors in unrelated files (`RiskApp.tsx`, `SorryApp.tsx`, …); the contract edit adds **zero** new errors and is backward-compatible (purely additive optional fields).

**Scope discipline:** Followed TEA's GREEN instructions verbatim — minimal, no rules-engine churn, no client/UI work (that's E5-6). No client rebuild needed for this story (server `actions.js` is exercised directly via `applyRiskAction`; the `.tsx`→`app.js` build only matters when E5-6 renders the breakdown).

**Handoff:** To Reviewer (Captain Darling) for code review.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A — GREEN 1159/0 (1 pre-existing unrelated skip), no lint script, 0 code smells |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings — edge domain self-assessed (see [EDGE]) |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings — silent-failure domain self-assessed (see [SILENT]) |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings — test domain self-assessed (see [TEST]) |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings — doc domain self-assessed (see [DOC]) |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings — type domain self-assessed (see [TYPE]) |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings — security domain self-assessed (see [SEC]) |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings — simplify domain self-assessed (see [SIMPLE]) |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings — JS lang-review checked by hand (see [RULE] + Rule Compliance) |

**All received:** Yes (1 enabled subagent returned; 8 disabled via `workflow.reviewer_subagents` and self-assessed)
**Total findings:** 0 confirmed blocking · 1 LOW observation (magic-number duplication) · 0 deferred

## Reviewer Assessment

**Verdict:** APPROVED

A 15-line change (plus 62 lines of tests): `applyTradeIn` now records the territory that auto-received the +2 owned-match bonus onto the `trade-in` log entry, and `RiskLogEntry` gains two optional fields. The behavior rule is frozen exactly as required. I tried to break it; it holds.

**Data flow traced:** `CardTray.tsx` POSTs `{ type: 'trade-in', payload: { cardIndices } }` → `applyRiskAction` → `applyTradeIn` validates `cardIndices` (server-side, unchanged) → for the first traded card naming an owned territory, `+= 2` armies **and** captures `bonusTerritory`/`bonusArmies` in the same branch before `break` → pushes the log entry → `state.log` → `riskPublicView` spreads `...rest` (which includes `log`) into the view → the full entry reaches the client. Safe because the card's `.territory` is **server-dealt** data (pulled from `s.hands[playerIdx]`), never the client payload — the payload carries only validated `cardIndices`. No injection surface.

**Critical wiring check (the space between the code):** I verified the new fields actually reach the client rather than being silently dropped at the view boundary. `riskPublicView` (`plugins/risk/server/view.js:10-11`) destructures out the private fields (`hands`, `deck`, `discard`, `capturedThisTurn`, `tradeInCount`) and forwards everything else via `{ ...rest, youAre }`. `log` is in `...rest`, copied whole — entries are **not** reconstructed field-by-field, so `bonusTerritory`/`bonusArmies` pass through untouched. E5-6 will be able to read them. This was the one realistic way this story could have shipped a hollow contract; it didn't.

### Observations (≥5)

- `[VERIFIED]` Recorded territory == territory that received the +2 — both `s.territories[c.territory].armies += 2` and `bonusTerritory = c.territory; bonusArmies = 2` execute in the same `if` branch before `break` (`actions.js:150-153`). No drift between what the log claims and what the board did.
- `[VERIFIED]` Backward-compatible log shape — when no match fires, the conditional spread `...(bonusTerritory !== null ? {...} : {})` yields `{ kind: 'trade-in', player }`, byte-identical to the pre-change entry (`actions.js:159-164`). Confirmed by the AC4-negative test. No existing log consumer is affected.
- `[VERIFIED]` `[TYPE]` Contract change is purely additive — `bonusTerritory?: string`, `bonusArmies?: number` are optional fields on `RiskLogEntry` (`risk.ts:55-56`). No existing field changed type; no consumer is forced to handle a new shape. The server writes `string`/`number` matching the declared types.
- `[VERIFIED]` `[SEC]` No injection / prototype-pollution — `s.territories[c.territory]` is a pre-existing access; `c.territory` is server-authored card data, not user-controllable. The trade-in payload (`cardIndices`) is validated by `validateTradeIn` upstream (unchanged). No `Object.assign`/bracket-write from user input introduced.
- `[VERIFIED]` `[SILENT]` No swallowed errors — the change is pure synchronous state mutation; no try/catch, no promises, no fallback that hides a failure. Nothing to swallow.
- `[VERIFIED]` `[EDGE]` Boundary paths enumerated: (a) no owned match → no fields, board unchanged beyond pool; (b) one match → +2 + fields; (c) multiple owned matches → `break` caps at the first card's territory, and the log records that same one (covered by the AC2 test asserting total==4); (d) wild card (`territory === null`) → guard skips it (AC3 tests). All four paths have tests and all pass.
- `[VERIFIED]` `[TEST]` Test quality is sound — strict `assert.equal`; every `assert.ok(entry)` is followed by concrete field assertions; the negative test uses `?? null` to tolerate omit-or-null without being vacuous. No `.only`/`.skip`, no `toBeTruthy`.
- `[VERIFIED]` `[DOC]` Comments are accurate and not stale — the `actions.js:149` and `risk.ts:53-54` comments correctly describe the behavior and name E5-6 as the consumer; they match the code.
- `[LOW]` `[SIMPLE]` Magic-number duplication — the bonus amount `2` is written twice (`armies += 2` and `bonusArmies = 2`) two lines apart. If the rule's amount ever changed, both sites must change in lockstep. Acceptable here: the amount is a frozen classic-Risk constant and the two sites are adjacent; extracting a const would be YAGNI. Non-blocking.

### Rule Compliance (JS lang-review checklist — `[RULE]`)

Checked every applicable numbered rule against the diff (hand-verified, since `reviewer-rule-checker` is disabled):

| Rule | Applies? | Verdict |
|------|----------|---------|
| #1 silent error swallowing | no try/catch in diff | compliant (n/a) |
| #2 async/promise pitfalls | fully synchronous | compliant (n/a) |
| #3 prototype pollution | `s.territories[c.territory]` is server data, not user input | compliant |
| #4 equality/coercion | `bonusTerritory !== null` strict; `c.territory !== null` strict | compliant |
| #5 DOM security | no DOM in server/contract change | compliant (n/a) |
| #8 test quality | strict asserts, no vacuous/`.only`/`.skip` | compliant |
| #9 module/scope | `let`/`const` only, no `var`, no new imports/cycles | compliant |
| #10 error handling | no thrown strings; function returns `null` per existing contract | compliant |
| #12 dependency hygiene | no `console.log`, no secrets, no dep changes | compliant |

No violations. The remaining checklist rules (#6 Node IO, #7 regex, #11 input validation at handlers) have no surface in this diff.

### Devil's Advocate

Let me argue this code is broken. **First attack — the log lies.** What if a client trusts `bonusArmies` to sum the muster but the server set it without actually adding armies? Refuted: both writes are in the same branch before `break`; there is no path that records a bonus without applying it, nor vice versa. **Second — the spread leaks.** Could the conditional spread accidentally emit `bonusArmies` alone, or `undefined` fields that pollute the entry? Refuted: the ternary spreads either both fields together or `{}`; `bonusArmies` can never appear without `bonusTerritory`, and no `undefined` is ever spread. **Third — falsy territory id.** TEA's suggested guard was `bonusTerritory ?` (truthy); a territory id of `''` would have silently dropped a real bonus. Dev used `!== null` instead, which is immune to that class — and territory ids are non-empty anyway. Good catch by Dev, actually. **Fourth — the view drops it.** A confused future maintainer might assume the client never sees the field; but I traced `riskPublicView` and the whole `log` array is spread through `...rest`, so it does arrive. **Fifth — a stressed game state.** What if `s.territories[c.territory]` is undefined (territory id not in state)? The pre-existing `?.owner` optional-chain short-circuits to `undefined !== playerIdx`, so the branch simply doesn't fire — no crash, no bonus, no log fields. Safe. **Sixth — multiple owned matches confusing E5-6.** Only the first is recorded, matching the only territory that got armies; E5-6 reading one `bonusTerritory` is correct, not a half-truth. **Seventh — a malicious client** crafting a payload to forge a bonus? The payload is `cardIndices` only; card contents come from the server-held hand, so the attacker cannot inject a `territory` they don't legitimately hold a card for, and ownership is checked against `s.territories[...].owner`. I cannot construct an input that produces a wrong or forged bonus. The devil finds nothing blocking — only the cosmetic duplicated `2`.

**Verdict rationale:** No Critical or High issues. One LOW (cosmetic). All ACs covered by passing tests, behavior frozen per the epic guardrail, contract seam correctly named and wired through to the client for E5-6. APPROVED.

**Handoff:** To SM (Edmund Blackadder) for finish-story.

## Delivery Findings

<!-- Append findings below. Append-only — never edit another agent's entries. -->

### Dev (implementation)
- **Improvement** (non-blocking): The full suite shows 1 pre-existing skipped test (not from this story). Worth a future cleanup pass per the JS lang-review #8 rule (`.skip` without a reason). Affects an unidentified test file outside E5-2's diff. *Found by Dev during implementation.*
- Resolved TEA's two findings: the `RiskLogEntry` contract now carries `bonusTerritory`/`bonusArmies`; the log push omits the fields entirely (not explicit null) when no match fires, so absent === "no bonus" for E5-6.

### TEA (test design)
- **Gap** (non-blocking): The `RiskLogEntry` contract (`src/clients/shared/contracts/risk.ts:41`) lacks `bonusTerritory`/`bonusArmies`. Affects that file — Dev must add both as optional fields during GREEN so E5-6 can consume them. *Found by TEA during test design.*
- **Question** (non-blocking): AC4 leaves "omit vs explicit null" to Dev's discretion; the test tolerates both via `?? null`. If E5-6 prefers a stable shape, it should treat absent and null identically. Affects `plugins/risk/server/actions.js` log push. *Found by Reviewer: resolved — Dev chose omit; absent === "no bonus".*

### Reviewer (code review)
- **Improvement** (non-blocking): `bonusArmies` is recorded but always `2`; E5-6 should not hardcode the amount on the client — read it from the log entry so a future rule change stays single-sourced. Affects `src/clients/risk/*` (E5-6 render). *Found by Reviewer during code review.*
- No blocking upstream findings. Contract seam (`bonusTerritory`/`bonusArmies`) is correctly wired through `riskPublicView` to the client; E5-6 can consume it as-is.

## Impact Summary

**Upstream Effects:** 1 findings (0 Gap, 0 Conflict, 0 Question, 1 Improvement)
**Blocking:** None

- **Improvement:** `bonusArmies` is recorded but always `2`; E5-6 should not hardcode the amount on the client — read it from the log entry so a future rule change stays single-sourced. Affects `src/clients/risk/*`.

### Downstream Effects

- **`src/clients/risk`** — 1 finding

## Design Deviations

### TEA (test design)
- No deviations from spec. Tests cover ACs 2–5 as written; AC1 retains its pre-existing coverage. No test omissions, no strategy substitutions.

### Dev (implementation)
- No deviations from spec. Implemented exactly the two TEA-specified changes (log enrichment + contract fields); placement rule, amount, and once-per-trade break left frozen per AC5 and the epic "no rules-engine churn" guardrail.

### Reviewer (audit)
- **TEA "No deviations from spec"** → ✓ ACCEPTED by Reviewer: tests cover ACs 2–5; AC1 retained its prior coverage. Confirmed against the diff — no test omissions.
- **Dev "No deviations from spec"** → ✓ ACCEPTED by Reviewer: the rule (placement, `+= 2` amount, once-per-trade `break`) is byte-for-byte unchanged; only additive log/contract enrichment. Verified against `git diff HEAD~2`.
- **No undocumented deviations found.** I checked the diff against story scope (AC1–AC5), epic guardrail ("no rules-engine churn"), and the contract-seam requirement. Dev's one micro-decision — using `!== null` instead of TEA's suggested truthy `bonusTerritory ?` guard — is a strict-correctness improvement, not a spec deviation, and needs no separate log entry.