// plugins/risk/client/board.js
// Antique campaign-map renderer. Tiles fit jigsaw-style: adjacent
// same-continent territories share a wobbled coastline (see map-paths.js);
// inter-continent neighbours connect via dashed sea routes. Built as an SVG
// string for one cheap re-render per update, then click handlers are bound.
//
// Contract (unchanged, app.js depends on it):
//   renderBoard(root, view, { onPick, selected, plan })
// `selected` is a single territory id (pending.from ?? pending.deployTarget);
// `plan` is the in-progress deploy map { id: armies } — its "+k" overlay is
// preserved from the multi-territory deploy feature. The from→to march arrow
// from the design needs pending.to, which app.js does not pass, so neighbour
// arcs carry the "lines of attack" intent instead.
import {
  TERRITORIES, VERTICES, CONTINENTS_META, COAST_JITTER,
  LANDMARKS, SEA_LABELS,
} from './map-geometry.js';
import { buildEdgeCache, territoryPath, sharedBorderPath, continentOuterPath } from './map-paths.js';

const OWNER_FILL = { 0: '#b04030', 1: '#2a5d80' };

const DEFS = `
<defs>
  <pattern id="r-sea-hatch" width="14" height="14" patternUnits="userSpaceOnUse" patternTransform="rotate(8)">
    <rect width="14" height="14" fill="#cfddd2"/>
    <path d="M 0 4 H 14 M 0 10 H 14" stroke="#7e9c8e" stroke-width="0.4" opacity="0.55"/>
    <path d="M 0 7 H 14" stroke="#4d6c5e" stroke-width="0.4" opacity="0.65"/>
  </pattern>
  <pattern id="r-sea-waves" width="42" height="32" patternUnits="userSpaceOnUse">
    <path d="M 4 10 q 5 -5 10 0 t 10 0 t 10 0" fill="none" stroke="#4d6c5e" stroke-width="0.6" opacity="0.55" stroke-linecap="round"/>
    <path d="M 8 24 q 5 -5 10 0 t 10 0" fill="none" stroke="#355769" stroke-width="0.5" opacity="0.45" stroke-linecap="round"/>
  </pattern>
  <pattern id="r-t-mountain" width="22" height="22" patternUnits="userSpaceOnUse">
    <path d="M 4 16 l 5 -8 l 5 8 z" fill="none" stroke="#5a3a1f" stroke-width="0.8" opacity="0.75"/>
    <path d="M 12 14 l 4 -6 l 4 6" fill="none" stroke="#5a3a1f" stroke-width="0.7" opacity="0.55"/>
  </pattern>
  <pattern id="r-t-forest" width="18" height="18" patternUnits="userSpaceOnUse">
    <circle cx="4" cy="8" r="1.4" fill="#3a2810" opacity="0.55"/>
    <circle cx="11" cy="14" r="1.4" fill="#3a2810" opacity="0.55"/>
    <circle cx="14" cy="5" r="1.2" fill="#3a2810" opacity="0.5"/>
  </pattern>
  <pattern id="r-t-marsh" width="16" height="14" patternUnits="userSpaceOnUse">
    <path d="M 2 5 h 5 M 9 11 h 5 M 4 11 h 3" stroke="#5a3a1f" stroke-width="0.6" opacity="0.5"/>
  </pattern>
  <pattern id="r-t-plain" width="20" height="20" patternUnits="userSpaceOnUse">
    <circle cx="6" cy="8" r="0.6" fill="#5a3a1f" opacity="0.35"/>
    <circle cx="14" cy="14" r="0.6" fill="#5a3a1f" opacity="0.35"/>
  </pattern>
  <radialGradient id="r-vignette" cx="50%" cy="50%" r="70%">
    <stop offset="0%" stop-color="#fff0c0" stop-opacity="0"/>
    <stop offset="65%" stop-color="#a86a2a" stop-opacity="0"/>
    <stop offset="100%" stop-color="#5a3010" stop-opacity="0.55"/>
  </radialGradient>
  <filter id="r-land-shadow" x="-10%" y="-10%" width="120%" height="120%">
    <feGaussianBlur in="SourceAlpha" stdDeviation="2.5"/>
    <feOffset dx="2" dy="3"/>
    <feComponentTransfer><feFuncA type="linear" slope="0.35"/></feComponentTransfer>
    <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
  </filter>
</defs>`;

const COMPASS = (() => {
  const x = 420, y = 350, r = 36;
  let spikes = '';
  for (const a of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const rad = (a * Math.PI) / 180;
    const long = a % 90 === 0 ? r - 6 : r * 0.55;
    const x2 = (Math.sin(rad) * long).toFixed(1), y2 = (-Math.cos(rad) * long).toFixed(1);
    const lx = (Math.sin(rad + Math.PI / 12) * long * 0.32).toFixed(1);
    const ly = (-Math.cos(rad + Math.PI / 12) * long * 0.32).toFixed(1);
    const rx = (Math.sin(rad - Math.PI / 12) * long * 0.32).toFixed(1);
    const ry = (-Math.cos(rad - Math.PI / 12) * long * 0.32).toFixed(1);
    spikes += `<path d="M 0 0 L ${lx} ${ly} L ${x2} ${y2} L ${rx} ${ry} Z" fill="${a % 90 === 0 ? '#5a3a1f' : '#a98548'}" stroke="#2a1810" stroke-width="0.4" stroke-linejoin="round"/>`;
  }
  const letters = [['N', 0, -r + 1], ['E', r - 1, 4], ['S', 0, r + 5], ['W', -r + 1, 4]]
    .map(([t, lx, ly]) => `<text x="${lx}" y="${ly}" text-anchor="middle" font-family="var(--serif-display)" font-size="9" font-weight="800" fill="#2a1810">${t}</text>`).join('');
  return `<g transform="translate(${x},${y})" opacity="0.78">
    <circle r="${r}" fill="#fbf2d6" stroke="#5a3a1f" stroke-width="0.7"/>
    <circle r="${r - 4}" fill="none" stroke="#5a3a1f" stroke-width="0.4" stroke-dasharray="2 2"/>
    ${spikes}${letters}<circle r="2" fill="#6a4a14"/></g>`;
})();

const ship = (x, y, rot) => `<g transform="translate(${x},${y}) rotate(${rot})" opacity="0.78">
  <path d="M -10 2 q 0 4 4 4 h 12 q 4 0 4 -4 z" fill="#5a3a1f"/>
  <path d="M -4 2 v -10" stroke="#5a3a1f" stroke-width="0.8"/>
  <path d="M -7 -8 q 7 -2 6 8 z" fill="#fbf2d6" stroke="#5a3a1f" stroke-width="0.5"/>
  <path d="M -3 -7 q 6 0 6 6 z" fill="#f0dca8" stroke="#5a3a1f" stroke-width="0.5"/></g>`;

function armyToken(x, y, owner, armies, sel) {
  if (owner == null) return '';
  const fill = owner === 0 ? 'var(--p0-1)' : 'var(--p1-1)';
  const ink = owner === 0 ? 'var(--p0-ink)' : 'var(--p1-ink)';
  const stack = armies >= 10 ? 3 : armies >= 5 ? 2 : 1;
  const r = sel ? 17 : 14;
  let g = `<g transform="translate(${x},${y})" pointer-events="none">`;
  if (stack >= 3) g += `<g transform="translate(-4,-4)"><circle r="${r}" fill="${fill}" stroke="${ink}" stroke-width="1.1" opacity="0.85"/></g>`;
  if (stack >= 2) g += `<g transform="translate(-2.5,-2.5)"><circle r="${r}" fill="${fill}" stroke="${ink}" stroke-width="1.1" opacity="0.92"/></g>`;
  g += `<ellipse cx="1.5" cy="${r + 2}" rx="${(r * 0.85).toFixed(1)}" ry="2.5" fill="#2a1810" opacity="0.32"/>`;
  g += `<circle r="${r}" fill="${fill}" stroke="${ink}" stroke-width="1.4"/>`;
  g += `<circle r="${r - 3.5}" fill="none" stroke="#fbe79a" stroke-width="0.8" opacity="0.7"/>`;
  g += `<circle r="${r - 3.5}" fill="none" stroke="#2a1810" stroke-width="0.4" opacity="0.5"/>`;
  g += `<path d="M ${-r * 0.6} ${-r * 0.55} a ${r * 0.95} ${r * 0.95} 0 0 1 ${r * 1.2} 0" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.2"/>`;
  g += `<text x="0" y="${r >= 17 ? 6 : 5}" text-anchor="middle" font-family="var(--serif-display)" font-weight="900" font-size="${armies >= 10 ? (sel ? 17 : 14) : sel ? 19 : 16}" fill="#fbf2d6" style="paint-order:stroke;stroke:rgba(0,0,0,0.55);stroke-width:0.6">${armies}</text>`;
  if (sel) g += `<circle r="${r + 4}" fill="none" stroke="var(--brass-2)" stroke-width="2" opacity="0.95"><animate attributeName="r" values="${r + 3};${r + 5};${r + 3}" dur="1.4s" repeatCount="indefinite"/></circle>`;
  return `${g}</g>`;
}

const landmark = ({ x, y, kind }) => kind === 'city'
  ? `<g transform="translate(${x},${y})" pointer-events="none"><circle r="3.2" fill="#fbf2d6" stroke="#2a1810" stroke-width="0.7"/><circle r="1.3" fill="#2a1810"/></g>`
  : `<g transform="translate(${x},${y})" pointer-events="none"><rect x="-3" y="-3" width="6" height="6" fill="#fbf2d6" stroke="#2a1810" stroke-width="0.7"/><rect x="-1.5" y="-1.5" width="3" height="3" fill="#2a1810"/></g>`;

export function renderBoard(root, view, { onPick, selected, plan = {} }) {
  const T = TERRITORIES, C = CONTINENTS_META;
  const ec = buildEdgeCache(VERTICES, COAST_JITTER, '');
  const sc = buildEdgeCache(VERTICES, COAST_JITTER * 0.85, '_shadow');

  const selectedId = selected ?? null;
  const sel = selectedId && T[selectedId] ? T[selectedId] : null;
  // Targetable = enemy neighbours of the selected source during attack. We
  // only get `selected` (= pending.from in attack phase), which is enough.
  const targetable = new Set();
  if (sel && view.phase === 'attack') {
    for (const n of sel.neighbors) {
      if (view.territories[n] && view.territories[n].owner !== view.youAre) targetable.add(n);
    }
  }

  // Inter-continent straits as dashed sea routes.
  let edges = '';
  const seenEdge = new Set();
  for (const [id, g] of Object.entries(T)) {
    for (const n of g.neighbors) {
      const key = id < n ? `${id}|${n}` : `${n}|${id}`;
      if (seenEdge.has(key) || g.continent === T[n].continent) continue;
      seenEdge.add(key);
      const a = g.label, b = T[n].label;
      const cy = (a.y + b.y) / 2 + (a.y < b.y ? -6 : 6) * 4;
      const d = `M ${a.x} ${a.y} Q ${(a.x + b.x) / 2} ${cy}, ${b.x} ${b.y}`;
      edges += `<path d="${d}" stroke="#f1ddae" stroke-width="4" fill="none" opacity="0.55" stroke-linecap="round"/>`
        + `<path d="${d}" stroke="#3a2410" stroke-width="1.4" stroke-dasharray="1.5 4" fill="none" opacity="0.85" stroke-linecap="round"/>`;
    }
  }

  let lands = '', overlay = '';
  for (const [id, g] of Object.entries(T)) {
    const t = view.territories[id];
    const d = territoryPath(g, VERTICES, ec);
    const ds = territoryPath(g, VERTICES, sc);
    lands += `<path d="${d}" fill="${C[g.continent].fill}"/>`;
    const wash = OWNER_FILL[t.owner] ? `<path d="${d}" fill="${OWNER_FILL[t.owner]}" opacity="0.20"/>` : '';
    const cls = `region clickable${id === selectedId ? ' sel' : ''}${targetable.has(id) ? ' targetable' : ''}`;
    overlay += `<g class="${cls}" data-pick="${id}">`
      + `<path d="${d}" fill="url(#r-t-${g.terrain})" opacity="0.5"/>${wash}`
      + `<path class="coast-shadow" d="${ds}" fill="none" stroke="#2a1810" stroke-width="1.0" opacity="0.45"/>`
      + `<path class="coast" d="${d}" fill="none" stroke="#2a1810" stroke-width="1.7" stroke-linejoin="round"/>`
      + `<path class="glow" d="${d}" fill="none" stroke="var(--brass-1)" stroke-width="6" opacity="0" style="mix-blend-mode:screen"/></g>`;
  }

  let continentOutlines = '';
  for (const [key, c] of Object.entries(C)) {
    continentOutlines += `<path d="${continentOuterPath(key, T, VERTICES, ec)}" fill="none" stroke="${c.color}" stroke-width="3.5" opacity="0.85" stroke-linejoin="round" stroke-linecap="round"/>`;
  }

  let arcs = '';
  if (sel) {
    for (const nb of sel.neighbors) {
      const other = T[nb];
      if (!other || other.continent !== sel.continent) continue;
      const d = sharedBorderPath(sel, other, ec);
      if (!d) continue;
      const enemy = view.phase === 'attack' && view.territories[nb]?.owner !== view.youAre;
      arcs += `<g><path d="${d}" fill="none" stroke="#fbe79a" stroke-width="6" opacity="0.7" stroke-linecap="round"/>`
        + `<path d="${d}" fill="none" stroke="${enemy ? '#a13b2a' : '#6a4a14'}" stroke-width="2.6" stroke-dasharray="5 4" opacity="0.95" stroke-linecap="round">`
        + `<animate attributeName="stroke-dashoffset" from="0" to="-18" dur="1.1s" repeatCount="indefinite"/></path></g>`;
    }
  }

  let names = '';
  for (const c of Object.values(C)) {
    if (!c.scroll) continue;
    names += `<g transform="translate(${c.scroll.x},${c.scroll.y})"><text text-anchor="middle" font-family="var(--serif-map-sc)" font-size="15" fill="${c.color}" letter-spacing="3.5" opacity="0.78" style="paint-order:stroke;stroke:rgba(241,221,174,0.85);stroke-width:3">${c.name.toUpperCase()}</text></g>`;
  }

  const marks = LANDMARKS.map(landmark).join('');

  let labels = '', armies = '';
  for (const [id, g] of Object.entries(T)) {
    const t = view.territories[id];
    labels += `<g transform="translate(${g.label.x},${g.label.y})"><text y="-22" text-anchor="middle" font-family="var(--serif-map-sc)" font-size="11" letter-spacing="1.2" fill="#3a2410" style="paint-order:stroke;stroke:#f1ddae;stroke-width:2">${g.name.toUpperCase()}</text></g>`;
    armies += armyToken(g.label.x, g.label.y + 4, t.owner, t.armies, id === selectedId);
    // Pending deploy overlay — preserved from the multi-territory deploy
    // feature: shows queued, not-yet-posted armies as a brass "+k".
    if (plan[id]) {
      armies += `<text x="${g.label.x + 20}" y="${g.label.y - 8}" text-anchor="middle" font-family="var(--serif-display)" font-weight="900" font-size="13" fill="var(--brass-1)" pointer-events="none" style="paint-order:stroke;stroke:#2a1810;stroke-width:2.4">+${plan[id]}</text>`;
    }
  }

  const seaLabels = SEA_LABELS.map(l =>
    `<text x="${l.x}" y="${l.y}" text-anchor="middle" font-family="var(--serif-map-sc)" font-size="${l.size}" letter-spacing="${l.size * (l.tracking ?? 0.2)}" fill="#355769" opacity="0.55"${l.rot ? ` transform="rotate(${l.rot} ${l.x} ${l.y})"` : ''}>${l.text}</text>`).join('');

  const svg = `<svg class="risk-map" viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg">
    ${DEFS}
    <rect width="800" height="600" fill="url(#r-sea-hatch)"/>
    <rect width="800" height="600" fill="url(#r-sea-waves)"/>
    <rect width="800" height="600" fill="url(#r-vignette)" pointer-events="none"/>
    ${COMPASS}${ship(120, 245, -12)}${ship(680, 362, 30)}
    <g class="edges">${edges}</g>
    <g class="lands" filter="url(#r-land-shadow)">${lands}</g>
    <g class="lands-overlay">${overlay}</g>
    <g class="continent-outlines" pointer-events="none">${continentOutlines}</g>
    <g class="neighbour-arcs" pointer-events="none">${arcs}</g>
    <g class="continent-names" pointer-events="none">${names}</g>
    <g class="landmarks" pointer-events="none">${marks}</g>
    <g class="region-labels" pointer-events="none">${labels}</g>
    <g class="armies">${armies}</g>
    ${seaLabels}
  </svg>`;

  const frame = document.createElement('div');
  frame.className = 'map-frame';
  frame.innerHTML = `<span class="map-corner-screw tl"></span><span class="map-corner-screw tr"></span><span class="map-corner-screw bl"></span><span class="map-corner-screw br"></span>${svg}`;
  for (const node of frame.querySelectorAll('[data-pick]')) {
    node.addEventListener('click', () => onPick(node.getAttribute('data-pick')));
  }
  root.appendChild(frame);
}
