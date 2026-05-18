// Leaving a Risk game = resign = forfeit (opponent wins), and a finished
// game must signal `ended` so the host registry marks status='ended'.
// Covers the resign action and the previously-silent natural-win path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';
import { enumerateLegalMoves } from '../plugins/risk/server/ai/legal-moves.js';

// northern_reach is adjacent to cordillera.
function midGame(overrides = {}) {
  return {
    phase: 'attack', currentPlayer: 0,
    territories: {
      northern_reach: { owner: 0, armies: 5 }, cordillera: { owner: 1, armies: 3 },
      atlantic_shore: { owner: 1, armies: 1 }, britannia: { owner: 0, armies: 1 },
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
  // Player 0 holds northern_reach with overwhelming force; player 1 owns only
  // cordillera (1 army). Steamroll it and player 1 has zero territories.
  const s = midGame({
    territories: {
      northern_reach: { owner: 0, armies: 20 }, cordillera: { owner: 1, armies: 1 },
    },
  });
  let rc = 0;
  const rng = () => (rc++ < 3 ? 0.99 : 0.0); // attacker max, defender min -> capture
  const r = applyRiskAction({ state: s, actorId: 7, rng,
    action: { type: 'attack', payload: { from: 'northern_reach', to: 'cordillera', force: 10 } } });
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
      northern_reach: { owner: 0, armies: 6 }, cordillera: { owner: 0, armies: 2 },
      atlantic_shore: { owner: 1, armies: 2 }, britannia: { owner: 1, armies: 1 },
      europa: { owner: 1, armies: 1 }, persia: { owner: 1, armies: 1 },
      cathay: { owner: 1, armies: 1 }, north_africa: { owner: 1, armies: 1 },
      equatorial: { owner: 1, armies: 1 }, cape: { owner: 1, armies: 1 },
      amazonia: { owner: 1, armies: 1 }, patagonia: { owner: 1, armies: 1 },
      australia: { owner: 1, armies: 1 },
    },
    reinforcePool: 3, setupPools: [5, 5], fortifyUsed: false,
  });
  for (const phase of ['setup', 'reinforce', 'attack', 'fortify']) {
    const moves = enumerateLegalMoves({ ...fullBoard(), phase }, 0);
    assert.ok(!moves.some(m => m.action?.type === 'resign'),
      `phase ${phase}: AI must not be able to resign itself`);
  }
});
