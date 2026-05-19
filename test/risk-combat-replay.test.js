// test/risk-combat-replay.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayAttack } from '../plugins/risk/server/combat.js';

test('replayAttack recomputes attrition from posted dice (capture)', () => {
  const rounds = [{ aDice: [6, 6, 6], dDice: [1, 1] }]; // 2 defender losses
  const out = replayAttack({ force: 4, defenders: 2, rounds });
  assert.equal(out.error, undefined);
  assert.equal(out.captured, true);
  assert.equal(out.defenderSurvivors, 0);
});

test('replayAttack rejects an illegal attacker dice count', () => {
  const rounds = [{ aDice: [6, 6, 6, 6], dDice: [1, 1] }]; // force 4 -> max 3 dice
  const out = replayAttack({ force: 4, defenders: 2, rounds });
  assert.match(out.error, /dice count/i);
});

test('replayAttack rejects out-of-range die faces', () => {
  const out = replayAttack({
    force: 3,
    defenders: 1,
    rounds: [{ aDice: [7, 6], dDice: [3] }],
  });
  assert.match(out.error, /die value/i);
});

test('replayAttack rejects rounds that should have stopped', () => {
  // df hits 0 after round 1; a second round is illegal.
  const rounds = [
    { aDice: [6, 6], dDice: [1] },
    { aDice: [6, 6], dDice: [1] },
  ];
  const out = replayAttack({ force: 3, defenders: 1, rounds });
  assert.match(out.error, /extra round|stopped/i);
});

test('replayAttack matches resolveAttack semantics on a defender hold', () => {
  const rounds = [{ aDice: [1, 1, 1], dDice: [6, 6] }]; // 2 attacker losses
  const out = replayAttack({ force: 4, defenders: 2, rounds });
  assert.equal(out.captured, false);
  assert.equal(out.attackerSurvivors, 2);
  assert.equal(out.defenderSurvivors, 2);
});

test('replayAttack rejects an empty rounds array when combat is possible', () => {
  const out = replayAttack({ force: 4, defenders: 2, rounds: [] });
  assert.match(out.error, /at least one round/i);
});
