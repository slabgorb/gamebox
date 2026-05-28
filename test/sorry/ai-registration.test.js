import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { loadPersonaCatalog } from '../../src/server/ai/persona-catalog.js';

// loadPersonaCatalog returns a Map keyed by persona id — iterate its values,
// do not call .filter on the Map directly.
const PERSONA_DIR = join(process.cwd(), 'data', 'ai-personas');

function loadSorry() {
  const catalog = loadPersonaCatalog(PERSONA_DIR);
  const sorry = [...catalog.values()].filter((p) => p.games.includes('sorry'));
  return { catalog, sorry };
}

// =========================================================================
// AC 9 — both personas load and are scoped to sorry
// =========================================================================

test('persona catalog: at least two personas are scoped to sorry', () => {
  const { sorry } = loadSorry();
  assert.ok(sorry.length >= 2, `expected >=2 sorry personas, got ${sorry.length}`);
  const ids = sorry.map((p) => p.id);
  assert.ok(ids.includes('the-bully'), 'the-bully must be scoped to sorry');
  assert.ok(ids.includes('the-tortoise'), 'the-tortoise must be scoped to sorry');
});

// =========================================================================
// AC 5 — the-bully persona
// =========================================================================

test('the-bully persona: required fields, sorry scope, and voice examples', () => {
  const { catalog } = loadSorry();
  const bully = catalog.get('the-bully');
  assert.ok(bully, 'the-bully persona must exist');
  assert.equal(bully.displayName, 'The Bully');
  assert.ok(bully.games.includes('sorry'));
  assert.ok(bully.systemPrompt.length > 0, 'systemPrompt must be non-empty');
  assert.ok(bully.color.length > 0, 'color must be non-empty');
  assert.ok(bully.glyph.length > 0, 'glyph must be non-empty');
  assert.ok(bully.voiceExamples.length >= 2, 'the-bully needs >=2 voice examples');
});

// =========================================================================
// AC 6 — the-tortoise persona
// =========================================================================

test('the-tortoise persona: required fields, sorry scope, and voice examples', () => {
  const { catalog } = loadSorry();
  const tortoise = catalog.get('the-tortoise');
  assert.ok(tortoise, 'the-tortoise persona must exist');
  assert.equal(tortoise.displayName, 'The Tortoise');
  assert.ok(tortoise.games.includes('sorry'));
  assert.ok(tortoise.systemPrompt.length > 0, 'systemPrompt must be non-empty');
  assert.ok(tortoise.color.length > 0, 'color must be non-empty');
  assert.ok(tortoise.glyph.length > 0, 'glyph must be non-empty');
  assert.ok(tortoise.voiceExamples.length >= 2, 'the-tortoise needs >=2 voice examples');
});

// =========================================================================
// AC 7 — the sorry adapter is registered in the AI subsystem
//
// The llmByGameType loop in bootAiSubsystem creates one client entry per key
// in the adapters map. A 'sorry' entry exists IFF the adapter is registered.
// (Asserting on llmByGameType is meaningful — a missing adapter does NOT throw
// from scheduleTurn, it silently marks the game stalled, so doesNotThrow would
// be vacuous here.)
// =========================================================================

test('bootAiSubsystem: registers the sorry adapter (per-game-type client created)', async () => {
  const { openDb } = await import('../../src/server/db.js');
  const { bootAiSubsystem } = await import('../../src/server/ai/index.js');

  const dir = mkdtempSync(join(tmpdir(), 'boot-sorry-'));
  const db = openDb(join(dir, 'test.db'));
  const llm = { send: async () => ({ text: '{"moveId":"out:0","banter":""}' }) };

  const { llmByGameType } = bootAiSubsystem({ db, sse: { broadcast() {} }, llm, personaDir: PERSONA_DIR });
  assert.ok(llmByGameType.sorry, 'sorry must have a per-game-type client → adapter registered');
  // Regression guard: existing adapters remain wired alongside sorry.
  assert.ok(llmByGameType.backgammon, 'backgammon adapter must remain registered');
});
