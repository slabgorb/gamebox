# Risk — Visual Treatment Redesign

**Date:** 2026-05-18
**Status:** Approved (design); pending implementation plan
**Author:** Dev (brainstorming session)

## Problem

The Risk plugin shipped functional but visually bare. `plugins/risk/client/` is
197 lines total, `style.css` is 18 lines. Territories render as text chips
grouped in a vertical list — there is no map, no adjacency, no combat feedback.
The three AI opponent portraits (`admiral-vonnegut`, `colonel-jaune`,
`major-robert`) that were drawn are never displayed. The original Risk design
doc (`2026-05-17-risk-game-design.md`) specified `board.js` as an "SVG map
render"; what shipped is a chip list. This is the gap.

## Decisions (locked during brainstorming)

| Axis | Decision |
|------|----------|
| Ambition | **War room** — full thematic treatment, not a polish pass |
| Map representation | **Drawn regions** — irregular SVG landmasses on a map |
| Palette | **Antique campaign map** — parchment, ink coastlines, brass accents, Georgia serif, bone-pip dice |
| Player→AI taunt | **Add a taunt input** — satisfied by the shared opponent-card (see below) |
| Combat dice reveal | **Animate then settle** — replay rounds on a fresh attack (~1.5–2s), instant on reload of a stale result |
| Shared opponent-card theming | **Leave visually neutral** — consistent across Gamebox by design; do not re-skin it for Risk |

## Verified integration facts

These were confirmed against the codebase during brainstorming and are
load-bearing for the design:

- `src/server/plugin-clients.js` injects `window.__GAME__` with
  `opponentPersonaId`, `opponentFriendlyName`, `opponentGlyph`,
  `opponentColor`, `stateUrl`, `sseUrl`, `actionUrl`, `gameId`, `userId`.
  The client already has everything needed to render the opponent from game
  start — **no server change required.**
- `public/shared/opponent-card.js` + `public/shared/opponent-card.css` is a
  self-mounting shared component (renders only when `opponentPersonaId` is
  present). It already provides: portrait by persona id with color/glyph
  fallback, name strip, banter speech bubble with thinking dots, stall banner
  with retry/abandon, **and a free-text taunt input** that POSTs to
  `/api/games/:id/chat`. It wires the `bot_thinking`, `banter`, `bot_stalled`,
  `update`, and `user_chat` SSE events itself.
- Cribbage, backgammon, and words consume it with exactly two lines in their
  `index.html` (a `<link>` and a `<script type="module">`). Risk's
  `index.html` omits both — that is the sole reason Risk has no portrait,
  banter, or taunt UI.
- SSE framing (`src/server/sse.js`): `broadcast` writes
  `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n` — named SSE events.
- Combat (`plugins/risk/server/actions.js`) persists
  `state.lastCombat = { from, to, force, rounds, captured, attackerSurvivors,
  defenderSurvivors }`. `rounds` is an array of `{ aDice, dDice, aLoss, dLoss }`.
  `riskPublicView` is `{ ...state, youAre }` — the full combat detail,
  including every die, is already in the client's view. The dice reveal is a
  deterministic client-side replay, not fabricated and not interactive.
- Static mount (`src/server/server.js`): `app.use(express.static(PUBLIC))`
  where `PUBLIC = <root>/public`. Portraits resolve at
  `/shared/portraits/{personaId}.png`.

## Map geometry

The 13 territories and the engine adjacency list (`plugins/risk/server/map.js`)
form a ring of four continents around a central sea:

```
Norland (N1,N2,N3)  --N3–E1-->  Ostmark (E1,E2,E3,E4)
   ^                                   |
 W3–N1                               E4–S1
   |                                   v
Westfen (W1,W2,W3)  <--S3–W1--  Sudreach (S1,S2,S3)

         plus one mid-map strait: E2 – W2
```

Internal edges: Norland triangle (N1-N2, N2-N3, N1-N3); Ostmark ring
(E1-E2, E2-E3, E3-E4, E1-E4); Sudreach path (S1-S2, S2-S3); Westfen triangle
(W1-W2, W2-W3, W1-W3). Inter-continent straits: N3-E1, E4-S1, S3-W1, W3-N1,
E2-W2.

`client/map-geometry.js` (new, pure data) exports, per territory: an SVG
polygon path (region shape) and a label anchor `{x, y}`; per continent: a
region grouping; and the list of strait segments to draw across the central
sea. Each continent is a distinct landmass; the five inter-continent edges
render as connector lines (straits) so adjacency is visible.

## Components

### 1. Opponent card (integration only)
Add to `plugins/risk/client/index.html`:
```html
<link rel="stylesheet" href="/shared/opponent-card.css">
<script type="module" src="/shared/opponent-card.js"></script>
```
No new JS, no server changes, no edits to the shared component. The shared
card keeps its own neutral styling across all Gamebox games — re-skinning it
for Risk would alter cribbage/backgammon/words. The taunt input the user
requested is delivered by this component as-is.

### 2. SVG map (`client/board.js` rewrite + `client/map-geometry.js` new)
`board.js` becomes an SVG renderer driven by `map-geometry.js`: region fill =
owner color, neutral fill for unowned, army count rendered at the label
anchor, the selected territory ringed (gold), straits drawn across the sea.
Tap on a region fires the existing `onPick(id)` — the app-level selection and
action logic in `app.js` / `action-bar.js` is unchanged.

### 3. Antique palette (`client/style.css` rewrite)
Parchment background, ink coastlines, brass accents, Georgia serif. All rules
scoped under `#risk-root` so nothing leaks into the shared opponent-card.
Themed surfaces: map, phase/turn banner, action bar, move log, end screen,
**and a new continent-bonus rail** showing Norland +2, Ostmark +3,
Sudreach +2, Westfen +2, highlighting any continent the viewer fully controls.

### 4. Combat dice reveal (`client/combat-reveal.js` new)
On a render where `lastCombat` transitioned to a new value, replay
`lastCombat.rounds` round-by-round as bone-pip dice (attacker vs defender,
losses tick off), ~1.5–2s total, then settle on the outcome. On reload of a
game whose `lastCombat` is unchanged from the last seen signature, render the
final outcome instantly — no replay. Transition detection: keep the last-seen
`lastCombat` signature in module memory; replay only on a genuine change.
Wired into the `app.js` render loop.

## Files touched

| File | Change |
|------|--------|
| `plugins/risk/client/index.html` | +2 shared opponent-card lines |
| `plugins/risk/client/map-geometry.js` | **new** — region path + anchor data, strait list |
| `plugins/risk/client/board.js` | rewrite — SVG map renderer |
| `plugins/risk/client/combat-reveal.js` | **new** — dice replay |
| `plugins/risk/client/style.css` | rewrite — antique theme, `#risk-root`-scoped |
| `plugins/risk/client/app.js` | wire combat-reveal into render loop; add continent-bonus rail |
| `plugins/risk/client/themes.js`, `action-bar.js`, `history.js`, `end-screen.js` | restyle hooks only — logic unchanged |
| **server / shared component** | **no changes** |

## Testing

- `test/risk-client-files.test.js` asserts client file structure — update for
  the new files (`map-geometry.js`, `combat-reveal.js`).
- New test for `map-geometry.js` (pure data): every engine adjacency edge has
  a drawn strait or shared internal boundary; every territory has a region
  path and a label anchor; no geometry references a non-existent territory;
  every territory in `map.js` appears in the geometry.
- New unit test for `combat-reveal.js` transition detection: fresh
  `lastCombat` triggers replay, unchanged signature does not.
- Map rendering and dice animation are visual — verified manually against a
  live AI game (vs. Vonnegut/Jaune/Robert), not asserted in JS.

## Out of scope

- No server or engine changes; no new AI behavior.
- No edits to the shared opponent-card or its CSS.
- No 42-territory classic map (geometry-as-data keeps this a future pure-data
  change, per the original Risk design doc).
- No round-by-round interactive combat — the engine resolves an attack in one
  action; the reveal is a replay of recorded rounds, not input.
