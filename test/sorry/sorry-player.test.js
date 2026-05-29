import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseAction } from '../../plugins/sorry/server/ai/sorry-player.js';
import { baseState } from '../_helpers/sorry-fixtures.js';

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

// =========================================================================
// No legal move ⇒ the bot passes mechanically, without calling the LLM.
// (Guards the empty-move crash: moves[random*0] was undefined → undefined.id.)
// =========================================================================

test('chooseAction: returns a pass action and does not call the LLM when there are no legal moves', async () => {
  let called = false;
  const llm = { send: async () => { called = true; return { text: '{}', sessionId: 's' }; } };
  // All pawns in Start + card 3 ⇒ no legal move (3 cannot leave Start).
  const state = baseState({ drawnCard: 3 });
  const r = await chooseAction({ llm, persona, sessionId: null, state, botPlayerIdx: 0, userMessages: [] });
  assert.deepEqual(r.action, { type: 'pass' });
  assert.equal(r.usedLlm, false);
  assert.equal(called, false, 'the LLM must not be invoked on a forced pass');
});

// =========================================================================
// Forced move (exactly one legal move): banter-only call, no move menu.
// =========================================================================

// These tests stub llm.send inline (not via stubLlm) so they can capture the
// prompt that was sent and assert the banter-only path was used.

// A state with exactly one legal move: pawn 0 on the track, the other three
// already Home (Home pawns produce no move on a numeric card).
const oneMoveState = () => baseState({
  drawnCard: 8,
  pawns: {
    a: [
      { id: 0, zone: 'track', index: 10 },
      { id: 1, zone: 'home', index: 0 },
      { id: 2, zone: 'home', index: 0 },
      { id: 3, zone: 'home', index: 0 },
    ],
    b: [
      { id: 0, zone: 'start', index: 0 },
      { id: 1, zone: 'start', index: 0 },
      { id: 2, zone: 'start', index: 0 },
      { id: 3, zone: 'start', index: 0 },
    ],
  },
});

test('chooseAction: forced move plays the only legal move and uses a banter-only prompt', async () => {
  let sentPrompt = null;
  const llm = { send: async ({ prompt }) => { sentPrompt = prompt; return { text: '{"banter":"Forced, but fabulous."}', sessionId: 'bs1' }; } };
  const r = await chooseAction({ llm, persona, sessionId: null, state: oneMoveState(), botPlayerIdx: 0, userMessages: [] });
  assert.deepEqual(r.action, { type: 'move', payload: { moveId: 'forward:0:8' } });
  assert.equal(r.banter, 'Forced, but fabulous.');
  assert.equal(r.sessionId, 'bs1');
  assert.doesNotMatch(sentPrompt, /choose exactly one by its id/i); // no decision menu
  assert.ok(!('usedLlm' in r), 'forced move must not short-circuit resume-slot accounting');
});

test('chooseAction: forced-move banter degrades to empty string on unparseable output, move still plays', async () => {
  const llm = { send: async () => ({ text: '', sessionId: 'bs2' }) };
  const r = await chooseAction({ llm, persona, sessionId: null, state: oneMoveState(), botPlayerIdx: 0, userMessages: [] });
  assert.deepEqual(r.action, { type: 'move', payload: { moveId: 'forward:0:8' } });
  assert.equal(r.banter, '');
});

test('chooseAction: forced-move prompt still reacts to opponent chat', async () => {
  let sentPrompt = null;
  const llm = { send: async ({ prompt }) => { sentPrompt = prompt; return { text: '{"banter":"Heard that."}', sessionId: 'bs3' }; } };
  const r = await chooseAction({ llm, persona, sessionId: null, state: oneMoveState(), botPlayerIdx: 0, userMessages: ['nice try'] });
  assert.match(sentPrompt, /opponent just said/i);
  assert.match(sentPrompt, /nice try/);
  assert.equal(r.banter, 'Heard that.');
});
