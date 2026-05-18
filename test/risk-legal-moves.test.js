import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enumerateLegalMoves } from '../plugins/risk/server/ai/legal-moves.js';

// northern_reach (you, 6) is adjacent to atlantic_shore (enemy) -> an attack
// exists; northern_reach<->cordillera (both yours) -> a fortify exists.
function st(phase, extra = {}) {
  return {
    phase, currentPlayer: 0,
    territories: {
      northern_reach: { owner: 0, armies: 6 }, cordillera: { owner: 0, armies: 1 },
      atlantic_shore: { owner: 1, armies: 2 }, britannia: { owner: 1, armies: 1 },
      europa: { owner: 1, armies: 1 }, persia: { owner: 1, armies: 1 },
      cathay: { owner: 1, armies: 1 }, north_africa: { owner: 1, armies: 1 },
      equatorial: { owner: 1, armies: 1 }, cape: { owner: 1, armies: 1 },
      amazonia: { owner: 1, armies: 1 }, patagonia: { owner: 1, armies: 1 },
      australia: { owner: 1, armies: 1 },
    },
    reinforcePool: 4, setupPools: [4, 4], fortifyUsed: false,
    sides: { a: 7, b: 8 }, ...extra,
  };
}

test('reinforce: candidate deploys all spend the pool and target owned territories', () => {
  const moves = enumerateLegalMoves(st('reinforce'), 0);
  assert.ok(moves.length >= 1);
  for (const m of moves) {
    assert.equal(m.action.type, 'deploy');
    const sum = Object.values(m.action.payload.placements).reduce((a, b) => a + b, 0);
    assert.equal(sum, 4);
    for (const id of Object.keys(m.action.payload.placements)) {
      assert.equal(st('reinforce').territories[id].owner, 0);
    }
    assert.ok(typeof m.id === 'string' && typeof m.summary === 'string');
  }
});

test('setup: candidates spend the setup pool', () => {
  const moves = enumerateLegalMoves(st('setup'), 0);
  assert.ok(moves.every(m => m.action.type === 'setup-deploy'));
  assert.ok(moves.every(m =>
    Object.values(m.action.payload.placements).reduce((a, b) => a + b, 0) === 4));
});

test('attack: every legal (from,to) plus end-attack', () => {
  const moves = enumerateLegalMoves(st('attack'), 0);
  const attacks = moves.filter(m => m.action.type === 'attack');
  assert.ok(attacks.length >= 1);
  for (const m of attacks) {
    const { from, to, force } = m.action.payload;
    assert.equal(st('attack').territories[from].owner, 0);
    assert.equal(st('attack').territories[to].owner, 1);
    assert.ok(force >= 1 && force < st('attack').territories[from].armies);
  }
  assert.ok(moves.some(m => m.action.type === 'end-attack'));
});

test('fortify: candidate moves plus end-turn', () => {
  const moves = enumerateLegalMoves(st('fortify'), 0);
  assert.ok(moves.some(m => m.action.type === 'end-turn'));
  for (const m of moves.filter(x => x.action.type === 'fortify')) {
    const { from, to, count } = m.action.payload;
    assert.equal(st('fortify').territories[from].owner, 0);
    assert.equal(st('fortify').territories[to].owner, 0);
    assert.ok(count >= 1 && count < st('fortify').territories[from].armies);
  }
});

test('gameover yields no moves', () => {
  assert.deepEqual(enumerateLegalMoves(st('gameover'), 0), []);
});
