// Classic Risk on the parchment world map: six continents, forty-two
// territories. Territory ids are semantic place names so AI prompts and
// logs read geographically. The client mirrors this graph in
// src/clients/risk/map-geometry.js, drift-guarded by
// test/risk-map-geometry.test.js.

export const CONTINENTS = {
  namerica:  { name: 'North America', bonus: 5, territories: [
    'alaska', 'nwt', 'greenland', 'alberta', 'ontario', 'quebec',
    'western_us', 'eastern_us', 'cent_am',
  ] },
  samerica:  { name: 'South America', bonus: 2, territories: [
    'venezuela', 'brazil', 'peru', 'argentina',
  ] },
  europe:    { name: 'Europe',        bonus: 5, territories: [
    'iceland', 'scandinavia', 'great_britain', 'northern_europe',
    'western_europe', 'southern_europe', 'ukraine',
  ] },
  africa:    { name: 'Africa',        bonus: 3, territories: [
    'north_africa', 'egypt', 'east_africa', 'congo', 'south_africa',
    'madagascar',
  ] },
  asia:      { name: 'Asia',          bonus: 7, territories: [
    'ural', 'siberia', 'yakutsk', 'kamchatka', 'irkutsk', 'mongolia',
    'japan', 'afghanistan', 'china', 'middle_east', 'india', 'siam',
  ] },
  australia: { name: 'Australia',     bonus: 2, territories: [
    'indonesia', 'new_guinea', 'western_australia', 'eastern_australia',
  ] },
};

const EDGES = [
  // North America (internal)
  ['alaska', 'nwt'], ['alaska', 'alberta'],
  ['nwt', 'alberta'], ['nwt', 'ontario'], ['nwt', 'greenland'],
  ['greenland', 'ontario'], ['greenland', 'quebec'],
  ['alberta', 'ontario'], ['alberta', 'western_us'],
  ['ontario', 'quebec'], ['ontario', 'western_us'], ['ontario', 'eastern_us'],
  ['quebec', 'eastern_us'],
  ['western_us', 'eastern_us'], ['western_us', 'cent_am'],
  ['eastern_us', 'cent_am'],

  // South America (internal)
  ['venezuela', 'brazil'], ['venezuela', 'peru'],
  ['brazil', 'peru'], ['brazil', 'argentina'],
  ['peru', 'argentina'],

  // Europe (internal)
  ['iceland', 'scandinavia'], ['iceland', 'great_britain'],
  ['scandinavia', 'great_britain'], ['scandinavia', 'northern_europe'],
  ['scandinavia', 'ukraine'],
  ['great_britain', 'northern_europe'], ['great_britain', 'western_europe'],
  ['northern_europe', 'western_europe'], ['northern_europe', 'southern_europe'],
  ['northern_europe', 'ukraine'],
  ['western_europe', 'southern_europe'],
  ['southern_europe', 'ukraine'], ['southern_europe', 'north_africa'],

  // Africa (internal)
  ['north_africa', 'egypt'], ['north_africa', 'east_africa'],
  ['north_africa', 'congo'],
  ['egypt', 'east_africa'], ['egypt', 'middle_east'],
  ['east_africa', 'congo'], ['east_africa', 'south_africa'],
  ['east_africa', 'madagascar'],
  ['congo', 'south_africa'],
  ['south_africa', 'madagascar'],

  // Asia (internal)
  ['ural', 'siberia'], ['ural', 'china'], ['ural', 'afghanistan'],
  ['siberia', 'yakutsk'], ['siberia', 'irkutsk'], ['siberia', 'mongolia'],
  ['siberia', 'china'],
  ['yakutsk', 'kamchatka'], ['yakutsk', 'irkutsk'],
  ['kamchatka', 'irkutsk'], ['kamchatka', 'mongolia'], ['kamchatka', 'japan'],
  ['irkutsk', 'mongolia'],
  ['mongolia', 'japan'], ['mongolia', 'china'],
  ['afghanistan', 'china'], ['afghanistan', 'india'], ['afghanistan', 'middle_east'],
  ['china', 'india'], ['china', 'siam'],
  ['middle_east', 'india'],
  ['india', 'siam'],

  // Australia (internal)
  ['indonesia', 'new_guinea'], ['indonesia', 'western_australia'],
  ['new_guinea', 'western_australia'], ['new_guinea', 'eastern_australia'],
  ['western_australia', 'eastern_australia'],

  // Cross-continent straits & land bridges (classic Risk)
  ['alaska', 'kamchatka'],            // NA ↔ Asia (Bering)
  ['greenland', 'iceland'],           // NA ↔ Europe
  ['cent_am', 'venezuela'],           // NA ↔ SA
  ['brazil', 'north_africa'],         // SA ↔ Africa
  ['western_europe', 'north_africa'], // Europe ↔ Africa
  ['southern_europe', 'egypt'],       // Europe ↔ Africa
  ['southern_europe', 'middle_east'], // Europe ↔ Asia
  ['ukraine', 'middle_east'],         // Europe ↔ Asia
  ['ukraine', 'afghanistan'],         // Europe ↔ Asia
  ['ukraine', 'ural'],                // Europe ↔ Asia
  ['east_africa', 'middle_east'],     // Africa ↔ Asia
  ['siam', 'indonesia'],              // Asia ↔ Australia
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
