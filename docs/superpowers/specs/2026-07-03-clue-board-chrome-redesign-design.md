# Clue board + chrome re-theme (Claude Design handoff)

**Date:** 2026-07-03
**Type:** Presentation-only re-theme (no engine changes)
**Design source:** Claude Design project `d18dae1d-4e88-4ded-a9ee-f15245dd725e`, file `Clue Board.dc.html` ("Clue board gamebox redesign").

## Goal

Re-skin the Clue client to the handed-off "parlour mystery" aesthetic: green-felt
board in a walnut frame, parchment rooms with brass detailing, brass weapon
medallions, checker-token pawns, and matching page chrome (wood-plank header,
roster chips, felt dice tray, parchment action panels, "parlour ledger" log).

## Key fact: it's pure presentation

The design was drawn on the exact server grid. The design's `ROOMS`, `DOORS`,
`CELLAR`, `GRID` (24×25), and `CELL` (26) are **byte-identical** to
`plugins/clue/server/geometry.js` and the client mirror `board-geometry.js`.
Therefore:

- **No** changes to `server/*`, the `ClueView` contract, `board-geometry.js`, or
  reachability. The engine drives everything exactly as today.
- `test/clue-geometry.test.js`, `test/clue-board-drift.test.js`,
  `test/clue-card-art-drift.test.js`, and all engine/action/AI tests are
  untouched and stay green.
- `clue-geometry.test.js` asserts `data-room=` etc. against the **server-side**
  `buildBoardSvg` harness, not the React `Board.tsx` — so re-theming the React
  board does not affect it.

## Scope

**In:**
1. **Board** (`src/clients/clue/Board.tsx`) — visual rewrite, same `view`-driven
   data flow.
2. **Board art constants** (new `src/clients/clue/board-art.js`).
3. **Chrome** (`plugins/clue/client/style.css`, scoped `#clue-root`) — page bg,
   header, roster, dice-tray frame, action panels, log/ledger, keyframes.
4. **Minor markup** in `src/clients/clue/ClueApp.tsx` to support the header
   nameplate — no logic/testid/behavior changes.

**Out (explicitly):**
- **Cards stay as they are.** `ClueCard.tsx`, `card-art.js`, and the portrait
  hand/ledger/refute tiles are **unchanged**. `/shared/portraits/*` remains in
  use by the cards. `test/client/clue-card.test.tsx` and
  `test/client/clue-refute-prompt.test.tsx` stay untouched.
- No engine, geometry, view, or AI changes.

## Component design

### Board.tsx (rewrite, same props)

Signature unchanged: `Board({ view, onPickSquare, onPickRoom })`. Still renders
from `view.movement` (reachable rooms/squares, active viewer only), `view.weapons`,
`view.pawns`. Retains `data-room` / `data-weapon` / `data-pawn` / `data-square`
hooks and the `onPickRoom`/`onPickSquare` wiring.

Self-contained SVG (`viewBox="0 0 624 650"`) with inline `<defs>` ported from the
design: `feltGrad`, `parchGrad`, `brassStrip`, `brassMed`, `tokShadow`, `feltN`
(noise). Layer order:

1. Felt gradient rect + noise overlay.
2. Corridor grid lines (faint).
3. **Rooms — parchment style** (chosen variant): `url(#parchGrad)` fill, brass
   border, serif Playfair label, secret-passage `⤢` glyph for the four corner
   rooms. Reachable rooms get the gold overlay + click handler (unchanged logic).
   The E7-1 room-background `<image>` portraits are **removed from the board**.
4. Cellar → the design's envelope block: "CLUE / THE ACCUSATION / ?".
5. Door thresholds → brass bars.
6. Reachable corridor squares → pulsing gold squares (`reachPulse` keyframe),
   click → `onPickSquare`.
7. **Weapons** → brass medallion (`url(#brassMed)`) + ported SVG line-art icon
   per weapon. Positioned inside the room with a **per-room slot offset** so two
   weapons in one room do not overlap (keeps current correctness; the design mock
   assumed one-per-room). Replaces the E7-1 weapon portrait tiles.
8. **Pawns** → checker PNG `<image href="assets/checker-{color}.png">` with
   `tokShadow`; a gold ring on the viewer's own pawn
   (`view.seatSuspect[view.youAreSeat]`); centered horizontal spread for pawns
   clustered in a room.

### board-art.js (new)

Presentation constants, parallel to `card-art.js`; keeps the drift-guarded
`board-geometry.js` geometry-only:

- `SUSPECT_CHECKER`: suspect id → checker color file
  (`scarlett→red, mustard→orange, white→white, green→green, peacock→blue, plum→pink`).
- `WEAPON_ICONS`: weapon id → `{ icon, sw }` SVG path + stroke-width, ported
  verbatim from the design's `WEP` table.

### style.css chrome (`#clue-root`)

`style.css` is checked-in and uses `#clue-root .x` id-specificity, so it wins over
the bundled `app.css`. All theming lives here:

- Page: green-felt radial-gradient body bg + faint noise.
- Header: wood-plank gradient, brass "CLUE" nameplate, italic subtitle, brass
  "your move" pill, lobby link. Existing `data-testid="turn-status"` preserved.
- Roster chips: pill with color pip (`PAWN_COLORS`), turn glow (`turnGlow`
  keyframe), eliminated/you states preserved.
- Dice section (`.clue-dice`): felt tray frame **around the real physics
  `DiceTray`** (behavior unchanged; `data-testid="dice-tray"` preserved).
- Action panels (`.clue-panel`, suggest/pass/accuse): parchment card styling.
  Testids `suggest-panel` / `pass-panel` / `accuse-panel` / `{verb}-form`
  preserved.
- Hand/ledger section headers: mono eyebrow labels. **Portrait cards themselves
  unchanged.**
- Log (`.clue-log`): "parlour ledger" styling.
- `@keyframes reachPulse`, `@keyframes turnGlow`.

### ClueApp.tsx

Only markup needed to render the new header nameplate (e.g. wrap title/subtitle,
add a nameplate span for the viewer's suspect). No changes to state, effects,
handlers, phases, or any `data-testid`. `clue-app-bot-roll.test.tsx` (queries
`dice-tray` testid + "Roll the die" button) stays green.

## Assets & serving

Checker PNGs already exist at `plugins/clue/client/assets/checker-{red,orange,
white,green,blue,pink}.png` (currently untracked — `git add` as part of the work).
The plugin client is served at `${base}/:gameId/` with a static mount over
`clientDir`, so the board's relative `assets/checker-*.png` `<image href>`
resolves to the served asset. No absolute/shared mount needed.

## Test plan

- All engine, action, AI, geometry, and drift tests: unchanged, must stay green.
- `clue-card.test.tsx`, `clue-refute-prompt.test.tsx`, `clue-app-bot-roll.test.tsx`:
  unchanged, must stay green (behavioral testids + card markup preserved).
- **New** `test/client/clue-board.test.tsx` (RED first): render `Board` with a
  fixture `view` and assert the port — every room emits `data-room`, weapons emit
  `data-weapon` with a medallion, pawns emit `data-pawn` with the correct
  `assets/checker-{color}.png` href, the viewer's own pawn gets the gold ring,
  reachable rooms/squares are clickable, and no `/shared/portraits` board
  `<image>` remains.

## Verification

1. `npm run build:client` (rebuilds the gitignored `app.js`/`app.css` bundle).
2. Offline board render: harness HTML that loads **both** `style.css` and
   `app.css` inside `#clue-root` (the two-stylesheet gotcha), mounts `Board`
   against a fixture view, screenshot and eyeball vs. the design.
3. Live smoke: run the app, open a Clue game, confirm board + chrome render and
   a move/suggest turn still works.

## Risks

- **Two-stylesheet cascade:** verify the offline harness loads style.css + app.css
  or the re-theme can look wrong offline while being right live (or vice-versa).
- **Asset path:** confirm relative `assets/checker-*.png` resolves under the
  `${base}/:gameId/` static mount at runtime (verification step 3).
- **Bundle inertness:** `.tsx` changes are inert until `build:client` + server
  restart.
