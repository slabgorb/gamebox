// Resolved at runtime via Vite externals (see vite.config.client.js).
// Single source of truth for card asset URLs across cycles 2/3/5/6.
// @ts-expect-error external module resolved at runtime by Vite/Rollup
export { cardImageUrl, backImageUrl } from "/shared/cards/card-element.js";
