---
parent: E3
---
# Story E3-6: Client UI (board, card flip, move interaction, win banner) + orchestrator integration + playtest

## Business Context

E3-6 is the final story of the Sorry! plugin epic and the one players actually see. With the engine (E3-1–E3-4) and AI adapter (E3-5) complete, this story adds the browser client and closes the loop: a human can launch a Sorry! game, watch the card flip, click a move, see pawns slide around the ring, and receive a win or loss banner. The orchestrator integration test confirms that a bot turn flows cleanly through the full pipeline — adapter → `applySorryAction` → valid next state — including the draw-again path when a `2` is drawn. A manual playtest vs The Bully verifies that the assembled system is fun and coherent before the epic is marked done.

This story delivers the only outward-facing milestone of E3: a playable game in the browser. Nothing in the epic is downstream of E3-6; it is the last story in the chain.

## Technical Guardrails

- **Mirror backgammon client bootstrapping exactly.** Open `plugins/backgammon/client/index.html` and `app.js` before writing a line. Copy the pattern: fetch public view on load, subscribe to SSE updates, read `youAre` to decide whose turn it is, POST actions as `{ type: 'move', payload: { moveId } }`. Do not invent a new client framework, routing layer, or state-management library.
- **Server-authoritative move legality.** Legal moves must come from the server via `sorryPublicView`, not be recalculated in client-side JS. The implementer decision from the plan: expose `legalMoves` in `sorryPublicView` for the viewer whose turn it is — call `legalMoves(state)` in `view.js` when `state.currentPlayer === youAre`. Assert this in a small view test. The client reads that array; it does not re-implement `legal-moves.js`.
- **Card draw is a server-side rule; client only animates.** Per project memory and the design spec, visible-animation mechanics are client-side rendering of an already-decided server value. The card is drawn server-side before the view is sent; the client receives the revealed `drawnCard` and plays a brief CSS flip animation when the value changes. The client never triggers a draw action.
- **Orchestrator turn-continuation gates on `activeUserId === bot`, not on phase.** The bot must drive a whole multi-action turn in one wake-up. When `drawnCard` is a `2`, `applySorryAction` keeps `currentPlayer` as the same side; the orchestrator sees `activeUserId` still set to the bot and wakes it again. The integration test must cover this path.
- **2-player only.** The engine, client, and test fixtures are 2P-hardcoded. Do not generalize to N players.
- **Vanilla JS, no build step.** Node ESM on the server; plain HTML/CSS/JS on the client, matching all existing plugins.

## Scope Boundaries

**In scope (E3-6):**
- `plugins/sorry/client/index.html` — page shell, SSE subscription setup, script/style imports.
- `plugins/sorry/client/app.js` — fetch public view, SSE update handler, board render (60-square track ring, two safety zones + Homes, two Start pens), pawn placement by `zone`/`index`, `drawnCard` display with CSS flip animation on change, move-selection interaction (highlight legal targets for the current player, POST chosen `moveId`), win/lose banner keyed off `youAre === winner`.
- `plugins/sorry/client/style.css` — board layout, pawn colors, card flip keyframes, win/lose banner styles.
- `view.js` addition: include `legalMoves` (from `server/rules/legal-moves.js`) in `sorryPublicView` when `state.currentPlayer === youAre`; add a view test asserting this field is present on the current player's view and absent (or empty) on the opponent's view.
- `test/sorry/orchestrator-turn.test.js` — drive a full bot turn: `buildInitialState` → override `drawnCard: 1` → `chooseAction` with a deterministic LLM stub → `applySorryAction` → assert no error, valid `currentPlayer`, correct `activeUserId`. A second case forces `drawnCard: 2` and asserts the bot remains `currentPlayer` after the action (draw-again path).
- Manual playtest vs The Bully: pawns leave Start on 1/2, bumps work, slides trigger, Sorry! card sends a pawn home, bot banters, win ends the game.

**Out of scope:**
- Nothing is downstream — E3-6 is the last story. There are no follow-on stories to unblock.
- More than 2 players (Gamebox is 2P-only; `>2P` support is explicitly deferred per project memory and the design spec).
- Additional personas beyond The Bully and The Tortoise.
- Any changes to the engine, AI adapter, or rules modules (those are done in E3-1–E3-5).

## AC Context

1. **Board renders correctly.** The client displays a 60-square track as a square ring, two safety zones (5 squares each) leading to their respective Homes, and two Start pens (one per side). Pawns are drawn at the correct visual position for their `zone` and `index` as reported by the public view.

2. **`drawnCard` shown with flip animation.** The current drawn card is displayed face-up. When the SSE update delivers a changed `drawnCard` value, a brief CSS flip animation plays before the new card face is revealed. No client-side draw logic — the card value comes from the server view.

3. **Legal moves exposed in `sorryPublicView` for the active viewer.** `view.js` calls `legalMoves(state)` and includes the result in the public view when `state.currentPlayer === youAre`. A view unit test asserts: (a) the current player's view contains a non-empty `legalMoves` array when legal moves exist; (b) the opponent's view does not receive the `legalMoves` field (or receives an empty array).

4. **Move interaction posts a valid `moveId`.** When it is the viewer's turn, the client highlights legal move targets derived from the `legalMoves` field in the public view. Clicking a target constructs `{ type: 'move', payload: { moveId } }` and POSTs it to the game action endpoint — the same pattern used by the backgammon client.

5. **Win/lose banner displayed on game end.** When the public view carries a non-null `winner`, the client shows a win banner if `youAre === winner` and a lose banner otherwise. The banner is visually distinct from the board.

6. **Orchestrator integration test passes.** `test/sorry/orchestrator-turn.test.js` runs two scenarios: (a) nominal bot turn — adapter picks the first legal move, `applySorryAction` returns no error, resulting `activeUserId` equals `state.sides[state.currentPlayer]`; (b) draw-again path — state is seeded with `drawnCard: 2`, bot plays a legal out-move, result's `currentPlayer` remains the same side (the engine's draw-again rule). Both assertions pass against the real engine with no mocks beyond the LLM stub.

7. **Full vitest suite for sorry remains green.** `npx vitest run test/sorry` passes all tests across all sorry stories after E3-6 changes are applied.

8. **Manual playtest confirms end-to-end play.** A game is started vs The Bully using the project launch skill or `/run`. The following are observed in the browser: a pawn leaves Start on a 1 or 2 card, a bump sends a pawn back to Start, a slide triggers and moves a pawn to the slide end, the Sorry! card displaces an opponent pawn, the bot produces banter after each of its turns, and a win condition ends the game and shows the banner.
