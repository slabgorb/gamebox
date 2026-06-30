// test/risk-client-files.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

// Post-React-migration deliverable: a built bundle + static shell. The
// board is now a pure-vector renderer, so no base-map image is required.
// Component sources live in src/clients/risk/ and are covered by vitest.
for (const f of ['index.html', 'style.css', 'app.js']) {
  test(`risk client has ${f}`, () => {
    assert.ok(existsSync(resolve(root, 'plugins/risk/client', f)), `missing ${f}`);
  });
}

test('risk React sources exist in src/clients', () => {
  for (const f of ['main.tsx', 'RiskApp.tsx', 'Board.tsx']) {
    assert.ok(
      existsSync(resolve(root, 'src/clients/risk', f)),
      `missing src/clients/risk/${f}`,
    );
  }
});
