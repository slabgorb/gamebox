// E6-4 Task 6 — six suspect personas as games:[clue] catalog YAMLs.
//
// Contract (AC #3 + persona-gating doctrine): without game-scoped personas a
// plugin has zero AI opponents. Ids equal filenames (loader-enforced),
// colours are the canonical pawn colours from the plan table, and every
// systemPrompt carries the strict JSON-response contract. Portraits
// auto-load by persona id — pinning the ids here pins the Plan 4 portrait
// drop too.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { loadPersonaCatalog } from '../src/server/ai/persona-catalog.js';

const DIR = resolve(import.meta.dirname, '..', 'data', 'ai-personas');

// Canonical pawn colours (plan Task 6 table).
const EXPECTED = {
  'miss-scarlett': { displayName: 'Miss Scarlett', color: '#c0392b' },
  'colonel-mustard': { displayName: 'Colonel Mustard', color: '#d4a017' },
  'mrs-white': { displayName: 'Mrs. White', color: '#ecf0f1' },
  'mr-green': { displayName: 'Mr. Green', color: '#27ae60' },
  'mrs-peacock': { displayName: 'Mrs. Peacock', color: '#2980b9' },
  'professor-plum': { displayName: 'Professor Plum', color: '#8e44ad' },
};

test('the six clue personas load, scoped games:[clue], canonical colours', () => {
  const catalog = loadPersonaCatalog(DIR); // throws if ANY catalog file is malformed
  for (const [id, want] of Object.entries(EXPECTED)) {
    const p = catalog.get(id);
    assert.ok(p, `missing persona ${id}`);
    assert.equal(p.displayName, want.displayName);
    assert.deepEqual(p.games, ['clue'], `${id} must be scoped to clue only`);
    assert.equal(p.color.toLowerCase(), want.color, `${id} wears the canonical pawn colour`);
    assert.ok(typeof p.glyph === 'string' && p.glyph.length > 0);
  }
});

test('every clue systemPrompt carries the JSON contract and the keep-secrets rule', () => {
  const catalog = loadPersonaCatalog(DIR);
  for (const id of Object.keys(EXPECTED)) {
    const p = catalog.get(id);
    assert.ok(p.systemPrompt.includes('moveId'), `${id}: strict JSON moveId instruction`);
    assert.ok(p.systemPrompt.includes('banter'), `${id}: banter field instruction`);
    assert.ok(/secret/i.test(p.systemPrompt),
      `${id}: must be told to keep deductions secret — banter must never leak the ledger`);
  }
});

test('the six personas are visually distinct (unique colours and glyphs)', () => {
  const catalog = loadPersonaCatalog(DIR);
  const ids = Object.keys(EXPECTED);
  const colors = ids.map((id) => catalog.get(id).color.toLowerCase());
  const glyphs = ids.map((id) => catalog.get(id).glyph);
  assert.equal(new Set(colors).size, ids.length, 'pawn colours must not collide');
  assert.equal(new Set(glyphs).size, ids.length, 'glyphs must not collide');
});

test('adding clue personas does not perturb the existing catalog', () => {
  const catalog = loadPersonaCatalog(DIR);
  // Spot-check a shipped persona survives alongside the six new files.
  assert.ok(catalog.get('colonel-jaune'), 'existing risk persona still loads');
  assert.ok(catalog.size >= 6 + 14, 'six clue personas join the shipped fourteen');
});
