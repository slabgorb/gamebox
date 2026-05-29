# Sorry! — Canonical 4-Edge Slides + Remove START Labels

**Date:** 2026-05-29
**Status:** Approved (design)
**Origin:** Found during the true-60-loop playtest — live pawns travelling the left/right edges land on decorative slide arrows that have no engine slide behind them ("pawn didn't slide"), and those arrows are positioned/styled differently from the real top/bottom slides ("slides look different per-side"). Engine slide *resolution* is correct; the gap is that the 2-player engine only has slides on the top/bottom edges while the board paints fakes on the sides.

## Problem

`plugins/sorry/server/geometry.js` defines 4 slides — `a:[{9,4},{34,5}]`, `b:[{39,4},{4,5}]` — all of which map (via `board-geometry.js trackCell`) onto the **top and bottom** perimeter edges. The left and right edges carry no engine slide. The canonical pinwheel board (`src/clients/sorry/Board4P.tsx`) therefore draws **decorative `REF.slides`** on the left/right (green/orange) seats — illustrative arrows with no engine backing. Because the engine's 60-square loop physically runs along all four edges, live red/blue pawns travel the side edges and can land on a decorative arrow that does nothing.

## Part A — Engine: add the two missing edges' slides

The slide pattern is rotationally symmetric: the top-edge pattern `{start+0: length 5, start+5: length 4}` rotated +15 (90°) lands on the right edge, +45 (270°) on the left edge. Add:

```
green  (right edge): { start: 19, length: 5 }, { start: 24, length: 4 }
orange (left edge):  { start: 49, length: 5 }, { start: 54, length: 4 }
```

- `geometry.js SLIDES` becomes `{ a:[…], b:[…], green:[…], orange:[…] }` (8 slides).
- `rules/slides.js resolveLanding`: the slide-lookup loop iterates all four owner keys (`['a','b','green','orange']`). `triggers = slide && owner !== side`; since the moving `side` is only ever `a`/`b`, the green/orange slides **fire for both live colours** — the correct "absent player's slide" behaviour on a real board. The bump loop stays `['a','b']` (the decorative seats hold no pawns).
- Slide starts `{4,9,19,24,34,39,49,54}` are all distinct (no start collision). Only the landed-on slide fires; no chain-sliding (unchanged).
- **No state migration:** slides are read from geometry at apply-time, so in-flight games gain the new slides cleanly.
- `rules/legal-moves.js` is unchanged — the landing square is computed pre-slide; the slide resolves on apply, exactly as today.

**Intended gameplay change:** a live pawn landing on 19, 24, 49, or 54 now slides and sweeps/bumps, making the left/right edges live like the top/bottom.

## Part B — Client: derive ALL slides from the engine; delete the fakes

- `src/clients/sorry/board-geometry.js`: mirror the new `SLIDES` (add `green`/`orange`); `slideSegments()` iterates all keys and emits all 8 segments (it already uses `trackCell`, which places 19/24 on the right edge and 49/54 on the left).
- `src/clients/sorry/Board4P.tsx`:
  - Generalise `liveSlides` edge→colour detection to four edges: `row 0`→top, `row 15`→bottom, `col 15`→right, `col 0`→left.
  - **Delete `decorSlides`, `REF.slides`, and the decor render call.** Every drawn arrow now sits on a real engine slide square, so a painted arrow can never disagree with the engine.

## Part C — Remove START labels

Delete the `StartLabel` component, its render call, and `REF.label` from `Board4P.tsx`. The start *circles* remain; only the "START" text is removed.

## Tests

- `test/sorry/slides.test.js`: side-a pawn lands on 19 and 49 → slides to 24 / 54; side-b lands on 24 and 54 → slides; a swept opponent pawn on a new edge is bumped to Start; landing on a non-slide side square still doesn't slide.
- `test/client/sorry-slides-geometry.test.ts` (drift guard): board-geometry `SLIDES` mirror equals engine `SLIDES` (now 4 keys / 8 slides); every drawn `slideSegments()` segment maps to a real engine slide square.
- Remove/adjust any test asserting `start-label-*` test ids (`sorry-canonical-geometry.test.ts`, board tests).

## Out of scope / notes

- Top/bottom slides each fire for one live colour; the new side slides fire for both. This asymmetry is inherent to a 2-colour engine and is the correct "absent player's slide" semantics.
- Own-pawn collision (pre-existing) remains out of scope.

## Verification

- `npm test` + `npm run test:client` green.
- Rebuild client bundle: `GAMEBOX_PLUGIN=sorry npx vite build --config vite.config.client.js`; restart server: `launchctl kickstart -k gui/501/com.slabgorb.words-server`; confirm `curl -s -o /dev/null -w "%{http_code}" localhost:3000` → 200.
- Live playtest: all four edges show consistent, engine-aligned slides; a pawn landing on a side-edge slide square slides; no START text on the board.
