// E6-5 Task 3 — bootAiSubsystem wires a clue adapter: a `clue` key appears in
// llmByGameType (proof the adapters map gained clue), the six games:[clue]
// personas load, and their bot users exist. The existing five adapters must
// be unperturbed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/server/db.js';
import { FakeLlmClient } from '../src/server/ai/fake-llm-client.js';
import { bootAiSubsystem } from '../src/server/ai/index.js';

const CLUE_PERSONAS = [
  'miss-scarlett', 'colonel-mustard', 'mrs-white',
  'mr-green', 'mrs-peacock', 'professor-plum',
];

function boot() {
  const dir = mkdtempSync(join(tmpdir(), 'clue-adapter-'));
  const db = openDb(join(dir, 'test.db'));
  const sse = { broadcast() {} };
  const llm = new FakeLlmClient([]);
  const personaDir = join(process.cwd(), 'data', 'ai-personas');
  return { db, ...bootAiSubsystem({ db, sse, llm, personaDir }) };
}

test('bootAiSubsystem wires a clue adapter (llmByGameType gains a clue entry)', () => {
  const { llmByGameType } = boot();
  assert.ok(llmByGameType.clue, 'clue missing from llmByGameType — no clue adapter registered');
  // The existing adapters must all still be wired.
  for (const g of ['cribbage', 'backgammon', 'words', 'risk', 'sorry']) {
    assert.ok(llmByGameType[g], `${g} adapter lost during clue registration`);
  }
});

test('the six games:[clue] personas load and became bot users', () => {
  const { db, personas } = boot();
  for (const id of CLUE_PERSONAS) {
    const p = personas.get(id);
    assert.ok(p, `persona ${id} not loaded`);
    assert.ok(p.games.includes('clue'), `persona ${id} is not clue-scoped`);
    const row = db.prepare('SELECT id, is_bot FROM users WHERE persona_id = ?').get(id);
    assert.ok(row, `no bot user row for ${id}`);
    assert.equal(row.is_bot, 1);
  }
});
