# Sorry! — Canonical Board Geometry Rework

**Date:** 2026-05-29 (final values committed in `cf664d4`; earlier rotational-symmetry pass committed in `16b323e`)
**Status:** Shipped
**Origin:** Found during the true-60-loop playtest — live pawns travelling the left/right edges land on decorative slide arrows with no engine slide behind them ("pawn didn't slide"), and the arrows on different edges look inconsistent. Engine slide *resolution* was correct; the gap was that the 2-player engine had only 4 slides (on top/bottom edges), and the WHOLE per-edge layout — slide positions, lengths, ownership; safety-mouth column; diamond barrier; even the home/safety-zone column — didn't match a real Sorry board. After two passes the layout is the user's count-from-vintage-board geometry, not a derivation.

## Canonical per-colour offsets

Counting clockwise from each colour's edge corner = offset 0 (numbers the user counted off a vintage board):

| Offset | Feature |
|---|---|
| 0 | edge corner |
| **1** | start of slide 1 |
| **2** | safety mouth — own pawn forward step here diverts into Safety |
| **3** | diamond — own-colour one-way barrier (clockwise forbidden; counter-clockwise legal) |
| **4** | end of slide 1; start-exit (the track square pawns land on coming out of Start) |
| **9** | start of slide 2 |
| **14** | end of slide 2 |
| 15 | next edge's corner |

Two slides per colour, **same colour as the edge**: slide 1 is length 3 (sweeps 4 squares, lands on the colour's own start-exit), slide 2 is length 5 (sweeps 6 squares, ends one square short of the next corner). All four edges are 90°-rotationally identical (a/b live, green/orange decorative seats whose slides fire for both live colours since neither live side owns them).

Engine constants (in track-index terms, corners at 0/15/30/45):

```
TRACK_LEN    = 60
START_EXIT   = { a: 4,  b: 34 }
SAFETY_ENTRY = { a: 2,  b: 32 }
DIAMOND      = { a: 3,  b: 33, green: 18, orange: 48 }

SLIDES = {
  a:      [ { start: 1,  length: 3 }, { start: 9,  length: 5 } ],
  b:      [ { start: 31, length: 3 }, { start: 39, length: 5 } ],
  green:  [ { start: 16, length: 3 }, { start: 24, length: 5 } ],
  orange: [ { start: 46, length: 3 }, { start: 54, length: 5 } ],
}
```

## Engine

- **`plugins/sorry/server/geometry.js`** — exports `START_EXIT`, `SAFETY_ENTRY`, `DIAMOND`, `SLIDES` per above. `path()` retained for tests (production walks absolute squares).
- **`plugins/sorry/server/rules/legal-moves.js` `step()`** — forward at `SAFETY_ENTRY[side]` diverts into Safety (own only, by construction of `side`). Forward at `DIAMOND[side]` returns `null` (own-colour clockwise blocked). Backward is unrestricted on track (so two back-1 cards from start-exit +4 land you on the safety mouth at +2 — the canonical *"two tens bringing you home"* play). Safety is forward-only (backward from safety/home returns `null`).
- **`plugins/sorry/server/rules/slides.js` `resolveLanding`** — slide-lookup iterates `['a','b','green','orange']`. `triggers = slide && owner !== side`; since moving `side` is only ever `a`/`b`, the green/orange slides fire for both live colours (absent player's slide semantics). Bump loop stays `['a','b']` — decorative seats hold no pawns.
- **No state migration:** slides and constants are read from geometry at apply-time, so in-flight games inherit the new layout cleanly.

## Client

- **`src/clients/sorry/board-geometry.js`** — mirrors engine `START_EXIT` / `SAFETY_ENTRY` / `DIAMOND` / `SLIDES`. `slideSegments()` emits all 8 segments via `trackCell`. `SAFETY_CELL` and `HOME_CELL` columns shifted from 1 → 2 (side a) and 14 → 13 (side b) because the safety mouth attaches at corner +2 now, not +1.
- **`src/clients/sorry/Board4P.tsx`**:
  - `liveSlides` derives every drawn slide from `slideSegments()`; an edge-detection helper colours each segment by which perimeter edge it sits on (`row 0`→top, `row 15`→bottom, `col 15`→right, `col 0`→left). `decorSlides` / `REF.slides` deleted — no more fakes; every painted arrow is a real engine slide.
  - `REF.safety` and `REF.home` shifted to col 2 (matches the safety mouth's column).
  - `DiamondMarker` — same-colour rhombus on each seat's +3 cell; visual mirror of the engine barrier.
  - `StartExitDot` — small same-colour disc on each seat's +4 cell; the track square pawns come out of Start onto.
  - `StartLabel` and `REF.label` deleted; "START" text removed (start circles remain).

## Tests

- `test/sorry/geometry.test.js` — pins `SAFETY_ENTRY = {a:2,b:32}`, `DIAMOND = {a:3,b:33,green:18,orange:48}`, and the 4-edge SLIDES table verbatim.
- `test/sorry/slides.test.js` — covers a/b own-colour no-trigger, foreign-colour trigger + sweep + bump, and the green/orange "fires for both live colours" cases on the new positions.
- `test/sorry/legal-moves.test.js`:
  - LOOP: `0 + forward 3` reaches Safety (mouth at +2, divert on the step FROM the mouth);
  - LOOP: forward from the diamond (+3) returns no move for an own pawn (`OWN_COLOUR clockwise barrier`);
  - LOOP: backward from the mouth (+2) wraps onto +1 (no backward divert);
  - LOOP: multi-step forward across the mouth (e.g. 58 + 5) lands safe-0;
  - LOOP: two consecutive back-1 cards from start-exit (4 → 3 → 2) land on the mouth.
- `test/client/sorry-slides-geometry.test.ts` (drift guard) — board-geometry `SLIDES` mirror equals engine; every drawn segment maps to a real engine slide; every endpoint is on the perimeter ring.
- `test/client/sorry-canonical-geometry.test.ts` — pins `HOME_CELL` and `safetyCells` at the new col 2 / col 13.

## Out of scope / notes

- Slide 1 sweeps the safety mouth (+2) and the diamond (+3). A foreign pawn landing at +1 carries through the dead zone, lands on the colour's own start-exit (+4), and bumps any pawn sitting in that range — including own pawns the colour parked in the dead zone via back-up plays. That's canonical.
- Own-pawn collision is now forbidden separately (commit `f95944f`): `legalMoves` drops any move whose track destination is held by one of your own pawns (forward/back/out, and card-7 split legs against non-mover own pawns). Slides that sweep your own pawns through `resolveLanding` still bump them — only the direct landing square is guarded.
- "Two tens bringing you home": from start-exit +4, two `card 10` back-1 plays land you on +2 (the mouth); next forward enters Safety, and ~6 forward total from there gets home.

## Verification

- `npm test` (sorry suite 153/153) + `npm run test:client` (213/213).
- Rebuild client bundle: `GAMEBOX_PLUGIN=sorry npx vite build --config vite.config.client.js`; restart server: `launchctl kickstart -k gui/501/com.slabgorb.words-server`; confirm `curl -s -o /dev/null -w "%{http_code}" localhost:3000` → 200.
- Live playtest (game 89, side a as Keith): all four edges show two separated same-colour slides; diamonds visible at each +3; start-exit dots visible at each +4; safety zones attach at col 2 / col 13.
