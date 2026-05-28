---
parent: E3
---
# Story E3-4: Turn engine (applyAction): apply moves, bumps, swap, Sorry!, win + auto-pass

## Business Context

E3-4 is the core execution layer of the Sorry! plugin. E3-1 laid the skeleton, E3-2 enumerated every legal move a player can make, and E3-3 built the slide/bump resolution primitive. E3-4 wires those three pieces together into `applySorryAction` — the single function the host framework calls to advance game state. Without it, no move can actually happen: the game exists only as data structures and validation logic.

This story closes the loop between the AI adapter (E3-5) and the engine: once E3-4 ships, the orchestrator can drive a complete Sorry! game from first pawn-out to win. Every game mechanic that makes Sorry! distinctive — bumping opponents back to Start, the Sorry! card's one-sided eviction, the 11-swap, the 2-draw-again rule, auto-passing when no move is available — lives here. E3-4 is the prerequisite blocker for all downstream stories (E3-5: AI adapter, E3-6: client UI).

The business goal is a playable, server-authoritative engine that correctly enforces Sorry!'s rules so the two contrasting AI personas (The Bully, The Tortoise) have a real game to play when E3-5 lands.

## Technical Guardrails

- **File under surgery.** `plugins/sorry/server/actions.js` currently contains a stub from E3-1 (`return { error: 'not implemented' }`). E3-4 replaces that stub entirely. The file's public export signature — `applySorryAction({ state, action, actorId })` — is fixed by the plugin contract and must not change.
- **Host action contract.** Mirror `plugins/backgammon/server/actions.js` exactly in return shape: `{ state, ended, scoreDelta, summary }` on success; `{ error }` (no mutation) on rejection. `ended` is a boolean; `scoreDelta` is `{ [userId]: 1 }` for the winner; `summary` is a small structured object for the host to log.
- **`activeUserId` mirroring is critical.** After every state transition, `state.activeUserId` must equal `state.sides[state.currentPlayer]` — or, on a win, remain set to the winner's userId. The orchestrator gates bot wake-ups on `activeUserId === bot.userId`; an incorrect value silently deadlocks the game. See the AI orchestrator turn-continuation contract in project memory.
- **2-player only.** The engine is hardcoded for sides `'a'` and `'b'`. No generalization to N players.
- **Server-authoritative card draw.** Card draw is an automatic rule inside `advanceTurn`, not a user or bot action. The bot never emits a `draw` action; it only emits `{ type: 'move', payload: { moveId } }`. The draw happens inside `advanceTurn` (and in `buildInitialState` for the very first card).
- **Consume E3-2 and E3-3 as-is.** Validate the chosen `moveId` exclusively against `legalMoves(state)` from `plugins/sorry/server/rules/legal-moves.js`. Resolve all track landings through `resolveLanding` from `plugins/sorry/server/rules/slides.js`. Do not duplicate their logic.
- **No mutation.** Rejection paths (`unknown moveId`, `out-of-turn actor`, `unknown participant`) must return `{ error }` without touching the state object.
- **Deck management lives inside `advanceTurn`.** Import `draw` from `plugins/sorry/server/deck.js`; do not reimplement reshuffle logic here.

## Scope Boundaries

**In scope (E3-4):**
- Replace the E3-1 stub in `plugins/sorry/server/actions.js` with the full `applySorryAction` implementation.
- Validate actor identity (must be a known participant), turn ownership (must be `currentPlayer`), and move legality (must appear in `legalMoves(state)`). Reject all three without mutating state.
- Apply all move kinds: `out`, `forward`, `back`, `split` (two-leg 7-split), `swap` (11-swap, with post-swap slide resolution for the mover), `sorry` (bump opponent to Start, place own pawn at target square).
- Run `resolveLanding` for every track landing (applies slides and collects bumped pawns). Send each bumped pawn back to its Start.
- Win detection: after applying the move, if all four of the acting side's pawns have `zone === 'home'`, return `{ state: winState, ended: true, scoreDelta: { [userId]: 1 }, summary }`. Set `activeUserId` to the winner's userId on the win state.
- Turn advancement (`advanceTurn`): discard the played card, draw the next card from the deck (using `draw` from `deck.js`, which reshuffles the discard pile if the deck is empty); switch `currentPlayer` unless the played card was a `2` (same player draws again); if the new current player has no legal move for the drawn card, auto-pass (discard that card, draw another, switch again) — repeat up to a small guard limit before surfacing whatever state exists.
- Set `activeUserId` on every outgoing state to `state.sides[state.currentPlayer]`.
- Test file: `test/sorry/actions.test.js` covering: illegal moveId rejection, out-of-turn rejection, out-move + turn advance to opponent, card-2 draw-again keeps same player, bump-on-landing sends opponent to Start, win detection (all 4 home → `ended: true`, `scoreDelta`).

**Out of scope:**
- AI adapter, system prompt, persona YAML files (E3-5).
- Client UI, board rendering, card-flip animation, move-interaction UI (E3-6).
- The `sorryPublicView` legal-moves augmentation for the client (planned in E3-6's Task 9 note; not needed for this story).
- Orchestrator integration test (`test/sorry/orchestrator-turn.test.js`) — that is Task 10 in the plan, landing with E3-6.
- Geometry constants or `path()` changes — all movement math derives from the already-implemented `path()` in `geometry.js`.

## Inherited from E3-3 (review findings)

E3-3's code review (verdict APPROVED) deferred three findings to E3-4 because they live at the *caller* of `resolveLanding`, not in the pure helper itself. Full detail in `sprint/archive/E3-3-session.md`.

- **Mover-exclusion is a contract E3-4 must uphold (silent-bug risk).** `resolveLanding({ pawns, side, landingIndex })` does **not** know which pawn is moving — it bumps *every* `zone:'track'` pawn sitting on a swept square. It assumes the mover is **not** present in `pawns` at a swept square when called. If E3-4 places the moving pawn at its destination *before* calling `resolveLanding` (or otherwise leaves it on the swept path), the mover will appear in `bumped` and self-bump back to Start — a silent rules bug with no error. **Guidance:** resolve the landing using a pawn map where the mover is still at its origin (or removed), then place the mover at `finalIndex` *after*. This matters most for `back` moves and the `11`-swap, where the mover can land on a slide start *from ahead* of the swept path. Add an explicit test: a mover whose own move lands it on a foreign-slide start must end at `finalIndex` and must **not** appear in its own bump list.
- **`resolveLanding` does no input validation — E3-4 owns the trust boundary.** An out-of-enum `side` makes every slide read as "foreign"; a non-array `pawns.a`/`pawns.b` throws an uncontextualized `TypeError` mid-loop. `applySorryAction` already validates actor/turn/move-legality before reaching slide resolution, so a malformed `side`/`pawns` should be impossible by the time `resolveLanding` is called — keep it that way (validate before resolving). Do not push defensive guards down into the pure helper; the boundary belongs here.
- **Wrap-around (`% TRACK_LEN`) is untested at the geometry level (informational).** No slide in the current `geometry.js` crosses index 59, so `resolveLanding`'s modular arithmetic is structurally unexercised. Not an E3-4 concern unless geometry gains a wrapping slide; noted so the assumption is visible.

## AC Context

1. **Unknown/illegal `moveId` is rejected without mutation.** Calling `applySorryAction` with a `moveId` not present in `legalMoves(state)` returns `{ error: 'move is not legal' }`. The returned object has no `state` key. The original state object is unmodified.
2. **Out-of-turn actor is rejected without mutation.** If `actorId` does not match `state.sides[state.currentPlayer]`, the function returns `{ error: 'not your turn' }` (or `'unknown participant'` if the actorId is not in `state.sides` at all). No state mutation occurs.
3. **Out-move places pawn on track and advances turn to opponent.** After applying a legal `out` move (card 1 or 2), the moved pawn has `zone: 'track'` and `index: START_EXIT[side]`. Unless the played card was a `2`, `currentPlayer` switches to the other side, `discard` contains the played card, `drawnCard` is the next card off the deck, and `activeUserId` equals `state.sides[newCurrentPlayer]`.
4. **Card 2 keeps the same player (draw again).** When the played card is `2`, `advanceTurn` does not switch `currentPlayer`. The same player draws the next card and continues. `activeUserId` remains set to that player's userId.
5. **Landing on an occupied track square bumps the occupant to Start.** When a pawn moves to a track square occupied by an opponent pawn, `resolveLanding` detects the collision and the opponent pawn returns to `zone: 'start', index: 0`. The bump applies after any slide resolution (the final slide-end square is what gets checked for occupants).
6. **Sorry! card removes target opponent pawn and places own pawn.** Applying a `sorry`-kind move sends the target opponent pawn (`targetPawnId`) to `zone: 'start', index: 0` and places the acting pawn at the target's former track position. `resolveLanding` is then run on that position (the landing can trigger a slide or additional bump).
7. **Win is detected when all four of the acting side's pawns reach home.** After applying the move, if every pawn in `pawns[side]` has `zone === 'home'`, the function returns `{ state: winState, ended: true, scoreDelta: { [winnerUserId]: 1 }, summary: { kind: 'win', side } }`. `winState.winner` is set to `side`; `winState.activeUserId` is set to the winner's userId (so the orchestrator can attribute the final event).
8. **Auto-pass when the next player has no legal move.** Inside `advanceTurn`, after switching `currentPlayer` and drawing the next card, if `legalMoves({ ...state, currentPlayer, drawnCard })` is empty, the drawn card is discarded and another is drawn, flipping `currentPlayer` again. This repeats (with a small guard limit) until a player has at least one legal move. The resulting `currentPlayer` and `drawnCard` are committed to the new state.
9. **`activeUserId` is always consistent with `currentPlayer` on non-winning returns.** Every non-error, non-win return from `applySorryAction` has `state.activeUserId === state.sides[state.currentPlayer]`. This invariant is what allows the orchestrator to correctly gate bot wake-ups without inspecting `currentPlayer` directly.
