// plugins/risk/client/board.js
// Antique "Chart of the World" renderer. The engraving is an <img> behind a
// transparent SVG overlay; on top we draw hand-traced territory polygons
// (invisible hit targets — the engraving already inks the coastlines), the
// internal land seams, owner-tint washes, continent banners, placenames,
// brass army tokens, neighbour arcs, and a from->to march arrow.
//
// Contract (unchanged, app.js depends on it):
//   renderBoard(root, view, { onPick, selected, plan, to })
// `selected` is a single territory id (pending.from ?? pending.deployTarget);
// `plan` is the in-progress deploy map { id: armies } — its "+k" overlay is
// preserved from the multi-territory deploy feature; `to` (optional) draws
// the design's march arrow during attack/fortify planning.
import {
  TERRITORIES, CONTINENTS_META, MAP_IMAGE, MAP_SIZE, SEA_LABELS, LAND_SEAMS,
} from './map-geometry.js';

// Curved arc from a->b. Side bias controls the perpendicular bulge.
function arcPath(a, b, bias = 0.16) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist, uy = dy / dist;
  const mx = (a.x + b.x) / 2 + -uy * dist * bias;
  const my = (a.y + b.y) / 2 + ux * dist * bias;
  return `M ${a.x} ${a.y} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${b.x} ${b.y}`;
}

// Stacked brass-rimmed disc token in faction colour. Scaled for the
// engraving's native 1499x1003 space.
function armyToken(x, y, owner, armies, sel) {
  if (owner == null) return '';
  const fill = owner === 0 ? 'var(--p0-1)' : 'var(--p1-1)';
  const ink = owner === 0 ? 'var(--p0-ink)' : 'var(--p1-ink)';
  const stack = armies >= 10 ? 3 : armies >= 5 ? 2 : 1;
  const r = sel ? 28 : 24;
  let g = `<g transform="translate(${x},${y})" pointer-events="none">`;
  if (stack >= 3) g += `<g transform="translate(-6,-6)"><circle r="${r}" fill="${fill}" stroke="${ink}" stroke-width="1.6" opacity="0.85"/></g>`;
  if (stack >= 2) g += `<g transform="translate(-3.5,-3.5)"><circle r="${r}" fill="${fill}" stroke="${ink}" stroke-width="1.6" opacity="0.92"/></g>`;
  g += `<ellipse cx="2" cy="${r + 3.5}" rx="${(r * 0.85).toFixed(1)}" ry="3" fill="#2a1810" opacity="0.4"/>`;
  g += `<circle r="${r}" fill="${fill}" stroke="${ink}" stroke-width="2.2"/>`;
  g += `<circle r="${r - 5.5}" fill="none" stroke="#fbe79a" stroke-width="1.3" opacity="0.7"/>`;
  g += `<circle r="${r - 5.5}" fill="none" stroke="#2a1810" stroke-width="0.6" opacity="0.5"/>`;
  g += `<path d="M ${(-r * 0.62).toFixed(1)} ${(-r * 0.55).toFixed(1)} a ${(r * 0.95).toFixed(1)} ${(r * 0.95).toFixed(1)} 0 0 1 ${(r * 1.22).toFixed(1)} 0" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.6"/>`;
  g += `<text x="0" y="${r >= 28 ? 10 : 8.5}" text-anchor="middle" font-family="var(--serif-display)" font-weight="900" font-size="${armies >= 10 ? (sel ? 27 : 22) : sel ? 30 : 26}" fill="#fbf2d6" style="paint-order:stroke;stroke:rgba(0,0,0,0.6);stroke-width:1">${armies}</text>`;
  if (sel) g += `<circle r="${r + 5}" fill="none" stroke="var(--brass-2)" stroke-width="3" opacity="0.95"><animate attributeName="r" values="${r + 4};${r + 7};${r + 4}" dur="1.4s" repeatCount="indefinite"/></circle>`;
  return `${g}</g>`;
}

export function renderBoard(root, view, { onPick, selected, plan = {}, to = null }) {
  const T = TERRITORIES;
  const C = CONTINENTS_META;
  const { w: MW, h: MH } = MAP_SIZE;

  const selectedId = selected ?? null;
  const sel = selectedId && T[selectedId] ? T[selectedId] : null;
  // Targetable = enemy neighbours of the selected source during attack.
  const targetable = new Set();
  if (sel && view.phase === 'attack') {
    for (const n of sel.neighbors) {
      if (view.territories[n] && view.territories[n].owner !== view.youAre) targetable.add(n);
    }
  }

  // ---- territory owner washes (light tint inside the polygon) ----
  let washes = '';
  for (const [id, g] of Object.entries(T)) {
    const t = view.territories[id];
    if (t.owner == null) continue;
    washes += `<path d="${g.path}" fill="${t.owner === 0 ? 'var(--p0-1)' : 'var(--p1-1)'}" opacity="0.12"/>`;
  }

  // ---- continent banners engraved into the sea ----
  let banners = '';
  for (const c of Object.values(C)) {
    if (!c.scroll) continue;
    const s = c.scroll;
    banners += `<text x="${s.x}" y="${s.y}" text-anchor="middle" font-family="var(--serif-map-sc)" font-size="${s.size}" letter-spacing="${s.tracking}" fill="${c.color}" opacity="0.7" style="paint-order:stroke;stroke:rgba(251,232,200,0.85);stroke-width:4">${s.text}</text>`;
  }

  // ---- italic sea labels ----
  const seaLabels = SEA_LABELS.map(l =>
    `<text x="${l.x}" y="${l.y}" text-anchor="middle" font-family="var(--serif-map)" font-style="italic" font-size="${l.size}" letter-spacing="${(l.size * (l.tracking ?? 0.2)).toFixed(2)}" fill="#355769" opacity="0.55"${l.rot ? ` transform="rotate(${l.rot} ${l.x} ${l.y})"` : ''}>${l.text}</text>`,
  ).join('');

  // ---- territory hit targets (invisible polygons + select/target glow) ----
  let hits = '';
  for (const [id, g] of Object.entries(T)) {
    const isSel = id === selectedId;
    const isTarget = targetable.has(id);
    const cls = `region clickable${isSel ? ' sel' : ''}${isTarget ? ' targetable' : ''}`;
    hits += `<g class="${cls}">`;
    if (isSel) hits += `<path d="${g.path}" fill="#fbe79a" opacity="0.22" pointer-events="none"/>`;
    if (isTarget) hits += `<path d="${g.path}" fill="#a13b2a" opacity="0.14" pointer-events="none"/>`;
    hits += `<path d="${g.path}" fill="transparent" class="hit" data-pick="${id}" style="cursor:pointer"><title>${g.name}</title></path></g>`;
  }

  // ---- internal land seams (the only inked borders) ----
  let seams = '';
  for (const seam of LAND_SEAMS) {
    const [a, b] = seam.between;
    const involved = selectedId && (a === selectedId || b === selectedId);
    const other = a === selectedId ? b : a;
    const attackEdge = involved && view.phase === 'attack'
      && view.territories[other]?.owner != null
      && view.territories[other]?.owner !== view.youAre
      && T[selectedId]?.neighbors.includes(other);
    let stroke = '#3a2410', sw = 1.5, dash = '', opacity = 0.85;
    if (attackEdge) { stroke = '#a13b2a'; sw = 3; dash = '7 4'; opacity = 1; }
    else if (involved) { stroke = '#6a4a14'; sw = 2.6; opacity = 1; }
    const d = seam.path.map((p, j) => `${j === 0 ? 'M' : 'L'} ${p[0]} ${p[1]}`).join(' ');
    seams += '<g>';
    seams += `<path d="${d}" fill="none" stroke="#fbf2d6" stroke-width="${sw + 2.4}" opacity="0.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (involved) seams += `<path d="${d}" fill="none" stroke="#fbe79a" stroke-width="${sw + 5}" opacity="0.6" stroke-linecap="round" stroke-linejoin="round"/>`;
    seams += `<path d="${d}" fill="none" stroke="${stroke}" stroke-width="${sw}"${dash ? ` stroke-dasharray="${dash}"` : ''} stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}">`;
    if (attackEdge) seams += '<animate attributeName="stroke-dashoffset" from="0" to="-22" dur="1.1s" repeatCount="indefinite"/>';
    seams += '</path></g>';
  }

  // ---- selected-territory adjacency arcs ----
  let arcs = '';
  if (sel) {
    for (const n of sel.neighbors) {
      const other = T[n];
      if (!other) continue;
      const enemy = view.phase === 'attack'
        && view.territories[n]?.owner != null
        && view.territories[n]?.owner !== view.youAre;
      const d = arcPath(sel.label, other.label);
      arcs += `<g><path d="${d}" stroke="rgba(251,232,160,0.85)" stroke-width="7.6" fill="none" stroke-linecap="round"/>`
        + `<path d="${d}" stroke="${enemy ? '#a13b2a' : '#5a3a1f'}" stroke-width="3.6" stroke-dasharray="8 6" stroke-linecap="round" fill="none">`
        + '<animate attributeName="stroke-dashoffset" from="0" to="-28" dur="1.3s" repeatCount="indefinite"/></path></g>';
    }
  }

  // ---- placename labels ----
  let labels = '';
  for (const [, g] of Object.entries(T)) {
    labels += `<text x="${g.label.x}" y="${g.label.y - 32}" text-anchor="middle" font-family="var(--serif-map-sc)" font-size="14" letter-spacing="1.6" fill="#2a1410" style="paint-order:stroke;stroke:#fbf2d6;stroke-width:3.5">${g.name.toUpperCase()}</text>`;
  }

  // ---- army tokens + queued deploy "+k" overlay ----
  let armies = '';
  for (const [id, g] of Object.entries(T)) {
    const t = view.territories[id];
    armies += armyToken(g.label.x, g.label.y, t.owner, t.armies, id === selectedId);
    if (plan[id]) {
      armies += `<text x="${g.label.x + 34}" y="${g.label.y - 16}" text-anchor="middle" font-family="var(--serif-display)" font-weight="900" font-size="22" fill="var(--brass-1)" pointer-events="none" style="paint-order:stroke;stroke:#2a1810;stroke-width:4">+${plan[id]}</text>`;
    }
  }

  // ---- from->to march arrow ----
  let march = '';
  if (selectedId && to && T[selectedId] && T[to]) {
    const a = T[selectedId].label, b = T[to].label;
    const dx = b.x - a.x, dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    const ux = dx / dist, uy = dy / dist;
    const ax = a.x + ux * 30, ay = a.y + uy * 30;
    const bx = b.x - ux * 30, by = b.y - uy * 30;
    const mx = (ax + bx) / 2 + -uy * dist * 0.16;
    const my = (ay + by) / 2 + ux * dist * 0.16;
    const p = `M ${ax.toFixed(1)} ${ay.toFixed(1)} Q ${mx.toFixed(1)} ${my.toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
    const action = view.phase === 'attack' ? '#a13b2a' : '#1f4e6e';
    march = `<g class="march-arrow" pointer-events="none">
      <defs><marker id="march-head" viewBox="0 0 12 12" refX="9" refY="6" markerWidth="6" markerHeight="6" orient="auto">
        <path d="M 0 0 L 12 6 L 0 12 L 3 6 Z" fill="${action}" stroke="#2a1810" stroke-width="0.6" stroke-linejoin="round"/></marker></defs>
      <path d="${p}" stroke="#fbf2d6" stroke-width="12" fill="none" opacity="0.78" stroke-linecap="round"/>
      <path d="${p}" stroke="${action}" stroke-width="5" fill="none" stroke-linecap="round" marker-end="url(#march-head)" stroke-dasharray="12 7">
        <animate attributeName="stroke-dashoffset" from="0" to="-38" dur="1.3s" repeatCount="indefinite"/></path></g>`;
  }

  const svg = `<svg class="risk-map" viewBox="0 0 ${MW} ${MH}" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid meet">
    <defs>
      <radialGradient id="r-map-vignette" cx="50%" cy="50%" r="62%">
        <stop offset="0%" stop-color="#fff0c0" stop-opacity="0"/>
        <stop offset="70%" stop-color="#8a5018" stop-opacity="0"/>
        <stop offset="100%" stop-color="#3a2008" stop-opacity="0.55"/>
      </radialGradient>
    </defs>
    <g class="territory-washes" pointer-events="none">${washes}</g>
    <g class="continent-names" pointer-events="none">${banners}</g>
    <g class="sea-labels" pointer-events="none">${seaLabels}</g>
    <rect width="${MW}" height="${MH}" fill="url(#r-map-vignette)" pointer-events="none"/>
    <g class="territory-hits">${hits}</g>
    <g class="land-seams" pointer-events="none">${seams}</g>
    <g class="neighbour-arcs" pointer-events="none">${arcs}</g>
    <g class="region-labels" pointer-events="none">${labels}</g>
    <g class="armies" pointer-events="none">${armies}</g>
    ${march}
  </svg>`;

  const frame = document.createElement('div');
  frame.className = 'map-frame';
  frame.innerHTML = '<span class="map-corner-screw tl"></span><span class="map-corner-screw tr"></span>'
    + '<span class="map-corner-screw bl"></span><span class="map-corner-screw br"></span>'
    + `<img class="map-image" src="${MAP_IMAGE}" alt="Chart of the World" />${svg}`;
  for (const node of frame.querySelectorAll('[data-pick]')) {
    node.addEventListener('click', () => onPick(node.getAttribute('data-pick')));
  }
  root.appendChild(frame);
}
