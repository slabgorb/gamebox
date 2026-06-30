# Story E5-3 Context

## Title
Pre-game lobby: pick colors + roll-off for turn order

## Metadata
- **Story ID:** E5-3
- **Type:** feature
- **Points:** 5
- **Priority:** p2
- **Workflow:** tdd
- **Repo:** g-1
- **Epic:** Risk Playtest Follow-up

## Problem
Today both **color** and **turn order** are hard-bound to seat index:

- **Color:** `src/clients/risk/themes.ts` maps seat → color by index
  (`SEAT_LABEL = ["Red","Blue","Green","Yellow"]`, `SEAT_HEX`, `seatClass → p${owner}`),
  backed by `--p0..--p3` CSS vars in `style.css`. Seat 0 is always Red.
- **Turn order:** `plugins/risk/server/state.js` `buildInitialState` sets
  `currentPlayer: 0` and `activeUserId: seats[0]`, with `seatOrder()` sorting participants
  by seat. Seat 0 always goes first.

Players want to choose their colors and roll off for who goes first, instead of
"player one is red and goes first."

> **This is the highest-uncertainty story in the epic** and spans server + client +
> possibly the gamebox shell. Treat the AC below as intent; BA/UX/Architect should refine
> at pickup, and a split into "colors" and "turn-order roll-off" is reasonable if scope
> proves large.

## Technical Approach
Two independent sub-features sharing the pre-game moment:

### A. Choose colors (break the seat→color coupling)
- Store a per-seat color assignment chosen before the game starts (e.g. `colors: string[]`
  by seat on game state / participants), defaulting to the current palette so nothing
  regresses if unset.
- Have `themes.ts` consumers read the assigned color rather than the fixed `SEAT_HEX` /
  `p${seat}` mapping. The `--pN` CSS vars are keyed by seat, so "choosing a color" means
  choosing **which palette slot a seat occupies** (or supplying an explicit hex) — pick
  one model and keep dice (`seatHex`, WebGL materials) and SVG crests consistent with it.
- **Open question (discover at pickup):** where does the color picker live? The
  game-creation/lobby UI is likely in the **gamebox shell outside the risk plugin** —
  `grep` found lobby references only in the risk engine, not a lobby component. Locate the
  shell's game-setup flow before designing the picker.

### B. Roll-off for turn order
- `buildInitialState` already receives a seeded `rng`. Replace the fixed
  `currentPlayer: 0` / seat-0-first with a die roll per seat: highest roll goes first
  (re-roll ties). Set `currentPlayer` / `activeUserId` from the winner; decide whether the
  remaining order follows seat order from the winner or the full roll ranking.
- Because `rng` is seeded, the roll-off is **deterministic and unit-testable**.
- Surface the roll-off in the setup-phase UI so players see who won the first move
  (a natural fit alongside E5-1's dice presentation).
- **Leave territory dealing alone:** `buildInitialState` deals territories round-robin via
  `idx % n` over the shuffled list — independent of turn order; do not touch it.

## Scope
- **In scope:** pre-game color selection (decoupled from seat) and a seeded roll-off that
  sets the first player; minimal setup-phase UI for both.
- **Out of scope:** 5–6 player support (separate config-level work); changing territory
  distribution; persisting color preferences across games (unless trivial).

## Acceptance Criteria
1. **Colors are choosable and not seat-locked.** A player can be assigned a color other
   than their seat's default before the game starts, and that color is used consistently
   across the board, crest, seat strip, and dice.
2. **Default is preserved.** With no explicit color choice, the current seat palette
   (Red/Blue/Green/Yellow by seat) is used — no regression.
3. **Turn order is rolled, not fixed.** The first player is determined by a seeded
   roll-off rather than always seat 0; a unit test with a fixed rng seed asserts the
   expected winner.
4. **Roll-off is visible.** The setup UI shows the roll-off result so players see who won
   the first move.
5. **Engine invariants hold.** Territory dealing, setup pools, and seat bookkeeping are
   unchanged; the game is playable end-to-end with a non-zero first player.

---
_Authored by Architect (Naomi Nagata, design mode), 2026-06-30. Highest-unknown story — color-picker location needs discovery; split is acceptable._
