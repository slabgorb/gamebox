---
story_id: "E5-1"
jira_key: ""
epic: "E5"
workflow: "tdd"
---
# Story E5-1: Interactive attack overlay: per-round battle cards + Manual/Blitz/Stop

## Story Details
- **ID:** E5-1
- **Jira Key:** (none)
- **Workflow:** tdd
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-06-30T11:34:54Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-30T11:10:04Z | 2026-06-30T11:12:15Z | 2m 11s |
| red | 2026-06-30T11:12:15Z | 2026-06-30T11:19:57Z | 7m 42s |
| green | 2026-06-30T11:19:57Z | 2026-06-30T11:27:59Z | 8m 2s |
| review | 2026-06-30T11:27:59Z | 2026-06-30T11:34:54Z | 6m 55s |
| finish | 2026-06-30T11:34:54Z | - | - |

## Sm Assessment

Story is ready for red. Context is Architect-authored, complete, and unambiguous — clear technical approach, explicit scope fences, seven concrete ACs. Routing to TEA (Amos) for the red phase.

**Crew, read this before you write tests:**
- **AC3 is the regression-critical one.** Absent `decide` must produce byte-identical results to the current `while (af > 1 && df > 0)` auto-grind. That default path is what the bot / defender-resolves-for-bot flow rides on. Lock it hard in red — a broken default silently breaks every existing combat.
- **The testable spine is the `decide` hook on `driveCombat` (ACs 1–3)** — pure loop-control logic, inject a stub `decide`, assert round count and the partial `ResolvedCombat`. That's where red earns its keep.
- **The UI ACs (4, 5, 7) and bot-untouched (6)** live in `CombatReveal.tsx` and the live/pending split. TEA decides what's unit-testable vs. manual-verify; don't force brittle DOM tests where a manual check is honest.
- **Client-only.** No server or contract change — `ResolvedCombat.rounds[]` is already variable-length, so a stopped fight is just fewer rounds. Build (`npm run build:client` + server restart) gates "done," not red.

No blockers. No Jira (local-id project). Branch `feat/E5-1-interactive-attack-overlay` is cut from `main`.

## Story Context

**Story:** E5-1 — Interactive attack overlay: per-round battle cards + Manual/Blitz/Stop (feature, 5pt, tdd, repo g-1, trunk-based on `main`, no Jira).

**Problem:** Dice resolve fast during attacks, which supports the ~90-minute pacing the group liked, but hurts legibility. Two coupled complaints from the playtest:
1. **Opacity:** `CombatReveal.tsx` shows only the current round's dice (it overwrites a single `round` state each tick), then a final "Captured / Repulsed". Per-round dice and army losses vanish as the next round rolls.
2. **No agency:** `driveCombat` in `combat-rules.ts` runs `while (af > 1 && df > 0)` — it auto-grinds to exhaustion. The attacker has no way to halt mid-fight.

**Solution:** Add an optional between-round decision hook to `driveCombat`. If we ask the attacker between rounds, the per-round card is exactly what they read to decide. The overlay becomes an interactive, accumulating battle log.

**Technical Approach (Client-Only):**
- **`src/clients/risk/combat-rules.ts` — `driveCombat`:** add an optional between-round decision hook to `DriveArgs`, e.g. `decide?: (r) => Promise<"roll" | "blitz" | "stop">`, awaited after each round resolves and before the next. Semantics:
  - absent/undefined `decide` ⇒ **current auto-grind** (preserves every existing caller and the bot path — this is the regression-critical default);
  - `"stop"` ⇒ break the loop, return the partial `ResolvedCombat` (survivors stay where they are; `captured` is `df === 0`);
  - `"blitz"` ⇒ stop calling `decide` and run the rest to resolution.
- **`src/clients/risk/CombatReveal.tsx` (live mode only):** accumulate each resolved round into a **card stack** instead of overwriting the single `round`. Render Roll-again / Blitz / Stop controls wired to resolve the `decide` promise. Roll-again disables when `af <= 1`. The card stack clears when the overlay unmounts (live, this-battle-only — no persistence). **Replay mode is unchanged** (it steps recorded rounds on a timer and has no live attacker to ask).
- **`plugins/risk/client/style.css` (+ any TS style mirror):** thin-card styling for the stack; keep the existing `combat-reveal` dice trays.
- **Bot attacks stay automatic.** A bot's attack is resolved on the *defender's* client via `pendingCombat` — there is no human attacker to prompt. The interactive controls mount **only when the local human is the attacker** (live, non-pending path). Do not wire `decide` into the defender-resolves-for-bot flow.
- **Build:** client is gitignored; `npm run build:client` + server restart before "done".

**Scope:**
- **In scope:** the `decide` hook on `driveCombat`; the accumulating card stack + Roll/Blitz/Stop controls in live `CombatReveal`; thin-card CSS; tests for the new loop control.
- **Out of scope:** any persistent / cross-battle / all-game battle log; contract changes; server changes; bot stop-policy.

**Acceptance Criteria:**
1. `driveCombat` honours an injected between-round decision. With `decide` returning `"stop"` after round N, the loop exits after exactly N rounds and the returned `ResolvedCombat` reflects the partial fight (correct `attackerLosses`/`defenderLosses`, `captured === (df === 0)`).
2. `"blitz"` runs to resolution. After `decide` returns `"blitz"` once, no further decisions are requested and combat resolves exactly as the legacy auto-grind would.
3. Absent `decide` is unchanged. With no decision hook, `driveCombat` produces byte-identical results to the current auto-grind (regression guard for the bot / defender-resolves path).
4. Live overlay accumulates a card per round. During a human attacker's multi-round attack, each resolved round appends a thin card showing that round's attacker dice, defender dice, and the resulting attacker/defender losses; earlier cards remain visible.
5. Controls behave. Roll-again is disabled when the attacker is down to 1 army; Stop is available only while the defender still stands; choosing Stop ends the attack with survivors left in the attacking territory.
6. Bot attacks are untouched. A bot attack resolved on the defender's client still auto-resolves with no Roll/Blitz/Stop prompts.
7. Card stack is ephemeral. Closing/unmounting the overlay clears the stack; reopening a new attack starts empty.

## TEA Assessment

### Red Phase (test writing)

**Tests Required:** Yes
**Reason:** New loop-control contract on `driveCombat` (the `decide` hook) — regression-critical and must be locked before implementation.

**Test Files:**
- `test/client/combat-rules.test.ts` — extended with a new describe block `combat-rules: between-round decision hook (E5-1)` (5 new tests; existing suite untouched).

**Tests Written:** 5 new tests covering the decide-hook contract for ACs 1–7. Run via Vitest (`npx vitest run test/client/combat-rules.test.ts`).
**Status:** RED confirmed — 12 total, **8 pass / 4 fail**. The 4 failures are exactly the new behaviour tests; they fail because `decide` is not yet wired into the loop. AC3 (regression guard) and all 7 legacy tests pass.

**RED evidence (run by Machine Shop, exit 1):**
| Test | Maps to | Result | Why red |
|------|---------|--------|---------|
| `AC1: decide='stop' after a surviving round exits with the partial fight` | AC1 | FAIL | auto-grind ran 2 rounds (losses 4) instead of stopping at 1 (losses 2) |
| `AC2: decide='blitz' stops consulting and runs to resolution` | AC2 | FAIL | `decide` called 0×, expected 1× |
| `decide='roll' continues like auto-grind and is consulted once per surviving round` | AC3/AC5 | FAIL | `decide` called 0×, expected 2× |
| `decide is not consulted once the attacker is down to 1 army` | AC5 | FAIL | `decide` called 0×, expected 1× |
| `AC3: absent decide is the unchanged auto-grind (bot-path regression guard)` | AC3/AC6 | PASS | baseline unchanged (stays green by design) |

### Rule Coverage

| Rule (typescript.md) | Test(s) | Status |
|------|---------|--------|
| #3 union exhaustiveness — all of `"roll" \| "blitz" \| "stop"` exercised | AC1 (stop), AC2 (blitz), roll-continuation (roll) | covered |
| #7 async/promises — `decide` must be awaited | AC1 uses an `async` decide; if not awaited, the returned Promise ≠ `"stop"` and the stop never fires | covered |
| #8 test quality — meaningful, non-vacuous assertions | all 5 use exact `toEqual` / positive `toHaveBeenCalledTimes` counts | covered |

**Rules checked:** 3 of 13 lang-review rules are directly testable from this client-only loop change; the rest (React hooks deps, input validation, build config, etc.) are dev-side review concerns for the `CombatReveal.tsx` edit and belong to the Reviewer pass.
**Self-check:** 0 vacuous tests. The "decide not consulted after capture / at af≤1" cases were written as *positive* call-count assertions on multi-round scenarios so they fail RED rather than passing trivially against the un-wired baseline.

### Manual-Verify checklist (deferred from automated tests — for Dev build + Reviewer)

These rendering/lifecycle ACs are not automated (see Design Deviations + the design doc's Testing section, which scopes automated tests to `driveCombat`). Verify after `npm run build:client` + server restart:
- **AC4** — during a human attacker's multi-round attack, each resolved round appends a thin card (atk dice → def dice, atk/def losses, running survivors); earlier cards remain visible.
- **AC5 (visual)** — Roll-again disabled when attacker is at 1 army; Stop shown only while the defender stands; Stop leaves survivors in the *from* territory.
- **AC6** — a bot attack resolved on the defender's client still auto-resolves with NO Roll/Blitz/Stop controls.
- **AC7** — closing/unmounting the overlay clears the card stack; a new attack starts empty.

**Handoff:** To Dev (Naomi) for GREEN.

## Dev Assessment

**Implementation Complete:** Yes
**Tests:** 232/232 client tests passing (GREEN), including all 5 new decide-hook tests. `npm run build:client` succeeds (risk bundle rebuilt — required, the bundle is gitignored).

**Files Changed:**
- `src/clients/risk/combat-rules.ts` — added `CombatDecision` type + `RoundResult` interface; added optional `decide` hook to `DriveArgs`; `driveCombat` now awaits `decide` after each round **only at a real decision point** (`af > 1 && df > 0`). `"stop"` breaks (partial `ResolvedCombat`), `"blitz"` clears the hook and runs the rest unattended, `"roll"` continues. Absent `decide` ⇒ byte-identical auto-grind (bot/defender-resolves path unchanged).
- `src/clients/risk/CombatReveal.tsx` — added `interactive?: boolean` to `LiveProps`. In interactive mode: accumulate a per-round `RoundCard` stack (dice + losses + running survivors) and render Roll-again / Blitz / Stop controls that resolve the `decide` promise (Roll-again `disabled` at `af <= 1`; Stop shown only while `df > 0`). Card stack is component-local ⇒ ephemeral per mount (AC7). Replay mode and the non-interactive (bot/defender) live path are unchanged (AC6).
- `src/clients/risk/RiskApp.tsx` — pass `interactive` on the human-attacker `live` mount only; the `pendingCombat` (bot) mount stays auto.
- `plugins/risk/client/style.css` — thin-card `.combat-reveal__log` / `.combat-card` styling + `.combat-reveal__controls` / `.combat-btn` controls, themed (parchment/brass, `--p0`/`--p1`).

**AC mapping:** AC1-3 + the loop-guard contract for AC5/AC6 are covered by automated tests (GREEN). AC4, AC5-visual, AC6, AC7 are wired and build-clean; they remain on the Manual-Verify checklist (above) per the design's Testing scope — verify in-app after a **server restart** (the rebuilt bundle is inert until the server restarts).

**Branch:** `feat/E5-1-interactive-attack-overlay` (to be pushed)
**Handoff:** To Reviewer (Avasarala) for code review.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none blocking (tests GREEN 232/0, build ok, 0 new type errors, 0 new smells) | confirmed 0, dismissed 0, deferred 1 (pre-existing tsc debt) |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings — covered directly by Reviewer ([EDGE]) |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings — covered directly by Reviewer ([SILENT]) |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings — covered directly by Reviewer ([TEST]) |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings — covered directly by Reviewer ([DOC]) |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings — covered directly by Reviewer ([TYPE]) |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings — covered directly by Reviewer ([SEC]) |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings — covered directly by Reviewer ([SIMPLE]) |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings — covered directly by Reviewer ([RULE]) |

**All received:** Yes (1 enabled subagent returned; 8 disabled via `workflow.reviewer_subagents` and assessed directly by Reviewer)
**Total findings:** 0 confirmed blocking, 0 dismissed, 1 deferred (pre-existing `tsc` debt on `main`, out of scope for E5-1)

## Rule Compliance

TypeScript lang-review checklist (`.pennyfarthing/gates/lang-review/typescript.md`) enumerated against every new/changed symbol in the diff. (No SOUL.md / CLAUDE.md / `.claude/rules` exist — the lang-review checklist is the only rubric.)

| # | Rule | Enumeration over the diff | Verdict |
|---|------|---------------------------|---------|
| 1 | Type-safety escapes (`as any`, `@ts-ignore`, non-null on nullable) | New code: 0. `decideResolver.current` consumed via `resolve?.(d)` (optional call, no `!`); `last` guarded by `&& last`. (2 `as any` for the `--die` CSS var + 4 `!` on refs are PRE-EXISTING on `main`, not in this diff.) | COMPLIANT |
| 2 | Generic/interface pitfalls | New `RoundResult`, `RoundCard` interfaces + `CombatDecision` union — concrete types, no `Record<string,any>`/`Function`/`object`. | COMPLIANT |
| 3 | Enum/union exhaustiveness | `CombatDecision = "roll"\|"blitz"\|"stop"`: `driveCombat` handles `"stop"` (break) and `"blitz"` (clear hook); `"roll"` is the implicit continue. All three reachable and handled. | COMPLIANT |
| 4 | Null/undefined handling | `if (decide && af>1 && df>0)`, `props.interactive === true`, `interactive && awaiting && last` — explicit boolean/existence checks, no `\|\|` on falsy-valid values. | COMPLIANT |
| 5 | Module/declaration | `import { driveCombat, resolveRound, type CombatDecision }` (inline type import); `export type CombatDecision`, `export interface RoundResult`. | COMPLIANT |
| 6 | React/JSX | `key={i}` on the card list is append-only (never reordered/removed — comment documents it), so the rule's reorder/insert/delete concern doesn't apply; no `dangerouslySetInnerHTML`; buttons are `type="button"`. `useEffect([props])` with the `started` ref guard is PRE-EXISTING and unchanged. | COMPLIANT |
| 7 | Async/Promise | `decide: (r)=>Promise<CombatDecision>` is `await`ed in `driveCombat`; the `CombatReveal` decide promise is resolved by `choose`; `driveCombat().then(...)` consumes the result (no floating promise). | COMPLIANT |
| 8 | Test quality | 5 new tests: exact `toEqual`, positive `toHaveBeenCalledTimes`, deterministic dice; no `as any`, no vacuous assertions. | COMPLIANT |
| 10 | Input validation | Client-only UI; the server (`replayAttack`) remains the validation authority (dice range/count, extra-round rejection). No new client-trusted input. | COMPLIANT |
| 11 | Error handling | `driveCombat().then(...)` has no `.catch` — a roll rejection would be unhandled. This is the PRE-EXISTING live-path pattern (original had no catch either), not introduced here. | COMPLIANT (pre-existing, LOW) |

## Devil's Advocate

Let me argue this is broken. **(1) The server rejects a stopped fight.** A Stop POSTs fewer rounds; if `replayAttack` required the loop to run to exhaustion it would reject the payload and Stop would silently fail in production despite green client tests. — *Refuted:* `combat.js:43` only rejects *empty* rounds when combat was possible, and `:50` only rejects rounds that occur *after* the fight should have ended. A clean stop produces ≥1 legal round and no trailing rounds, so it validates; survivors are recomputed from the posted rounds. **(2) Stop puts survivors in the wrong place.** — *Refuted:* `actions.js:261-263` non-capture branch does `src.armies += eff.attackerSurvivors`, i.e. survivors retreat to the `from` (attacking) territory — exactly AC5. **(3) Double-click race resolves the decision twice / posts a corrupt fight.** — *Refuted:* `choose` sets `decideResolver.current = null` *synchronously* before resolving; a second click finds `null` and `resolve?.()` is a no-op. **(4) The overlay strands a hung promise if it unmounts mid-decision.** — *Refuted:* the live overlay is gated by `live` state which is cleared only in `onResolved`; nothing clears it mid-combat, so the only exit is the user resolving via a button. **(5) `setState` after the component is gone.** Possible only if unmounted mid-combat, which (4) shows can't happen on the human path. **(6) Roll-again's `disabled={last.af<=1}` never fires** because `decide` is only consulted at `af>1` — so the AC5 "disabled at 1 army" can't be observed. — *Conceded as a LOW:* the intent (no over-roll past 1 army) is still enforced, just by the controls not rendering once the loop ends rather than by a visibly-disabled button; the guard is harmless and defensive. **(7) A confused user blitzes and loses the whole stack.** — Working as designed: Blitz restores the old auto-grind on demand, which is the documented fast path. Nothing uncovered that changes the verdict.

## Reviewer Assessment

**Verdict:** APPROVED

**Data flow traced:** user clicks Roll/Blitz/Stop → `choose(d)` resolves the stored `decide` promise → `driveCombat` continues / clears the hook / breaks → `onResolved(out)` → POST `{type:"attack", payload:{from,to,resolved:{rounds,...}}}` → `actions.js` (`resolved` branch) → `replayAttack({force: src.armies-1, defenders: tgt.armies, rounds: resolved.rounds})` recomputes survivors server-side (client losses ignored) → territories updated: capture moves survivors to `tgt`, stop/repulse retreats them to `src`. **Safe:** the server is authoritative and validates dice counts/ranges and rejects trailing rounds; a partial fight is just a non-capture with fewer rounds.

**Observations:**
- `[VERIFIED]` Server applies a partial (Stop) fight correctly — `plugins/risk/server/combat.js:41-88` consumes the posted `rounds[]` and recomputes survivors; `plugins/risk/server/actions.js:261-263` retreats survivors to the `from` territory on non-capture. AC5 holds end-to-end, not just in client unit tests.
- `[VERIFIED]` Bot/defender path untouched (AC6) — `RiskApp.tsx:198` (`live`) is the only mount that gains `interactive`; the `pendingCombat` mount (`:233`) passes no `interactive` ⇒ `isInteractive=false` ⇒ no `decide`, no cards, auto-grind. Combined with AC3 (absent-`decide` byte-identical, green), the bot path is provably unchanged.
- `[EDGE]` (subagent disabled — assessed by Reviewer) Double-click / unmount-mid-decision are both safe (see Devil's Advocate #3, #4). `CombatReveal.tsx:180-185`, `:135`.
- `[SILENT]` (disabled — Reviewer) `driveCombat().then()` at `CombatReveal.tsx:170` has no `.catch`; a roll rejection would be unhandled. PRE-EXISTING live-path pattern, not introduced by E5-1. Severity LOW.
- `[TEST]` (disabled — Reviewer) The 5 new tests are non-vacuous (exact `toEqual`, positive call-counts, deterministic dice). UI ACs 4/5-visual/6/7 are manual-verify per the accepted TEA deviation; I verified each by code reading (cards append in `onRound`; controls gated correctly; ephemeral via component-local state).
- `[DOC]` (disabled — Reviewer) Comments are accurate and earn their place: `decide` semantics in `combat-rules.ts:305-316`, the append-only key rationale, the `interactive` prop doc. No stale/misleading docs.
- `[TYPE]` (disabled — Reviewer) New types are sound; preflight confirms **0 new** `tsc` errors (the `attackerSurvivors`/`aLoss` errors are pre-existing debt, identical on `main`).
- `[SEC]` (disabled — Reviewer) Client-only UI; no new attack surface, no injection vectors, no secrets. The server remains the validation authority.
- `[SIMPLE]` (disabled — Reviewer) Minimal implementation — one prop, one ref, two state vars; reuses `resolveRound` for card losses (no new math). No over-engineering or dead code beyond the harmless defensive guard noted below.
- `[RULE]` (disabled — Reviewer) See Rule Compliance table: all 11 applicable TypeScript lang-review rules COMPLIANT (rule #11 pre-existing LOW).
- `[LOW]` `disabled={last.af<=1}` on Roll-again (`CombatReveal.tsx:231`) is effectively unreachable since `decide` is never consulted at `af<=1`; the AC5 intent is met by the controls not rendering once the loop ends. Harmless/defensive — not a defect.

**Pattern observed:** clean separation — loop control lives in `driveCombat` (pure, fully tested), the UI only resolves a promise. Good pattern at `combat-rules.ts:80-84`.

**Error handling:** server-side validation is thorough (`replayAttack` rejects bad dice counts/ranges and trailing rounds); client-side the only gap is the pre-existing missing `.catch` on the live `driveCombat` chain (LOW, not introduced).

**Manual-Verify note for finish:** AC4/AC5-visual/AC6/AC7 are verified by code analysis here but should still be eyeballed in-app after a **server restart** (the rebuilt, gitignored bundle is inert until restart).

**Handoff:** To SM (Drummer) for finish-story.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Gap** (non-blocking): `CombatReveal` has no discriminator between the interactive human-attacker path and the auto defender-resolves-for-bot path — both currently mount as `mode: "live"`. Affects `src/clients/risk/CombatReveal.tsx` and its call sites in the risk app (the `decide` hook must be wired ONLY on the human-attacker mount; the bot/pendingCombat mount must keep passing no `decide` so AC3/AC6 hold). Dev/Architect must choose the discriminator (e.g. a new prop) — it is intentionally left unspecified by the design and is the key wiring decision for GREEN. *Found by TEA during test design.*

### Dev (implementation)
- **Resolved** (non-blocking): TEA's flagged Gap is closed — added an `interactive?: boolean` prop to `CombatReveal`'s `LiveProps`. The human-attacker mount (`RiskApp.tsx` `live &&`, line ~197) passes `interactive`; the defender-resolves-for-bot mount (`pendingCombat` branch, line ~233) passes nothing → no `decide`, auto-grind, no controls (AC3/AC6 hold). *Found by Dev during implementation.*
- **Improvement** (non-blocking): `ResolvedCombat` (`src/clients/shared/contracts/risk.ts`) has no `attackerSurvivors`/`defenderSurvivors` fields, but `RiskApp.tsx` reads `resolved.attackerSurvivors`/`defenderSurvivors` when seeding `combatSignature` (lines ~220, ~252) — both are always `undefined`. Pre-existing and harmless (the value is `undefined` symmetrically on both the seed and the compare, so replay-suppression still matches), out of scope for E5-1. Worth a cleanup later. *Found by Dev during implementation.*

### Reviewer (code review)
- **Improvement** (non-blocking): pre-existing `tsc` debt confirmed by preflight — `RiskApp.tsx` has standing type errors (`attackerSurvivors`/`defenderSurvivors` not on `ResolvedCombat`; `CombatRound` missing `aLoss/dLoss`; `BotSeat` null-assignability) that are **identical on `main`** (E5-1 introduces zero new ones). The build uses esbuild (no `tsc` gate), so these don't block, but a typed `ResolvedCombat`/`LastCombat` cleanup would pay down real debt. Affects `src/clients/risk/RiskApp.tsx` + `src/clients/shared/contracts/risk.ts`. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): the live-path `driveCombat().then(...)` in `CombatReveal.tsx` has no `.catch` (pre-existing pattern); a roll rejection would surface as an unhandled promise rejection. Low risk, pre-existing, out of scope for E5-1. *Found by Reviewer during code review.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **UI ACs (4, 5-visual, 6, 7) tested at the `driveCombat` contract level + manual-verify, not via `CombatReveal` DOM/component tests**
  - Spec source: context-story-E5-1.md AC-4/5/6/7; docs/superpowers/specs/2026-06-30-risk-playtest-followup-design.md → "Testing (TDD)"
  - Spec text: design Testing section enumerates only `driveCombat` decide-fn tests (stop after N / blitz / absent) plus "Roll-again disabled at `af <= 1`; Stop is a no-op once `df === 0`" — it does not call for component tests.
  - Implementation: the loop-control semantics behind every UI AC are locked at the `driveCombat` level (decide call-counts at the af≤1 and df===0 boundaries; partial-fight result on stop). The card-stack rendering, button enablement styling, bot-no-controls rendering, and unmount-clear are left to manual verification.
  - Rationale: `CombatReveal`'s interactive prop API (how it distinguishes the human-attacker mount from the bot/pendingCombat mount) is unspecified; a DOM test would over-specify markup/props the dev hasn't designed yet. The design's own test plan scopes automation to `driveCombat`. Aligns with the SM assessment's "don't force brittle DOM tests where a manual check is honest."
  - Severity: minor
  - Forward impact: Reviewer must run the Manual-Verify checklist in the TEA Assessment after `npm run build:client` + restart; if the dev lands a clean interactive-mode prop API, a follow-up component test is cheap to add but is not required for this story.

### Dev (implementation)
- **Round 1 auto-resolves on mount; the attacker is prompted only *between* rounds (round 2 onward)**
  - Spec source: docs/superpowers/specs/2026-06-30-risk-playtest-followup-design.md → "Behavior"
  - Spec text: "Attacker presses **Roll** → one round resolves → a **thin card** drops onto a stack … After each round the attacker chooses: Roll again / Blitz / Stop."
  - Implementation: opening the attack resolves round 1 immediately (one card appears); Roll-again / Blitz / Stop controls then appear and gate every subsequent round.
  - Rationale: the locked `driveCombat` contract (the tests TEA wrote) consults `decide` strictly *after* a round and only when another round is possible. Gating round 1 behind a button would require a pre-round decision call, which breaks the asserted `decide` call-counts (e.g. AC2 expects exactly 1 call). Post-round prompting honours the tested contract; the attacker opened the dialog intending to attack, so the first round resolving is reasonable.
  - Severity: minor
  - Forward impact: none — UX-only; the resolved `ResolvedCombat` posted to the server is identical either way.

### Reviewer (audit)
- **TEA deviation — UI ACs tested at the `driveCombat` contract level + manual-verify (not DOM tests)** → ✓ ACCEPTED by Reviewer: sound. Aligns with the design's own Testing scope; the interactive prop API was genuinely unspecified, so DOM tests would have over-specified it. I independently verified the UI ACs (4/5-visual/6/7) by code reading and traced the server-side application, so the manual-verify items carry low risk.
- **Dev deviation — round 1 auto-resolves; attacker prompted only between rounds** → ✓ ACCEPTED by Reviewer: correct and forced by the locked `decide`-after-round contract (gating round 1 would break the asserted call-counts). UX-only; the POSTed `ResolvedCombat` is identical either way. No undocumented deviations found during the audit.