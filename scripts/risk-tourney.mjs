#!/usr/bin/env node
// Risk tournament harness. Runs N headless games between two LLM-backed bots
// and writes per-turn transcripts + an aggregate summary with Wilson 95% CIs.
//
// Usage:
//   node scripts/risk-tourney.mjs \
//     --a claude:claude-haiku-4-5-20251001 \
//     --b ollama:llama3.1:8b \
//     --persona-a admiral-vonnegut \
//     --persona-b admiral-vonnegut \
//     --games 20 \
//     --seed 42 \
//     --out results/run.jsonl
//
// Backend string: "<kind>:<model>" where kind is "claude" or "ollama".

import { mkdirSync, createWriteStream } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaudeCliClient } from '../src/server/ai/llm-client.js';
import { OllamaClient } from '../src/server/ai/ollama-client.js';
import { loadPersonaCatalog } from '../src/server/ai/persona-catalog.js';
import { runGame, wilsonInterval } from '../src/server/ai/headless-game.js';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PERSONA_DIR = resolve(PROJECT_ROOT, 'data', 'ai-personas');

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i];
    const v = argv[i + 1];
    if (!k.startsWith('--')) throw new Error(`expected flag, got: ${k}`);
    args[k.slice(2)] = v;
  }
  for (const required of ['a', 'b', 'persona-a', 'persona-b', 'games', 'out']) {
    if (args[required] == null) {
      throw new Error(`missing required flag --${required}`);
    }
  }
  args.games = parseInt(args.games, 10);
  if (!Number.isInteger(args.games) || args.games < 1) {
    throw new Error(`--games must be a positive integer`);
  }
  args.seed = args.seed != null ? parseInt(args.seed, 10) : 0;
  args['max-turns'] = args['max-turns'] != null ? parseInt(args['max-turns'], 10) : 500;
  return args;
}

function makeClient(backend) {
  const [kind, ...rest] = backend.split(':');
  const model = rest.join(':');
  if (!model) throw new Error(`invalid backend "${backend}", expected kind:model`);
  if (kind === 'claude') return new ClaudeCliClient({ model });
  if (kind === 'ollama') return new OllamaClient({ model });
  throw new Error(`unknown backend kind: ${kind}`);
}

function pct(x) { return (x * 100).toFixed(1) + '%'; }

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const personas = loadPersonaCatalog(PERSONA_DIR);
  const personaA = personas.get(args['persona-a']);
  const personaB = personas.get(args['persona-b']);
  if (!personaA) throw new Error(`persona not found: ${args['persona-a']}`);
  if (!personaB) throw new Error(`persona not found: ${args['persona-b']}`);

  const clientA = makeClient(args.a);
  const clientB = makeClient(args.b);

  mkdirSync(dirname(resolve(args.out)), { recursive: true });
  const out = createWriteStream(resolve(args.out), { flags: 'w' });

  const wins = { a: 0, b: 0, draw: 0 };
  const totalStart = Date.now();

  for (let i = 0; i < args.games; i++) {
    // Alternate which backend plays side A so the side-A advantage cancels out.
    const swap = i % 2 === 1;
    const llmA = swap ? clientB : clientA;
    const llmB = swap ? clientA : clientB;
    const pA = swap ? personaB : personaA;
    const pB = swap ? personaA : personaB;
    const labelA = swap ? args.b : args.a;
    const labelB = swap ? args.a : args.b;

    const result = await runGame({
      llmA, llmB, personaA: pA, personaB: pB,
      seed: args.seed + i, maxTurns: args['max-turns'],
    });

    // Map side-A/B winner back to the configured backend labels.
    let winnerBackend = null;
    if (result.winner === 'a') winnerBackend = labelA;
    else if (result.winner === 'b') winnerBackend = labelB;

    if (winnerBackend === args.a) wins.a++;
    else if (winnerBackend === args.b) wins.b++;
    else wins.draw++;

    const line = JSON.stringify({
      game: i,
      sideABackend: labelA,
      sideBBackend: labelB,
      personaA: pA.id,
      personaB: pB.id,
      seed: args.seed + i,
      winner: result.winner,
      winnerBackend,
      endReason: result.endReason,
      turnCount: result.turnCount,
      durationMs: result.durationMs,
      forfeitReason: result.forfeitReason ?? null,
      transcript: result.transcript,
    });
    out.write(line + '\n');

    const secs = (result.durationMs / 1000).toFixed(1);
    console.log(
      `[${i + 1}/${args.games}] A=${labelA} B=${labelB} → ` +
      `winner=${winnerBackend ?? 'draw'} (${result.endReason}), ` +
      `turns=${result.turnCount}, ${secs}s`
    );
  }

  out.end();

  const totalSecs = ((Date.now() - totalStart) / 1000).toFixed(0);
  const ciA = wilsonInterval(wins.a, args.games);
  const ciB = wilsonInterval(wins.b, args.games);
  console.log(`\nTournament complete: ${args.games} games, ${totalSecs}s`);
  console.log(
    `  ${args.a}: ${wins.a} wins (${pct(wins.a / args.games)}, ` +
    `95% CI: ${pct(ciA.low)}–${pct(ciA.high)})`
  );
  console.log(
    `  ${args.b}: ${wins.b} wins (${pct(wins.b / args.games)}, ` +
    `95% CI: ${pct(ciB.low)}–${pct(ciB.high)})`
  );
  console.log(`  draws/timeouts: ${wins.draw}`);
  console.log(`\nTranscripts written to ${args.out}`);
}

main().catch(err => {
  console.error(`risk-tourney: ${err.message}`);
  process.exit(1);
});
