---
parent: E3
---
# Story E3-2: Legal-move enumeration for all cards (out, forward, back, 7-split, 11-swap, Sorry!)

## Business Context

E3-2 is the rules core of the Sorry! plugin. With the board geometry and initial state in place from E3-1, this story teaches the engine which moves are actually legal for any given drawn card. Without this layer nothing can happen on the board — the turn engine (E3-4), the AI adapter (E3-5), and ultimately the playable client (E3-6) all depend on a correct, complete move enumeration.

The full Sorry! ruleset is distinctly card-driven: each of the eleven card ranks produces a different kind of move (or combination of moves), and the enumeration must handle every special case — including the three exotic cards (7-split, 11-swap, and the Sorry! card) that give the game its signature chaos. Correctness here determines correctness everywhere downstream; a missed edge case in `legalMoves` will silently corrupt game-play without a hard crash.

The story also establishes the move-object schema (`{ id, kind, pawnId, ... }`) that all later consumers — the turn engine, the AI prompt builder, and the client — will depend on. Getting that shape right in E3-2 prevents churn across E3-3 through E3-6.

## Technical Guardrails

- **Pure function, no side effects.** `legalMoves(state)` takes the full game state and returns an array of move objects. It must never mutate state, apply moves, resolve slides, or draw cards. Those concerns belong to E3-3 and E3-4.
- **Derive all positions from `path(side)`.** Movement math is index arithmetic over the ordered path list produced by `path()` from `geometry.js` (delivered by E3-1). Do not hard-code track squares or safety indices; derive them from the path.
- **2P only.** The engine is hardcoded to sides `'a'` and `'b'`. Do not generalize the enumeration to N players.
- **Move-object schema.** Every returned object must carry:
  - `id` — a stable string key that uniquely identifies the move within the current legal set (used by the turn engine and AI to reference the choice).
  - `kind` — one of `'out'`, `'forward'`, `'back'`, `'split'`, `'swap'`, `'sorry'`.
  - `pawnId` — the id of the primary pawn being moved (absent on `split`, which uses `legs` instead).
  - `to` — destination as `{ zone, index }` (absent on `split`).
  - `legs` — for `split` only: array of two `{ pawnId, steps, to }` objects whose `steps` sum to 7.
  - `targetPawnId` — for `swap` and `sorry`: the opponent pawn being displaced.
- **Overshoot is illegal.** A pawn in the safety zone (`zone: 'safety'`) that would need more steps than remain to reach Home produces no move. Exactly reaching Home is legal; one step past is not.
- **Home pawns never move.** Any pawn already at `zone: 'home'` is excluded from all enumerations.
- **Out/sorry/swap targets are track squares only.** `out` sends a Start pawn to `startExit` (a track square); `sorry` places the bumper onto the opponent pawn's current track square; `swap` exchanges positions along the track. None of these may target safety or Home squares.
- **Card 3 with all pawns in Start yields an empty list.** Card 3 is a pure forward card (no `out` privilege); when every pawn is in Start there is nothing to move.
- **Dependencies.** This story requires `path()`, `START_EXIT`, and `SAFETY_ENTRY` from `plugins/sorry/server/geometry.js` delivered by E3-1. Do not duplicate geometry constants.

## Scope Boundaries

**In scope (E3-2):**
- `plugins/sorry/server/rules/legal-moves.js` — exports `legalMoves(state)`.
- `test/sorry/legal-moves.test.js` — TDD test suite covering all card kinds and key edge cases.
- Full card enumeration: out (cards 1, 2), forward (cards 1, 2, 3, 5, 8, 12), back (card 4 = −4; card 10 = +10 or −1), split (card 7: all pairs of track/safety pawns with legs summing to 7), swap (card 11: every own-track-pawn × every opponent-track-pawn pair, plus forward-11), sorry (Sorry! card: each Start pawn × each opponent track pawn), and auto-forward-7 as a single-pawn move when no split partner exists.
- No-legal-move case: return `[]` when no move is possible for the drawn card (e.g., card 3 with all in Start; Sorry! card with no opponent on track).
- Safety overshoot guard: filter out any destination whose path index would exceed the Home position.

**Out of scope:**
- Slide traversal and bump resolution — `resolveLanding` belongs to E3-3 (`plugins/sorry/server/rules/slides.js`). `legalMoves` computes destination squares as if slides do not exist; E3-4 applies slides when executing.
- Applying moves / advancing the turn — that is `applySorryAction` in E3-4 (`plugins/sorry/server/actions.js`).
- Drawing the next card — card draw is an automatic rule inside `buildInitialState` and `advanceTurn`; `legalMoves` receives an already-drawn `state.drawnCard` and enumerates against it.
- AI adapter, prompts, or client rendering — those are E3-5 and E3-6.
- The view layer exposing `legalMoves` to the client (noted as a Task 9 decision in the plan; out of scope for this story).

## AC Context

1. **`legalMoves(state)` is exported from `plugins/sorry/server/rules/legal-moves.js` and is a pure function.** Calling it with any valid state object returns an array (possibly empty) of move objects without mutating the input or producing observable side effects.

2. **Cards 1 and 2 enumerate `out` moves for every pawn in Start.** Each out-move has `kind: 'out'`, a `pawnId`, and `to: { zone: 'track', index: START_EXIT[side] }`. When no pawns are in Start, no out-moves appear. Card 1 and card 2 also enumerate `forward` moves for any pawn already on the track or in the safety zone (steps = 1 and 2 respectively).

3. **Numeric forward cards (1, 2, 3, 5, 8, 12) enumerate `forward` moves for every track/safety pawn.** Each move has `kind: 'forward'`, `pawnId`, `steps`, and a `to` destination. Card 3 with all pawns in Start returns an empty list (no track/safety pawns to move).

4. **Card 4 enumerates `back` moves (−4 steps) for every track/safety pawn.** Kind is `'back'`; `to` is the path position 4 steps behind the pawn. A pawn whose backward destination would fall before the start of its path produces no move.

5. **Card 10 enumerates both forward (+10) and backward (−1) moves for every track/safety pawn.** Both a `forward` leg (steps=10) and a `back` leg (steps=−1) are offered for each eligible pawn; either may be absent if it would overshoot or underflow.

6. **Card 7 enumerates both single-pawn (full 7) and two-pawn split moves.** Single-pawn `forward` moves (steps=7) are offered for each track/safety pawn. Split moves have `kind: 'split'` and `legs: [{ pawnId, steps, to }, { pawnId, steps, to }]` where both legs are valid advances and the two steps sum to exactly 7. All (ordered) pairs of distinct track/safety pawns with all step distributions 1+6 through 6+1 that produce valid destinations are included. Duplicate unordered splits are acceptable — the turn engine selects by `id`.

7. **Card 11 enumerates both forward (+11) moves and `swap` moves.** Forward moves are offered for each own track pawn (kind `'forward'`, steps=11). Swap moves (`kind: 'swap'`) are offered for each pair of (own track pawn, opponent track pawn): the own pawn takes the opponent's track position and vice versa. Safety-zone pawns cannot be party to a swap.

8. **The Sorry! card enumerates `sorry` moves when at least one own pawn is in Start and at least one opponent pawn is on the track.** Each sorry-move has `kind: 'sorry'`, `pawnId` (a Start pawn), `targetPawnId` (the opponent pawn being bumped), and `to: { zone: 'track', index: <opponent's track index> }`. If there are no Start pawns or no opponent track pawns, the result is `[]`.

9. **Safety-zone overshoot is illegal.** For any card that would advance a safety-zone pawn beyond the last path position (Home), that pawn produces no move for that number of steps. Exactly landing on Home is legal.

10. **Test suite covers all card kinds and key edge cases.** `test/sorry/legal-moves.test.js` includes at minimum: card 1 all-in-Start → out-moves only; card 3 all-in-Start → empty list; card 4 track pawn → back-4 destination; card 7 two track pawns → split with legs summing to 7; card 11 own and opponent on track → swap move present; Sorry! with opponent on track → sorry-move to opponent's square; safety-zone pawn with card that overshoots Home → no move for that pawn.
