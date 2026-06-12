import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

// This file lives in test/sorry/ (two levels below the repo root), unlike the
// test/<plugin>-client-files.test.js convention which sits directly under test/.
const root = resolve(import.meta.dirname, '..', '..');

// E3-6 delivers the Sorry! client as a React app, mirroring risk and cribbage:
// a built bundle + static shell + assets in plugins/sorry/client, with the
// component sources living in src/clients/sorry (covered by the vitest suite).

for (const f of ['index.html', 'style.css', 'app.js']) {
  test(`sorry client bundle has ${f}`, () => {
    assert.ok(existsSync(resolve(root, 'plugins/sorry/client', f)), `missing ${f}`);
  });
}

test('sorry React sources exist in src/clients/sorry', () => {
  for (const f of ['main.tsx', 'SorryApp.tsx', 'Board.tsx', 'Board4P.tsx']) {
    assert.ok(
      existsSync(resolve(root, 'src/clients/sorry', f)),
      `missing src/clients/sorry/${f}`,
    );
  }
});

// The "Cabinet" redesign (Claude Design handoff) replaces the pre-baked board
// PNG with an inline SVG board (Board4P.tsx), matching the risk-board inline-SVG
// precedent. The DOM still overlays the live pieces on top, so the client must
// ship the pawn/card art it references.
test('sorry client ships the pawn + card art the overlay references', () => {
  const dir = resolve(root, 'plugins/sorry/client/assets');
  assert.ok(existsSync(dir), 'plugins/sorry/client/assets/ is missing');
  const images = readdirSync(dir);
  for (const f of ['checker-red.png', 'checker-blue.png', 'card-back.png']) {
    assert.ok(images.includes(f), `expected plugins/sorry/client/assets/${f}`);
  }
});
