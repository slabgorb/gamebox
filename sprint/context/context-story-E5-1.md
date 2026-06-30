# Story E5-1 Context

## Title
Interactive attack overlay: per-round battle cards + Manual/Blitz/Stop

## Metadata
- **Story ID:** E5-1
- **Type:** feature
- **Points:** 5
- **Priority:** p1
- **Workflow:** tdd
- **Repo:** g-1
- **Epic:** Risk Playtest Follow-up

## Problem
Dice resolve fast — good for the ~90-minute pacing the group liked, bad for legibility.
Two coupled complaints from the playtest, which are really one feature:

1. **You can't tell what happened in a battle.** `CombatReveal.tsx` shows only the
   *current* round's dice (it overwrites a single `round` state each tick), then a final
   "Captured / Repulsed". Per-round dice and army losses vanish as the next round rolls.
2. **No way to stop an attack.** `driveCombat` in `combat-rules.ts` runs
   `while (af > 1 && df > 0)` — it auto-grinds to exhaustion. The attacker has no agency
   to halt mid-fight.

These solve together: if we ask the attacker between rounds, the per-round card is exactly
what they read to decide. The overlay becomes an interactive, accumulating battle log.

## Technical Approach
**Client-only. No server or contract change.** `ResolvedCombat` already carries a
variable-length `rounds[]`, so a shorter fight is just fewer rounds in the POST.

- **`src/clients/risk/combat-rules.ts` — `driveCombat`:** add an optional between-round
  decision hook to `DriveArgs`, e.g. `decide?: (r) => Promise<"roll" | "blitz" | "stop">`,
  awaited after each round resolves and before the next. Semantics:
  - absent/undefined `decide` ⇒ **current auto-grind** (preserves every existing caller
    and the bot path — this is the regression-critical default);
  - `"stop"` ⇒ break the loop, return the partial `ResolvedCombat` (survivors stay where
    they are; `captured` is `df === 0`);
  - `"blitz"` ⇒ stop calling `decide` and run the rest to resolution.
  `resolveRound` and the existing `onRound({aDice,dDice,af,df})` already provide the
  dice and post-round survivor counts — the card needs no new math.
- **`src/clients/risk/CombatReveal.tsx` (live mode only):** accumulate each resolved round
  into a **card stack** instead of overwriting the single `round`. Render Roll-again /
  Blitz / Stop controls wired to resolve the `decide` promise. Roll-again disables when
  `af <= 1`. The card stack clears when the overlay unmounts (live, this-battle-only —
  no persistence). **Replay mode is unchanged** (it steps recorded rounds on a timer and
  has no live attacker to ask).
- **`plugins/risk/client/style.css` (+ any TS style mirror):** thin-card styling for the
  stack; keep the existing `combat-reveal` dice trays.
- **Bot attacks stay automatic.** A bot's attack is resolved on the *defender's* client
  via `pendingCombat` — there is no human attacker to prompt. The interactive controls
  mount **only when the local human is the attacker** (live, non-pending path). Do not
  wire `decide` into the defender-resolves-for-bot flow.
- **Build:** client is gitignored; `npm run build:client` + server restart before "done".

## Scope
- **In scope:** the `decide` hook on `driveCombat`; the accumulating card stack + Roll/
  Blitz/Stop controls in live `CombatReveal`; thin-card CSS; tests for the new loop control.
- **Out of scope:** any persistent / cross-battle / all-game battle log (explicitly
  ruled out — this is this-battle-only); contract changes; server changes; bot stop-policy
  (a bot deciding when to quit pressing is a possible *future* story, not this one);
  replay-mode changes.

## Acceptance Criteria
1. **`driveCombat` honours an injected between-round decision.** With `decide` returning
   `"stop"` after round N, the loop exits after exactly N rounds and the returned
   `ResolvedCombat` reflects the partial fight (correct `attackerLosses`/`defenderLosses`,
   `captured === (df === 0)`).
2. **`"blitz"` runs to resolution.** After `decide` returns `"blitz"` once, no further
   decisions are requested and combat resolves exactly as the legacy auto-grind would.
3. **Absent `decide` is unchanged.** With no decision hook, `driveCombat` produces
   byte-identical results to the current auto-grind (regression guard for the bot /
   defender-resolves path).
4. **Live overlay accumulates a card per round.** During a human attacker's multi-round
   attack, each resolved round appends a thin card showing that round's attacker dice,
   defender dice, and the resulting attacker/defender losses; earlier cards remain visible.
5. **Controls behave.** Roll-again is disabled when the attacker is down to 1 army; Stop is
   available only while the defender still stands; choosing Stop ends the attack with
   survivors left in the attacking territory.
6. **Bot attacks are untouched.** A bot attack resolved on the defender's client still
   auto-resolves with no Roll/Blitz/Stop prompts.
7. **Card stack is ephemeral.** Closing/unmounting the overlay clears the stack; reopening
   a new attack starts empty.

---
_Authored by Architect (Naomi Nagata, design mode), 2026-06-30. Full design: `docs/superpowers/specs/2026-06-30-risk-playtest-followup-design.md`._
