// test/risk-map-paths.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  wobblyEdge, edgeKey, buildEdgeCache, territoryPath,
  sharedBorderPath, continentOuterPath,
} from '../plugins/risk/client/map-paths.js';
import { VERTICES, TERRITORIES } from '../plugins/risk/client/map-geometry.js';

test('wobblyEdge keeps endpoints exact (jigsaw corners must align)', () => {
  const a = { x: 10, y: 20 }, b = { x: 110, y: 70 };
  const pts = wobblyEdge(a, b, 'seam', { segs: 6, jitter: 5 });
  assert.deepEqual(pts[0], { x: 10, y: 20 });
  assert.deepEqual(pts[pts.length - 1], { x: 110, y: 70 });
  assert.ok(pts.length > 2, 'edge is subdivided');
});

test('wobblyEdge is deterministic for the same seed', () => {
  const a = { x: 0, y: 0 }, b = { x: 50, y: 90 };
  assert.deepEqual(
    wobblyEdge(a, b, 'k', { segs: 6, jitter: 5 }),
    wobblyEdge(a, b, 'k', { segs: 6, jitter: 5 }),
  );
});

test('edgeKey is order-independent', () => {
  assert.equal(edgeKey('n_a', 'n_b'), edgeKey('n_b', 'n_a'));
});

test('edge cache returns the exact reverse for the opposite direction', () => {
  const ec = buildEdgeCache(VERTICES, 5, '');
  const fwd = ec.get('n_a', 'n_b');
  const rev = ec.get('n_b', 'n_a');
  assert.deepEqual(rev, [...fwd].reverse(),
    'a->b and b->a must be the same wobble reversed, or tiles will not fit');
});

test('territoryPath is a closed path with finite coords', () => {
  const ec = buildEdgeCache(VERTICES, 5, '');
  const d = territoryPath(TERRITORIES.N1, VERTICES, ec);
  assert.match(d, /^M /);
  assert.match(d, / Z$/);
  const nums = d.match(/-?\d+(\.\d+)?/g).map(Number);
  assert.ok(nums.every(Number.isFinite) && nums.length > 6);
});

test('adjacent same-continent tiles share an identical seam polyline (jigsaw fit)', () => {
  const ec = buildEdgeCache(VERTICES, 5, '');
  // N1 and N2 are adjacent within Niedersachsen.
  const seam = sharedBorderPath(TERRITORIES.N1, TERRITORIES.N2, ec);
  assert.ok(seam && seam.startsWith('M'), 'a shared seam exists');
  // Every interior point of the seam must appear verbatim in BOTH tile
  // outlines — that is the jigsaw-fit guarantee.
  const dN1 = territoryPath(TERRITORIES.N1, VERTICES, ec);
  const dN2 = territoryPath(TERRITORIES.N2, VERTICES, ec);
  const pairs = seam.match(/-?\d+\.\d+ -?\d+\.\d+/g);
  assert.ok(pairs.length >= 3, 'seam is a multi-segment polyline');
  for (const xy of pairs.slice(1, -1)) {
    assert.ok(dN1.includes(xy), `seam point ${xy} present in N1 outline`);
    assert.ok(dN2.includes(xy), `seam point ${xy} present in N2 outline`);
  }
});

test('sharedBorderPath returns null for non-adjacent tiles', () => {
  const ec = buildEdgeCache(VERTICES, 5, '');
  assert.equal(sharedBorderPath(TERRITORIES.N1, TERRITORIES.S1, ec), null);
});

test('continentOuterPath excludes interior seams, keeps the coast', () => {
  const ec = buildEdgeCache(VERTICES, 5, '');
  const outer = continentOuterPath('norland', TERRITORIES, VERTICES, ec);
  assert.ok(outer.length > 0 && outer.startsWith('M'));
  // The N1-N2 interior junction vertex n_x is shared by 3 tiles; its
  // purely-interior position must not surface on the outer ribbon.
  const interiorOnly = `${VERTICES.n_x.x.toFixed(1)} ${VERTICES.n_x.y.toFixed(1)}`;
  assert.ok(!outer.includes(interiorOnly), 'interior junction is not on the coast');
});
