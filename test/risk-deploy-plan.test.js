// test/risk-deploy-plan.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adjust, placed, remaining, isComplete } from '../plugins/risk/client/deploy-plan.js';

test('placed sums the allocation; remaining is pool minus placed', () => {
  assert.equal(placed({}), 0);
  assert.equal(remaining({}, 20), 20);
  assert.equal(placed({ ALA: 3, URA: 5 }), 8);
  assert.equal(remaining({ ALA: 3, URA: 5 }, 20), 12);
});

test('adjust adds armies to a territory', () => {
  const p = adjust({}, 'ALA', 1, 20);
  assert.deepEqual(p, { ALA: 1 });
  assert.deepEqual(adjust(p, 'ALA', 1, 20), { ALA: 2 });
});

test('adjust does not mutate the input plan', () => {
  const p = { ALA: 1 };
  adjust(p, 'ALA', 1, 20);
  assert.deepEqual(p, { ALA: 1 });
});

test('adjust caps the total at the pool, never overspends', () => {
  const p = adjust({ ALA: 18 }, 'URA', 5, 20);
  assert.equal(placed(p), 20);
  assert.equal(p.URA, 2); // only the 2 that fit
});

test('adjust full pool onto a fresh territory is clamped', () => {
  assert.deepEqual(adjust({}, 'ALA', 99, 20), { ALA: 20 });
});

test('adjust down clamps at zero and drops the key', () => {
  assert.deepEqual(adjust({ ALA: 2 }, 'ALA', -1, 20), { ALA: 1 });
  assert.deepEqual(adjust({ ALA: 1 }, 'ALA', -1, 20), {});
  assert.deepEqual(adjust({ ALA: 1 }, 'ALA', -5, 20), {});
  assert.deepEqual(adjust({}, 'ALA', -1, 20), {});
});

test('isComplete only when the whole pool is spent', () => {
  assert.equal(isComplete({}, 20), false);
  assert.equal(isComplete({ ALA: 19 }, 20), false);
  assert.equal(isComplete({ ALA: 12, URA: 8 }, 20), true);
  assert.equal(isComplete({}, 0), false); // a zero pool is not "complete"
});
