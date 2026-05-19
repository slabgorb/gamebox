import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  TERRITORIES, CONTINENT_BONUS, MAP_SIZE, LEGEND_LAYOUT,
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

test('legend layout covers every continent and the rectangles are in-bounds', () => {
  const { w, h } = MAP_SIZE;
  assert.deepEqual(Object.keys(LEGEND_LAYOUT).sort(), Object.keys(CONTINENTS).sort());
  for (const [key, box] of Object.entries(LEGEND_LAYOUT)) {
    assert.ok(box.x >= 0 && box.x + box.w <= w, `${key} legend x oob`);
    assert.ok(box.y >= 0 && box.y + box.h <= h, `${key} legend y oob`);
    assert.ok(box.w > 0 && box.h > 0, `${key} legend size`);
  }
});
