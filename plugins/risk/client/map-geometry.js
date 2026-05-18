// plugins/risk/client/map-geometry.js
// Single client-side source of Risk map structure. The browser cannot import
// server/map.js (outside the served clientDir), so structure is duplicated
// here and drift-guarded by test/risk-map-geometry.test.js.
// Coordinate space: SVG viewBox "0 0 800 600". Four continents in a ring
// around a central sea; every adjacency is drawn as a connector line,
// inter-continent ones styled as straits.

export const CONTINENT_BONUS = { norland: 2, ostmark: 3, sudreach: 2, westfen: 2 };

export const TERRITORIES = {
  // NORLAND — top-left
  N1: { continent: 'norland',  neighbors: ['N2', 'N3', 'W3'], label: { x: 140, y: 105 }, path: 'M40,50 L210,40 L240,150 L70,180 Z' },
  N2: { continent: 'norland',  neighbors: ['N1', 'N3'],       label: { x: 290, y: 105 }, path: 'M210,40 L360,60 L350,170 L240,150 Z' },
  N3: { continent: 'norland',  neighbors: ['N1', 'N2', 'E1'], label: { x: 210, y: 225 }, path: 'M70,180 L240,150 L350,170 L330,290 L100,300 Z' },
  // OSTMARK — top-right (ring E1-E2-E3-E4-E1)
  E1: { continent: 'ostmark',  neighbors: ['E2', 'E4', 'N3'], label: { x: 555, y: 100 }, path: 'M470,50 L620,40 L640,150 L490,170 Z' },
  E2: { continent: 'ostmark',  neighbors: ['E1', 'E3', 'W2'], label: { x: 560, y: 225 }, path: 'M490,170 L640,150 L630,280 L480,300 Z' },
  E3: { continent: 'ostmark',  neighbors: ['E2', 'E4'],       label: { x: 695, y: 330 }, path: 'M630,280 L770,260 L760,390 L620,400 Z' },
  E4: { continent: 'ostmark',  neighbors: ['E3', 'E1', 'S1'], label: { x: 710, y: 205 }, path: 'M640,150 L780,130 L770,260 L630,280 Z' },
  // SUDREACH — bottom-right (path S1-S2-S3)
  S1: { continent: 'sudreach', neighbors: ['S2', 'E4'],       label: { x: 680, y: 480 }, path: 'M610,420 L760,410 L750,540 L600,550 Z' },
  S2: { continent: 'sudreach', neighbors: ['S1', 'S3'],       label: { x: 520, y: 500 }, path: 'M450,440 L600,430 L590,560 L440,570 Z' },
  S3: { continent: 'sudreach', neighbors: ['S2', 'W1'],       label: { x: 370, y: 510 }, path: 'M300,450 L450,440 L440,570 L290,580 Z' },
  // WESTFEN — bottom-left (triangle W1-W2-W3)
  W1: { continent: 'westfen',  neighbors: ['W2', 'W3', 'S3'], label: { x: 190, y: 500 }, path: 'M120,440 L270,430 L260,560 L110,570 Z' },
  W2: { continent: 'westfen',  neighbors: ['W1', 'W3', 'E2'], label: { x: 195, y: 365 }, path: 'M120,300 L270,290 L270,430 L120,440 Z' },
  W3: { continent: 'westfen',  neighbors: ['W1', 'W2', 'N1'], label: { x: 75,  y: 375 }, path: 'M30,300 L120,300 L120,440 L40,450 Z' },
};
