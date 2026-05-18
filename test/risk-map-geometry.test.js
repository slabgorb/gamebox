import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TERRITORIES, CONTINENT_BONUS } from '../plugins/risk/client/map-geometry.js';
import {
  allTerritories, neighborsOf, continentOf, continentBonus, CONTINENTS,
} from '../plugins/risk/server/map.js';

const VW = 800, VH = 600;

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

test('every territory has a drawable path and an in-bounds label', () => {
  for (const id of allTerritories()) {
    const g = TERRITORIES[id];
    assert.equal(typeof g.path, 'string');
    assert.ok(g.path.trim().length > 0, `${id} empty path`);
    assert.ok(Number.isFinite(g.label.x) && g.label.x >= 0 && g.label.x <= VW, `${id} label.x oob`);
    assert.ok(Number.isFinite(g.label.y) && g.label.y >= 0 && g.label.y <= VH, `${id} label.y oob`);
  }
});
