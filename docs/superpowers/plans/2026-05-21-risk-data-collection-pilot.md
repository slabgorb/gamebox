# Risk Data Collection Pilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the tournament harness's shortlist-truncation defect, add banter-stripping + pause/resume + corpus-shape fixes, then run a 150-game (25 × 6 pairings) Sonnet 4.6 pilot and emit a chi-square-based GO/NO-GO recommendation that gates scale-up to a full training corpus.

**Architecture:** Eight focused changes. Three change the AI core (`prompts.js`, `risk-player.js`, `headless-game.js`) to add a `'collection'` mode that drops banter and to fix two transcript-shape bugs (chosenMoveId stored the action type instead of the move id; the shortlist offered to the model wasn't recorded). One adds a `retry.js` helper that pauses on rate-limit and retries once. One extends `risk-tourney.mjs` with `--mode`, append-mode output, line-count resume, and game-level metadata. Three are new scripts: `risk-pilot.sh` (bash wrapper), `risk-pilot-meta.mjs` (writes `pilot-meta.json`), and `risk-style-diag.mjs` (computes metrics, runs chi-square, prints GO/NO-GO).

**Tech Stack:** Node 20 ESM, `node --test` (built-in), built-in `fetch`, existing Risk plugin (`plugins/risk/server/ai/{prompts,risk-player,board-eval,legal-moves}.js`), existing AI infrastructure (`src/server/ai/{llm-client,ollama-client,persona-catalog,headless-game,fake-llm-client}.js`).

**Spec:** `docs/superpowers/specs/2026-05-21-risk-data-collection-pilot-design.md`

---

## File Structure

**New files:**
- `src/server/ai/retry.js` — `runWithRateLimitRetry`, `isRateLimitError` helpers (~30 lines)
- `src/server/ai/diagnostics/chi-square.js` — `chiSquare2x2({a,b,c,d})` and `chiSquarePValue(stat)` helpers (~40 lines)
- `scripts/risk-pilot.sh` — bash wrapper that runs the 6 pairings sequentially
- `scripts/risk-pilot-meta.mjs` — writes/updates `data/risk-corpus/pilot/pilot-meta.json` (~80 lines)
- `scripts/risk-style-diag.mjs` — diagnostic + GO/NO-GO report (~150 lines)
- `test/ai-retry.test.js` — unit tests for retry helper
- `test/ai-chi-square.test.js` — unit tests for chi-square helpers
- `test/ai-pilot-meta.test.js` — unit tests for pilot-meta builder
- `test/ai-style-diag.test.js` — unit tests for metrics + GO/NO-GO logic
- `test/ai-tourney-resume.test.js` — unit tests for line-count resume helper

**Modified files:**
- `plugins/risk/server/ai/prompts.js` — `mode` param on `buildTurnPrompt`; new exported `BUILD_TURN_PROMPT_VERSION` constant
- `plugins/risk/server/ai/risk-player.js` — always-include phase terminator in shortlist; accept `mode` param; return `chosenMoveId` + `shortlist` in addition to existing fields
- `src/server/ai/headless-game.js` — accept `mode`, propagate to `chooseAction`, write `chosenMoveId`+`shortlist` from result instead of computed `action.type`
- `scripts/risk-tourney.mjs` — new `--mode` flag; open output in append mode; line-count resume; per-game metadata fields; wrap `runGame` in `runWithRateLimitRetry`; exit cleanly with resume message on second consecutive rate-limit failure
- `test/ai-risk-player.test.js` — extend with shortlist-terminator and new-return-fields tests
- `test/ai-risk-prompts.test.js` — extend with `mode: 'collection'` tests
- `test/ai-headless-game.test.js` — extend with chosenMoveId-is-real-id and shortlist-recorded tests

**Unmodified existing files (referenced but not changed):**
- `plugins/risk/server/ai/legal-moves.js` — `enumerateLegalMoves` consumed as-is
- `plugins/risk/server/ai/board-eval.js` — `scoreCandidate` consumed as-is
- `src/server/ai/llm-client.js` — `ClaudeCliClient`, `SubprocessFailed` consumed as-is
- `src/server/ai/ollama-client.js` — `OllamaClient` consumed as-is
- `src/server/ai/persona-catalog.js` — `loadPersonaCatalog` consumed as-is
- `src/server/ai/fake-llm-client.js` — `FakeLlmClient` used in tests as-is
- `src/server/ai/errors.js` — `InvalidLlmResponse`, `InvalidLlmMove` consumed as-is
- `src/server/ai/orchestrator.js` — calls `chooseAction` for live games; the new `mode` parameter defaults to `'live'` so live behavior is unchanged

---

## Task 0: Branch setup

**Files:** none (git only)

This plan assumes PR #58 (`feat/risk-tourney-harness`) has merged to main. If it has not, branch from `feat/risk-tourney-harness` instead of main — the harness, headless-game module, and CLI need to exist before any of these tasks can be implemented.

- [ ] **Step 1: Create the branch**

Run:
```bash
git fetch origin
git checkout -b feat/risk-data-collection-pilot origin/main
```

If PR #58 isn't merged yet, substitute `origin/feat/risk-tourney-harness` for `origin/main`.

- [ ] **Step 2: Confirm starting state**

Run: `ls src/server/ai/headless-game.js scripts/risk-tourney.mjs plugins/risk/server/ai/risk-player.js`
Expected: all three files exist (output is the three paths, no errors).

Run: `node --test test/ai-risk-player.test.js test/ai-risk-prompts.test.js test/ai-headless-game.test.js`
Expected: all green. We are starting from a passing baseline.

No commit on this task.

---

## Task 1: Shortlist always includes phase terminator

**Files:**
- Modify: `plugins/risk/server/ai/risk-player.js`
- Test: `test/ai-risk-player.test.js`

The bug: `shortlist = scored.slice(0, MAX_SHORTLIST)` drops `end-attack` (and `end-turn` in fortify) when 6 attacks score above the terminator's `-0.5`. The LLM then picks `end-attack` (it's a real Risk move it knows about) and `chooseAction` throws `InvalidLlmMove` because the picked id isn't in the shortlist. Fix: always force-include the phase's terminator if it's present in the legal moves but absent from the top-6.

- [ ] **Step 1: Write the failing test**

Add to the bottom of `test/ai-risk-player.test.js`:

```javascript
test('chooseAction shortlist always includes end-attack in attack phase', async () => {
  // Construct an attack-phase state where 6+ attacks all out-score end-attack,
  // so the unfixed slice(0,6) would drop end-attack.
  const territories = {};
  for (const id of allTerritories()) territories[id] = { owner: 1, armies: 1 };
  // Six high-army frontier territories — each generates one or more attacks
  // whose `armies - target_armies` advantage > -0.5 (end-attack's score).
  territories.alaska   = { owner: 0, armies: 8 };
  territories.alberta  = { owner: 1, armies: 1 };  // alaska -> alberta
  territories.nwt      = { owner: 1, armies: 1 };  // alaska -> nwt
  territories.ontario  = { owner: 0, armies: 8 };
  territories.greenland = { owner: 1, armies: 1 }; // ontario -> greenland
  territories.quebec   = { owner: 1, armies: 1 };  // ontario -> quebec
  territories.brazil   = { owner: 0, armies: 8 };
  territories.venezuela = { owner: 1, armies: 1 }; // brazil -> venezuela
  territories.north_africa = { owner: 1, armies: 1 }; // brazil -> north_africa
  const state = {
    phase: 'attack', currentPlayer: 0, territories,
    reinforcePool: 0, setupPools: [0, 0], sides: { a: 7, b: 8 }, activeUserId: 7,
  };

  // Capture the prompt text so we can confirm what shortlist the model saw.
  let capturedPrompt = '';
  const llm = {
    async send({ prompt }) {
      capturedPrompt = prompt;
      return { text: '{"moveId":"end-attack","banter":"enough"}', sessionId: 's' };
    },
  };
  const r = await chooseAction({ llm, persona, sessionId: null, state, botPlayerIdx: 0 });
  assert.match(capturedPrompt, /end-attack/, 'shortlist must include end-attack');
  assert.equal(r.action.type, 'end-attack');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern="shortlist always includes end-attack" test/ai-risk-player.test.js`
Expected: FAIL — the captured prompt does not contain `end-attack`, and/or `chooseAction` throws `InvalidLlmMove`.

- [ ] **Step 3: Implement the fix**

In `plugins/risk/server/ai/risk-player.js`, replace the `chooseAction` body between the existing `const scored = ...` and `const prompt = ...` lines so that the shortlist always includes the phase terminator. The full updated body of `chooseAction` should look like:

```javascript
const TERMINATORS_BY_PHASE = { attack: 'end-attack', fortify: 'end-turn' };

export async function chooseAction({ llm, persona, sessionId, state, botPlayerIdx, userMessages = [] }) {
  const moves = enumerateLegalMoves(state, botPlayerIdx);
  if (moves.length === 0) {
    throw new Error(`no legal moves for phase '${state.phase}'`);
  }

  const scored = moves
    .map(m => ({ ...m, score: scoreCandidate(state, botPlayerIdx, m.action) }))
    .sort((a, b) => b.score - a.score);
  const shortlist = scored.slice(0, MAX_SHORTLIST);

  // Force-include the phase terminator (end-attack / end-turn) if it was
  // pushed out of the top-N by higher-scoring moves. Phase terminators
  // are not optional — the bot must always be able to signal "I'm done
  // with this phase," and silent omission causes forfeits when the LLM
  // picks the terminator anyway.
  const terminatorId = TERMINATORS_BY_PHASE[state.phase];
  if (terminatorId && !shortlist.some(m => m.id === terminatorId)) {
    const terminator = scored.find(m => m.id === terminatorId);
    if (terminator) shortlist.push(terminator);
  }

  const prompt = buildTurnPrompt({ state, shortlist, botPlayerIdx, userMessages });
  // ... rest unchanged
}
```

Define `TERMINATORS_BY_PHASE` once at module level (above the function). Do not redefine it inside the function.

- [ ] **Step 4: Run all risk-player tests to verify pass + no regressions**

Run: `node --test test/ai-risk-player.test.js`
Expected: all tests pass (the four existing plus the new one).

- [ ] **Step 5: Commit**

```bash
git add plugins/risk/server/ai/risk-player.js test/ai-risk-player.test.js
git commit -m "fix(risk-player): always include phase terminator in shortlist"
```

---

## Task 2: `buildTurnPrompt` mode parameter + version constant

**Files:**
- Modify: `plugins/risk/server/ai/prompts.js`
- Test: `test/ai-risk-prompts.test.js`

`buildTurnPrompt` learns a `mode: 'live' | 'collection'` parameter that swaps the response footer. In `'collection'` mode, banter is dropped from both the instruction and the required JSON schema. Also export a `BUILD_TURN_PROMPT_VERSION` integer constant (manual bump on prompt text changes) so the harness can stamp every game with the prompt version that generated it.

- [ ] **Step 1: Write the failing tests**

Add to the bottom of `test/ai-risk-prompts.test.js`:

```javascript
import { BUILD_TURN_PROMPT_VERSION } from '../plugins/risk/server/ai/prompts.js';

test('buildTurnPrompt default mode is live and includes banter clause', () => {
  const p = buildTurnPrompt({ state, shortlist, botPlayerIdx: 0, userMessages: [] });
  assert.match(p, /banter/);
});

test('buildTurnPrompt mode=collection drops banter clause', () => {
  const p = buildTurnPrompt({ state, shortlist, botPlayerIdx: 0, userMessages: [], mode: 'collection' });
  assert.doesNotMatch(p, /banter/);
  assert.match(p, /moveId/);
});

test('buildTurnPrompt mode=live explicitly equals default', () => {
  const a = buildTurnPrompt({ state, shortlist, botPlayerIdx: 0, userMessages: [] });
  const b = buildTurnPrompt({ state, shortlist, botPlayerIdx: 0, userMessages: [], mode: 'live' });
  assert.equal(a, b);
});

test('BUILD_TURN_PROMPT_VERSION is a positive integer', () => {
  assert.equal(typeof BUILD_TURN_PROMPT_VERSION, 'number');
  assert.ok(Number.isInteger(BUILD_TURN_PROMPT_VERSION));
  assert.ok(BUILD_TURN_PROMPT_VERSION >= 1);
});
```

- [ ] **Step 2: Run tests to verify failures**

Run: `node --test --test-name-pattern="mode=collection|mode=live explicitly|BUILD_TURN_PROMPT_VERSION" test/ai-risk-prompts.test.js`
Expected: FAIL on the new tests (`mode` param ignored; constant not exported).

- [ ] **Step 3: Implement the change**

Edit `plugins/risk/server/ai/prompts.js`. Replace the existing `RESPONSE_FOOTER` constant block and the `buildTurnPrompt` function so the file reads (in full):

```javascript
import { CONTINENTS } from '../map.js';

// Bump this when the text of buildTurnPrompt changes in a way that could
// affect the LLM's response distribution. Manual bump rather than auto-hash
// so whitespace-only edits don't invalidate corpora.
export const BUILD_TURN_PROMPT_VERSION = 1;

function renderBoard(state, p) {
  const lines = [];
  for (const key of Object.keys(CONTINENTS)) {
    const c = CONTINENTS[key];
    const cells = c.territories.map(id => {
      const t = state.territories[id];
      const who = t.owner === p ? 'you' : (t.owner == null ? '—' : 'enemy');
      return `${id}:${who}/${t.armies}`;
    });
    lines.push(`${c.name} (+${c.bonus}): ${cells.join('  ')}`);
  }
  return lines.join('\n');
}

function shortlistBlock(shortlist) {
  const lines = shortlist.map(m => {
    const s = typeof m.score === 'number' ? ` (score ${m.score.toFixed(1)})` : '';
    return `  - ${m.id}: ${m.summary}${s}`;
  });
  return `Candidate moves (pre-scored — pick the one that fits your style):\n${lines.join('\n')}`;
}

function trashTalkBlock(messages) {
  const lines = messages.map(m => `  - "${m.replace(/"/g, '\\"')}"`).join('\n');
  return `Your opponent just said:\n${lines}\nReact in your banter — stay in character.`;
}

const LIVE_FOOTER =
  'Respond with a single JSON object (and nothing else): ' +
  '{"moveId": "<one of the candidate ids above>", "banter": "<one short in-character line, max ~12 words, never empty>"}';

const COLLECTION_FOOTER =
  'Respond with a single JSON object (and nothing else): ' +
  '{"moveId": "<one of the candidate ids above>"}';

export function buildTurnPrompt({ state, shortlist, botPlayerIdx, userMessages = [], mode = 'live' }) {
  const footer = mode === 'collection' ? COLLECTION_FOOTER : LIVE_FOOTER;
  const blocks = [
    `You are playing Risk as player ${botPlayerIdx}. Current phase: ${state.phase}.`,
    renderBoard(state, botPlayerIdx),
  ];
  if (userMessages.length > 0) blocks.push(trashTalkBlock(userMessages));
  blocks.push(shortlistBlock(shortlist), footer);
  return blocks.join('\n\n');
}

function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  throw new Error('no JSON object found in response');
}

export function parseLlmResponse(text) {
  let parsed;
  try { parsed = JSON.parse(extractJson(text)); }
  catch (e) { throw new Error(`response is not valid JSON: ${e.message}`); }
  if (typeof parsed.moveId !== 'string') throw new Error('response missing moveId');
  return {
    moveId: parsed.moveId,
    banter: typeof parsed.banter === 'string' ? parsed.banter : '',
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/ai-risk-prompts.test.js`
Expected: all tests pass (existing four plus new four).

- [ ] **Step 5: Commit**

```bash
git add plugins/risk/server/ai/prompts.js test/ai-risk-prompts.test.js
git commit -m "feat(risk-prompts): collection mode drops banter; add version constant"
```

---

## Task 3: `chooseAction` accepts mode + returns chosenMoveId & shortlist

**Files:**
- Modify: `plugins/risk/server/ai/risk-player.js`
- Test: `test/ai-risk-player.test.js`

Two changes to `chooseAction`'s signature and return:
1. New `mode` parameter, defaulted to `'live'`, propagated into `buildTurnPrompt`.
2. Return object gains `chosenMoveId` (the matched shortlist id, not the action.type) and `shortlist` (the array sent to the model with `{id, summary, score}` per entry).

These are additive — `orchestrator.js` (the live-game caller) reads `action`/`banter`/`sessionId`/`sequenceTail` and is unaffected by the new fields, and the default mode preserves byte-exact live prompt text.

- [ ] **Step 1: Write the failing tests**

Add to `test/ai-risk-player.test.js`:

```javascript
test('chooseAction returns chosenMoveId matching the shortlist id', async () => {
  const llm = new FakeLlmClient([{ text: '{"moveId":"attack:alaska->alberta","banter":"go"}', sessionId: 's' }]);
  const r = await chooseAction({ llm, persona, sessionId: null, state: attackState(), botPlayerIdx: 0 });
  assert.equal(r.chosenMoveId, 'attack:alaska->alberta');
});

test('chooseAction returns shortlist with id/summary/score per entry', async () => {
  const llm = new FakeLlmClient([{ text: '{"moveId":"attack:alaska->alberta","banter":"go"}', sessionId: 's' }]);
  const r = await chooseAction({ llm, persona, sessionId: null, state: attackState(), botPlayerIdx: 0 });
  assert.ok(Array.isArray(r.shortlist));
  assert.ok(r.shortlist.length >= 1);
  for (const entry of r.shortlist) {
    assert.equal(typeof entry.id, 'string');
    assert.equal(typeof entry.summary, 'string');
    assert.equal(typeof entry.score, 'number');
  }
});

test('chooseAction mode=collection passes mode to buildTurnPrompt (no banter in prompt)', async () => {
  let capturedPrompt = '';
  const llm = {
    async send({ prompt }) {
      capturedPrompt = prompt;
      return { text: '{"moveId":"attack:alaska->alberta"}', sessionId: 's' };
    },
  };
  await chooseAction({
    llm, persona, sessionId: null, state: attackState(), botPlayerIdx: 0, mode: 'collection',
  });
  assert.doesNotMatch(capturedPrompt, /banter/);
});

test('chooseAction default mode is live (banter still required)', async () => {
  let capturedPrompt = '';
  const llm = {
    async send({ prompt }) {
      capturedPrompt = prompt;
      return { text: '{"moveId":"attack:alaska->alberta","banter":"go"}', sessionId: 's' };
    },
  };
  await chooseAction({
    llm, persona, sessionId: null, state: attackState(), botPlayerIdx: 0,
  });
  assert.match(capturedPrompt, /banter/);
});
```

Note: `attackState()` is defined at the top of the test file and already constructs a state with one frontier territory (alaska, 6 armies vs alberta enemy, 1 army), so `attack:alaska->alberta` is in the legal set with a positive `force = 5`.

- [ ] **Step 2: Run tests to verify failures**

Run: `node --test --test-name-pattern="chosenMoveId|returns shortlist|mode=collection|default mode is live" test/ai-risk-player.test.js`
Expected: FAIL on the four new tests.

- [ ] **Step 3: Implement the change**

Edit `plugins/risk/server/ai/risk-player.js`. Update the `chooseAction` signature and return to be (in full):

```javascript
// plugins/risk/server/ai/risk-player.js
import { enumerateLegalMoves } from './legal-moves.js';
import { scoreCandidate } from './board-eval.js';
import { buildTurnPrompt, parseLlmResponse } from './prompts.js';
import { InvalidLlmResponse, InvalidLlmMove } from '../../../../src/server/ai/errors.js';

export { InvalidLlmResponse, InvalidLlmMove };

const MAX_SHORTLIST = 6;
const TERMINATORS_BY_PHASE = { attack: 'end-attack', fortify: 'end-turn' };

export async function chooseAction({
  llm, persona, sessionId, state, botPlayerIdx, userMessages = [], mode = 'live',
}) {
  const moves = enumerateLegalMoves(state, botPlayerIdx);
  if (moves.length === 0) {
    throw new Error(`no legal moves for phase '${state.phase}'`);
  }

  const scored = moves
    .map(m => ({ ...m, score: scoreCandidate(state, botPlayerIdx, m.action) }))
    .sort((a, b) => b.score - a.score);
  const shortlist = scored.slice(0, MAX_SHORTLIST);

  // Phase terminators are not optional — force-include them.
  const terminatorId = TERMINATORS_BY_PHASE[state.phase];
  if (terminatorId && !shortlist.some(m => m.id === terminatorId)) {
    const terminator = scored.find(m => m.id === terminatorId);
    if (terminator) shortlist.push(terminator);
  }

  const prompt = buildTurnPrompt({ state, shortlist, botPlayerIdx, userMessages, mode });
  const r = await llm.send({
    prompt,
    sessionId,
    systemPrompt: sessionId ? null : persona.systemPrompt,
  });

  let parsed;
  try { parsed = parseLlmResponse(r.text); }
  catch (e) { throw new InvalidLlmResponse(e.message); }

  const match = shortlist.find(m => m.id === parsed.moveId);
  if (!match) throw new InvalidLlmMove(parsed.moveId, shortlist.map(m => m.id));

  // Serialize shortlist to a slim {id, summary, score} shape suitable for
  // training-corpus consumption — drop the full action payload (derivable
  // from state + id at training-prep time) to keep transcript lines small.
  const slimShortlist = shortlist.map(m => ({
    id: m.id,
    summary: m.summary,
    score: m.score,
  }));

  return {
    action: match.action,
    chosenMoveId: match.id,
    shortlist: slimShortlist,
    banter: parsed.banter,
    sessionId: r.sessionId,
    sequenceTail: [],
  };
}
```

- [ ] **Step 4: Run all tests to verify pass + no regressions**

Run: `node --test test/ai-risk-player.test.js`
Expected: all tests pass (existing + 4 new).

Also run the orchestrator test to confirm live-game behavior is unaffected:
Run: `node --test test/ai-orchestrator-risk-turn.test.js`
Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/risk/server/ai/risk-player.js test/ai-risk-player.test.js
git commit -m "feat(risk-player): mode param + return chosenMoveId & shortlist"
```

---

## Task 4: `headless-game.js` writes real chosenMoveId + shortlist

**Files:**
- Modify: `src/server/ai/headless-game.js`
- Test: `test/ai-headless-game.test.js`

The harness transcript currently records `chosenMoveId: result.action.type` (which is `"attack"`, `"deploy"`, etc.) — losing the actual move id like `"attack:middle_east->india"`. After Task 3, `chooseAction` returns `result.chosenMoveId` (the real id) and `result.shortlist`. Wire them through to the transcript and accept a `mode` parameter to propagate.

- [ ] **Step 1: Write the failing tests**

Add to `test/ai-headless-game.test.js`:

```javascript
test('runGame transcript chosenMoveId matches the actual shortlist id, not action type', async () => {
  // The existing firstMoveLlm stub returns the first [mN] token from the
  // prompt. After Task 3, chooseAction returns chosenMoveId=match.id which
  // is one of "setup-deploy:0", "attack:alaska->alberta", etc. — never the
  // bare action type "attack" or "setup-deploy".
  const r = await runGame({
    llmA: firstMoveLlm(), llmB: firstMoveLlm(),
    personaA: STUB_PERSONA, personaB: STUB_PERSONA,
    seed: 1, maxTurns: 5,
  });
  for (const entry of r.transcript) {
    // chosenMoveId must contain a ':' (move ids are "type:detail") OR be one
    // of the bare-terminator ids end-attack / end-turn.
    const isStructured = entry.chosenMoveId.includes(':');
    const isTerminator = entry.chosenMoveId === 'end-attack' || entry.chosenMoveId === 'end-turn';
    assert.ok(isStructured || isTerminator,
      `chosenMoveId "${entry.chosenMoveId}" should be a real move id, not an action type`);
  }
});

test('runGame transcript includes shortlist with id/summary/score on every turn', async () => {
  const r = await runGame({
    llmA: firstMoveLlm(), llmB: firstMoveLlm(),
    personaA: STUB_PERSONA, personaB: STUB_PERSONA,
    seed: 1, maxTurns: 5,
  });
  for (const entry of r.transcript) {
    assert.ok(Array.isArray(entry.shortlist), 'shortlist missing');
    assert.ok(entry.shortlist.length >= 1);
    for (const item of entry.shortlist) {
      assert.equal(typeof item.id, 'string');
      assert.equal(typeof item.summary, 'string');
      assert.equal(typeof item.score, 'number');
    }
  }
});

test('runGame passes mode to chooseAction (collection mode prompts have no banter clause)', async () => {
  // Capture the prompt to confirm collection mode reaches all the way down.
  const prompts = [];
  const captureLlm = {
    async send({ prompt }) {
      prompts.push(prompt);
      const m = prompt.match(/\[(m\d+)\]/);
      const id = m ? m[1] : 'm1';
      return { text: JSON.stringify({ moveId: id }), sessionId: 'cap' };
    },
  };
  await runGame({
    llmA: captureLlm, llmB: captureLlm,
    personaA: STUB_PERSONA, personaB: STUB_PERSONA,
    seed: 1, maxTurns: 3, mode: 'collection',
  });
  assert.ok(prompts.length > 0);
  for (const p of prompts) {
    assert.doesNotMatch(p, /banter/, 'collection mode should not request banter');
  }
});
```

Note: the existing `firstMoveLlm` stub matches `/\[(m\d+)\]/` to find the first move id in the prompt. The actual prompt shortlist entries today look like `- attack:alaska->alberta: attack alaska->alberta with 5 (score 4.0)` — there is no `[m1]` syntax. The existing test relies on this regex returning null and falling back to `'m1'`, which then fails to find a match in `shortlist`. **Inspect the existing test before adding the new ones** — the stub's regex must match real shortlist ids, not fabricated `[mN]` tokens. If the existing stub is broken, replace it with one that captures the first `id:` field from the shortlist block:

```javascript
function firstMoveLlm() {
  return {
    async send({ prompt }) {
      // Shortlist lines look like "  - attack:alaska->alberta: attack alaska->alberta with 5 (score 4.0)"
      // Capture the first id (everything between "- " and the next ":").
      const m = prompt.match(/^\s*-\s+([^\s:]+(?::[^\s]+)?)/m);
      const id = m ? m[1] : 'end-attack';
      return {
        text: JSON.stringify({ moveId: id, banter: 'ok' }),
        sessionId: 'stub',
      };
    },
  };
}
```

Replace the existing `firstMoveLlm` function in `test/ai-headless-game.test.js` with the above before adding the new tests. Run the existing tests first to verify they still pass with the corrected stub:

Run: `node --test test/ai-headless-game.test.js`
Expected: pre-existing tests pass.

- [ ] **Step 2: Run tests to verify failures**

Run: `node --test --test-name-pattern="chosenMoveId matches|shortlist with id/summary/score|passes mode to chooseAction" test/ai-headless-game.test.js`
Expected: FAIL on all three new tests.

- [ ] **Step 3: Implement the change**

Edit `src/server/ai/headless-game.js`. Change the `runGame` signature to accept `mode` and propagate it; change the transcript push to use `result.chosenMoveId` and `result.shortlist` from `chooseAction`'s return value. Replace the `runGame` function (lines 58–165 of the current file) with:

```javascript
export async function runGame({
  llmA, llmB, personaA, personaB, seed, maxTurns = 500, mode = 'live',
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
        mode,
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
      chosenMoveId: result.chosenMoveId,
      shortlist: result.shortlist,
      banter: result.banter,
      stateBefore: structuredClone(state),
      action: result.action,
    });

    const actorId = sideIdx === 0 ? FAKE_USER_A : FAKE_USER_B;
    const applied = applyRiskAction({ state, action: result.action, actorId, rng });
    if (applied.error) {
      return {
        winner: sideIdx === 0 ? 'b' : 'a',
        endReason: 'forfeit',
        turnCount: turn + 1,
        durationMs: Date.now() - t0,
        transcript,
        forfeitReason: `apply rejected: ${applied.error}`,
      };
    }
    state = applied.state;

    if (state.pendingCombat) {
      state = resolvePendingCombat(state, rng);
    }

    if (applied.ended) {
      return {
        winner: state.winner === 0 ? 'a' : 'b',
        endReason: 'win',
        turnCount: turn + 1,
        durationMs: Date.now() - t0,
        transcript,
      };
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

The only changes from today: new `mode = 'live'` default, `mode` passed into `chooseAction`, `chosenMoveId: result.chosenMoveId`, new `shortlist: result.shortlist` field in the transcript push. The `banter` field is still written even in collection mode (it'll be the empty string from `parseLlmResponse`'s default) — keeping it makes the shape uniform.

- [ ] **Step 4: Run tests to verify pass + no regressions**

Run: `node --test test/ai-headless-game.test.js`
Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/headless-game.js test/ai-headless-game.test.js
git commit -m "fix(headless-game): write real chosenMoveId + shortlist to transcript"
```

---

## Task 5: Rate-limit retry helper

**Files:**
- Create: `src/server/ai/retry.js`
- Test: `test/ai-retry.test.js`

A small helper module that the harness wraps each `runGame` call in. Catches rate-limit errors (`SubprocessFailed` from `ClaudeCliClient` with rate-limit indicators in `stderr`, or HTTP 429 from Ollama), sleeps once, retries once. If the retry also throws, propagate — the caller (`risk-tourney.mjs`) treats the second failure as the signal to checkpoint and exit cleanly.

- [ ] **Step 1: Write the failing tests**

Create `test/ai-retry.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRateLimitError, runWithRateLimitRetry } from '../src/server/ai/retry.js';

class FakeSubprocessFailed extends Error {
  constructor(stderr) { super('subprocess'); this.stderr = stderr; }
}

test('isRateLimitError: matches "rate limit" in stderr', () => {
  assert.equal(isRateLimitError(new FakeSubprocessFailed('Error: rate limit exceeded')), true);
});

test('isRateLimitError: matches "429" in stderr', () => {
  assert.equal(isRateLimitError(new FakeSubprocessFailed('HTTP 429 Too Many Requests')), true);
});

test('isRateLimitError: matches "usage limit" in stderr (Pro Max wording)', () => {
  assert.equal(isRateLimitError(new FakeSubprocessFailed('Usage limit reached. Try again later.')), true);
});

test('isRateLimitError: false on unrelated stderr', () => {
  assert.equal(isRateLimitError(new FakeSubprocessFailed('connection refused')), false);
});

test('isRateLimitError: false on null/undefined errors', () => {
  assert.equal(isRateLimitError(null), false);
  assert.equal(isRateLimitError(undefined), false);
});

test('isRateLimitError: false on error without stderr field', () => {
  assert.equal(isRateLimitError(new Error('something else')), false);
});

test('runWithRateLimitRetry: returns value on first success', async () => {
  const r = await runWithRateLimitRetry(() => Promise.resolve('ok'));
  assert.equal(r, 'ok');
});

test('runWithRateLimitRetry: passes through non-rate-limit errors', async () => {
  const err = new Error('something else');
  await assert.rejects(
    () => runWithRateLimitRetry(() => Promise.reject(err)),
    /something else/,
  );
});

test('runWithRateLimitRetry: sleeps and retries once on rate-limit error', async () => {
  let calls = 0;
  let slept = 0;
  const fakeSleep = ms => { slept = ms; return Promise.resolve(); };
  const fn = async () => {
    calls++;
    if (calls === 1) throw new FakeSubprocessFailed('rate limit');
    return 'recovered';
  };
  const r = await runWithRateLimitRetry(fn, { sleep: fakeSleep, log: () => {}, sleepMs: 1234 });
  assert.equal(r, 'recovered');
  assert.equal(calls, 2);
  assert.equal(slept, 1234);
});

test('runWithRateLimitRetry: throws on second consecutive rate-limit', async () => {
  const fakeSleep = () => Promise.resolve();
  const fn = async () => { throw new FakeSubprocessFailed('rate limit'); };
  await assert.rejects(
    () => runWithRateLimitRetry(fn, { sleep: fakeSleep, log: () => {} }),
    /rate limit/,
  );
});

test('runWithRateLimitRetry: calls log on pause', async () => {
  const messages = [];
  const fakeSleep = () => Promise.resolve();
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls === 1) throw new FakeSubprocessFailed('rate limit');
    return 'ok';
  };
  await runWithRateLimitRetry(fn, { sleep: fakeSleep, log: m => messages.push(m), sleepMs: 60_000 });
  assert.ok(messages.some(m => /rate/i.test(m) && /1m/i.test(m)));
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/ai-retry.test.js`
Expected: FAIL with "Cannot find module" for `retry.js`.

- [ ] **Step 3: Implement the helper**

Create `src/server/ai/retry.js`:

```javascript
// Rate-limit retry helper. Used by the tournament harness to survive Pro
// Max 5-hour / weekly throttle windows: on first rate-limit error, sleep
// once and retry. If the retry also fails, propagate — the caller is
// expected to checkpoint and exit cleanly.

const RATE_LIMIT_PATTERNS = [
  /rate[\s\-_]?limit/i,
  /\b429\b/,
  /too many requests/i,
  /usage limit/i,
];

export function isRateLimitError(err) {
  if (!err) return false;
  const stderr = typeof err.stderr === 'string' ? err.stderr : '';
  if (!stderr) return false;
  return RATE_LIMIT_PATTERNS.some(re => re.test(stderr));
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runWithRateLimitRetry(fn, {
  sleep = defaultSleep,
  log = console.log,
  sleepMs = 5 * 60 * 1000,
} = {}) {
  try {
    return await fn();
  } catch (err) {
    if (!isRateLimitError(err)) throw err;
    const minutes = Math.round(sleepMs / 60_000);
    log(`[paused: rate-limited, sleeping ${minutes}m]`);
    await sleep(sleepMs);
    return await fn();
  }
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test test/ai-retry.test.js`
Expected: all 11 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/retry.js test/ai-retry.test.js
git commit -m "feat(ai): rate-limit retry helper for tournament harness"
```

---

## Task 6: Tournament harness — mode, append+resume, metadata, retry

**Files:**
- Modify: `scripts/risk-tourney.mjs`
- Create: `test/ai-tourney-resume.test.js`

Four changes to `risk-tourney.mjs`, plus extracting the resume-detection logic into a small testable helper:

1. New `--mode <live|collection>` flag (default `live`), propagated to `runGame`.
2. Open the output stream with `flags: 'a'` (append). At startup, count existing lines in the output file → `startIndex`. Skip games `0..startIndex-1`.
3. New per-game metadata fields written into each JSONL line: `harnessGitSha`, `buildTurnPromptVersion`, `collectionMode`.
4. Wrap each `runGame` call in `runWithRateLimitRetry`. If it still throws (rate limit during retry), print resume message and exit code 0.

The resume-counting helper is extracted into the same file as an exported `countCompletedGames(path)` so it's unit-testable.

- [ ] **Step 1: Write the failing tests for resume helper**

Create `test/ai-tourney-resume.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { countCompletedGames } from '../scripts/risk-tourney.mjs';

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'tourney-resume-'));
  try { return fn(dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

test('countCompletedGames: returns 0 when file does not exist', () => {
  withTmpDir(dir => {
    const r = countCompletedGames(join(dir, 'missing.jsonl'));
    assert.equal(r, 0);
  });
});

test('countCompletedGames: returns 0 on empty file', () => {
  withTmpDir(dir => {
    const p = join(dir, 'empty.jsonl');
    writeFileSync(p, '');
    assert.equal(countCompletedGames(p), 0);
  });
});

test('countCompletedGames: counts non-empty lines (ignores trailing newline)', () => {
  withTmpDir(dir => {
    const p = join(dir, 'three.jsonl');
    writeFileSync(p, '{"game":0}\n{"game":1}\n{"game":2}\n');
    assert.equal(countCompletedGames(p), 3);
  });
});

test('countCompletedGames: counts last line even without trailing newline', () => {
  withTmpDir(dir => {
    const p = join(dir, 'noeol.jsonl');
    writeFileSync(p, '{"game":0}\n{"game":1}\n{"game":2}');
    assert.equal(countCompletedGames(p), 3);
  });
});

test('countCompletedGames: skips blank lines', () => {
  withTmpDir(dir => {
    const p = join(dir, 'blanks.jsonl');
    writeFileSync(p, '{"game":0}\n\n{"game":1}\n');
    assert.equal(countCompletedGames(p), 2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/ai-tourney-resume.test.js`
Expected: FAIL with "countCompletedGames is not a function" or similar.

- [ ] **Step 3: Implement the harness changes**

Rewrite `scripts/risk-tourney.mjs` so it imports the retry helper, exports `countCompletedGames`, parses `--mode`, opens the output stream in append mode with line-count resume, wraps `runGame` in `runWithRateLimitRetry`, and writes the metadata fields. Replace the entire file with:

```javascript
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
```

The `if (import.meta.url === ...)` guard at the bottom is what lets the test file import `countCompletedGames` without triggering `main()`.

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test test/ai-tourney-resume.test.js`
Expected: all 5 tests pass.

Run: `node scripts/risk-tourney.mjs`
Expected: exit code 1 with `risk-tourney: missing required flag --a`. Confirms the args parser still works.

Run: `node scripts/risk-tourney.mjs --a claude:x --b claude:y --persona-a admiral-vonnegut --persona-b admiral-vonnegut --games 1 --mode invalid --out /tmp/x.jsonl`
Expected: exit code 1 with `risk-tourney: --mode must be 'live' or 'collection' (got 'invalid')`.

- [ ] **Step 5: Commit**

```bash
git add scripts/risk-tourney.mjs test/ai-tourney-resume.test.js
git commit -m "feat(risk-tourney): collection mode, append+resume, retry, metadata"
```

---

## Task 7: Pilot wrapper + pilot-meta helper

**Files:**
- Create: `scripts/risk-pilot.sh`
- Create: `scripts/risk-pilot-meta.mjs`
- Test: `test/ai-pilot-meta.test.js`

Two scripts. `risk-pilot.sh` is six sequential invocations of `risk-tourney.mjs` (one per pairing), with seeds spaced 100 apart so each pairing's seed range is disjoint. `risk-pilot-meta.mjs` reads the pilot output directory and the persona catalog, computes totals, and writes `pilot-meta.json`.

- [ ] **Step 1: Write the failing test for pilot-meta**

Create `test/ai-pilot-meta.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildPilotMeta } from '../scripts/risk-pilot-meta.mjs';

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'pilot-meta-'));
  try { return fn(dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

function makeGameLine({ game, personaA, personaB, turns }) {
  const transcript = [];
  for (let i = 0; i < turns; i++) {
    transcript.push({ turn: i, side: i % 2 === 0 ? 'a' : 'b', phase: 'attack',
      chosenMoveId: 'end-attack', shortlist: [], banter: '', stateBefore: {}, action: { type: 'end-attack' } });
  }
  return JSON.stringify({
    game, personaA, personaB, turnCount: turns,
    transcript,
    winner: 'a', endReason: 'win', durationMs: 1000,
  });
}

const FAKE_PERSONAS = {
  'admiral-vonnegut': { id: 'admiral-vonnegut', systemPrompt: 'you are admiral vonnegut' },
  'colonel-jaune':    { id: 'colonel-jaune',    systemPrompt: 'you are colonel jaune' },
  'major-robert':     { id: 'major-robert',     systemPrompt: 'you are major robert' },
};

test('buildPilotMeta: counts games and turns across pairing files', () => {
  withTmpDir(dir => {
    writeFileSync(join(dir, 'admiral-vonnegut-admiral-vonnegut.jsonl'),
      makeGameLine({ game: 0, personaA: 'admiral-vonnegut', personaB: 'admiral-vonnegut', turns: 30 }) + '\n' +
      makeGameLine({ game: 1, personaA: 'admiral-vonnegut', personaB: 'admiral-vonnegut', turns: 40 }) + '\n');
    writeFileSync(join(dir, 'admiral-vonnegut-colonel-jaune.jsonl'),
      makeGameLine({ game: 0, personaA: 'admiral-vonnegut', personaB: 'colonel-jaune', turns: 50 }) + '\n');

    const meta = buildPilotMeta({ dir, personas: FAKE_PERSONAS, model: 'claude-sonnet-4-6' });
    assert.equal(meta.totalGames, 3);
    assert.equal(meta.totalTurns, 120);
    assert.equal(meta.model, 'claude-sonnet-4-6');
  });
});

test('buildPilotMeta: includes persona system prompts only for personas seen in corpus', () => {
  withTmpDir(dir => {
    writeFileSync(join(dir, 'admiral-vonnegut-colonel-jaune.jsonl'),
      makeGameLine({ game: 0, personaA: 'admiral-vonnegut', personaB: 'colonel-jaune', turns: 10 }) + '\n');

    const meta = buildPilotMeta({ dir, personas: FAKE_PERSONAS, model: 'claude-sonnet-4-6' });
    assert.deepEqual(Object.keys(meta.personaSystemPrompts).sort(),
      ['admiral-vonnegut', 'colonel-jaune']);
    assert.equal(meta.personaSystemPrompts['admiral-vonnegut'], 'you are admiral vonnegut');
  });
});

test('buildPilotMeta: lists pairings with game counts', () => {
  withTmpDir(dir => {
    writeFileSync(join(dir, 'admiral-vonnegut-colonel-jaune.jsonl'),
      makeGameLine({ game: 0, personaA: 'admiral-vonnegut', personaB: 'colonel-jaune', turns: 10 }) + '\n' +
      makeGameLine({ game: 1, personaA: 'admiral-vonnegut', personaB: 'colonel-jaune', turns: 12 }) + '\n');

    const meta = buildPilotMeta({ dir, personas: FAKE_PERSONAS, model: 'claude-sonnet-4-6' });
    assert.equal(meta.pairings.length, 1);
    assert.equal(meta.pairings[0].sideA, 'admiral-vonnegut');
    assert.equal(meta.pairings[0].sideB, 'colonel-jaune');
    assert.equal(meta.pairings[0].games, 2);
  });
});

test('buildPilotMeta: throws on game line referencing unknown persona', () => {
  withTmpDir(dir => {
    writeFileSync(join(dir, 'mystery-pairing.jsonl'),
      makeGameLine({ game: 0, personaA: 'unknown-persona', personaB: 'admiral-vonnegut', turns: 10 }) + '\n');
    assert.throws(
      () => buildPilotMeta({ dir, personas: FAKE_PERSONAS, model: 'claude-sonnet-4-6' }),
      /unknown-persona/,
    );
  });
});

test('buildPilotMeta: returns startedAt/completedAt as ISO strings', () => {
  withTmpDir(dir => {
    writeFileSync(join(dir, 'admiral-vonnegut-colonel-jaune.jsonl'),
      makeGameLine({ game: 0, personaA: 'admiral-vonnegut', personaB: 'colonel-jaune', turns: 10 }) + '\n');
    const meta = buildPilotMeta({ dir, personas: FAKE_PERSONAS, model: 'claude-sonnet-4-6' });
    assert.match(meta.startedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(meta.completedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/ai-pilot-meta.test.js`
Expected: FAIL with "Cannot find module" for `risk-pilot-meta.mjs`.

- [ ] **Step 3: Implement `risk-pilot-meta.mjs`**

Create `scripts/risk-pilot-meta.mjs`:

```javascript
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
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test test/ai-pilot-meta.test.js`
Expected: all 5 tests pass.

- [ ] **Step 5: Implement `risk-pilot.sh`**

Create `scripts/risk-pilot.sh`:

```bash
#!/usr/bin/env bash
# Risk data-collection pilot wrapper. Runs six pairings × 25 games × Sonnet 4.6
# sequentially. Re-running picks up where it left off (the harness's line-count
# resume + the per-pairing-file layout mean every restart is a no-op for already-
# completed pairings).
#
# Usage:
#   ./scripts/risk-pilot.sh
#
# Output: data/risk-corpus/pilot/<personaA>-<personaB>.jsonl per pairing
#         data/risk-corpus/pilot/pilot-meta.json (rebuilt at the end)

set -euo pipefail

PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
OUTDIR="$PROJECT_ROOT/data/risk-corpus/pilot"
mkdir -p "$OUTDIR"

PAIRINGS=(
  "admiral-vonnegut:admiral-vonnegut"
  "admiral-vonnegut:colonel-jaune"
  "admiral-vonnegut:major-robert"
  "colonel-jaune:colonel-jaune"
  "colonel-jaune:major-robert"
  "major-robert:major-robert"
)

GAMES=25
MAX_TURNS=500
MODEL="claude:claude-sonnet-4-6"

for i in "${!PAIRINGS[@]}"; do
  IFS=":" read -r A B <<< "${PAIRINGS[$i]}"
  OUT="$OUTDIR/${A}-${B}.jsonl"
  SEED=$((100 * i))
  echo "=== Pairing $((i + 1))/${#PAIRINGS[@]}: $A vs $B (seed $SEED) ==="
  node "$PROJECT_ROOT/scripts/risk-tourney.mjs" \
    --a "$MODEL" \
    --b "$MODEL" \
    --persona-a "$A" \
    --persona-b "$B" \
    --games "$GAMES" \
    --seed "$SEED" \
    --max-turns "$MAX_TURNS" \
    --mode collection \
    --out "$OUT"
done

echo "=== Building pilot-meta.json ==="
node "$PROJECT_ROOT/scripts/risk-pilot-meta.mjs" "$OUTDIR"

echo "Pilot complete. Run the diagnostic with:"
echo "  node scripts/risk-style-diag.mjs $OUTDIR"
```

Then make it executable:

Run: `chmod +x scripts/risk-pilot.sh`
Expected: no output, file becomes executable.

- [ ] **Step 6: Smoke-test the wrapper script's flag parsing**

The wrapper invokes `risk-tourney.mjs`, which we already validated in Task 6. Confirm the wrapper itself parses without surprise:

Run: `bash -n scripts/risk-pilot.sh`
Expected: no output (syntax OK).

- [ ] **Step 7: Commit**

```bash
git add scripts/risk-pilot.sh scripts/risk-pilot-meta.mjs test/ai-pilot-meta.test.js
git commit -m "feat(risk-pilot): wrapper script + pilot-meta builder"
```

---

## Task 8: Chi-square test helper

**Files:**
- Create: `src/server/ai/diagnostics/chi-square.js`
- Test: `test/ai-chi-square.test.js`

Chi-square 2×2 contingency test + p-value lookup. Used by the diagnostic to compare pairs of personas on attack-when-available rate. Pure functions, no dependencies.

We approximate the p-value using a simple closed-form for 1 degree of freedom (chi-square with 1 d.f. is the absolute value of a standard normal squared, so the survival function is straightforward). We don't need scipy-grade precision — we only check against fixed thresholds (0.01, 0.001), so an approximation accurate to 3 sig figs suffices.

- [ ] **Step 1: Write the failing tests**

Create `test/ai-chi-square.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiSquare2x2, chiSquarePValue } from '../src/server/ai/diagnostics/chi-square.js';

test('chiSquare2x2: returns 0 for identical proportions', () => {
  // 50/100 vs 50/100 — no difference.
  const stat = chiSquare2x2({ a: 50, b: 50, c: 50, d: 50 });
  assert.ok(Math.abs(stat) < 1e-9, `expected ~0, got ${stat}`);
});

test('chiSquare2x2: matches known reference value', () => {
  // 2x2 table: a=20, b=10, c=10, d=20. Standard textbook example, chi² = 6.667.
  const stat = chiSquare2x2({ a: 20, b: 10, c: 10, d: 20 });
  assert.ok(Math.abs(stat - 6.667) < 0.01, `expected ~6.667, got ${stat}`);
});

test('chiSquare2x2: matches another reference value', () => {
  // a=30, b=10, c=15, d=25. By hand: total=80, expected_a = 40*45/80 = 22.5,
  // chi² = sum of (obs - exp)^2 / exp across 4 cells. Computed: ~9.143.
  const stat = chiSquare2x2({ a: 30, b: 10, c: 15, d: 25 });
  assert.ok(Math.abs(stat - 9.143) < 0.05, `expected ~9.143, got ${stat}`);
});

test('chiSquare2x2: zero total throws', () => {
  assert.throws(() => chiSquare2x2({ a: 0, b: 0, c: 0, d: 0 }));
});

test('chiSquarePValue: p ≈ 0.5 at chi² = 0.455 (median of chi² with 1 d.f.)', () => {
  // The 50th percentile of chi² with 1 d.f. is approximately 0.4549.
  const p = chiSquarePValue(0.4549);
  assert.ok(Math.abs(p - 0.5) < 0.01, `expected ~0.5, got ${p}`);
});

test('chiSquarePValue: p ≈ 0.05 at chi² = 3.841 (95th percentile, 1 d.f.)', () => {
  const p = chiSquarePValue(3.841);
  assert.ok(Math.abs(p - 0.05) < 0.005, `expected ~0.05, got ${p}`);
});

test('chiSquarePValue: p ≈ 0.01 at chi² = 6.635 (99th percentile, 1 d.f.)', () => {
  const p = chiSquarePValue(6.635);
  assert.ok(Math.abs(p - 0.01) < 0.002, `expected ~0.01, got ${p}`);
});

test('chiSquarePValue: p ≈ 0.001 at chi² = 10.828 (99.9th percentile, 1 d.f.)', () => {
  const p = chiSquarePValue(10.828);
  assert.ok(Math.abs(p - 0.001) < 0.0005, `expected ~0.001, got ${p}`);
});

test('chiSquarePValue: returns 1 for negative input (defensive)', () => {
  assert.equal(chiSquarePValue(-1), 1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/ai-chi-square.test.js`
Expected: FAIL with "Cannot find module" for `chi-square.js`.

- [ ] **Step 3: Implement chi-square helpers**

Create `src/server/ai/diagnostics/chi-square.js`:

```javascript
// Chi-square 2x2 contingency test + p-value lookup for 1 degree of freedom.
// Used by the style diagnostic to compare pairs of personas on metrics like
// attack-when-available rate. Pure functions, no dependencies.
//
// 2x2 layout:
//          group1   group2
//   yes      a        b
//   no       c        d

export function chiSquare2x2({ a, b, c, d }) {
  const n = a + b + c + d;
  if (n === 0) throw new Error('chiSquare2x2: total count is zero');
  // Closed form for a 2x2 table:
  //   chi² = n * (ad - bc)^2 / ((a+b)(c+d)(a+c)(b+d))
  const num = n * Math.pow(a * d - b * c, 2);
  const den = (a + b) * (c + d) * (a + c) * (b + d);
  if (den === 0) return 0; // a row or column is all zeros — no association detectable
  return num / den;
}

// Survival function (1 - CDF) for chi-square with 1 degree of freedom.
//   chi² with 1 d.f. is Z² where Z ~ N(0,1)
//   so P(chi² > x) = 2 * (1 - Phi(sqrt(x)))
// We approximate Phi using the Abramowitz & Stegun 7.1.26 erf approximation.
export function chiSquarePValue(stat) {
  if (stat <= 0) return 1;
  const z = Math.sqrt(stat);
  return 2 * (1 - normalCdf(z));
}

// Phi(z) = 0.5 * (1 + erf(z / sqrt(2)))
function normalCdf(z) {
  return 0.5 * (1 + erf(z / Math.SQRT2));
}

// Abramowitz & Stegun 7.1.26 — max error ~1.5e-7 in |x|.
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 =  0.254829592;
  const a2 = -0.284496736;
  const a3 =  1.421413741;
  const a4 = -1.453152027;
  const a5 =  1.061405429;
  const p  =  0.3275911;
  const t  = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax);
  return sign * y;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test test/ai-chi-square.test.js`
Expected: all 9 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/diagnostics/chi-square.js test/ai-chi-square.test.js
git commit -m "feat(diagnostics): chi-square 2x2 + p-value approximation"
```

---

## Task 9: Style diagnostic script

**Files:**
- Create: `scripts/risk-style-diag.mjs`
- Test: `test/ai-style-diag.test.js`

The diagnostic reads every `*.jsonl` in `data/risk-corpus/pilot/` (path supplied as CLI arg), computes three metrics per persona, runs pairwise chi-square tests on attack-when-available, and prints a GO/NO-GO recommendation. Most logic lives in exported helper functions for unit testing; the `main` function is just orchestration + printing.

- [ ] **Step 1: Write the failing tests**

Create `test/ai-style-diag.test.js`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePersonaMetrics,
  evaluateGoNoGo,
} from '../scripts/risk-style-diag.mjs';

function turn({ side, phase, chosenMoveId, shortlist, action }) {
  return { turn: 0, side, phase, chosenMoveId, shortlist,
    stateBefore: {}, action: action ?? { type: chosenMoveId.split(':')[0] } };
}

function game({ personaA, personaB, turns }) {
  return { personaA, personaB, turnCount: turns.length, transcript: turns };
}

test('computePersonaMetrics: counts turns per persona', () => {
  const games = [
    game({
      personaA: 'admiral-vonnegut', personaB: 'major-robert',
      turns: [
        turn({ side: 'a', phase: 'attack', chosenMoveId: 'end-attack', shortlist: [] }),
        turn({ side: 'b', phase: 'attack', chosenMoveId: 'attack:alaska->alberta', shortlist: [],
          action: { type: 'attack', payload: { from: 'alaska', to: 'alberta', force: 5 } } }),
      ],
    }),
  ];
  const m = computePersonaMetrics(games);
  assert.equal(m['admiral-vonnegut'].turns, 1);
  assert.equal(m['major-robert'].turns, 1);
});

test('computePersonaMetrics: attack-when-available counts only attack-phase turns with positive-score attacks', () => {
  const positiveAttackShortlist = [
    { id: 'attack:alaska->alberta', summary: 's', score: 2.0 },
    { id: 'end-attack', summary: 's', score: -0.5 },
  ];
  const noGoodAttackShortlist = [
    { id: 'attack:alaska->alberta', summary: 's', score: -2.0 },
    { id: 'end-attack', summary: 's', score: -0.5 },
  ];
  const games = [
    game({
      personaA: 'major-robert', personaB: 'admiral-vonnegut',
      turns: [
        // Robert: attack-phase, good attack available, chose attack → numerator+1, denom+1
        turn({ side: 'a', phase: 'attack', chosenMoveId: 'attack:alaska->alberta',
          shortlist: positiveAttackShortlist,
          action: { type: 'attack', payload: { from: 'alaska', to: 'alberta', force: 5 } } }),
        // Robert: attack-phase, good attack available, chose end-attack → denom+1 only
        turn({ side: 'a', phase: 'attack', chosenMoveId: 'end-attack',
          shortlist: positiveAttackShortlist }),
        // Robert: attack-phase, no good attacks → neither
        turn({ side: 'a', phase: 'attack', chosenMoveId: 'end-attack',
          shortlist: noGoodAttackShortlist }),
        // Robert: deploy phase → neither
        turn({ side: 'a', phase: 'reinforce', chosenMoveId: 'deploy:0',
          shortlist: [{ id: 'deploy:0', summary: 's', score: 5 }],
          action: { type: 'deploy', payload: { placements: { alaska: 3 } } } }),
      ],
    }),
  ];
  const m = computePersonaMetrics(games);
  assert.equal(m['major-robert'].attackWhenAvailable.attacked, 1);
  assert.equal(m['major-robert'].attackWhenAvailable.total, 2);
});

test('computePersonaMetrics: move-type mix sums to ~1.0 per persona', () => {
  const games = [
    game({
      personaA: 'admiral-vonnegut', personaB: 'admiral-vonnegut',
      turns: [
        turn({ side: 'a', phase: 'attack', chosenMoveId: 'attack:a->b', shortlist: [],
          action: { type: 'attack', payload: { from: 'a', to: 'b', force: 1 } } }),
        turn({ side: 'a', phase: 'reinforce', chosenMoveId: 'deploy:0', shortlist: [],
          action: { type: 'deploy', payload: { placements: {} } } }),
        turn({ side: 'a', phase: 'fortify', chosenMoveId: 'end-turn', shortlist: [],
          action: { type: 'end-turn' } }),
      ],
    }),
  ];
  const m = computePersonaMetrics(games);
  const mix = m['admiral-vonnegut'].moveTypeMix;
  const total = Object.values(mix).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(total - 1.0) < 1e-9, `expected sum=1, got ${total}`);
});

test('evaluateGoNoGo: GO when all 3 pairs significant and spread >= 15pp', () => {
  const metrics = {
    'admiral-vonnegut': { attackWhenAvailable: { attacked: 50, total: 100 } }, // 50%
    'colonel-jaune':    { attackWhenAvailable: { attacked: 70, total: 100 } }, // 70%
    'major-robert':     { attackWhenAvailable: { attacked: 85, total: 100 } }, // 85%
  };
  const r = evaluateGoNoGo(metrics, ['admiral-vonnegut', 'colonel-jaune', 'major-robert']);
  assert.equal(r.recommendation, 'GO');
  assert.equal(r.spreadPp, 35); // 85 - 50
  assert.equal(r.pairwise.length, 3);
  for (const p of r.pairwise) assert.ok(p.pValue < 0.01);
});

test('evaluateGoNoGo: NO-GO when spread < 15pp even if all 3 pairs significant', () => {
  // Tight spread, very large N so chi-square is significant on tiny effects.
  const metrics = {
    'admiral-vonnegut': { attackWhenAvailable: { attacked: 5000, total: 10000 } }, // 50%
    'colonel-jaune':    { attackWhenAvailable: { attacked: 5500, total: 10000 } }, // 55%
    'major-robert':     { attackWhenAvailable: { attacked: 6000, total: 10000 } }, // 60%
  };
  const r = evaluateGoNoGo(metrics, ['admiral-vonnegut', 'colonel-jaune', 'major-robert']);
  assert.equal(r.recommendation, 'NO-GO');
  assert.equal(r.spreadPp, 10);
  assert.match(r.reason, /spread/i);
});

test('evaluateGoNoGo: NO-GO when at least one pair is not significant', () => {
  const metrics = {
    'admiral-vonnegut': { attackWhenAvailable: { attacked: 50, total: 100 } }, // 50%
    'colonel-jaune':    { attackWhenAvailable: { attacked: 53, total: 100 } }, // 53% — too close
    'major-robert':     { attackWhenAvailable: { attacked: 85, total: 100 } }, // 85%
  };
  const r = evaluateGoNoGo(metrics, ['admiral-vonnegut', 'colonel-jaune', 'major-robert']);
  assert.equal(r.recommendation, 'NO-GO');
  assert.match(r.reason, /significant/i);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/ai-style-diag.test.js`
Expected: FAIL with "Cannot find module" for `risk-style-diag.mjs`.

- [ ] **Step 3: Implement the diagnostic**

Create `scripts/risk-style-diag.mjs`:

```javascript
#!/usr/bin/env node
// Risk style diagnostic. Reads every *.jsonl file in the supplied pilot dir,
// computes three per-persona metrics, runs pairwise chi-square tests on
// attack-when-available, and prints a structured report with a GO/NO-GO
// recommendation.
//
// Usage:
//   node scripts/risk-style-diag.mjs <pilot-dir>
//
// Default pilot-dir: data/risk-corpus/pilot/

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chiSquare2x2, chiSquarePValue } from '../src/server/ai/diagnostics/chi-square.js';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = resolve(PROJECT_ROOT, 'data', 'risk-corpus', 'pilot');

const P_THRESHOLD = 0.01;
const SPREAD_PP_THRESHOLD = 15;

// Read all *.jsonl files under dir (skipping pilot-meta.json).
function readGames(dir) {
  const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  const games = [];
  for (const f of files) {
    const lines = readFileSync(join(dir, f), 'utf8').split('\n').filter(l => l.trim());
    for (const line of lines) games.push(JSON.parse(line));
  }
  return games;
}

// Per-persona metric aggregation. Returns:
//   { [personaId]: {
//       turns: int,
//       moveTypeMix: { [actionType]: fraction },   // sums to 1 across types
//       attackWhenAvailable: { attacked: int, total: int },
//       attackForce: { forceCommitted: number, attackerArmies: number, count: int }
//   } }
export function computePersonaMetrics(games) {
  const personas = {};

  function ensure(id) {
    if (!personas[id]) {
      personas[id] = {
        turns: 0,
        moveTypeCounts: {},
        attackWhenAvailable: { attacked: 0, total: 0 },
        attackForce: { forceCommitted: 0, attackerArmies: 0, count: 0 },
      };
    }
    return personas[id];
  }

  for (const game of games) {
    const personaBySide = { a: game.personaA, b: game.personaB };
    for (const t of game.transcript) {
      const personaId = personaBySide[t.side];
      const p = ensure(personaId);
      p.turns += 1;

      const actionType = t.action?.type ?? t.chosenMoveId.split(':')[0];
      p.moveTypeCounts[actionType] = (p.moveTypeCounts[actionType] ?? 0) + 1;

      // attack-when-available: attack-phase turns where shortlist has at
      // least one positive-score attack.
      if (t.phase === 'attack' && Array.isArray(t.shortlist)) {
        const hasGoodAttack = t.shortlist.some(m =>
          m.id.startsWith('attack:') && m.score > 0);
        if (hasGoodAttack) {
          p.attackWhenAvailable.total += 1;
          if (actionType === 'attack') p.attackWhenAvailable.attacked += 1;
        }
      }

      // attack-force fraction: forceCommitted / attacker armies in stateBefore.
      if (actionType === 'attack' && t.action?.payload) {
        const { from, force } = t.action.payload;
        const armies = t.stateBefore?.territories?.[from]?.armies;
        if (typeof armies === 'number' && armies > 0 && typeof force === 'number') {
          p.attackForce.forceCommitted += force;
          p.attackForce.attackerArmies += armies;
          p.attackForce.count += 1;
        }
      }
    }
  }

  // Normalize moveTypeCounts -> moveTypeMix.
  for (const id of Object.keys(personas)) {
    const p = personas[id];
    p.moveTypeMix = {};
    const total = Object.values(p.moveTypeCounts).reduce((s, v) => s + v, 0) || 1;
    for (const [type, count] of Object.entries(p.moveTypeCounts)) {
      p.moveTypeMix[type] = count / total;
    }
  }

  return personas;
}

// Evaluate the GO/NO-GO gate from the spec:
//  1. All pairwise chi-square tests on attack-when-available must be p < 0.01
//  2. Spread between min and max attack-when-avail rate must be >= 15pp
export function evaluateGoNoGo(metrics, personaIds) {
  const rates = {};
  for (const id of personaIds) {
    const a = metrics[id].attackWhenAvailable;
    rates[id] = a.total > 0 ? a.attacked / a.total : 0;
  }

  const pairwise = [];
  for (let i = 0; i < personaIds.length; i++) {
    for (let j = i + 1; j < personaIds.length; j++) {
      const idA = personaIds[i];
      const idB = personaIds[j];
      const a = metrics[idA].attackWhenAvailable;
      const b = metrics[idB].attackWhenAvailable;
      const stat = chiSquare2x2({
        a: a.attacked, b: a.total - a.attacked,
        c: b.attacked, d: b.total - b.attacked,
      });
      const pValue = chiSquarePValue(stat);
      pairwise.push({ idA, idB, chiSquared: stat, pValue });
    }
  }

  const values = Object.values(rates);
  const spreadPp = Math.round((Math.max(...values) - Math.min(...values)) * 100);

  const allSignificant = pairwise.every(p => p.pValue < P_THRESHOLD);
  const spreadOk = spreadPp >= SPREAD_PP_THRESHOLD;

  let recommendation;
  let reason;
  if (allSignificant && spreadOk) {
    recommendation = 'GO';
    reason = `all ${pairwise.length} pairs distinguishable at p<${P_THRESHOLD}; spread ≥ ${SPREAD_PP_THRESHOLD}pp`;
  } else if (!allSignificant) {
    recommendation = 'NO-GO';
    reason = `at least one pair not significant at p<${P_THRESHOLD}`;
  } else {
    recommendation = 'NO-GO';
    reason = `spread ${spreadPp}pp below threshold of ${SPREAD_PP_THRESHOLD}pp`;
  }

  return { recommendation, reason, spreadPp, pairwise, rates };
}

function pct(x) { return (x * 100).toFixed(1) + '%'; }
function pctInt(x) { return Math.round(x * 100) + '%'; }

function printReport(personaIds, metrics, gate, gameCount, model) {
  console.log(`Risk style diagnostic — ${gameCount} games, model=${model ?? 'unknown'}\n`);

  // Column header.
  const header = ['', ...personaIds].map(s => s.padEnd(22)).join('');
  console.log(header);

  const rows = [
    ['turns',             id => String(metrics[id].turns)],
    ['attack%',           id => pct(metrics[id].moveTypeMix.attack ?? 0)],
    ['attack-when-avail', id => {
      const a = metrics[id].attackWhenAvailable;
      return a.total > 0 ? pctInt(a.attacked / a.total) : 'n/a';
    }],
    ['mean-force-frac',   id => {
      const f = metrics[id].attackForce;
      return f.attackerArmies > 0 ? pct(f.forceCommitted / f.attackerArmies) : 'n/a';
    }],
  ];
  for (const [label, fn] of rows) {
    const cells = [label.padEnd(22), ...personaIds.map(id => fn(id).padEnd(22))];
    console.log(cells.join(''));
  }
  console.log();
  console.log('Pairwise chi-square on attack-when-avail:');
  for (const p of gate.pairwise) {
    const passed = p.pValue < P_THRESHOLD ? '✓' : '✗';
    const pStr = p.pValue < 0.001 ? 'p<0.001' : `p=${p.pValue.toFixed(3)}`;
    console.log(`  ${p.idA} vs ${p.idB}: chi²=${p.chiSquared.toFixed(1)}, ${pStr}  ${passed}`);
  }
  console.log();
  console.log(`Spread (max - min attack-when-avail): ${gate.spreadPp}pp\n`);
  console.log(`${gate.recommendation}: ${gate.reason}.`);
  if (gate.recommendation === 'GO') console.log('Recommend scale-up.');
  else console.log('Iterate on prompts before scaling up.');
}

function main() {
  const dir = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_DIR;
  if (!existsSync(dir)) {
    console.error(`risk-style-diag: directory not found: ${dir}`);
    process.exit(1);
  }

  const games = readGames(dir);
  if (games.length === 0) {
    console.error(`risk-style-diag: no .jsonl files in ${dir}`);
    process.exit(1);
  }

  const metrics = computePersonaMetrics(games);
  const personaIds = Object.keys(metrics).sort();
  if (personaIds.length < 2) {
    console.error(`risk-style-diag: need at least 2 personas, found ${personaIds.length}`);
    process.exit(1);
  }

  // Try to read the model name from pilot-meta.json (best-effort).
  let model = null;
  const metaPath = join(dir, 'pilot-meta.json');
  if (existsSync(metaPath)) {
    try { model = JSON.parse(readFileSync(metaPath, 'utf8')).model; } catch {}
  }

  const gate = evaluateGoNoGo(metrics, personaIds);
  printReport(personaIds, metrics, gate, games.length, model);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `node --test test/ai-style-diag.test.js`
Expected: all 6 tests pass.

- [ ] **Step 5: Run the full test suite to confirm no regressions**

Run: `node --test test/`
Expected: all tests pass across the project. If any unrelated test was already failing before this branch, note it but do not fix it as part of this work.

- [ ] **Step 6: Commit**

```bash
git add scripts/risk-style-diag.mjs test/ai-style-diag.test.js
git commit -m "feat(risk-diag): style diagnostic with chi-square GO/NO-GO"
```

---

## Task 10: Open the pull request

**Files:** none

- [ ] **Step 1: Push and open PR**

Run:
```bash
git push -u origin feat/risk-data-collection-pilot
gh pr create --title "feat(risk): data collection pilot harness + diagnostic" --body "$(cat <<'EOF'
## Summary
- Fix shortlist-truncation defect (`end-attack` / `end-turn` were being silently dropped, causing all bot-vs-bot games to forfeit)
- Add `'collection'` mode to `buildTurnPrompt` / `chooseAction` / `runGame` that strips banter for training-corpus runs
- Fix transcript-shape bugs: `chosenMoveId` now stores the real move id (e.g. `attack:middle_east->india`), and the full shortlist is recorded per turn
- Add append-mode + line-count resume + Pro Max rate-limit retry to `risk-tourney.mjs`; per-game metadata stamped with `harnessGitSha` + `BUILD_TURN_PROMPT_VERSION`
- New scripts: `risk-pilot.sh` (6-pairing wrapper), `risk-pilot-meta.mjs` (writes `pilot-meta.json`), `risk-style-diag.mjs` (chi-square GO/NO-GO diagnostic)

Spec: `docs/superpowers/specs/2026-05-21-risk-data-collection-pilot-design.md`

## Test plan
- [ ] `node --test test/` is green
- [ ] `bash -n scripts/risk-pilot.sh` passes syntax check
- [ ] `node scripts/risk-tourney.mjs` (no args) prints usage and exits 1
- [ ] Manual smoke: run a 2-game `risk-tourney.mjs --mode collection` Sonnet-vs-Sonnet against `admiral-vonnegut` self-play and confirm transcript shape (`chosenMoveId` is a real move id, `shortlist` is present, no `banter` clause in any sent prompt)
- [ ] Manual smoke: kill the same run after game 1 finishes, re-run, confirm it resumes at game 2

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

No commit — the PR creation completes this task.

---

## Self-Review

**Spec coverage:**
- Shortlist always includes phase terminators: Task 1 ✓
- Drop banter from collection prompt (mode param on buildTurnPrompt + chooseAction): Tasks 2, 3 ✓
- BUILD_TURN_PROMPT_VERSION export: Task 2 ✓
- Fix chosenMoveId to be real move id: Tasks 3, 4 ✓
- Add shortlist to per-turn transcript: Tasks 3, 4 ✓
- Append-mode output + line-count resume: Task 6 ✓
- Rate-limit pause/retry with checkpoint exit on second failure: Tasks 5, 6 ✓
- Per-game metadata (harnessGitSha, buildTurnPromptVersion, collectionMode): Task 6 ✓
- Pilot wrapper script with all 6 pairings, seed offsets: Task 7 ✓
- pilot-meta.json builder: Task 7 ✓
- Style diagnostic with 3 metrics: Task 9 ✓
- Chi-square pairwise tests: Tasks 8, 9 ✓
- GO/NO-GO rule: all p<0.01 AND spread ≥ 15pp: Task 9 ✓
- Pilot run is the manual integration test (no live CI test): respected — no live integration tests added ✓
- Branch `feat/risk-data-collection-pilot` from main: Task 0 ✓
- Node 20 ESM, `node --test`: respected throughout ✓

**Placeholder scan:** No "TBD"/"TODO"/"implement later"/"add appropriate error handling". Every step has full code; every command has expected output.

**Type consistency:**
- `chooseAction` signature consistent across Tasks 1, 2, 3, 4 (mode param added in Task 3; Task 1 modifies the body without changing the signature) ✓
- `buildTurnPrompt` consumers (chooseAction in risk-player.js) pass `mode` after Task 3 ✓
- Return-shape of chooseAction: `{action, chosenMoveId, shortlist, banter, sessionId, sequenceTail}` consistent in Tasks 3, 4 ✓
- `runGame` accepts `mode` in Task 4, propagated by `risk-tourney.mjs` in Task 6 ✓
- `BUILD_TURN_PROMPT_VERSION` exported from `prompts.js` in Task 2, imported by `risk-tourney.mjs` in Task 6 ✓
- `countCompletedGames`, `runWithRateLimitRetry`, `chiSquare2x2`, `chiSquarePValue`, `computePersonaMetrics`, `evaluateGoNoGo`, `buildPilotMeta` — all consistent between their defining task and their test file ✓
- `chiSquare2x2({ a, b, c, d })` cells: used identically in Task 8 implementation and Task 9 consumer ✓
- `attackWhenAvailable: { attacked, total }` shape consistent between Task 9 implementation and tests ✓

**Test gaps:** No CI integration test against Claude CLI — by design per the spec. The pilot run itself is the integration test.

No issues found.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-21-risk-data-collection-pilot.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
