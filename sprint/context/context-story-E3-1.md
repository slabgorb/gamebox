---
parent: E3
---
# Story E3-1: Engine foundations: plugin skeleton, deck, geometry + initial state

## Business Context

E3-1 lays the entire foundation of the Sorry! game plugin. Without it, none of the other E3 stories can begin — it is the stack root of the epic with no dependencies. The story delivers three tightly coupled things: the plugin's public contract (so Gamebox can discover and instantiate it), the 45-card deck with correct rank distribution and reshuffle logic, and the 60-square board geometry together with the full initial state shape that all subsequent stories will read.

Sorry! is the second race-game plugin after backgammon and maps cleanly to the same backgammon plugin shape. The game is natively 2-player, matching Gamebox's 2P-only constraint without any rules adaptation. Delivering a runnable plugin skeleton in E3-1 means the engine loop (E3-2 through E3-4), AI (E3-5), and client UI (E3-6) can each be developed and tested in isolation against real initial-state fixtures rather than stubs.

## Technical Guardrails

- **Server-authoritative card draw.** Unlike client-side dice (which the client resolves and animates), the deck is stateful and must stay server-side. The first card for player 'a' is drawn inside `buildInitialState`; subsequent draws happen inside `advanceTurn` (E3-4). The client receives `drawnCard` (already revealed) and animates the flip — it never generates the draw.
- **Card draw is a rule, not an action.** The bot never emits a "draw" action; it only emits `move`. The orchestrator turn-continuation gate keys on `activeUserId === bot`, not on a draw phase.
- **2-player only.** `buildInitialState` must throw if `participants.length !== 2`. Do not generalize to N players.
- **Mirror backgammon plugin shape.** `plugin.js` must export `{ id, displayName, players, clientDir, initialState, applyAction, publicView }`. Follow `plugins/backgammon/plugin.js` as the reference contract.
- **Stub `applySorryAction` only.** E3-1 ships `plugins/sorry/server/actions.js` as a one-line stub returning `{ error: 'not implemented' }`. The real turn engine is E3-4.
- **vitest tests under `test/sorry/`.** Three test files ship in E3-1: `plugin-registration.test.js`, `deck.test.js`, `geometry.test.js`, and `state.test.js`. Tests are written first (red), then implementation (green), following TDD workflow.
- **Pure functions for geometry and deck.** `buildDeck(rng)` and `draw({ deck, discard, rng })` are pure (no side effects, injectable RNG). `path(side)` is deterministic. This makes them safe to call from both server state-building and tests.

## Scope Boundaries

**In scope (E3-1):**
- `plugins/sorry/plugin.js` — plugin registration object.
- `plugins/sorry/server/state.js` — `buildInitialState({ participants, options })` returning the full initial state shape including first card draw.
- `plugins/sorry/server/view.js` — `sorryPublicView({ state, viewerId })` redacting deck order, exposing `deckCount` and `youAre`.
- `plugins/sorry/server/deck.js` — `RANK_COUNTS`, `buildDeck(rng)`, `draw({ deck, discard, rng })` with reshuffle-from-discard when the deck is empty.
- `plugins/sorry/server/geometry.js` — `TRACK_LEN` (60), `START_EXIT` ({a:4, b:34}), `SAFETY_ENTRY` ({a:1, b:31}), `SLIDES` ({a:[{start:9,length:4},{start:34,length:5}], b:[{start:39,length:4},{start:4,length:5}]}), `path(side)`.
- `plugins/sorry/server/actions.js` — stub only (`return { error: 'not implemented' }`).
- `src/plugins/index.js` — one-line import + map entry for the sorry plugin.
- Test files: `test/sorry/plugin-registration.test.js`, `test/sorry/deck.test.js`, `test/sorry/geometry.test.js`, `test/sorry/state.test.js`.

**Out of scope:**
- Legal-move enumeration (E3-2): `plugins/sorry/server/rules/legal-moves.js`.
- Slide traversal and bumping (E3-3): `plugins/sorry/server/rules/slides.js`.
- Real turn engine implementation (E3-4): full `applySorryAction` body.
- AI adapter, prompts, and personas (E3-5).
- Client UI, card-flip animation, board render, orchestrator integration check (E3-6).
- Safety zone entry logic beyond geometry constants (needed in E3-2).
- Auto-pass on no legal moves (needed in E3-4).

## AC Context

1. **Plugin is registered and has the expected shape.** `plugins.sorry` in `src/plugins/index.js` is defined with `id === 'sorry'`, `displayName === 'Sorry!'`, `players === 2`, and `typeof initialState === 'function'`, `typeof applyAction === 'function'`, `typeof publicView === 'function'`. Test: `test/sorry/plugin-registration.test.js`.

2. **Deck has exactly 45 cards with canonical rank counts.** `buildDeck()` returns an array of length 45. When counted by rank, the distribution matches `RANK_COUNTS` exactly: `{ 1:5, 2:4, 3:4, 4:4, 5:4, 7:4, 8:4, 10:4, 11:4, 12:4, sorry:4 }`. Note: the deck contains no ranks 6 or 9 (standard Sorry! omits them). Test: `test/sorry/deck.test.js`.

3. **`draw` returns the top card and reshuffles the discard when the deck is empty.** With a non-empty deck, `draw({ deck: [1,2], discard: [3] })` returns `{ card:1, deck:[2], discard:[3] }`. With an empty deck and a non-empty discard, `draw({ deck:[], discard:[5,7] })` returns a card from `[5,7]`, an empty `discard`, and a deck containing the remaining card. Test: `test/sorry/deck.test.js`.

4. **Geometry constants are correct and `path(side)` is well-formed.** `START_EXIT.a === 4`, `START_EXIT.b === 34`, `SAFETY_ENTRY.a === 1`, `SAFETY_ENTRY.b === 31`. `path('a')[0] === 4` (startExit), `path('a')` ends with `['a-safe-0','a-safe-1','a-safe-2','a-safe-3','a-safe-4','a-home']`. The square immediately after `SAFETY_ENTRY.a` (track index 1) in the path is `'a-safe-0'`. `SLIDES.a` and `SLIDES.b` each have length 2; each slide object has numeric `start` and `length` fields. Test: `test/sorry/geometry.test.js`.

5. **Initial state places 4 pawns per side in Start and draws the first card for player 'a'.** `buildInitialState({ participants:[{side:'a',userId:11},{side:'b',userId:22}] })` returns a state where: `sides === {a:11, b:22}`, `pawns.a` and `pawns.b` are each arrays of 4 pawns with `zone === 'start'`, `currentPlayer === 'a'`, `drawnCard` is defined (a non-null card), `deck.length + discard.length + 1 === 45` (the drawn card accounts for the missing card), `winner === null`, `lastEvent === null`, `activeUserId === 11`. Test: `test/sorry/state.test.js`.

6. **`buildInitialState` rejects invalid participants.** Throws if `participants.length !== 2`, if a side 'a' or 'b' participant is missing, if any participant is missing `userId`, or if both participants share the same `userId`. Test: covered by the registration and state test files.
