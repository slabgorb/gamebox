// Risk on the antique "Chart of the World" engraving: four continents,
// thirteen territories. Territory ids are semantic place names so the AI
// prompts and logs read geographically. The client mirrors this graph in
// client/map-geometry.js, drift-guarded by test/risk-map-geometry.test.js.

export const CONTINENTS = {
  namerica:  { name: 'North America', bonus: 2, territories: ['northern_reach', 'cordillera', 'atlantic_shore'] },
  eurasia:   { name: 'Eurasia',       bonus: 3, territories: ['britannia', 'europa', 'persia', 'cathay'] },
  africa:    { name: 'Africa',        bonus: 2, territories: ['north_africa', 'equatorial', 'cape'] },
  antipodes: { name: 'Antipodes',     bonus: 2, territories: ['amazonia', 'patagonia', 'australia'] },
};

const EDGES = [
  // North America (internal)
  ['northern_reach', 'cordillera'], ['northern_reach', 'atlantic_shore'], ['cordillera', 'atlantic_shore'],
  // Eurasia (internal — Europa is the hub)
  ['britannia', 'europa'], ['europa', 'persia'], ['europa', 'cathay'], ['persia', 'cathay'],
  // Africa (internal)
  ['north_africa', 'equatorial'], ['equatorial', 'cape'],
  // Antipodes (internal — South America to Australia chain)
  ['amazonia', 'patagonia'], ['patagonia', 'australia'],
  // Cross-continent straits & land bridges
  ['northern_reach', 'britannia'], ['atlantic_shore', 'europa'],
  ['cordillera', 'amazonia'], ['atlantic_shore', 'amazonia'],
  ['europa', 'north_africa'], ['persia', 'north_africa'], ['persia', 'equatorial'],
  ['north_africa', 'amazonia'], ['cathay', 'australia'],
];

const ADJ = (() => {
  const m = {};
  for (const c of Object.values(CONTINENTS)) {
    for (const t of c.territories) m[t] = [];
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
