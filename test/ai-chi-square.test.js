import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiSquare2x2, chiSquarePValue } from '../src/server/ai/diagnostics/chi-square.js';

test('chiSquare2x2: returns 0 for identical proportions', () => {
  const stat = chiSquare2x2({ a: 50, b: 50, c: 50, d: 50 });
  assert.ok(Math.abs(stat) < 1e-9, `expected ~0, got ${stat}`);
});

test('chiSquare2x2: matches known reference value', () => {
  const stat = chiSquare2x2({ a: 20, b: 10, c: 10, d: 20 });
  assert.ok(Math.abs(stat - 6.667) < 0.01, `expected ~6.667, got ${stat}`);
});

test('chiSquare2x2: matches another reference value', () => {
  const stat = chiSquare2x2({ a: 30, b: 10, c: 15, d: 25 });
  assert.ok(Math.abs(stat - 11.429) < 0.05, `expected ~11.429, got ${stat}`);
});

test('chiSquare2x2: zero total throws', () => {
  assert.throws(() => chiSquare2x2({ a: 0, b: 0, c: 0, d: 0 }));
});

test('chiSquarePValue: p ≈ 0.5 at chi² = 0.455 (median of chi² with 1 d.f.)', () => {
  const p = chiSquarePValue(0.4549);
  assert.ok(Math.abs(p - 0.5) < 0.01, `expected ~0.5, got ${p}`);
});

test('chiSquarePValue: p ≈ 0.05 at chi² = 3.841 (95th percentile, 1 d.f.)', () => {
  const p = chiSquarePValue(3.841);
  assert.ok(Math.abs(p - 0.05) < 0.005, `expected ~0.05, got ${p}`);
});

test('chiSquarePValue: p ≈ 0.01 at chi² = 6.635 (99th percentile, 1 d.f.)', () => {
  const p = chiSquarePValue(6.635);
  assert.ok(Math.abs(p - 0.01) < 0.002, `expected ~0.01, got ${p}`);
});

test('chiSquarePValue: p ≈ 0.001 at chi² = 10.828 (99.9th percentile, 1 d.f.)', () => {
  const p = chiSquarePValue(10.828);
  assert.ok(Math.abs(p - 0.001) < 0.0005, `expected ~0.001, got ${p}`);
});

test('chiSquarePValue: returns 1 for negative input (defensive)', () => {
  assert.equal(chiSquarePValue(-1), 1);
});
