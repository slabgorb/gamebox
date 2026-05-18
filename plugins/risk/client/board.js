// plugins/risk/client/board.js
import { TERRITORIES } from './map-geometry.js';
import { sideClass } from './themes.js';

const SVG = 'http://www.w3.org/2000/svg';

// Renders the map as an SVG: a connector line per adjacency (inter-continent
// edges get the `strait` class), a region polygon per territory coloured by
// owner, and the army count at the territory's label anchor. Tapping a region
// calls onPick(id); `selected` rings one region.
export function renderBoard(root, view, { onPick, selected }) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 800 600');
  svg.setAttribute('class', 'risk-map');

  // Edges first so regions paint over the connector ends. Dedup with a<b.
  const drawn = new Set();
  for (const [id, g] of Object.entries(TERRITORIES)) {
    for (const n of g.neighbors) {
      const key = id < n ? `${id}|${n}` : `${n}|${id}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const a = TERRITORIES[id].label, b = TERRITORIES[n].label;
      const line = document.createElementNS(SVG, 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      const strait = TERRITORIES[id].continent !== TERRITORIES[n].continent;
      line.setAttribute('class', strait ? 'edge strait' : 'edge');
      svg.appendChild(line);
    }
  }

  for (const [id, g] of Object.entries(TERRITORIES)) {
    const t = view.territories[id];
    const region = document.createElementNS(SVG, 'path');
    region.setAttribute('d', g.path);
    region.setAttribute('class',
      `region ${sideClass(t.owner)}${selected === id ? ' sel' : ''}`);
    region.addEventListener('click', () => onPick(id));
    svg.appendChild(region);

    const label = document.createElementNS(SVG, 'text');
    label.setAttribute('x', g.label.x);
    label.setAttribute('y', g.label.y);
    label.setAttribute('class', 'region-label');
    label.setAttribute('text-anchor', 'middle');
    label.textContent = `${id} · ${t.armies}`;
    label.addEventListener('click', () => onPick(id));
    svg.appendChild(label);
  }

  root.appendChild(svg);
}
