// Presentation source-of-truth: every engine card id → its portrait art.
// Pure data (no JSX) so test/clue-card-art-drift.test.js can import it under
// node --test — the board-geometry.js mirror pattern. This is the ONLY place
// the suspect card-id → persona-portrait-filename mismatch is resolved. All 21
// portraits are authored; each `glyph` is a defensive load-failure fallback.

/**
 * @typedef {Object} CardArt
 * @property {string|null} file  portrait basename under /shared/portraits, or null => glyph-only
 * @property {string} label      display name
 * @property {string} glyph      emoji/char fallback when the image is missing or fails to load
 * @property {"suspect"|"weapon"|"room"} category
 */

/** @type {Record<string, CardArt>} */
export const CARD_ART = {
  // Suspects — card id differs from the persona portrait filename.
  scarlett: { file: 'miss-scarlett',   label: 'Miss Scarlett',   glyph: '🔴', category: 'suspect' },
  mustard:  { file: 'colonel-mustard', label: 'Colonel Mustard', glyph: '🟡', category: 'suspect' },
  white:    { file: 'mrs-white',       label: 'Mrs. White',      glyph: '⚪', category: 'suspect' },
  green:    { file: 'mr-green',        label: 'Mr. Green',       glyph: '🟢', category: 'suspect' },
  peacock:  { file: 'mrs-peacock',     label: 'Mrs. Peacock',    glyph: '🔵', category: 'suspect' },
  plum:     { file: 'professor-plum',  label: 'Professor Plum',  glyph: '🟣', category: 'suspect' },
  // Weapons — filename equals id (all six portraits authored).
  candlestick: { file: 'candlestick', label: 'Candlestick', glyph: '🕯️', category: 'weapon' },
  knife:       { file: 'knife',       label: 'Knife',       glyph: '🔪', category: 'weapon' },
  leadpipe:    { file: 'leadpipe',    label: 'Lead Pipe',   glyph: '🩹', category: 'weapon' },
  revolver:    { file: 'revolver',    label: 'Revolver',    glyph: '🔫', category: 'weapon' },
  rope:        { file: 'rope',        label: 'Rope',        glyph: '🪢', category: 'weapon' },
  wrench:      { file: 'wrench',      label: 'Wrench',      glyph: '🔧', category: 'weapon' },
  // Rooms — filename equals id (portraits renamed to match earlier).
  kitchen:      { file: 'kitchen',      label: 'Kitchen',       glyph: '🍽️', category: 'room' },
  ballroom:     { file: 'ballroom',     label: 'Ballroom',      glyph: '💃', category: 'room' },
  conservatory: { file: 'conservatory', label: 'Conservatory',  glyph: '🪴', category: 'room' },
  diningroom:   { file: 'diningroom',   label: 'Dining Room',   glyph: '🍴', category: 'room' },
  billiardroom: { file: 'billiardroom', label: 'Billiard Room', glyph: '🎱', category: 'room' },
  library:      { file: 'library',      label: 'Library',       glyph: '📚', category: 'room' },
  lounge:       { file: 'lounge',       label: 'Lounge',        glyph: '🛋️', category: 'room' },
  hall:         { file: 'hall',         label: 'Hall',          glyph: '🏛️', category: 'room' },
  study:        { file: 'study',        label: 'Study',         glyph: '🗝️', category: 'room' },
};
