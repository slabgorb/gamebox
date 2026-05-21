# Risk Bot Tournament Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a headless CLI that runs N Risk games between any two LLM-backed bots (Claude or local Ollama) and outputs per-turn transcripts + aggregate win-rate with confidence intervals — the eval rig that gates all future Risk-bot training work.

**Architecture:** Three small, single-purpose modules. `OllamaClient` matches the existing `ClaudeCliClient` shape so it drops into the unmodified `chooseAction` API. `runGame()` is a pure in-memory loop that drives Risk turn-by-turn using existing `applyRiskAction` + `resolveAttack` — no DB, no orchestrator, no AI-session table. The CLI script wires backend strings to clients, runs the loop N times alternating sides, writes JSONL, and prints a Wilson-CI summary.

**Tech Stack:** Node 20 ESM, `node --test` (built-in), built-in `fetch` for Ollama HTTP, existing Risk plugin modules (`plugins/risk/server/{state,actions,combat}.js`), existing AI infrastructure (`src/server/ai/{llm-client,persona-catalog}.js`).

**Spec:** `docs/superpowers/specs/2026-05-21-risk-bot-tourney-harness-design.md`

---

## File Structure

**New files:**
- `src/server/ai/ollama-client.js` — Ollama HTTP client matching `ClaudeCliClient` interface
- `src/server/ai/headless-game.js` — `runGame()` pure-function game loop with seeded RNG + Wilson CI helper
- `scripts/risk-tourney.mjs` — CLI entry point
- `test/ai-ollama-client.test.js` — unit tests for `OllamaClient` (stubbed fetch)
- `test/ai-headless-game.test.js` — unit tests for `runGame()` (stub LLM clients), seeded RNG, Wilson CI

**Unmodified existing files (referenced but not changed):**
- `plugins/risk/server/ai/risk-player.js` — `chooseAction` consumed as-is
- `plugins/risk/server/state.js` — `buildInitialState` consumed as-is
- `plugins/risk/server/actions.js` — `applyRiskAction` consumed as-is
- `plugins/risk/server/combat.js` — `resolveAttack` consumed as-is
- `src/server/ai/llm-client.js` — `ClaudeCliClient` consumed as-is
- `src/server/ai/persona-catalog.js` — `loadPersonaCatalog` consumed as-is

---

## Task 1: Seeded RNG + Wilson CI helpers

**Files:**
- Create: `src/server/ai/headless-game.js` (skeleton with two exports)
- Test: `test/ai-headless-game.test.js`

These are tiny pure functions with no dependencies. Doing them first means later tasks can import them.

- [ ] **Step 1: Write the failing tests**

Create `test/ai-headless-game.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, wilsonInterval } from '../src/server/ai/headless-game.js';

test('mulberry32: deterministic for same seed', () => {
  const a = mulberry32(42);
  const b = mulberry32(42);
  const seqA = [a(), a(), a(), a(), a()];
  const seqB = [b(), b(), b(), b(), b()];
  assert.deepEqual(seqA, seqB);
});

test('mulberry32: different seeds produce different sequences', () => {
  const a = mulberry32(1);
  const b = mulberry32(2);
  assert.notEqual(a(), b());
});

test('mulberry32: values in [0, 1)', () => {
  const r = mulberry32(123);
  for (let i = 0; i < 1000; i++) {
    const v = r();
    assert.ok(v >= 0 && v < 1, `value ${v} out of range`);
  }
});

test('wilsonInterval: 0 wins of 0 trials returns [0, 0]', () => {
  const { low, high } = wilsonInterval(0, 0);
  assert.equal(low, 0);
  assert.equal(high, 0);
});

test('wilsonInterval: 12 wins of 20 returns ~[0.387, 0.781]', () => {
  const { low, high } = wilsonInterval(12, 20);
  assert.ok(Math.abs(low - 0.387) < 0.01, `low=${low}`);
  assert.ok(Math.abs(high - 0.781) < 0.01, `high=${high}`);
});

test('wilsonInterval: 0 wins of 20 has high > 0', () => {
  const { low, high } = wilsonInterval(0, 20);
  assert.equal(low, 0);
  assert.ok(high > 0 && high < 0.2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ai-headless-game.test.js`
Expected: FAIL with "Cannot find module" for `src/server/ai/headless-game.js`.

- [ ] **Step 3: Implement the helpers**

Create `src/server/ai/headless-game.js`:

```javascript
// Mulberry32 PRNG — small, fast, well-distributed, deterministic from seed.
// Plenty good for game-state randomization and dice rolls; not for crypto.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Wilson score interval for a binomial proportion at 95% confidence.
// Returns { low, high } each in [0, 1]. Defined as [0, 0] when n === 0.
export function wilsonInterval(wins, n, z = 1.96) {
  if (n === 0) return { low: 0, high: 0 };
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return {
    low: Math.max(0, (centre - margin) / denom),
    high: Math.min(1, (centre + margin) / denom),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ai-headless-game.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/headless-game.js test/ai-headless-game.test.js
git commit -m "feat(risk-tourney): seeded RNG and Wilson CI helpers"
```

---

## Task 2: OllamaClient

**Files:**
- Create: `src/server/ai/ollama-client.js`
- Test: `test/ai-ollama-client.test.js`

Match the `ClaudeCliClient.send({prompt, sessionId, systemPrompt})` interface. Ollama is stateless across requests, so `sessionId` is generated on first call and round-tripped to satisfy the interface contract.

- [ ] **Step 1: Write the failing tests**

Create `test/ai-ollama-client.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaClient } from '../src/server/ai/ollama-client.js';

function fakeFetch(responder) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init);
  };
  return { fetch, calls };
}

function okResponse(text) {
  return new Response(JSON.stringify({ message: { content: text } }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}

test('OllamaClient: posts chat request with model + system + user', async () => {
  const { fetch, calls } = fakeFetch(() => okResponse('hello world'));
  const client = new OllamaClient({ model: 'llama3.1:8b', fetch });
  const r = await client.send({ prompt: 'pick a move', systemPrompt: 'you are a bot' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://localhost:11434/api/chat');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'llama3.1:8b');
  assert.equal(body.stream, false);
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'you are a bot' },
    { role: 'user', content: 'pick a move' },
  ]);
  assert.equal(r.text, 'hello world');
  assert.equal(typeof r.sessionId, 'string');
});

test('OllamaClient: omits system message when systemPrompt is null', async () => {
  const { fetch, calls } = fakeFetch(() => okResponse('ok'));
  const client = new OllamaClient({ model: 'llama3.1:8b', fetch });
  await client.send({ prompt: 'hi', systemPrompt: null });
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }]);
});

test('OllamaClient: round-trips sessionId across calls', async () => {
  const { fetch } = fakeFetch(() => okResponse('ok'));
  const client = new OllamaClient({ model: 'llama3.1:8b', fetch });
  const first = await client.send({ prompt: 'a', systemPrompt: 's' });
  const second = await client.send({ prompt: 'b', sessionId: first.sessionId });
  assert.equal(second.sessionId, first.sessionId);
});

test('OllamaClient: throws on non-200 response', async () => {
  const { fetch } = fakeFetch(() => new Response('boom', { status: 500 }));
  const client = new OllamaClient({ model: 'llama3.1:8b', fetch });
  await assert.rejects(client.send({ prompt: 'x' }), /500/);
});

test('OllamaClient: throws on empty message content', async () => {
  const { fetch } = fakeFetch(() => okResponse(''));
  const client = new OllamaClient({ model: 'llama3.1:8b', fetch });
  await assert.rejects(client.send({ prompt: 'x' }), /empty/i);
});

test('OllamaClient: uses custom baseUrl', async () => {
  const { fetch, calls } = fakeFetch(() => okResponse('ok'));
  const client = new OllamaClient({
    model: 'llama3.1:8b', baseUrl: 'http://1.2.3.4:9999', fetch,
  });
  await client.send({ prompt: 'x' });
  assert.equal(calls[0].url, 'http://1.2.3.4:9999/api/chat');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ai-ollama-client.test.js`
Expected: FAIL with "Cannot find module" for `ollama-client.js`.

- [ ] **Step 3: Implement OllamaClient**

Create `src/server/ai/ollama-client.js`:

```javascript
import { randomUUID } from 'node:crypto';

export class OllamaClient {
  constructor({
    model,
    baseUrl = 'http://localhost:11434',
    timeoutMs = 180_000,
    fetch: fetchImpl = globalThis.fetch,
  } = {}) {
    if (!model) throw new Error('OllamaClient: model is required');
    this._model = model;
    this._baseUrl = baseUrl.replace(/\/+$/, '');
    this._timeoutMs = timeoutMs;
    this._fetch = fetchImpl;
  }

  async send({ prompt, sessionId, systemPrompt }) {
    const messages = [];
    if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
    messages.push({ role: 'user', content: prompt });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    let res;
    try {
      res = await this._fetch(`${this._baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this._model, messages, stream: false }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OllamaClient: HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.message?.content ?? '';
    if (!text) throw new Error('OllamaClient: empty response content');

    return { text, sessionId: sessionId ?? randomUUID() };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ai-ollama-client.test.js`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/ollama-client.js test/ai-ollama-client.test.js
git commit -m "feat(risk-tourney): Ollama HTTP client matching LLM interface"
```

---

## Task 3: `runGame()` — headless Risk game loop

**Files:**
- Modify: `src/server/ai/headless-game.js` (add `runGame` export)
- Modify: `test/ai-headless-game.test.js` (add `runGame` tests)

`runGame()` drives a fresh Risk game between two LLM clients. Critical detail: when a bot attacks, `applyRiskAction` sets `state.pendingCombat` and returns *without* resolving dice — in production the defender's *client* resolves the combat and POSTs back. In a headless harness both sides are bots, so the harness itself must call `resolveAttack` and re-submit the action with `payload.resolved` populated, acting as the defender.

- [ ] **Step 1: Add failing test for a deterministic stub-driven game**

Append to `test/ai-headless-game.test.js`:

```javascript
import { runGame } from '../src/server/ai/headless-game.js';

// Stub LLM that always picks the first move in the shortlist by returning
// the move id wrapped in the JSON shape parseLlmResponse expects.
function firstMoveLlm() {
  return {
    async send({ prompt }) {
      // The prompt is built by buildTurnPrompt and lists moves like:
      //   "[m1] setup-deploy ALA armies=1"
      // We grab the first "[mN]" token and return it.
      const m = prompt.match(/\[(m\d+)\]/);
      const id = m ? m[1] : 'm1';
      return {
        text: JSON.stringify({ moveId: id, banter: 'ok' }),
        sessionId: 'stub',
      };
    },
  };
}

const STUB_PERSONA = { id: 'stub', systemPrompt: 'stub system prompt' };

test('runGame: deterministic under same seed (two stub bots)', async () => {
  const a = await runGame({
    llmA: firstMoveLlm(), llmB: firstMoveLlm(),
    personaA: STUB_PERSONA, personaB: STUB_PERSONA,
    seed: 7, maxTurns: 1000,
  });
  const b = await runGame({
    llmA: firstMoveLlm(), llmB: firstMoveLlm(),
    personaA: STUB_PERSONA, personaB: STUB_PERSONA,
    seed: 7, maxTurns: 1000,
  });
  assert.equal(a.winner, b.winner);
  assert.equal(a.endReason, b.endReason);
  assert.equal(a.turnCount, b.turnCount);
});

test('runGame: returns transcript with one entry per turn', async () => {
  const r = await runGame({
    llmA: firstMoveLlm(), llmB: firstMoveLlm(),
    personaA: STUB_PERSONA, personaB: STUB_PERSONA,
    seed: 1, maxTurns: 1000,
  });
  assert.ok(r.transcript.length === r.turnCount);
  for (const entry of r.transcript) {
    assert.ok(['a', 'b'].includes(entry.side));
    assert.equal(typeof entry.phase, 'string');
    assert.equal(typeof entry.chosenMoveId, 'string');
    assert.ok(entry.stateBefore && typeof entry.stateBefore === 'object');
  }
});

test('runGame: respects maxTurns and reports timeout', async () => {
  const r = await runGame({
    llmA: firstMoveLlm(), llmB: firstMoveLlm(),
    personaA: STUB_PERSONA, personaB: STUB_PERSONA,
    seed: 1, maxTurns: 3,
  });
  assert.equal(r.endReason, 'timeout');
  assert.equal(r.winner, null);
  assert.equal(r.turnCount, 3);
});

test('runGame: LLM throw counts as forfeit for that side', async () => {
  const exploder = { async send() { throw new Error('boom'); } };
  const r = await runGame({
    llmA: exploder, llmB: firstMoveLlm(),
    personaA: STUB_PERSONA, personaB: STUB_PERSONA,
    seed: 1, maxTurns: 1000,
  });
  // Side A errors on first action → forfeits → B wins
  assert.equal(r.winner, 'b');
  assert.equal(r.endReason, 'forfeit');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ai-headless-game.test.js`
Expected: FAIL with "runGame is not a function" or similar.

- [ ] **Step 3: Implement `runGame()`**

Append to `src/server/ai/headless-game.js`:

```javascript
import { buildInitialState, userIdOf } from '../../../plugins/risk/server/state.js';
import { applyRiskAction } from '../../../plugins/risk/server/actions.js';
import { resolveAttack } from '../../../plugins/risk/server/combat.js';
import { chooseAction } from '../../../plugins/risk/server/ai/risk-player.js';

const FAKE_USER_A = 1;
const FAKE_USER_B = 2;

// Drive any pending combat by acting as the defender's client: roll dice
// with our seeded RNG via resolveAttack, then re-call applyRiskAction with
// a resolved payload, attributed to the defender (the actor proxy contract).
// Returns the updated state. May loop only once per attack; the resolved
// branch clears pendingCombat.
function resolvePendingCombat(state, rng) {
  const pc = state.pendingCombat;
  if (!pc) return state;
  const defenderArmies = state.territories[pc.to].armies;
  const outcome = resolveAttack({ force: pc.force, defenders: defenderArmies }, rng);
  const defenderUserId = userIdOf(state, pc.defenderIdx);
  const result = applyRiskAction({
    state,
    action: {
      type: 'attack',
      payload: {
        from: pc.from,
        to: pc.to,
        force: pc.force,
        resolved: {
          rounds: outcome.rounds,
          attackerSurvivors: outcome.attackerSurvivors,
          defenderSurvivors: outcome.defenderSurvivors,
          captured: outcome.captured,
        },
      },
    },
    actorId: defenderUserId,
    rng,
  });
  if (result.error) {
    throw new Error(`runGame: resolved combat rejected: ${result.error}`);
  }
  return result;
}

export async function runGame({
  llmA, llmB, personaA, personaB, seed, maxTurns = 500,
}) {
  const rng = mulberry32(seed);
  const t0 = Date.now();

  let state = buildInitialState({
    participants: [
      { side: 'a', userId: FAKE_USER_A },
      { side: 'b', userId: FAKE_USER_B },
    ],
    rng,
  });

  const transcript = [];
  let sessionA = null;
  let sessionB = null;

  for (let turn = 0; turn < maxTurns; turn++) {
    if (state.winner !== null) {
      return {
        winner: state.winner === 0 ? 'a' : 'b',
        endReason: 'win',
        turnCount: turn,
        durationMs: Date.now() - t0,
        transcript,
      };
    }

    const sideIdx = state.currentPlayer;
    const side = sideIdx === 0 ? 'a' : 'b';
    const llm = sideIdx === 0 ? llmA : llmB;
    const persona = sideIdx === 0 ? personaA : personaB;
    const sessionId = sideIdx === 0 ? sessionA : sessionB;

    let result;
    try {
      result = await chooseAction({
        llm, persona, sessionId,
        state, botPlayerIdx: sideIdx,
        userMessages: [],
      });
    } catch (err) {
      return {
        winner: sideIdx === 0 ? 'b' : 'a',
        endReason: 'forfeit',
        turnCount: turn,
        durationMs: Date.now() - t0,
        transcript,
        forfeitReason: err.message,
      };
    }

    if (sideIdx === 0) sessionA = result.sessionId;
    else sessionB = result.sessionId;

    transcript.push({
      turn,
      side,
      phase: state.phase,
      chosenMoveId: result.action.type,
      banter: result.banter,
      stateBefore: structuredClone(state),
      action: result.action,
    });

    const actorId = sideIdx === 0 ? FAKE_USER_A : FAKE_USER_B;
    const applied = applyRiskAction({ state, action: result.action, actorId, rng });
    if (applied.error) {
      // The bot chose a legal-shaped move that applyRiskAction rejected
      // (race/edge case). Treat as forfeit so the tournament continues.
      return {
        winner: sideIdx === 0 ? 'b' : 'a',
        endReason: 'forfeit',
        turnCount: turn + 1,
        durationMs: Date.now() - t0,
        transcript,
        forfeitReason: `apply rejected: ${applied.error}`,
      };
    }
    state = applied;

    // If the action was an attack-intent, applyRiskAction set pendingCombat;
    // resolve it now (the harness plays the defender's client).
    if (state.pendingCombat) {
      state = resolvePendingCombat(state, rng);
    }
  }

  return {
    winner: null,
    endReason: 'timeout',
    turnCount: maxTurns,
    durationMs: Date.now() - t0,
    transcript,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ai-headless-game.test.js`
Expected: PASS, all 10 tests.

If the determinism test fails because `chooseAction` calls something with `Date.now()` or wall-clock entropy, investigate `plugins/risk/server/ai/risk-player.js` and adjust the test to assert weaker determinism (e.g., same winner across runs but not necessarily same turn count). Do not weaken the test unless you've confirmed the engine itself is non-deterministic under fixed seed + stub LLM.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/headless-game.js test/ai-headless-game.test.js
git commit -m "feat(risk-tourney): headless runGame() with pendingCombat resolution"
```

---

## Task 4: CLI script `risk-tourney.mjs`

**Files:**
- Create: `scripts/risk-tourney.mjs`

No unit test for the CLI itself — it's thin glue over already-tested pieces. We'll smoke-test it manually in Task 5.

- [ ] **Step 1: Implement the CLI**

Create `scripts/risk-tourney.mjs`:

```javascript
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
```

- [ ] **Step 2: Verify it parses args and fails cleanly on missing flags**

Run: `node scripts/risk-tourney.mjs`
Expected: exit code 1 with `risk-tourney: missing required flag --a`.

Run: `node scripts/risk-tourney.mjs --a claude:claude-haiku-4-5-20251001 --b ollama:llama3.1:8b --persona-a admiral-vonnegut --persona-b admiral-vonnegut --games abc --out /tmp/x.jsonl`
Expected: exit code 1 with `risk-tourney: --games must be a positive integer`.

- [ ] **Step 3: Commit**

```bash
git add scripts/risk-tourney.mjs
git commit -m "feat(risk-tourney): CLI entry point with Wilson-CI summary"
```

---

## Task 5: Live smoke test — Claude Haiku self-play

**Files:** none (manual verification only)

This task confirms the harness actually runs end-to-end against the real Claude CLI. It costs a small amount of API budget (~$0.05). Skip this task if you don't have Claude CLI configured locally — the unit tests already cover correctness.

- [ ] **Step 1: Pick an available persona**

Run: `ls data/ai-personas/`
Expected: at least one `.yaml` file (e.g. `admiral-vonnegut.yaml`). Pick one and confirm its `games:` list includes `risk` — if not, pick a different one or any persona without a `games:` restriction.

- [ ] **Step 2: Run a 2-game Haiku-vs-Haiku tournament**

Run:
```bash
node scripts/risk-tourney.mjs \
  --a claude:claude-haiku-4-5-20251001 \
  --b claude:claude-haiku-4-5-20251001 \
  --persona-a admiral-vonnegut \
  --persona-b admiral-vonnegut \
  --games 2 \
  --seed 1 \
  --max-turns 200 \
  --out /tmp/risk-tourney-smoke.jsonl
```

Expected: progress lines for each game, a final summary, and a non-empty `/tmp/risk-tourney-smoke.jsonl`. Games may take several minutes each — that's normal for Haiku driving full Risk turns.

- [ ] **Step 3: Sanity-check the JSONL**

Run: `wc -l /tmp/risk-tourney-smoke.jsonl`
Expected: `2 /tmp/risk-tourney-smoke.jsonl`

Run: `node -e "const fs=require('fs'); for (const l of fs.readFileSync('/tmp/risk-tourney-smoke.jsonl','utf8').trim().split('\n')) { const r=JSON.parse(l); console.log(r.game, r.winnerBackend, r.endReason, r.turnCount, r.transcript.length); }"`
Expected: two lines, each with a winner backend (or `null` for draw/timeout), end reason, turn count, and a transcript length equal to the turn count.

- [ ] **Step 4: No commit** — smoke output is throwaway. Move on.

---

## Task 6: Document the harness in the README

**Files:**
- Modify: `README.md` (add a short section near the bottom)

Brief usage notes so a future you (or another dev) can find this without reading the source.

- [ ] **Step 1: Find an insertion point**

Run: `grep -n "^## " README.md | tail -20`
Pick the bottom of the file or just before any "License"/"Credits" section. Insert after the last meaningful section.

- [ ] **Step 2: Append the section**

Add this section at the chosen location (use Edit with the appropriate anchor):

```markdown
## Risk Bot Tournament Harness

Run N headless Risk games between two LLM-backed bots to evaluate one against another. Writes per-turn transcripts to JSONL (usable as training data later) and prints win-rate with Wilson 95% CIs.

```
node scripts/risk-tourney.mjs \
  --a claude:claude-haiku-4-5-20251001 \
  --b ollama:llama3.1:8b \
  --persona-a admiral-vonnegut \
  --persona-b admiral-vonnegut \
  --games 20 \
  --seed 42 \
  --max-turns 500 \
  --out results/run.jsonl
```

Backends: `claude:<model-id>` (uses the `claude` CLI), `ollama:<model-tag>` (HTTP to `localhost:11434`). Sides alternate game-to-game to cancel side-A advantage. Design: `docs/superpowers/specs/2026-05-21-risk-bot-tourney-harness-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs(risk-tourney): document tournament harness usage"
```

---

## Self-Review

**Spec coverage:**
- Headless CLI: Task 4 ✓
- Pluggable backend (Claude + Ollama): Tasks 2 + 4 ✓
- Per-game JSONL transcripts: Task 4 ✓
- Wilson 95% CI summary: Tasks 1 + 4 ✓
- No DB writes / no UI / no parallelism: respected throughout ✓
- One persona per side at CLI time: Task 4 ✓
- Errors → forfeit-and-continue: Task 3 ✓
- `maxTurns` timeout: Task 3 ✓
- pendingCombat resolution by harness: Task 3 ✓ (the non-obvious correctness requirement)
- Unit tests for OllamaClient, runGame, Wilson CI: Tasks 1–3 ✓
- README mention: Task 6 ✓

**Placeholder scan:** No "TBD"/"TODO"/"implement later". Every code step has full code; every command has expected output.

**Type consistency:**
- `runGame` signature in test (Task 3 Step 1) matches implementation (Task 3 Step 3): `{llmA, llmB, personaA, personaB, seed, maxTurns}` ✓
- `OllamaClient.send({prompt, sessionId, systemPrompt})` matches what `chooseAction` calls ✓
- `wilsonInterval` returns `{low, high}` consistently in tests + CLI ✓
- Backend string format `kind:model` consistent across spec, CLI implementation, and README ✓

No issues found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-21-risk-bot-tourney-harness.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
