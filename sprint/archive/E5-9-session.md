---
story_id: "E5-9"
jira_key: ""
epic: "E5"
workflow: "tdd"
---
# Story E5-9: Per-seat colour picker + duplicate-colour uniqueness (in-game setup phase)

## Story Details
- **ID:** E5-9
- **Jira Key:** (local-only, no Jira)
- **Workflow:** tdd
- **Points:** 8
- **Priority:** p2
- **Epic:** E5
- **Stack Parent:** none

## Summary

Build an in-game per-seat colour picker in the React setup phase (alongside the roll-off panel). Each of 2-4 seated players picks their own colour from a palette of 4 slots. The picker must enforce duplicate-colour uniqueness and integrate with the existing colour-mutation action pipeline.

**THIS IS THE WORK — NOT A DISCOVERY PASS.** The design decision is made: per-seat (not creator-only), mounted in the React setup phase next to RollOffPanel at `RiskApp.tsx:182`, gated on `phase==="setup"`.

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-07-01T10:22:21Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-01T09:53:01Z | 2026-07-01T09:54:23Z | 1m 22s |
| red | 2026-07-01T09:54:23Z | 2026-07-01T10:03:14Z | 8m 51s |
| green | 2026-07-01T10:03:14Z | 2026-07-01T10:11:50Z | 8m 36s |
| review | 2026-07-01T10:11:50Z | 2026-07-01T10:22:21Z | 10m 31s |
| finish | 2026-07-01T10:22:21Z | - | - |

## Branch Strategy
**Branch Strategy:** trunk-based (branching skipped — work happens on the default branch)

g-1 is a standalone trunk-based repository. All development occurs directly on `main` with no feature branch.

## What Already Exists (Build ON These)

### Roll-off Precedent
- Server seam: `state.turnOrderRolls` (`plugins/risk/server/state.js:61`)
- Client: `src/clients/risk/rollOff.ts` + `RollOffPanel.tsx`, mounted at `RiskApp.tsx:182`

### Colour Model (Fully Threaded)
- **E5-7/E5-8 reference:** themes.ts (`paletteSlot`), all seat-colour surfaces wired to `view.colors`
- **Server:** `plugins/risk/server/state.js:51-55` seeds `state.colors: number[]` from `participant.color` (identity default, out-of-range sanitised at `initialState`)
- **No in-game mutation path yet** — picker is the last consumer to wire
- **Action pipeline:** `plugins/risk/server/actions.js:37` switches on action kinds; `validate.js` gates legality; `view.js` projects `view.colors`
- **Palette:** `SEAT_LABEL`, `SEAT_HEX`, `PALETTE_SIZE=4` in `src/clients/risk/themes.ts`

## The Build (Three Parts)

### 1. Client→Server Colour-Mutation Action
- New setup-phase action kind (e.g., `setup:pick-color` / `set-color`)
- Handler in `actions.js` (`applyPickColor`): validates slot (0 ≤ slot < PALETTE_SIZE), enforces uniqueness, writes `state.colors[seat]`
- `validate.js` gates to `phase==="setup"` and the acting seat
- Colours seeded identity at init; action mutates from there

### 2. Duplicate-Colour Uniqueness (AC5)
- Two seats cannot silently end up the same slot
- Reject the pick OR clearly surface the conflict
- Pure predicate, unit-testable

### 3. Per-Seat Picker UI
- React component in setup phase
- Next to `RollOffPanel`, mounted from `RiskApp.tsx:182`
- Shows 4 palette slots, which are taken, current seat's pick
- Emits the action
- Surfaces duplicate conflicts if any

## Testable Seams (TDD — Both Harnesses)

### Server (node --test, `test/**/*.test.js`)
- `applyPickColor` reducer: writes `state.colors[seat]`, rejects out-of-range, rejects/surfaces duplicate
- `validate.js` gating: setup phase + correct actor
- Follow existing `plugins/risk/server` test patterns

### Client (vitest, `test/client/`)
- Picker view-model: available vs taken slots, current pick
- Picker render + action emission
- Cross-surface recolour ALREADY covered by E5-7/E5-8 (picker just produces non-identity `view.colors`)

### Visual/Integration (Call Out, Don't Fake)
- WebGL dice material, crest SVG on-screen (E5-7/E5-8 precedent)

## Scope

**In Scope:**
- Per-seat picker in the setup phase
- Colour-mutation action
- Duplicate uniqueness

**Out of Scope:**
- Vanilla-JS lobby / creator-time picker (explicitly NOT chosen)
- Persisting colour prefs across games
- 5-6P palette widening (tracked separately)

## Build/Deploy Trap
`.ts/.tsx` inert until `npm run build:client` + server restart.
- Client tests: `npm run test:client` (vitest)
- Server tests: `npm test` (node --test)
- No tsc gate (build = esbuild)

## Delivery Findings

No upstream findings.

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Improvement** (non-blocking, Dev guidance): the `pick-color` action must be handled BEFORE the turn-ownership gate at `plugins/risk/server/actions.js:68` (`actorIdx !== state.currentPlayer → 'not your turn'`), the same way `resign` is (line 46). It is self-scoped (writes only `state.colors[actorIdx]`), so any seat may pick during setup regardless of whose deploy-turn it is — the RED test `a NON-current player may pick during setup` pins exactly this. Affects `plugins/risk/server/actions.js`. *Found by TEA during test design.*
- **Question→resolved** (non-blocking): no `view.js` change is needed — `riskPublicView` spreads `...rest` of state (`plugins/risk/server/view.js:11`), so a mutated `state.colors` reaches `view.colors` automatically. Dev only builds the action + client picker; the projection is free. *Found by TEA during test design.*
- **Improvement** (non-blocking): colours are mutable ONLY during `phase === 'setup'` (the RED test `rejected once setup is over` pins this) — the action should reject in any later phase so a mid-game recolour can't scramble the board. Affects `plugins/risk/server/actions.js` / `validate.js`. *Found by TEA during test design.*

### Dev (implementation)
- **Improvement** (non-blocking): validation lives inline in the `pick-color` handler (`actions.js`), NOT in `validate.js`. The existing `validate*` helpers all assume the ACTOR is `currentPlayer` (owned-territory checks); pick-color is off-turn and self-scoped with only a range+phase check, so a one-off validator would be more indirection than the two-line guard. If a future `validatePickColor` is wanted for symmetry it can be extracted then. Affects `plugins/risk/server/actions.js`. *Found by Dev during implementation.*
- **Improvement** (non-blocking): two modules whose names differ only in case (`colorPicker.ts` vs `ColorPicker.tsx`) collide on macOS's case-insensitive filesystem — vite served the wrong module and `ColorPicker` imported as `undefined`. Renamed the helper to `colorSlots.ts`. Worth a lint/CI guard against case-only filename collisions. *Found by Dev during implementation.*
- No blocking upstream findings — the picker is the last colour consumer; every seat-colour surface (E5-7/E5-8) recolours off the swapped `view.colors` with no further wiring.

### Reviewer (code review)
- **Improvement** (non-blocking): the setup-phase picker renders `.color-picker` / `.color-swatch` / `.mine` elements but **no CSS defines them** — `plugins/risk/client/style.css` has no swatch/picker rules (the only button styling is `.deploy-row button.step`). Swatches paint their palette background via `var(--pN-1)` but have no width/height, and the `.mine` class has no visual marker, so the picker renders as tiny default-size buttons with no visible "this seat is yours" indication. Functionally correct (dispatch + injection proven by tests), visually incomplete. Affects `plugins/risk/client/style.css` (add `.color-picker` layout + `.color-swatch` sizing + `.color-swatch.mine` selected-state). **The manual setup-phase screenshot the Dev already flagged MUST confirm the swatches are visible/clickable before playtest.** *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `plugins/risk/server/actions.js:60` comment claims the pick "writes only the actor's seat," but the swap branch also writes the displaced seat's slot (`c.colors[other] = cur`, line 75). The off-turn bypass is still safe (only cosmetic colour slots change, and reversibly), but the rationale should read "writes only cosmetic colour slots, never game-consequential state." Affects `plugins/risk/server/actions.js`. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `src/clients/risk/colorSlots.ts:1` header comment names the wrong file (`// src/clients/risk/colorPicker.ts`) — a stale artifact of the Dev's case-collision rename. Pairs with the Dev's suggested CI guard against case-only filename collisions. Affects `src/clients/risk/colorSlots.ts`. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `ColorSlot.hex` and `ColorSlot.takenBy` are computed and unit-tested but unused by the only consumer (`ColorPicker` reads `slot`/`isMine`/`label` and paints from the CSS var, not `hex`). Either surface them (e.g. show which seat holds a slot) or trim the view-model. Affects `src/clients/risk/colorSlots.ts`. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `ColorPicker` mounts whenever `view.phase === 'setup'` regardless of `view.youAre`; a spectator (`youAre === null`) sees every swatch as non-mine, so each click posts a `pick-color` the server harmlessly rejects as 'unknown participant'. Consider gating the mount on `view.youAre !== null`. Affects `src/clients/risk/RiskApp.tsx:184`. *Found by Reviewer during code review.*

## Design Deviations

No deviations from spec.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Duplicate-colour uniqueness implemented as SWAP, not "reject or surface"**
  - Spec source: context-story-E5-9.md / session "The Build" §2 (E5-7 AC5)
  - Spec text: "Two seats cannot silently end up the same slot — Reject the pick OR clearly surface the conflict."
  - Implementation: the RED tests pin SWAP semantics — when a seat picks a slot another seat holds, the two seats swap slots, so `state.colors` stays an injection (all-distinct) by construction. Duplicates are made impossible rather than rejected/surfaced.
  - Rationale: colours seed to the identity permutation, so at 4P every slot is already taken (`colors=[0,1,2,3]`) and a reject-taken rule would make 4P completely unpickable. Swap works uniformly for 2-4P, needs no free-slot precondition, and fully satisfies "two seats cannot silently share a colour" (they never can). It is a strictly stronger guarantee than reject-or-surface.
  - Severity: minor (narrows an intentionally-open AC to the one option that works for all player counts)
  - Forward impact: the client picker shows all four slots as selectable (a taken slot triggers a swap, not an error) rather than greying taken slots out; no downstream story depends on reject semantics.

### Dev (implementation)
- **Corrected two defects in the committed RED test files (assertions UNCHANGED)**
  - Spec source: the RED test artifacts `test/risk-actions-pick-color.test.js` + `test/client/risk-color-picker.test.tsx` (commit 5317818)
  - Spec text: n/a — these are TEA test-harness defects surfaced during GREEN, not spec deviations.
  - Implementation: (1) the `setupState` fixture computed `seats` locally but omitted it from the returned state object, so `playerIndex` returned null → every 4-seat test failed with `'unknown participant'` (the 2P test passed only because it passed `seats` via overrides). Added `seats,` to the fixture's returned state. (2) The client test imported `./colorPicker` (helper) and `./ColorPicker` (component) — names differing only in case, which collide on macOS's case-insensitive FS; renamed the helper file to `colorSlots.ts` and updated the import.
  - Rationale: both are bugs in the test infrastructure, not the assertions. No `assert`/`expect` was changed, added, or removed — the fixture now builds a valid multiplayer state and the import resolves to the right module, so the tests exercise the real contract instead of erroring before reaching it.
  - Severity: minor (test-infra corrections; no behaviour change to production code)
  - Forward impact: none — Reviewer can diff the two test files against 5317818 and confirm only `seats,` was added and one import path changed.

### Reviewer (audit)
- **TEA: duplicate-colour uniqueness as SWAP, not reject-or-surface** → ✓ ACCEPTED by Reviewer: sound. The identity seed (`colors=[0,1,2,3]`) makes every slot taken at 4P, so a reject-taken rule is unplayable at 4P; swap is uniform for 2-4P and is a strictly stronger guarantee — `colors` stays an injection by construction. Verified the invariant holds for the free-slot, swap, and no-op branches at `plugins/risk/server/actions.js:70-77` (inside the `color !== cur` guard `other` can never equal `actorIdx`, so no self-corruption) and by the RED tests `test/risk-actions-pick-color.test.js:46-95`.
- **Dev: corrected two RED test-infra defects (assertions unchanged)** → ✓ ACCEPTED by Reviewer: diffed `5317818..e307d45` on both test files — the only changes are `+ seats,` in the server fixture and the `./colorPicker` → `./colorSlots` import path; no `assert`/`expect` was added, removed, or weakened. The rename fix also explains the stale header comment flagged below.
- No undocumented spec deviations found — the implementation matches the SM decision (per-seat, in-game setup phase, mounted beside `RollOffPanel`).

## Sm Assessment

**Story:** E5-9 — Per-seat colour picker + duplicate-colour uniqueness, in-game setup phase (8pts, p2, tdd, epic E5). This closes the colour-picker thread that E5-7 and E5-8 deferred.

**This is NOT a discovery story. The design decision is made — do not defer it again.** The user explicitly rejected further punting and a UX/Architect discovery pass. Two prior stories deferred the picker as "design-blocked"; that framing is retired. See [[feedback_risk_picker_deferral]] — the seams already exist and the home is decided.

**Decision captured (build to this, don't re-litigate):**
- **Per-seat**, not creator-only — each of the 2-4 seated players picks their own colour.
- **Home = in-game React setup phase**, mounted alongside `RollOffPanel` at `RiskApp.tsx:182` (`{view.phase === "setup" && …}`). NOT the vanilla-JS lobby.

**What is already DONE (do NOT rebuild):**
- The whole client colour model is threaded — E5-7 `themes.ts` (`paletteSlot`) + E5-8 thread 3 wired board/crest/dice/seat-strip/turn-pip/continent-pips to read `view.colors`. **The picker is the LAST consumer to wire**: the instant it writes a non-identity `view.colors`, every surface recolours for free.
- Server already models per-seat slots: `plugins/risk/server/state.js:51-55` seeds `state.colors: number[]` from `participant.color` (integer slot, identity default, out-of-range sanitised) — but only at `initialState`; there is **no in-game mutation path yet** (that's the new action to build).
- Setup-phase surface precedent: `RollOffPanel` (E5-7) at `RiskApp.tsx:182`; action pipeline `plugins/risk/server/actions.js:37` `applyRiskAction` (switch on `setup:setup-deploy` etc.), `validate.js` legality gate, `view.js` → `view.colors`.

**The build (three parts, for TEA):** (1) a setup-phase colour-mutation action (`applyPickColor` in `actions.js` + `validate.js` gate to setup phase / acting seat, writes `state.colors[seat]`); (2) duplicate-colour uniqueness — reject or clearly surface a collision (pure predicate); (3) the per-seat picker UI in the setup phase.

**Testable seams — spans BOTH harnesses:** server reducer + dup predicate + validate gate under **node --test** (`test/**/*.test.js`, mirror existing `plugins/risk/server` tests); picker view-model + render + action emission under **vitest** (`test/client/`). Cross-surface recolour is already covered by E5-7/E5-8 — don't re-test it; the picker just needs to emit a non-identity `view.colors`. Genuinely visual bits (WebGL dice, crest SVG) are integration/manual — call out, don't fake-assert.

**Highest-uncertainty item (a real engineering choice, NOT a blocker):** how a duplicate pick is handled — hard-reject the action (server refuses, client greys out taken slots) vs. allow-and-surface (swap/warn). TEA/Dev pick the simpler correct option and log it as a deviation if it narrows AC5; do not stop to ask for a design pass. Everything needed to build is in place.

**Build/deploy trap:** `.ts/.tsx` inert until `npm run build:client` + restart. Client = vitest, server = node --test, no tsc gate.

**Routing:** Phased tdd → handoff to TEA (Lord Melchett) for the red phase.

## TEA Assessment

**Tests Required:** Yes
**Reason:** Real feature (server colour-mutation action + client picker UI). No chore bypass.

**Test Files:**
- `test/risk-actions-pick-color.test.js` (node --test, server) — 8 tests: free-slot pick (2P), swap on a taken slot (4P), all-distinct invariant across a pick sequence (AC5), non-current-player pick during setup, idempotent self-pick, out-of-range/non-integer rejection, rejection outside setup, unknown-participant rejection.
- `test/client/risk-color-picker.test.tsx` (vitest, client) — 7 tests: `colorSlots` view-model (seat→slot mapping, `isMine`, swap reflection, free-slot null), `ColorPicker` render (4 swatches, marks the viewer's slot), posts `pick-color` on click, and does NOT post when the viewer re-clicks their own slot.

**Tests Written:** 15 tests across both harnesses. **Contract defined by the tests:** action `{ type: "pick-color", payload: { color: <slot 0-3> } }`; new client modules `src/clients/risk/colorPicker.ts` (`colorSlots`) + `ColorPicker.tsx` (`{ view, post }`).

**Status:** RED — verified by testing-runner (run E5-9-tea-red):
- Server: 1172 pass / **5 fail** (all in `risk-actions-pick-color.test.js`; 3 guard tests pass because they correctly error today) / 1 pre-existing skip; zero other regressions.
- Client: **48 files / 261 tests green**, 1 file (`risk-color-picker.test.tsx`) errors on the missing `colorPicker`/`ColorPicker` import — the expected RED, same pattern as E5-7's roll-off modules (Dev creates them in GREEN).

### Rule Coverage

| Rule / concern | Test(s) | Status |
|------|---------|--------|
| Input validation (TS #10 / JS) — colour is an integer 0 ≤ c < PALETTE_SIZE | `out-of-range or non-integer slot is rejected` (9, -1, 1.5, 4) | RED |
| Authorization — only the actor's OWN seat is mutated; off-turn allowed but self-scoped | `NON-current player may pick during setup`, `unknown participant cannot pick` | RED |
| State-machine gating — colours mutable only in setup | `rejected once setup is over` | passes-today, meaningful post-GREEN |
| AC5 uniqueness invariant — no two seats share a slot | `colours stay all-distinct after any pick` (Set-size assertion) | RED |
| Idempotency / no wasted action | server `idempotent no-op`; client `does not fire … slot they already hold` | RED |
| #4 null/undefined — slot 0 is a valid non-falsy pick | swap/free-slot tests exercise slot 0 explicitly | RED |

**Rules checked:** input-validation, authz (self-scope), state-gating, uniqueness, idempotency, slot-0 safety — all pinned. #10 validation is enforced in the new action handler.
**Self-check:** 0 vacuous tests. The 3 server "guard" tests pass today only because an unhandled action errors — but each asserts a SPECIFIC rejection (range / phase / participant) that must still hold once the happy path works, so none is vacuous. Client assertions are concrete (mock `post` called-with, `data-slot`/`data-mine`, slot counts).

**Handoff:** To Dev (Baldrick) for GREEN. Build order: (1) add `{ type: "pick-color"; payload: { color: number } }` to `RiskAction` in `src/clients/shared/contracts/risk.ts`; (2) handle `pick-color` in `applyRiskAction` BEFORE the turn gate (`actions.js:68`, like `resign`) — validate integer 0-3, gate to `phase==='setup'`, SWAP `state.colors` (`cur=colors[actor]; other=colors.indexOf(color); colors[actor]=color; if(other>=0) colors[other]=cur`); no `view.js` change (it spreads state). (3) create `colorPicker.ts` (`colorSlots`) + `ColorPicker.tsx` and mount it in the setup phase at `RiskApp.tsx:182` next to `RollOffPanel`. Remember: `.tsx` inert until `npm run build:client` + restart; run BOTH `npm test` and `npm run test:client`.

## Dev Assessment

**Implementation Complete:** Yes — per-seat colour picker, both server action and client UI.

**Files Changed:**
- `plugins/risk/server/state.js` — `export` `PALETTE_SIZE` (was a private const).
- `plugins/risk/server/actions.js` — import `PALETTE_SIZE`; handle `pick-color` BEFORE the `currentPlayer` gate (self-scoped, off-turn, like `resign`): reject outside `phase==='setup'`, validate integer `0 ≤ color < PALETTE_SIZE`, then SWAP (`cur=colors[actor]; other=colors.indexOf(color); colors[actor]=color; if(other!==-1) colors[other]=cur`) so `colors` stays an injection.
- `src/clients/shared/contracts/risk.ts` — add `{ type: "pick-color"; payload: { color: number } }` to `RiskAction`.
- `src/clients/risk/colorSlots.ts` (new) — `colorSlots(view)` slot→seat view-model (`takenBy`/`isMine`).
- `src/clients/risk/ColorPicker.tsx` (new) — 4 swatches, marks the viewer's slot, posts `pick-color` on click (no-op on own slot).
- `src/clients/risk/RiskApp.tsx` — import + mount `<ColorPicker view post />` in the setup phase, next to `RollOffPanel`.
- `test/risk-actions-pick-color.test.js`, `test/client/risk-color-picker.test.tsx` — two test-infra fixes (see Dev deviation; assertions unchanged).

**Tests:** BOTH harnesses GREEN (testing-runner, run E5-9-dev-green): server **1177/1178** (1 unrelated pre-existing skip, 0 fail; picker file 8/8), client **268/268** across 49 files (0 fail; picker file 7/7). Baseline was 261 client tests → +7 new.

**Build:** `npm run build:client` rebuilds the risk bundle clean (41 modules, +2 for the new picker files), no esbuild errors. (Bundles gitignored.)

**Branch:** `main` (trunk-based); commits `5317818` (RED, TEA) + `e307d45` (impl) pushed to `origin/main`.

**Manual/visual check (NOT unit-coverable, per E5-7/E5-8):** the picker's on-screen swatches + live recolour of the board/crest/dice when a seat swaps colour need a rebuild + setup-phase screenshot to eyeball — the unit pins cover the action semantics, the view-model, and the swatch DOM/dispatch, but not the rendered WebGL/SVG paint. This is the FIRST story that produces a non-identity `view.colors` in real play, so it's also the first real end-to-end exercise of the E5-7/E5-8 threading.

**Handoff:** To Reviewer (Captain Darling). Scrutinise: (1) the swap keeps `colors` an injection for every pick sequence (AC5); (2) `pick-color` correctly bypasses the turn gate yet stays self-scoped (can't mutate another seat); (3) the phase-gate locks colours after setup; (4) the two test-file edits are pure infra fixes (diff against `5317818`) — confirm no assertion was weakened; (5) the swap UX (picking a taken slot swaps rather than rejects) is acceptable for AC5.

## Subagent Results

Only `reviewer-preflight` is enabled in `workflow.reviewer_subagents`; the other 8 are disabled via settings. Per the agent definition, disabled rows are pre-filled as "Skipped / disabled" and I covered each of their domains myself (see the tagged observations in the assessment below).

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 0 story smells (tests 1445 pass / 0 fail / 1 pre-existing skip; risk bundle builds clean; 7 tsc errors ALL predate story & untouched by diff; 0 console.log/todo/commented-code) | N/A |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings — covered by Reviewer `[EDGE]` |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings — covered by Reviewer `[SILENT]` |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings — covered by Reviewer `[TEST]` |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings — covered by Reviewer `[DOC]` |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings — covered by Reviewer `[TYPE]` |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings — covered by Reviewer `[SEC]` |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings — covered by Reviewer `[SIMPLE]` |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings — covered by Reviewer `[RULE]` |

**All received:** Yes (1 enabled subagent returned clean; 8 disabled via settings and self-covered)
**Total findings:** 0 blocking; 5 non-blocking Improvements (1 Medium — missing picker CSS; 4 Low — comment/doc/dead-field/spectator-mount). 0 dismissed. 0 deferred.

### Rule Compliance

Rules source: `.pennyfarthing/gates/lang-review/javascript.md` (13 checks) + `typescript.md` (13 checks). No `.claude/rules/`, `SOUL.md`, or root `CLAUDE.md` exist in this repo.

**JavaScript checklist — `plugins/risk/server/actions.js`, `state.js` (all 13 pass):**
- #1 silent errors — every reject returns an explicit `{ error }` envelope; `clone()` JSON-round-trips internal state only, no `JSON.parse` of untrusted input. PASS.
- #3 prototype pollution — the only bracket writes are `c.colors[actorIdx]` / `c.colors[other]` with **validated numeric** indices (`playerIndex` result + `indexOf` result); no user string keys, no `Object.assign(userInput)`. PASS.
- #4 equality — strict `===`/`!==` throughout (`color !== cur`, `other !== -1`, `state.phase !== 'setup'`). PASS.
- #9 module/scope — `export const PALETTE_SIZE` (const, read at call-time inside `applyRiskAction` — no TDZ/cycle hazard); no `var`. PASS.
- #10/#11 error-handling & input-validation — `color` gated by `Number.isInteger(color) && 0 ≤ color < PALETTE_SIZE`; `actorId` → `actorIdx` via `playerIndex` (null ⇒ 'unknown participant'); phase gated to `setup`. Strong boundary validation. PASS.
- #2 async, #5 DOM, #6 node, #7 regex, #8 test-quality, #12 hygiene, #13 fix-regressions — N/A or PASS (no async/regex/child_process/secrets; no console.log).

**TypeScript checklist — `ColorPicker.tsx`, `colorSlots.ts`, `contracts/risk.ts`, `RiskApp.tsx` (all 13 pass):**
- #1 type escapes — no `as any` / `!` / `@ts-ignore` in production code. PASS.
- #2 generics — `colorSlots(view: { colors?: readonly number[]; youAre: number | null })` uses `readonly` (rule #2); `post: (action: RiskAction) => void` is a specific signature, not `Function`. PASS.
- #4 null/undefined — `view.colors ?? []` uses `??` (not `||`) on an optional field; `isMine` has an explicit `takenBy !== null` guard. PASS.
- #5 modules — `import type { RiskView, RiskAction }` for type-only; runtime values (`SEAT_LABEL`/`SEAT_HEX`) imported without `type`; extensionless relative imports match project convention. PASS.
- #6 React/JSX — pure function component, no hooks/effects; `key={s.slot}` is stable (not index-on-reorderable); no `dangerouslySetInnerHTML`. PASS.
- #10 type-level input validation — client payload typed `{ color: number }` but the authoritative validation is server-side runtime (never trusts client). PASS.
- #3 enum, #7 async, #9 config, #11/#12 — N/A or PASS. #8 test-quality — LOW note: test fixtures use `as never` / `as HTMLButtonElement` (test-only shortcut, acceptable).

## Reviewer Assessment

**Verdict:** APPROVED

**Data flow traced:** `ColorPicker` swatch click → `post({ type: "pick-color", payload: { color: slot } })` (typed via `useGameState<RiskView, RiskAction>`, `RiskApp.tsx:22`) → server `applyRiskAction` → `actorId` resolved to `actorIdx` via `playerIndex` (unknown ⇒ rejected) → phase-gated to `setup` → integer/range-validated → SWAP on `c.colors` → returned state → `riskPublicView` re-exposes the mutated `colors` for free via the `...rest` spread (`view.js:10-11`) → every E5-7/E5-8 seat-colour surface recolours off the new `view.colors`. Wiring is real end-to-end — **not** a fixture-only illusion: `view.colors` (contract `risk.ts:75`, carried through `...rest`) and `view.youAre` (`view.js:5,11`, contract `risk.ts:88`) both exist on the production view, and the `--p0-1`..`--p3-1` palette vars the swatch reads exist at `style.css:58-61`.

**Observations (tagged by the domain each disabled subagent would have covered):**

- `[VERIFIED]` **Injection invariant (AC5) holds for all branches** — `actions.js:70-77`. Free slot (`other===-1`): actor takes an unheld slot, others untouched. Taken slot: actor↔holder swap, both stay distinct. `color===cur`: guarded no-op. Inside the `color !== cur` guard, `indexOf(color)` can never return `actorIdx` (actor holds `cur ≠ color`), so no self-corrupting swap. Corroborated by `test/risk-actions-pick-color.test.js:46-95` incl. the explicit `Set(c).size === c.length` uniqueness sweep.
- `[EDGE]` `[VERIFIED]` **Boundary enumeration** — out-of-range (`4`, `-1`, `9`), non-integer (`1.5`), missing payload (`action.payload?.color` ⇒ `undefined` ⇒ `Number.isInteger` false), off-turn seat, unknown participant, 2P free slots (2,3), and post-setup phase are ALL handled and tested (`actions.js:65-68`; test lines 74,88,97,103). No unhandled path.
- `[SILENT]` `[VERIFIED]` **No swallowed errors** — every rejection returns an explicit `{ error: string }` envelope (the established action contract); no empty catch, no `.catch(()=>{})`, no `JSON.parse` of untrusted input. `actions.js:65-68`.
- `[SEC]` `[VERIFIED]` **Off-turn bypass is safe** — `pick-color` returns before the `currentPlayer` gate (`actions.js:64` vs `:89`), but the only mutation is to cosmetic colour slots; it cannot touch territories/armies/turn order/cards. Server-side numeric-only validation; no proto-pollution (numeric indices), no injection, no XSS (JSX, 0 `dangerouslySetInnerHTML`). A malicious seat can at most swap another seat's colour during setup — public, reversible, non-consequential.
- `[TYPE]` `[VERIFIED]` **Type design is clean** — discriminated-union addition to `RiskAction` (`risk.ts:134`), `readonly number[]` param, `import type` for type-only imports, `??` over `||`. No `as any` in production.
- `[RULE]` `[VERIFIED]` **Lang-review checklists pass** — JS 13/13, TS 13/13 (see `### Rule Compliance`). No project rule violated.
- `[TEST]` `[VERIFIED]` **Test edits are pure infra** — `git diff 5317818..e307d45` on both test files shows only `+ seats,` (fixture) and the `colorPicker`→`colorSlots` import path; no assertion weakened. Tests assert real invariants + error paths, not tautologies.
- `[MEDIUM]` `[DOC]`/UX **Picker has no CSS** — `ColorPicker.tsx` emits `.color-picker`/`.color-swatch`/`.mine` but `style.css` defines none of them; swatches render as tiny default buttons with palette backgrounds and no visible "mine" marker. Non-blocking (per the severity table and the story's explicit "visual paint = manual screenshot" framing, consistent with E5-7/E5-8), but it is the headline thing the pre-playtest screenshot MUST catch. Recorded as a Delivery Finding.
- `[SIMPLE]` `[LOW]` **Dead view-model fields** — `ColorSlot.hex` and `.takenBy` are computed/tested but unused by the sole consumer. `colorSlots.ts`.
- `[DOC]` `[LOW]` **Two stale/inaccurate comments** — `actions.js:60` "writes only the actor's seat" (the swap also writes the displaced seat); `colorSlots.ts:1` header names the wrong file (`colorPicker.ts`, a rename artifact).
- `[LOW]` **Spectator mount** — `ColorPicker` mounts for `youAre===null` viewers; their clicks post server-rejected `pick-color`s. Harmless; could gate on `youAre !== null`. `RiskApp.tsx:184`.

**Error handling:** All failure modes return `{ error: string }` and leave state untouched (`r.state === undefined` on reject, pinned by `test/risk-actions-pick-color.test.js:94`). `clone()` occurs only on the mutating path, so a rejected pick never allocates or partially mutates.

### Devil's Advocate

Assume this is broken. First attack: **duplicate colours slip through.** The whole story is AC5 ("two seats can never silently share a colour"). If the swap math were off — say `indexOf` ran on the pre-mutation array after the actor's slot was already overwritten — you'd get a duplicate. But the code reads `other = c.colors.indexOf(color)` BEFORE writing `c.colors[actorIdx]`, so the displaced seat is captured first; order is correct. A subtler break: what if the actor picks their own slot but `indexOf` finds themselves? The `color !== cur` guard prevents entering the swap at all, and even if it didn't, `indexOf(cur)` would return `actorIdx` and the two writes would cancel. Safe. What if the incoming `colors` array is already NOT an injection (corrupt prior state)? Then swap could propagate a duplicate — but the seed is the identity permutation and this action is the only mutator, so the invariant is inductive from a valid base. No path produces a duplicate.

Second attack: **a confused or malicious user.** A griefer repeatedly swaps into other seats' colours during setup. Real, but bounded — it only churns cosmetic slots, it's reversible (any seat re-picks), it's confined to `phase==='setup'`, and it cannot delay or corrupt the actual game (no territory/army/turn effect). The comment's "self-scoped" claim is loose (the swap does write another seat), but the security-relevant property — "can only change cosmetic, reversible, public state" — holds. Not exploitable beyond annoyance.

Third attack: **the wiring is a fixture illusion.** Both test suites hand-build `view` objects, so a field-name drift (`youAre`/`colors`) would pass tests yet break in prod — exactly the class of bug that has bitten this codebase before. I chased it: `view.colors` rides the `...rest` spread and `view.youAre` is set explicitly in `view.js`, both matching the contract; `post` is typed to `RiskAction`; the CSS palette vars exist. It is genuinely wired.

Fourth attack: **it renders invisibly.** This is the real soft spot — there is no CSS, so the swatches are unstyled tiny buttons and "mine" has no visual marker. It won't crash and it will dispatch, but a stressed reviewer could mistake "tests green" for "feature done." It is not done visually; the manual screenshot is mandatory, which is why I logged it as a Medium Delivery Finding rather than waving it through.

**Judgment:** No Critical or High. The correctness core (injection invariant, phase gate, off-turn safety, validation) is proven and honestly tested; the real wiring is verified, not assumed. The one Medium (absent picker CSS) is genuinely visual and explicitly assigned to the manual screenshot by the story's own framework — it does not block per the severity rules, but it must not be forgotten before playtest.

**Handoff:** To SM (Edmund Blackadder) for finish-story.