import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, wilsonInterval } from '../src/server/ai/headless-game.js';

test('mulberry32: deterministic for same seed', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const seqA = [a(), a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test('mulberry32: different seeds produce different sequences', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  assert.notEqual(a(), b());
});

test('mulberry32: values in [0, 1)', () => {
  const r = mulberry32(123);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('wilsonInterval: 0 wins of 0 trials returns [0, 0]', () => {
  const { low, high } = wilsonInterval(0, 0);
  assert.equal(low, 0);
  assert.equal(high, 0);
});

test('wilsonInterval: 12 wins of 20 returns ~[0.387, 0.781]', () => {
  const { low, high } = wilsonInterval(12, 20);
  assert.ok(Math.abs(low - 0.387) < 0.01, `low=${low}`);
  assert.ok(Math.abs(high - 0.781) < 0.01, `high=${high}`);
});

test('wilsonInterval: 0 wins of 20 has high > 0', () => {
  const { low, high } = wilsonInterval(0, 20);
  assert.equal(low, 0);
  assert.ok(high > 0 && high < 0.2);
});
