// test/risk-client-files.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

for (const f of ['index.html', 'style.css', 'app.js', 'board.js', 'action-bar.js', 'themes.js', 'error-boundary.js', 'assets/chart-of-the-world.png']) {
  test(`risk client has ${f}`, () => {
    assert.ok(existsSync(resolve(root, 'plugins/risk/client', f)), `missing ${f}`);
  });
}

test('risk client has map-geometry.js', () => {
  assert.ok(existsSync(resolve(root, 'src/clients/risk/map-geometry.js')), 'missing map-geometry.js');
});
