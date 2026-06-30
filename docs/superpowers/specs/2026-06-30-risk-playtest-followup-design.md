# Risk Playtest Follow-up (Epic E5) — Design Brief

**Date:** 2026-06-30
**Epic:** E5 — Risk Playtest Follow-up
**Origin:** First full multiplayer Risk playtest. Great game, ~90 min, near-zero bugs.
These are the rough edges and one missing rule that surfaced.

This brief fully designs the lead story (**E5-1**). The remaining stories (E5-2..E5-5)
are captured as scoped stubs and each gets its own design at pickup.

---

## E5-1 — Interactive attack overlay (per-round battle cards + Manual/Blitz/Stop)

**Priority:** p1 · **Points:** 5 · **Workflow:** tdd · **Scope:** client-only

### Problem
Dice resolve fast — good for pacing, bad for legibility. Two coupled complaints:
1. **You can't tell what happened in a battle.** `CombatReveal.tsx` shows only the
   *current* round's dice (it overwrites `round` state each tick), then a final
   "Captured / Repulsed". Per-round dice + army losses vanish as the next round rolls.
2. **No way to stop an attack.** `driveCombat` in `combat-rules.ts` runs
   `while (af > 1 && df > 0)` — it auto-grinds to exhaustion. The player has no agency
   to halt mid-fight.

These are the same feature: if we ask the player between rounds, the per-round card is
exactly what they read to decide.

### Behavior
The attack overlay becomes an interactive, accumulating battle log:

- Attacker presses **Roll** → one round resolves → a **thin card** drops onto a stack,
  showing that round's `attacker dice → defender dice` and the resulting `atk loss / def loss`
  (plus running survivor counts).
- After each round the attacker chooses:
  - **Roll again** — resolve another round (disabled when attacker is down to 1 army).
  - **Blitz** — auto-roll the remaining rounds to resolution (restores the old fast path
    on demand; preserves the ~90-min game pacing the group liked).
  - **Stop** — end the attack now; surviving attackers stay in the *from* territory.
    Only meaningful while the defender still stands (a capture already ends the loop).
- Cards stack as the running history of **this** battle. The stack **clears when the
  overlay closes** — live, this-battle-only. No cross-game persistence, no server storage.

### Scope decisions (locked with user)
- **Live, this-battle-only.** Not a persistent all-game battle log. ⇒ pure client-side,
  **no contract or server change.**
- **Manual + Blitz** cadence (not manual-only, not commit-N-up-front).

### Bot attacks (important wrinkle)
A human attacker's client already drives `driveCombat` locally and POSTs the final
`ResolvedCombat` (Amendment A.1) — so fewer rounds simply means a shorter `rounds[]`.
**Fully client-side.**

But a **bot's** attack is resolved on the *defender's* client via `pendingCombat` —
there is no human attacker present to ask "again or stop?". So **bot attacks keep
auto-resolving** (drive to exhaustion as today). Giving bots a smarter "when to stop
pressing" policy is explicitly out of scope here and would be its own later story.

Implementation must therefore branch: interactive stop/blitz is **human-attacker-driven
combat only**; bot-driven combat on the defender's client stays automatic.

### Touch points
- `src/clients/risk/combat-rules.ts` — `driveCombat` gains an optional between-round
  decision hook (await a `"roll" | "blitz" | "stop"` decision) and an early-exit on stop.
  Default/absent hook ⇒ current auto-grind (preserves bot path + existing callers).
- `src/clients/risk/CombatReveal.tsx` — accumulate rounds into a card stack instead of
  overwriting a single `round`; render Roll/Blitz/Stop controls in `live` mode; wire the
  decision hook to button presses. Replay mode unchanged (still steps recorded rounds).
- `src/clients/risk/combat-rules.ts` already computes `aLoss/dLoss` via `resolveRound`;
  `onRound` already surfaces `af/df`. Card content is available without new math.
- Contract `ResolvedCombat` (`shared/contracts/risk.ts`) — **unchanged**; it already
  carries a variable-length `rounds[]`.
- `plugins/risk/client/style.css` (+ TS mirror) — thin-card styling.
- Client bundle is gitignored and rebuilt by `npm run build:client`; a `.tsx` change is
  inert until rebuilt + server restart.

### Testing (TDD)
- `driveCombat` with injected roll fns **and** an injected decision fn:
  - stop after round N ⇒ loop exits, `rounds.length === N`, survivors reflect partial fight.
  - blitz after round 1 ⇒ runs to resolution.
  - absent decision hook ⇒ unchanged auto-grind to exhaustion (bot path regression guard).
- Roll-again disabled at `af <= 1`; Stop is a no-op once `df === 0` (already captured).

---

## Remaining stories (scoped stubs — design at pickup)

### E5-2 — Territory trade-in bonus (p2, 3pts, tdd)
The missing classic rule: when a traded card set includes a territory the player owns,
place **+2 armies directly onto that territory**. Card trade-in already exists
(`trade-in` action + `nextTradeBonus`); this extends it. **Rules nuance to pin:** classic
Risk grants the +2 **once per trade** even if multiple traded cards match owned territories
(default to this). Server rule + a client hint at trade-in.

### E5-3 — Pre-game lobby: pick colors + roll-off for turn order (p2, 5pts, tdd)
Today color and turn order are both fixed to seat ("player one is red and goes first").
Two decouplings, one lobby flow:
- Players **choose colors** before start (instead of a fixed seat→palette map).
- Players **roll off for turn order** (high roll goes first) instead of seat 0 always first.

### E5-4 — Bot portraits overlap on the display (p2, 2pts, trivial, bug)
Bot portraits/labels overlap — worse now that E4 pushed Risk to 4–6 seats. Layout fix in
the header/portrait area.

### E5-5 — Talk-smack discoverability + chat presentation (p3, 2pts, trivial)
Players struggled to find "talk smack"; chat presentation is hard to read. Discoverability
+ presentation polish. **User flagged low priority.**

---

## Priority ladder
**P1** E5-1 → **P2** E5-4 (visible defect), E5-2 (missing core rule), E5-3 (pre-game lobby)
→ **P3** E5-5 (chat).
