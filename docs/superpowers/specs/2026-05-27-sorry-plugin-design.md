# Sorry! Plugin — Design

**Date:** 2026-05-27
**Status:** Approved (design phase)
**Author:** PM (King Henry V) via brainstorming

## Summary

Add a self-contained **Sorry!** game plugin to Gamebox, implementing the full
classic ruleset for **2 players** (4 pawns each). Ships with two contrasting AI
opponent personas so the game is playable vs AI from day one. Mirrors the
existing `backgammon` plugin — the closest race-game analog.

## Decisions

- **Full ruleset.** All special cards (1, 2, 3, 4, 5, 7, 8, 10, 11, 12, Sorry!),
  board slides, safety zones, bumping, 7-split, 11-swap.
- **2 players, 4 pawns each.** Canonical Sorry! and matches the Gamebox
  2P-only constraint. No 4→2 adaptation needed — Sorry! is natively 2-player.
- **Card draw is a rule, not an action.** Same collapsed-mechanic pattern as
  cribbage's auto-cut and dice rolls. The bot never "decides" to draw; it only
  decides *which pawn/move* given the drawn card. The orchestrator
  turn-continuation gate keys on `currentPlayer`, not on the draw step.
- **Two contrasting AI personas** scoped to `games: [sorry]`.

## Architecture & File Layout

New plugin at `plugins/sorry/`, mirroring `plugins/backgammon/`:

```
plugins/sorry/
  plugin.js                 # { id:'sorry', displayName:'Sorry!', players:2, clientDir, initialState, applyAction, publicView }
  server/
    state.js                # buildInitialState: board model, pawns, deck
    actions.js              # applySorryAction: validate + apply a chosen move
    view.js                 # sorryPublicView: redact deck order, expose board+drawnCard
    deck.js                 # 45-card Sorry deck, draw/reshuffle (server-authoritative)
    rules/
      legal-moves.js        # enumerate legal moves for the drawn card
      slides.js             # slide squares + chained bumps
    ai/
      prompts.js            # board-state -> text for the LLM
      sorry-player.js       # parse {moveId, banter}, fallback to random legal move
  client/
    index.html, app.js, style.css, assets/   # board render + card-flip animation
```

**Registration:** add the import + map entry to `src/plugins/index.js`.
**Personas:** two YAMLs in `data/ai-personas/` with `games: [sorry]`. Portraits
auto-load by persona id.

## State Model & Data Flow

**Pawn location** is a tagged value (not a bare index):

```js
{ zone: 'start' | 'track' | 'safety' | 'home', index: <int> }
```

- Track index is absolute 0–59 (60-space clockwise outer track).
- Safety index is 0–4 (5-space safety zone per color).
- Each of the 2 in-play colors has its own entry square, safety entrance, and
  two slides.

**Deck.** Canonical 45-card deck: 1×5, and 2, 3, 4, 5, 7, 8, 10, 11, 12, Sorry!
at ×4 each. `deck.js` owns draw + reshuffle-from-discard.

Card powers:
- **1 / 2** — only cards that bring a pawn out of Start (or move that amount).
- **2** — draw again after playing.
- **4** — move backward 4.
- **7** — move 7, or split across two pawns.
- **8** — move 8.
- **10** — move +10, or move −1 (backward).
- **11** — move 11, or swap one of your pawns with an opponent's pawn.
- **Sorry!** — bring a pawn out of Start by bumping an opponent pawn to its Start.

**State shape:** `{ board, pawns, deck, discard, currentPlayer, drawnCard }`.

**Turn / data flow:**

1. Turn begins → server pops the top card into `drawnCard`. The deck is
   **server-authoritative and stateful** — this is why the draw resolves
   server-side (unlike client-side dice RNG); the client only *animates the
   flip* of the already-revealed card.
2. The draw is an automatic rule step, **not** a bot/player action.
3. `rules/legal-moves.js` enumerates every legal move for `drawnCard` (which
   pawn, splits, swaps, backward moves). If none are legal, the turn auto-passes.
4. Player/bot selects one `moveId`; `actions.js` validates and applies it
   (movement, slides + chained bumps, Sorry!-bump, win check). A **2** loops
   back to step 1.

**`view.js`** redacts deck *order* but exposes `drawnCard`, all pawn positions,
and whose turn it is.

**Deviation noted:** the established "visible mechanics resolve client-side"
rule (dice) bends here because a card deck is stateful and must remain
authoritative server-side. The client receives the revealed card and animates
it, rather than generating the draw itself.

## AI

**Bot decision contract** (matches backgammon): the bot receives a list of legal
moves with string IDs and returns:

```json
{"moveId": "<exact-id-from-list>", "banter": "<short in-character line, may be empty>"}
```

**Two contrasting personas** (`data/ai-personas/`, `games: [sorry]`):

- **The Bully** — aggressive. Prioritizes bumps, Sorry!-bumps, and slides that
  knock opponents back, even at cost to his own progress. Needling banter.
- **The Tortoise** — cautious racer. Avoids exposure, hugs safety zones, takes
  steady progress over flashy bumps. Unbothered, slow-and-steady banter.

`sorry-player.js` parses `{moveId, banter}`; on unparseable or illegal output it
**falls back to a random legal move** (never crashes the game). `prompts.js`
renders board state + the legal-move list as text.

## Error Handling

- Illegal `moveId` from a human → rejected by `actions.js` validation, state
  unchanged, error surfaced to client.
- No legal moves for the drawn card → automatic pass (logged in view so the UI
  can show "no move").
- Deck exhausted → reshuffle discard pile.
- Bot timeout / bad JSON → random-legal-move fallback.

## Testing (vitest, via testing-runner)

- `state.js` — initial board, pawn placement, deck composition (exactly 45,
  correct per-rank counts).
- `rules/legal-moves.js` — per-card enumeration: 1/2 out-of-start, 4 backward,
  7-split, 10 ±, 11 swap, Sorry!-bump, and the no-legal-move case.
- `rules/slides.js` — slide traversal + chained bumps; own-color slide is *not*
  triggered.
- `actions.js` — bump-to-start, win detection (all 4 home), 2-draws-again loop.
- `sorry-player.js` — fallback on malformed/illegal LLM output.
- Orchestrator integration — bot drives a full turn (including a 2-replay) in one
  wake-up.

## Out of Scope (follow-ons)

- More than 2 players (Gamebox is 2P-only).
- Additional personas beyond the initial two.
