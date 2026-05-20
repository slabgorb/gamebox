// Leaving a Risk game = resign = forfeit (opponent wins), and a finished
// game must signal `ended` so the host registry marks status='ended'.
// Covers the resign action and the previously-silent natural-win path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';
import { enumerateLegalMoves } from '../plugins/risk/server/ai/legal-moves.js';
import { allTerritories } from '../plugins/risk/server/map.js';

// alaska is adjacent to nwt.
function midGame(overrides = {}) {
  return {
    phase: 'attack', currentPlayer: 0,
    territories: {
      alaska: { owner: 0, armies: 5 }, nwt: { owner: 1, armies: 3 },
      alberta: { owner: 1, armies: 1 }, kamchatka: { owner: 0, armies: 1 },
    },
    reinforcePool: 0, setupPools: [0, 0], fortifyUsed: false,
    lastCombat: null, winner: null, log: [], sides: { a: 7, b: 8 }, activeUserId: 7,
    ...overrides,
  };
}

test('resign by the active player ends the game; opponent wins, reason=resign', () => {
  const r = applyRiskAction({ state: midGame(), actorId: 7, rng: Math.random,
    action: { type: 'resign' } });
  assert.equal(r.error, undefined);
  assert.equal(r.ended, true, 'must signal ended so the host registers status=ended');
  assert.equal(r.state.phase, 'gameover');
  assert.equal(r.state.winner, 1, 'opponent (player 1) wins');
  assert.equal(r.state.winnerSide, 'b', 'side b wins (player 1 == side b)');
  assert.equal(r.state.endedReason, 'resign');
  assert.deepEqual(r.summary, { kind: 'resign' });
});

test('resign works even when it is NOT the resigning player\'s turn', () => {
  // currentPlayer is 0 (the bot, say); the human is player 1 / side b / id 8.
  const r = applyRiskAction({ state: midGame({ currentPlayer: 0, activeUserId: 7 }),
    actorId: 8, rng: Math.random, action: { type: 'resign' } });
  assert.equal(r.error, undefined, 'no "not your turn" — leaving must work mid-bot-turn');
  assert.equal(r.ended, true);
  assert.equal(r.state.winner, 0, 'the non-resigning player (0) wins');
  assert.equal(r.state.winnerSide, 'a');
  assert.equal(r.state.endedReason, 'resign');
});

test('resign on an already-finished game is rejected', () => {
  const r = applyRiskAction({ state: midGame({ phase: 'gameover', winner: 0 }),
    actorId: 8, rng: Math.random, action: { type: 'resign' } });
  assert.ok(r.error, 'cannot resign a game that is already over');
  assert.equal(r.ended, undefined);
});

test('natural win (opponent wiped out) signals ended + winnerSide + reason', () => {
  // Player 0 holds alaska with overwhelming force; player 1 owns only nwt
  // (1 army). Steamroll it and player 1 has zero territories. CROSS-BUG-3:
  // the attacker (player 0) is the active player and POSTs a resolved
  // payload (their own client rolled). Defender = 1 → 3 attacker dice vs
  // 1 defender die wipes the defender in one round.
  const s = midGame({
    territories: {
      alaska: { owner: 0, armies: 20 }, nwt: { owner: 1, armies: 1 },
    },
  });
  const r = applyRiskAction({ state: s, actorId: 7,
    action: { type: 'attack', payload: { from: 'alaska', to: 'nwt', force: 19,
      resolved: { rounds: [{ aDice: [6, 6, 6], dDice: [1] }] } } } });
  assert.equal(r.error, undefined);
  assert.equal(r.state.phase, 'gameover');
  assert.equal(r.state.winner, 0);
  assert.equal(r.ended, true, 'natural win must also signal ended (was silently {state})');
  assert.equal(r.state.winnerSide, 'a');
  assert.ok(r.state.endedReason, 'endedReason set on natural win');
  assert.ok(r.summary, 'a summary is emitted so a turn row is recorded');
});

test('resign is never offered as a legal AI move', () => {
  // enumerateLegalMoves walks the full adjacency graph, so it needs a
  // complete board (a sparse fixture would NPE in neighborsOf).
  function fullBoard() {
    const territories = {};
    for (const id of allTerritories()) {
      if (id === 'alaska') territories[id] = { owner: 0, armies: 6 };
      else if (id === 'nwt') territories[id] = { owner: 0, armies: 2 };
      else territories[id] = { owner: 1, armies: 1 };
    }
    return {
      currentPlayer: 0,
      territories,
      reinforcePool: 3, setupPools: [5, 5], fortifyUsed: false,
    };
  }
  for (const phase of ['setup', 'reinforce', 'attack', 'fortify']) {
    const moves = enumerateLegalMoves({ ...fullBoard(), phase }, 0);
    assert.ok(!moves.some(m => m.action?.type === 'resign'),
      `phase ${phase}: AI must not be able to resign itself`);
  }
});
