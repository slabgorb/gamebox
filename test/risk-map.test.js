import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTINENTS, allTerritories, neighborsOf, areAdjacent,
  continentOf, continentBonus, continentTerritories,
} from '../plugins/risk/server/map.js';

test('13 territories across 4 continents', () => {
  assert.equal(allTerritories().length, 13);
  assert.deepEqual(Object.keys(CONTINENTS).sort(), ['norland', 'ostmark', 'sudreach', 'westfen']);
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

test('chokepoints are the only cross-continent edges', () => {
  const crossEdges = [];
  for (const id of allTerritories()) {
    for (const n of neighborsOf(id)) {
      if (id < n && continentOf(id) !== continentOf(n)) crossEdges.push(`${id}-${n}`);
    }
  }
  assert.deepEqual(
    crossEdges.sort(),
    ['E1-N3', 'E2-W2', 'E4-S1', 'N1-W3', 'S3-W1'].sort(),
  );
});

test('continent helpers', () => {
  assert.equal(continentBonus('ostmark'), 3);
  assert.equal(continentBonus('norland'), 2);
  assert.deepEqual(continentTerritories('sudreach').sort(), ['S1', 'S2', 'S3']);
  assert.equal(areAdjacent('N1', 'N2'), true);
  assert.equal(areAdjacent('N1', 'S1'), false);
});
