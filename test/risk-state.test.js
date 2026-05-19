import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialState, playerIndex, userIdOf, SETUP_ARMIES } from '../plugins/risk/server/state.js';

function rngFrom(seq) { let i = 0; return () => seq[i++ % seq.length]; }

test('builds setup state with even-ish split and 1 army each', () => {
  const s = buildInitialState({
    participants: [{ userId: 11, side: 'a' }, { userId: 22, side: 'b' }],
    rng: rngFrom([0.1, 0.4, 0.7, 0.2, 0.9, 0.5, 0.3, 0.6, 0.8, 0.0, 0.15, 0.45]),
  });
  assert.equal(s.phase, 'setup');
  assert.equal(s.currentPlayer, 0);
  assert.equal(Object.keys(s.territories).length, 42);
  const owned0 = Object.values(s.territories).filter(t => t.owner === 0).length;
  const owned1 = Object.values(s.territories).filter(t => t.owner === 1).length;
  assert.equal(owned0 + owned1, 42);
  assert.ok(Math.abs(owned0 - owned1) <= 1, `uneven split ${owned0}/${owned1}`);
  assert.ok(Object.values(s.territories).every(t => t.armies === 1));
  assert.deepEqual(s.setupPools, [SETUP_ARMIES, SETUP_ARMIES]);
  assert.equal(s.activeUserId, 11);
  assert.equal(s.winner, null);
});

test('playerIndex / userIdOf map sides to indices', () => {
  const s = buildInitialState({
    participants: [{ userId: 11, side: 'a' }, { userId: 22, side: 'b' }],
    rng: rngFrom([0.5]),
  });
  assert.equal(playerIndex(s, 11), 0);
  assert.equal(playerIndex(s, 22), 1);
  assert.equal(playerIndex(s, 99), null);
  assert.equal(userIdOf(s, 0), 11);
  assert.equal(userIdOf(s, 1), 22);
});

test('same rng seed yields identical split (deterministic)', () => {
  const args = {
    participants: [{ userId: 1, side: 'a' }, { userId: 2, side: 'b' }],
    rng: rngFrom([0.3, 0.7, 0.1, 0.9, 0.5]),
  };
  const a = buildInitialState({ ...args, rng: rngFrom([0.3, 0.7, 0.1, 0.9, 0.5]) });
  const b = buildInitialState({ ...args, rng: rngFrom([0.3, 0.7, 0.1, 0.9, 0.5]) });
  assert.deepEqual(a.territories, b.territories);
});
