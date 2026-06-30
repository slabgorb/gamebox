import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TERRITORIES, CONTINENT_BONUS, CONTINENTS_META, MAP_SIZE, MAP_VIEWBOX,
} from '../src/clients/risk/map-geometry.js';
import {
  allTerritories, neighborsOf, continentOf, continentBonus, CONTINENTS,
} from '../plugins/risk/server/map.js';

test('geometry covers exactly the engine territories', () => {
  assert.deepEqual(Object.keys(TERRITORIES).sort(), allTerritories().sort());
});

test('each territory neighbors match the engine, symmetric', () => {
  for (const id of allTerritories()) {
    assert.deepEqual(
      [...TERRITORIES[id].neighbors].sort(),
      [...neighborsOf(id)].sort(),
      `neighbors drift for ${id}`,
    );
  }
});

test('each territory continent matches the engine', () => {
  for (const id of allTerritories()) {
    assert.equal(TERRITORIES[id].continent, continentOf(id), `continent drift for ${id}`);
  }
});

test('continent bonuses match the engine', () => {
  for (const key of Object.keys(CONTINENTS)) {
    assert.equal(CONTINENT_BONUS[key], continentBonus(key), `bonus drift for ${key}`);
  }
});

test('every territory has an in-bounds label point and a positive hit radius', () => {
  const { w, h } = MAP_SIZE;
  assert.ok(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0, 'map size sane');
  for (const id of allTerritories()) {
    const g = TERRITORIES[id];
    assert.ok(Number.isFinite(g.label.x) && g.label.x >= 0 && g.label.x <= w, `${id} label.x oob`);
    assert.ok(Number.isFinite(g.label.y) && g.label.y >= 0 && g.label.y <= h, `${id} label.y oob`);
    assert.ok(Number.isFinite(g.r) && g.r > 0, `${id} hit radius`);
    assert.equal(typeof g.name, 'string');
  }
});

test('every territory has at least one polygon ring with in-bounds vertices', () => {
  const { w, h } = MAP_SIZE;
  for (const id of allTerritories()) {
    const { poly } = TERRITORIES[id];
    assert.ok(Array.isArray(poly) && poly.length >= 1, `${id} missing polygon`);
    for (const ring of poly) {
      assert.ok(Array.isArray(ring) && ring.length >= 3, `${id} ring needs >= 3 points`);
      for (const [x, y] of ring) {
        assert.ok(Number.isFinite(x) && x >= 0 && x <= w, `${id} poly x oob`);
        assert.ok(Number.isFinite(y) && y >= 0 && y <= h, `${id} poly y oob`);
      }
    }
  }
});

test('the visible viewbox sits inside the canvas', () => {
  const { w, h } = MAP_SIZE;
  const v = MAP_VIEWBOX;
  assert.ok(v.w > 0 && v.h > 0, 'viewbox size positive');
  assert.ok(v.x >= 0 && v.x + v.w <= w, 'viewbox x in bounds');
  assert.ok(v.y >= 0 && v.y + v.h <= h, 'viewbox y in bounds');
});

test('every continent has a silhouette, antique colors, and a name label', () => {
  const { w, h } = MAP_SIZE;
  assert.deepEqual(Object.keys(CONTINENTS_META).sort(), Object.keys(CONTINENTS).sort());
  for (const [key, meta] of Object.entries(CONTINENTS_META)) {
    assert.ok(Array.isArray(meta.sil) && meta.sil.length >= 1, `${key} missing silhouette`);
    for (const ring of meta.sil) {
      assert.ok(Array.isArray(ring) && ring.length >= 3, `${key} silhouette ring >= 3 points`);
      for (const [x, y] of ring) {
        assert.ok(x >= 0 && x <= w && y >= 0 && y <= h, `${key} silhouette point oob`);
      }
    }
    assert.match(meta.paper, /^#[0-9a-f]{6}$/i, `${key} paper color`);
    assert.match(meta.ink, /^#[0-9a-f]{6}$/i, `${key} ink color`);
    assert.ok(Number.isFinite(meta.label.x) && Number.isFinite(meta.label.y), `${key} label point`);
  }
});
