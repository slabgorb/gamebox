// plugins/risk/client/map-geometry.js
// Client-side mirror of the Risk map, rendered on the antique "Chart of the
// World" engraving. The browser cannot import server/map.js (outside the
// served clientDir), so the graph is duplicated here and drift-guarded by
// test/risk-map-geometry.test.js. Coordinates are in the engraving's native
// pixel space (1499 x 1003); territory `poly` rings are hand-traced over it.
// Coastlines are already drawn by the engraving — only internal LAND_SEAMS
// are inked by the renderer.

export const MAP_IMAGE = 'assets/chart-of-the-world.png';
export const MAP_SIZE = { w: 1499, h: 1003 };

// Continent display metadata. `scroll` places the italic small-caps banner
// engraved into the sea/empty land. Keys match the engine continent keys.
export const CONTINENTS_META = {
  namerica:  { name: 'North America', bonus: 2, color: '#2e6e3a', scroll: { x: 290,  y: 200, size: 24, tracking: 8,  text: 'NORTH  AMERICA' } },
  eurasia:   { name: 'Eurasia',       bonus: 3, color: '#a13b2a', scroll: { x: 1180, y: 175, size: 28, tracking: 12, text: 'EURASIA'        } },
  africa:    { name: 'Africa',        bonus: 2, color: '#1f4e6e', scroll: { x: 880,  y: 900, size: 22, tracking: 10, text: 'AFRICA'         } },
  antipodes: { name: 'Antipodes',     bonus: 2, color: '#7a4218', scroll: { x: 1130, y: 920, size: 20, tracking: 8,  text: 'ANTIPODES'      } },
};

export const CONTINENT_BONUS = Object.fromEntries(
  Object.entries(CONTINENTS_META).map(([k, c]) => [k, c.bonus]),
);

// `path` is filled in below from `poly`.
export const TERRITORIES = {
  // ===== NORTH AMERICA (3, +2) =====
  northern_reach: {
    name: 'Northern Reach', continent: 'namerica',
    label: { x: 360, y: 230 },
    neighbors: ['atlantic_shore', 'cordillera', 'britannia'],
    poly: [
      [50, 230], [60, 145], [240, 138], [445, 132], [580, 115],
      [615, 175], [625, 235], [605, 290], [555, 300], [495, 300],
      [445, 320], [442, 380], [200, 380], [175, 345], [115, 330], [55, 295],
    ],
  },
  cordillera: {
    name: 'Cordillera', continent: 'namerica',
    label: { x: 280, y: 490 },
    neighbors: ['northern_reach', 'atlantic_shore', 'amazonia'],
    poly: [
      [55, 295], [115, 330], [175, 345], [200, 380],
      [340, 380], [340, 540],
      [380, 580], [425, 595],
      [400, 615], [320, 600], [200, 600], [125, 595], [55, 580],
    ],
  },
  atlantic_shore: {
    name: 'Atlantic Shore', continent: 'namerica',
    label: { x: 415, y: 460 },
    neighbors: ['northern_reach', 'cordillera', 'europa', 'amazonia'],
    poly: [
      [340, 380], [442, 380],
      [475, 410], [495, 460], [490, 510],
      [470, 540], [445, 565], [425, 595], [380, 580], [340, 540],
    ],
  },

  // ===== EURASIA (4, +3) =====
  britannia: {
    name: 'Britannia', continent: 'eurasia',
    label: { x: 778, y: 332 },
    neighbors: ['northern_reach', 'europa'],
    poly: [
      [740, 290], [760, 275], [800, 275], [820, 295],
      [822, 335], [810, 375], [780, 388], [752, 378], [738, 340],
    ],
  },
  europa: {
    name: 'Europa', continent: 'eurasia',
    label: { x: 1100, y: 270 },
    neighbors: ['britannia', 'atlantic_shore', 'persia', 'cathay', 'north_africa'],
    poly: [
      [830, 195], [880, 175], [955, 162], [1080, 158],
      [1300, 150], [1450, 155],
      [1450, 348], [1380, 360], [1280, 358], [1200, 355], [1100, 378],
      [1030, 410], [990, 438],
      [930, 448], [855, 452], [785, 442],
      [770, 405], [770, 378],
      [762, 350], [800, 290], [810, 235], [820, 200],
    ],
  },
  persia: {
    name: 'Persia', continent: 'eurasia',
    label: { x: 1075, y: 500 },
    neighbors: ['europa', 'cathay', 'north_africa', 'equatorial'],
    poly: [
      [990, 438], [1030, 410], [1100, 378],
      [1170, 410], [1195, 455], [1180, 500], [1170, 545],
      [1145, 580], [1090, 575], [1040, 558], [990, 530], [968, 478],
    ],
  },
  cathay: {
    name: 'Cathay', continent: 'eurasia',
    label: { x: 1290, y: 460 },
    neighbors: ['europa', 'persia', 'australia'],
    poly: [
      [1100, 378], [1200, 355], [1280, 358], [1380, 360], [1450, 348],
      [1450, 460], [1410, 490], [1395, 530], [1340, 580],
      [1250, 610], [1190, 590], [1180, 540], [1180, 500],
      [1195, 455], [1170, 410],
    ],
  },

  // ===== AFRICA (3, +2) =====
  north_africa: {
    name: 'North Africa', continent: 'africa',
    label: { x: 870, y: 525 },
    neighbors: ['europa', 'persia', 'equatorial', 'amazonia'],
    poly: [
      [770, 458], [785, 442], [855, 452], [930, 448], [990, 438], [968, 478],
      [990, 530], [1010, 555], [980, 580],
      [920, 615], [855, 625],
      [820, 620], [790, 595], [768, 558], [762, 510],
    ],
  },
  equatorial: {
    name: 'Equatorial', continent: 'africa',
    label: { x: 905, y: 680 },
    neighbors: ['north_africa', 'persia', 'cape'],
    poly: [
      [820, 620], [855, 625], [920, 615], [980, 580], [1010, 555],
      [1015, 605], [1010, 660], [998, 700],
      [970, 720], [945, 740], [905, 745],
      [855, 735], [822, 705], [808, 670], [815, 640],
    ],
  },
  cape: {
    name: 'Cape', continent: 'africa',
    label: { x: 935, y: 800 },
    neighbors: ['equatorial'],
    poly: [
      [855, 735], [905, 745], [945, 740], [970, 720], [998, 700],
      [1005, 760], [1000, 815], [970, 850],
      [930, 862], [895, 850],
      [870, 815], [870, 780], [858, 760],
    ],
  },

  // ===== ANTIPODES — South America + Australia (3, +2) =====
  amazonia: {
    name: 'Amazonia', continent: 'antipodes',
    label: { x: 530, y: 660 },
    neighbors: ['cordillera', 'atlantic_shore', 'patagonia', 'north_africa'],
    poly: [
      [430, 580], [475, 555], [530, 575], [575, 605], [615, 650],
      [625, 700], [605, 740],
      [555, 760], [510, 760], [480, 745],
      [455, 710], [438, 670], [428, 625],
    ],
  },
  patagonia: {
    name: 'Patagonia', continent: 'antipodes',
    label: { x: 525, y: 830 },
    neighbors: ['amazonia', 'australia'],
    poly: [
      [480, 745], [510, 760], [555, 760], [605, 740],
      [585, 800], [560, 855],
      [525, 895], [488, 905], [460, 880],
      [453, 830], [462, 790],
    ],
  },
  australia: {
    name: 'Australia', continent: 'antipodes',
    label: { x: 1310, y: 740 },
    neighbors: ['cathay', 'patagonia'],
    poly: [
      [1180, 645], [1240, 615], [1330, 625], [1410, 660], [1432, 705],
      [1432, 795], [1395, 830],
      [1340, 845], [1280, 848], [1230, 825],
      [1200, 790], [1180, 740], [1175, 690],
    ],
  },
};

// Build a straight-segment closed polygon path. Sharp inked corners read like
// antique territory borders; smoothing would make the boundary feel unstable.
export function polyPath(points) {
  if (!points || points.length < 3) return '';
  let d = `M ${points[0][0].toFixed(1)} ${points[0][1].toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    d += ` L ${points[i][0].toFixed(1)} ${points[i][1].toFixed(1)}`;
  }
  return `${d} Z`;
}

for (const g of Object.values(TERRITORIES)) g.path = polyPath(g.poly);

// Italic ocean annotations — engraved over empty water.
export const SEA_LABELS = [
  { x: 670,  y: 470, text: 'Mare Atlanticum',  size: 18, tracking: 0.16, rot: 0  },
  { x: 1465, y: 530, text: 'Mare ad Orientis', size: 16, tracking: 0.18, rot: 90 },
];

// Internal LAND seams between sibling territories. These are the only
// boundaries we ink — coastlines are already drawn by the engraving itself.
// Each seam is rendered once and lit up when either side is selected.
export const LAND_SEAMS = [
  // North America
  { between: ['northern_reach', 'cordillera'],     path: [[200, 380], [270, 382], [340, 380]] },
  { between: ['northern_reach', 'atlantic_shore'], path: [[340, 380], [395, 382], [442, 380]] },
  { between: ['cordillera', 'atlantic_shore'],     path: [[340, 380], [340, 440], [345, 490]] },
  // Eurasia
  { between: ['europa', 'cathay'],   path: [[1450, 348], [1380, 360], [1280, 358], [1200, 355], [1100, 378]] },
  { between: ['europa', 'persia'],   path: [[1100, 378], [1030, 410], [990, 438]] },
  { between: ['persia', 'cathay'],   path: [[1100, 378], [1170, 410], [1195, 455], [1180, 500], [1170, 545]] },
  { between: ['persia', 'north_africa'], path: [[990, 438], [968, 478], [990, 530]] },
  // Africa
  { between: ['north_africa', 'equatorial'], path: [[1010, 555], [980, 580], [920, 615], [855, 625], [820, 620]] },
  { between: ['equatorial', 'cape'],         path: [[998, 700], [970, 720], [945, 740], [905, 745], [855, 735]] },
  // Antipodes
  { between: ['amazonia', 'patagonia'], path: [[480, 745], [510, 760], [555, 760], [605, 740]] },
];
