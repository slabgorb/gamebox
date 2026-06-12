# Sorry! — Explicit Pass Turns (replace silent auto-settle)

**Date:** 2026-05-28
**Status:** Approved (design)
**Author:** Dev (Puck)

## Problem

The Sorry! engine resolves unplayable cards with `settleToPlayable` (in
`plugins/sorry/server/actions.js`), shared by `buildInitialState` and
`advanceTurn`. When the player on turn cannot use their drawn card, it silently
discards the card, flips `currentPlayer`, and redraws — looping server-side
until *someone* has a legal move.

Two failures surface from this:

1. **Invisible turns.** Players see cards vanish and the turn ping-pong with no
   explanation ("does it autopass? I seemed to have missed many opponent
   moves"). No history entry, no `lastEvent`, no UI cue.
2. **Hard stall / dead game.** `sorry-player.js` picks a random legal move via
   `moves[Math.floor(Math.random()*moves.length)]`. If the bot is ever handed a
   no-move turn, `moves` is empty, `chosen` is `undefined`, and `chosen.id`
   throws — the orchestrator retries, fails again, marks the bot stalled, and
   the human must abandon the game (`ai_stalled`). Observed live in game 83.

## Decision

Replace silent settling with an **explicit, acknowledged pass**. When the player
on turn has zero legal moves, the game stops on that drawn card and the only
legal action is `pass`. Humans tap a **Pass** button; the bot auto-passes
mechanically and the pass is recorded in the turn log.

This matches real Sorry! (you forfeit the turn when you can't move) and makes
every turn transition visible.

## Design

### 1. Engine — `actions.js`, `state.js`

- **Remove `settleToPlayable` and `SETTLE_GUARD`.** `state.js` no longer imports
  from `actions.js`.
- **`buildInitialState`**: deal the opening card, `currentPlayer:'a'`,
  `activeUserId = sides.a`. No settling. If side a cannot move on the opening
  card, `currentPlayer` stays `a` with empty legal moves and side a passes.
- **`advanceTurn`** is refactored around a shared helper
  `drawAndSwitch(state, pawnsAfter, discardedCard, keepTurn, rng)`:
  discard `discardedCard`, draw the next card, set `currentPlayer`
  (`keepTurn` true ⇒ same player, e.g. after a `2`-move; otherwise switch).
  No settling. Always sets `activeUserId = sides[currentPlayer]`.
- **New `pass` action** in `applySorryAction`:
  - Reject (`{ error: 'you still have a legal move' }`) if
    `legalMoves(state).length > 0`. A pass is illegal when a move exists.
  - Otherwise `drawAndSwitch(state, state.pawns, state.drawnCard,
    keepTurn=false, rng)` — a pass always yields the turn.
  - Return `{ state, ended:false, summary:{ kind:'pass', card } }` where `card`
    is the passed (now-discarded) drawn card.
- **`state.lastEvent`** (already in the state schema, currently always `null`):
  set to `{ kind:'pass', side, card }` on any pass; cleared to `null` on a real
  move. It is the breadcrumb of "what just happened," exposed unredacted by the
  view.

### 2. View — `view.js` (no contract change)

The view already attaches `legalMoves` only for the viewer whose turn it is. The
client distinguishes three states:

| `view.legalMoves` | meaning |
|---|---|
| `undefined` | not my turn |
| non-empty array | my turn — tap a target |
| **empty array** | my turn — no move, must Pass |

`lastEvent` rides along in the spread view (not redacted).

### 3. Client — `SorryApp.tsx`

- When it is my turn and `legalMoves` is an empty array: the turn prompt reads
  "You drew {card} — no legal move." and shows a **Pass** button
  (`data-testid="pass-button"`) that posts `{ type:'pass' }`.
- Render a one-line `lastEvent` note when present, e.g. "The Bully drew a 4 — no
  move, passed," so the bot's auto-passes are visible to the human.

### 4. Bot — `sorry-player.js` + orchestrator (no orchestrator change expected)

`chooseAction`: if `legalMoves(state).length === 0`, return
`{ action:{ type:'pass' }, banter:'', usedLlm:false }` **without calling the
LLM**. This removes the empty-array crash and makes the bot pass mechanically.
The orchestrator's existing path records `result.summary` as a turn-history
entry and broadcasts a `turn` SSE event, so the bot's pass is "shown in log,"
then `activeUserId` is the human and the orchestrator yields.

### 5. Error handling

- `pass` while a legal move exists ⇒ `422 { error: 'you still have a legal
  move' }` (route maps engine errors to 422).
- `pass` when not your turn ⇒ existing turn-ownership guard rejects.
- The bot can no longer be handed an unhandled empty-move turn; if `moves` is
  empty it passes.

## Edge cases

- **`2` replay vs pass.** A played `2` keeps the turn (`keepTurn=true`) and
  redraws; if the redraw is unplayable the player passes, which switches the
  turn. A pass never keeps the turn.
- **`2` with no move.** Impossible before a win — a `2` always yields a move for
  any pawn in Start or on the track/safety; only an all-home side has no move,
  and an all-home side has already won.
- **Win detection** is unchanged and still checked before turn advancement.
- **Repeated passes.** If both sides keep drawing unplayable cards the game
  ping-pongs visible passes until a usable card appears (e.g. the all-in-Start
  opening where only 1/2 enable a move). Each pass is one acknowledged turn.

## Testing (TDD, RED first)

Engine (`test/sorry/state.test.js`, new assertions):
- `buildInitialState` deals the opening card with `currentPlayer:'a'` and does
  not settle (side a may be left with empty legal moves).
- `pass` discards the drawn card, draws the next, and switches `currentPlayer` /
  `activeUserId`.
- `pass` is rejected when `legalMoves` is non-empty.
- `advanceTurn` no longer settles: after a move, the next player may be left on
  turn with empty legal moves.
- `lastEvent` is `{kind:'pass',…}` after a pass and `null` after a move.
- Update the existing mulberry32-over-100-seeds regression (it asserted the
  settle-based no-deadlock invariant; the invariant becomes "the player on turn
  always has either a legal move or a legal pass").

Bot (`test/sorry/sorry-player.test.js`):
- Empty legal moves ⇒ returns a `pass` action, `usedLlm:false`, and does not
  call `llm.send`.

Orchestrator (`test/sorry/orchestrator-turn.test.js`):
- A bot turn with no legal moves applies a `pass`, records a turn entry, and
  leaves `activeUserId` on the human. Re-pin rng as needed.

Client (`test/client/sorry-app.test.tsx`):
- My turn with `legalMoves: []` renders the Pass button; clicking posts
  `{ type:'pass' }`.
- A `lastEvent` pass renders its note.

## Out of scope (separate follow-ons)

- Sorry!-card move discoverability (hotspots land on the opponent's pawn).
- `resign` action returning 422 (chore D).
- Visual cleanup A/B/C (decorative checkers, circle alignment, lobby art).
