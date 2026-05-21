---
story_id: E2-10
jira_key: null
epic: E2
workflow: trivial
---
# Story E2-10: Risk cards client UI (hand tray, trade-in, must-trade prompt)

## Story Details
- **ID:** E2-10
- **Jira Key:** null (no external tracking)
- **Epic:** E2 (Risk LLM persona-style corpus and training)
- **Workflow:** trivial
- **Points:** 3
- **Priority:** p2
- **Stack Parent:** E2-8 (Risk cards engine mechanics)

## Story Context

Client UI for the Risk cards engine. The cards engine is fully implemented server-side (deck, award-on-capture, trade-in, escalating bonus) and the server already exposes the data via riskPublicView (plugins/risk/server/view.js):
- `view.hand` - the viewer's own cards, each {territory, type}
- `view.opponentCardCount` - count only, no identities

The React client at src/clients/risk/ (builds via vite into plugins/risk/client/app.js) currently renders NONE of it.

## Acceptance Criteria
- [x] Hand tray renders the player's own cards with type and territory name
- [x] Trade-in selector enables submit only for a valid set; shows the bonus army count it will grant
- [x] Must-trade modal blocks deploy actions when the player holds >=5 cards at reinforcement start
- [x] Opponent card count is shown; identities are never revealed client-side

## Scope & Implementation Notes

### 1. Hand Tray UI
Show player's own cards from `view.hand`:
- Each card: territory name + type (Infantry/Cavalry/Artillery/Wild)
- Layout: tray/rail pattern (reference: ContinentRail.tsx, ActionBar.tsx)
- Clickable to select for trade-in

### 2. Trade-in Selector & Validator
- Validates set shape before enabling submit (mirror plugins/risk/server/validate.js `isValidCardSet`):
  - Three-of-a-kind (same type)
  - Three distinct types
  - Any two + a wild
- Display the bonus army count the set grants (escalating: 4,6,8,10,12,15, then +5 each)
- Dispatch action: `{type:'trade-in', payload:{cardIndices:[...]}}`

### 3. Must-Trade Blocking Prompt
- When player holds >=5 cards at reinforcement start
- Server rejects deploy with "you must trade in a card set before deploying" at >=5 cards
- Modal blocks deploy actions until a valid set is traded in
- Prevents soft-lock scenario

### 4. Opponent Card Count
- Show count only via `view.opponentCardCount`
- Never reveal opponent card identities

## Relevant Client Files
- src/clients/risk/RiskApp.tsx
- src/clients/risk/ActionBar.tsx
- src/clients/risk/Header.tsx
- src/clients/risk/ContinentRail.tsx (pattern reference)

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-05-21T21:06:58Z
**Round-Trip Count:** 1

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-21 | 2026-05-21T20:42:22Z | 20h 42m |
| implement | 2026-05-21T20:42:22Z | 2026-05-21T20:50:17Z | 7m 55s |
| review | 2026-05-21T20:50:17Z | 2026-05-21T20:57:42Z | 7m 25s |
| implement | 2026-05-21T20:57:42Z | 2026-05-21T21:02:24Z | 4m 42s |
| review | 2026-05-21T21:02:24Z | 2026-05-21T21:06:58Z | 4m 34s |
| finish | 2026-05-21T21:06:58Z | - | - |

## Sm Assessment

**Setup Complete:** Yes
**Story:** E2-10 — Risk cards client UI (hand tray, trade-in, must-trade prompt)
**Workflow:** trivial (phased) — setup → implement → review → finish
**Repos:** g-1 (standalone); client source `src/clients/risk/`, builds via vite into `plugins/risk/client/app.js`
**Branch:** feat/E2-10-risk-cards-client-ui (created)
**Session File:** .session/E2-10-session.md (created)

**Scope:** Wire the already-working server cards engine into the React client. Server exposes `view.hand` + `view.opponentCardCount` (plugins/risk/server/view.js); the client renders none of it today. Build: (1) hand tray (type + territory), (2) trade-in selector validating set shape before enabling submit (mirror validate.js isValidCardSet) and dispatching `{type:'trade-in', payload:{cardIndices}}`, (3) blocking must-trade prompt at ≥5 cards to avoid the deploy soft-lock, (4) opponent count only.

**Context note for Dev:** This is a client-only feature — no server changes needed; the engine and `riskPublicView` are complete. Verify in a browser (the cards engine has no headless client test harness). The trade bonus escalation counter (`tradeInCount`) is global on game state, so the "bonus this set grants" display should read from current state, not a per-player counter.

**Handoff:** To Puck (Dev) for the implement phase.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/clients/risk/CardTray.tsx` (new) — hand tray, opponent count, trade-in selector (enabled only for a valid set, shows bonus), blocking must-trade modal at ≥5 cards
- `src/clients/risk/card-rules.ts` (new) — pure `isValidCardSet`/`cardLabel`/`cardTypeLabel`, mirrors server `validate.js`
- `src/clients/risk/RiskApp.tsx` — renders `<CardTray>` below ContinentRail
- `src/clients/shared/contracts/risk.ts` — added `nextTradeBonus?: number` to RiskView
- `plugins/risk/server/view.js` — derived `view.nextTradeBonus` (tradeInCount stays private)
- `plugins/risk/server/actions.js` — exported `tradeBonus`
- `plugins/risk/client/style.css` — tray + modal styling (antique theme)
- Tests: `test/client/CardTray.test.tsx` (10), `test/client/card-rules.test.ts` (7), `test/risk-cards-view.test.js` (+1)

**Tests:** Client 137/137; Server 936/937 (1 expected live-CLI skip). New: 18 cases. Client bundle rebuilt (`build:client`) — 36 modules, CardTray markup present.
**Branch:** feat/E2-10-risk-cards-client-ui (pushed)

**AC coverage:**
- Hand tray renders own cards (territory + type) — yes (`CardTray` + `cardLabel`)
- Trade-in enables only for a valid set + shows bonus — yes (`isValidCardSet` gate + `nextTradeBonus`)
- Must-trade modal blocks deploy at ≥5 cards — yes (blocking overlay, `role=dialog`)
- Opponent count only, no identities — yes (`view.opponentCardCount`; server still redacts hands/deck)

**Verification note:** Verified via component + unit tests (full RiskApp suite mounts the new CardTray wiring) and a production client build. I did **not** run a full authenticated in-browser play-through with a live card-holding game — that needs a seeded game + session. The running local server serves the rebuilt bundle from disk, so a browser refresh on an active Risk game will show it.

**Handoff:** To Portia (Reviewer) for the review phase.

### Dev rework (round 1 — addressing REJECTED review)

All blocking findings fixed; non-blocking ones cleared too.
- **[HIGH] index key** → stable `key={`${type}:${territory}:${i}`}` on the hand `<li>` (`CardTray.tsx`).
- **[HIGH] valid-set AC** → added `test/client/CardTray.test.tsx` "keeps trade-in disabled when three selected cards do NOT form a valid set".
- **[HIGH] duplicate modal DOM** → inline tray body gated with `!mustTrade`; new test asserts the modal is the sole renderer (exactly 5 cards / 1 button) via `within(modal)`.
- **Bonus find:** the new hand-reset test exposed a **real crash** — `validSet` indexed stale `selected` into a shrunken `hand` before the reset effect fired. Guarded with `selected.every(i => i < hand.length)`.
- **[MED] branches** → added deselection, selection-cap, hand-reset (rerender), non-contiguous payload, 4-card/off-phase no-modal, and `nextTradeBonus` table→formula boundary (n=5→15, n=6→20) tests.
- **[LOW]** removed/used the `within` import (tsc TS6133 gone — confirmed); documented the `cardIndices` ordering invariant.

**Tests:** Client 144/144 (was 137; +7 net); Server 936/937 (1 expected skip). `tsc -p tsconfig.client.json` no longer reports the CardTray unused-import error. Client bundle rebuilt.
**Branch:** feat/E2-10-risk-cards-client-ui (pushed, commit 2aa8309)
**Deferred (out of scope, recorded in Delivery Findings):** `TerritoryId` alias + `cardState?` sub-object (cross-cutting E2-8 contract); pre-existing vacuous `assert.ok` at risk-cards-view.test.js:57; absence of a `tsc` typecheck gate.

**Handoff:** To Portia (Reviewer) for re-review (round 2).

## Subagent Results — Round 1 (superseded by round 2)

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | server 936/937, client 137/137, 0 smells | N/A (GREEN) |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings — boundaries assessed manually |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings — error paths assessed manually |
| 4 | reviewer-test-analyzer | Yes | findings | 14 (5 high in-scope) | confirmed 6, deferred 8 |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings — comments reviewed manually |
| 6 | reviewer-type-design | Yes | findings | 7 (mostly low/cross-cutting) | confirmed 1, deferred 6 |
| 7 | reviewer-security | Yes | clean | none | N/A (CLEAN) |
| 8 | reviewer-simplifier | Yes | findings | 5 (1 high) | confirmed 2, deferred 3 |
| 9 | reviewer-rule-checker | Yes | findings | 4 (3 high in-scope, 1 pre-existing) | confirmed 3, deferred 1 |

**All received:** Yes (6 enabled returned, 3 disabled pre-filled)
**Total findings:** 3 blocking (High), several non-blocking confirmed, rest deferred (pre-existing/cross-cutting)

### Confirmed blocking findings (require rework)

- **[RULE][TYPE] HIGH — `key={i}` (array index) on the mutating hand list** (`src/clients/risk/CardTray.tsx:58`). A trade-in removes 3 cards mid-list and the survivors' indices shift; React reconciles `<li>` DOM nodes by key, so it reuses the wrong nodes (aria-pressed/focus/animation mismatch). The `handKey` effect resets selection *state* but does not fix DOM reconciliation. Fix: stable key, e.g. `` `${card.type}:${card.territory}:${i}` `` (index suffix disambiguates the two wilds).
- **[TEST] HIGH — the core AC "enables submit only for a valid set" is unverified.** No test selects an *invalid* 3-card combo (e.g. two infantry + one cavalry, no wild) and asserts the trade-in button stays disabled (`test/client/CardTray.test.tsx`). The happy path is tested; the negative — the actual guarantee — is not.
- **[TEST][SIMPLE] HIGH — must-trade modal renders a duplicate interactive surface, and its contents are untested.** Simplifier: when `mustTrade`, the normal tray body still mounts beneath the `position:fixed` modal, so hand cards + trade button (and their `data-testid`s) exist twice — an a11y/correctness defect. Fix: gate the body with `!mustTrade`. Test-analyzer: the modal test only asserts the modal element exists, not that its inner hand/disabled-button render — after the `!mustTrade` fix the modal becomes the sole renderer, so `within(modal)` assertions are required.

### Confirmed non-blocking (should fix in the same rework)

- **[TEST] Untested branches:** deselection (`toggle` filter branch), the 3-card selection cap, and the `handKey` hand-reset effect have no coverage; dispatch payload only tested with contiguous `[0,1,2]`; modal threshold not tested at 4 (one below) or in a non-reinforce phase; `nextTradeBonus` table→formula boundary (n=5→15, n=6→20) untested. (test-analyzer)
- **[RULE] Unused import:** `within` imported but never used (`test/client/CardTray.test.tsx:2`) — a real `tsc` error (TS6133, confirmed by `tsc --noEmit`), though no typecheck gate runs it. Remove it (or use it for the modal assertions above).
- **[TYPE] Document the `cardIndices` positional contract** (`CardTray.tsx` submit / contract): indices are stable only because the server hand is append-only and order-preserving; add a doc comment on the action type. Security confirmed the server re-validates, so no exploit — robustness only.
- **[SIMPLE] `handKey` over-engineered** — `hand.length` (or `JSON.stringify`) would do; minor.

### Dismissed / downgraded

- **[RULE][TYPE] `as any` on the test base fixture** (`CardTray.test.tsx:23`): downgraded to non-blocking — this matches the established test-fixture convention in `test/client/action-bar.test.tsx:9`. Recommend `Partial<RiskView>` but not blocking, as it is consistent with the sibling test pattern.
- **[TYPE] `TERRITORIES as Record<string,{name:string}>`** (`card-rules.ts:8`): matches the existing convention in `ActionBar.tsx:25` and `ContinentRail.tsx`; the `?.name ?? territory` fallback covers the undefined case at runtime. Consistent — non-blocking.

### Deferred (pre-existing or cross-cutting, out of scope for this 3-pt story)

- **[TYPE] `TerritoryId` literal-union alias** and **`cardState?` sub-object** (contract redesign) — cross-cutting changes to E2-8's established contract shape; the new code follows the existing optional-field convention. Worth a future contract-hardening story.
- **[RULE] Vacuous `assert.ok(disjunction)`** at `test/risk-cards-view.test.js:57` — pre-existing spectator assertion (E2-8), not introduced here.
- **[TYPE] `skipLibCheck`** and the pre-existing `RiskApp.tsx` `ResolvedCombat` tsc errors (lines 183-217) — predate this branch; not touched by E2-10.

### Rule Compliance (lang-review checklists, new code)

- **TS-6 React/JSX:** `key={i}` on a delete-able list — **VIOLATION** (blocking finding above). `useEffect` deps present; no `dangerouslySetInnerHTML`.
- **TS-1/TS-8 type-safety:** `as any` fixture (downgraded — convention); `within` unused import (TS6133 — confirmed, fix). No `@ts-ignore`/non-null assertions in source.
- **TS-4 null handling:** `??` used correctly; `bonus != null` correctly passes 0; strict equality throughout. PASS.
- **TS-7 async:** `post()` return intentionally not awaited (SSE-driven; type is `void | Promise<void>`). PASS.
- **JS (server) 1-13:** `tradeBonus` export + derived `nextTradeBonus` — pure, synchronous, strict-equality, no prototype-pollution (keyed by server state), no leaks. PASS.

### Devil's Advocate

Assume this is broken. The sharpest attack is the index-key bug: picture a 5-card must-trade. The player selects three, trades; the server removes those three and the hand re-renders with two cards now at indices 0–1. React, keying by `0..4`, reuses the old `<li>` nodes 0–1 — whose `aria-pressed`/CSS `.selected` state belonged to *different* cards. The `handKey` effect clears `selected`, so the logical state is fine, but the reused DOM can momentarily show stale selection styling or misplace focus — exactly the class of glitch index-keys cause, and it lands precisely on this feature's busiest interaction. That alone justifies the stable-key fix. Second: a confused user holding 5 cards sees the blocking modal — but because the body also renders beneath it, a screen-reader user tabs into *two* identical "Trade in set" buttons and two card lists; the duplicate is invisible to sighted users but real to AT. Third: is the AC actually met? "Enables submit only for a valid set" — the code gates on `isValidCardSet`, but no test proves an invalid trio stays disabled, so a regression that flipped the guard would ship green. Fourth, malicious client: forging `cardIndices:[99,99,99]` — server `validateTradeIn` rejects (bounds + dup + set), confirmed by the security pass; no hole. Conclusion: two genuine defects (index keys, dead modal body) and one unverified AC — all cheap to fix, none catastrophic, but collectively enough to send back.

## Reviewer Assessment — Round 1 (REJECTED, superseded by round 2)

**Verdict:** REJECTED

| Severity | Issue | Location | Fix Required |
|----------|-------|----------|--------------|
| [HIGH] | `key={i}` on a list that deletes items mid-array — wrong React reconciliation after a trade | `src/clients/risk/CardTray.tsx:58` | Use a stable key (`${card.type}:${card.territory}:${i}`) |
| [HIGH] | Core AC "enables submit only for a valid set" is unverified | `test/client/CardTray.test.tsx` | Add a test: 3 selected cards forming an invalid set → trade-in button stays disabled |
| [HIGH] | Must-trade modal duplicates the live tray body (a11y/duplicate DOM) + modal contents untested | `CardTray.tsx:107-124`, `CardTray.test.tsx:69` | Gate the normal body with `!mustTrade`; assert modal contents via `within(modal)` |
| [MEDIUM] | Untested branches: deselection, selection cap, hand-reset effect, non-contiguous payload, bonus boundary | `CardTray.test.tsx`, `risk-cards-view.test.js` | Add the missing cases |
| [LOW] | Unused `within` import (tsc TS6133) | `CardTray.test.tsx:2` | Remove (or use in modal assertions) |
| [LOW] | `cardIndices` positional contract undocumented | `CardTray.tsx` / contract | Add a doc comment on the ordering invariant |

**Subagent dispatch tags:** [EDGE] (disabled — manual: adversarial paths in Devil's Advocate, no new unhandled boundary beyond the index-key bug), [SILENT] (disabled — manual: no swallowed errors; `post()` floats intentionally per type), [TEST] (5 confirmed), [DOC] (disabled — manual: new comments accurate; contract needs the cardIndices note), [TYPE] (1 confirmed in-scope + cross-cutting deferred), [SEC] (clean — server re-validates, no leak, no XSS), [SIMPLE] (1 high confirmed: dead modal body), [RULE] (3 high confirmed: index key, unused import; 1 pre-existing deferred).

**Why REJECTED:** Two genuine correctness/quality defects in new code (index keys on a mutating list; duplicate interactive DOM under the modal) plus an unverified core AC (no negative test for the valid-set gate). None are security/data-critical, but per the rubric an unverified AC + real defects warrant rework, and all fixes are small and well-scoped.

**Handoff:** Back to Puck (Dev) for the implement-phase rework.

## Subagent Results

(Round 2 — re-review of the focused rework, incremental diff `2ffaab0..HEAD`.)

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | server 936/937, client 144/144, 0 smells | N/A (GREEN) |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings — assessed manually |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings — assessed manually |
| 4 | reviewer-test-analyzer | Yes | findings | all 7 round-1 gaps resolved; 4 low/med enhancements | confirmed 0 blocking, deferred 4 |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings — assessed manually |
| 6 | reviewer-type-design | Yes | findings | 3 (all low/advisory) | deferred 3 (non-blocking) |
| 7 | reviewer-security | Yes | clean | none | N/A (CLEAN) |
| 8 | reviewer-simplifier | Yes | findings | 2 (low/style) | deferred 2 (non-blocking) |
| 9 | reviewer-rule-checker | Yes | clean | 0 violations; both round-1 violations RESOLVED | N/A (CLEAN) |

**All received:** Yes (6 enabled returned, 3 disabled pre-filled)
**Total findings:** 0 blocking. All three round-1 blockers fixed and independently verified; remaining items are low/advisory enhancements.

### Round-1 blockers — verified resolved

- **[RULE][TYPE] index key** → `CardTray.tsx:72` now `key={`${card.type}:${card.territory}:${i}`}` (rule-checker: RESOLVED).
- **[TEST] valid-set AC** → test-analyzer confirms the invalid-set-stays-disabled test is genuine and non-vacuous.
- **[SIMPLE][TEST] duplicate modal DOM** → `!mustTrade` gate confirmed to remove the duplicate body; the `within(modal)` + global-count test proves exactly 5 cards / 1 button (no duplication). The unused `within` import is now used (rule-checker: RESOLVED).
- **Bonus:** the rework's own new test caught a real stale-index crash, now guarded — verified by security (no bypass) and type-design (type-sound).

### Non-blocking (deferred — recorded in Delivery Findings)

- [TEST] Optional depth: exercise the trade-in *submit* inside the modal (same JSX as the inline path, already interaction-tested); add an `n=4→12` bonus anchor. (test-analyzer, low/med)
- [SIMPLE] Pre-existing `?? []` in `handKey` is unreachable after the array guard; flatten the `!mustTrade && (ternary)` for readability. (low/style)
- [TYPE] Add a lower-bound (`i >= 0`) to the index guard / enable `noUncheckedIndexedAccess`. (low/advisory)

### Rule Compliance (round 2)

Rule-checker: 26 checks, 0 violations on the rework lines. Both round-1 violations (TS-6 key, TS-8 unused import) RESOLVED. New lines: `??` not `||`, strict equality, stable React key, no `any`/casts, `useEffect` deps a stable primitive, `post()` float intentional per its `void | Promise<void>` type, test assertions specific (no vacuous/`.only`/`.skip`). PASS.

### Devil's Advocate (round 2)

The rework is small, so the attack surface is the fixes themselves. Could the `!mustTrade` gate hide the tray when it shouldn't? No — `mustTrade` requires `canTrade && hand.length>=5`; off-turn/off-phase/<5 all leave the body rendered, and the new no-modal tests pin exactly those cases. Could the stable key now collide? Two non-wild cards in one hand share a territory only via a malformed payload; the `:i` suffix makes the key unconditionally unique regardless, so reconciliation is safe even then. Could the stale-index guard wrongly *block a legitimate trade*? Only when a selected index is ≥ the current hand length — i.e. the hand already shrank — in which case the selection is genuinely stale and the reset effect clears it the same tick; a real selection against the current hand always satisfies `i < hand.length`. Does the guard let a forged out-of-range trade through? No — it makes `validSet` false (blocks the client send), and the server re-validates regardless (security confirmed). The remaining nits are cosmetic. Nothing rises to blocking.

## Reviewer Assessment

**Verdict:** APPROVED

**Data flow traced:** unchanged from round 1 and still safe — `game_type`/hand from server view → `CardTray` selection (now bounds-guarded) → `{type:'trade-in', cardIndices}` → server `validateTradeIn` (authoritative). The rework only hardened the client.

**Pattern observed:** stable composite React key on the hand list (`CardTray.tsx:72`); `!mustTrade` gate makes the modal the sole renderer when forced (`:121`); stale-index guard on `validSet` (`:41`).

**Error handling:** stale selection indices no longer crash render; the reset effect clears them; server rejects any forged trade.

**Subagent dispatch tags:** [EDGE] (disabled — manual: Devil's Advocate covers the gate/key/guard boundaries), [SILENT] (disabled — manual: no swallowed errors), [TEST] (all round-1 gaps resolved; 4 non-blocking enhancements deferred), [DOC] (disabled — manual: new comments accurate; `cardIndices` invariant now documented), [TYPE] (3 low/advisory, deferred), [SEC] (CLEAN), [SIMPLE] (2 low/style, deferred), [RULE] (CLEAN — both round-1 violations resolved).

**Why APPROVED:** All three round-1 blockers are fixed and independently verified; the rework itself surfaced and fixed a real crash. No Critical/High findings remain — only low/advisory enhancements, recorded as non-blocking follow-ups. Tests GREEN (client 144/144, server 936/937).

**Handoff:** To Prospero (SM) for finish-story.

## Delivery Findings

### Dev (implementation)
- No upstream findings during implementation.

### Reviewer (code review)
- **Gap** (blocking): Core AC "enables submit only for a valid set" has no negative test. Affects `test/client/CardTray.test.tsx` (add invalid-set-stays-disabled case). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): Territory IDs are stringly-typed across the contract; a `TerritoryId = keyof typeof TERRITORIES` alias would catch misspellings at compile time — cross-cutting, suggest a future contract-hardening story. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): No `tsc` typecheck gate runs in the pipeline, so type errors (e.g. unused imports, pre-existing `RiskApp.tsx` `ResolvedCombat` mismatches) ship undetected. Consider adding a `typecheck` script + gate. *Found by Reviewer during code review.*
- **Improvement** (non-blocking, round 2): Optional test depth — exercise the trade-in *submit* from inside the must-trade modal, and anchor the bonus table with `n=4→12`. Affects `test/client/CardTray.test.tsx`, `test/risk-cards-view.test.js`. *Found by Reviewer during round-2 re-review.*
- **Improvement** (non-blocking, round 2): Cosmetic cleanups — drop the unreachable `?? []` in `handKey`, flatten the `!mustTrade && (ternary)`, add a lower-bound to the index guard (or enable `noUncheckedIndexedAccess`). Affects `src/clients/risk/CardTray.tsx`. *Found by Reviewer during round-2 re-review.*

## Impact Summary

**Upstream Effects:** 1 findings (1 Gap, 0 Conflict, 0 Question, 0 Improvement)
**Blocking:** 1 BLOCKING items — see below

**BLOCKING:**
- **Gap:** Core AC "enables submit only for a valid set" has no negative test. Affects `test/client/CardTray.test.tsx`.


### Downstream Effects

- **`test/client`** — 1 finding

### Deviation Justifications

1 deviation

- **Added a server-side derived field despite the "client-only" setup note**
  - Rationale: AC requires the trade-in control to "show the bonus army count it will grant," which depends on the private `tradeInCount`. Exposing only the derived `nextTradeBonus` satisfies the AC while keeping the raw counter private. Story AC outranks the SM context note (spec-authority hierarchy).
  - Severity: minor
  - Forward impact: minor — additive optional view field; no consumer breakage. E2-9 (cards-aware AI) is server-side and unaffected.

## Design Deviations

### Dev (implementation)
- **Added a server-side derived field despite the "client-only" setup note**
  - Spec source: session SM Assessment context note ("client-only feature — no server changes needed")
  - Spec text: "This is a client-only feature — no server changes needed; the engine and riskPublicView are complete."
  - Implementation: Added `view.nextTradeBonus` to `riskPublicView` (+ exported `tradeBonus`, + contract field), because `riskPublicView` deliberately strips `tradeInCount`, leaving the client no way to compute the escalating bonus.
  - Rationale: AC requires the trade-in control to "show the bonus army count it will grant," which depends on the private `tradeInCount`. Exposing only the derived `nextTradeBonus` satisfies the AC while keeping the raw counter private. Story AC outranks the SM context note (spec-authority hierarchy).
  - Severity: minor
  - Forward impact: minor — additive optional view field; no consumer breakage. E2-9 (cards-aware AI) is server-side and unaffected.

### Reviewer (audit)
- **Dev's `nextTradeBonus` server-side addition** → ✓ ACCEPTED by Reviewer: the AC ("shows the bonus it will grant") genuinely requires data the view stripped; exposing only the derived figure (not the raw `tradeInCount`) is the right call and security confirmed it leaks nothing beyond the already-public bonus schedule. Story AC correctly outranks the SM context note.
- No undocumented spec deviations found. The rejection is for code-quality/test-coverage defects (index keys, duplicate modal DOM, missing valid-set negative test), not spec divergence.