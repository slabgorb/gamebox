---
parent: E3
---
# Story E3-3: Slide traversal + bumping rules

## Business Context

E3-3 delivers the slide-and-bump resolution helper that makes Sorry! feel like Sorry!. Without it, the turn engine (E3-4) cannot correctly resolve any landing — pawns would stop where the card places them and skip slides entirely, producing a game that looks right but plays wrong. Slides are one of Sorry!'s signature mechanics: landing on the start of an opponent-colored slide carries a pawn through the slide path automatically, and every pawn caught in that path (including one's own) is bumped back to Start. This story isolates that resolution logic as a pure, independently testable function consumed by the turn engine.

E3-3 is a parallel sibling of E3-2 (legal-move enumeration): both depend on E3-1's geometry constants and neither depends on the other. E3-4 (the turn engine) depends on both.

## Technical Guardrails

- **Single output file.** The deliverable is `plugins/sorry/server/rules/slides.js` exporting exactly one function: `resolveLanding`. No other files are created or modified in this story.
- **Pure function.** `resolveLanding({ pawns, side, landingIndex })` is a pure function — no state mutation, no I/O, no side effects. It receives the current pawn map and the square the moving pawn just landed on (before any slide), and returns `{ finalIndex, bumped: [{side, pawnId}] }`.
- **Derives slide data from geometry.** Slide definitions (`SLIDES`, `TRACK_LEN`) are imported from the geometry module produced in E3-1 (`plugins/sorry/server/geometry.js`). No slide coordinates are hard-coded inside `slides.js`.
- **Track-zone only.** Only pawns with `zone === 'track'` participate in bump checking. Pawns in `'start'`, `'safety'`, or `'home'` zones are invisible to `resolveLanding`. Safety-zone pawns cannot be bumped because they are off the shared track entirely.
- **Own-color slide does nothing.** If the moving pawn's `side` matches the color that owns the slide whose start equals `landingIndex`, the slide is not triggered — the pawn stays at `landingIndex` and no automatic bump path is swept.
- **Slide path bump scope.** When a foreign-color slide triggers, every track pawn (own or opponent) on any square strictly within the slide path — from the slide start square through and including the final landing square — is included in `bumped`. The mover itself is not included in `bumped` (it lands, it does not get bumped); the caller (E3-4) is responsible for placing the mover at `finalIndex`.
- **Final-square bump.** Any track pawn (own or opponent) sitting on `finalIndex` is bumped regardless of whether a slide triggered. This covers the non-slide case where `finalIndex === landingIndex`.
- **Modular arithmetic.** Slide-end indices use `(start + length) % TRACK_LEN` to correctly wrap the 60-square track.
- **2P only.** The function iterates over sides `['a', 'b']` only. No generalization to N players.
- **Test file.** Tests live at `test/sorry/slides.test.js` and exercise at minimum: (1) bump on non-slide landing, (2) foreign-slide trigger with own pawn caught in path, (3) own-color slide does nothing.

## Scope Boundaries

**In scope (E3-3):**
- `plugins/sorry/server/rules/slides.js` — `resolveLanding` function only.
- `test/sorry/slides.test.js` — unit tests for all three behavioral cases above.
- Importing and consuming `SLIDES` and `TRACK_LEN` from `plugins/sorry/server/geometry.js` (E3-1 output).

**Out of scope:**
- Legal-move enumeration (E3-2) — a parallel story; `resolveLanding` does not enumerate moves, it resolves a single already-chosen landing.
- Applying the move to state, advancing the turn, drawing the next card, checking for a win, or setting `activeUserId` — all of that is E3-4.
- Modifying `actions.js`, `state.js`, `view.js`, or any file outside `plugins/sorry/server/rules/slides.js` and `test/sorry/slides.test.js`.
- The 11-swap mechanic — swapping does not involve slides (the mover may trigger a slide after landing, but the swap itself is handled in E3-4).
- Client rendering of slides or bump animations.

## AC Context

1. **`resolveLanding` exported correctly.** `plugins/sorry/server/rules/slides.js` exports a named function `resolveLanding`. Calling it with `{ pawns, side, landingIndex }` returns an object with exactly two keys: `finalIndex` (a track integer) and `bumped` (an array of `{ side, pawnId }` objects). The function never mutates its inputs.

2. **Non-slide landing bumps the occupant.** When `landingIndex` is not the start of any foreign-color slide, `finalIndex === landingIndex`. Any track pawn (own or opponent) whose `index === landingIndex` appears in `bumped`. Pawns in other zones do not appear.

3. **Foreign-color slide triggers correctly.** When `landingIndex` equals the `start` of a slide whose color is not `side`, the pawn is carried to `(start + length) % TRACK_LEN`. `finalIndex` equals that computed end square. Every track pawn with an `index` equal to any square in the swept path (from `start` through `start + length` inclusive, modulo 60) appears in `bumped`. This includes own pawns caught in the slide path.

4. **Own-color slide is not triggered.** When `landingIndex` equals the `start` of a slide whose color matches `side`, `finalIndex === landingIndex` and no automatic bump sweep occurs. The function returns as if it were a plain landing.

5. **Safety-zone pawns are never bumped.** Pawns with `zone !== 'track'` (including `'safety'`, `'start'`, and `'home'`) never appear in `bumped`, regardless of their `index` value.

6. **Tests pass.** `npx vitest run test/sorry/slides.test.js` exits green, covering at minimum: (a) bump-only (no slide), (b) foreign slide with own pawn in path bumped, (c) own-color slide suppressed.
