// Drift guard: the presentation art map (src/clients/clue/card-art.js) must
// stay in exact sync with the engine's card catalog (plugins/clue/server/
// cards.js) — every card has exactly one entry, correct category, non-empty
// label + glyph, and there are no orphan ids. Mirrors clue-board-drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_ART } from '../src/clients/clue/card-art.js';
import { WEAPONS, ROOMS, ALL_CARDS, categoryOf } from '../plugins/clue/server/cards.js';

test('every engine card id has exactly one CARD_ART entry', () => {
  assert.deepEqual(Object.keys(CARD_ART).sort(), [...ALL_CARDS].sort());
});

test('each entry carries the correct category and non-empty label + glyph', () => {
  for (const id of ALL_CARDS) {
    const art = CARD_ART[id];
    assert.ok(art, `missing CARD_ART entry for ${id}`);
    assert.equal(art.category, categoryOf(id), `wrong category for ${id}`);
    assert.ok(typeof art.label === 'string' && art.label.length > 0, `label for ${id}`);
    assert.ok(typeof art.glyph === 'string' && art.glyph.length > 0, `glyph for ${id}`);
    assert.ok('file' in art, `file key for ${id}`);
    assert.ok(art.file === null || typeof art.file === 'string', `file type for ${id}`);
  }
});

test('the six suspects map to their canonical persona portrait filenames', () => {
  const expected = {
    scarlett: 'miss-scarlett', mustard: 'colonel-mustard', white: 'mrs-white',
    green: 'mr-green', peacock: 'mrs-peacock', plum: 'professor-plum',
  };
  for (const [id, file] of Object.entries(expected)) {
    assert.equal(CARD_ART[id].file, file, `suspect ${id} portrait file`);
  }
});

test('every weapon and room filename equals its id', () => {
  for (const id of WEAPONS) {
    assert.equal(CARD_ART[id].file, id, `weapon ${id} filename equals id`);
  }
  for (const id of ROOMS) {
    assert.equal(CARD_ART[id].file, id, `room ${id} filename equals id`);
  }
});
