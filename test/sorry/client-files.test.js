import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

// E3-6 delivers the Sorry! client as a React app, mirroring risk and cribbage:
// a built bundle + static shell + assets in plugins/sorry/client, with the
// component sources living in src/clients/sorry (covered by the vitest suite).

for (const f of ['index.html', 'style.css', 'app.js']) {
  test(`sorry client bundle has ${f}`, () => {
    assert.ok(existsSync(resolve(root, 'plugins/sorry/client', f)), `missing ${f}`);
  });
}

test('sorry React sources exist in src/clients/sorry', () => {
  for (const f of ['main.tsx', 'SorryApp.tsx', 'Board.tsx']) {
    assert.ok(
      existsSync(resolve(root, 'src/clients/sorry', f)),
      `missing src/clients/sorry/${f}`,
    );
  }
});

// User directive (parquet trick): the board is rendered from a pre-baked
// tile-grid image mapped 1:1 to the cell grid, NOT drawn per-cell in DOM/CSS.
// That requires a baked board image asset to ship with the client.
test('sorry client ships a baked board image asset (parquet trick)', () => {
  const dir = resolve(root, 'plugins/sorry/client/assets');
  assert.ok(existsSync(dir), 'plugins/sorry/client/assets/ is missing');
  const images = readdirSync(dir).filter((f) => /\.(png|jpe?g|webp|avif)$/i.test(f));
  assert.ok(
    images.length > 0,
    'expected at least one baked board image in plugins/sorry/client/assets',
  );
});
