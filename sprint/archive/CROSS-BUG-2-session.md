---
story_id: "CROSS-BUG-2"
jira_key: ""
epic: "CROSS-BUG"
workflow: "tdd"
---
# Story CROSS-BUG-2: Port dice rendering to @local/dice-lib (fixes AI-turn frozen dice)

## Story Details
- **ID:** CROSS-BUG-2
- **Jira Key:** (pending)
- **Workflow:** tdd
- **Type:** refactor
- **Points:** 5
- **Priority:** p1
- **Stack Parent:** none

## Story Context

Replace the current in-tree dice renderer with the new @local/dice-lib (~/Projects/dice-lib). The library exposes a tuner so we can adjust camera, jitter, trajectory, and slide-final behavior per game.

**Motivating symptom:** During AI turns the dice freeze on a single die showing '2' while count/state advance normally — a front-end render bug that should disappear once the new renderer drives every turn (player and AI). Goal here is the port + tuning hooks, not preserving bug-for-bug behavior of the old renderer.

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-05-20T13:46:48Z

> **Reviewer REJECTED — phase reset to green for rework.** Spec-reconcile row in the phase history is the transition pf handoff wrote when `complete-phase review … spec-reconcile` was invoked; the correct routing for a REJECTED verdict is back to green via the gate's recovery_config (`action: rework, target_phase: green`). Phase pointer manually corrected here so Dev's phase-check passes on activation.

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-20T09:00:00Z | 2026-05-20T13:01:59Z | 4h 1m |
| red | 2026-05-20T13:01:59Z | 2026-05-20T13:11:41Z | 9m 42s |
| green | 2026-05-20T13:11:41Z | 2026-05-20T13:21:15Z | 9m 34s |
| spec-check | 2026-05-20T13:21:15Z | 2026-05-20T13:24:06Z | 2m 51s |
| verify | 2026-05-20T13:24:06Z | 2026-05-20T13:27:51Z | 3m 45s |
| review | 2026-05-20T13:27:51Z | 2026-05-20T13:34:10Z | 6m 19s |
| spec-reconcile | 2026-05-20T13:34:10Z | 2026-05-20T13:46:48Z | 12m 38s |
| finish | 2026-05-20T13:46:48Z | - | - |

## Delivery Findings

### TEA (test design)
- **Improvement** (non-blocking): The lib already exports `DiceTrayElement`, `TRAY_DEFAULTS`, `DEFAULT_CAMERA`, `TrayGeometry`, and `CameraConfig`; words' `src/shared/dice/index.tsx` currently redeclares its own `class … extends HTMLElement` instead of using the lib's. Affects `src/shared/dice/index.tsx` (collapse to a re-registration shim importing `DiceTrayElement` from `@local/dice-lib`). *Found by TEA during test design.*
- **Gap** (non-blocking): Lib's `DiceTrayElement` does not currently observe a `tuning` attribute. Affects `~/Projects/dice-lib/src/DiceTray.tsx` (add `tuning` to `observedAttributes`, parse JSON, forward to `DiceScene` props). *Found by TEA during test design.*
- **Question** (non-blocking): The freeze-on-2 symptom may have a secondary root cause beyond the static-pip path (state arriving partially). Tests assert the static `.die-placeholder` path is removed during `moving`, which is the simplest read of "renderer drives every turn." Dev should confirm in GREEN that switching backgammon's `moving` phase to a `<dice-tray mode="replay">` renderer with the actual values clears the symptom end-to-end. *Found by TEA during test design.*

### TEA (test verification)
- No upstream findings during test verification.

### Dev (implementation)
- **Gap** (non-blocking): The AI rollers send `throwParams: []` in all three known sites (`plugins/backgammon/server/ai/backgammon-player.js:54`, `src/server/ai/orchestrator.js:37`, `src/server/ai/orchestrator.js:47`). The lib's `<dice-tray mode="replay">` only repaints when `throwParams.length > 0`, so AI rolls still won't animate fresh dice even after this story's port — the freeze surface is removed (no stale static pip row) but the user-visible UX is "N idle dice" instead of "live replay of the AI's roll." Affects the three AI files above plus a wire-format throwParams generator (likely a shared helper in `src/server/ai/`). *Found by Dev during implementation.*
- **Gap** (non-blocking): The replay path stores wire-format `DiceThrowParams` (`{velocity, angular, position[2]}`) in `state.turn.dice.throwParams` but the lib's `<dice-tray>` replay attribute parses scene-format `ThrowParams` (`{position[3], linearVelocity, angularVelocity, rotation}`). Today they coincidentally line up only because no one was replaying yet. Once the prior gap is closed (AI generating real throwParams), the client needs to convert wire→scene via `replayThrowParams(wire, seed, D6_RADIUS)` from `@local/dice-lib`. Affects `plugins/backgammon/client/dice.js` and any future replay consumer. *Found by Dev during implementation.*
- **Gap** (non-blocking): Lib's `DiceTrayElement` doesn't actually observe a `tuning` attribute yet (TEA already flagged). This story wires the React→element pass-through; the consumer side (parsing `tuning`, applying to camera/jitter/trajectory/slide-final) is a lib-side follow-up. Until then, the attribute lands on the DOM node but the 3D scene won't change. Affects `~/Projects/dice-lib/src/DiceTray.tsx` and `~/Projects/dice-lib/src/DiceScene.tsx`. *Found by Dev during implementation.*
- **Improvement** (non-blocking): Backgammon's `staticDie`/`staticDiceRow` are kept only for the `initial-roll` phase where the viewer's own value is shown after rolling. With the live tray taking over the `moving` phase, the static pip helpers could likely move to `initial-roll` exclusively or be replaced with their own dice-tray instance. Out of this story's scope. *Found by Dev during implementation.*

### Reviewer (code review)
- **Gap** (blocking): The `replayDiceTray` helper serializes `state.turn.dice.throwParams` (wire-format `DiceThrowParams[]`) into the `replay` attribute, but `~/Projects/dice-lib/src/DiceTray.tsx:117` parses that attribute as scene-format `ThrowParams[]` and passes it through to `DiceScene.PhysicsDie`. On the player's own moving phase, this yields NaN positions and undefined `linearVelocity`/`angularVelocity`/`rotation` in `RigidBody`. Affects `plugins/backgammon/client/dice.js:54-56` (drop the conditional `setAttribute('replay', …)` or insert a wire→scene conversion). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `JSON.stringify(tuning)` re-runs on every render of the React `<DiceTray>` wrapper. Affects `src/clients/shared/DiceTray.tsx:71-72` (wrap in `useMemo` keyed on `tuning`). *Found by Reviewer during code review.*

### Dev (rework)
- **Gap** (non-blocking): Proper animated replay of the recorded roll in the `moving` phase requires (1) AI rollers (3 sites: `plugins/backgammon/server/ai/backgammon-player.js:54`, `src/server/ai/orchestrator.js:37/47`) to emit real wire-format throwParams instead of `[]`, and (2) the client to convert wire→scene via `replayThrowParams(wire, seed, D6_RADIUS)` from `@local/dice-lib` before forwarding to the `<dice-tray replay=…>` attribute. This story now ships the structural port + the safe idle render; the animated-replay loop is the natural scope of a follow-up story. *Found by Dev during rework.*

## Design Deviations

### TEA (test design)
- No deviations from spec.

### TEA (test verification)
- No deviations from spec.

### Dev (implementation)
- **Patched TEA's `dice-bundle-port.test.ts` to use Vite-native imports**
  - Spec source: test/client/dice-bundle-port.test.ts (TEA-authored)
  - Spec text: Uses `new URL("../../", import.meta.url).pathname` + `node:fs`/`node:path` to read the bundle entry source and list directory contents.
  - Implementation: Replaced with `?raw` import for the source and `import.meta.glob` for the directory listing; added `/// <reference types="vite/client" />`.
  - Rationale: Vitest's jsdom env serves files under a `/@fs/...` virtual prefix, so `readFileSync` could not open the resolved path. Repo has no `@types/node` installed (client typecheck is browser-targeted), so importing `node:*` modules also failed `tsc`. The Vite-native primitives work both at runtime and under client typecheck without adding a devDep.
  - Severity: minor
  - Forward impact: none — assertion contracts unchanged.
- **Backgammon `moving` phase uses a fresh `<dice-tray>` element regardless of replay payload**
  - Spec source: TEA delivery finding "Question (non-blocking)"; story scope "the new renderer drives every turn (player and AI)"
  - Spec text: Switch backgammon's `moving` phase to a `<dice-tray mode="replay">` renderer with the actual values.
  - Implementation (REVISED post-review): The `replayDiceTray()` helper mounts a fresh `<dice-tray mode="idle">` with N dice — it deliberately does NOT set the `replay` attribute. Originally the helper forwarded `state.turn.dice.throwParams` via `replay`, but Reviewer flagged a HIGH wire/scene format mismatch (state stores wire-format `DiceThrowParams`; lib's element parses `replay` as scene-format `ThrowParams[]`, yielding NaN positions in `RigidBody`). The safe behavior is to render idle dice and defer animated replay to a follow-up.
  - Rationale: Eliminating the stale-state freeze surface is the test contract and the story's core deliverable. Animated replay requires both (a) AI rollers to emit real wire-format throwParams and (b) a client-side wire→scene conversion before setting `replay`. Both are out of scope.
  - Severity: minor
  - Forward impact: minor — follow-up story can re-enable the `replay` attribute once the wire→scene conversion + AI throwParams generator land.

### Architect (reconcile)
Reviewed every logged deviation against the actual diff and against the story scope at `.session/CROSS-BUG-2-session.md:18-22`. Below are the audit notes plus the deviations TEA/Dev/Reviewer did not log under `## Design Deviations` (some were under `## Delivery Findings` only; the boss reads the deviations section first).

**Audit of existing entries:**
- Dev "Patched TEA's dice-bundle-port.test.ts" — verified accurate. Spec source path exists, spec text quotes the actual original code, implementation matches the rewrite committed in `c258e77`/`8989bc4`, rationale (vitest jsdom `/@fs/` prefix + absent `@types/node`) reproduces.
- Dev "Backgammon moving phase uses a fresh `<dice-tray>` element regardless of replay payload" (REVISED) — verified accurate post-rework. Spec text correctly cites TEA finding + story scope; implementation matches `8989bc4` (no `replay` attribute, `mode='idle'`); rationale acknowledges the Reviewer HIGH that drove the revision; forward impact identifies the wire→scene conversion + AI throwParams generator as the follow-up unblockers.

**Missed deviations (this section is the missing record):**

- **Helper name `replayDiceTray` no longer matches its behavior**
  - Spec source: `plugins/backgammon/client/dice.js:67-81` (post-rework)
  - Spec text: "Render N idle dice during the moving phase. We deliberately do NOT set the `replay` attribute" (docstring on the function itself)
  - Implementation: Function is still named `replayDiceTray` despite producing an idle tray. A future reader scans the name and expects replay-mode behavior; the docstring is honest but the identifier is misleading.
  - Rationale: Renaming touches the only call site (`renderDice` at `:138`) so the risk is trivial, but it was deliberately deferred during the rework to keep the diff focused on the Reviewer-flagged HIGH. Janitor-tier follow-up.
  - Severity: minor
  - Forward impact: none — purely a naming drift; both the function and its caller are private to `dice.js`.

- **Story's "renderer drives every turn (player and AI)" is fulfilled structurally, not visually**
  - Spec source: Session Story Context at lines 20-22 ("the new renderer drives every turn (player and AI)")
  - Spec text: "a front-end render bug that should disappear once the new renderer drives every turn (player and AI)"
  - Implementation: A fresh `<dice-tray>` element mounts on every state update in the `moving` phase, so stale-state never persists (structural fulfillment). The element renders in `mode='idle'` with N pickup dice — it does NOT animate the actual rolled values. The dice values are still visible on the board via checker movement, but the dice tray itself no longer paints the rolled face values as the prior static pip row did.
  - Rationale: The story scope's "Goal here is the port + tuning hooks, not preserving bug-for-bug behavior of the old renderer" clause grants license for this UX delta. Full visual replay requires AI rollers to emit real wire-format throwParams (3 sites: `plugins/backgammon/server/ai/backgammon-player.js:54`, `src/server/ai/orchestrator.js:37/47`) plus a client-side wire→scene conversion via `replayThrowParams(wire, seed, D6_RADIUS)` from `@local/dice-lib`. Both are explicitly captured as non-blocking delivery findings under `### Dev (rework)` and remain the scope of a follow-up story.
  - Severity: minor (visible to users but matches the explicit story-scope license)
  - Forward impact: minor — the wire→scene + AI throwParams work is sized as a follow-up story; once it lands, no changes to this story's surface are needed.

- **Tuning hooks reach the wire, not the scene**
  - Spec source: Session Story Context line 20 ("library exposes a tuner so we can adjust camera, jitter, trajectory, and slide-final behavior per game")
  - Spec text: "The library exposes a tuner so we can adjust camera, jitter, trajectory, and slide-final behavior per game."
  - Implementation: React `<DiceTray>` wrapper accepts a `tuning` prop and serializes it to a `tuning` attribute on the underlying `<dice-tray>` element (`src/clients/shared/DiceTray.tsx:71-72, 120`). The lib's `DiceTrayElement` does not yet observe this attribute (`~/Projects/dice-lib/src/DiceTray.tsx:46` — `observedAttributes = ["dice","mode","theme","replay","disabled"]`), so the value lands on the DOM but does not reach `DiceScene`.
  - Rationale: The lib lives in a separate repo (`~/Projects/dice-lib`) outside this repo's topology, so the lib-side consumption work is naturally a separate story. Shipping the consumer-side plumbing now means the follow-up only has to add `tuning` to `observedAttributes`, parse the JSON, and forward to `DiceScene` props.
  - Severity: minor (acceptable for this story's scope — the spec hook is exposed; the lib-side consumption is the natural next deliverable)
  - Forward impact: none for this repo. Follow-up touches `~/Projects/dice-lib/src/DiceTray.tsx` and `~/Projects/dice-lib/src/DiceScene.tsx`.

**No AC deferral table exists** (the `ac-completion` gate didn't write one — the story has no explicit AC list in `sprint/context/`, only the scope paragraph in the session header). Nothing to cross-reference against Reviewer findings on that front.

## SM Assessment

**Story scope:** Replace the existing in-tree dice renderer (`public/shared/dice.js` built from `src/shared/dice/index.tsx` via `vite.config.dice.js`) with the new `@local/dice-lib` package at `~/Projects/dice-lib`. The library exposes a tuner for camera, jitter, trajectory, and slide-final behavior — these tuning hooks must be wired through per-game.

**Motivating bug:** During AI turns the dice freeze on a single die showing '2' while game state advances normally. This is a render-side bug only; AI logic is fine. The new renderer should drive both player AND AI turns uniformly so the freeze cannot occur.

**Key surfaces (for TEA to scope tests against):**
- `src/shared/dice/index.tsx` — current renderer entry, bundled to `public/shared/dice.js`
- `plugins/backgammon/client/dice.js` — backgammon's consumer (AI-turn freeze observed here)
- `vite.config.dice.js` — bundling config; will need to point at the new lib
- Existing prior art: `docs/superpowers/plans/2026-05-13-dice-lib.md` and spec `docs/superpowers/specs/2026-05-13-dice-lib-design.md`

**Not in scope:** Preserving bug-for-bug behavior of the old renderer. Goal is port + tuning hooks.

**Workflow:** TDD (phased). Next phase: red (TEA writes failing tests).

**Risk callouts:**
- `@local/dice-lib` ships its own React/three peers — `vite.config.dice.js` already documents the dedupe trap. Port must preserve that single-instance guarantee.
- AI-turn freeze repro is the acceptance signal: tests should cover renderer being invoked on every roll regardless of `activeUserId`.

Ready for Amos (TEA) to take the red phase.
## TEA Assessment

**Phase:** finish
**Tests Required:** Yes
**Reason:** TDD workflow; non-trivial port + behavior change.

**Test Files:**
- `test/client/dice-bundle-port.test.ts` — static checks: bundle entry imports `DiceTrayElement` from `@local/dice-lib`, declares no local `class … extends HTMLElement`, and the local `src/shared/dice/` directory holds no duplicate of lib-owned modules (d4–d20, DiceScene, diceTheme, dieRegistry, fbxFaces, parseDiceNotation, replayThrowParams, trayDefaults, types, useDiceThrowGesture).
- `test/client/DiceTray.tuning.test.tsx` — shared React `<DiceTray>` exposes a `tuning` prop (camera/jitter/trajectory/slide-final config) and JSON-serializes it onto the underlying `<dice-tray>` element as a `tuning` attribute. Omission and update paths are also covered.
- `test/client/backgammon-render-dice.test.ts` — backgammon `renderDice` drives the `moving` phase with a `<dice-tray>` element (not the static `.die-placeholder` pip row) for both viewer and opponent active states, and does not paint a partial single-die row when values arrive truncated (the freeze-on-2 surface).

**Tests Written:** 9 tests across 3 files covering 4 derived ACs.
**Status:** RED — 8 failing as intended, 1 inherent-pass guard (`tuning` omitted when no prop given) that remains valid post-implementation.

### Rule Coverage

No `.claude/rules/` or lang-review JS-specific checklist applies to this set beyond standard meaningful-assertion hygiene. All new tests assert concrete DOM / source-text predicates; no `let _ = …` vacuous patterns, no `assert(true)`.

| Concern | Test | Status |
|---------|------|--------|
| No drift between local and lib element | `imports DiceTrayElement from @local/dice-lib` | failing |
| No duplicate class declaration | `does not declare its own custom-element class` | failing |
| No duplicate lib sources in words | `does not keep duplicate copies of dice-lib source in words` | failing |
| Tuner pass-through (camera/jitter/etc.) | `forwards a tuning prop … as a JSON attribute` | failing |
| Tuner default (no attribute when no prop) | `omits the tuning attribute entirely when no tuning prop is given` | passing-guard |
| Tuner update propagation | `updates the tuning attribute when the prop changes` | failing |
| Live tray drives AI moving phase | `renders a <dice-tray> during the AI's moving phase …` | failing |
| Live tray drives viewer moving phase | `renders a <dice-tray> during the viewer's own moving phase too` | failing |
| Freeze-on-2 surface eliminated | `does not paint a partial single-die row if values arrive truncated` | failing |

**Self-check:** No vacuous tests written; all assertions check concrete strings, attributes, or DOM nodes.

**Pre-existing suite:** 108/108 passing, no regressions.

**Handoff:** To Dev (Naomi) for GREEN.
## Dev Assessment

**Implementation Complete:** Yes
**Tests:** 116/116 client (vitest), 822/822 server (node:test), no regressions.
**Typecheck:** Clean for both `tsconfig.dice.json` and `tsconfig.client.json`.

**Files Changed:**
- `src/shared/dice/index.tsx` — collapsed from a 187-line web-component definition to a 21-line registration shim that imports `DiceTrayElement` from `@local/dice-lib` and calls `customElements.define` once.
- `src/clients/shared/DiceTray.tsx` — added `tuning?: DiceTuning` prop and a `DiceTuning` exported type alias; serializes the prop to a JSON `tuning` attribute on the underlying `<dice-tray>` element (omitted when prop is undefined).
- `plugins/backgammon/client/dice.js` — replaced the `moving`-phase `staticDiceRow()` call with a new `replayDiceTray()` helper that mounts a fresh `<dice-tray mode="replay">` element each render, forwarding `state.turn.dice.throwParams` via the `replay` attribute when present. The `staticDie`/`staticDiceRow` helpers remain in place for the `initial-roll` viewer-side display.
- `test/client/dice-bundle-port.test.ts` — TEA-authored test patched to use Vite-native `?raw` import + `import.meta.glob` instead of `node:fs`/`node:path`/`node:url`. Vitest's jsdom env serves files under `/@fs/...`, which `readFileSync` cannot open, and the client tsconfig deliberately omits `@types/node`. Details logged as a deviation.

**Branch:** `feat/CROSS-BUG-2-dice-lib-port`

**Handoff:** To TEA (Amos) for verify phase (simplify + quality-pass).
## Architect Assessment (spec-check)

**Spec Alignment:** Aligned with caveats — structural deliverables are in place; two known gaps are explicitly logged in Delivery Findings and warrant follow-up stories rather than a hand-back.

**Spec sources reviewed:**
- Story scope (session file, lines 18-22) — primary
- Story description in `sprint/current-sprint.yaml` (CROSS-BUG-2)
- SM Assessment notes on derived ACs

**No `sprint/context/context-story-*.md` exists for this story; the sprint scaffold was bootstrapped recently and per-story context docs aren't populated yet. Spec authority therefore rests on the session file's Story Context block.**

### AC-by-AC Alignment

| Acceptance signal | Verdict | Evidence |
|-------------------|---------|----------|
| Port: bundle entry consumes `@local/dice-lib`'s `DiceTrayElement` | ✓ Aligned | `src/shared/dice/index.tsx` is a 21-line shim; tests `dice-bundle-port.*` pass |
| Port: no duplicate dice-lib source files in `src/shared/dice/` | ✓ Aligned | Only `index.tsx` remains; test guards against the 15-file forbidden list |
| Tuning hooks: per-game tuner reachable | ◐ Partial (wire-level only) | `<DiceTray>` React wrapper serializes `tuning` to a JSON attribute on the element; lib's `DiceTrayElement` does not yet observe the attribute. Logged by both TEA and Dev as non-blocking delivery findings. |
| Renderer drives every turn (player AND AI) | ◐ Partial (structural only) | Backgammon's `moving` phase now mounts a fresh `<dice-tray mode="replay">`. But the AI rollers (3 sites in this repo) still send `throwParams: []`, so the lib's element no-ops on the replay attribute — the AI's roll renders as an idle tray rather than an animated replay. Logged by Dev as a non-blocking gap. |
| Freeze surface removed | ✓ Aligned | Static `.die-placeholder` pip row is gone from `moving`; fresh element mounts each render eliminates the stale-state path that produced the "freeze on 2" symptom. |

### Mismatch Analysis

**1. Tuner consumed only at the wire** *(behavioral — major, cross-repo)*
- Spec: "library exposes a tuner so we can adjust camera, jitter, trajectory, and slide-final behavior per game"
- Code: React `<DiceTray>` forwards `tuning` to the `<dice-tray>` element as JSON; the lib's element does not parse it. The 3D scene is unchanged regardless of the prop.
- **Recommendation: D (defer)** — Lib code lives at `~/Projects/dice-lib` (separate repo, not in this repo's topology). A follow-up story should add `tuning` to `observedAttributes`, parse JSON, and forward to `DiceScene` props. This story delivers the consumer-side plumbing; without it the lib-side work would be uncalled.

**2. AI rolls don't drive the renderer end-to-end** *(behavioral — major, in-repo)*
- Spec: "the new renderer drives every turn (player and AI)"
- Code: `plugins/backgammon/server/ai/backgammon-player.js:54`, `src/server/ai/orchestrator.js:37`, `src/server/ai/orchestrator.js:47` all emit `throwParams: []`. The lib's `<dice-tray>` only repaints when `throwParams.length > 0`, so AI rolls show an idle tray rather than an animated replay.
- **Recommendation: D (defer)** — Story scope explicitly says "not preserving bug-for-bug behavior of the old renderer," granting license to the UX delta (idle tray instead of static pip row showing values). The freeze SURFACE — the original motivating symptom — is removed by this story's structural change. A follow-up story should land real wire-format throwParams from the AI side plus a client-side wire→scene conversion via lib's `replayThrowParams(wire, seed, D6_RADIUS)`. Recommend the team scope and prioritize that follow-up before the next backgammon-AI playtest session, because the value-display regression is user-visible during AI turns.

**3. Wire-format vs scene-format mismatch in the replay path** *(architectural — major, in-repo)*
- Spec: implicit in "renderer drives every turn"
- Code: `dice-settle` emits wire-format `DiceThrowParams` (`{velocity, angular, position[2]}`); state stores wire format; lib's `<dice-tray>` `replay` attribute parses entries as scene-format `ThrowParams[]` (`{position[3], linearVelocity, angularVelocity, rotation}`). They share field names but different shapes. Today this is dormant — no one was replaying until this story added the path.
- **Recommendation: D (defer)** — Couples directly to #2; the conversion call (`replayThrowParams`) is the natural fix-site and the lib already exports it. Same follow-up story.

### Decision

**Proceed to verify.** The structural port and tuner pass-through are aligned with story scope; the freeze surface is gone. Two non-blocking gaps (cross-repo tuner consumption, in-repo replay completion) are explicitly captured in Delivery Findings and should be promoted to follow-up stories. Reviewer (Avasarala) should sanity-check the user-visible UX delta on the backgammon AI-turn moving phase and decide whether to require the in-repo follow-up before merge.
## TEA Assessment (verify)

**Phase:** finish
**Status:** GREEN confirmed; simplify pass applied.

### Simplify Report

**Teammates:** reuse, quality, efficiency
**Files Analyzed:** 6

| Teammate | Status | Findings |
|----------|--------|----------|
| simplify-reuse | 4 findings | 2 dice-tray construction dups in plugins/backgammon/client/dice.js (`activeDiceTray`/`replayDiceTray`); 2 cross-file stub/registration dups (StubDiceTray pattern) |
| simplify-quality | clean | All naming, dead-code, type-safety checks pass |
| simplify-efficiency | clean | No over-engineering detected; the dice-tray construction overlap was flagged as borderline only |

**Applied:** 1 consolidated fix — extracted `makeDiceTray({count, mode, themeKey})` factory + `TRAY_WIDTH`/`TRAY_HEIGHT` constants in `plugins/backgammon/client/dice.js`. Closes both `activeDiceTray`/`replayDiceTray` reuse findings in one move.

**Flagged for Review:** 0 medium-confidence findings.

**Dismissed (with rationale):**
- **StubDiceTray extraction across three test files** *(high-confidence, dismissed)* — The three stubs serve different test purposes: `DiceTray.test.tsx` (pre-existing) simulates settle dispatch with `thrown`/`thrownBatches` tracking; `DiceTray.tuning.test.tsx` tracks `attrs` for attributeChangedCallback assertions; `backgammon-render-dice.test.ts` is a bare no-op stub. A shared base class would either bloat the bare stub or push complexity into a switching helper. Rule-of-three says don't extract until you have three *identical* instances — here they are three *different* instances.
- **customElements.get/define guard pattern duplication** *(high-confidence, dismissed)* — 3 lines × 3 sites = 9 lines saved by extraction, plus a new helper file and import overhead per consumer. Net wash; readability of inline guard is higher.

**Reverted:** 0.

**Overall:** simplify: applied 1 fix.

### Quality Checks (regression detection)

| Check | Result |
|-------|--------|
| `npm run test:client` (vitest) | 116/116 passing |
| `npm test` (node --test) | 822/822 passing, 1 pre-existing skip |
| `npx tsc -p tsconfig.client.json --noEmit` | clean |
| `npx tsc -p tsconfig.dice.json --noEmit` | clean |

No regressions introduced by the simplify pass; the extracted factory leaves the two callers byte-equivalent in behavior.

**Handoff:** To Reviewer (Avasarala) for code review.
## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A (0 confirmed, 0 dismissed, 0 deferred) |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings |

**All received:** Yes (1 returned clean, 8 disabled via `workflow.reviewer_subagents`)
**Total findings:** 0 confirmed from subagents, 0 dismissed, 0 deferred. All findings below are from my own analysis since 8/9 subagents were disabled by configuration.

### Rule Compliance

No `.claude/rules/*.md` files exist in this repo and no `SOUL.md`. `CLAUDE.md` is not present at the root either. The repo's only language-review rubric is the implicit set of project conventions visible in existing code. No rule-driven findings on this diff.

### Devil's Advocate

A confused player rolls their dice. The 3D tray animates the throw, lands on 3-5. Game enters `moving` phase and they begin picking their checker moves. With the old static pip row, two clearly-painted dice sat in the dice area as a constant reminder of what they rolled. After this change, the new `replayDiceTray()` helper mounts a fresh `<dice-tray mode="replay">` and sets a `replay` attribute serialized from `state.turn.dice.throwParams`.

Now trace what the lib does with that attribute. The player path stores **wire-format** `DiceThrowParams` (`{velocity, angular, position[2]}`) — that's the shape the lib's own `toWireParams` emitted on `dice-settle`, which the action handler stored unchanged. But `~/Projects/dice-lib/src/DiceTray.tsx:117` parses the replay attribute and assigns it to `state.throwParams`, typed as **scene-format** `ThrowParams[]` (`{position[3], linearVelocity, angularVelocity, rotation}`). The cast is unchecked; the lib passes the wire-format objects directly to `<DiceScene throwParams={…} />`, which forwards each entry to `PhysicsDie`. There at `~/Projects/dice-lib/src/DiceScene.tsx:446-461` the body reads:

- `throwParams.position[2]` — undefined (wire position is 2-element) → `undefined + spawnOffset[2]` = NaN → `RigidBody position` contains NaN
- `throwParams.rotation` — undefined (wire has no rotation field)
- `throwParams.linearVelocity` — undefined (wire stores it as `velocity`)
- `throwParams.angularVelocity` — undefined (wire stores it as `angular`)

A Rapier `RigidBody` with NaN position either throws, silently snaps to origin, or fails to render. Either way the player's own moving-phase dice display is broken. Compare to before: a static pip row that clearly painted the rolled values. This is a brand-new fault — not a "different but acceptable" UX delta. The story scope's "not preserving bug-for-bug behavior" clause grants license to deviate from the old UX, but it does not grant license to introduce *new* broken behavior.

The tests don't catch this because `test/client/backgammon-render-dice.test.ts` uses a bare `StubDiceTray extends HTMLElement` that ignores attributes entirely, and the "viewer's own moving phase" test sets `dice: { values: [4, 6] }` with no `throwParams` field — exercising the empty path, not the production path. The test asserts only that a `<dice-tray>` element appears; it never exercises the lib's actual rendering. Production differs from test, and the test passes anyway.

### Observations

- **[HIGH]** Wire-format `state.turn.dice.throwParams` will be serialized into the `replay` attribute and consumed by the lib's `DiceTrayElement` as scene-format `ThrowParams[]`. Result: `PhysicsDie` reads `undefined` for `linearVelocity`, `angularVelocity`, `rotation`, and `position[2]`; `position` calculation yields NaN. The player's moving-phase render breaks. Location: `plugins/backgammon/client/dice.js:54-56` (`replayDiceTray` setting the `replay` attribute) consuming `state.turn.dice.throwParams` shape established in `plugins/backgammon/server/actions.js:132`.
- **[MEDIUM]** Test coverage gap. `test/client/backgammon-render-dice.test.ts` uses a bare `StubDiceTray` that ignores attributes; `state.turn.dice.throwParams` is omitted from the "viewer's own moving phase" test fixture. The production code path with non-empty throwParams is uncovered. Location: `test/client/backgammon-render-dice.test.ts:50-65`.
- **[LOW]** `JSON.stringify(tuning)` runs on every render of the React `<DiceTray>` wrapper. A parent that constructs a fresh `tuning` object literal each render pays the serialization cost every time; React still avoids the DOM write when the resulting string is identical, but the work is wasted. `useMemo({() => …}, [tuning])` would eliminate it. Location: `src/clients/shared/DiceTray.tsx:71-72`.
- **[VERIFIED]** Bundle-entry collapse is correct: `src/shared/dice/index.tsx` is now a 17-line registration shim importing `DiceTrayElement` from `@local/dice-lib`, guarding `customElements.define` against double-registration, and re-exporting the class for callers that touch it directly. No local class declaration remains. Test `test/client/dice-bundle-port.test.ts:43-71` enforces this mechanically.
- **[VERIFIED]** `makeDiceTray({count, mode, themeKey})` extraction is well-scoped — both `replayDiceTray` and `activeDiceTray` now share dice/mode/theme/style setup, leaving only their phase-specific delta (replay attribute on one, dice-settle listener on the other). Constants `TRAY_WIDTH`/`TRAY_HEIGHT` are exported by location only and unused by anything else; no dead-code risk. Location: `plugins/backgammon/client/dice.js:48-72`.
- **[VERIFIED]** `dice-bundle-port.test.ts` uses `import.meta.glob` + `?raw` correctly for the vitest jsdom env, and the `/// <reference types="vite/client" />` directive resolves the `tsc` types under `tsconfig.client.json` without adding `@types/node`. Deviation logged appropriately by Dev. Location: `test/client/dice-bundle-port.test.ts:1,15,18-20`.

### Deviation Audit

- **TEA "test design" — No deviations from spec.** → ✓ ACCEPTED by Reviewer: matches the actual diff state of the RED commit.
- **TEA "test verification" — No deviations from spec.** → ✓ ACCEPTED by Reviewer: simplify pass applied one mechanical extraction; no deviation from the spec.
- **Dev "Patched TEA's dice-bundle-port.test.ts to use Vite-native imports"** → ✓ ACCEPTED by Reviewer: the original `node:fs`/`node:path` approach was incompatible with vitest's jsdom env and the client tsconfig's deliberate lack of `@types/node`. The Vite-native rewrite preserves the assertion contracts exactly.
- **Dev "Backgammon `moving` phase uses a fresh `<dice-tray>` element regardless of replay payload"** → ✗ FLAGGED by Reviewer: the deviation as written claims the lib "does not paint dice" when throwParams is empty, which is true for the AI path. But the deviation does NOT acknowledge that when throwParams IS populated (player's own moving phase) the lib will *attempt* to paint with wire-format data it interprets as scene format — producing NaN positions and broken rendering. This is the [HIGH] observation above. The deviation rationale ("eliminating the stale-state freeze is the test contract") understated the production impact.

#### Reviewer (audit)
- **Wire vs scene format mismatch passed through `replay` attribute:** Spec source: `plugins/backgammon/server/actions.js:132` and `~/Projects/dice-lib/src/DiceTray.tsx:117`. Spec text: action handler stores `payload.throwParams` unchanged, lib's `DiceTrayElement` casts the parsed replay JSON to `ThrowParams[]`. Code: `replayDiceTray` (this story) sets the attribute when `state.turn.dice.throwParams.length > 0`, but the stored shape is wire format. Rationale: not addressed in any deviation logged by TEA or Dev (Dev mentioned the gap in Delivery Findings but not in Design Deviations). Severity: High. Forward impact: blocks merge.

## Reviewer Assessment

**Verdict:** REJECTED

| Severity | Issue | Location | Fix Required |
|----------|-------|----------|--------------|
| [HIGH] | `replayDiceTray` writes wire-format `DiceThrowParams[]` to a `replay` attribute the lib parses as scene-format `ThrowParams[]`. Player's own moving phase will pass `undefined` for `linearVelocity`/`angularVelocity`/`rotation`/`position[2]` to `PhysicsDie`, producing NaN positions and a broken render. | `plugins/backgammon/client/dice.js:54-56` | Either (a) drop the `replay` attribute entirely in this story (minimum one-line fix: delete the `if (Array.isArray(throwParams)…)` block) so both player and AI moving phases render as idle 2d6 — uniform and safe, deferring proper animated replay to a follow-up; or (b) convert wire→scene via `replayThrowParams(wire, seed, D6_RADIUS)` from `@local/dice-lib` before setting the attribute, importing the helper and a seed source into `plugins/backgammon/client/dice.js`. (a) is the smaller, safer change for this sprint. |
| [MEDIUM] | Test coverage gap: `backgammon-render-dice.test.ts` uses a no-op stub and omits `throwParams` from the "viewer's own moving phase" fixture, masking the production code path. | `test/client/backgammon-render-dice.test.ts:50-65` | Add a test fixture that sets `state.turn.dice.throwParams` to a realistic wire-format array and asserts the dice-tray either renders cleanly or doesn't set the malformed attribute. TEA may need to add this. |

**Handoff:** Back to Dev (Naomi) for the [HIGH] fix. [MEDIUM] can be addressed as part of the same hand-back or, if Dev chooses option (a) (drop the replay attribute), the test gap becomes moot because there's no malformed-data path left to test.

[LOW] tuning re-serialization is left in place — not blocking; useMemo can come in a future polish pass.
## Dev Assessment (rework)

**Rework Complete:** Yes
**Reviewer's HIGH finding addressed:** Yes — dropped the conditional `setAttribute('replay', …)` in `replayDiceTray`; tray now mounts as `mode='idle'` with N dice. The wire/scene format mismatch can no longer reach `PhysicsDie`.
**Reviewer's MEDIUM finding addressed:** Yes — strengthened `test/client/backgammon-render-dice.test.ts` "viewer's own moving phase" case to include realistic wire-format throwParams in the fixture and assert no `replay` attribute is set on the resulting `<dice-tray>`. Future regressions that re-introduce malformed-data forwarding will fail this assertion.
**Reviewer's LOW finding (tuning useMemo):** Left in place per Reviewer's "not blocking; useMemo can come in a future polish pass" call.

**Files Changed (rework):**
- `plugins/backgammon/client/dice.js` — `replayDiceTray({values, themeKey})` now returns a `mode='idle'` tray; `throwParams` parameter and the `setAttribute('replay', …)` line are gone. Header comment and helper docstring updated to explain why idle was chosen (the wire/scene mismatch on the lib side) and to point at the follow-up scope (`replayThrowParams` + AI throwParams generator).
- `test/client/backgammon-render-dice.test.ts` — viewer's own moving-phase test now sets `dice: { values: [4, 6], throwParams: wireThrowParams }` and asserts `tray.getAttribute("replay")` is null.

**Tests:** 116/116 client (vitest), 822/822 server (node:test). Typecheck clean.

**Branch:** `feat/CROSS-BUG-2-dice-lib-port` — commit `8989bc4` pushed to origin.

**Handoff:** To TEA (Amos) for re-verify, or directly to Reviewer (Avasarala) for re-approval. Workflow yaml drives the next phase — phase pointer is currently `green`, so the standard exit protocol routes to `spec-check` next.
## Architect Assessment (spec-check, rework pass)

**Spec Alignment:** Aligned. The rework neutralized the HIGH wire/scene mismatch by dropping the `replay` attribute entirely; both moving-phase paths now render a fresh `<dice-tray mode='idle'>` with N dice. No new drift introduced.

**Re-check against the AC table from the prior spec-check pass:**

| Acceptance signal | Verdict (rework) | Note |
|-------------------|------------------|------|
| Port: bundle entry consumes `@local/dice-lib`'s `DiceTrayElement` | ✓ Aligned | unchanged by rework |
| Port: no duplicate dice-lib source files in `src/shared/dice/` | ✓ Aligned | unchanged |
| Tuning hooks: per-game tuner reachable | ◐ Partial (wire-level only) | unchanged; deferred per prior recommendation |
| Renderer drives every turn (player AND AI) | ◐ Partial (structural only) | Fresh element mounts on every update; animated replay deferred. Same gap as before, now with explicit follow-up finding. |
| Freeze surface removed | ✓ Aligned | unchanged |

**Mismatch carry-over from prior pass:**

1. Tuner consumed only at the wire — **D (defer)** — cross-repo (`~/Projects/dice-lib`); follow-up story.
2. AI rolls don't animate end-to-end — **D (defer)** — closed by rework Dev finding (animated replay loop is the follow-up story scope).
3. Wire/scene format mismatch — **RESOLVED** — rework drops the `replay` attribute; lib never receives malformed data.

**Decision:** Proceed to verify. The rework correctly applied Reviewer's option (a). The structural port and tuner pass-through are sound; the animated-replay loop is now an explicit follow-up rather than a latent regression.
## TEA Assessment (verify, rework pass)

**Phase:** finish (rework re-verify)
**Status:** GREEN confirmed.

### Simplify Report (rework diff: dice.js + backgammon-render-dice.test.ts)

**Teammates:** reuse, quality, efficiency (all re-run on the 2-file rework diff)
**Files Analyzed:** 2

| Teammate | Status | Findings |
|----------|--------|----------|
| simplify-reuse | clean | The makeDiceTray factory from the prior verify pass is still doing the work for both replay and active callers; rework introduced no new duplication. |
| simplify-quality | 2 findings (medium) | Pre-existing: unused `ctx` param in `renderDice` signature; pre-existing: module header line "On dice-settle, calls onRoll({ values, throwParams })" describes an internal contract, not the public one. Neither was introduced by the rework. |
| simplify-efficiency | 1 finding (high) | `StubDiceTray` in `test/client/backgammon-render-dice.test.ts` declares `throw`/`throwAll`/`reset` methods that are never invoked by the current test cases. |

**Applied:** 0 fixes.

**Dismissed (with rationale):**
- **StubDiceTray unused methods (efficiency, high)** — The three methods document the minimal interface the lib's element exposes. Today's tests only exercise the `moving` phase (which never invokes `throw`/`throwAll`/`reset`), but a future test covering `initial-roll` or `pre-roll` would need them when `activeDiceTray` mounts. Removing 3 lines now would just have to be re-added later; net cost > net benefit.
- **Unused `ctx` param in renderDice (quality, medium)** — Pre-existing in the function signature before this story. Out of scope for a rework verify pass focused on the Reviewer-flagged HIGH fix. Worth a janitor-tier follow-up but not blocking.
- **Stale module header line (quality, medium)** — Same: pre-existing, accurate when written, drifted as `renderDice` evolved. Janitor-tier follow-up.

**Reverted:** 0.

**Overall:** simplify: clean — rework diff introduced no new issues; flagged items are pre-existing and out of rework scope.

### Quality Checks (regression detection, rework pass)

| Check | Result |
|-------|--------|
| `npm run test:client` (vitest) | 116/116 passing |
| `npm test` (node --test) | 822/822 passing, 1 pre-existing skip |
| `npx tsc -p tsconfig.client.json --noEmit` | clean |

Reviewer-flagged HIGH (wire/scene mismatch) is verified resolved: the new test case at `test/client/backgammon-render-dice.test.ts:65-91` constructs a fixture with realistic wire-format throwParams and asserts `tray.getAttribute("replay")` is null. The malformed-data path can no longer be silently re-introduced without that test failing.

### TEA (test verification, rework)
- No upstream findings during rework verification.

**Handoff:** To Reviewer (Avasarala) for re-approval.
## Subagent Results (rework pass)

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | findings | 1 pre-existing flake | dismissed (not introduced by branch — `test/ai-backgammon-full-leg.test.js` non-deterministic RNG; `git diff main...HEAD` is empty for orchestrator.js + backgammon/server/) |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings |

**All received:** Yes (1 returned, 8 disabled via `workflow.reviewer_subagents`)
**Total findings:** 0 confirmed, 1 dismissed (pre-existing flake), 0 deferred.

### Devil's Advocate (rework pass)

Could wire-format throwParams still reach the lib's `<dice-tray>` element through any other path? Walked each consumer: (a) `activeDiceTray` sets `mode='active'` which clears `state.throwParams` per the lib's `syncFromAttributes` elseif branch — safe; (b) `replayDiceTray` post-rework no longer calls `setAttribute('replay', …)` at all and mounts with `mode='idle'` — safe; (c) the React `<DiceTray>` wrapper does not set `replay` either; (d) `renderDice` does `mount.textContent = ''` before each render, so no stale element survives. No remaining path. Could a future contributor re-introduce the regression silently? No — the new test at `test/client/backgammon-render-dice.test.ts:65-91` constructs a fixture with realistic wire-format throwParams in `state.turn.dice.throwParams` and asserts `tray.getAttribute("replay")` is null. Any future code that re-adds the conditional `setAttribute('replay', …)` will break that assertion. Could the JSON.stringify-on-every-render in `DiceTray.tsx` regress something? It's wasted compute, not correctness — React debounces the attribute write when the string matches, and the lib's `attributeChangedCallback` only fires on changes. Could the `staticDie`/`staticDiceRow` path that's still wired for `initial-roll` leak `.die-placeholder` into the moving phase by accident? No: `mount.textContent = ''` runs unconditionally on every render and the phase check is exact.

### Observations (rework pass)

- **[VERIFIED]** Reviewer's prior HIGH (wire/scene format mismatch) is resolved. `plugins/backgammon/client/dice.js:67-81` no longer accepts a `throwParams` argument and no longer calls `setAttribute('replay', …)`; the renderer caller at `:135` no longer reads `state.turn.dice.throwParams`. The malformed-data path is removed at source.
- **[VERIFIED]** Reviewer's prior MEDIUM (test coverage gap) is closed. The viewer's-own-moving test at `test/client/backgammon-render-dice.test.ts:65-91` now sets realistic wire-format throwParams and asserts on the absence of `replay`. Future regressions will fail.
- **[VERIFIED]** Rework header comment + `replayDiceTray` docstring accurately describe both the current safe behavior (idle render) and the deferred follow-up scope (wire→scene conversion + AI throwParams generator). `plugins/backgammon/client/dice.js:1-19, 67-78`.
- **[VERIFIED]** simplify trio re-ran on the 2-file rework diff; 0 fixes applied; one high-confidence stub-method finding (StubDiceTray unused methods) and two medium-confidence pre-existing findings were dismissed with documented rationale in the TEA verify-rework assessment.
- **[LOW carried over]** `JSON.stringify(tuning)` in `src/clients/shared/DiceTray.tsx:71-72` still re-runs on every render; Dev correctly left it per my prior "non-blocking" call. Polish-tier follow-up.

### Deviation Audit (rework pass)

- **Dev "Backgammon `moving` phase uses a fresh `<dice-tray>` element regardless of replay payload" (REVISED)** → ✓ ACCEPTED by Reviewer: the revised deviation now accurately describes the post-rework behavior (mode='idle', no replay attribute) and explicitly names the Reviewer-flagged HIGH that motivated the revision. Spec source and forward-impact fields are intact.
- **Dev rework finding "Gap (non-blocking): Proper animated replay…"** → ✓ ACCEPTED by Reviewer: the follow-up scope (AI throwParams generator + wire→scene conversion) is correctly identified; no overlap with already-listed Dev or TEA gaps.

## Reviewer Assessment (rework pass)

**Verdict:** APPROVED

**Data flow traced:** `state.turn.dice.values` (server actions.js:132) → `renderDice` reads `values`, ignores `throwParams` → `replayDiceTray({values, themeKey})` → `makeDiceTray({count, mode: 'idle', themeKey})` → fresh `<dice-tray>` element with no `replay` attribute → lib's `DiceTrayElement.syncFromAttributes` sees `mode='idle'`, sets `state.throwParams = null`, `DiceScene` renders `PickupDie` row. No wire/scene mismatch possible.

**Pattern observed:** `mount.textContent = ''` + fresh element mount per state update at `plugins/backgammon/client/dice.js:108` is the correct way to eliminate stale-state visual artifacts. Idiomatic for non-React phase-driven DOM.

**Error handling:** Defensive guards (`Array.isArray(values) && values.length > 0`) on the renderDice moving branch still hold; truncated-values fixture passes the lib-stub test path without rendering. The lib's element silently no-ops on missing/empty attributes.

**Handoff:** To SM for finish-story (assuming spec-reconcile is a no-op given Architect's accepted-as-aligned assessment from the rework spec-check pass; SM workflow will route through it).