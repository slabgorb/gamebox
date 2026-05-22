import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computePersonaMetrics } from '../scripts/risk-style-diag.mjs';

// E2-9 AC-5: the GO/NO-GO diagnostic must stay meaningful under the cards
// regime. A card is earned by capturing >=1 territory per turn, so every
// persona is pushed to attack at least once — which inflates the legacy
// "attack-when-available" rate toward 100% for all personas and washes out
// style. Persona voice now lives in the *post-card-secured* decision: once the
// card is locked in for the turn, does the persona keep pressing or bank it?
//
// These tests drive a card-robust metric, `postCardSecuredAggression`, computed
// over attack turns flagged `cardSecuredThisTurn` (the harness records this when
// the active player has already captured a territory this turn). The legacy
// attack-when-available metric is retained for continuity.

const goodAttackShortlist = [
  { id: 'attack:alaska->nwt', score: 4 },
  { id: 'end-attack', score: -0.5 },
];

// One attack-phase transcript turn with a good attack available.
function attackTurn(side, { chosen, cardSecured }) {
  return {
    side,
    phase: 'attack',
    shortlist: goodAttackShortlist,
    chosenMoveId: chosen,
    action: { type: chosen.split(':')[0], payload: chosen.startsWith('attack')
      ? { from: 'alaska', force: 5 } : {} },
    stateBefore: { territories: { alaska: { armies: 6 } } },
    cardSecuredThisTurn: cardSecured,
  };
}

// "banker": attacks to secure the card, then stops once it's locked in.
const bankerGame = {
  personaA: 'banker', personaB: 'presser',
  transcript: [
    attackTurn('a', { chosen: 'attack:alaska->nwt', cardSecured: false }),
    attackTurn('a', { chosen: 'end-attack', cardSecured: true }),
    // presser keeps attacking even after the card is secured.
    attackTurn('b', { chosen: 'attack:alaska->nwt', cardSecured: false }),
    attackTurn('b', { chosen: 'attack:alaska->nwt', cardSecured: true }),
  ],
};

test('computePersonaMetrics still reports legacy attack-when-available', () => {
  const m = computePersonaMetrics([bankerGame]);
  // banker: 2 attack turns w/ good attack, attacked on 1 -> 1/2.
  assert.deepEqual(m.banker.attackWhenAvailable, { attacked: 1, total: 2 });
  // presser: attacked on both -> 2/2.
  assert.deepEqual(m.presser.attackWhenAvailable, { attacked: 2, total: 2 });
});

test('AC-5: a card-robust post-card-secured aggression metric is computed', () => {
  const m = computePersonaMetrics([bankerGame]);
  assert.ok(m.banker.postCardSecuredAggression,
    'persona metrics must expose postCardSecuredAggression');
  // banker had one post-card-secured attack opportunity and declined it.
  assert.deepEqual(m.banker.postCardSecuredAggression, { attacked: 0, total: 1 });
  // presser took its one post-card-secured opportunity.
  assert.deepEqual(m.presser.postCardSecuredAggression, { attacked: 1, total: 1 });
});

test('AC-5: post-card metric separates personas the legacy metric blurs', () => {
  // Both personas attack-when-available at the same 100% legacy rate, but only
  // one keeps pressing after the card is secured. The card-robust metric must
  // tell them apart where attack-when-available cannot.
  // Both attack on exactly one of two good-attack turns -> identical legacy
  // rate of 0.5. They differ only in WHICH turn: hawk presses post-card,
  // pragmatist presses pre-card and banks once the card is secured.
  const blurGame = {
    personaA: 'hawk', personaB: 'pragmatist',
    transcript: [
      attackTurn('a', { chosen: 'end-attack', cardSecured: false }),
      attackTurn('a', { chosen: 'attack:alaska->nwt', cardSecured: true }),
      attackTurn('b', { chosen: 'attack:alaska->nwt', cardSecured: false }),
      attackTurn('b', { chosen: 'end-attack', cardSecured: true }),
    ],
  };
  const m = computePersonaMetrics([blurGame]);
  const legacyRate = (p) => p.attackWhenAvailable.attacked / p.attackWhenAvailable.total;
  const postRate = (p) => p.postCardSecuredAggression.attacked / p.postCardSecuredAggression.total;
  assert.equal(legacyRate(m.hawk), legacyRate(m.pragmatist),
    'legacy attack-when-available cannot distinguish these personas');
  assert.notEqual(postRate(m.hawk), postRate(m.pragmatist),
    'post-card-secured aggression must distinguish them');
});
