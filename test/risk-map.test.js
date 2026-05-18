import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTINENTS, allTerritories, neighborsOf, areAdjacent,
  continentOf, continentBonus, continentTerritories,
} from '../plugins/risk/server/map.js';

test('13 territories across 4 continents', () => {
  assert.equal(allTerritories().length, 13);
  assert.deepEqual(Object.keys(CONTINENTS).sort(), ['africa', 'antipodes', 'eurasia', 'namerica']);
});

test('every territory belongs to exactly one continent', () => {
  for (const id of allTerritories()) {
    assert.ok(continentOf(id), `${id} has no continent`);
  }
});

test('adjacency is symmetric', () => {
  for (const id of allTerritories()) {
    for (const n of neighborsOf(id)) {
      assert.ok(neighborsOf(n).includes(id), `${id}->${n} not symmetric`);
    }
  }
});

test('cross-continent straits are the only inter-continent edges', () => {
  const crossEdges = [];
  for (const id of allTerritories()) {
    for (const n of neighborsOf(id)) {
      if (id < n && continentOf(id) !== continentOf(n)) crossEdges.push(`${id}-${n}`);
    }
  }
  assert.deepEqual(
    crossEdges.sort(),
    [
      'amazonia-atlantic_shore', 'amazonia-cordillera', 'amazonia-north_africa',
      'atlantic_shore-europa', 'australia-cathay', 'britannia-northern_reach',
      'equatorial-persia', 'europa-north_africa', 'north_africa-persia',
    ].sort(),
  );
});

test('continent helpers', () => {
  assert.equal(continentBonus('eurasia'), 3);
  assert.equal(continentBonus('namerica'), 2);
  assert.deepEqual(continentTerritories('africa').sort(), ['cape', 'equatorial', 'north_africa']);
  assert.equal(areAdjacent('northern_reach', 'cordillera'), true);
  assert.equal(areAdjacent('northern_reach', 'north_africa'), false);
});
