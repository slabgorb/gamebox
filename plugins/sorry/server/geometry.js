export const TRACK_LEN = 60;
// Canonical-board offsets from each colour's edge corner (the 0-square of that
// edge, measured clockwise): slide 1 begins at +1 and ends at +4; the safety
// mouth attaches at +2; the diamond (a forced-divert barrier) sits at +3; the
// start-circle exit-square is +4; slide 2 spans +9 to +14.
export const START_EXIT = { a: 4, b: 34 };
export const SAFETY_ENTRY = { a: 2, b: 32 };
// Diamond square — own-colour pawns may not cross it clockwise (forces the
// safety-mouth divert at +2). Counter-clockwise (backward) crossing is legal,
// which is the canonical "two back-1 cards land you on the safety mouth" play.
// Listed for all four edges so the client can draw the marker on every seat.
export const DIAMOND = { a: 3, b: 33, green: 18, orange: 48 };
// Two slides per edge, all 4 edges rotationally symmetric in +15 steps. Slide 1
// (length 3) starts at corner+1 and lands a slider on the colour's own start
// square — bumping anyone caught in the dead zone or just out of start. Slide 2
// (length 5) starts at corner+9. A slide fires for any pawn of a *foreign*
// colour landing on its start, so the green/orange edges — owned by the absent
// seats — fire for both live colours.
export const SLIDES = {
  a:      [{ start: 1,  length: 3 }, { start: 9,  length: 5 }],
  b:      [{ start: 31, length: 3 }, { start: 39, length: 5 }],
  green:  [{ start: 16, length: 3 }, { start: 24, length: 5 }],
  orange: [{ start: 46, length: 3 }, { start: 54, length: 5 }],
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
