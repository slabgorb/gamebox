import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32, wilsonInterval, runGame } from '../src/server/ai/headless-game.js';

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

// Stub LLM that always picks the first move in the shortlist by returning
// the move id wrapped in the JSON shape parseLlmResponse expects.
// The prompt from buildTurnPrompt lists moves like:
//   "  - setup-deploy:0: setup-deploy {"ALA":20} (score X.X)"
// We grab the first candidate id (the text between "  - " and the next ":").
function firstMoveLlm() {
  return {
    async send({ prompt }) {
      // Match the first candidate line: "  - <id>: <summary>"
      // IDs can contain letters, digits, colons, hyphens, and arrows (->)
      const m = prompt.match(/^\s+-\s+([\w\-:>]+):/m);
      const id = m ? m[1] : 'end-attack';
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
