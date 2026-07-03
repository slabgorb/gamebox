// Presentation art for the board (parallel to card-art.js). Pure data so it can
// be imported under vitest/node. board-geometry.js stays geometry-only (it is
// drift-guarded against the server); this file holds board *skin* constants
// ported from the Claude Design handoff (2026-07-03).

/**
 * Suspect id -> checker token colour file, served as
 * plugins/clue/client/assets/checker-{colour}.png.
 * @type {Record<string, string>}
 */
export const SUSPECT_CHECKER = {
  scarlett: "red",
  mustard: "orange",
  white: "white",
  green: "green",
  peacock: "blue",
  plum: "pink",
};

/**
 * @typedef {Object} WeaponIcon
 * @property {string} icon  SVG path, drawn centered in a 24px brass medallion
 * @property {number} sw    stroke-width
 */
/** @type {Record<string, WeaponIcon>} */
export const WEAPON_ICONS = {
  candlestick: { sw: 1.5, icon: "M0 -7 V4 M-3.6 4 H3.6 M-1.3 4 V6.6 H1.3 V4 M0 -7 c2.4 -1.8 1 -4.6 -1.4 -5.4" },
  knife:       { sw: 1.5, icon: "M-6 6 L1.5 -1.5 M-6 6 L-4.2 6.6 L2 0.4 M2 0.4 L6.6 -4.2 L5 -5.8 L0.4 -1.4 Z" },
  leadpipe:    { sw: 2.8, icon: "M-6 5 L4 -5 M4 -5 q2.4 -1 3 1.4" },
  revolver:    { sw: 1.5, icon: "M-7 -2 H2 V-4 H6 V-1 H2 V0 L-0.5 0 L-2.5 5 V0 H-6 Z" },
  rope:        { sw: 1.5, icon: "M-1.5 -4 a4.4 4.4 0 1 0 0.1 0 M2.6 0.6 q3.6 3 5 6.6" },
  wrench:      { sw: 1.5, icon: "M-6 -6 a3.4 3.4 0 1 0 3 4.2 L4.4 4.6 M2.8 6.6 a3 3 0 1 0 1.4 -3.6" },
};
