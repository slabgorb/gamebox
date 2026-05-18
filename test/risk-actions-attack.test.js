import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';

// northern_reach is adjacent to cordillera, atlantic_shore and britannia.
function attackState() {
  return {
    phase: 'attack', currentPlayer: 0,
    territories: {
      northern_reach: { owner: 0, armies: 10 }, cordillera: { owner: 1, armies: 1 },
      atlantic_shore: { owner: 1, armies: 1 }, britannia: { owner: 0, armies: 1 },
    },
    reinforcePool: 0, setupPools: [0, 0], fortifyUsed: false,
    lastCombat: null, winner: null, log: [], sides: { a: 7, b: 8 }, activeUserId: 7,
  };
}

test('attack captures when steamrolling; survivors occupy, source loses the committed force', () => {
  const s = attackState();
  let rc = 0; const rng = () => (rc++ < 3 ? 0.99 : 0.0); // attacker rolls 6s, lone defender rolls 1 — steamroll
  const r = applyRiskAction({
    state: s, actorId: 7, rng,
    action: { type: 'attack', payload: { from: 'northern_reach', to: 'cordillera', force: 5 } },
  });
  assert.equal(r.error, undefined);
  assert.equal(r.state.territories.cordillera.owner, 0);
  assert.equal(r.state.territories.northern_reach.armies, 5); // 10 - 5 committed
  assert.equal(r.state.territories.cordillera.armies, 5); // all survivors occupy
  assert.equal(r.state.phase, 'attack'); // repeatable
  assert.ok(r.state.lastCombat.captured);
});

test('attack repulsed: 1 survivor retreats to source, ownership unchanged', () => {
  const s = attackState();
  s.territories.cordillera.armies = 4;
  // Force 2 -> 1 attack die; attacker always 1, defender always 6 -> attacker loses.
  let calls = 0;
  const rng = () => (calls++ % 2 === 0 ? 0.0 : 0.99);
  const r = applyRiskAction({
    state: s, actorId: 7, rng,
    action: { type: 'attack', payload: { from: 'northern_reach', to: 'cordillera', force: 2 } },
  });
  assert.equal(r.error, undefined);
  assert.equal(r.state.territories.cordillera.owner, 1);
  assert.equal(r.state.territories.northern_reach.armies, 9); // 10 - 2 committed + 1 retreated
  assert.equal(r.state.lastCombat.captured, false);
});

test('capturing the opponent\'s last territory wins the game', () => {
  const s = attackState();
  s.territories.atlantic_shore.owner = 0; // now player 1 only owns cordillera
  let rc = 0;
  const r = applyRiskAction({
    state: s, actorId: 7, rng: () => (rc++ < 3 ? 0.99 : 0.0),
    action: { type: 'attack', payload: { from: 'northern_reach', to: 'cordillera', force: 5 } },
  });
  assert.equal(r.state.phase, 'gameover');
  assert.equal(r.state.winner, 0);
  assert.equal(r.state.activeUserId, null);
});

test('end-attack advances to fortify', () => {
  const s = attackState();
  const r = applyRiskAction({ state: s, actorId: 7, action: { type: 'end-attack' } });
  assert.equal(r.state.phase, 'fortify');
});

test('illegal attack is rejected', () => {
  const s = attackState();
  const r = applyRiskAction({
    state: s, actorId: 7, rng: () => 0.5,
    action: { type: 'attack', payload: { from: 'northern_reach', to: 'britannia', force: 2 } },
  });
  assert.match(r.error, /not an enemy/);
});
