export const CONTINENTS = {
  norland:  { name: 'Norland',  bonus: 2, territories: ['N1', 'N2', 'N3'] },
  ostmark:  { name: 'Ostmark',  bonus: 3, territories: ['E1', 'E2', 'E3', 'E4'] },
  sudreach: { name: 'Sudreach', bonus: 2, territories: ['S1', 'S2', 'S3'] },
  westfen:  { name: 'Westfen',  bonus: 2, territories: ['W1', 'W2', 'W3'] },
};

const EDGES = [
  ['N1', 'N2'], ['N2', 'N3'], ['N1', 'N3'],
  ['E1', 'E2'], ['E2', 'E3'], ['E3', 'E4'], ['E1', 'E4'],
  ['S1', 'S2'], ['S2', 'S3'],
  ['W1', 'W2'], ['W2', 'W3'], ['W1', 'W3'],
  ['N3', 'E1'], ['E4', 'S1'], ['S3', 'W1'], ['W3', 'N1'], ['E2', 'W2'],
];

const ADJ = (() => {
  const m = {};
  for (const t of [...CONTINENTS.norland.territories, ...CONTINENTS.ostmark.territories,
    ...CONTINENTS.sudreach.territories, ...CONTINENTS.westfen.territories]) {
    m[t] = [];
  }
  for (const [a, b] of EDGES) { m[a].push(b); m[b].push(a); }
  return m;
})();

export function allTerritories() { return Object.keys(ADJ); }
export function neighborsOf(id) { return ADJ[id] ? [...ADJ[id]] : []; }
export function areAdjacent(a, b) { return !!ADJ[a] && ADJ[a].includes(b); }

export function continentOf(id) {
  for (const [key, c] of Object.entries(CONTINENTS)) {
    if (c.territories.includes(id)) return key;
  }
  return null;
}
export function continentBonus(key) { return CONTINENTS[key]?.bonus ?? 0; }
export function continentTerritories(key) {
  return CONTINENTS[key] ? [...CONTINENTS[key].territories] : [];
}
