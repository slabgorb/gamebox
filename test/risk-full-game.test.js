// test/risk-full-game.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import riskPlugin from '../plugins/risk/plugin.js';
import { chooseAction } from '../plugins/risk/server/ai/risk-player.js';
import { enumerateLegalMoves } from '../plugins/risk/server/ai/legal-moves.js';
import { resolveAttack } from '../plugins/risk/server/combat.js';

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

// CROSS-BUG-3: the live game no longer server-rolls — the defender's client
// drives the physics. In a bot-vs-bot simulation there's no human client, so
// this helper stands in: when pendingCombat is set, resolve it using the same
// deterministic rng the rest of the harness uses.
function resolveBotCombat(state, rng) {
  const pc = state.pendingCombat;
  const src = state.territories[pc.from];
  const tgt = state.territories[pc.to];
  const committed = src.armies - 1;
  const outcome = resolveAttack({ force: committed, defenders: tgt.armies }, rng);
  const action = {
    type: 'attack',
    payload: {
      from: pc.from, to: pc.to, force: pc.force,
      resolved: { rounds: outcome.rounds },
    },
  };
  // The defender (activeUserId after pendingCombat is set) POSTs.
  return riskPlugin.applyAction({ state, action, actorId: state.activeUserId });
}

test('a full game between two AI strategies terminates with a winner', async () => {
  const rng = rngFrom(12345);
  let state = riskPlugin.initialState({
    participants: [{ userId: 1, side: 'a' }, { userId: 2, side: 'b' }],
    rng,
  });

  let guard = 0;
  while (state.phase !== 'gameover') {
    if (++guard > 4000) throw new Error('game did not terminate');

    if (state.pendingCombat) {
      const out = resolveBotCombat(state, rng);
      assert.equal(out.error, undefined, `engine rejected resolve: ${out.error}`);
      state = out.state;
      continue;
    }

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

// E2-9 AC-6: the carded engine + cards-aware bot must exercise a trade-in
// end-to-end. Without this, the rerun corpus could be collected on a pipeline
// where cards are never actually traded.
// Seed 12345 was verified to drive a full game (hundreds of turns) in which the
// fakeLlm/scoring heuristic accumulates and trades at least one card set; the
// forced trade at >=5 cards also guarantees a trade if voluntary ones never fire.
test('a full carded game exercises at least one trade-in', async () => {
  const rng = rngFrom(12345);
  let state = riskPlugin.initialState({
    participants: [{ userId: 1, side: 'a' }, { userId: 2, side: 'b' }],
    rng,
  });

  let tradeIns = 0;
  let guard = 0;
  while (state.phase !== 'gameover') {
    if (++guard > 4000) throw new Error('game did not terminate');

    if (state.pendingCombat) {
      state = resolveBotCombat(state, rng).state;
      continue;
    }

    const actorId = state.activeUserId;
    const botIdx = state.sides.a === actorId ? 0 : 1;
    // Guard mirrors the real server loop and the sibling test: an empty
    // shortlist would otherwise crash inside chooseAction with an opaque error
    // rather than pointing at the engine state that produced no legal moves.
    const moves = enumerateLegalMoves(state, botIdx);
    assert.ok(moves.length > 0, `no legal moves in phase ${state.phase}`);
    const r = await chooseAction({
      llm: fakeLlm, persona: { systemPrompt: 's' }, sessionId: null,
      state, botPlayerIdx: botIdx,
    });
    if (r.action.type === 'trade-in') tradeIns += 1;
    const out = riskPlugin.applyAction({ state, action: r.action, actorId, rng });
    assert.equal(out.error, undefined, `engine rejected ${JSON.stringify(r.action)}: ${out.error}`);
    state = out.state;
  }

  assert.ok(tradeIns >= 1, `expected at least one trade-in in a full carded game, saw ${tradeIns}`);
});
