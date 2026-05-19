// src/clients/risk/map-geometry.js
// Client-side mirror of the Risk map, rendered on the parchment world
// engraving in plugins/risk/client/assets/risk-map.jpg. The base image
// already has inked territory borders, placenames, continent banners,
// and an "ARMIES OF RISK" legend strip; the SVG overlay only draws
// owner tints, army tokens, sea-route arcs, the active march arrow,
// and the held-status overlay on each continent legend strip.
//
// Coordinates are in image pixel space (1600 × 800). Each territory
// carries a `label` point (token anchor + click center), a hit radius
// `r`, its continent, and its neighbors. The graph is drift-guarded
// against plugins/risk/server/map.js by test/risk-map-geometry.test.js.

export const MAP_IMAGE = 'assets/risk-map.jpg';
export const MAP_SIZE = { w: 1600, h: 800 };

// Continent display metadata. Colors mirror the printed legend strips
// on the base map so the overlay rectangles paint over them in the same
// hue when fully held.
export const CONTINENTS_META = {
  namerica:  { name: 'North America', bonus: 5, color: '#a87838' },
  samerica:  { name: 'South America', bonus: 2, color: '#c8674a' },
  europe:    { name: 'Europe',        bonus: 5, color: '#8a6ea8' },
  africa:    { name: 'Africa',        bonus: 3, color: '#996644' },
  asia:      { name: 'Asia',          bonus: 7, color: '#a5a754' },
  australia: { name: 'Australia',     bonus: 2, color: '#c25c7a' },
};

export const CONTINENT_BONUS = Object.fromEntries(
  Object.entries(CONTINENTS_META).map(([k, c]) => [k, c.bonus]),
);

export const TERRITORIES = {
  // ===== NORTH AMERICA (9, +5) =====
  alaska:        { name: 'Alaska',                continent: 'namerica', label: { x: 220,  y: 215 }, r: 56, neighbors: ['nwt', 'alberta', 'kamchatka'] },
  nwt:           { name: 'Northwest Territory',   continent: 'namerica', label: { x: 360,  y: 220 }, r: 64, neighbors: ['alaska', 'alberta', 'ontario', 'greenland'] },
  greenland:     { name: 'Greenland',             continent: 'namerica', label: { x: 590,  y: 130 }, r: 70, neighbors: ['nwt', 'ontario', 'quebec', 'iceland'] },
  alberta:       { name: 'Alberta',               continent: 'namerica', label: { x: 355,  y: 295 }, r: 42, neighbors: ['alaska', 'nwt', 'ontario', 'western_us'] },
  ontario:       { name: 'Ontario',               continent: 'namerica', label: { x: 430,  y: 295 }, r: 42, neighbors: ['nwt', 'alberta', 'greenland', 'quebec', 'western_us', 'eastern_us'] },
  quebec:        { name: 'Quebec',                continent: 'namerica', label: { x: 510,  y: 290 }, r: 42, neighbors: ['greenland', 'ontario', 'eastern_us'] },
  western_us:    { name: 'Western United States', continent: 'namerica', label: { x: 355,  y: 355 }, r: 46, neighbors: ['alberta', 'ontario', 'eastern_us', 'cent_am'] },
  eastern_us:    { name: 'Eastern United States', continent: 'namerica', label: { x: 460,  y: 370 }, r: 50, neighbors: ['western_us', 'ontario', 'quebec', 'cent_am'] },
  cent_am:       { name: 'Central America',       continent: 'namerica', label: { x: 375,  y: 425 }, r: 38, neighbors: ['western_us', 'eastern_us', 'venezuela'] },

  // ===== SOUTH AMERICA (4, +2) =====
  venezuela:     { name: 'Venezuela', continent: 'samerica', label: { x: 500, y: 520 }, r: 44, neighbors: ['cent_am', 'brazil', 'peru'] },
  brazil:        { name: 'Brazil',    continent: 'samerica', label: { x: 575, y: 580 }, r: 56, neighbors: ['venezuela', 'peru', 'argentina', 'north_africa'] },
  peru:          { name: 'Peru',      continent: 'samerica', label: { x: 520, y: 625 }, r: 46, neighbors: ['venezuela', 'brazil', 'argentina'] },
  argentina:     { name: 'Argentina', continent: 'samerica', label: { x: 530, y: 710 }, r: 48, neighbors: ['peru', 'brazil'] },

  // ===== EUROPE (7, +5) =====
  iceland:         { name: 'Iceland',         continent: 'europe', label: { x: 693, y: 214 }, r: 30, neighbors: ['greenland', 'scandinavia', 'great_britain'] },
  scandinavia:     { name: 'Scandinavia',     continent: 'europe', label: { x: 834, y: 219 }, r: 48, neighbors: ['iceland', 'great_britain', 'northern_europe', 'ukraine'] },
  great_britain:   { name: 'Great Britain',   continent: 'europe', label: { x: 752, y: 285 }, r: 36, neighbors: ['iceland', 'scandinavia', 'northern_europe', 'western_europe'] },
  northern_europe: { name: 'Northern Europe', continent: 'europe', label: { x: 815, y: 285 }, r: 36, neighbors: ['great_britain', 'scandinavia', 'ukraine', 'southern_europe', 'western_europe'] },
  western_europe:  { name: 'Western Europe',  continent: 'europe', label: { x: 770, y: 339 }, r: 38, neighbors: ['great_britain', 'northern_europe', 'southern_europe', 'north_africa'] },
  southern_europe: { name: 'Southern Europe', continent: 'europe', label: { x: 843, y: 364 }, r: 36, neighbors: ['western_europe', 'northern_europe', 'ukraine', 'egypt', 'north_africa', 'middle_east'] },
  ukraine:         { name: 'Ukraine',         continent: 'europe', label: { x: 910, y: 244 }, r: 58, neighbors: ['scandinavia', 'northern_europe', 'southern_europe', 'ural', 'afghanistan', 'middle_east'] },

  // ===== AFRICA (6, +3) =====
  north_africa: { name: 'North Africa', continent: 'africa', label: { x: 772, y: 456 }, r: 60, neighbors: ['brazil', 'western_europe', 'southern_europe', 'egypt', 'east_africa', 'congo'] },
  egypt:        { name: 'Egypt',        continent: 'africa', label: { x: 849, y: 434 }, r: 38, neighbors: ['southern_europe', 'middle_east', 'north_africa', 'east_africa'] },
  east_africa:  { name: 'East Africa',  continent: 'africa', label: { x: 903, y: 505 }, r: 46, neighbors: ['egypt', 'north_africa', 'middle_east', 'congo', 'south_africa', 'madagascar'] },
  congo:        { name: 'Congo',        continent: 'africa', label: { x: 839, y: 548 }, r: 38, neighbors: ['north_africa', 'east_africa', 'south_africa'] },
  south_africa: { name: 'South Africa', continent: 'africa', label: { x: 865, y: 624 }, r: 44, neighbors: ['congo', 'east_africa', 'madagascar'] },
  madagascar:   { name: 'Madagascar',   continent: 'africa', label: { x: 936, y: 601 }, r: 30, neighbors: ['east_africa', 'south_africa'] },

  // ===== ASIA (12, +7) =====
  ural:        { name: 'Ural',        continent: 'asia', label: { x: 1018, y: 227 }, r: 44, neighbors: ['ukraine', 'siberia', 'china', 'afghanistan'] },
  siberia:     { name: 'Siberia',     continent: 'asia', label: { x: 1124, y: 184 }, r: 50, neighbors: ['ural', 'yakutsk', 'irkutsk', 'mongolia', 'china'] },
  yakutsk:     { name: 'Yakutsk',     continent: 'asia', label: { x: 1251, y: 218 }, r: 42, neighbors: ['siberia', 'kamchatka', 'irkutsk'] },
  kamchatka:   { name: 'Kamchatka',   continent: 'asia', label: { x: 1337, y: 239 }, r: 54, neighbors: ['yakutsk', 'irkutsk', 'mongolia', 'japan', 'alaska'] },
  irkutsk:     { name: 'Irkutsk',     continent: 'asia', label: { x: 1216, y: 257 }, r: 40, neighbors: ['siberia', 'yakutsk', 'kamchatka', 'mongolia'] },
  mongolia:    { name: 'Mongolia',    continent: 'asia', label: { x: 1190, y: 350 }, r: 46, neighbors: ['siberia', 'irkutsk', 'kamchatka', 'japan', 'china'] },
  japan:       { name: 'Japan',       continent: 'asia', label: { x: 1305, y: 370 }, r: 32, neighbors: ['mongolia', 'kamchatka'] },
  afghanistan: { name: 'Afghanistan', continent: 'asia', label: { x: 1027, y: 360 }, r: 44, neighbors: ['ukraine', 'ural', 'china', 'india', 'middle_east'] },
  china:       { name: 'China',       continent: 'asia', label: { x: 1176, y: 415 }, r: 50, neighbors: ['mongolia', 'siberia', 'ural', 'afghanistan', 'india', 'siam'] },
  middle_east: { name: 'Middle East', continent: 'asia', label: { x: 933,  y: 427 }, r: 48, neighbors: ['southern_europe', 'ukraine', 'afghanistan', 'india', 'east_africa', 'egypt'] },
  india:       { name: 'India',       continent: 'asia', label: { x: 1058, y: 459 }, r: 44, neighbors: ['afghanistan', 'china', 'middle_east', 'siam'] },
  siam:        { name: 'Siam',        continent: 'asia', label: { x: 1146, y: 480 }, r: 38, neighbors: ['china', 'india', 'indonesia'] },

  // ===== AUSTRALIA (4, +2) =====
  indonesia:         { name: 'Indonesia',         continent: 'australia', label: { x: 1171, y: 540 }, r: 36, neighbors: ['siam', 'new_guinea', 'western_australia'] },
  new_guinea:        { name: 'New Guinea',        continent: 'australia', label: { x: 1370, y: 565 }, r: 36, neighbors: ['indonesia', 'western_australia', 'eastern_australia'] },
  western_australia: { name: 'Western Australia', continent: 'australia', label: { x: 1238, y: 630 }, r: 48, neighbors: ['indonesia', 'new_guinea', 'eastern_australia'] },
  eastern_australia: { name: 'Eastern Australia', continent: 'australia', label: { x: 1298, y: 640 }, r: 48, neighbors: ['western_australia', 'new_guinea'] },
};

// Continent legend overlays — flat colored strips drawn on top of the
// printed "ARMIES OF RISK" key in the lower-left of the map. The
// rectangles match the printed bar layout pixel-for-pixel so the
// overlay paints cleanly over them.
export const LEGEND_LAYOUT = {
  samerica:  { x: 56,  y: 632, w: 171, h: 22 },
  europe:    { x: 236, y: 632, w: 170, h: 22 },
  namerica:  { x: 56,  y: 655, w: 171, h: 22 },
  asia:      { x: 236, y: 655, w: 170, h: 22 },
  africa:    { x: 56,  y: 677, w: 171, h: 22 },
  australia: { x: 236, y: 677, w: 170, h: 22 },
};
