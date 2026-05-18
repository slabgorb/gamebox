// plugins/risk/client/themes.js
export const SIDE_LABEL = { 0: 'Red', 1: 'Blue', null: 'Neutral' };
export function sideClass(owner) { return owner === 0 ? 'p0' : owner === 1 ? 'p1' : ''; }
