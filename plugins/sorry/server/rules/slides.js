import { SLIDES, TRACK_LEN } from '../geometry.js';

// Resolve a pawn of `side` landing on track square `landingIndex`. If that
// square starts a slide owned by the *other* color, the pawn is carried to
// the slide's end and every track pawn swept along the path is bumped back to
// Start. A slide of the pawn's own color is inert. Whether or not a slide
// fires, any track pawn sitting on the final square is bumped.
//
// Pure: never mutates `pawns`. The mover is not assumed to be present in
// `pawns` at `landingIndex` — the caller (turn engine) places it at
// `finalIndex` afterward, so no pawn is excluded by id here.
//
// Returns `{ finalIndex, bumped: [{ side, pawnId }, ...] }`.
export function resolveLanding({ pawns, side, landingIndex }) {
  // Find the slide (across both colors) whose start is this square.
  let owner = null;
  let slide = null;
  for (const color of ['a', 'b']) {
    const found = SLIDES[color].find((s) => s.start === landingIndex);
    if (found) {
      owner = color;
      slide = found;
      break;
    }
  }

  // Only a foreign-color slide fires; an own-color slide (or no slide) does not.
  const triggers = slide !== null && owner !== side;
  const finalIndex = triggers ? (slide.start + slide.length) % TRACK_LEN : landingIndex;

  // Squares whose track occupants get bumped: the full swept path for a
  // triggered slide, otherwise just the final square.
  const swept = new Set();
  if (triggers) {
    for (let k = 0; k <= slide.length; k++) swept.add((slide.start + k) % TRACK_LEN);
  } else {
    swept.add(finalIndex);
  }

  const bumped = [];
  for (const color of ['a', 'b']) {
    for (const pawn of pawns[color]) {
      if (pawn.zone === 'track' && swept.has(pawn.index)) {
        bumped.push({ side: color, pawnId: pawn.id });
      }
    }
  }

  return { finalIndex, bumped };
}
