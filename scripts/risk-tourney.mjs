#!/usr/bin/env node
// Risk tournament harness. Runs N headless games between two LLM-backed bots
// and writes per-turn transcripts + an aggregate summary with Wilson 95% CIs.
//
// Usage:
//   node scripts/risk-tourney.mjs \
//     --a claude:claude-sonnet-4-6 \
//     --b claude:claude-sonnet-4-6 \
//     --persona-a admiral-vonnegut \
//     --persona-b admiral-vonnegut \
//     --games 25 \
//     --seed 42 \
//     --mode collection \
//     --out data/risk-corpus/pilot/vonnegut-vonnegut.jsonl
//
// Backend string: "<kind>:<model>" where kind is "claude" or "ollama".
// --mode: "live" (default) or "collection" (drops banter from prompt).
//
// Append-and-resume: --out is opened in append mode. If the file already
// contains N JSONL lines, those games are considered done and skipped.

import {
  mkdirSync, createWriteStream, existsSync, readFileSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ClaudeCliClient } from '../src/server/ai/llm-client.js';
import { OllamaClient } from '../src/server/ai/ollama-client.js';
import { loadPersonaCatalog } from '../src/server/ai/persona-catalog.js';
import { runGame, wilsonInterval } from '../src/server/ai/headless-game.js';
import { runWithRateLimitRetry } from '../src/server/ai/retry.js';
import { BUILD_TURN_PROMPT_VERSION } from '../plugins/risk/server/ai/prompts.js';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PERSONA_DIR = resolve(PROJECT_ROOT, 'data', 'ai-personas');

// Count completed games in an existing JSONL output file. Lines that are
// blank are skipped (defensive — we never write blanks, but a partial write
// during a crash could leave one). Returns 0 if the file does not exist.
export function countCompletedGames(path) {
  if (!existsSync(path)) return 0;
  const text = readFileSync(path, 'utf8');
  if (!text) return 0;
  return text.split('\n').filter(line => line.trim().length > 0).length;
}

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
  args.mode = args.mode ?? 'live';
  if (args.mode !== 'live' && args.mode !== 'collection') {
    throw new Error(`--mode must be 'live' or 'collection' (got '${args.mode}')`);
  }
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

function captureGitSha() {
  try {
    return execSync('git rev-parse HEAD', {
      cwd: PROJECT_ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
  } catch {
    return null;
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const personas = loadPersonaCatalog(PERSONA_DIR);
  const personaA = personas.get(args['persona-a']);
  const personaB = personas.get(args['persona-b']);
  if (!personaA) throw new Error(`persona not found: ${args['persona-a']}`);
  if (!personaB) throw new Error(`persona not found: ${args['persona-b']}`);

  const clientA = makeClient(args.a);
  const clientB = makeClient(args.b);

  const outPath = resolve(args.out);
  mkdirSync(dirname(outPath), { recursive: true });

  const startIndex = countCompletedGames(outPath);
  if (startIndex > 0) {
    console.log(`[resume] ${startIndex} completed games found in ${args.out}, skipping ahead`);
    if (startIndex >= args.games) {
      console.log(`[resume] all ${args.games} games already complete; nothing to do`);
      return;
    }
  }

  const out = createWriteStream(outPath, { flags: 'a' });
  const harnessGitSha = captureGitSha();
  const wins = { a: 0, b: 0, draw: 0 };
  const totalStart = Date.now();

  for (let i = startIndex; i < args.games; i++) {
    const swap = i % 2 === 1;
    const llmA = swap ? clientB : clientA;
    const llmB = swap ? clientA : clientB;
    const pA = swap ? personaB : personaA;
    const pB = swap ? personaA : personaB;
    const labelA = swap ? args.b : args.a;
    const labelB = swap ? args.a : args.b;

    let result;
    try {
      result = await runWithRateLimitRetry(() => runGame({
        llmA, llmB, personaA: pA, personaB: pB,
        seed: args.seed + i, maxTurns: args['max-turns'],
        mode: args.mode,
      }));
    } catch (err) {
      // Second consecutive rate-limit failure. Checkpoint and exit cleanly
      // — the user re-runs the same command to resume.
      out.end();
      console.error(`[rate-limited twice in a row] checkpointing at game ${i}`);
      console.error(`[resume with: node scripts/risk-tourney.mjs ${process.argv.slice(2).join(' ')}]`);
      process.exit(0);
    }

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
      harnessGitSha,
      buildTurnPromptVersion: BUILD_TURN_PROMPT_VERSION,
      collectionMode: args.mode === 'collection',
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
  const playedCount = args.games - startIndex;
  const ciA = wilsonInterval(wins.a, playedCount || 1);
  const ciB = wilsonInterval(wins.b, playedCount || 1);
  console.log(`\nTournament complete: ${args.games} games (${playedCount} played this run), ${totalSecs}s`);
  console.log(
    `  ${args.a}: ${wins.a} wins (${pct(wins.a / (playedCount || 1))}, ` +
    `95% CI: ${pct(ciA.low)}–${pct(ciA.high)})`
  );
  console.log(
    `  ${args.b}: ${wins.b} wins (${pct(wins.b / (playedCount || 1))}, ` +
    `95% CI: ${pct(ciB.low)}–${pct(ciB.high)})`
  );
  console.log(`  draws/timeouts: ${wins.draw}`);
  console.log(`\nTranscripts written to ${args.out}`);
}

// Only run main() when invoked as a script — never when imported for tests.
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error(`risk-tourney: ${err.message}`);
    process.exit(1);
  });
}
