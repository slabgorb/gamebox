// Offline render harness (Risk map pattern). Composes the board geometry into a
// standalone SVG and (via CLI) shells to rsvg-convert to produce a PNG to eyeball
// for OVERLAPS. Room polygons must be clean non-overlapping (enforced
// programmatically in test/clue-geometry.test.js); door squares must sit on the
// corridor grid adjacent to their room.
//
//   node plugins/clue/tools/render-board.mjs   # writes docs/clue-board.{svg,png}
import { BOARD, START_SQUARES } from '../server/geometry.js';

const CELL = 10; // px per grid square
const ROOM_FILLS = [
  '#e6194B', '#3cb44b', '#4363d8', '#f58231', '#911eb4',
  '#42d4f4', '#f032e6', '#bfef45', '#469990',
];

export function buildBoardSvg(geo = BOARD, starts = START_SQUARES) {
  const W = geo.cols * CELL;
  const H = geo.rows * CELL;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`,
    `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
  ];

  // Grid lines.
  for (let c = 0; c <= geo.cols; c++) {
    parts.push(`<line x1="${c * CELL}" y1="0" x2="${c * CELL}" y2="${H}" stroke="#eeeeee"/>`);
  }
  for (let r = 0; r <= geo.rows; r++) {
    parts.push(`<line x1="0" y1="${r * CELL}" x2="${W}" y2="${r * CELL}" stroke="#eeeeee"/>`);
  }

  // Cellar shading (non-playable centre).
  for (const k of geo.cellarCells) {
    const [c, r] = k.split(',').map(Number);
    parts.push(`<rect x="${c * CELL}" y="${r * CELL}" width="${CELL}" height="${CELL}" fill="#000000" fill-opacity="0.25"/>`);
  }

  // Room polygons — translucent so any overlap renders as a blended patch.
  Object.entries(geo.rooms).forEach(([id, def], i) => {
    const pts = def.poly.map(([x, y]) => `${x * CELL},${y * CELL}`).join(' ');
    parts.push(`<polygon data-room="${id}" points="${pts}" fill="${ROOM_FILLS[i % ROOM_FILLS.length]}" fill-opacity="0.45" stroke="#333333"/>`);
    if (def.label) {
      parts.push(`<text x="${def.label[0] * CELL}" y="${def.label[1] * CELL}" font-size="7" fill="#111111">${id}</text>`);
    }
  });

  // Door thresholds (red squares).
  for (const d of geo.doors) {
    parts.push(`<rect data-door="${d.room}" x="${d.square[0] * CELL + 2}" y="${d.square[1] * CELL + 2}" width="${CELL - 4}" height="${CELL - 4}" fill="#cc0000"/>`);
  }

  // Start squares (blue rings).
  for (const [suspect, [c, r]] of Object.entries(starts)) {
    parts.push(`<circle data-start="${suspect}" cx="${c * CELL + CELL / 2}" cy="${r * CELL + CELL / 2}" r="${CELL / 2 - 1}" fill="none" stroke="#0000cc" stroke-width="1.5"/>`);
  }

  parts.push('</svg>');
  return parts.join('\n');
}

// CLI: write SVG + shell to rsvg-convert. Guarded so importing this module in
// tests never touches the filesystem or spawns a process.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const { writeFileSync } = await import('node:fs');
  const { execFileSync } = await import('node:child_process');
  const svg = buildBoardSvg();
  writeFileSync('docs/clue-board.svg', svg);
  try {
    execFileSync('rsvg-convert', ['docs/clue-board.svg', '-o', 'docs/clue-board.png']);
    console.log('wrote docs/clue-board.svg and docs/clue-board.png');
  } catch (err) {
    console.error('wrote docs/clue-board.svg; rsvg-convert failed:', err.message);
  }
}
