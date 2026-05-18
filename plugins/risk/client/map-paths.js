// plugins/risk/client/map-paths.js
// Pure geometry for the antique campaign map. The map is a PLANAR GRAPH:
// territories are ordered vertex loops, and adjacent same-continent tiles
// share a vertex subsequence. Every shared edge is wobbled exactly ONCE
// (keyed by the sorted vertex pair) so both tiles trace the identical
// hand-drawn coastline — that is what makes the pieces fit jigsaw-style.
// No DOM here; board.js turns these strings into SVG.

function seedFn(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function strHash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = ((h ^ str.charCodeAt(i)) * 16777619) >>> 0;
  return h;
}

// Points along edge a->b, interior subdivisions perturbed along the edge
// normal with a bell weight (midpoints wobble most). Endpoints are NEVER
// perturbed so they land exactly on the shared vertex.
export function wobblyEdge(a, b, seed, { segs = 6, jitter = 5 } = {}) {
  const rnd = seedFn(strHash(seed));
  const pts = [{ x: a.x, y: a.y }];
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len, ny = dx / len;
  for (let s = 1; s < segs; s++) {
    const t = s / segs;
    const w = Math.sin(Math.PI * t);
    const j = (rnd() * 2 - 1) * jitter * w;
    pts.push({ x: a.x + dx * t + nx * j, y: a.y + dy * t + ny * j });
  }
  pts.push({ x: b.x, y: b.y });
  return pts;
}

export function edgeKey(va, vb) {
  return va < vb ? `${va}|${vb}` : `${vb}|${va}`;
}

// Wobbled polyline per canonical (sorted) vertex pair, memoised. Returns the
// polyline walked in the requested direction (reversed when the caller walks
// against canonical order) so both tiles sharing the edge get identical points.
export function buildEdgeCache(V, jitter, suffix = '') {
  const cache = new Map();
  const get = (va, vb) => {
    const k = edgeKey(va, vb);
    if (!cache.has(k)) {
      const [k0, k1] = k.split('|');
      cache.set(k, wobblyEdge(V[k0], V[k1], k + suffix, { segs: 6, jitter }));
    }
    const canon = cache.get(k);
    return va === k.split('|')[0] ? canon : [...canon].reverse();
  };
  return { get };
}

// Closed "M .. L .. Z" path for a territory's vertex loop.
export function territoryPath(territory, V, edgeCache) {
  const verts = territory.vertices;
  let d = '';
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    const pts = edgeCache.get(a, b);
    for (let j = 0; j < pts.length; j++) {
      if (i === 0 && j === 0) d = `M ${pts[j].x.toFixed(1)} ${pts[j].y.toFixed(1)}`;
      else if (j === 0) { /* shared with previous edge's endpoint */ }
      else d += ` L ${pts[j].x.toFixed(1)} ${pts[j].y.toFixed(1)}`;
    }
  }
  return `${d} Z`;
}

// Polyline of just the border shared by two adjacent same-continent tiles
// (used to highlight lines of attack/fortify). null when they share no edge.
export function sharedBorderPath(a, b, edgeCache) {
  const aV = a.vertices, bV = b.vertices;
  const bPairs = new Set();
  for (let i = 0; i < bV.length; i++) bPairs.add(edgeKey(bV[i], bV[(i + 1) % bV.length]));
  for (let i = 0; i < aV.length; i++) {
    const x = aV[i], y = aV[(i + 1) % aV.length];
    if (bPairs.has(edgeKey(x, y))) {
      const pts = edgeCache.get(x, y);
      let d = '';
      for (let j = 0; j < pts.length; j++) {
        d += `${j === 0 ? 'M' : 'L'} ${pts[j].x.toFixed(1)} ${pts[j].y.toFixed(1)} `;
      }
      return d.trim();
    }
  }
  return null;
}

// Coastline of a whole continent: every edge that belongs to exactly one of
// its tiles (i.e. not an interior sibling seam). Multi-subpath string so the
// cluster reads as a single landmass.
export function continentOuterPath(continentKey, T, V, edgeCache) {
  const ids = Object.keys(T).filter((id) => T[id].continent === continentKey);
  const count = new Map();
  const order = new Map();
  for (const id of ids) {
    const verts = T[id].vertices;
    for (let i = 0; i < verts.length; i++) {
      const va = verts[i], vb = verts[(i + 1) % verts.length];
      const k = edgeKey(va, vb);
      count.set(k, (count.get(k) ?? 0) + 1);
      if (!order.has(k)) order.set(k, [va, vb]);
    }
  }
  let d = '';
  for (const [k, n] of count) {
    if (n !== 1) continue;
    const [va, vb] = order.get(k);
    const pts = edgeCache.get(va, vb);
    d += `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)}`;
    d += ' ';
  }
  return d.trim();
}
