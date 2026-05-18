import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riskPublicView } from '../plugins/risk/server/view.js';

test('publicView exposes full board and viewer side', () => {
  const state = { sides: { a: 7, b: 8 }, territories: { N1: { owner: 0, armies: 3 } }, phase: 'attack' };
  assert.equal(riskPublicView({ state, viewerId: 7 }).youAre, 0);
  assert.equal(riskPublicView({ state, viewerId: 8 }).youAre, 1);
  assert.equal(riskPublicView({ state, viewerId: 99 }).youAre, null);
  assert.deepEqual(riskPublicView({ state, viewerId: 7 }).territories, state.territories);
});
