---
story_id: "E5-10"
jira_key: ""
epic: ""
workflow: "tdd"
---
# Story E5-10: Conquest advance: attacker chooses armies to move (min=dice rolled, max=armies-1), not all-in

## Story Details
- **ID:** E5-10
- **Jira Key:** (not set)
- **Workflow:** tdd
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-07-02T20:40:22Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-02T20:16:59Z | 2026-07-02T20:18:21Z | 1m 22s |
| red | 2026-07-02T20:18:21Z | 2026-07-02T20:28:41Z | 10m 20s |
| green | 2026-07-02T20:28:41Z | 2026-07-02T20:35:06Z | 6m 25s |
| review | 2026-07-02T20:35:06Z | 2026-07-02T20:40:22Z | 5m 16s |
| finish | 2026-07-02T20:40:22Z | - | - |

## Repository & Branching
- **Repository:** g-1
- **Branch Strategy:** trunk-based (branching skipped — work happens on the default branch)

## Sm Assessment

**Story:** E5-10 — Conquest advance: attacker chooses armies to move (min=dice rolled, max=armies-1), not all-in. 5pts, bug, p1, tdd workflow.

**Why now:** Playtest-discovered rules-correctness bug in Risk's core conquest mechanic. Current behavior force-moves ALL attacking armies into a conquered territory; the real rule gives the attacker a choice in [dice rolled in winning attack, origin armies − 1]. P1 because a wrong core rule outranks polish work in the same epic (E5).

**Setup verification:**
- Session file created: `.session/E5-10-session.md` ✔
- Story context written: `sprint/context/context-story-E5-10.md` ✔ (technical approach + 5 ACs)
- Branch: none — g-1 is trunk-based, work proceeds on default branch (per repos.yaml)
- Jira: none — story has no Jira key (epic E5 is [no jira]); claim explicitly skipped
- Merge gate: clean — no open PRs

**Scope guardrails for downstream agents:**
1. Server: conquest apply accepts validated `advanceCount` in [min, max]; carry winning roll's dice count into the conquest step. Reject out-of-range.
2. Client: advance chooser in the E5-1 interactive attack overlay; forced value (no chooser) when min == max. Client bundle is gitignored — rebuild via `npm run build:client`.
3. Bots: must pick a valid advanceCount (default max = origin−1 preserves current behavior) so bot conquests still resolve in one wake-up (turn-continuation contract).

**Routing:** tdd is phased → RED phase next, owner TEA (Deep Thought). TEA writes failing tests for the min/max boundaries, out-of-range rejection, forced min==max case, and bot advance path before any implementation.

## TEA Assessment

**Tests Required:** Yes
**Reason:** Rules-correctness bug in the core conquest mechanic; tdd workflow.

**Test Files:**
- `test/risk-actions-advance.test.js` — server engine: advanceCount validation ([min,max] bounds, final-round dice as min, rejection semantics, omit-defaults-to-max, repulse ignore, pendingCombat proxy-ignore, bot-vs-bot single-step resolution). 11 tests.
- `test/client/advance-rules.test.ts` — pure `advanceRange(out, force)` helper in `src/clients/risk/combat-rules.ts`: range derivation, final-round dice, clamp, forced collapse (AC-3), null on repulse. 5 tests.
- `test/client/advance-chooser.test.tsx` — new `src/clients/risk/AdvanceChooser.tsx` component: slider [min,max] default max, confirm fires onChoose once, forced case auto-fires with no UI (AC-3/AC-4). 5 tests.
- `test/client/combat-reveal-advance.test.tsx` — CombatReveal integration: interactive capture gates onResolved behind the chooser and threads `advanceCount` into the resolved payload; repulse and non-interactive (defender-proxy) paths resolve immediately with no chooser/advanceCount. 3 tests.

**Tests Written:** 24 tests covering 5 ACs
**Status:** RED (verified by testing-runner: 6 server failures + 5 + 1 suite-level import + 1 client failures, all in new files; **zero regressions** across 1399 server / 291 client pre-existing tests). RED commit: `7508fbc`.

**Contract pinned for Dev (Trillian):**
- `payload.resolved.advanceCount` (integer). On capture: valid range `[min(finalRoundDiceCount, survivors), survivors]`; move `advanceCount` into target, origin ends `1 + (survivors - advanceCount)`. In the march-out model `survivors ≡ origin armies − 1` at conquest time, so this is exactly the story's rule.
- Omitted advanceCount ⇒ default max (pre-E5-10 all-in; keeps every existing caller and the bot/proxy path working).
- Out-of-range / non-integer ⇒ `{ error: /advance/i }`, no state mutation.
- Repulse ⇒ advanceCount ignored.
- `pendingCombat` set (bot attacker) ⇒ proxy-posted advanceCount IGNORED, bot policy = max (a hostile defender-proxy must not strand bot armies).
- Client: `advanceRange` helper + `AdvanceChooser` (slider default = max, forced min==max auto-fires, no UI) + CombatReveal holds `onResolved` until choice on interactive captures. `ResolvedCombat` contract gains optional `advanceCount?: number`. Client bundle must be rebuilt (`npm run build:client`) after .tsx changes.

### Rule Coverage

| Rule (javascript.md) | Test(s) | Status |
|------|---------|--------|
| #4 equality/coercion (integer check, no truthy-0 traps) | `non-integer advanceCount values are rejected` (3.5, '5', null, NaN, −1) | failing |
| #11 input validation at action boundary | `advanceCount below min / above max rejected with no state change` | failing |
| #1 no silent fallback on bad input | rejection tests assert explicit error AND unchanged input state | failing |
| #2 async pitfalls (client) | CombatReveal tests await onResolved via waitFor; chooser gates the async resolve | failing |
| #8 test quality (self-check) | all 24 tests assert specific values/errors; no `toBeTruthy`, no `let _ =`, no `.only/.skip` | n/a (meta) |

**Rules checked:** 4 of 13 lang-review rules are exercisable by this feature's surface; each has ≥1 enforcing test. Remaining rules (DOM security, Node security, regex, deps…) have no new surface in this story — Dev's implementation diff gets the full 13-check gate at review.
**Self-check:** 0 vacuous tests found. One soft assertion (`getAllByText(/5/)` for visible count display) is intentionally loose to avoid pinning markup.

**Handoff:** To Dev (Trillian) for GREEN implementation.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Improvement** (non-blocking): the advanced count should probably be recorded on `lastCombat` / the `attack` log entry so the defender's replay and the history log show the split (E5-6-style provenance). Affects `plugins/risk/server/actions.js` (add `advanced` to lastCombat/log on capture). Not pinned by tests — Dev/PM's call. *Found by TEA during test design.*
- **Improvement** (non-blocking): `ResolvedCombat` in `src/clients/shared/contracts/risk.ts` needs the optional `advanceCount?: number` field; check for contract-drift guards that mirror it. Affects `src/clients/shared/contracts/risk.ts` (type addition). *Found by TEA during test design.*
- **Question** (non-blocking): the combat model rolls `min(3, force−1)` dice where force = origin−1, so dice counts trail canonical Risk by one (a 3-army origin rolls 1 die, canonical rolls 2; a 2-army origin cannot attack at all here). The story's "min = dice rolled" rule is implemented faithfully against THIS model, but if canonical dice counts are ever wanted that's a separate story. Affects `plugins/risk/server/combat.js` (dice-count formula). *Found by TEA during test design.*

### Dev (implementation)
- **Improvement** (non-blocking): deferred TEA's suggestion to record the advanced count on `lastCombat` / the attack log entry — no test pins it and the board view already reflects the split; would serve E5-6-style provenance if wanted. Affects `plugins/risk/server/actions.js` (add `advanced` to lastCombat/log on capture). *Found by Dev during implementation.*
- **Improvement** (non-blocking): `tsc -p tsconfig.client.json` reports pre-existing type errors in unrelated files (clue `Board.tsx` movement narrowing, sorry `Board.tsx`/`Board4P.tsx`/`SorryApp.tsx` color/tuple types, two test files). Zero errors in risk/this story's files. Affects `src/clients/clue/Board.tsx`, `src/clients/sorry/*` (type fixes). *Found by Dev during implementation.*

### Reviewer (code review)
- **Improvement** (non-blocking): disable the Advance confirm button after first click to close the double-fire window (server already rejects the duplicate POST, so this is pure UX hardening). Affects `src/clients/risk/AdvanceChooser.tsx` (add a clicked guard/disabled state). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): seconding the TEA/Dev finding — record the advanced count on `lastCombat`/the attack log entry so the defender's replay and history show the garrison split; fits naturally into E5-6's itemized-provenance work. Affects `plugins/risk/server/actions.js` (lastCombat/log fields). *Found by Reviewer during code review.*

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `plugins/risk/server/actions.js` — resolved-capture path: `resolved.advanceCount` validated into `[min(winningDice, survivors), survivors]` before any mutation; capture applies `tgt.armies = advance`, `src.armies = 1 + (survivors − advance)`; omitted ⇒ max; ignored when `pendingCombat` set (proxy may not choose for the bot attacker) and on repulse.
- `src/clients/risk/combat-rules.ts` — new `advanceRange(out, force)` pure helper (null on repulse; `forced` when the range collapses).
- `src/clients/risk/AdvanceChooser.tsx` — NEW: slider [min,max] default max + confirm button; forced range renders nothing and auto-fires `onChoose(min)` once (ref-guarded).
- `src/clients/risk/CombatReveal.tsx` — interactive captures hold `onResolved` in `pendingAdvance` state until the chooser fires; resolved payload carries `advanceCount`. Repulse/non-interactive paths unchanged (immediate resolve, no advanceCount).
- `src/clients/shared/contracts/risk.ts` — `ResolvedCombat.advanceCount?: number`.
- `plugins/risk/client/style.css` — `.advance-chooser` styles beside the E5-1 combat controls.

**Tests:** 1398/1398 server + 296/296 client passing (GREEN, verified by testing-runner; zero regressions). All 24 new E5-10 tests pass.
**Typecheck:** `tsc -p tsconfig.client.json` — zero errors in touched files (pre-existing, unrelated errors in clue/sorry sources noted in findings).
**Client bundle:** rebuilt via `npm run build:client` (bundles are gitignored; prod pickup needs the usual restart at deploy time).
**Branch:** main (trunk-based), pushed — commits `9404391` (feat) + `46d124b` (sprint bookkeeping); RED tests were `7508fbc`.

**Handoff:** To TEA (Deep Thought) for verify (simplify + quality-pass).

## Reviewer Assessment

**Verdict:** APPROVED

**Data flow traced:** bounded slider input → `onChoose(n)` → `onResolved({...out, advanceCount})` → POST action → server-side `Number.isInteger` + range check against a range **recomputed from the replayed rounds** (client-supplied values never widen it) → clone mutation → view/SSE. Safe because the server derives `[min, max]` independently and rejects everything else with no state change.
**Pattern observed:** the change extends the established Amendment A.1 resolved-combat contract in-kind — validation-before-mutation on the server clone (`plugins/risk/server/actions.js:283-315`), pure-rule helper mirrored client-side (`combat-rules.ts:advanceRange`), component-local UI state (`AdvanceChooser.tsx`), exactly matching how E5-1's Roll/Blitz/Stop controls were layered in.
**Error handling:** invalid advanceCount → explicit `advance must be an integer in {min}..{max}` (actions.js:296) with zero state mutation, pinned by immutability tests; forced/absent paths degrade to the pre-story all-in default rather than failing.
**Tests:** 1398/1398 server + 296/296 client GREEN (preflight-verified), 24 new tests, zero regressions, zero story-scope typecheck errors, zero smells.
**Findings:** 2 LOW, both non-blocking, both logged as delivery findings (double-click hardening; advance provenance in lastCombat/log). No Critical/High.
**Deviation audit:** 5 logged deviations, all ACCEPTED; no undocumented deviations found.

**Handoff:** To SM (Slartibartfast) for finish-story.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A — all checks GREEN (1398 server / 296 client tests, 0 story-scope tsc errors, 0 smells, clean lineage f71f263→46d124b) |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings — domain covered by Reviewer directly (see edge analysis in assessment) |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings — covered by Reviewer (validation returns explicit errors; no catches added) |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings — covered by Reviewer (24 tests, value-specific assertions, no .only/.skip) |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings — covered by Reviewer (bookkeeping comment updated with the behavior change; contract docs added) |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings — covered by Reviewer (optional `advanceCount?: number` on ResolvedCombat; no stringly-typed API added) |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings — covered by Reviewer (integer-validated boundary; proxy-strand exploit explicitly closed) |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings — covered by Reviewer (minimal diff: one validation block, one pure helper, one component) |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings — Reviewer ran the 13-check javascript.md rubric manually (see Rule Compliance) |

**All received:** Yes (1 enabled subagent returned; 8 disabled via settings)
**Total findings:** 2 confirmed (both LOW, non-blocking), 0 dismissed, 0 deferred

### Rule Compliance

Rubric: `.pennyfarthing/gates/lang-review/javascript.md` (13 checks) applied to every changed `.js`/`.ts`/`.tsx` file in the diff. No `.claude/rules/` or `SOUL.md` present in this repo.

| # | Check | Instances examined | Verdict |
|---|-------|--------------------|---------|
| 1 | Silent error swallowing | actions.js validation block; CombatReveal `.then` chain; AdvanceChooser | compliant — out-of-range returns an explicit string error (engine convention), never a silent clamp; no empty catches added |
| 2 | Promise/async pitfalls | CombatReveal `.then` (pre-existing chain style, extended in-kind); AdvanceChooser useEffect (deps `[forced, min, onChoose]`, ref-guarded) | compliant — onResolved is invoked inside the settled chain; no floating promises or async forEach |
| 3 | Prototype pollution | `resolved.advanceCount` read | compliant — value is range-checked integer, never used as an object key |
| 4 | Equality/coercion | actions.js:293-296 (`Number.isInteger`, `!== undefined`, `<`/`>` on validated ints) | compliant — no `==`, no truthy checks on numbers (0/NaN can't slip through Number.isInteger) |
| 5 | DOM/browser security | AdvanceChooser JSX | compliant — text interpolation only, no innerHTML/eval |
| 6 | Node.js specific | actions.js | compliant — no exec/require-var/env access |
| 7 | Regex safety | whole diff | n/a — no regex added |
| 8 | Test quality | 4 new test files (24 tests) | compliant — value-specific asserts; no `.only`/`.skip`; one intentionally loose `getAllByText(/5/)` (documented by TEA); rejection tests assert error AND state immutability |
| 9 | Module/scope | all changed files | compliant — const/let only; import graph acyclic (contracts→combat-rules→AdvanceChooser→CombatReveal) |
| 10 | Error handling patterns | actions.js:296 | compliant — string-return matches the engine's uniform `{error}` contract (every sibling validator returns strings; an Error object here would be the inconsistency) |
| 11 | Input validation | actions.js resolved path | compliant — the feature IS boundary validation: integer + range check before any mutation of the clone |
| 12 | Dependency/config hygiene | diff | compliant — no console.log, no secrets, no dep changes; CSS reuses existing custom properties |
| 13 | Fix-introduced regressions | re-scan of impl diff | compliant — validation added on the only path that consumes advanceCount; no new catch blocks or partial-path validation |

### Reviewer Observations

1. **[VERIFIED] Conquest bookkeeping conserves armies and territorial invariants — `plugins/risk/server/actions.js:309-315`.** On capture: `src.armies -= forceCommitted` (→1), `tgt.armies = advance`, `src.armies += survivors − advance`. Attacker total = 1 + survivors, exactly the pre-battle count minus losses. Both territories always ≥1 army: `minAdvance ≥ 1` (a legal winning round rolls ≥1 die) and a capture round costs the attacker nothing (pairs all resolve as defender losses), so survivors ≥ 2. Complies with rule #4/#11 (validated ints at boundary).
2. **[VERIFIED] Rejection leaves state untouched — `plugins/risk/server/actions.js:293-297`.** Validation runs before `src.armies -= forceCommitted` and operates on the clone `s`; error return discards the clone entirely (`applyRiskAction` returns `{error}` without state). Pinned by two tests asserting `JSON.stringify` equality of input territories.
3. **[VERIFIED] Defender-proxy cannot strand a bot's armies — `plugins/risk/server/actions.js:292` (`!pc` guard).** When `pendingCombat` is set the posted advanceCount is never read; bot policy = max. Pinned by `bot conquest (pendingCombat): proxy-posted advanceCount is ignored`. This closes the one new abuse vector this feature could have opened. Complies with #11.
4. **[VERIFIED] Wiring is complete end-to-end — `src/clients/risk/RiskApp.tsx:204-233`.** The interactive mount passes `force={live.force}` and posts the `resolved` object wholesale (`payload: {from, to, resolved}` at line 230-233), so `advanceCount` reaches the server with zero app-level changes. `combatSignature` (replay suppression) hashes `{from,to,force,captured,rounds}` — advanceCount is not part of it, so the pre-seeded signature still matches the server's lastCombat. Chooser CSS lands in the checked-in `plugins/risk/client/style.css` under `#risk-root` (the high-specificity sheet that wins over the bundled app.css per the two-stylesheet setup).
5. **[VERIFIED] Backward/forward compatibility — `plugins/risk/server/actions.js:291-292`.** Omitted advanceCount ⇒ `advance = eff.attackerSurvivors` (the exact pre-E5-10 behavior). Pre-E5-10 clients, the defender-proxy path, and `resolvePendingCombat` (which posts no advanceCount) all keep working unchanged; pinned by the default-max and bot-vs-bot tests.
6. **[LOW] AdvanceChooser confirm button is not disabled after click — `src/clients/risk/AdvanceChooser.tsx:44-49`.** A fast double-click could fire `onChoose` twice before `setPendingAdvance(null)` unmounts it, double-POSTing the resolved action. Consequences bounded: RiskApp's first `onResolved` sets `live=null` (unmounts the overlay) and the server rejects the duplicate (`target is not an enemy territory` — the capture already applied). Cosmetic hardening (`disabled` after first click) can ride a later polish story. Non-blocking.
7. **[LOW] Advance split is not recorded in `lastCombat`/log — `plugins/risk/server/actions.js:311`.** The defender's replay and the history log show the battle but not how many marched in (board state reveals it indirectly). Already captured as a TEA + Dev delivery finding (Improvement, non-blocking); consistent with E5-6's provenance theme if picked up.

**Data flow traced:** slider input (bounded `[min,max]`, `Number(e.target.value)`) → `onChoose(n)` → `onResolved({...out, advanceCount: n})` → RiskApp POST `/api/games/:id/action` → `applyRiskAction` → `applyAttack` resolved path → `Number.isInteger` + range check against server-recomputed `[minAdvance, survivors]` (client values never trusted) → clone mutation → view/SSE. Safe: the server independently derives the range from the replayed rounds, so a tampered client cannot widen it.

**Error handling:** invalid advanceCount → explicit `advance must be an integer in {min}..{max}` with zero state change (actions.js:296); client cannot render an out-of-range value (range input clamps); forced ranges bypass interaction entirely.

**Hard questions asked:** `-0` (integer, but < min ⇒ rejected); `1e15` (> survivors ⇒ rejected); `NaN`/`'5'`/`null` (Number.isInteger ⇒ rejected); empty `rounds` on a phantom capture (`?.` + `??` fallback ⇒ forced max, no crash); double-POST (server rejects duplicate — see obs. 6); refresh mid-choose (combat never POSTed ⇒ attack simply didn't happen, consistent with the existing client-rolled model); race with orchestrator resolving the same pendingCombat (second apply rejected — pc cleared, target no longer enemy).

**Tenant/seat isolation:** N/A tenant-wise; seat authority checked — the resolver-post gate (`isResolverPost`, actions.js:85-91) and the `!pc` advance guard together ensure only the attacker's own resolved POST can carry an effective advanceCount.

### Devil's Advocate

Assume this is broken. The most dangerous claim is "the server recomputes the range, so clients can't cheat." Attack it: the range depends on `eff.rounds`, and the ROUNDS are client-supplied. Could an attacker fabricate rounds that both capture and minimize `winningDice` to legitimize a tiny advance — say, rolling one die per round to grind the defender down, then advancing the minimum 1 army, keeping 8 home? Yes — but that is not an exploit of THIS change: it is precisely the strategic choice the story restores, and the dice themselves are already client-rolled by design (Amendment A.1; the project's dice-are-client-side rule). The fabricated-rounds surface predates E5-10 and is unchanged by it; `replayAttack` still enforces dice-count legality per round. Second attack: the proxy path. A hostile human resolving a bot's attack posts `advanceCount: 1` to strand nine bot armies on a border — blocked by the `!pc` guard, and pinned by a test. Third: state desync — the client computes `[3,4]` while the server computes `[3,4]` from the same rounds; can they diverge? Client uses `force − attackerLosses`, server uses `eff.attackerSurvivors` from its own replay of the same rounds; driveCombat and replayAttack share the identical attrition algorithm (resolveRound is a line-for-line mirror of the server loop), so divergence requires the client to post rounds it didn't drive — which lands in server validation anyway. Fourth: a confused user stares at "Captured" plus a slider and closes the tab; the attack silently never happened. Annoying, but identical to closing mid-Blitz today, and re-attackable. Fifth: React 18 StrictMode double-mount could double-fire the forced auto-advance — the `fired` ref guards it; and prod doesn't run StrictMode. I could not construct a state corruption, an invariant break, or a new cheat. The two residual weaknesses (double-click, missing provenance) are logged as LOW.

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **AC-3 (min==max forced) tested at client-helper/component level only, not through the server engine**
  - Spec source: context-story-E5-10.md, AC-3
  - Spec text: "When min == max the advance is forced to that value with no chooser shown"
  - Implementation: `advanceRange` forced-flag tests + `AdvanceChooser` auto-fire test use synthetic inputs; no server test drives a real min==max capture
  - Rationale: in the march-out combat model a capture round never costs the attacker armies, so winning-round dice < survivors always — min==max is mathematically unreachable through `replayAttack`-legal rounds. The rule is generic client logic ("no chooser"), pinned where it lives.
  - Severity: minor
  - Forward impact: none — server clamp is still exercised via the helper contract; if the combat model ever changes, the helper tests keep the collapse case honest.
- **Omitted advanceCount defaults to max instead of being required**
  - Spec source: context-story-E5-10.md, AC-2/AC-4
  - Spec text: "Server rejects an advanceCount outside [min, max]" / "Client... sends the chosen count"
  - Implementation: tests pin `resolved` payloads WITHOUT advanceCount as valid, defaulting to max (all survivors)
  - Rationale: the defender-proxy and bot-vs-bot resolvers post resolved payloads with no human attacker present to choose; requiring the field would break both paths and every pre-E5-10 client. Default-max is the story's own stated bot default.
  - Severity: minor
  - Forward impact: Dev must implement default-max, not required-field validation.
- **Proxy-posted advanceCount ignored when pendingCombat is set (extension beyond ACs)**
  - Spec source: context-story-E5-10.md, AC-5 (bot chooses)
  - Spec text: "Bots choose a valid advanceCount and their conquest resolves within a single turn"
  - Implementation: test pins that a defender-proxy's advanceCount is discarded and the bot advances max
  - Rationale: the advance choice belongs to the attacker; honoring the proxy's value would let a hostile human strand a bot's armies on conquest. Security-hardening consequence of AC-5.
  - Severity: minor
  - Forward impact: if a future story gives bots a real advance heuristic, the policy hook lives server-side (pendingCombat path), not in the proxy payload.
- **AdvanceChooser default slider value pinned to max**
  - Spec source: context-story-E5-10.md, AC-4
  - Spec text: "Client shows an advance chooser over the valid range after a conquest"
  - Implementation: tests require the slider to preselect max
  - Rationale: AC is silent on the default; max matches the previous all-in behavior (least surprise) and makes confirm-without-touching equivalent to today's outcome.
  - Severity: minor
  - Forward impact: none.

### Dev (implementation)
- **Bots use the fixed default-max advance policy, not a heuristic**
  - Spec source: context-story-E5-10.md, Problem/Scope item (3)
  - Spec text: "Bots must choose an advance count so bot conquests still resolve in one turn (default: advance max = origin-1, i.e. current all-in behavior, or a simple heuristic)"
  - Implementation: no bot-side heuristic; the server's omitted-advanceCount default (max) is the bot policy — `resolvePendingCombat` and the proxy path post no advanceCount
  - Rationale: the spec explicitly offers default-max as the accepted option; it preserves current behavior exactly, needs zero new bot decision surface, and satisfies AC-5's single-continuation requirement (pinned by tests)
  - Severity: minor
  - Forward impact: a future "bot garrison heuristic" story would hook into the pendingCombat capture branch in `plugins/risk/server/actions.js` (server-side), not the resolver payload.

### Reviewer (audit)
- **TEA: AC-3 tested at client-helper/component level only** → ✓ ACCEPTED by Reviewer: the unreachability argument is correct — a legal capture round has aLoss=0, so winningDice ≤ survivors−1 strictly; the rule is generic client logic and is pinned where it can actually fire. Server clamp still exists defensively (actions.js:294).
- **TEA: omitted advanceCount defaults to max** → ✓ ACCEPTED by Reviewer: required for the proxy/bot/pre-E5-10 paths; a required-field reading of AC-2 would break AC-5. Default equals the story's own stated bot default.
- **TEA: proxy-posted advanceCount ignored when pendingCombat set** → ✓ ACCEPTED by Reviewer: security-positive extension; without it AC-5's "bots choose" would be delegated to a potentially hostile opponent. Pinned by test.
- **TEA: AdvanceChooser default slider value pinned to max** → ✓ ACCEPTED by Reviewer: least-surprise default; confirm-without-touching reproduces pre-story behavior exactly.
- **Dev: bots use fixed default-max advance policy, not a heuristic** → ✓ ACCEPTED by Reviewer: spec text explicitly offers "advance max … i.e. current all-in behavior" as the default option; zero new bot decision surface keeps the turn-continuation contract trivially satisfied.
- No undocumented deviations found: implementation matches the TEA-pinned contract line-for-line; the "origin armies − 1 ≡ survivors" mapping the ACs rely on is documented in the TEA assessment.