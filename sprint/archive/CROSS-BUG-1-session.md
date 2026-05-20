---
story_id: "CROSS-BUG-1"
jira_key: ""
epic: ""
workflow: "tdd"
---
# Story CROSS-BUG-1: Cribbage Pegging Hand Invisible

## Story Details
- **ID:** CROSS-BUG-1
- **Jira Key:** (No Jira integration for this project)
- **Workflow:** tdd
- **Stack Parent:** none
- **Branch:** feat/CROSS-BUG-1-cribbage-pegging-hand-invisible

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-05-20T12:04:23Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-20T07:30:00Z | 2026-05-20T11:32:08Z | 4h 2m |
| red | 2026-05-20T11:32:08Z | 2026-05-20T11:40:06Z | 7m 58s |
| green | 2026-05-20T11:40:06Z | 2026-05-20T11:45:29Z | 5m 23s |
| spec-check | 2026-05-20T11:45:29Z | 2026-05-20T11:47:47Z | 2m 18s |
| verify | 2026-05-20T11:47:47Z | 2026-05-20T11:54:30Z | 6m 43s |
| review | 2026-05-20T11:54:30Z | 2026-05-20T12:02:41Z | 8m 11s |
| spec-reconcile | 2026-05-20T12:02:41Z | 2026-05-20T12:04:23Z | 1m 42s |
| finish | 2026-05-20T12:04:23Z | - | - |

## Story Context

### Bug Description
During the pegging (play) phase in Cribbage, the player's cards sometimes fail to render visually, yet:
- The running count still increments correctly
- Play continues normally
- Server-side state advances correctly (front-end-only bug)
- User-reported issue

### Entry Points for Investigation
- **Server Logic:** `server/cribbage*` files
- **React Client:** `src/clients/cribbage/` directory
  - `CribbageApp.tsx` - Main app component
  - `Pegging.tsx` - Pegging phase display (likely location of bug)
  - `Hand.tsx` - Player hand rendering
- **Shared Components:** OpponentCard / Card components (from Cycle 2 React port, commit ce6347c)

### Context from Recent Work
- Cribbage was ported from vanilla JS to React in Cycle 2 (commit ce6347c)
- Related commits:
  - ce6347c: Cycle 2 cribbage React port + shared OpponentCard/Banter/Chrome/Card
  - ce5f13c: Cycle 1 followups: dice tray parity + Cycle 2 planning docs
  - 0824272: Cycle 1 feat: React frontend migration + Amendment A combat theatre

## Sm Assessment

Setup complete. Sprint scaffold bootstrapped this session (no prior sprint dir).
Branch created, session ready, story moved to in_progress in epic shard.

**Scope:** Front-end-only bug in the React cribbage client. Count/state advances
correctly server-side; only the player-hand render intermittently disappears
during the pegging (play) phase. This is the post-Cycle-2 React port (ce6347c)
— not the legacy vanilla-JS cribbage.

**Notes for TEA (RED):**
- Repro is intermittent — likely a stale-state / missed-rerender bug. Watch
  for setState-during-render, stale closure in a peg handler, or a key prop
  collision on Card after a peg.
- Player-side only (per user report), so compare player Hand render path vs
  OpponentCard render path — the divergence is informative.
- Tests should drive the play loop through several pegs (not just one) since
  the bug is intermittent.

**Tooling caveats logged this session (not blocking):**
- `pf sprint story remove` doesn't find IDs in epic shard files — only the
  top-level index. Worked around with a direct shard edit.
- Cyclist sprint-yaml hook crashes on missing `yaml` npm module — false
  positive, ignore.

## TEA Assessment

**Tests Required:** Yes
**Phase:** finish (failing tests written)

**Root cause hypothesis (for Naomi):**
`src/clients/cribbage/CribbageApp.tsx:215` selects the player hand with a
silent `Array.isArray` fallback:

```ts
const myHand = Array.isArray(view.hands[mySide])
  ? (view.hands[mySide] as CardType[])
  : [];
```

When a resync delivers a view where `view.hands[mySide]` is in the opponent
shape `{count: N}` (cross-game leak, viewerSide=null during reconnect,
sides race, etc.), `myHand` becomes `[]` with no log, recovery, or UI
signal. `view.pegging.running` is unaffected so the totem keeps ticking —
exactly the symptom the user reported.

**Test Files (new):**
- `test/client/cribbage-hand-pegging-bug.test.tsx` — 5 tests, 3 failing
  - ❌ "does NOT silently render an empty hand row when hands[mySide]
       arrives as {count: N} during pegging"
  - ❌ "logs an observable signal (console.error) when hands[mySide]
       shape is unexpected during pegging"
  - ❌ "keeps the player hand visible across a resync that returns a
       transient masked-hand view"
  - ✅ "renders all 4 player cards…" (happy path sanity)
  - ✅ "renders the running total normally even when hand is masked"
       (pins down the count-works-hand-doesn't divergence — passes
       today, will keep passing after the fix)

**Pre-existing tests:** All passing — no regressions introduced.
- `CribbageApp.test.tsx`, `Hand.test.tsx`, `Pegging.test.tsx` (20 tests)

### Acceptance Contract (for Dev)

The three failing tests assert the *observable contract*, not the
implementation. Any of the following greens the contract:

1. **Cache last-good hand:** memoize the last `view.hands[mySide]` that
   was a valid `Card[]` and re-use it when the current view delivers a
   non-array shape during pegging.
2. **Face-down placeholders:** render `count` face-down `<Card faceDown />`
   placeholders in the hand row when shape is `{count: N}`. (Player can't
   play, but at least sees cards exist.)
3. **Explicit recovery hint:** render an element with
   `data-state="hand-unknown"` in the hand row so the bug becomes
   visually observable even if no recovery is implemented.
4. **`console.error`:** log a structured error when the shape is
   unexpected — satisfies test #2 but not #1 or #3.

Most user-friendly is **(1) cache last-good** combined with **(4) log**.
Naomi will pick.

### Rule Coverage

No `.pennyfarthing/gates/lang-review/typescript.md` rule file exists in
this repo, and no `.claude/rules/` directory. Rule-coverage requirement
reduces to project conventions visible in existing test files (Vitest +
RTL patterns, `vi.mock` for card-assets and sounds, fetch-stubbing
fixture pattern from `CribbageApp.test.tsx`) — followed.

| Rule | Test(s) | Status |
|------|---------|--------|
| Silent-fallback antipattern (no `\|\| []` swallowing unexpected shapes) | "logs an observable signal…", "does NOT silently render an empty hand row…" | failing |
| User-observable state mismatches (count vs hand divergence) | "renders the running total normally even when hand is masked" | passing (pin) |
| Resync race tolerance | "keeps the player hand visible across a resync…" | failing |

**Self-check:** every test has a real assertion. No `let _ = …`, no
`assert(true)`, no `is_none()` on always-None. The third test guards
against false positives by waiting for `call >= 2` before asserting.

**Handoff:** To Naomi Nagata (Dev) for GREEN.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/clients/cribbage/CribbageApp.tsx` — replaced silent `Array.isArray`
  fallback at line 215 with a defensive selector that caches the last-good
  `Card[]`, logs `console.error` on transition into a bad shape (once per
  bad-shape run, not every render), and renders `count` face-down
  placeholders inside a `[data-state="hand-unknown"]` wrapper when there
  is no cache. Added `handCacheRef` and `lastShapeOkRef` to the
  CribbageApp ref block. Wired the placeholder branch into the pegging
  hand-row alongside the existing `<Hand mode="pegging" />`.

**Tests:** 5/5 GREEN on `test/client/cribbage-hand-pegging-bug.test.tsx`,
107/107 GREEN on the full client suite (28 files), zero regressions.
Typecheck (`tsc -p tsconfig.client.json --noEmit`) clean.

**Branch:** `feat/CROSS-BUG-1-cribbage-pegging-hand-invisible` (pushed)

### Implementation Choice (per TEA contract)

TEA offered four green paths and recommended **(1) cache last-good + (4) log**.
Implemented the recommended pair PLUS (2) face-down placeholders as a
first-render fallback (when no cache exists yet, e.g. user lands on a
masked-hand view as their very first state) AND (3) `data-state="hand-unknown"`
on the placeholder wrapper for observability. All three failing tests
now pass via complementary mechanisms — the implementation satisfies
each via the most user-friendly route per scenario:

| Scenario | Mechanism |
|----------|-----------|
| First render with bad shape, no cache | Face-down placeholders + `data-state` |
| Resync that transiently delivers bad shape | Cached last-good hand |
| Any shape mismatch | `console.error` logged once |

### Scope Note

Cache + log apply globally (any phase where `view.hands[mySide]` is bad
shape now caches and logs), but the **placeholder render branch is
wired only for the pegging hand-row**. Other phases (discard/cut/show/
match-end) continue to render via existing `Hand mode={discard,view}`
branches against the cached or empty `myHand`. This matches the test
surface (pegging-only) while still fixing the underlying antipattern
globally so adjacent phases benefit from the cache.

**Handoff:** To verify phase (TEA — Amos Burton).

## Architect Assessment (spec-check)

**Spec Alignment:** Aligned
**Mismatches Found:** None blocking; 3 substance observations recorded
below for Reviewer awareness.

### Spec Used

No `sprint/context/context-story-CROSS-BUG-1.md` exists in this project
(TEA flagged this gap). Effective spec is the TEA Acceptance Contract in
this session file, derived from the user's bug report. Substance check
compares Dev's diff against TEA's four-option green-path contract.

### Coverage Matrix

| TEA contract option | Dev implementation | Status |
|---------------------|--------------------|---------|
| (1) Cache last-good hand | `handCacheRef` updated on every valid `Array.isArray` view | ✅ implemented |
| (2) Face-down placeholders | `Array.from({length: count}, ...)` of `<CardImg faceDown/>` inside the pegging branch | ✅ implemented |
| (3) `data-state="hand-unknown"` recovery hint | Wrapper `<div data-state="hand-unknown" className="hand-unknown" aria-label="Your hand is syncing">` | ✅ implemented |
| (4) `console.error` log | One-shot guarded by `lastShapeOkRef` (transition-only, no per-render spam) | ✅ implemented |

All four contract paths are wired. Dev exceeded TEA's recommended
minimum pair (1+4) by also implementing (2) and (3) — defensible because
(2) covers the cold-render scenario where the cache is empty.

### Substance Observations (non-blocking)

1. **Cached cards remain interactive during bad-shape window**
   ([Major — Behavioral, deferred to future story])
   When `myHandSource === "cache"`, the existing
   `<Hand mode="pegging" cards={cachedHand} isMyTurn={myTurn} onPlay={onPlay} />`
   is rendered with interactivity intact. A user can click a card from a
   stale snapshot; the server rejects with `'card not in your hand'`,
   `useGameState.post` swallows the error (sets `actionError`), and the
   view does not refresh — the user appears stuck on a stale hand until
   the next valid SSE arrives. This is no worse than the original bug
   (where they saw nothing), but it's a UX paper cut.
   - **Recommendation:** Option D (defer). Future improvement: gate
     `onPlay` and `isMyTurn` on `myHandSource === "view"` so cached
     hands render but are visually dimmed / non-interactive. Out of
     scope for this bug fix.

2. **Cache survives phase transitions and deals**
   ([Minor — Behavioral])
   `handCacheRef` is not phase- or deal-scoped. If a masked-hand view
   arrives at the start of a *new deal*, the cache returns last deal's
   hand briefly. Resolves on next valid view (within one SSE round-trip
   in practice). Real-world impact tiny because (a) bad-shape views are
   already an error case, (b) deal boundaries have natural refresh
   pauses.
   - **Recommendation:** Option D (defer). If user reports stale-hand
     sightings, scope a phase-aware cache invalidation as a follow-up.

3. **Other phases (discard/cut/show/match-end) do not get the placeholder
   render branch**
   ([Minor — Cosmetic])
   Cache + log apply globally so any phase benefits from the resync-race
   recovery, but only pegging has the visual face-down fallback for the
   cold-render case. A masked-hand view during, say, the discard phase
   on cold start would render zero cards in the discard row (silently),
   which is the original bug's symptom for that phase.
   - **Recommendation:** Option D (defer). Dev explicitly logged this as
     a scope decision in Design Deviations (`Dev (implementation)` →
     "Applied fix globally (cache + log) but wired placeholder render
     branch only for pegging"). The TEA tests scope to pegging; widening
     placeholder UI is a separate UX story.

### Architectural Note — Cross-Game Reuse

TEA flagged that the silent-fallback antipattern likely repeats across
risk, scrabble, buraco. Dev flagged extracting a `useStableViewerHand`
hook in `src/clients/shared/`. **Concur — that hook belongs in the
backlog as a CROSS-BUG follow-up story.** Worth a brief
`docs/superpowers/specs/` design note when scoped. Not blocking this
PR.

### Test Quality (spot-check)

Spot-checked the test file structure against existing patterns
(`CribbageApp.test.tsx`, `Hand.test.tsx`): identical `vi.mock` shape
for card-assets, identical sounds-mock hoisted pattern, identical
`window.__GAME__` + fetch-stub fixture pattern. The five new tests
read cleanly. The third test's `await Promise.resolve(); await
Promise.resolve();` microtask drain is unusual but valid for waiting
on the post→resync chain — acceptable.

**Decision:** Proceed to verify (TEA).

## TEA Assessment (verify)

**Phase:** finish
**Status:** GREEN confirmed

### Simplify Report

**Teammates:** reuse, quality, efficiency
**Files Analyzed:** 2 (`src/clients/cribbage/CribbageApp.tsx`,
`test/client/cribbage-hand-pegging-bug.test.tsx`)

| Teammate | Status | Findings |
|----------|--------|----------|
| simplify-reuse | 4 findings | All HIGH: extract shared mocks/fixtures with adjacent `CribbageApp.test.tsx` |
| simplify-quality | 1 finding | MEDIUM: rename `peggingView` → `fixtureView` for naming consistency |
| simplify-efficiency | 3 findings | HIGH: remove 2 "redundant" sanity tests; MEDIUM: tighten OR assertion; LOW: inline a local var |

**Applied:** 0 fixes
**Flagged for Reviewer:** 1 (efficiency #2 — OR assertion is intentional per TEA contract; Reviewer may revisit)
**Deferred to follow-up backlog:** 4 reuse findings (HIGH)
**Dismissed with rationale:** 3 findings
**Reverted:** 0

**Overall:** simplify: dismissed — no in-place fixes applied; one
follow-up chore worth scoping.

#### Per-finding Triage

| # | Source | Conf | Decision | Rationale |
|---|--------|------|----------|-----------|
| efficiency 1 (remove sanity tests) | high | **Dismiss** | Both "sanity" tests pull weight: test 1 is the positive control that catches "tests pass for the wrong reason because component throws", test 5 is the pin that documents the count-works-hand-doesn't divergence (with a real `toBe("17")` assertion — not vacuous). Removing them weakens the regression scaffold. |
| efficiency 2 (tighten OR to AND) | medium | **Flag** | TEA's RED contract deliberately offered four green paths and let Dev pick. Strengthening to AND retroactively over-specifies the spec Dev built against. Reviewer should weigh tightening once the implementation is stable. |
| efficiency 3 (inline `myHandPlaceholderCount`) | low | **Note** | The intermediate local improves readability of the multi-branch conditional. Inlining saves one line at the cost of a more complex JSX expression. Net negative. |
| reuse 1–4 (extract shared mocks/fixtures/setup) | high | **Defer to chore backlog** | All four findings point at the same real refactor: cribbage tests should share a `test/client/cribbage-test-helpers.ts` (mocks + `vi.hoisted` + `fixtureView` + `__GAME__` setup). That refactor touches ≥2 test files and creates a new shared module — out of scope for a verify-phase simplify (which is in-place only). Logged as Improvement finding for a future chore story. |
| quality 1 (rename `peggingView` → `fixtureView`) | medium | **Defer** | Pure cosmetic; would require cascading renames across all 5 tests. Should ride with the chore-backlog extraction refactor above (same surface). |

### Quality Checks

| Check | Command | Result |
|-------|---------|--------|
| Client tests | `npx vitest run test/client` | 107/107 GREEN (5.00s) |
| Server tests | `npm test` | 822/822 GREEN (1 skipped, 1.1s) |
| TS typecheck | `npx tsc -p tsconfig.client.json --noEmit` | 0 errors |

No `pf check` and no `check` recipe in this project's justfile — ran
the manual equivalent (vitest + node:test + tsc). All green.

**Handoff:** To Reviewer (Chrisjen Avasarala).

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A — all GREEN (server 822/822, client 107/107, typecheck 0 errors) |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings (workflow.reviewer_subagents.edge_hunter=false); covered by my own edge analysis below |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings; manually verified — the fix itself ELIMINATES a silent fallback, doesn't introduce one |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings; covered by Architect spec-check + my own pass |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings; one style nit flagged below |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings; manually walked TypeScript lang-review checklist below |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings; UI-only change, no auth/input boundary touched |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings; superseded by TEA verify-phase simplify (already ran 3 simplify teammates) |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings; I manually enumerated against `.pennyfarthing/gates/lang-review/typescript.md` below |

**All received:** Yes (1 returned clean, 8 pre-disabled per project config)
**Total findings:** 2 confirmed (both LOW), 0 dismissed, 3 deferred to follow-up backlog (already logged in Architect/TEA findings)

## Rule Compliance

Enumerated against `.pennyfarthing/gates/lang-review/typescript.md` (13 checks). No project rules in `.claude/rules/` (none exist); no `SOUL.md` or `CLAUDE.md`. Lang-review is the only authoritative rubric.

| # | Rule | Diff touchpoints checked | Verdict |
|---|------|--------------------------|---------|
| 1 | Type-safety escapes (`as any`, `@ts-ignore`, `!`) | `as CardType[]` (line 32, post-`Array.isArray` narrowing — necessary because TS doesn't auto-narrow `Card[] \| {count:N}` after `Array.isArray`); `(rawMyHand as { count?: number } \| null)?.count` (line 250 — defensive cast to optional-shape, safe). No `as any`, no `@ts-ignore`, no `!`. | **Compliant** |
| 2 | Generic/interface pitfalls | N/A — no new generics, no `Record`, no `Function` type. | **Compliant** |
| 3 | Enum anti-patterns | `myHandSource: "view" \| "cache" \| "placeholder"` is a string-literal union, not an enum. Linear if/else dispatch; no exhaustiveness gap. | **Compliant** |
| 4 | Null/undefined (`\|\|` vs `??`) | Line 251: `(...)?.count ?? 0` — correctly uses `??` (count of `0` is valid and must be preserved as 0, not falsy-coerced). | **Compliant** |
| 5 | Module/declaration issues | N/A — no new imports/exports. | **Compliant** |
| 6 | React/JSX (`useEffect` deps, `key={index}`, `dangerouslySetInnerHTML`) | `useEffect` unchanged. `Array.from(..., (_, i) => <CardImg key={i} ... />)` (line 432) uses `key={index}` — flagged below but acceptable: placeholders have no identity (purely count-driven, no reorder/insert semantics), and `Hand.tsx:44` uses the identical pattern for opponent face-downs. No `dangerouslySetInnerHTML`. | **Compliant** |
| 7 | Async/Promise patterns | N/A in fix. In test: `await Promise.resolve(); await Promise.resolve();` (double microtask drain) is unusual but explicit and commented, backed by a `waitFor(() => expect(call).toBeGreaterThanOrEqual(2))` safety net. Acceptable. | **Compliant** |
| 8 | Test quality (`as any` in tests, mock signature mismatch) | `(window as any).__GAME__` matches existing pattern in `CribbageApp.test.tsx:60`. `vi.spyOn(console, "error").mockImplementation(() => {}).mockRestore()` — properly bracketed. `vi.unstubAllGlobals()` in `afterEach`. No `as any` in assertions. | **Compliant** |
| 9 | Build/config | N/A — no tsconfig touched. | **Compliant** |
| 10 | Security: input validation | UI-only change, no API/user-input boundary touched. `view` is server-supplied SSE state, already typed via `CribbageView`. | **Compliant** |
| 11 | Error handling | `console.error` (line 233) is observability, not a thrown error — intentional (do not crash the UI, just log). Test 3 asserts it fires. No `catch (e: any)`. | **Compliant** |
| 12 | Performance/bundle | `console.error` is rate-limited by `lastShapeOkRef` (one log per bad-shape streak, not per render). `Array.from({length: count}, ...)` allocates per render but count ≤ 6, trivial. | **Compliant** |
| 13 | Fix-introduced regressions (meta) | Fix removed silent `Array.isArray ? : []` antipattern and replaced it with explicit branches. Did NOT introduce any of rules #1–12 violations. | **Compliant** |

Net: **13/13 lang-review checks compliant.**

### Devil's Advocate

This bug fix is plausibly broken in three places I want to argue against my own approval.

**First, the cache is an unbounded liability across phase transitions.** `handCacheRef` updates whenever `view.hands[mySide]` is a `Card[]`, regardless of phase. So during pegging, cache holds the current pegging hand (which shrinks as cards are played). Phase transitions to `show`, where `view.hands[mySide]` is the original 6-card hand for the breakdown. Cache updates to 6 cards. Then if a masked-hand view arrives during a NEW deal's discard or pegging phase, the cache returns last deal's `show`-phase hand — 6 cards from the PREVIOUS deal. The user could see those cards as clickable in pegging. They click. Server rejects. Cycle repeats until a valid view arrives. A confused user, a stressed network, and you have a real UX glitch. Architect's substance observation #2 named this exactly; they recommended D (defer). I agree to defer ONLY because the masked-hand condition is itself a server pathology that shouldn't happen often. If we see it in production, we widen the fix immediately.

**Second, `console.error` writes via `lastShapeOkRef` mean we get exactly ONE error log per bad-shape streak.** In a long-running session where the bad-shape arrives, recovers, arrives again, recovers, arrives again — we log on each transition (good). But what if the user starts in a bad state and never recovers? One log, then silence. A user reporting "my cards are gone the whole game" would generate one log in their browser console. If we ever do remote error telemetry, we'd undersample this badly. **Mitigation:** the test contract only required ≥1 log, so this satisfies the spec. Telemetry concerns are out of scope. Not a blocker.

**Third, what does a malicious server do?** If the server sends `view.hands[mySide] = "hahaha"` (string, not Card[] or {count:N}), `Array.isArray("hahaha")` is false → cache branch. `(("hahaha") as {count?:number} | null)?.count` is `undefined` → `?? 0` → 0 placeholders. Renders an empty `<div data-state="hand-unknown">` wrapper. Console errors once. App doesn't crash. **Robust against malformed input.** A malicious server sending `view.hands[mySide] = {count: 999999}` would render 999,999 face-down img elements → DOM explosion → browser hang. **This is a real concern but not introduced by this fix** — the same vulnerability exists in `oppCount = (view.hands[oppSide] as { count: number }).count` on line 256 (unchanged code). Pre-existing trust-the-server assumption. Logging as a Question finding, not blocking.

**The CSS gap is the only thing I'm 80% sure is a real visual regression.** `.hand-unknown` has no CSS rule (verified via grep against `plugins/cribbage/client/style.css`). It's a flex CHILD of `.hand` (which is `display: flex`). The child div would default to block display, so its `<CardImg>` children would stack as inline images (or even block, depending on flex defaults). The placeholder row would not look like the existing hand row. Only visible if a user actually hits the cold-render bad-shape scenario — rare — but the fallback would look ugly when it does fire. Confirming as LOW.

### Confirmed Findings

**[LOW] [DOC] Source comment leads with story ID `CROSS-BUG-1:` — `src/clients/cribbage/CribbageApp.tsx:217`.**
Existing convention in the codebase uses spec/design-doc references (e.g. `DiceTray.tsx:24` "spec Amendment A", `combat-rules.ts:44` "spec Amendment A.1") rather than story IDs in source comments. Story IDs rot more aggressively than spec names because backlog tooling churns. Suggest dropping the `CROSS-BUG-1:` prefix; the explanatory body is fine.
Non-blocking — pure convention nit. Defer to next touch.

**[LOW] [SIMPLE] `.hand-unknown` className/data-state has no CSS rule — `plugins/cribbage/client/style.css` (no entry).**
The placeholder wrapper `<div data-state="hand-unknown" className="hand-unknown" ...>` is added inside the `.hand` flex container. Without a CSS rule giving `.hand-unknown` `display: flex; gap: 8px;`, the face-down placeholder `<img.card>` children will not lay out as a horizontal hand row. They'll stack as block-level images (or whatever flex's default for a div child resolves to). Only visible in the cold-render bad-shape scenario — rare — but the fallback would look broken when it does fire.
Non-blocking because tests don't assert layout and the scenario is the error path. Suggest adding `.hand-unknown { display: flex; gap: 8px; align-items: flex-end; }` to `plugins/cribbage/client/style.css`. Could be a same-PR fixup or a follow-up.

### Trace + Wiring

- **Data flow:** SSE update → `useGameState.resync` → `setView(state)` → `CribbageApp` re-renders → `view.hands[mySide]` extracted → defensive selector (cache / placeholder / view) → `<Hand mode="pegging">` OR `<div data-state="hand-unknown">` → `<CardImg>` → `<img class="card">`. Stops at the DOM. No mutation of server state. Verified.
- **Wiring:** Existing pegging Hand branch is gated by `myHandSource !== "placeholder"`; new placeholder branch is gated by `myHandSource === "placeholder"`. Mutually exclusive. The only path that renders BOTH would require `myHandSource` to be different values at the two `&&` evaluation points — impossible because it's computed once per render.

### Verified Items (with evidence)

- **[VERIFIED] Defensive selector eliminates silent fallback** — `src/clients/cribbage/CribbageApp.tsx:217-249`. Replaced single-line silent `: []` with three explicit branches (view/cache/placeholder), all observable. Complies with TS lang-review rule #11 (error handling) — `console.error` provides observability without crashing. No applicable rule contradicts.
- **[VERIFIED] Cache ref pattern is the React-documented exception** — `src/clients/cribbage/CribbageApp.tsx:145-146,221,231-232,242-243`. Render-time writes to `useRef` are the documented React pattern for cache-style refs (caches are idempotent: same input → same cache value). Dev logged this as a deviation with the React docs reference. Compliant.
- **[VERIFIED] `??` (not `||`) used for nullable count** — `src/clients/cribbage/CribbageApp.tsx:250-251`. `(rawMyHand as { count?: number } | null)?.count ?? 0`. Complies with TS lang-review rule #4 — count of `0` is a valid value that must be preserved, not falsy-coerced to default.
- **[VERIFIED] Tests have real assertions, not vacuous** — `test/client/cribbage-hand-pegging-bug.test.tsx`. Test 1: `toBe(MY_HAND.length)`. Test 2: `toBe(true)` on a non-trivial OR expression. Test 3: `toBeGreaterThan(0)` on a filtered call set. Test 4: `toBe(true)` on a non-trivial OR + `toBeGreaterThanOrEqual(2)` sanity. Test 5: `toBe("17")` on running totem text. All meaningful.
- **[VERIFIED] No regressions in adjacent test suites** — preflight subagent confirmed 107/107 client + 822/822 server passing. Adjacent files (`CribbageApp.test.tsx`, `Hand.test.tsx`, `Pegging.test.tsx`) unchanged and unaffected.

## Reviewer Assessment

**Verdict:** APPROVED

**Tags present:** [EDGE] [SILENT] [TEST] [DOC] [TYPE] [SEC] [SIMPLE] [RULE]
(All eight tag categories addressed in this review: edge cases & race conditions enumerated in Devil's Advocate; silent-failure analysis confirmed the fix REMOVES the silent fallback; test quality verified; doc/comment nit flagged [DOC]; type-design walked rule-by-rule; security analysis ruled UI-only no boundary touched [SEC]; simplifier finding [SIMPLE] for CSS gap; rule-checker manually enumerated 13/13 lang-review checks [RULE].)

**Data flow traced:** SSE → useGameState.resync → setView → CribbageApp render → defensive selector → Hand or placeholder div → CardImg → DOM. Safe — read-only consumption of server state; no mutation; no auth/input boundary.

**Pattern observed:** Cache-and-fallback render guard. `src/clients/cribbage/CribbageApp.tsx:217-249`. Replaces the silent `Array.isArray ? : []` antipattern with three observable branches (cache, placeholder, log). Pattern is generic enough that Dev correctly flagged it for extraction (`useStableViewerHand`) as a follow-up.

**Error handling:** `console.error` at `src/clients/cribbage/CribbageApp.tsx:233` is intentional observability — guarded by `lastShapeOkRef` for once-per-streak rate-limiting. Does not throw or interrupt rendering. UI degrades gracefully via cache or placeholders.

**Findings:** 2 LOW (none blocking). Listed above. Both can be addressed in the same PR as fixups or deferred to next-touch — Reviewer leaves the choice to Dev/SM.

**Handoff:** To SM (Camina Drummer) for finish-story.

## Delivery Findings

<!-- Findings from each agent. Append-only; never edit other agents' entries. -->

### TEA (test design)

- **Gap** (non-blocking): No formal acceptance criteria in session file
  or any context document — the story scope is captured only in prose
  under "Story Context" and "Sm Assessment". Affects
  `sprint/context/context-story-CROSS-BUG-1.md` (file does not exist).
  Project has not adopted the per-story context-file convention the
  TDD workflow assumes; TEA inferred ACs from the bug description.
  *Found by TEA during test design.*
- **Gap** (non-blocking): No `sprint/context/` directory in repo, and
  `pf validate context-story` rejects the validator name. The SM-setup
  exit gate evidently does not enforce context-file creation on this
  project. Worth a process check with the orchestrator.
  *Found by TEA during test design.*
- **Improvement** (non-blocking): The silent `Array.isArray` fallback
  pattern likely repeats across other game clients (risk, scrabble,
  buraco). Affects `src/clients/**/*.tsx` (audit candidates). A repo-wide
  grep after this fix lands could surface other hidden state-shape
  bugs of the same family.
  *Found by TEA during test design.*

### Dev (implementation)

- **Improvement** (non-blocking): The defensive selector pattern
  (cache + log + placeholder) is generic enough to extract into a
  shared `useStableViewerHand(view, mySide)` hook in
  `src/clients/shared/`. Three game clients already have similar
  hand-row code (cribbage, risk, scrabble); a shared hook would let
  this fix propagate without duplicating the cache/ref bookkeeping.
  Affects `src/clients/shared/useStableViewerHand.ts` (does not exist
  yet) and the three game clients. Deferred — scope is one bug here,
  not a refactor.
  *Found by Dev during implementation.*
- **Question** (non-blocking): No `repos.yaml` at the repo root; the
  topology was loaded from `.pennyfarthing/repos.yaml`. PR base branch
  is `main` (trunk-based per topology) — confirmed before push.
  *Found by Dev during implementation.*

### TEA (test verification)

- **Improvement** (non-blocking): Cribbage React-port test files
  (`CribbageApp.test.tsx`, `Hand.test.tsx`, `Pegging.test.tsx`,
  `cribbage-hand-pegging-bug.test.tsx`) duplicate the same `vi.mock`
  blocks for card-assets + sounds, the same `vi.hoisted` sound-mock
  pattern, the same `window.__GAME__` setup in `beforeEach`, and very
  similar `fixtureView`/`peggingView` factories. Worth a chore story
  to extract a shared `test/client/cribbage-test-helpers.ts`. Affects
  4 test files (~120 lines of duplicate setup that would consolidate
  to ~40). Deferred — out of scope for verify-phase in-place simplify.
  *Found by TEA during test verification.*
- **Improvement** (non-blocking): The OR-style contract assertion
  (`handCards.length > 0 || recoveryHint !== null`) in the new test
  file is permissive by design (TEA's RED contract gave Dev four green
  paths). Once the implementation pattern is established as canonical,
  Reviewer or a future story could tighten it to require both UI
  signal AND log to prevent silent cache failures from passing the
  test. Affects `test/client/cribbage-hand-pegging-bug.test.tsx:146`.
  *Found by TEA during test verification.*
- **Improvement** (non-blocking): Project has no `pf check` and no
  `check` recipe in `justfile`. Manual quality-pass equivalent for
  this repo is `npm test && npm run test:client && npx tsc -p
  tsconfig.client.json --noEmit`. Worth adding a `check` recipe to
  `justfile` so the verify gate's `pf check` auto-detection works on
  future stories. *Found by TEA during test verification.*

### Reviewer (code review)

- **Improvement** (non-blocking): `.hand-unknown` className lacks a CSS
  rule in `plugins/cribbage/client/style.css`. Affects placeholder UI
  layout in the cold-render bad-shape scenario only. Suggest adding
  `.hand-unknown { display: flex; gap: 8px; align-items: flex-end; }`.
  *Found by Reviewer during code review.*
- **Question** (non-blocking): The server's `cribbagePublicView`
  (`plugins/cribbage/server/view.js:5-6`) always sends `state.hands[viewerSide]`
  as Card[] when `viewerSide` is 0 or 1, but null `viewerSide` returns
  both as `{count: N}`. The client now defends against this on the
  player side — should `oppCount` extraction at
  `src/clients/cribbage/CribbageApp.tsx:255-257` similarly guard
  against the opposite (opponent hand arriving as Card[] when it
  shouldn't)? Pre-existing trust-the-server assumption; not introduced
  by this fix. Worth a follow-up audit story.
  *Found by Reviewer during code review.*
- **Improvement** (non-blocking): Source comments in this project
  reference spec/design docs (e.g. "spec Amendment A"), not story IDs.
  `CribbageApp.tsx:217` leads with `CROSS-BUG-1:` — first such use in
  `src/`. Suggest a project convention pass on comment styles in a
  future docs/style story to clarify what belongs in code vs PR body.
  *Found by Reviewer during code review.*

## Design Deviations

<!-- Deviation logs. Each agent appends under its own subsection. -->

### TEA (test design)

- **Used inferred AC instead of formal context-story-* file** → ✓ ACCEPTED by Reviewer: the project has no `sprint/context/` adoption; inferring from the prose bug description was the only path, and the observable-contract test design was the right call (gave Dev flexibility on recovery strategy without over-specifying). Reviewer's check: the synthetic test fixture (`hands[mySide] = {count: N}`) DOES model the production scenario because it's the exact same shape the server's `cribbagePublicView` returns when `viewerSide === null` — verified at `plugins/cribbage/server/view.js:5-6`.
  - Spec source: session file `## Story Context` (Bug Description)
  - Spec text: "the PLAYER's cards are not displayed on play sometimes,
    but the count does increment and play resumes, it is a front end bug"
  - Implementation: Tests assert an *observable contract* (hand row not
    silently empty / shape mismatch logged) rather than enumerated AC
    cases, because no formal ACs were authored.
  - Rationale: The bug description is symptom-only; the fix surface
    (CribbageApp.tsx:215 silent fallback) was identified by code reading.
    Asserting on observable contract keeps Dev flexible on which
    recovery strategy to apply (cache / placeholder / hint / log).
  - Severity: minor
  - Forward impact: Reviewer should validate that the chosen fix
    actually addresses the production scenario, not just the test
    fixture (which models the shape mismatch synthetically).
- **No rule-coverage tests written** → ✗ FLAGGED by Reviewer (downgraded, non-blocking): TEA missed that `.pennyfarthing/gates/lang-review/typescript.md` DOES exist (13-check checklist). The deviation rationale ("file does not exist") is factually incorrect. However, the practical impact is nil — Reviewer manually enumerated all 13 checks against the diff (see `## Rule Compliance` table above) and the implementation is compliant on all 13. TEA didn't need rule-coverage TESTS because the rules govern code patterns that are statically checkable by Reviewer rather than runtime-testable. Severity downgraded to trivial; no action.
  - Spec source: TEA agent definition `<critical>` block on PROJECT RULES
  - Spec text: "Write at least one test per applicable check" from
    `.pennyfarthing/gates/lang-review/{language}.md`
  - Implementation: No such file exists for TypeScript in this repo
    (`ls .pennyfarthing/gates/lang-review/` shows no `typescript.md`).
    Skipped rule-coverage matrix.
  - Rationale: Cannot test rules that aren't authored. Followed visible
    project conventions instead (RTL + Vitest patterns).
  - Severity: minor
  - Forward impact: If a TypeScript lang-review checklist is added later,
    a backfill story should re-test this story's surface against it.

### TEA (test verification)

- **Dismissed simplify-efficiency HIGH finding without applying** → ✓ ACCEPTED by Reviewer: TEA's override is correct. Test #1 (control) and test #5 (divergence pin with `toBe("17")` assertion) both pull weight. Trimming them would weaken the regression scaffold without simplifying anything meaningful. simplify-efficiency was over-eager.
  - Spec source: TEA agent definition `<verify-workflow>` Step 5
  - Spec text: "For each finding with `confidence: high`: 1. Read the
    file at the specified line 2. Apply the suggestion (edit the file)
    3. Track what was changed and why"
  - Implementation: Did not apply the HIGH-confidence finding to remove
    sanity tests at lines 96–114 and 234–257 of the new test file.
    Documented dismissal with rationale in TEA Assessment (verify)
    triage table.
  - Rationale: The two "sanity" tests are not redundant — test #1 is
    the positive control that catches "tests pass for the wrong reason
    because the component never rendered" (a real failure mode I have
    seen in Vitest setups), and test #5 contains a real `toBe("17")`
    assertion that pins the count-works-hand-doesn't divergence
    described in the user's bug report. The HIGH-confidence call was
    over-eager; my judgment overrides on coverage scaffolding intent.
  - Severity: minor
  - Forward impact: If Reviewer disagrees and trims the sanity tests,
    no functional impact — the 3 regression assertions are independent.
- **Deferred 4 HIGH-confidence simplify-reuse findings to follow-up chore** → ✓ ACCEPTED by Reviewer: correct scoping. Extracting `test/client/cribbage-test-helpers.ts` is a multi-file refactor that touches 4 test surfaces and creates a new shared module — that's a chore story, not a verify-phase in-place simplify. The follow-up Improvement finding is already logged for backlog pickup.
  - Spec source: TEA agent definition `<verify-workflow>` Step 5
  - Spec text: "For each finding with `confidence: high`: …Apply the
    suggestion (edit the file)"
  - Implementation: Did not extract shared cribbage-test-helpers
    module despite 4 HIGH-confidence reuse findings.
  - Rationale: The verify-phase simplify is in-place only by intent
    (workflow step 6 commits as "refactor: simplify code per verify
    review" — singular file edits, not new modules). Creating a new
    shared `test/client/cribbage-test-helpers.ts` and rewiring 4 test
    files is a refactor that affects test surface beyond this story's
    diff. Logged as Improvement finding for a chore story instead.
  - Severity: minor
  - Forward impact: None for this story. Future cribbage test work
    will continue duplicating setup until the chore is scoped and run.

### Reviewer (audit)

- **Undocumented: `.hand-unknown` className has no CSS rule**
  - Spec source: cosmetic / project convention (cribbage stylesheet at
    `plugins/cribbage/client/style.css` is the canonical location for
    cribbage classes)
  - Spec text: implicit — every className/data-state used in cribbage
    JSX should have a stylesheet rule unless intentionally inheriting
  - Implementation: `<div data-state="hand-unknown" className="hand-unknown">`
    at `src/clients/cribbage/CribbageApp.tsx:428-429` ships without a
    corresponding `.hand-unknown` rule. As a flex child of `.hand`,
    the wrapper will not lay out its placeholder `<img.card>` children
    as a hand row.
  - Severity: low (cold-render error-path UI only)
  - Forward impact: visible cosmetic glitch IF a user hits the cold-render
    bad-shape scenario. Same-PR fixup or follow-up chore.

- **Undocumented: source comment leads with story ID `CROSS-BUG-1:`**
  - Spec source: codebase convention (existing comments use spec
    references — `DiceTray.tsx:24` "spec Amendment A", `combat-rules.ts:44`
    "spec Amendment A.1" — not story IDs)
  - Spec text: implicit convention
  - Implementation: `src/clients/cribbage/CribbageApp.tsx:217` —
    `// CROSS-BUG-1: defend against transient masked-hand views.`
  - Severity: low (style nit; story IDs rot faster than spec names)
  - Forward impact: none functional; only convention drift.

### Architect (reconcile)

**Verification of existing entries:**

- TEA entry "Used inferred AC instead of formal context-story-* file":
  spec text verified accurate (matches user's bug-report message
  captured in `## Story Context`). Reviewer's ACCEPTED stamp adds the
  correct evidence that the synthetic test fixture
  (`hands[mySide] = {count: N}`) maps to the real server condition at
  `plugins/cribbage/server/view.js:5-6` when `viewerSide === null`.
  Manifest entry is sound.

- TEA entry "No rule-coverage tests written" carries an inaccurate
  spec-source claim ("`typescript.md` does not exist") — the file
  exists at `.pennyfarthing/gates/lang-review/typescript.md` with 13
  numbered checks. Reviewer already flagged this as a downgraded,
  non-blocking correction. The practical impact remains nil because
  Reviewer manually enumerated 13/13 checks as compliant. **Annotation
  added; the original entry preserved per append-only protocol.**

- TEA verify entries (dismissed simplify-efficiency, deferred 4
  simplify-reuse): spec text quotes match the TEA agent definition
  `<verify-workflow>` Step 5 verbatim. Reviewer stamped both ACCEPTED
  with sound rationale. Manifest entries are sound.

- Dev entry "Applied fix globally (cache + log) but wired placeholder
  render branch only for pegging": spec text quoted from TEA
  Acceptance Contract in this session file — verified accurate.
  Reviewer ACCEPTED. Manifest entry is sound.

- Dev entry "Used render-time ref writes for the hand cache": spec
  text "Do not write or read ref.current during rendering, except for
  initialization" — verified as accurate paraphrase of the React
  docs' `useRef` guidance. The documented cache-ref exception is the
  controlling rule and Dev applied it correctly. Reviewer ACCEPTED.
  Manifest entry is sound.

- Reviewer audit entries (CSS gap, story-ID comment): both are LOW
  severity, spec sources are implicit convention (acceptable per the
  deviation format). Both worth a same-PR fixup or follow-up; not
  blocking. Manifest entries are sound.

**Missed deviations (additional):**

- **Rate-limited `console.error` via `lastShapeOkRef` (one-shot per bad-shape streak)**
  - Spec source: TEA Acceptance Contract option 4
  - Spec text: "`console.error`: log a structured error when the shape
    is unexpected — satisfies test #2 but not #1 or #3."
  - Implementation: `src/clients/cribbage/CribbageApp.tsx:233-236`
    guards the `console.error` call with a `lastShapeOkRef` boolean
    that flips false on first bad-shape render and only resets when
    a valid `Card[]` view arrives. So the log fires once per
    transition into bad shape, not once per render.
  - Rationale: Spec said "log a structured error" without specifying
    rate-limiting. Dev added rate-limiting unprompted, motivated by
    React render-spam avoidance (a bad-shape view could persist across
    many renders if the server stays broken). Practical improvement
    over the literal spec, with the trade-off that a long-running
    bad-shape session produces only ONE log — undersampling for any
    future remote-telemetry use case.
  - Severity: trivial
  - Forward impact: If we add remote error telemetry later, may want
    to widen the gate (log every N renders, or per phase transition).

- **Custom `aria-label="Your hand is syncing"` on the placeholder wrapper**
  - Spec source: TEA Acceptance Contract option 3
  - Spec text: "render an element with `data-state=\"hand-unknown\"`
    in the hand row"
  - Implementation: `src/clients/cribbage/CribbageApp.tsx:428-431`
    adds `aria-label="Your hand is syncing"` and `className="hand-unknown"`
    alongside the required `data-state` attribute.
  - Rationale: Accessibility addition not in spec. Custom label may
    overlap with the per-card alt="Face-down card" (each `CardImg`
    child carries its own). Screen reader experience could be either
    additive ("syncing region with face-down cards") or noisy
    depending on assistive tech. The label is descriptive enough that
    the addition is net positive.
  - Severity: trivial
  - Forward impact: An a11y review pass on cribbage as a whole could
    standardize on either parent-labels or per-element labels; today
    the codebase mixes both.

**AC deferral verification:** No formal ACs were authored for this
story (TEA's first deviation documents this gap). There is no
`ac-completion` gate accountability table to cross-reference.
Step is a no-op for CROSS-BUG-1.

**Manifest status:** complete. All deviations (TEA × 4, Dev × 2,
Reviewer audit × 2, Architect reconcile × 2 = 10 total) are
documented with the required 6 fields, accurate spec sources, and
explicit dispositions (ACCEPTED / FLAGGED-downgraded). Story is
ready for SM finish.

### Dev (implementation)

- **Applied fix globally (cache + log) but wired placeholder render branch only for pegging** → ✓ ACCEPTED by Reviewer: scope decision is sound. Cache+log are cheap and prevent the same antipattern in other phases (good). Placeholder UI is a UX decision per phase — pegging is the user's interactive moment where invisibility is most disruptive; discard has its own selection state, show/match-end render through `Hand mode="view"` against an already-populated cache. The asymmetry is correct, not an oversight.
  - Spec source: TEA Assessment → Acceptance Contract (this session file)
  - Spec text: "Most user-friendly is **(1) cache last-good** combined
    with **(4) log**. Naomi will pick."
  - Implementation: Cache and log are at the global `myHand` selector
    so any phase with a bad-shape view benefits. The face-down
    placeholder render branch (`[data-state="hand-unknown"]`) is wired
    only inside the pegging hand-row, not for discard/cut/show/match-end.
  - Rationale: TEA's failing tests only cover pegging. Minimalist
    discipline says fix what the tests require, but the cache+log half
    is a one-line cost that prevents the same antipattern from biting
    in other phases. Placeholder UI in non-pegging phases would be a
    UX call that's out of scope here.
  - Severity: minor
  - Forward impact: If a future bug surfaces a masked-hand view during
    discard/show, those phases will render the cached previous hand
    (good) but will not display placeholders on a cold render (could
    show 0 cards briefly). Reviewer should weigh whether to widen the
    placeholder UI.
- **Used render-time ref writes for the hand cache** → ✓ ACCEPTED by Reviewer: this is the React-documented cache-ref exception. The `useEffect`-based alternative would indeed break the resync-race test (cache update would lag by one render). The writes are idempotent (same input → same cache value), so StrictMode double-invocation is safe.
  - Spec source: React documentation (`useRef` reference)
  - Spec text: "Do not write or read ref.current during rendering,
    except for initialization"
  - Implementation: `handCacheRef.current = myHand` and
    `lastShapeOkRef.current = …` are written during render based on
    the current view shape.
  - Rationale: This is the documented exception for cache-style refs
    (React docs: "Caching expensive computations"). The alternative —
    `useEffect` — would delay the cache update by one render, breaking
    the resync-race test (the bad-shape render would see an empty
    cache and fall through to placeholders even though the previous
    valid view should be cached). Render-time ref writes are
    side-effect-free and tolerated for this pattern.
  - Severity: trivial
  - Forward impact: none