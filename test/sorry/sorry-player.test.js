import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseAction } from '../../plugins/sorry/server/ai/sorry-player.js';

// --- helpers -------------------------------------------------------------

const mkStartPawns = () =>
  Array.from({ length: 4 }, (_, i) => ({ id: i, zone: 'start', index: 0 }));

// Side 'a' to move, card 1, all pawns in Start → legal moves are out:0..out:3.
function baseState(over = {}) {
  return {
    sides: { a: 'user-a', b: 'user-b' },
    pawns: { a: mkStartPawns(), b: mkStartPawns() },
    deck: [],
    discard: [],
    drawnCard: 1,
    currentPlayer: 'a',
    winner: null,
    lastEvent: null,
    activeUserId: 'user-a',
    ...over,
  };
}

const persona = { systemPrompt: 'You are a test persona.' };

const stubLlm = (response) => ({ send: async () => response });

// =========================================================================
// AC 8.1 / AC 3 — an LLM-chosen legal move is applied verbatim as a move
// =========================================================================

test('chooseAction: applies the LLM-chosen legal move as a move action', async () => {
  const llm = stubLlm({ text: '{"moveId":"out:0","banter":"Outta my way!"}', sessionId: 's1' });
  const r = await chooseAction({ llm, persona, sessionId: null, state: baseState(), botPlayerIdx: 0, userMessages: [] });
  assert.deepEqual(r.action, { type: 'move', payload: { moveId: 'out:0' } });
  assert.equal(r.banter, 'Outta my way!');
});

// =========================================================================
// AC 3 — the returned sessionId comes from the LLM response (threading)
// =========================================================================

test('chooseAction: threads the sessionId from the LLM response, not the input', async () => {
  const llm = stubLlm({ text: '{"moveId":"out:0","banter":"hi"}', sessionId: 'srv-session-xyz' });
  const r = await chooseAction({ llm, persona, sessionId: 'input-sid', state: baseState(), botPlayerIdx: 0, userMessages: [] });
  assert.equal(r.sessionId, 'srv-session-xyz');
});

// =========================================================================
// AC 8.2 / AC 4 — unparseable output falls back to a random legal move
// =========================================================================

test('chooseAction: falls back to a legal move when the LLM output is unparseable', async () => {
  const llm = stubLlm({ text: 'I refuse to answer in JSON, hah!', sessionId: 's2' });
  const r = await chooseAction({ llm, persona, sessionId: null, state: baseState(), botPlayerIdx: 0, userMessages: [] });
  assert.equal(r.action.type, 'move');
  assert.match(r.action.payload.moveId, /^out:/);
  // AC 4: banter is the empty string on fallback — NOT undefined (empty is falsy).
  assert.equal(r.banter, '');
});

// =========================================================================
// AC 3 — a valid-JSON-but-illegal moveId also falls back
// =========================================================================

test('chooseAction: falls back when the LLM picks a moveId not in the legal set', async () => {
  const llm = stubLlm({ text: '{"moveId":"out:99","banter":"cheating"}', sessionId: 's3' });
  const r = await chooseAction({ llm, persona, sessionId: null, state: baseState(), botPlayerIdx: 0, userMessages: [] });
  assert.equal(r.action.type, 'move');
  assert.match(r.action.payload.moveId, /^out:/);
  assert.notEqual(r.action.payload.moveId, 'out:99');
  assert.equal(r.banter, '');
});

// =========================================================================
// AC 4 — the fallback always yields a move that is actually legal
// =========================================================================

test('chooseAction: the fallback move is always one of the enumerated legal moves', async () => {
  const llm = stubLlm({ text: 'garbage', sessionId: 's4' });
  const legalIds = new Set(['out:0', 'out:1', 'out:2', 'out:3']);
  // The fallback is random — run repeatedly so every draw must be legal.
  for (let i = 0; i < 12; i++) {
    const r = await chooseAction({ llm, persona, sessionId: null, state: baseState(), botPlayerIdx: 0, userMessages: [] });
    assert.ok(legalIds.has(r.action.payload.moveId), `fallback picked an illegal move: ${r.action.payload.moveId}`);
  }
});

// =========================================================================
// Guardrail — the bot emits only 'move' actions, never 'draw'
// =========================================================================

test('chooseAction: emits a move action and never a draw action', async () => {
  const llm = stubLlm({ text: '{"moveId":"out:0","banter":"x"}', sessionId: 's5' });
  const r = await chooseAction({ llm, persona, sessionId: null, state: baseState(), botPlayerIdx: 0, userMessages: [] });
  assert.equal(r.action.type, 'move');
});
