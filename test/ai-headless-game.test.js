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

test('runGame transcript flags cardSecuredThisTurn correctly (the diagnostic instrument)', async () => {
  // E2-9: the post-card-secured aggression metric depends on the harness
  // recording cardSecuredThisTurn per turn. This tests the instrument itself,
  // not just computation over hand-labelled fixtures.
  const r = await runGame({
    llmA: firstMoveLlm(), llmB: firstMoveLlm(),
    personaA: STUB_PERSONA, personaB: STUB_PERSONA,
    seed: 7, maxTurns: 1000,
  });

  let sawSecured = false;
  for (const entry of r.transcript) {
    // Wiring contract: the flag is exactly stateBefore.capturedThisTurn === true.
    assert.equal(
      entry.cardSecuredThisTurn,
      entry.stateBefore.capturedThisTurn === true,
      `turn ${entry.turn}: flag must mirror stateBefore.capturedThisTurn`,
    );
    // A card can only be secured by an attack capture, which happens in the
    // attack phase; capturedThisTurn is reset before each reinforce/setup turn.
    if (entry.phase === 'reinforce' || entry.phase === 'setup') {
      assert.equal(entry.cardSecuredThisTurn, false,
        `turn ${entry.turn} (${entry.phase}): no card can be secured before the attack phase`);
    }
    if (entry.cardSecuredThisTurn === true) sawSecured = true;
  }
  // The instrument must actually fire in a real game — otherwise the metric is
  // silently dead (all-zero) and no fixture test would catch it.
  assert.ok(sawSecured,
    'a full game must contain at least one post-card-secured decision');
});

test('runGame passes mode to chooseAction (collection mode prompts have no banter clause)', async () => {
  // Capture the prompt to confirm collection mode reaches all the way down.
  const prompts = [];
  const captureLlm = {
    async send({ prompt }) {
      prompts.push(prompt);
      const m = prompt.match(/^\s*-\s+([\w\-:>]+):/m);
      const id = m ? m[1] : 'end-attack';
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
