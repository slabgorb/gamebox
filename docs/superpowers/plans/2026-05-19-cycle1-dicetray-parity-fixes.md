# Cycle 1 Tail — DiceTray Parity Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to land this short task list with green tests at each step.

**Goal:** Close out Cycle 1 of the React migration by committing the three dice-tray bugs discovered during Task 5.4 (manual parity check) and re-running the regression. After this lands, Cycle 1 is genuinely "indistinguishable from the pre-migration client" — which the existing 77975ee commit claimed but did not yet satisfy.

**Architecture:** All fixes are in the shared layer — they affect every consumer of `<dice-tray>`, not just Risk. Two files change: `src/shared/dice/index.tsx` (the web component) and `src/clients/shared/DiceTray.tsx` (the React wrapper). Server is untouched.

**Spec context:** `docs/superpowers/specs/2026-05-18-react-frontend-migration-design.md` §5.4 (DiceTray now in scope for Cycle 1, per Amendment A). The cycle-1 plan (`2026-05-18-react-frontend-migration-cycle1.md`) Task 1.4 built the wrapper; Task 4.7 wired it into the CombatReveal theatre. This plan finishes both.

**Bugs found (verbatim from working tree):**

1. **Dice fall through the tray.** `autoThrowParams()` spawned at y=1.2, but the ceiling collider's bottom face is at y=1.0 and the die half-edge is ~0.21 — dice initialised already embedded in the ceiling and Rapier ejected them. Fix mirrors dice-lib's `buildDefaultThrowParams` (the proven user-drag fallback): spawn at y=0.5 with upward initial velocity.
2. **Tray collapses on render.** `<dice-tray>` is a custom element; the browser's default for unknown elements is `display: inline`, which ignores `width` / `min-height`. The bundle's 3D canvas then has zero layout box and the scene renders out of frame. Fix: force `display: block` and a fixed `height: 240px` (matches the bundle's internal canvas minHeight).
3. **Always doubles on auto-roll.** `roll(N)` called `el.throw(autoThrowParams())` once *per die*, but `<dice-tray>.throw()` applies one ThrowParams to **every** die in the scene (last call wins). With identical kinematics on dice that don't collide, all dice settle to the same face. Fix: introduce `throwAll(paramsList)` that submits a batch and applies `throwParams[i]` to `PhysicsDie[i]`; the React wrapper builds N distinct params and calls `throwAll`. Replay path needed the same fix — `parsed.throwParams[0]` was being used for every die.

The fixes are **already implemented** in the working tree. This plan commits them with test coverage and re-verifies the parity checklist.

---

## Task 1: Snapshot the bug guard test

The unstaged `test/client/DiceTray.test.tsx` already asserts the always-doubles guard (a `throwAll` batch was used, with ≥2 distinct params). Land it as the RED → GREEN proof.

- [ ] **Step 1: Confirm the test is meaningful against pre-fix code.** Read the diff in `test/client/DiceTray.test.tsx`. The new assertion is:
  - `el.thrownBatches` has length 1 (one `throwAll` call, not N `throw` calls)
  - the batch has length 3
  - `new Set(batch).size > 1` (distinct param refs)

  This would have failed against the pre-fix wrapper (no `throwAll`, N identical-shape params via `throw`).

- [ ] **Step 2: Run the test against the current (already-fixed) code.**

  Run: `npx vitest run test/client/DiceTray.test.tsx`
  Expected: PASS.

- [ ] **Step 3: Stash, revert, re-run to prove RED.** (Sanity check that the guard actually catches the bug.)

  ```bash
  git stash push -- src/clients/shared/DiceTray.tsx src/shared/dice/index.tsx test/client/DiceTray.test.tsx
  git stash pop --index   # restore the test only
  ```
  Actually simpler: temporarily edit `DiceTray.tsx` to revert just the `throwAll` call back to the per-die loop, run the test, see it FAIL, then restore the fix.

  Expected RED: `expect(el.thrownBatches).toHaveLength(1)` fails (`thrownBatches` is empty; `thrown` has 3 entries).

  This step is verification only — no commit. Restore the fix before continuing.

## Task 2: Land the fixes

- [ ] **Step 1: Stage the three real files** (skip `.claude/zeitgoose/bindings.json` — that's local tooling state, not part of this fix).

  ```bash
  git add src/shared/dice/index.tsx \
          src/clients/shared/DiceTray.tsx \
          test/client/DiceTray.test.tsx
  ```

- [ ] **Step 2: Commit.**

  ```bash
  git commit -m "fix(dice): tray parity — clip-through ceiling, collapsed layout, always-doubles

  Three bugs surfaced during Cycle-1 Risk parity testing, all in the
  shared layer:

  - spawn y=0.5 (was 1.2, embedded in ceiling collider); mirror
    dice-lib buildDefaultThrowParams.
  - force display:block on <dice-tray> (custom elements default to
    inline, collapsing the 3D scene's layout box).
  - introduce throwAll(paramsList) so each die gets distinct kinematics;
    roll(N) emits N params via throwAll. Replay path preserves the full
    per-die array (parsed.throwParams[0] was overwriting every die).

  The 'always doubles' guard test now asserts a batch throw with ≥2
  distinct param refs."
  ```

## Task 3: Re-run the Cycle-1 regression and parity checklist

- [ ] **Step 1: Server suite.**

  Run: `npm test`
  Expected: PASS (no server code changed — sanity check only).

- [ ] **Step 2: Client suite.**

  Run: `npm run test:client`
  Expected: PASS — includes the new always-doubles guard.

- [ ] **Step 3: Type-check.**

  Run: `npx tsc -p tsconfig.client.json --noEmit`
  Expected: PASS — the new `ThrowParams | ThrowParams[] | null` union and `throwAll` typing must be clean.

- [ ] **Step 4: Rebuild the Risk bundle and walk the parity checklist again, with focus on the three repaired symptoms.**

  ```bash
  GAMEBOX_PLUGIN=risk npx vite build --config vite.config.client.js
  ```

  Open Risk in the browser and verify:
  - [ ] DiceTray renders with visible height (no collapsed-to-zero scene).
  - [ ] An attack with `attackers ≥ 2` produces visibly varied dice (not all three the same face every roll).
  - [ ] Dice never disappear / fall through the floor during the auto-roll animation.
  - [ ] Final Captured/Repulsed banner still matches the dice you watched.
  - [ ] Bot-attack replay shows the bot's recorded rounds with the same per-die variation.

- [ ] **Step 5: Commit the rebuilt bundle.**

  ```bash
  git add plugins/risk/client/app.js plugins/risk/client/app.js.map
  git commit -m "build(risk): rebuild bundle with dice tray parity fixes"
  ```

## Task 4: Update the Cycle-1 plan's self-review (optional but recommended)

The previous "parity verified" commit (77975ee) was premature — three bugs slipped through Task 5.4 Step 4. Add a one-paragraph addendum at the bottom of `docs/superpowers/plans/2026-05-18-react-frontend-migration-cycle1.md` noting that this followup plan completes the parity claim. This keeps the audit trail honest.

- [ ] **Step 1: Append to the cycle-1 plan.**

  Add under "## Self-Review":

  > **Addendum (2026-05-19):** Task 5.4 Step 4 ("manual parity") missed three DiceTray bugs (clip-through-ceiling, collapsed layout, always-doubles). Fixed in followup plan `2026-05-19-cycle1-dicetray-parity-fixes.md`. Future cycles' manual parity steps should explicitly walk the dice path (roll variety, frame containment) when DiceTray is in use.

- [ ] **Step 2: Commit.**

  ```bash
  git add docs/superpowers/plans/2026-05-18-react-frontend-migration-cycle1.md
  git commit -m "docs(plan): cycle-1 parity addendum re dice tray followups"
  ```

---

## Self-Review

**Scope:** Only ships fixes already on disk. No new feature work. Two source files + one test + one bundle rebuild + one docs addendum = five commits total.

**Why a separate plan and not an amend:** The original Cycle-1 plan is locked (its commits are on `main` or about to be); cleanly separating the parity tail makes the audit clear and lets the next cycle's plan reference the addendum without rewriting history.

**Carry-forward note for Cycle 2:** any game that consumes `<dice-tray>` (backgammon, cribbage) now gets the fix for free — it lives in `src/shared/dice/`. The `throwAll` API is the right one for *any* auto-roll path; the single-die `throw` survives for user-drag scenes.
