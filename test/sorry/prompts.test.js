import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTurnPrompt,
  parseLlmResponse,
  extractJson,
} from '../../plugins/sorry/server/ai/prompts.js';
import { legalMoves } from '../../plugins/sorry/server/rules/legal-moves.js';

// --- helpers -------------------------------------------------------------

const mkStartPawns = () =>
  Array.from({ length: 4 }, (_, i) => ({ id: i, zone: 'start', index: 0 }));

// Side 'a' to move. Override `pawns`/`drawnCard` per case.
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

// =========================================================================
// AC 1 — buildTurnPrompt surfaces all the context the LLM needs
// =========================================================================

test('buildTurnPrompt: lists every legal move id so the LLM can pick one', () => {
  const state = baseState({ drawnCard: 1 }); // all in Start → out:0..out:3
  const moves = legalMoves(state);
  assert.ok(moves.length >= 4, 'fixture should produce the four out:* moves');

  const prompt = buildTurnPrompt({ state, legalMoves: moves, botPlayerIdx: 0, userMessages: [] });
  assert.equal(typeof prompt, 'string');
  assert.ok(prompt.length > 0);
  for (const m of moves) {
    assert.ok(prompt.includes(m.id), `prompt must surface legal move id "${m.id}"`);
  }
});

test('buildTurnPrompt: includes the strict JSON response instruction', () => {
  const state = baseState();
  const prompt = buildTurnPrompt({ state, legalMoves: legalMoves(state), botPlayerIdx: 0, userMessages: [] });
  assert.ok(prompt.includes('moveId'), 'prompt must instruct the JSON moveId field');
  assert.ok(prompt.includes('banter'), 'prompt must instruct the JSON banter field');
});

test('buildTurnPrompt: surfaces own and opponent pawn positions', () => {
  const aPawns = mkStartPawns();
  aPawns[0] = { id: 0, zone: 'track', index: 47 }; // distinctive bot position
  const bPawns = mkStartPawns();
  bPawns[0] = { id: 0, zone: 'track', index: 53 }; // distinctive opponent position
  const state = baseState({ pawns: { a: aPawns, b: bPawns }, drawnCard: 1 });

  const prompt = buildTurnPrompt({ state, legalMoves: legalMoves(state), botPlayerIdx: 0, userMessages: [] });
  assert.ok(prompt.includes('47'), 'prompt must show the bot pawn sitting on track 47');
  assert.ok(prompt.includes('53'), 'prompt must show the opponent pawn sitting on track 53');
});

test('buildTurnPrompt: the drawn card changes the prompt content', () => {
  const aPawns = mkStartPawns();
  aPawns[0] = { id: 0, zone: 'track', index: 20 };
  const shared = { pawns: { a: aPawns, b: mkStartPawns() } };
  const s5 = baseState({ ...shared, drawnCard: 5 });
  const s8 = baseState({ ...shared, drawnCard: 8 });

  const p5 = buildTurnPrompt({ state: s5, legalMoves: legalMoves(s5), botPlayerIdx: 0, userMessages: [] });
  const p8 = buildTurnPrompt({ state: s8, legalMoves: legalMoves(s8), botPlayerIdx: 0, userMessages: [] });
  assert.notEqual(p5, p8, 'a different drawn card must yield a different prompt');
});

test('buildTurnPrompt: surfaces opponent banter when userMessages are present', () => {
  const state = baseState();
  const taunt = 'You will never catch me, slowpoke';
  const prompt = buildTurnPrompt({ state, legalMoves: legalMoves(state), botPlayerIdx: 0, userMessages: [taunt] });
  assert.ok(prompt.includes(taunt), 'prompt must surface the opponent message so the bot can react');
});

test('buildTurnPrompt: the reaction block is conditional on userMessages', () => {
  const state = baseState();
  const withMsg = buildTurnPrompt({ state, legalMoves: legalMoves(state), botPlayerIdx: 0, userMessages: ['hi there'] });
  const without = buildTurnPrompt({ state, legalMoves: legalMoves(state), botPlayerIdx: 0, userMessages: [] });
  assert.notEqual(withMsg, without, 'a reaction block should only appear when the opponent spoke');
});

// =========================================================================
// AC 2 — parseLlmResponse and extractJson are copied helpers
// =========================================================================

test('extractJson: strips a fenced code block', () => {
  const raw = 'Here is my move:\n```json\n{"moveId":"out:0","banter":"hah"}\n```\n';
  assert.deepEqual(JSON.parse(extractJson(raw)), { moveId: 'out:0', banter: 'hah' });
});

test('extractJson: slices a bare object out of surrounding prose', () => {
  const raw = 'I choose {"moveId":"out:1","banter":"go"} because reasons';
  assert.deepEqual(JSON.parse(extractJson(raw)), { moveId: 'out:1', banter: 'go' });
});

test('extractJson: throws when no JSON object is present', () => {
  assert.throws(() => extractJson('no braces here at all'));
});

test('parseLlmResponse: returns moveId and banter for valid JSON', () => {
  const r = parseLlmResponse('{"moveId":"out:2","banter":"bump!"}');
  assert.equal(r.moveId, 'out:2');
  assert.equal(r.banter, 'bump!');
});

test('parseLlmResponse: throws when moveId is missing or not a string', () => {
  assert.throws(() => parseLlmResponse('{"banter":"no move id"}'));
  assert.throws(() => parseLlmResponse('{"moveId":42,"banter":"numeric"}'));
});

test('parseLlmResponse: defaults banter to empty string when absent', () => {
  const r = parseLlmResponse('{"moveId":"out:0"}');
  assert.equal(r.banter, '');
});

test('parseLlmResponse: throws on malformed JSON', () => {
  assert.throws(() => parseLlmResponse('{"moveId":'));
});
