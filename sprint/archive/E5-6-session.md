---
story_id: "E5-6"
jira_key: "none"
epic: "E5"
workflow: "tdd"
---
# Story E5-6: Reinforcement provenance: itemize the muster (base + continent + trade-in)

## Story Details
- **ID:** E5-6
- **Jira Key:** none (kanban-only)
- **Workflow:** tdd
- **Stack Parent:** E5-2 (DONE — recorded the underlying reinforcement/territory-bonus data in the log/view)
- **Branch Strategy:** trunk-based (branching skipped — work happens on the default branch, main)
- **Assignee:** Keith Avery

## Story Summary

**Problem:** `reinforcePool` is a bare number; players cannot tell where their reinforcements came from during the muster phase. This makes the game state opaque and reduces player agency/understanding.

**Solution:** Itemize the muster by source into a presentation layer that breaks down the four components of the reinforcement pool:

1. **Base reinforcements:** `max(3, floor(territories/3))` — minimum of 3 armies or 1 per 3 territories held
2. **Per-continent bonuses:** e.g. `+3 for South America`, `+5 for North America`, etc. (Risk's standard continent bonus rules)
3. **Trade-in set bonus:** Escalating TRADE_BONUSES for trading in matched sets (e.g. `+5 for first set, +10 for second, +15 for third`, per Risk rules)
4. **Territory-match placement bonus:** The `+2` bonus placed on an owned territory when trading in that matched card (already implemented and recorded by E5-2)

**Dependencies:** This is a presentation layer over data E5-2 already records. Depends on E5-2's log/view enrichment for the territory-bonus line (the `+2` placement).

**Type:** Presentation/UI feature (no new rules logic)
**Points:** 3
**Priority:** p2

## Acceptance Criteria

No acceptance criteria recorded in sprint YAML. TEA will define acceptance criteria during the RED phase.

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-07-03T06:18:12Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-03T05:57:53+00:00 | 2026-07-03T05:59:31Z | 1m 38s |
| red | 2026-07-03T05:59:31Z | 2026-07-03T06:08:32Z | 9m 1s |
| green | 2026-07-03T06:08:32Z | 2026-07-03T06:14:52Z | 6m 20s |
| review | 2026-07-03T06:14:52Z | 2026-07-03T06:18:12Z | 3m 20s |
| finish | 2026-07-03T06:18:12Z | - | - |

## Sm Assessment

**Setup complete — routing to TEA (Deep Thought) for the RED phase.**

- Session file created with story summary and the four provenance sources to itemize; story context at `sprint/context/context-story-E5-6.md` (pre-existing, validated by setup).
- Jira: skipped — kanban-only story, no Jira key exists.
- Branch: none by design — repo g-1 is trunk-based, work lands on `main` directly.
- Workflow: `tdd` (phased): setup → red (TEA writes failing tests) → green (Dev) → review (Reviewer) → finish (SM).
- **Dependency posture:** E5-2 is DONE and already records the underlying data (reinforcement breakdown + territory-match +2). This story is a PRESENTATION layer over that recorded data — TEA/Dev should build the itemized muster view/log on top of E5-2's enrichment, not re-derive the numbers. The territory-bonus line specifically depends on E5-2's log/view enrichment.
- **No ACs in YAML** — TEA defines acceptance criteria during RED. Guidance for TEA: assert the four itemized sources (base = max(3, floor(territories/3)); per-continent bonuses; escalating trade-in TRADE_BONUSES; territory-match +2) sum to `reinforcePool`, and that the breakdown surfaces in the player-facing view/log.

## Delivery Findings

No upstream findings (setup phase).

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)

- **Improvement** (non-blocking): the `trade-in` log entry records `bonusTerritory`/`bonusArmies` (E5-2) but NOT the escalating set-bonus amount, and `tradeInCount` is private to the engine. Affects `plugins/risk/server/actions.js` (the `trade-in` log push at ~line 181). The set-bonus figure is therefore best derived by the breakdown as the pool residual (`reinforcePool − base − Σcontinents`); logging the set bonus explicitly would make it directly sourceable. Not blocking — the residual is exact for correct states and the tests accept either derivation. *Found by TEA during test design.*

### Dev (implementation)

- **Improvement** (non-blocking): the `.tsx`/`.css` client changes are inert in the live game until the client bundle is rebuilt (`npm run build:client`) and the server restarted — the bundle is gitignored, so this commit does not ship the running display. Affects the deploy step (rebuild + `launchctl kickstart -k` per prod topology). The server-side `reinforceBreakdown` contract and all tests are unaffected. *Found by Dev during implementation.*

## Design Deviations

No design deviations at setup.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- No deviations from spec. Tests assert the `reinforceBreakdown` contract exactly as the story context describes (`{ base, continents:[{name,armies}], tradeIn?, territoryBonus?:{territory,armies} }`), exercised through `riskPublicView` (the client-facing surface named in AC-1/AC-4) rather than a private helper, to avoid over-constraining the implementation's internal structure.

### Dev (implementation)
- **Muster rendered in ActionBar.tsx, not CardTray.tsx**
  - Spec source: context-story-E5-6.md, Technical Approach
  - Spec text: "Client (`src/clients/risk/CardTray.tsx` / the reinforce UI): render the itemized list … `CardTray` already surfaces `nextTradeBonus`, so it's the natural home for muster details."
  - Implementation: rendered the itemized muster in `ActionBar.tsx`, under the "Place N regiments" deploy prompt, not in `CardTray.tsx`.
  - Rationale: the pool total the breakdown explains is displayed in ActionBar; the itemized ledger belongs adjacent to the number it decomposes. CardTray owns the card hand + trade-in control — a related but separate concern. The story explicitly allowed "the reinforce UI" as the alternative to CardTray, and ActionBar is that UI.
  - Severity: minor
  - Forward impact: none — the `reinforceBreakdown` contract field is component-agnostic; no sibling story depends on which component renders it. AC-4's wiring test asserts consumption by any `src/clients/risk` source, which ActionBar satisfies.

### Reviewer (audit)
- **Muster rendered in ActionBar.tsx, not CardTray.tsx** → ✓ ACCEPTED by Reviewer: sound. The story text names "`CardTray.tsx` / **the reinforce UI**" — ActionBar *is* the reinforce deploy UI and is where the pool total the ledger explains is displayed. Placing the breakdown adjacent to the number it decomposes is the better legibility choice for this story. No sibling story or test constrains the render location (AC-4 checks any `src/clients/risk` source). No forward impact.
- No undocumented deviations found: the diff matches the story's technical approach (server view computes the breakdown, contract carries the shape, the reinforce UI renders it). `tradeIn`-as-residual and the `end-turn`-scoped log scan are implementation choices consistent with TEA's guidance, not spec deviations.

## TEA Assessment

**Tests Required:** Yes
**Reason:** 3pt feature adding a new view contract field with real computation (base/continent math, sum invariant, log-sourced territory bonus). Not a chore-bypass candidate.

**Test Files:**
- `test/risk-reinforce-breakdown.test.js` — 13 tests over the `reinforceBreakdown` contract, exercised through `riskPublicView`.

**Tests Written:** 13 tests covering all 5 ACs
**Status:** RED (12 failing, 1 guard-passing — see note below; ready for Dev)

**AC coverage:**
- **AC-1** (itemized breakdown exists): shape test — `reinforceBreakdown` present in reinforce phase with numeric `base` + array `continents`.
- **AC-2** (sums correctly): two tests — `base + Σcontinents == pool` (no trade) and `base + Σcontinents + tradeIn == pool` (with trade); the on-territory `+2` is explicitly excluded from the pool sum.
- **AC-3** (continents named): single-continent (`{name:'Africa', armies:3}`, bonus NOT folded into base) and multi-continent tests, plus base-math edges (floor to 3; 1-per-3 scaling).
- **AC-4** (displayed): two static wiring guards — the `RiskView` contract declares `reinforceBreakdown`, and a `src/clients/risk` source consumes it. (No vitest/render harness exists in this repo; the node suite covers server + wiring. Full visual render is a reviewer/playtest check.)
- **AC-5** (territory line reads E5-2 data): present case (`territoryBonus:{territory,armies}` from the log entry), absent-on-no-match case (set bonus shown, territory line cleanly absent), and a stale-guard (a prior turn's trade-in must not leak into the current muster — forces scoping to trade-ins since the last `end-turn`).

**Note on the 1 passing test:** "the breakdown is scoped to the reinforce phase; other phases omit it" passes trivially in RED (the field is undefined everywhere today). It is a real guard once implemented — it holds Dev to NOT exposing the muster outside the reinforce phase. Kept deliberately.

**Implementation guidance for Dev (Trillian):**
- Compute the breakdown in `plugins/risk/server/view.js`, gated on `state.phase === 'reinforce'`, for `state.currentPlayer`. Attach as `view.reinforceBreakdown`; omit (leave undefined) in other phases.
- `base = Math.max(3, Math.floor(owned/3))`; `continents` = `{name: CONTINENTS[key].name, armies: CONTINENTS[key].bonus}` for each fully-owned continent (empty `[]` when none — the tests require `[]`, not `undefined`).
- `tradeIn` = pool residual (`reinforcePool − base − Σcontinents`); include only when `> 0`. See the delivery finding — the set bonus isn't stored on the log entry, so residual is the source.
- `territoryBonus` = `{territory: bonusTerritory, armies: bonusArmies}` from the most recent `trade-in` log entry **in the current muster** (scan entries after the last `end-turn`); omit when no `+2` fired or no trade this muster. Must NOT be added to the pool sum.
- Contract: add `reinforceBreakdown?` to `RiskView` in `src/clients/shared/contracts/risk.ts`; render the itemized muster in the reinforce UI (`CardTray.tsx` is the natural home — it already surfaces `nextTradeBonus`).

### Rule Coverage (lang-review: javascript.md)

| Rule | Test(s) | Status |
|------|---------|--------|
| #4 equality/coercion (0-falsy, `[]` vs `undefined`, `??` over truthy) | `continents is always an array…`, `AC-2 …no set was traded`, `AC-5 …no owned-territory match`, `AC-5 …previous turn does not leak` | failing (guards absent/zero distinctly, not via truthiness) |
| #8 test quality (no vacuous assertions) | self-check across all 13 tests | pass (self) |

**Rules checked:** 2 of 13 applicable — the remaining lang-review rules (silent errors, async pitfalls, prototype pollution, DOM/XSS, node security, regex, module scope, error objects, input validation, dependency hygiene, fix-regressions) are N/A to a pure read-only view computation over trusted engine state.
**Self-check:** 0 vacuous tests found — every test asserts concrete values (`base===3`, `tradeIn===4`, `deepEqual` on the continent/territory objects), so the sum-invariant assertions retain teeth even if Dev derives `tradeIn` as the residual.

**Handoff:** To Dev (Trillian) for implementation (GREEN).

## Dev Assessment

**Implementation Complete:** Yes (commit `e4a57d5`, pushed to main)

**Files Changed:**
- `plugins/risk/server/view.js` — `reinforceBreakdown(state)` + `currentMusterTerritoryBonus(state, playerIdx)` helpers; the breakdown is attached to the public view only when `state.phase === 'reinforce'`, computed for `state.currentPlayer`. base = `max(3, floor(owned/3))`; `continents` = `{name, armies}` per fully-owned continent (`[]` when none); `tradeIn` = pool residual `reinforcePool − base − Σcontinents` (included only when `> 0`); `territoryBonus` = `{territory, armies}` from the current muster's `trade-in` log entry, scanning back only to the last `end-turn` so a prior turn can't leak.
- `src/clients/shared/contracts/risk.ts` — new `ReinforceBreakdown` interface + optional `reinforceBreakdown` field on `RiskView`.
- `src/clients/risk/ActionBar.tsx` — itemized muster ledger (`data-testid="muster-breakdown"`) under the reinforce deploy prompt: `N base · +x <Continent> · +y trade-in set · +z on <Territory>`.
- `plugins/risk/client/style.css` — `.muster` styling scoped under `#risk-root` (the high-specificity checked-in sheet) so the ledger reads as compact chips, not raw browser bullets.

**Tests:** GREEN.
- Node gate (`npm test`): 1411/1412 passing, 1 pre-existing skip; all 13 E5-6 tests pass.
- Client vitest (`npm run test:client`): 296/296 passing — `ActionBar.tsx` and the contract change verified against `action-bar.test.tsx` and `contracts-risk.test.ts`.

**Self-review:**
- Wired to front end: yes — `ActionBar` consumes `view.reinforceBreakdown` and renders it; contract carries the type.
- AC-2 invariant holds by construction: `tradeIn` is the residual, so base + Σcontinents + tradeIn ≡ pool; the on-territory `+2` is deliberately excluded from that sum (it's a placement, not pool armies).
- Rules (javascript.md): absence is expressed with `!= null` / explicit `> 0`, not truthiness (guards the 0-falsy trap); `continents` is always `[]` not `undefined`; no silent catches, no async, no user-input surface (pure read over trusted engine state).
- **Deploy note:** the client display needs a bundle rebuild + server restart to appear in the live game (see Delivery Findings) — the server contract and tests are already complete.

**Branch:** main (trunk-based), pushed.

**Handoff:** To the next phase (verify/review).

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings |

**All received:** Yes (1 enabled subagent returned clean; 8 disabled via `workflow.reviewer_subagents` settings)
**Total findings:** 3 confirmed (all LOW, non-blocking, Reviewer's own), 0 dismissed, 0 deferred

### Rule Compliance (lang-review: javascript.md)

Diff is `.js` (view.js), `.ts`/`.tsx` (contract, ActionBar) and `.css`. Enumerated every applicable numbered check against the changed code:

- **#1 silent error swallowing** — compliant: no try/catch, no `.catch`, no `JSON.parse`. `reinforceBreakdown`/`currentMusterTerritoryBonus` are pure synchronous reads.
- **#2 async pitfalls** — N/A: no async/promises introduced.
- **#3 prototype pollution** — compliant: no `Object.assign`/bracket-writes from user input; `state.territories?.[id]` is a read with a static continent id from `CONTINENTS`, not user-keyed.
- **#4 equality/coercion** — compliant, and this was the highest-risk check for this diff: `owner === playerIdx` (strict), `e.bonusTerritory != null` (deliberate null/undefined idiom), `if (tradeIn > 0)` (explicit numeric guard, NOT `if (tradeIn)` — correctly avoids the 0-falsy trap), `tradeIn != null` in the JSX. `continents` is always `[]`, never `undefined`, so the client `.map` needs no truthy guard.
- **#8 test quality** — compliant: 13 tests, all with concrete assertions (`equal`/`deepEqual` on real values); no `.only`/`.skip`, no vacuous truthy checks. Verified by reading the test file.
- **#9 module scope** — compliant: `const`/`let` only; the new `map.js` import is pure (no side effects); no circular dependency (view.js already imports from actions.js and state.js; adding map.js mirrors reinforcementFor's own imports).
- **#10 error handling** — N/A: no thrown errors introduced.
- **#5 DOM/XSS, #6 node security, #7 regex, #11 input validation, #12 dependency hygiene** — N/A: no DOM sinks (`innerHTML`/`eval` absent; ActionBar renders via JSX text interpolation, auto-escaped), no shell/fs/env, no regex, no external input (pure read over trusted server state), no dependency changes.

**Verdict:** no rule violations.

### Devil's Advocate

Argue this is broken. The scariest claim is the `tradeIn`-as-residual: `reinforcePool − base − Σcontinents`. If `reinforcePool` were ever partially spent while still in the reinforce phase, the residual would go negative or wrong and the itemization would lie. So I traced the engine: `applyDeploy` (actions.js) is atomic — it applies every placement, sets `reinforcePool = 0`, and flips `phase = 'attack'` in one action; the client accumulates a local `pending.plan` and only POSTs the final deploy. There is no intermediate reinforce state with a decremented pool. At muster start the pool is exactly `reinforcementFor` (base+continents), and a trade-in only ever *adds*. So the residual is always ≥ 0 and equals the set-bonus total. The `if (tradeIn > 0)` guard means a negative can never be shown even in a corrupt state — it would just omit the line. Safe.

Second attack: the log scan. `currentMusterTerritoryBonus` walks backward and breaks at the first `end-turn`. What about turn 1, where no `end-turn` exists yet? The loop then scans to index 0 — but trade-ins can't occur during setup (cards are only awarded at end of a captured turn), so there is nothing to falsely match; it returns null and the residual is 0. What about a stale `+2` from last turn? The break-at-`end-turn` boundary excludes it — proven by the dedicated test. What about multiple trade-ins this muster? The set bonus aggregates correctly (residual sums them); only the most-recent `+2` territory is shown, but the contract is singular (`territoryBonus?`), so that's spec-conformant, not a bug — worst case a second matched-territory placement isn't itemized (the armies are still on the board, just not annotated).

Third: information leak. The breakdown is attached to every viewer's `view`, so does the opponent see my muster? The data is all already-public (territories, pool, log). And the ActionBar only renders the muster on `yourTurn` — the opponent's client short-circuits to the "Waiting" tray. No leak, no wrong-player display.

Fourth: a confused user. The `+2 on <Territory>` line sits outside the pool sum, which could read as if it should add up. The contract comment and the separate visual line ("on Brazil" vs the deploy pool) communicate it's a placement. Acceptable; a playtest can refine copy. Nothing here rises above LOW.

## Reviewer Assessment

**Verdict:** APPROVED

**Observations:**
1. [VERIFIED] `tradeIn` residual is always correct — `applyDeploy` (plugins/risk/server/actions.js:210-212) zeroes the pool and exits to attack atomically, so `reinforcePool` is never partially spent during reinforce; residual = set-bonus total. The `if (tradeIn > 0)` guard (view.js) also fails safe on any corrupt state.
2. [VERIFIED] Log-scan boundary is correct — `currentMusterTerritoryBonus` (view.js) breaks at the last `end-turn`; the stale-bonus test and turn-1 (no end-turn, no setup-phase trade-ins) both resolve to a clean `null`. Matches the engine's `end-turn` → new muster transition (actions.js:395-397).
3. [VERIFIED] No information leak / wrong-player render — breakdown data is all public (territories/pool/log); ActionBar renders the muster only under `yourTurn` (ActionBar.tsx:37-39 early-returns the Waiting tray for the opponent), gated additionally on `phase === 'reinforce'` so setup shows nothing.
4. [VERIFIED] base/continent math mirrors the engine's own `reinforcementFor` (actions.js:7-15): `max(3, floor(owned/3))` + named continent bonuses; SA=2/Africa=3 confirmed against map.js. Bonus is NOT folded into base (AC-3), proven by test.
5. [VERIFIED] Contract is sound — `ReinforceBreakdown` types match the server's returned shape exactly; `reinforceBreakdown?` optional aligns with phase-gated presence; client vitest (296/296) and `contracts-risk.test.ts` pass.
6. [VERIFIED] Layout is clean — `.lead` is not a flex container (`flex: 1 1 auto` is a flex-*item* property; style.css:484), so the muster `<ul>` (block) drops to its own line under the deploy prompt rather than crowding it.
7. [LOW][EDGE] Multiple trade-ins in one muster: the set bonus aggregates into one `tradeIn` line (correct) but only the most-recent matched-territory `+2` is itemized. Within the singular `territoryBonus?` contract — no fix required; note for a future multi-trade polish.
8. [LOW] `nameOf(territory) ?? territory` in ActionBar.tsx is a redundant fallback — `nameOf` already returns the id (never null) for a non-empty string. Harmless.
9. [LOW] The `+2 on <Territory>` line sits visually adjacent to the pool ledger though it is not part of the pool sum; copy could disambiguate in a playtest. Non-blocking.

**Data flow traced:** `state` (territories/reinforcePool/log/currentPlayer/phase) → `reinforceBreakdown(state)` in view.js (phase-gated) → `view.reinforceBreakdown` → `RiskView` contract → `ActionBar` itemized `<ul>` (yourTurn + reinforce only). Safe: all inputs are trusted public engine state; output is auto-escaped JSX text.
**Pattern observed:** good — derives everything from existing state rather than adding new engine bookkeeping (the residual + log-scan avoid a redundant stored field), matching the "presentation over recorded data" story frame at plugins/risk/server/view.js:6-53.
**Error handling:** defensive reads (`state.territories ?? {}`, `state.territories?.[id]?.owner`, `Array.isArray(state.log)`) — more robust than the engine's own `reinforcementFor`, which accesses `state.territories[id].owner` unguarded. No new failure modes.
**Security analysis:** no auth surface, no user input, no secrets, no DOM sinks; breakdown exposes only already-public data. Clean.
**Dispatch tags:** [EDGE] [SILENT] [TEST] [DOC] [TYPE] [SEC] [SIMPLE] [RULE] — all eight specialists disabled via settings; domains assessed directly by the Reviewer above (edge: residual + log-scan boundaries, multi-trade — found LOW #7; silent: no swallowed errors; test: 13 concrete assertions verified; doc: contract comments accurate; type: contract matches server shape; sec: clean; simplify: redundant `?? territory` — LOW #8; rule: javascript.md enumerated, no violations).

**Handoff:** To Slartibartfast (SM) for finish-story.