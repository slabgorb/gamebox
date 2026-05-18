import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const src = readFileSync(resolve(import.meta.dirname, '../src/server/ai/index.js'), 'utf8');

test('AI index imports the risk plugin and player', () => {
  assert.match(src, /plugins\/risk\/plugin\.js/);
  assert.match(src, /plugins\/risk\/server\/ai\/risk-player\.js/);
});

test('AI index registers a risk adapter entry', () => {
  assert.match(src, /risk:\s*\{\s*plugin:\s*riskPlugin,\s*chooseAction:\s*riskChoose\s*\}/);
});
