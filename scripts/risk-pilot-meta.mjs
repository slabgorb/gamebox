#!/usr/bin/env node
// Builds data/risk-corpus/pilot/pilot-meta.json from the pairing JSONL
// files plus the persona catalog. Idempotent — re-running just overwrites.
//
// Usage:
//   node scripts/risk-pilot-meta.mjs <dir>
//
// Reads every *.jsonl in <dir>, counts games and turns, looks up persona
// system prompts, and writes pilot-meta.json.

import { readdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPersonaCatalog } from '../src/server/ai/persona-catalog.js';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PERSONA_DIR = resolve(PROJECT_ROOT, 'data', 'ai-personas');
const DEFAULT_MODEL = 'claude-sonnet-4-6';

export function buildPilotMeta({ dir, personas, model = DEFAULT_MODEL }) {
  const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  const pairings = [];
  const seenPersonas = new Set();
  let totalGames = 0;
  let totalTurns = 0;
  let earliestMtime = Infinity;
  let latestMtime = 0;

  for (const f of files) {
    const path = join(dir, f);
    const stat = statSync(path);
    earliestMtime = Math.min(earliestMtime, stat.mtimeMs);
    latestMtime = Math.max(latestMtime, stat.mtimeMs);

    const lines = readFileSync(path, 'utf8').split('\n').filter(l => l.trim());
    if (lines.length === 0) continue;

    let pairingSideA = null;
    let pairingSideB = null;
    let pairingGames = 0;

    for (const line of lines) {
      const obj = JSON.parse(line);
      const { personaA, personaB, turnCount } = obj;
      if (!personas[personaA]) throw new Error(`pilot-meta: unknown persona '${personaA}' in ${f}`);
      if (!personas[personaB]) throw new Error(`pilot-meta: unknown persona '${personaB}' in ${f}`);
      seenPersonas.add(personaA);
      seenPersonas.add(personaB);
      if (pairingSideA == null) { pairingSideA = personaA; pairingSideB = personaB; }
      pairingGames += 1;
      totalGames += 1;
      totalTurns += turnCount ?? 0;
    }

    pairings.push({ sideA: pairingSideA, sideB: pairingSideB, games: pairingGames, file: f });
  }

  const personaSystemPrompts = {};
  for (const id of seenPersonas) {
    personaSystemPrompts[id] = personas[id].systemPrompt;
  }

  const startedAt = files.length ? new Date(earliestMtime).toISOString() : new Date().toISOString();
  const completedAt = files.length ? new Date(latestMtime).toISOString() : new Date().toISOString();

  return { model, personaSystemPrompts, pairings, totalGames, totalTurns, startedAt, completedAt };
}

function personasFromCatalog() {
  const cat = loadPersonaCatalog(PERSONA_DIR);
  const out = {};
  for (const [id, p] of cat.entries()) out[id] = p;
  return out;
}

function main() {
  const dir = process.argv[2];
  if (!dir) {
    console.error('usage: risk-pilot-meta.mjs <dir>');
    process.exit(1);
  }
  const meta = buildPilotMeta({ dir, personas: personasFromCatalog() });
  const outPath = join(dir, 'pilot-meta.json');
  writeFileSync(outPath, JSON.stringify(meta, null, 2));
  console.log(`wrote ${outPath} (${meta.totalGames} games, ${meta.totalTurns} turns)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
