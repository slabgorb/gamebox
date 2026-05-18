// test/risk-full-game.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import riskPlugin from '../plugins/risk/plugin.js';
import { chooseAction } from '../plugins/risk/server/ai/risk-player.js';
import { enumerateLegalMoves } from '../plugins/risk/server/ai/legal-moves.js';

function rngFrom(seed) {
  // Mulberry32 — deterministic PRNG.
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Fake LLM: always picks the first (highest-scored) shortlist id from the prompt.
const fakeLlm = {
  send: async ({ prompt }) => {
    const m = prompt.match(/ - (.+?): /);
    return { text: `{"moveId":"${m[1].trim()}","banter":"."}`, sessionId: null };
  },
};

test('a full game between two AI strategies terminates with a winner', async () => {
  const rng = rngFrom(12345);
  let state = riskPlugin.initialState({
    participants: [{ userId: 1, side: 'a' }, { userId: 2, side: 'b' }],
    rng,
  });

  let guard = 0;
  while (state.phase !== 'gameover') {
    if (++guard > 4000) throw new Error('game did not terminate');
    const actorId = state.activeUserId;
    const botIdx = state.sides.a === actorId ? 0 : 1;
    const moves = enumerateLegalMoves(state, botIdx);
    assert.ok(moves.length > 0, `no legal moves in phase ${state.phase}`);

    const r = await chooseAction({
      llm: fakeLlm, persona: { systemPrompt: 's' }, sessionId: null,
      state, botPlayerIdx: botIdx,
    });
    const out = riskPlugin.applyAction({ state, action: r.action, actorId, rng });
    assert.equal(out.error, undefined, `engine rejected ${JSON.stringify(r.action)}: ${out.error}`);
    state = out.state;
  }

  assert.ok(state.winner === 0 || state.winner === 1);
  assert.equal(state.activeUserId, null);
  const ownerSet = new Set(Object.values(state.territories).map(t => t.owner));
  assert.equal(ownerSet.size, 1); // one player owns everything
});
