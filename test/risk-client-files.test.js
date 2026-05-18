// test/risk-client-files.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

for (const f of ['index.html', 'style.css', 'app.js', 'board.js', 'action-bar.js', 'history.js', 'end-screen.js', 'themes.js', 'map-geometry.js', 'combat-reveal.js', 'leave-button.js']) {
  test(`risk client has ${f}`, () => {
    assert.ok(existsSync(resolve(root, 'plugins/risk/client', f)), `missing ${f}`);
  });
}
