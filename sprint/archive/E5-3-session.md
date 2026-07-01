---
story_id: "E5-3"
jira_key: ""
workflow: "tdd"
repos: ["g-1"]
---
# Story E5-3: Pre-game lobby: pick colors + roll-off for turn order

## Story Details
- **ID:** E5-3
- **Workflow:** tdd
- **Points:** 5
- **Priority:** p2
- **Repository:** g-1 (trunk-based)

## Story Context
Full technical approach and acceptance criteria documented in:
`sprint/context/context-story-E5-3.md`

This context file was prepared by Architect and includes 5 acceptance criteria.

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-07-01T04:24:38Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-01T03:55:32Z | 2026-07-01T03:57:09Z | 1m 37s |
| red | 2026-07-01T03:57:09Z | 2026-07-01T04:06:02Z | 8m 53s |
| green | 2026-07-01T04:06:02Z | 2026-07-01T04:18:57Z | 12m 55s |
| review | 2026-07-01T04:18:57Z | 2026-07-01T04:24:38Z | 5m 41s |
| finish | 2026-07-01T04:24:38Z | - | - |

## Branch Strategy
**Strategy:** trunk-based (branching skipped — work happens on the default branch)

The repository g-1 uses a trunk-based development model with the `main` branch as the default/primary branch. Feature branches are not created for this repository type; development proceeds directly on `main`.

## Sm Assessment

**Story:** E5-3 — Pre-game lobby: pick colors + roll-off for turn order (5pts, p2, tdd).

**Readiness:** Ready for red phase. A full Architect-authored context file
(`sprint/context/context-story-E5-3.md`) already exists with problem statement, technical
approach, scope, and 5 acceptance criteria — no additional grooming needed to begin
test-first work.

**Shape of the work (for TEA):** Two independent sub-features sharing the pre-game moment:
1. **Colors** — break the seat→color coupling (`src/clients/risk/themes.ts` maps seat→color
   by index today); store a per-seat color choice, default to the current palette so nothing
   regresses. Color-picker UI location is an open question (likely the gamebox shell outside
   the risk plugin) — flagged for discovery at pickup.
2. **Roll-off** — replace fixed `currentPlayer: 0` / seat-0-first in
   `plugins/risk/server/state.js buildInitialState` with a seeded die roll; deterministic and
   unit-testable via the existing seeded `rng`. Leave territory dealing untouched.

**Highest-uncertainty story in the epic.** The context explicitly sanctions a split into
"colors" and "turn-order roll-off" if scope proves large — TEA/Dev should raise a Delivery
Finding if a split is warranted rather than overreaching in one pass. The seeded roll-off is
the cleanest TDD entry point (pure, deterministic); start red there.

**Routing:** Phased tdd → handoff to TEA (Lord Melchett) for the red phase.

---
## TEA Assessment

### Red Phase (test writing)

**Tests Required:** Yes
**Reason:** 5-pt feature changing engine setup behaviour (turn order) + adding a new
per-seat colour data model. Deterministic, unit-testable at the server layer.

**Test Files:**
- `test/risk-pregame-lobby.test.js` (new) — 9 tests: roll-off (5), colours (3), view seam (1).
- `test/risk-state.test.js` (edited) — relaxed two stale seat-0-first assertions to
  seat-agnostic invariants so the roll-off doesn't spuriously break the territory-split test.

**Tests Written:** 9 new, covering 4 of 5 ACs directly (AC1 data half, AC2, AC3, AC4 plumbing,
AC5). AC1's cross-surface rendering + AC4's actual UI are client-side and split-flagged (see
Delivery Findings).
**Status:** RED — verified by testing-runner (The Search), RUN_ID E5-3-tea-red.

- 8/9 new tests fail on **field-presence assertions** (`state.turnOrderRolls` / `state.colors`
  absent; view doesn't surface them) — NOT import/syntax errors. Correct RED.
- 1/9 passes by design: the **AC5 golden regression guard** (`territory dealing … unchanged`)
  — green now, it exists to fail if Dev consumes rng before the territory shuffle.
- 3/3 pre-existing `risk-state.test.js` tests still pass against current code.

### AC Coverage

| AC | Covered by | Notes |
|----|-----------|-------|
| AC1 colours not seat-locked | `a player can pick a colour…` | server data seam only; client rendering split → E5-3b |
| AC2 default preserved | `colours default to the canonical seat palette…` | identity `[0,1,2]` default |
| AC3 turn order rolled | `first player is a top roller…`, `activeUserId follows…`, sweep | non-seat-0 winner proven across 16 seeds |
| AC4 roll-off visible | `public view surfaces the roll-off…` | data reaches client; UI render split-flagged |
| AC5 engine invariants hold | `roll-off leaves territory dealing… unchanged` | golden snapshot from pre-roll-off code |

### Rule Coverage (lang-review: javascript.md)

| Rule | Test(s) | Status |
|------|---------|--------|
| #4 `0` is falsy (seat 0 is a valid winner) | `activeUserId follows the roll-off winner for every seat` | failing (RED) |
| #4 `Array.isArray` not `typeof` | `roll-off records a d6 roll…`, `colours default…`, view test | failing (RED) |
| #11 input validation (colour pick is user input) | `an out-of-range colour pick is sanitised…` | failing (RED) |
| #8 test quality (no vacuous assertions) | self-check: every test asserts a concrete value/shape | pass (self-check) |

**Rules checked:** 3 of 13 lang-review rules are directly applicable to this red phase and
have test coverage; the remainder (DOM/XSS, regex, child_process, SQL, secrets) don't apply
to a pure state/view change and are Dev's self-review scope on the GREEN diff.
**Self-check:** 0 vacuous tests — every test asserts on a concrete value or shape; no
`assert(true)`, no truthy-only checks, no `let _ =`.

**Handoff:** To Dev (Baldrick) for GREEN — implement `state.turnOrderRolls` (d6 roll-off,
winner = argmax, rng consumed AFTER the territory shuffle + deck build so the AC5 golden
holds) and `state.colors` (per-seat palette-slot indices, identity default, sanitise picks
to 0-3). Both flow to the client via the existing view spread; add them to the `RiskView`
contract. See Delivery Findings for the recommended colour-UI split (E5-3b).

---
## Dev Assessment

**Implementation Complete:** Yes

**Files Changed:**
- `plugins/risk/server/state.js` — seeded d6 roll-off (`turnOrderRolls`), `currentPlayer`/
  `activeUserId` from the winner; per-seat `colors` (palette-slot index, identity default,
  out-of-range picks sanitised); new exported `firstPlayer(state)` helper (argmax, lowest-
  index tie-break, `0` fallback for legacy states). Roll-off drawn AFTER the deck build so
  the territory split is byte-identical (AC5 golden holds).
- `plugins/risk/server/actions.js` — setup→reinforce hand-off now returns to the roll-off
  winner (`firstPlayer(s)`) instead of hardcoded seat 0. **Root-cause fix** for AC5.
- `src/clients/shared/contracts/risk.ts` — added optional `turnOrderRolls?` / `colors?` to
  `RiskView` (type-only; matches what the view now emits).
- `test/risk-pregame-lobby.test.js` — added an end-to-end AC5 regression test (winner keeps
  the first reinforce turn).
- `test/risk-actions-setup.test.js`, `test/risk-multiplayer.test.js` — reconciled 4 stale
  seat-0-first setup tests to derive the first player from the roll-off winner.

**Tests:** 1169/1169 passing, 1 intentional skip (backgammon LIVE claude-CLI test). Verified
by testing-runner (The Quintet), RUN_ID E5-3-dev-green-full (full `npm test`, not just the
touched files). All 10 E5-3 tests green; no ripple across multiplayer / AI orchestrator /
full-game / other adapters.

**Branch:** main (trunk-based; committed directly).

**Self-review:**
- ✅ Wired end-to-end: roll-off + colours reach the client via the view spread; setup and
  the first real turn both honour the winner (proven by the end-to-end test).
- ✅ Follows project patterns: d6 via `Math.floor(rng()*6)+1` (matches `combat.js rollDice`);
  seat-indexed throughout; palette single-sourced.
- ✅ Error handling: colour picks (user input) are validated/sanitised to a valid slot.
- ⚠️ Scope note for Reviewer: I fixed an engine bug beyond the RED tests (AC5, setup→
  reinforce) and edited 4 collateral tests — both documented under Design Deviations →
  Dev, and the RED-coverage gap is logged in Delivery Findings for the retro.

**Handoff:** To Reviewer (Captain Darling) for code review — please scrutinise the
Dev-edited collateral tests for faithfulness and confirm the roll-off tie-break behaviour.

---
## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (1169/1169 pass, 1 pre-existing skip, clean tree, no smells) | N/A |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — covered manually (see [EDGE]) |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — covered manually (see [SILENT]) |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings — covered manually (see [TEST]) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings — covered manually (see [DOC]) |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings — covered manually (see [TYPE]) |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings — covered manually (see [SEC]) |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings — covered manually (see [SIMPLE]) |
| 9 | reviewer-rule-checker | No | Skipped | disabled | Disabled via settings — covered manually (see [RULE] / Rule Compliance) |

**All received:** Yes (1 enabled subagent returned; 8 disabled via `workflow.reviewer_subagents` and assessed manually)
**Total findings:** 0 confirmed blocking, 3 non-blocking (deferred to E5-3b / retro), 0 dismissed

## Rule Compliance (lang-review: javascript.md, enumerated against the diff)

| # | Rule | Verdict | Evidence |
|---|------|---------|----------|
| 1 | Silent error swallowing | ✓ N/A | No try/catch, `.catch`, or `JSON.parse` in the diff |
| 2 | Promise/async pitfalls | ✓ N/A | No async code added |
| 3 | Prototype pollution | ✓ COMPLIANT (good) | `new Map(participants.map(...))` — a **Map** for the user-keyed colour lookup, the recommended pattern (avoids `__proto__` on a plain object). state.js:~48 |
| 4 | Equality / `0`-is-falsy | ✓ COMPLIANT (good) | `first === 0 ? 1 : 0`; `Number.isInteger(pick) && pick >= 0 && pick < PALETTE_SIZE`; winner selection uses **array indexing**, never a truthy test — seat 0 is a valid winner and is handled. `firstPlayer` guards with `Array.isArray` + `=== 0` |
| 5 | DOM/browser security | ✓ N/A | Server-side state/logic only |
| 6 | Node.js specific | ✓ N/A | No child_process/fs/require/Buffer/env |
| 7 | Regex safety | ✓ N/A | No regex in the implementation diff |
| 8 | Test quality | ✓ COMPLIANT | No `.only/.skip`, no truthy-only/vacuous assertions; reconciled tests keep or strengthen assertions; new tests assert concrete values/shapes |
| 9 | Module/scope | ✓ COMPLIANT | `const`/`let` only (no `var`); `firstPlayer` export adds no import cycle (state.js does not import actions.js) |
| 10 | Error handling | ✓ N/A | No new throws/Error construction; existing `n<2||n>4` guard untouched |
| 11 | Input validation | ✓ COMPLIANT (good) | Colour pick (future user input) validated via `Number.isInteger` + range → falls back to a valid seat slot |
| 12 | Dependency/config hygiene | ✓ COMPLIANT | No `console.log`, secrets, or dependency changes |
| 13 | Fix-introduced regressions | ✓ COMPLIANT | AC5 fix (actions.js) introduces no swallowed error; `firstPlayer` legacy-state fallback (`return 0`) preserves old behaviour for fixtures without a roll-off |

**Rule verdict:** Clean. The change actively adopts three patterns the checklist prescribes (Map for user-keyed lookup #3, explicit numeric validation #11, index-not-truthy for seat 0 #4).

## Reviewer Assessment

**Verdict:** APPROVED

Five+ observations (min. 5 required):

1. `[VERIFIED]` **Roll-off correctness** — `firstPlayer` (state.js:~101) is a correct argmax with a lowest-index tie-break (`rolls[i] > rolls[best]`, strict `>`), and `buildInitialState` sets both `currentPlayer` and `activeUserId = seats[currentPlayer]` from it (state.js:~46, ~78). Evidence: end-to-end test drives 3P SEED_A (winner seat 2) through setup and confirms the winner keeps the first reinforce turn.
2. `[VERIFIED]` **AC5 root-cause fix is real** — `applySetupDeploy` previously hardcoded `currentPlayer = 0` / `reinforcementFor(s, 0)` on setup completion (actions.js:215-217); now uses `firstPlayer(s)`. Without it the roll-off was cosmetic. Guarded by `risk-actions-setup.test.js` test 2 and `risk-multiplayer.test.js` test 77, both of which fail against the old engine.
3. `[VERIFIED]` **Determinism preserved (AC5)** — roll-off draws `n` rng values AFTER `buildDeck`, so the territory split + deck are byte-identical; the golden-snapshot test confirms it. Evidence: `roll-off leaves territory dealing… unchanged` passes; full suite (incl. combat-replay, full-game) green.
4. `[VERIFIED]` **No production rng regression / no wiring gap** — `routes.js:166` builds initial state with a throwaway `makeRng(Date.now())` distinct from the per-action rng (`:278`), so the roll-off's extra draws cannot shift combat dice. The route's `colors = {a,b}` (`:162`) is the legacy 2P checker-colour object, correctly ignored by risk `buildInitialState` (which reads `participant.color`); participants carry no `color` yet, so E5-3 colours sit at the identity default until the E5-3b picker — matching AC2 and the documented split.
5. `[TEST]` **(manual — test-analyzer disabled)** Reconciled collateral tests are faithful: seat-0-first assumptions replaced with `firstPlayer(state)`-derived expectations; assertions preserved or strengthened (setup test 2 + multiplayer 77 now actively guard the AC5 fix). No vacuous weakening. New E5-3 tests assert concrete values (d6 range, argmax, 16-seed non-zero sweep, golden split, colour default/override/sanitise, view seam).
6. `[EDGE]` **(manual — edge-hunter disabled)** Boundary cases covered: seat 0 winning (indexing, not truthy); out-of-range/non-integer/negative colour picks → valid slot; `firstPlayer` on legacy states with no `turnOrderRolls` → `0`. `Math.floor(rng()*6)+1` matches `combat.js rollDice` (same `rng()<1` assumption; no new risk).
7. `[SEC]` **(manual — security disabled)** No injection/secrets/auth surface; colour input is integer-validated; Map avoids prototype pollution. No tenant/isolation concerns in a pure game-state change.
8. `[TYPE]` **(manual — type-design disabled)** `RiskView.turnOrderRolls?`/`colors?` added as optional `number[]` — additive, non-breaking, matches the view's `...rest` spread output. Seat-indexed number arrays are consistent with existing `cardCounts`/`eliminated` typing.
9. `[SILENT]` **(manual — silent-failure-hunter disabled)** No swallowed errors; the colour fallback is an explicit, intended default (not a masked failure). `firstPlayer`'s guard returns a documented sentinel (`0`), not a silent null.
10. `[DOC]` **(manual — comment-analyzer disabled)** Comments are accurate and match behaviour (rng-ordering rationale, tie-break-not-reroll rationale, PALETTE_SIZE mirror note). No stale/misleading comments.
11. `[SIMPLE]` **(manual — simplifier disabled)** No over-engineering; `firstPlayer` is shared by both call sites (DRY). One minor: `PALETTE_SIZE = 4` duplicates `themes.ts` palette length — acceptable (server can't import the client theme), noted as a low drift risk.

### Devil's Advocate

Let me argue this code is broken. First, the roll-off silently changes who plays first across the *entire* app — bots, SSE turn gating, the client's "your turn" banner all key off `currentPlayer`/`activeUserId`. If any consumer still assumed seat 0 starts, a non-seat-0 winner would strand the game (bot never driven, human sees the wrong turn). *Rebuttal:* the AI orchestrator gates on `activeUserId` (set to the winner), and the full suite — including `ai-orchestrator-risk-turn`, `ai-risk-4p-multibot`, and `risk-full-game` — is green; `syncActiveUser` recomputes `activeUserId` from `currentPlayer` after every action. Second, a confused player: the roll-off *result* is never shown (AC4's UI is split to E5-3b), so a player who deployed second may not understand why they didn't go first — a legibility gap, though the epic's whole theme is legibility. That is the strongest real concern and is why I file a blocking-for-epic delivery finding. Third, determinism: extra rng draws could desync a replay. *Rebuttal:* production uses independent per-action rngs and the golden test pins the split. Fourth, duplicate colours: two seats can select the same palette slot → two "Red" players, a genuine legibility hazard, unenforced. *Rebuttal:* colours are dormant (no producer until E5-3b), and TEA logged it; E5-3b must enforce uniqueness in the picker. Fifth, `rng()` returning exactly `1.0` would yield a `7` — but every rng in the codebase returns `[0,1)` and `combat.js` shares the identical formula; flagging it here without flagging combat would be inconsistent. Net: the code is correct for what it delivers; the only substantive gap is deferred, sanctioned, and tracked (E5-3b), not a defect in the shipped diff.

**Data flow traced:** lobby colour pick → (future) `participant.color` → `buildInitialState` validates to a palette slot → `state.colors` → view `...rest` spread → `view.colors` (client render = E5-3b). Today no producer sets `participant.color`, so the default identity palette flows through unchanged (AC2 safe). Turn order: seeded `rng` → `turnOrderRolls` → `firstPlayer` argmax → `currentPlayer`/`activeUserId` → setup rotation `(idx+step)%n` → setup completion returns to `firstPlayer` → first reinforce turn.

**Pattern observed:** shared `firstPlayer(state)` helper reused at both turn-order decision points (build + setup completion) — DRY, single source of truth for the winner, with a safe legacy fallback. state.js:~101.

**Error handling:** colour input integer-validated with a valid-slot fallback; `firstPlayer` guards non-array/empty `turnOrderRolls`. No swallowed errors.

**Scope note (non-blocking for this PR, blocking for epic "colours" completion):** AC1 (colour used consistently across board/crest/seat-strip/dice) and AC4 (setup UI shows the roll-off result) require the client half, which is intentionally split to **E5-3b** and needs UX/Architect discovery of the picker location in the gamebox shell. The turn-order roll-off (AC3/AC5) and the colour *data* seam (AC2 + AC1 data half) are complete and tested. I'm approving the delivered code; SM/PM should confirm the split with the user and ensure E5-3b is created before the epic's colour feature is called done.

**Handoff:** To SM (Edmund Blackadder) for finish-story.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

### TEA (test design)
- **Improvement** (non-blocking): The **client half of the colour feature** is a strong
  split candidate (E5-3b). This red phase covers the server data seam (`state.colors` +
  view plumbing) and the roll-off in full, but AC1's "used consistently across the board,
  crest, seat strip, and dice" and the colour-**picker UI** are client-only, inert-until-
  build, and depend on locating the lobby/game-setup flow in the **gamebox shell** (the
  context flags this as unlocated). Affects `src/clients/risk/themes.ts` (rewire consumers
  to read `view.colors` instead of the fixed `SEAT_HEX`/`p${seat}` mapping), the picker
  component (location TBD), and `src/clients/shared/contracts/risk.ts` (add `turnOrderRolls`
  + `colors` to `RiskView`). *Found by TEA during test design.*
- **Question** (non-blocking): **Duplicate colour picks** are not constrained by the tests
  (two seats could select the same palette slot → two "Red" players, a legibility hazard).
  Whether uniqueness is enforced server-side in `buildInitialState` or by the lobby UI is
  undecided. Affects `plugins/risk/server/state.js` / the future picker. *Found by TEA
  during test design.*
- **Gap** (non-blocking): The **setup-phase UI must render the roll-off result** (AC4) so
  players see who won the first move — this red phase only guarantees the data reaches the
  client via `view.turnOrderRolls`; the presentation is a client task with no unit coverage
  here. Affects the risk setup-phase client view. *Found by TEA during test design.*

### Dev (implementation)
- **Gap** (non-blocking, now closed): RED coverage missed the **setup→reinforce turn
  hand-off**, which hardcoded seat 0 and made the roll-off functionally void end-to-end
  (AC5). Dev fixed it (`plugins/risk/server/actions.js`) and added a regression test. Root
  cause of the miss: TEA verified only the two touched files, not the full suite, so the
  4 collateral failures and the uncovered transition surfaced at GREEN. *Retro note:* red
  phase should run the whole suite before handoff when a story changes a shared engine
  default. *Found by Dev during implementation.*
- **Improvement** (non-blocking): Confirms TEA's **E5-3b split** — the server data seam
  (`state.colors`, `state.turnOrderRolls`) and the full turn-order engine now work and are
  tested; the remaining client work (colour-picker UI in the gamebox shell, `themes.ts`
  reading `view.colors`, rendering the roll-off result, cross-surface colour consistency)
  is untouched here and should be its own story. Affects `src/clients/risk/*`. *Found by
  Dev during implementation.*

### Reviewer (code review)
- **Gap** (blocking for epic colour feature, non-blocking for this PR): AC1 (colour rendered
  consistently across board/crest/seat-strip/dice) and AC4 (setup UI shows the roll-off
  result) are **not delivered** — only the server data seam is. **E5-3b must be created and
  tracked** (client colour-picker UI in the gamebox shell, `themes.ts` reading `view.colors`,
  rendering `view.turnOrderRolls`, and duplicate-colour uniqueness) before the epic's colour
  feature is called done. SM/PM: confirm the split with the user. Affects `src/clients/risk/*`,
  `src/clients/shared/contracts/risk.ts` (types already added). *Found by Reviewer during
  code review.*
- **Improvement** (non-blocking): `PALETTE_SIZE = 4` in `plugins/risk/server/state.js`
  duplicates the client palette length (`themes.ts SEAT_HEX`/`--pN`). Acceptable (server can't
  import client theme), but E5-3b should keep the two in sync or add a drift guard. *Found by
  Reviewer during code review.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Colour representation chosen: per-seat palette-slot index, not explicit hex.**
  - Spec source: context-story-E5-3.md, "Technical Approach → A. Choose colors"
  - Spec text: "choosing a color means choosing which palette slot a seat occupies (or supplying an explicit hex) — pick one model and keep dice … and SVG crests consistent with it."
  - Implementation: Tests pin `state.colors` as an integer palette-slot array (default identity `[0,1,2,…]`). Slot indices keep the palette single-sourced in `themes.ts`/`--pN` CSS vars and avoid duplicating hex constants on the server.
  - Rationale: Architect explicitly deferred the model; slot indices are the least-invasive decoupling (existing `SEAT_HEX`/`--pN` machinery is reused via one indirection) and are trivially validatable.
  - Severity: minor
  - Forward impact: Dev/Reviewer may override to the hex model; if so, the two colour tests change. Flagged in Delivery Findings.
- **Roll-off die surfaced as a d6 on state (`turnOrderRolls`), winner = argmax.**
  - Spec source: context-story-E5-3.md, "Technical Approach → B. Roll-off"
  - Spec text: "a die roll per seat: highest roll goes first (re-roll ties) … Surface the roll-off in the setup-phase UI so players see who won the first move."
  - Implementation: Tests require `state.turnOrderRolls` (one 1-6 face per seat, matching `combat.js rollDice`) and assert `currentPlayer === argmax(turnOrderRolls)`. The exact rng-consumption position is left to Dev, constrained only by the AC5 golden.
  - Rationale: Seeded randomness can't be asserted by a hardcoded winner without coupling to rng-draw order; self-consistency (winner holds the max) + determinism + a non-seat-0 sweep is the robust equivalent of "a fixed-seed test asserts the expected winner."
  - Severity: minor
  - Forward impact: none — Dev picks the die-mapping; tests check the contract, not the internals.
- **Relaxed two stale assertions in `test/risk-state.test.js` (seat-0-first → seat-agnostic invariant).**
  - Spec source: context-story-E5-3.md, AC-3
  - Spec text: "Turn order is rolled, not fixed … rather than always seat 0."
  - Implementation: `assert.equal(s.currentPlayer, 0)` → valid-seat-index invariant; `assert.equal(s.activeUserId, 11)` → `s.activeUserId === s.seats[s.currentPlayer]`. Those tests assert the territory split, not turn order.
  - Rationale: They encoded the superseded seat-0-first contract and would break non-deterministically once the roll-off lands; relaxing them now keeps the suite coherent and the roll-off's real behaviour is covered in `risk-pregame-lobby.test.js`.
  - Severity: minor
  - Forward impact: none.
- **Re-roll-on-tie NOT enforced by a dedicated test.**
  - Spec source: context-story-E5-3.md, "Technical Approach → B. Roll-off"
  - Spec text: "highest roll goes first (re-roll ties)."
  - Implementation: No test forces a tie (the seeded rng-draw position is Dev's choice, so a tie can't be provoked deterministically from the outside). `currentPlayer` being a single valid argmax seat is asserted; a deterministic tie-break is implied but not directly pinned.
  - Rationale: Testing tie re-rolls would require coupling to internal rng consumption; deferred as a Dev-side invariant + noted for Reviewer.
  - Severity: minor
  - Forward impact: Reviewer should confirm ties resolve to a single deterministic winner.

### Dev (implementation)
- **Fixed an engine bug outside the RED tests: setup→reinforce reset the first turn to seat 0.**
  - Spec source: context-story-E5-3.md, AC-5
  - Spec text: "the game is playable end-to-end with a non-zero first player."
  - Implementation: `applySetupDeploy` (actions.js) hardcoded `currentPlayer = 0` / `reinforcementFor(s, 0)` when setup completes. Changed both to the roll-off winner via a new `firstPlayer(state)` helper. Without this, a non-seat-0 winner deploys first in setup but then loses the first real turn back to seat 0 — the roll-off would be cosmetically applied and functionally void.
  - Rationale: TEA's RED tests only assert `buildInitialState` output, so this transition was uncovered; AC5 requires the winner to actually keep the first move. Added a dedicated end-to-end regression test (`the roll-off winner takes the first reinforce turn…`).
  - Severity: **major** (feature was non-functional end-to-end without it)
  - Forward impact: none — closes the gap; flagged in Delivery Findings for the retro.
- **Reconciled 4 pre-existing tests that hard-coded seat-0-first setup order.**
  - Spec source: context-story-E5-3.md, AC-3
  - Spec text: "The first player is determined by a seeded roll-off rather than always seat 0."
  - Implementation: `risk-actions-setup.test.js` (3 tests) and `risk-multiplayer.test.js` (1 test) assumed setup begins at seat 0 and returns to seat 0. Rewrote them to derive the first seat from `firstPlayer(state)` and assert the full rotation from the winner — assertions kept equally strong (still verify every seat deploys and the reinforce hand-off), just anchored to the roll-off winner.
  - Rationale: These encoded the superseded contract and are the same collateral TEA began relaxing in `risk-state.test.js`; leaving them would fail the suite. Dev-edited tests — flagged for Reviewer to confirm faithfulness.
  - Severity: minor
  - Forward impact: none.
- **Roll-off "remaining order" follows seat order from the winner, not the full roll ranking.**
  - Spec source: context-story-E5-3.md, "Technical Approach → B. Roll-off"
  - Spec text: "decide whether the remaining order follows seat order from the winner or the full roll ranking."
  - Implementation: Only the first player is set from the roll-off; subsequent turns keep the existing `(idx + step) % n` seat rotation. The full-ranking option was not implemented.
  - Rationale: The design offers both as acceptable; seat-order-from-winner reuses the battle-tested rotation with zero new turn-order code and matches canonical Risk (roll only decides who starts).
  - Severity: minor
  - Forward impact: none — a later story could switch to full-ranking order if desired.
- **Tie-break is lowest seat index, not a re-roll.**
  - Spec source: context-story-E5-3.md, "Technical Approach → B. Roll-off"
  - Spec text: "highest roll goes first (re-roll ties)."
  - Implementation: `firstPlayer` breaks ties to the lowest seat index deterministically. A re-roll would infinite-loop on a constant-value rng (`risk-state.test.js` uses `rngFrom([0.5])`, and any seeded stream can repeat).
  - Rationale: Determinism + hang-safety over literal re-roll; the observable outcome (a single first player) is identical. (TEA pre-flagged this.)
  - Severity: minor
  - Forward impact: Reviewer confirmed-item: ties resolve to one winner.
- **Added `turnOrderRolls?` and `colors?` to the `RiskView` TS contract.**
  - Spec source: epic-E5 context, "Contracts are the seam"
  - Spec text: "`src/clients/shared/contracts/risk.ts` is the typed boundary between server view and client."
  - Implementation: Added two optional fields so the typed contract matches what the server view now emits (via the existing state spread). No client code consumes them yet.
  - Rationale: Keeps the contract honest with server reality; readies the E5-3b client work. Type-only, erased at build — no client rebuild needed.
  - Severity: minor
  - Forward impact: E5-3b client reads these fields.

### Reviewer (audit)
Every logged deviation stamped:
- **TEA — Colour representation = palette-slot index** → ✓ ACCEPTED: sound; least-invasive decoupling, single-sourced palette, and the E5-3b split note is captured. Verified no hex duplication on the server.
- **TEA — Roll-off d6 on `turnOrderRolls`, winner = argmax** → ✓ ACCEPTED: self-consistency + determinism + non-zero sweep is the correct way to test seeded randomness; matches `combat.js` d6.
- **TEA — Relaxed two `risk-state.test.js` assertions** → ✓ ACCEPTED: the relaxed assertions remain meaningful invariants (valid-seat + `activeUserId===seats[currentPlayer]`); real roll-off behaviour covered in the dedicated file.
- **TEA — Re-roll-on-tie not tested** → ✓ ACCEPTED: untestable from outside without coupling to rng-draw order; the observable invariant (single winner) is covered, and Dev's deterministic tie-break is confirmed below.
- **Dev — Fixed setup→reinforce seat-0 reset (AC5)** → ✓ ACCEPTED: this is the correct root-cause fix, not a symptom patch; without it the roll-off is cosmetic. Verified by two collateral tests + the end-to-end regression test that all fail against the old engine. Severity "major" is accurate.
- **Dev — Reconciled 4 seat-0-first collateral tests** → ✓ ACCEPTED: I read all four diffs line-by-line; assertions are faithfully generalised (derive `firstPlayer`, not hardcode 0) and preserved or strengthened — no vacuous weakening. setup-test-2 and multiplayer-77 now actively guard the AC5 fix.
- **Dev — Remaining order = seat order from winner (not full ranking)** → ✓ ACCEPTED: design offered both; reuses battle-tested rotation, matches canonical Risk (roll decides only who starts).
- **Dev — Tie-break lowest index, not re-roll** → ✓ ACCEPTED: correct call — a re-roll would infinite-loop on `rngFrom([0.5])`; observable outcome (one winner) is identical. Confirms the Reviewer-flagged tie-break item.
- **Dev — Added optional `turnOrderRolls?`/`colors?` to `RiskView`** → ✓ ACCEPTED: additive, non-breaking, keeps the typed contract honest with the view's spread output.

No undocumented deviations found: the shipped diff matches the ACs and the logged deviations; the only unmet ACs (AC1 render, AC4 UI) are the sanctioned, tracked E5-3b split — not silent divergence.