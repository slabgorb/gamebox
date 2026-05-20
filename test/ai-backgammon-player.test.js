import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseAction } from '../plugins/backgammon/server/ai/backgammon-player.js';
import { FakeLlmClient } from '../src/server/ai/fake-llm-client.js';
import { InvalidLlmMove, InvalidLlmResponse } from '../src/server/ai/errors.js';
import { buildInitialState } from '../plugins/backgammon/server/state.js';

function preRoll() {
  const s = buildInitialState({
    participants: [{ userId: 1, side: 'a' }, { userId: 2, side: 'b' }],
    options: {},
  });
  s.turn.phase = 'pre-roll';
  s.turn.activePlayer = 'a';
  s.activeUserId = 1;
  return s;
}

const persona = { id: 'colonel-pip', displayName: 'Colonel Pip', systemPrompt: 'you are colonel pip' };

test('CROSS-BUG-3 AC4: chooseAction picks roll as a values-less intent (no rng materialization)', async () => {
  const llm = new FakeLlmClient([{ text: '{"moveId":"roll","banter":"steady"}' }]);
  // Pin the rng to a counting spy. After CROSS-BUG-3, dice values are NEVER
  // generated server-side on the bot path — physics happens on the human's
  // client and resolves via state.pendingRoll. The chooseAction adapter
  // therefore returns a roll INTENT (no payload.values).
  let rngCalls = 0;
  const rng = () => { rngCalls += 1; return 0.5; };
  const r = await chooseAction({ llm, persona, sessionId: null, state: preRoll(), botPlayerIdx: 0, rng });
  assert.equal(r.action.type, 'roll');
  assert.equal(rngCalls, 0, 'chooseAction must not consume rng for dice values');
  assert.equal(
    r.action.payload?.values,
    undefined,
    'roll action must NOT carry values from chooseAction — the engine reads state.pendingRoll and the human client supplies values',
  );
  assert.equal(r.banter, 'steady');
  assert.deepEqual(r.sequenceTail, []);
});

test('chooseAction: picks a sequence in moving phase and returns sequenceTail', async () => {
  const state = preRoll();
  state.turn.phase = 'moving';
  state.turn.dice = { values: [5, 3], remaining: [5, 3], throwParams: [] };
  // Phase 4: the adapter now hands the LLM a top-N shortlist scored by
  // board-eval, so seq numbers don't necessarily start at 1. Echo back
  // whichever id appears first in the prompt.
  const llm = {
    send: async ({ prompt }) => {
      const m = prompt.match(/seq:\d+/);
      return { text: `{"moveId":"${m[0]}","banter":""}` };
    },
  };
  const r = await chooseAction({ llm, persona, sessionId: null, state, botPlayerIdx: 0 });
  assert.equal(r.action.type, 'move');
  assert.ok(Array.isArray(r.sequenceTail));
  assert.equal(r.sequenceTail.length, 1);
  assert.equal(r.sequenceTail[0].type, 'move');
});

test('chooseAction: throws InvalidLlmMove for unknown moveId', async () => {
  const llm = new FakeLlmClient([{ text: '{"moveId":"bogus","banter":""}' }]);
  await assert.rejects(
    chooseAction({ llm, persona, sessionId: null, state: preRoll(), botPlayerIdx: 0 }),
    InvalidLlmMove,
  );
});

test('chooseAction: throws InvalidLlmResponse for malformed text', async () => {
  const llm = new FakeLlmClient([{ text: 'not json at all' }]);
  await assert.rejects(
    chooseAction({ llm, persona, sessionId: null, state: preRoll(), botPlayerIdx: 0 }),
    InvalidLlmResponse,
  );
});

test('chooseAction: throws when no legal moves (e.g. wrong phase)', async () => {
  const state = preRoll();
  state.turn.phase = 'match-end';  // not a phase the adapter handles
  const llm = new FakeLlmClient([]);
  await assert.rejects(
    chooseAction({ llm, persona, sessionId: null, state, botPlayerIdx: 0 }),
    /no legal moves/,
  );
});
