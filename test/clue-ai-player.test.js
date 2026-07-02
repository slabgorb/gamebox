// E6-4 Tasks 4+5 — chooseAction (persona pick + banter) and the prompt/parser.
//
// Contract (AC #2, words/backgammon precedent): pick a shortlisted action by
// id; InvalidLlmMove on an id outside the menu; InvalidLlmResponse on
// unparseable output; deterministic auto-refute with usedLlm:false and NO
// llm call; resume-aware systemPrompt; never a valued roll action.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  chooseAction, InvalidLlmMove, InvalidLlmResponse,
} from '../plugins/clue/server/ai/clue-player.js';
import { buildTurnPrompt, parseLlmResponse } from '../plugins/clue/server/ai/prompts.js';
import { buildClueShortlist } from '../plugins/clue/server/ai/shortlist.js';
import { buildTracker } from '../plugins/clue/server/ai/knowledge.js';
import {
  miniGeo, topOfTurnState, movementState, suggestState, refuteState, poison,
} from './_helpers/clue-fixtures.js';

const persona = { id: 'miss-scarlett', displayName: 'Miss Scarlett', systemPrompt: 'be scarlett' };

// Fake llm that returns fixed text and records every send() call.
function fakeLlm(text) {
  const calls = [];
  return {
    calls,
    send: async (args) => { calls.push(args); return { text, sessionId: 'sess-1' }; },
  };
}

function shortlistFor(state, geo, seat = 0) {
  return buildClueShortlist({ state, geo, seat, tracker: buildTracker({ state, seat }) });
}

test('picks the shortlisted action by id, returns banter and the llm sessionId', async () => {
  const state = suggestState();
  const sl = shortlistFor(state);
  const pick = sl.find((e) => e.action.type === 'suggest') ?? sl[0];
  const llm = fakeLlm(JSON.stringify({ moveId: pick.id, banter: 'Cards on the table.' }));
  const r = await chooseAction({ llm, persona, state, botPlayerIdx: 0 });
  assert.deepEqual(r.action, pick.action);
  assert.equal(r.banter, 'Cards on the table.');
  assert.equal(r.sessionId, 'sess-1');
  assert.equal(llm.calls.length, 1);
});

test('throws InvalidLlmMove on an id not in the shortlist', async () => {
  const state = suggestState();
  const llm = fakeLlm('{"moveId":"not-a-real-id","banter":"x"}');
  await assert.rejects(
    () => chooseAction({ llm, persona, state, botPlayerIdx: 0 }),
    (e) => e instanceof InvalidLlmMove && e.name === 'InvalidLlmMove',
  );
});

test('throws InvalidLlmResponse on unparseable output', async () => {
  const state = suggestState();
  const llm = fakeLlm('not json at all');
  await assert.rejects(
    () => chooseAction({ llm, persona, state, botPlayerIdx: 0 }),
    (e) => e instanceof InvalidLlmResponse && e.name === 'InvalidLlmResponse',
  );
});

test('resume-aware systemPrompt: persona on first call, null on resume', async () => {
  const state = suggestState();
  const pick = shortlistFor(state)[0];
  const fresh = fakeLlm(JSON.stringify({ moveId: pick.id, banter: 'hi' }));
  await chooseAction({ llm: fresh, persona, state, botPlayerIdx: 0 });
  assert.equal(fresh.calls[0].systemPrompt, persona.systemPrompt);

  const resumed = fakeLlm(JSON.stringify({ moveId: pick.id, banter: 'hi' }));
  await chooseAction({ llm: resumed, persona, sessionId: 'sess-0', state, botPlayerIdx: 0 });
  assert.equal(resumed.calls[0].systemPrompt, null);
  assert.equal(resumed.calls[0].sessionId, 'sess-0');
});

test('auto-refute: deterministic, usedLlm:false, and NO llm call', async () => {
  const state = refuteState({ botSeat: 2, botHand: ['green', 'knife'] });
  let sent = false;
  const llm = { send: async () => { sent = true; return {}; } };
  const r = await chooseAction({ llm, persona, state, botPlayerIdx: 2 });
  assert.equal(r.usedLlm, false);
  assert.equal(sent, false, 'the invisible mechanic burns no LLM call');
  assert.equal(r.action.type, 'refute');
  assert.ok(['green', 'knife'].includes(r.action.payload.card), 'held and named');

  const again = await chooseAction({ llm, persona, state: refuteState({ botSeat: 2, botHand: ['green', 'knife'] }), botPlayerIdx: 2 });
  assert.equal(again.action.payload.card, r.action.payload.card, 'deterministic');
});

test('the bot never returns a valued roll action', async () => {
  const state = topOfTurnState();
  const llm = fakeLlm('{"moveId":"roll","banter":"Here we go."}');
  const r = await chooseAction({ llm, persona, state, botPlayerIdx: 0, geo: miniGeo() });
  assert.equal(r.action.type, 'roll');
  assert.equal(r.action.payload?.value, undefined, 'die values come from the client, never the bot');
});

test('zero-legal-moves state still yields a well-formed action (never deadlocks)', async () => {
  const state = movementState({ pendingRoll: 6, blocked: true });
  const geo = miniGeo();
  const sl = shortlistFor(state, geo);
  const pickId = (sl.find((e) => e.action.type === 'pass') ?? sl[0]).id;
  const llm = fakeLlm(JSON.stringify({ moveId: pickId, banter: 'Hmph.' }));
  const r = await chooseAction({ llm, persona, state, botPlayerIdx: 0, geo });
  assert.equal(typeof r.action?.type, 'string', 'a null action would TypeError in applyClueAction (F3)');
});

// --- buildTurnPrompt (Task 4) ---

test('turn prompt lists every shortlist id, the own hand, and the JSON footer', () => {
  const state = suggestState();
  const sl = shortlistFor(state);
  const tracker = buildTracker({ state, seat: 0 });
  const prompt = buildTurnPrompt({ state, shortlist: sl, seat: 0, tracker });
  for (const e of sl) assert.ok(prompt.includes(e.id), `prompt offers id '${e.id}'`);
  for (const card of state.hands[0]) assert.ok(prompt.includes(card), `prompt shows own card '${card}'`);
  assert.ok(prompt.includes('moveId'), 'prompt carries the JSON response footer');
});

test('turn prompt is own-info-only (poison invariance)', () => {
  const state = suggestState();
  const sl = shortlistFor(state);
  const clean = buildTurnPrompt({
    state, shortlist: sl, seat: 0, tracker: buildTracker({ state, seat: 0 }),
  });
  const p = poison(state);
  const dirty = buildTurnPrompt({
    state: p, shortlist: shortlistFor(p), seat: 0, tracker: buildTracker({ state: p, seat: 0 }),
  });
  assert.equal(dirty, clean, 'corrupting envelope/other hands must not change the prompt');
});

// --- parseLlmResponse (Task 4) ---

test('parseLlmResponse: fenced json, bare json amid prose, banter coercion', () => {
  assert.deepEqual(
    parseLlmResponse('```json\n{"moveId":"x","banter":"hi"}\n```'),
    { moveId: 'x', banter: 'hi' },
  );
  assert.deepEqual(
    parseLlmResponse('I shall choose. {"moveId":"suggest-1","banter":"So."} Indeed.'),
    { moveId: 'suggest-1', banter: 'So.' },
  );
  assert.deepEqual(parseLlmResponse('{"moveId":"x"}'), { moveId: 'x', banter: '' });
});

test('parseLlmResponse throws on garbage and on a missing moveId', () => {
  assert.throws(() => parseLlmResponse('not json at all'));
  assert.throws(() => parseLlmResponse('{"banter":"no move here"}'));
  assert.throws(() => parseLlmResponse('{"moveId": 42, "banter":"typed wrong"}'));
});

// --- Own-info-only + determinism source pins (rule enforcement) ---

const AI_FILES = [
  'plugins/clue/server/ai/knowledge.js',
  'plugins/clue/server/ai/shortlist.js',
  'plugins/clue/server/ai/prompts.js',
  'plugins/clue/server/ai/clue-player.js',
];
const root = resolve(import.meta.dirname, '..');

test('no clue AI module reads state.envelope (never-cheats, greppable)', () => {
  // 'envelope' as a matrix LOCATION string is legitimate in knowledge.js;
  // dereferencing the secret off the state object never is. The poison
  // tests carry the behavioral half of this guarantee.
  for (const rel of AI_FILES) {
    const src = readFileSync(resolve(root, rel), 'utf8');
    assert.ok(!/state\s*\.\s*envelope/.test(src),
      `${rel} must not read state.envelope — deductions come from the tracker only`);
    assert.ok(!/\{[^}]*\benvelope\b[^}]*\}\s*=\s*state\b/.test(src),
      `${rel} must not destructure envelope off the state`);
  }
});

test('no clue AI module (or the refute chooser) uses Math.random', () => {
  for (const rel of [...AI_FILES, 'plugins/clue/server/refute.js']) {
    const src = readFileSync(resolve(root, rel), 'utf8');
    assert.ok(!/Math\.random/.test(src),
      `${rel} must be deterministic — no Math.random (sorry-style random fallback is NOT this contract)`);
  }
});
