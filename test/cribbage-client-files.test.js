import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

// Post-React-migration deliverable: a built bundle + static shell + assets.
// Component sources live in src/clients/cribbage/ and src/clients/shared/ and
// are covered by vitest.
for (const f of ['index.html', 'style.css', 'app.js']) {
  test(`cribbage client has ${f}`, () => {
    assert.ok(
      existsSync(resolve(root, 'plugins/cribbage/client', f)),
      `missing ${f}`,
    );
  });
}

test('cribbage React sources exist in src/clients/cribbage', () => {
  for (const f of ['main.tsx', 'CribbageApp.tsx', 'PegBoard.tsx', 'Hand.tsx']) {
    assert.ok(
      existsSync(resolve(root, 'src/clients/cribbage', f)),
      `missing src/clients/cribbage/${f}`,
    );
  }
});

test('shared React layer has the Cycle 2 additions', () => {
  for (const f of ['OpponentCard.tsx', 'OpponentBanter.tsx', 'GameChrome.tsx', 'Card.tsx']) {
    assert.ok(
      existsSync(resolve(root, 'src/clients/shared', f)),
      `missing src/clients/shared/${f}`,
    );
  }
});

test('vanilla cribbage modules are removed', () => {
  for (const f of ['hand.js', 'peg-board.js', 'pegging.js', 'show.js', 'sounds.js']) {
    assert.ok(
      !existsSync(resolve(root, 'plugins/cribbage/client', f)),
      `expected ${f} to be removed`,
    );
  }
});
