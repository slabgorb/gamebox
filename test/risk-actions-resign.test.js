// Leaving a Risk game = resign = forfeit (opponent wins), and a finished
// game must signal `ended` so the host registry marks status='ended'.
// Covers the resign action and the previously-silent natural-win path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';
import { enumerateLegalMoves } from '../plugins/risk/server/ai/legal-moves.js';

function midGame(overrides = {}) {
  return {
    phase: 'attack', currentPlayer: 0,
    territories: {
      N1: { owner: 0, armies: 5 }, N2: { owner: 1, armies: 3 },
      N3: { owner: 1, armies: 1 }, E1: { owner: 0, armies: 1 },
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
  // Player 0 holds N1 with overwhelming force; player 1 owns only N2 (1 army).
  // Steamroll it and player 1 has zero territories -> game over.
  const s = midGame({
    territories: { N1: { owner: 0, armies: 20 }, N2: { owner: 1, armies: 1 } },
  });
  let rc = 0;
  const rng = () => (rc++ < 3 ? 0.99 : 0.0); // attacker max, defender min -> capture
  const r = applyRiskAction({ state: s, actorId: 7, rng,
    action: { type: 'attack', payload: { from: 'N1', to: 'N2', force: 10 } } });
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
  // complete 13-territory board (a sparse fixture would NPE in neighborsOf).
  const fullBoard = () => ({
    currentPlayer: 0,
    territories: {
      N1: { owner: 0, armies: 6 }, N2: { owner: 0, armies: 2 }, N3: { owner: 1, armies: 2 },
      E1: { owner: 1, armies: 1 }, E2: { owner: 1, armies: 1 }, E3: { owner: 1, armies: 1 },
      E4: { owner: 1, armies: 1 }, S1: { owner: 1, armies: 1 }, S2: { owner: 1, armies: 1 },
      S3: { owner: 1, armies: 1 }, W1: { owner: 1, armies: 1 }, W2: { owner: 1, armies: 1 },
      W3: { owner: 1, armies: 1 },
    },
    reinforcePool: 3, setupPools: [5, 5], fortifyUsed: false,
  });
  for (const phase of ['setup', 'reinforce', 'attack', 'fortify']) {
    const moves = enumerateLegalMoves({ ...fullBoard(), phase }, 0);
    assert.ok(!moves.some(m => m.action?.type === 'resign'),
      `phase ${phase}: AI must not be able to resign itself`);
  }
});
