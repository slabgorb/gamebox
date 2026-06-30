# Epic E5 Context

## Title
Risk Playtest Follow-up

## Overview
Follow-ups from the first full multiplayer Risk playtest — a great ~90-minute game
with near-zero bugs. These stories are polish, legibility, and transparency work
plus two pre-game UX gaps; there is **no net-new rules engine work** (the one rule
that looked missing — the territory trade-in bonus — turned out to already exist).

The connective theme across most of the epic is **legibility**: the engine does the
right thing, but the fast UI doesn't *show* the player what happened.

- **E5-1** reworks the attack overlay into an interactive, legible per-round battle:
  dice/loss cards stack as the fight unfolds and the attacker controls each round
  (Manual / Blitz / Stop) instead of auto-grinding to exhaustion.
- **E5-2 + E5-6** are the "where did my armies come from?" pair. E5-2 verifies and
  *records* the already-implemented territory trade-in bonus; E5-6 surfaces the whole
  muster as an itemized breakdown (base · continent · trade-in set · territory +2).
- **E5-3** is a pre-game lobby: choose colors and roll off for turn order, instead of
  the fixed "player one is red and goes first."
- **E5-4** fixes bot-portrait overlap in the AI roster at 3–4 seats.
- **E5-5** improves smack-talk discoverability and chat presentation.

## Metadata
- **Epic ID:** E5
- **Repo:** g-1
- **Priority:** p2
- **Stories:** E5-1 (p1), E5-2, E5-3, E5-6 (p2), E5-4 (p2 bug), E5-5 (p3)
- **Design brief:** `docs/superpowers/specs/2026-06-30-risk-playtest-followup-design.md`

## Background

### Cross-story architectural guardrails

- **Engine vs. presentation.** Most of this epic is presentation. The Risk *rules
  engine* (`plugins/risk/server/`) is correct and battle-tested — do not rewrite rules.
  E5-1, E5-4, E5-5, E5-6 are largely client-side; E5-2 and E5-3 are the only stories
  that legitimately touch server state, and only narrowly (log enrichment; initial-state
  turn order).

- **Client build is two-stage and gitignored.** The playable client lives in
  `src/clients/risk/*.tsx` (+ `src/clients/shared/`) and is compiled to
  `plugins/risk/client/app.js` by `npm run build:client`. A `.tsx` change is **inert**
  until rebuilt **and** the server restarted. Any client story's "done" includes a build.

- **Seat-indexed, not 2P.** Risk is N-player (2–4; `buildInitialState` throws outside
  that range). Anything touching players must be seat-indexed (`view.seats`,
  `view.currentPlayer`, `cardCounts[]`, `eliminated[]`) — never the legacy 2P
  your/opponent pair. `themes.ts` colors are currently keyed by **seat index**
  (`p0..p3`); E5-3 is precisely about breaking that seat→color coupling.

- **Bot combat is resolved on the defender's client.** When a *bot* attacks, the server
  stores `pendingCombat` and the **defender's** client drives the dice and POSTs
  `ResolvedCombat` back. There is therefore no human attacker present during a bot's
  attack — E5-1's interactive Stop/Blitz is **human-attacker-only**; bot attacks keep
  auto-resolving. Any story that changes combat flow must preserve this split.

- **Contracts are the seam.** `src/clients/shared/contracts/risk.ts` is the typed
  boundary between server view and client. `ResolvedCombat` already carries a
  variable-length `rounds[]` (so E5-1 needs no contract change). `RiskLogEntry` is the
  shared log shape — E5-2 extends the `trade-in` entry and E5-6 reads it; coordinate
  those two there.

- **Sequencing.** E5-2 (record the territory bonus in the log/view) should land **before**
  E5-6 (surface it), since E5-6's territory-bonus line consumes E5-2's data. The other
  stories are independent.

### Planning Documents
| Doc | Purpose |
|-----|---------|
| `docs/superpowers/specs/2026-06-30-risk-playtest-followup-design.md` | Epic design brief; full E5-1 design |
| `src/clients/shared/contracts/risk.ts` | Typed server↔client contract (combat, log, view) |

---
_Authored by Architect (Naomi Nagata, design mode), 2026-06-30, from the playtest brief and a codebase read._
