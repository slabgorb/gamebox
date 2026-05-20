import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';

// alaska is adjacent to nwt, alberta, and kamchatka (Bering strait).
function attackState() {
  return {
    phase: 'attack', currentPlayer: 0,
    territories: {
      alaska: { owner: 0, armies: 10 }, nwt: { owner: 1, armies: 1 },
      alberta: { owner: 1, armies: 1 }, kamchatka: { owner: 0, armies: 1 },
    },
    reinforcePool: 0, setupPools: [0, 0], fortifyUsed: false,
    lastCombat: null, winner: null, log: [], sides: { a: 7, b: 8 }, activeUserId: 7,
  };
}

// CROSS-BUG-3: the server no longer drives dice. A no-resolved attack stores
// pendingCombat; the equivalent "rolled outcome" tests now live in
// risk-actions-attack-resolved.test.js (capture/repulse/last-territory-win
// via resolved-payload rounds) and risk-actions-pending-combat.test.js
// (bot-intent storage + rng-spy). The tests below cover only the bits that
// don't go through dice — end-attack and validation rejection.

test('end-attack advances to fortify', () => {
  const s = attackState();
  const r = applyRiskAction({ state: s, actorId: 7, action: { type: 'end-attack' } });
  assert.equal(r.state.phase, 'fortify');
});

test('illegal attack (target owned by self) is rejected before pendingCombat is set', () => {
  const s = attackState();
  const r = applyRiskAction({
    state: s, actorId: 7,
    action: { type: 'attack', payload: { from: 'alaska', to: 'kamchatka', force: 2 } },
  });
  assert.match(r.error, /not an enemy/);
  assert.equal(r.state, undefined, 'no state returned on rejection');
});
