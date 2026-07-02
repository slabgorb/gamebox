// E6-4 Task 8 — headless bot-deduction integration: the Plan 3 AI layers
// driving the REAL E6-1/E6-2/E6-3 reducers end to end.
//
// Scenario contract (plan Task 8): solve -> accuse wins via the shipped
// doAccuse/endWith shape (no `summary` field relied on, F1); bluff
// suggestions are legal; the async-pause refute walk hands activeUserId to
// a human and back; a bot refuter resumes the turn deterministically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialState } from '../plugins/clue/server/state.js';
import { applyClueAction } from '../plugins/clue/server/actions.js';
import { buildTracker } from '../plugins/clue/server/ai/knowledge.js';
import { buildClueShortlist } from '../plugins/clue/server/ai/shortlist.js';
import { chooseAction } from '../plugins/clue/server/ai/clue-player.js';
import {
  det, accusePassState, suggestState, SOLUTION, SEATS3,
} from './_helpers/clue-fixtures.js';

const persona = { id: 'miss-scarlett', displayName: 'Miss Scarlett', systemPrompt: 'be scarlett' };

// Fake llm that always picks the given (or first) shortlisted id.
const pickFirst = (sl, prefer = null) => {
  const entry = (prefer && sl.find((e) => e.id === prefer)) ?? sl[0];
  return { send: async () => ({ text: JSON.stringify({ moveId: entry.id, banter: 'Hm.' }), sessionId: 's' }) };
};

test('solve -> accuse: the solved bot accuses the tracker solution and wins', async () => {
  const state = accusePassState({ solved: true });
  const tracker = buildTracker({ state, seat: 0 });
  assert.deepEqual(tracker.envelopeSolution(), SOLUTION, 'fixture is fully determined');

  const sl = buildClueShortlist({ state, seat: 0, tracker });
  const accuse = sl.find((e) => e.slot === 'accuse');
  assert.ok(accuse, 'solved bot is offered the accusation');

  const r = await chooseAction({
    llm: pickFirst(sl, accuse.id), persona, state, botPlayerIdx: 0,
  });
  assert.equal(r.action.type, 'accuse');
  assert.deepEqual(r.action.payload, SOLUTION);

  const applied = applyClueAction({ state, action: r.action, actorId: SEATS3[0] });
  assert.equal(applied.error, undefined);
  assert.equal(applied.ended, true);
  assert.equal(applied.state.winnerSeat, 0);
  assert.equal(applied.state.endedReason, 'accusation');
  assert.equal(applied.state.phase, 'ended');
});

test('bluff suggestion naming a self-held card is legal through doSuggest', () => {
  // The bot holds 'kitchen' and stands in it; suggesting kitchen + its own
  // 'mustard' is canonical bluffing and must validate.
  const state = suggestState({ room: 'kitchen' });
  const applied = applyClueAction({
    state,
    action: { type: 'suggest', payload: { suspect: 'mustard', weapon: 'revolver', room: 'kitchen' } },
    actorId: SEATS3[0],
  });
  assert.equal(applied.error, undefined);
  assert.ok(applied.state.log.some((e) => e.type === 'suggest'
    && e.suspect === 'mustard' && e.room === 'kitchen'));
});

test('async-pause: a human refuter takes activeUserId, then hands the turn back', () => {
  // Bot (seat 0) suggests { green, knife, hall }; seat 1 (human, userId 8)
  // holds green -> phase 'refute' pauses on the human. The bot must NOT be
  // active during the pause (the orchestrator gates on activeUserId===bot).
  const state = suggestState({ room: 'hall' });
  const suggested = applyClueAction({
    state,
    action: { type: 'suggest', payload: { suspect: 'green', weapon: 'knife', room: 'hall' } },
    actorId: SEATS3[0],
  });
  assert.equal(suggested.error, undefined);
  assert.equal(suggested.state.phase, 'refute');
  assert.equal(suggested.state.activeUserId, SEATS3[1], 'pause on the human refuter');
  assert.notEqual(suggested.state.activeUserId, SEATS3[0], 'bot is not active while paused');

  const refuted = applyClueAction({
    state: suggested.state,
    action: { type: 'refute', payload: { card: 'green' } },
    actorId: SEATS3[1],
  });
  assert.equal(refuted.error, undefined);
  assert.equal(refuted.state.phase, 'accuse-or-pass');
  assert.equal(refuted.state.activeUserId, SEATS3[0], 'turn returns to the suggester');
  assert.deepEqual(refuted.state.ledgers[0].at(-1), { fromSeat: 1, card: 'green' });
});

test('bot refuter: deterministic refute resumes the suggester without an LLM call', async () => {
  // Bot (seat 0) suggests { peacock, revolver, kitchen } from kitchen; seat 1
  // holds none of those, seat 2 (bot) holds peacock+revolver -> bot refutes.
  const state = suggestState({ room: 'kitchen' });
  const suggested = applyClueAction({
    state,
    action: { type: 'suggest', payload: { suspect: 'peacock', weapon: 'revolver', room: 'kitchen' } },
    actorId: SEATS3[0],
  });
  assert.equal(suggested.error, undefined);
  assert.equal(suggested.state.phase, 'refute');
  assert.equal(suggested.state.suggestion.refuterSeat, 2);
  assert.equal(suggested.state.activeUserId, SEATS3[2]);

  let sent = false;
  const r = await chooseAction({
    llm: { send: async () => { sent = true; return {}; } },
    persona, state: suggested.state, botPlayerIdx: 2,
  });
  assert.equal(sent, false);
  assert.equal(r.usedLlm, false);
  assert.equal(r.action.type, 'refute');
  assert.ok(['peacock', 'revolver'].includes(r.action.payload.card));

  const refuted = applyClueAction({ state: suggested.state, action: r.action, actorId: SEATS3[2] });
  assert.equal(refuted.error, undefined);
  assert.equal(refuted.state.activeUserId, SEATS3[0], 'suggester resumes at accuse-or-pass');
  assert.equal(refuted.state.phase, 'accuse-or-pass');
});

test('fresh deal smoke: first bot decision on a real deal is a values-less roll intent', async () => {
  const state = buildInitialState({
    participants: [{ userId: 7, seat: 0 }, { userId: 8, seat: 1 }, { userId: 9, seat: 2 }],
    rng: det(42),
  });
  const tracker = buildTracker({ state, seat: 0 });
  const sl = buildClueShortlist({ state, seat: 0, tracker });
  const roll = sl.find((e) => e.slot === 'roll');
  assert.ok(roll, 'top of a fresh turn offers the roll intent');

  const r = await chooseAction({ llm: pickFirst(sl, 'roll'), persona, state, botPlayerIdx: 0 });
  assert.equal(r.action.type, 'roll');
  assert.equal(r.action.payload?.value, undefined);

  // The values-less intent is deliberately NOT engine-applicable: the CLIENT
  // materialises the die and POSTs roll{value} (F8 contract). Pin that the
  // reducer rejects a value-less roll so nobody "fixes" it server-side.
  const applied = applyClueAction({ state, action: r.action, actorId: 7 });
  assert.match(applied.error ?? '', /die value/, 'engine demands the client-rolled value');
});
