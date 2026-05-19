import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CONTINENTS, allTerritories, neighborsOf, areAdjacent,
  continentOf, continentBonus, continentTerritories,
} from '../plugins/risk/server/map.js';

test('42 territories across 6 continents', () => {
  assert.equal(allTerritories().length, 42);
  assert.deepEqual(
    Object.keys(CONTINENTS).sort(),
    ['africa', 'asia', 'australia', 'europe', 'namerica', 'samerica'],
  );
});

test('classic Risk continent bonuses', () => {
  assert.equal(continentBonus('namerica'), 5);
  assert.equal(continentBonus('samerica'), 2);
  assert.equal(continentBonus('europe'), 5);
  assert.equal(continentBonus('africa'), 3);
  assert.equal(continentBonus('asia'), 7);
  assert.equal(continentBonus('australia'), 2);
});

test('continent territory counts match classic Risk', () => {
  assert.equal(continentTerritories('namerica').length, 9);
  assert.equal(continentTerritories('samerica').length, 4);
  assert.equal(continentTerritories('europe').length, 7);
  assert.equal(continentTerritories('africa').length, 6);
  assert.equal(continentTerritories('asia').length, 12);
  assert.equal(continentTerritories('australia').length, 4);
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

test('cross-continent edges are the canonical classic Risk straits', () => {
  const crossEdges = [];
  for (const id of allTerritories()) {
    for (const n of neighborsOf(id)) {
      if (id < n && continentOf(id) !== continentOf(n)) crossEdges.push(`${id}-${n}`);
    }
  }
  assert.deepEqual(
    crossEdges.sort(),
    [
      'afghanistan-ukraine',
      'alaska-kamchatka',
      'brazil-north_africa',
      'cent_am-venezuela',
      'east_africa-middle_east',
      'egypt-middle_east',
      'egypt-southern_europe',
      'greenland-iceland',
      'indonesia-siam',
      'middle_east-southern_europe',
      'middle_east-ukraine',
      'north_africa-southern_europe',
      'north_africa-western_europe',
      'ukraine-ural',
    ].sort(),
  );
});

test('areAdjacent matches the neighbors list both ways', () => {
  assert.ok(areAdjacent('alaska', 'kamchatka'));
  assert.ok(areAdjacent('kamchatka', 'alaska'));
  assert.ok(!areAdjacent('alaska', 'japan'));
  assert.ok(!areAdjacent('iceland', 'argentina'));
});
