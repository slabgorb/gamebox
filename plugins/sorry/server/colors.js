// The four Sorry! checker colours, shared between the create route (validation +
// contrast assignment) and the engine's initial state. The client maps these
// names to concrete palettes/checker art (src/clients/sorry).
export const SORRY_COLORS = ['red', 'blue', 'green', 'orange'];

// A player's opponent takes the contrasting colour of the pair. Red↔blue is the
// classic Sorry! pairing; green↔orange the second pair.
export const CONTRAST = { red: 'blue', blue: 'red', green: 'orange', orange: 'green' };

export function isSorryColor(c) {
  return typeof c === 'string' && SORRY_COLORS.includes(c);
}
