export const TRACK_LEN = 60;
export const START_EXIT = { a: 4, b: 34 };
export const SAFETY_ENTRY = { a: 1, b: 31 };
// Slides belong to a color. {start: track index of the slide's first square,
// length: squares advanced}.
// Two slides per edge of the pinwheel. The live engine sides a/b sit on the
// top/bottom edges; the decorative side seats (green = right edge, orange =
// left edge) carry the same pattern rotated 90°/270° around the 60-loop. A
// slide fires for any pawn of a *foreign* colour landing on its start, so the
// green/orange slides — owned by absent players — fire for both live colours.
export const SLIDES = {
  a: [{ start: 9, length: 4 }, { start: 34, length: 5 }],
  b: [{ start: 39, length: 4 }, { start: 4, length: 5 }],
  green: [{ start: 19, length: 5 }, { start: 24, length: 4 }],
  orange: [{ start: 49, length: 5 }, { start: 54, length: 4 }],
};

// Ordered list of physical square ids a pawn of `side` traverses, from the
// square it lands on leaving Start, clockwise to and including safetyEntry,
// then its 5 safety squares, then home.
export function path(side) {
  const exit = START_EXIT[side];
  const entry = SAFETY_ENTRY[side];
  const out = [];
  let i = exit;
  // walk clockwise until we have just appended safetyEntry
  while (true) {
    out.push(i);
    if (i === entry) break;
    i = (i + 1) % TRACK_LEN;
  }
  for (let k = 0; k < 5; k++) out.push(`${side}-safe-${k}`);
  out.push(`${side}-home`);
  return out;
}
