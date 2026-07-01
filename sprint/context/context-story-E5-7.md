# Story E5-7 Context

## Title
Pre-game lobby client: colour picker + roll-off result display

## Metadata
- **Story ID:** E5-7
- **Type:** feature (client half of E5-3, split per E5-3 Reviewer/TEA/Dev delivery findings)
- **Points:** 5
- **Priority:** p2
- **Workflow:** tdd
- **Repo:** g-1 (trunk-based, main)
- **Epic:** E5 — Risk Playtest Follow-up

## Background — what E5-3 already shipped (the server seam is DONE)
E5-3 delivered and tested the SERVER data seam; E5-7 is the CLIENT half that consumes it. Do NOT rebuild the server side. What exists today:
- `plugins/risk/server/state.js` — `state.turnOrderRolls` (per-seat d6 face, 1-6, matches `combat.js rollDice`), winner = argmax with lowest-seat-index tie-break; `currentPlayer`/`activeUserId` set from the winner. `state.colors` = per-seat palette-slot index array, identity default `[0,1,2,...]`, out-of-range picks sanitised to a valid slot. Exported `firstPlayer(state)` helper.
- `plugins/risk/server/actions.js` — setup→reinforce hand-off returns to the roll-off winner.
- `src/clients/shared/contracts/risk.ts` — `RiskView` already carries optional `turnOrderRolls?: number[]` and `colors?: number[]` (type-only, additive). These are the typed boundary the client reads.
- Both fields reach the client via the existing view `...rest` spread. Today NO client code consumes them: colours sit at the identity default and the roll-off result is invisible.

## Problem
The pre-game roll-off and per-seat colour data exist on the view but are not rendered or choosable. Players can't see who won the first move, and colour is still visually seat-locked because `src/clients/risk/themes.ts` maps seat→colour by fixed index (`SEAT_LABEL`/`SEAT_HEX`/`seatClass → p${owner}`, backed by `--p0..--p3` CSS vars) instead of reading `view.colors`.

## Technical Approach (client)
1. **`themes.ts` reads `view.colors`.** Rewire colour consumers to resolve each seat's colour through `view.colors[seat]` (the chosen palette slot) rather than the fixed seat→slot identity. Keep the board, crest (SVG), seat strip, and dice (`seatHex` / WebGL materials) all consistent with the SAME model. Default (no/empty `view.colors`) MUST reproduce today's Red/Blue/Green/Yellow-by-seat palette exactly — no regression (AC2 already guaranteed server-side by identity default; the client must not diverge).
2. **Render the roll-off result (AC4).** Surface `view.turnOrderRolls` in the setup-phase UI so players see each seat's roll and who won first move — a natural fit alongside E5-1's dice presentation.
3. **Colour picker UI + duplicate-colour uniqueness.** Let a player pick a colour before the game starts, producing the `participant.color` the server validates into `state.colors`. Enforce (or clearly surface) uniqueness so two seats can't both be "Red" — a legibility hazard TEA/Reviewer flagged; server currently does NOT dedupe.

## OPEN QUESTION — discover at pickup (flagged by E5-3 Reviewer)
**Where does the colour picker live?** The game-creation/lobby flow is likely in the **gamebox shell OUTSIDE the risk plugin** — prior `grep` found lobby references only in the risk engine, not a standalone lobby component. Locate the shell's game-setup flow BEFORE designing the picker. If discovery shows the picker needs its own design/UX pass or the story is too large in one TDD cycle, raise a Delivery Finding — a further split (picker vs. result-display) is acceptable.

## Build/deploy note (from project memory)
Client bundles are gitignored: `src/clients/risk/*` (.tsx/.ts) changes are INERT until `npm run build:client` rebuilds `app.js` AND the server is restarted. A green unit test on a .ts seam does not prove the rendered UI changed — verification of AC1/AC4 rendering is a rebuild + manual/integration check, not just `npm test`.

## Acceptance Criteria (the client-side ACs split from E5-3)
1. **AC1 — Colour used consistently across surfaces.** A non-default colour choice renders correctly and identically across board, crest, seat strip, and dice (all read the same `view.colors` model).
2. **AC2 — Default preserved (no regression).** With no explicit choice / empty `view.colors`, the client renders the canonical Red/Blue/Green/Yellow-by-seat palette exactly as today.
3. **AC4 — Roll-off is visible.** The setup-phase UI renders `view.turnOrderRolls` so players see the per-seat rolls and who won the first move.
4. **Colour picker exists.** A player can choose a colour pre-game; the choice flows to the server (`participant.color`) and back through `view.colors`.
5. **Duplicate colours are prevented or clearly surfaced.** Two seats cannot silently end up the same colour.

## Testable seams for TDD (guidance for TEA)
- `themes.ts` colour resolution is a pure function (seat + `view.colors` → hex / palette slot / class) — unit-testable: default-identity path, explicit-choice path, empty/undefined `view.colors` fallback.
- Roll-off result view-model mapping (`view.turnOrderRolls` → rows/winner) — unit-testable.
- Duplicate-colour detection/uniqueness logic — unit-testable.
- Genuinely visual bits (crest actually paints on screen, WebGL material colour) are integration/manual (rebuild + observe), not unit-coverable — call that out, don't fake-assert it.

## Scope
- **In scope:** client rendering of `view.colors` and `view.turnOrderRolls`; the colour picker UI; duplicate-colour handling.
- **Out of scope:** any server-side roll-off/colour engine change (done in E5-3); 5-6 player support; persisting colour prefs across games.

---
_Context authored by SM (Edmund Blackadder) from the E5-3 archive + context-story-E5-3.md, 2026-07-01. This is the E5-3b client split._
