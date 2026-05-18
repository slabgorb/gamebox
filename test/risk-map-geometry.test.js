import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TERRITORIES, CONTINENT_BONUS, MAP_SIZE,
} from '../plugins/risk/client/map-geometry.js';
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

test('every territory has a polygon, a drawable path, and an in-bounds label', () => {
  const { w, h } = MAP_SIZE;
  assert.ok(Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0, 'map size sane');
  for (const id of allTerritories()) {
    const g = TERRITORIES[id];
    assert.ok(Array.isArray(g.poly) && g.poly.length >= 3, `${id} poly is a ring`);
    for (const pt of g.poly) {
      assert.ok(Array.isArray(pt) && pt.length === 2
        && Number.isFinite(pt[0]) && Number.isFinite(pt[1]), `${id} bad poly point`);
    }
    assert.equal(typeof g.path, 'string');
    assert.match(g.path, /^M /, `${id} path starts with M`);
    assert.match(g.path, / Z$/, `${id} path is closed`);
    assert.ok(Number.isFinite(g.label.x) && g.label.x >= 0 && g.label.x <= w, `${id} label.x oob`);
    assert.ok(Number.isFinite(g.label.y) && g.label.y >= 0 && g.label.y <= h, `${id} label.y oob`);
  }
});
