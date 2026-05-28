# Epic E3: Sorry! game plugin (full ruleset, 2P, vs AI)

## Overview

E3 delivers a complete, playable **Sorry!** game plugin in Gamebox: full classic
ruleset, 2 players, 4 pawns each, versus two contrasting AI personas (The Bully,
The Tortoise). The plugin is self-contained and ships with AI opponents from day
one so the game is immediately playable against the computer.

**Strategic frame:** Sorry! is natively 2-player, which means no 4→2 adaptation
is needed — it fits the Gamebox 2P-only platform constraint exactly. The closest
existing analog in the codebase is the backgammon plugin; E3 mirrors its
structure throughout.

## Background

Gamebox already hosts backgammon and Risk as server-authoritative plugins with
LLM-persona AI opponents. E3 extends that pattern to Sorry! The design and
implementation plan were authored on 2026-05-27 and committed ahead of the sprint:

- Design spec: `docs/superpowers/specs/2026-05-27-sorry-plugin-design.md`
- Implementation plan: `docs/superpowers/plans/2026-05-27-sorry-plugin.md`

The epic is status **ready**; all 6 stories are in backlog awaiting implementation
in build-order sequence. The implementation plan (Tasks 1–10) covers TDD steps
for every story.

## Technical Architecture

### Plugin location and shape

The plugin lives at `plugins/sorry/`, mirroring `plugins/backgammon/`:

```
plugins/sorry/
  plugin.js                 # { id:'sorry', displayName:'Sorry!', players:2,
                            #   clientDir, initialState, applyAction, publicView }
  server/
    state.js                # buildInitialState: board model, pawns, deck, first draw
    actions.js              # applySorryAction: validate + apply a chosen move
    view.js                 # sorryPublicView: redact deck order, expose board + drawnCard
    deck.js                 # 45-card Sorry! deck, draw/reshuffle (server-authoritative)
    geometry.js             # path(), SLIDES, START_EXIT, SAFETY_ENTRY constants
    rules/
      legal-moves.js        # enumerate legal moves for the drawn card
      slides.js             # slide squares + chained bumps
    ai/
      prompts.js            # board-state → text for the LLM; parseLlmResponse
      sorry-player.js       # chooseAction: parse {moveId, banter}, random-legal fallback
  client/
    index.html, app.js, style.css   # board render + card-flip animation
```

Registration: the plugin is imported and added to the map in `src/plugins/index.js`.

### State model

Pawn location is a tagged value:

```js
{ zone: 'start' | 'track' | 'safety' | 'home', index: <int> }
```

- Track index: absolute 0–59 (60-space clockwise outer track).
- Safety index: 0–4 (5-square safety zone per color, own-color only).
- Start / Home are terminal zones; pawns at Home never move.

Full state shape: `{ sides, pawns, deck, discard, drawnCard, currentPlayer, winner, lastEvent, activeUserId }`.

### Board geometry

Geometry constants (in `server/geometry.js`) define an internally consistent
standard Sorry! layout for 2 sides (a, b):

| side | startExit | safetyEntry | slides (track start → length)  |
|------|-----------|-------------|-------------------------------|
| a    | 4         | 1           | `9→4`, `34→5`                 |
| b    | 34        | 31          | `39→4`, `4→5`                 |

`path(side)` returns an ordered list of physical square IDs a pawn traverses from
its startExit clockwise to safetyEntry, then through the 5 safety squares, then
Home. All forward/backward movement is index arithmetic on this list.

### Card draw: server-authoritative rule, not an action

Card draw is an automatic server-side step — the same collapsed-mechanic pattern
as cribbage's auto-cut and dice rolls. The deck is stateful (persistent draw
order must be preserved across requests), which is why it cannot be client-side
RNG. The bot never emits a "draw" action; it only emits `{ type: 'move', payload: { moveId } }`.

**Turn / data flow:**

1. Turn begins → server pops the top card into `drawnCard` (first draw happens inside `buildInitialState`; subsequent draws happen in `advanceTurn` inside `actions.js`).
2. `rules/legal-moves.js` enumerates every legal move for `drawnCard`. If none, the turn auto-passes (discard, draw, switch player).
3. Player/bot selects a `moveId`; `actions.js` validates and applies it (movement, slides + chained bumps, swap, Sorry!-bump, win check). A **2** loops back to step 1 for the same player.
4. `view.js` redacts deck order but exposes `drawnCard`, all pawn positions, and `activeUserId`.

### Card powers

Full ruleset is implemented:

- **1 / 2** — only cards that bring a pawn out of Start (also move that amount on track). **2** grants a draw-again.
- **4** — move backward 4.
- **7** — move 7, or split the 7 steps across two pawns.
- **10** — move +10, or move −1 backward.
- **11** — move 11, or swap one of your pawns with an opponent's pawn.
- **Sorry!** — bring a pawn out of Start by bumping an opponent track pawn to its Start.

### Deck

45-card canonical composition: `{ 1:5, 2:4, 3:4, 4:4, 5:4, 7:4, 8:4, 10:4, 11:4, 12:4, sorry:4 }`. `deck.js` owns draw + reshuffle-from-discard. Pure functional: `draw({ deck, discard, rng })` returns `{ card, deck, discard }`.

### Slides and bumping

`rules/slides.js` exports `resolveLanding({ pawns, side, landingIndex })`. A pawn
that lands on the start square of a slide belonging to the *other* color travels
to the slide's end, bumping every pawn (own or opponent) strictly between start
and end back to their Start. Landing on your own color's slide does nothing
special.

### AI adapter

`sorry-player.js` mirrors `plugins/backgammon/server/ai/backgammon-player.js`:

```json
{"moveId": "<exact-id-from-list>", "banter": "<short in-character line>"}
```

On unparseable or illegal LLM output, the adapter falls back to a random legal
move — the game never deadlocks. `prompts.js` contains the board-state →
prompt builder and the `parseLlmResponse`/`extractJson` helpers (copied from
backgammon's pattern; not exported cross-plugin).

The orchestrator gates on `activeUserId === bot` (standard contract), not on a
draw step, consistent with the AI orchestrator turn-continuation contract.

### Persona registration

Two YAML files in `data/ai-personas/`, each with `games: [sorry]`. Portraits
auto-load by persona id. The adapter is registered in `src/server/ai/index.js`
under the `sorry` key, following the backgammon entry's shape.

**The Bully** — aggressive. Prioritizes bumps, Sorry!-bumps, and slides that knock
opponents back, even at cost to his own position. Needling banter.

**The Tortoise** — cautious racer. Avoids exposure, hugs safety zones, takes steady
progress over flashy bumps. Unbothered, slow-and-steady banter.

### Reference contracts (read before starting)

| Concern | Reference file |
|---------|---------------|
| Plugin shape | `plugins/backgammon/plugin.js` |
| `activeUserId` mirroring, action contract | `plugins/backgammon/server/actions.js` |
| AI adapter contract | `plugins/backgammon/server/ai/backgammon-player.js` |
| LLM response parsing | `plugins/backgammon/server/ai/prompts.js` |
| Plugin registry | `src/plugins/index.js` |
| AI adapter registry | `src/server/ai/index.js` |
| Persona schema | `data/ai-personas/aunt-irene.yaml` + `src/server/ai/persona-catalog.js` |

### Tech stack

Node ESM (no build step for server), vitest for tests, vanilla JS client.

### Error handling

- Illegal `moveId` from a human → rejected by `actions.js`, state unchanged, error surfaced to client.
- No legal moves for the drawn card → automatic pass (logged in `lastEvent` so the UI can show "no move").
- Deck exhausted → reshuffle discard pile.
- Bot timeout / bad JSON → random-legal-move fallback in `sorry-player.js`.

### Testing conventions

Test files live at `test/sorry/*.test.js` and exercise the engine through its
exported module contracts (not through HTTP). Key test files per story:

| Task / Story | Test file(s) |
|---|---|
| Task 1 — skeleton | `test/sorry/plugin-registration.test.js` |
| Task 2 — deck | `test/sorry/deck.test.js` |
| Task 3 — geometry + state | `test/sorry/geometry.test.js`, `test/sorry/state.test.js` |
| Task 4 — legal moves | `test/sorry/legal-moves.test.js` |
| Task 5 — slides | `test/sorry/slides.test.js` |
| Task 6 — turn engine | `test/sorry/actions.test.js` |
| Task 7 — AI adapter | `test/sorry/sorry-player.test.js` |
| Task 8 — registration | `test/sorry/ai-registration.test.js` |
| Task 10 — integration | `test/sorry/orchestrator-turn.test.js` |

## Story Build-Order Chain

Stories must be implemented in dependency order:

```
E3-1 (foundations: skeleton + deck + geometry + state)
  ├─ E3-2 (legal-move enumeration) — depends on E3-1
  │    └─ E3-4 (turn engine / applyAction) — depends on E3-2
  │         └─ E3-5 (AI adapter + prompts + personas + registration) — depends on E3-4
  │              └─ E3-6 (client UI + orchestrator integration + playtest) — depends on E3-5
  └─ E3-3 (slide traversal + bumping rules) — depends on E3-1
       (E3-3 work is consumed by E3-4)
```

E3-2 and E3-3 both depend on E3-1 and can be worked in parallel if desired;
E3-4 requires both to be complete before final integration.

| Story | Title | Points | Depends on |
|-------|-------|--------|------------|
| E3-1 | Engine foundations: plugin skeleton, deck, geometry + initial state | 3 | — |
| E3-2 | Legal-move enumeration for all cards (out, forward, back, 7-split, 11-swap, Sorry!) | 3 | E3-1 |
| E3-3 | Slide traversal + bumping rules | 2 | E3-1 |
| E3-4 | Turn engine (applyAction): apply moves, bumps, swap, Sorry!, win + auto-pass | 3 | E3-2 |
| E3-5 | AI adapter + prompts + two personas + adapter/persona registration | 3 | E3-4 |
| E3-6 | Client UI (board, card flip, move interaction, win banner) + orchestrator integration + playtest | 3 | E3-5 |

Total: **17 points** across 6 stories.

## Cross-Epic Dependencies

- **Platform constraint (all epics):** Gamebox is 2P-only. Sorry! is natively
  2-player, so this requires no adaptation — 4-player Sorry! is out of scope
  and is not a planned follow-on within this epic.
- **Persona/portrait infrastructure** established for Risk (E2) is reused here:
  YAML persona files in `data/ai-personas/`, catalog loaded by
  `src/server/ai/persona-catalog.js`, portraits auto-loaded by persona id. No
  new infrastructure is needed; E3 personas simply add two more YAML files.
- **AI adapter registry** (`src/server/ai/index.js`) is modified in E3-5 by
  adding a `sorry` entry alongside the existing backgammon and risk entries.
- **Plugin registry** (`src/plugins/index.js`) is modified in E3-1 to add the
  sorry import and map entry.
- **E2 is independent.** The E2 NO-GO branch decision and E2's Risk corpus work
  proceed on their own track; E3 has no dependency on E2 completing.
- Additional Sorry! personas are explicitly out of scope for E3.
