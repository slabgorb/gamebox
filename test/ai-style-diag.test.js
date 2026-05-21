import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePersonaMetrics,
  evaluateGoNoGo,
} from '../scripts/risk-style-diag.mjs';

function turn({ side, phase, chosenMoveId, shortlist, action }) {
  return { turn: 0, side, phase, chosenMoveId, shortlist,
    stateBefore: {}, action: action ?? { type: chosenMoveId.split(':')[0] } };
}

function game({ personaA, personaB, turns }) {
  return { personaA, personaB, turnCount: turns.length, transcript: turns };
}

test('computePersonaMetrics: counts turns per persona', () => {
  const games = [
    game({
      personaA: 'admiral-vonnegut', personaB: 'major-robert',
      turns: [
        turn({ side: 'a', phase: 'attack', chosenMoveId: 'end-attack', shortlist: [] }),
        turn({ side: 'b', phase: 'attack', chosenMoveId: 'attack:alaska->alberta', shortlist: [],
          action: { type: 'attack', payload: { from: 'alaska', to: 'alberta', force: 5 } } }),
      ],
    }),
  ];
  const m = computePersonaMetrics(games);
  assert.equal(m['admiral-vonnegut'].turns, 1);
  assert.equal(m['major-robert'].turns, 1);
});

test('computePersonaMetrics: attack-when-available counts only attack-phase turns with positive-score attacks', () => {
  const positiveAttackShortlist = [
    { id: 'attack:alaska->alberta', summary: 's', score: 2.0 },
    { id: 'end-attack', summary: 's', score: -0.5 },
  ];
  const noGoodAttackShortlist = [
    { id: 'attack:alaska->alberta', summary: 's', score: -2.0 },
    { id: 'end-attack', summary: 's', score: -0.5 },
  ];
  const games = [
    game({
      personaA: 'major-robert', personaB: 'admiral-vonnegut',
      turns: [
        turn({ side: 'a', phase: 'attack', chosenMoveId: 'attack:alaska->alberta',
          shortlist: positiveAttackShortlist,
          action: { type: 'attack', payload: { from: 'alaska', to: 'alberta', force: 5 } } }),
        turn({ side: 'a', phase: 'attack', chosenMoveId: 'end-attack',
          shortlist: positiveAttackShortlist }),
        turn({ side: 'a', phase: 'attack', chosenMoveId: 'end-attack',
          shortlist: noGoodAttackShortlist }),
        turn({ side: 'a', phase: 'reinforce', chosenMoveId: 'deploy:0',
          shortlist: [{ id: 'deploy:0', summary: 's', score: 5 }],
          action: { type: 'deploy', payload: { placements: { alaska: 3 } } } }),
      ],
    }),
  ];
  const m = computePersonaMetrics(games);
  assert.equal(m['major-robert'].attackWhenAvailable.attacked, 1);
  assert.equal(m['major-robert'].attackWhenAvailable.total, 2);
});

test('computePersonaMetrics: move-type mix sums to ~1.0 per persona', () => {
  const games = [
    game({
      personaA: 'admiral-vonnegut', personaB: 'admiral-vonnegut',
      turns: [
        turn({ side: 'a', phase: 'attack', chosenMoveId: 'attack:a->b', shortlist: [],
          action: { type: 'attack', payload: { from: 'a', to: 'b', force: 1 } } }),
        turn({ side: 'a', phase: 'reinforce', chosenMoveId: 'deploy:0', shortlist: [],
          action: { type: 'deploy', payload: { placements: {} } } }),
        turn({ side: 'a', phase: 'fortify', chosenMoveId: 'end-turn', shortlist: [],
          action: { type: 'end-turn' } }),
      ],
    }),
  ];
  const m = computePersonaMetrics(games);
  const mix = m['admiral-vonnegut'].moveTypeMix;
  const total = Object.values(mix).reduce((s, v) => s + v, 0);
  assert.ok(Math.abs(total - 1.0) < 1e-9, `expected sum=1, got ${total}`);
});

test('evaluateGoNoGo: GO when all 3 pairs significant and spread >= 15pp', () => {
  const metrics = {
    'admiral-vonnegut': { attackWhenAvailable: { attacked: 50, total: 100 } },
    'colonel-jaune':    { attackWhenAvailable: { attacked: 70, total: 100 } },
    'major-robert':     { attackWhenAvailable: { attacked: 90, total: 100 } },
  };
  const r = evaluateGoNoGo(metrics, ['admiral-vonnegut', 'colonel-jaune', 'major-robert']);
  assert.equal(r.recommendation, 'GO');
  assert.equal(r.spreadPp, 40);
  assert.equal(r.pairwise.length, 3);
  for (const p of r.pairwise) assert.ok(p.pValue < 0.01);
});

test('evaluateGoNoGo: NO-GO when spread < 15pp even if all 3 pairs significant', () => {
  const metrics = {
    'admiral-vonnegut': { attackWhenAvailable: { attacked: 5000, total: 10000 } },
    'colonel-jaune':    { attackWhenAvailable: { attacked: 5500, total: 10000 } },
    'major-robert':     { attackWhenAvailable: { attacked: 6000, total: 10000 } },
  };
  const r = evaluateGoNoGo(metrics, ['admiral-vonnegut', 'colonel-jaune', 'major-robert']);
  assert.equal(r.recommendation, 'NO-GO');
  assert.equal(r.spreadPp, 10);
  assert.match(r.reason, /spread/i);
});

test('evaluateGoNoGo: NO-GO when at least one pair is not significant', () => {
  const metrics = {
    'admiral-vonnegut': { attackWhenAvailable: { attacked: 50, total: 100 } },
    'colonel-jaune':    { attackWhenAvailable: { attacked: 53, total: 100 } },
    'major-robert':     { attackWhenAvailable: { attacked: 85, total: 100 } },
  };
  const r = evaluateGoNoGo(metrics, ['admiral-vonnegut', 'colonel-jaune', 'major-robert']);
  assert.equal(r.recommendation, 'NO-GO');
  assert.match(r.reason, /significant/i);
});
