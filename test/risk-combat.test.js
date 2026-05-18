import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollDice, combatRound, resolveAttack } from '../plugins/risk/server/combat.js';

function rngFrom(seq) { let i = 0; return () => seq[i++ % seq.length]; }

test('rollDice returns n dice sorted descending in 1..6', () => {
  // floor(rng*6)+1: 0.0->1, 0.5->4, 0.99->6
  const d = rollDice(3, rngFrom([0.0, 0.99, 0.5]));
  assert.equal(d.length, 3);
  assert.deepEqual(d, [6, 4, 1]);
});

test('combatRound: attacker wins highs, ties go to defender', () => {
  // attacker rolls 2 dice (force 3 -> min(3,2)=2), defender 1 (defenders 1)
  // attacker: 0.99->6, 0.5->4  => [6,4]; defender: 0.99->6 => [6]
  // pair0: 6 vs 6 tie -> attacker loses 1
  const r = combatRound({ attackForce: 3, defenders: 1 }, rngFrom([0.99, 0.5, 0.99]));
  assert.deepEqual(r.aDice, [6, 4]);
  assert.deepEqual(r.dDice, [6]);
  assert.equal(r.aLoss, 1);
  assert.equal(r.dLoss, 0);
});

test('resolveAttack: attacker steamrolls -> captured', () => {
  // Force 5 vs 1 defender, attacker always rolls 6s, defender always 1s.
  const r = resolveAttack({ force: 5, defenders: 1 }, rngFrom([0.99, 0.0]));
  assert.equal(r.captured, true);
  assert.equal(r.defenderSurvivors, 0);
  assert.ok(r.attackerSurvivors >= 1 && r.attackerSurvivors <= 5);
  assert.ok(r.rounds.length >= 1);
});

test('resolveAttack: attacker stalls at 1 -> repulsed', () => {
  // Force 2 (so only 1 attack die) vs 3 defenders, attacker always 1, defender always 6.
  const r = resolveAttack({ force: 2, defenders: 3 }, rngFrom([0.0, 0.99]));
  assert.equal(r.captured, false);
  assert.equal(r.attackerSurvivors, 1);
  assert.ok(r.defenderSurvivors >= 1);
});

test('resolveAttack is deterministic for a fixed rng sequence', () => {
  const a = resolveAttack({ force: 4, defenders: 3 }, rngFrom([0.7, 0.2, 0.9, 0.1, 0.5]));
  const b = resolveAttack({ force: 4, defenders: 3 }, rngFrom([0.7, 0.2, 0.9, 0.1, 0.5]));
  assert.deepEqual(a, b);
});
