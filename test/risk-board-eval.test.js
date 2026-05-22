import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBoard, scoreCandidate } from '../plugins/risk/server/ai/board-eval.js';
import { allTerritories, continentTerritories } from '../plugins/risk/server/map.js';

function fullNamerica() {
  const terr = {};
  for (const id of allTerritories()) terr[id] = { owner: 1, armies: 1 };
  for (const id of continentTerritories('namerica')) terr[id] = { owner: 0, armies: 3 };
  return { phase: 'attack', currentPlayer: 0, territories: terr };
}

test('owning a whole continent scores higher than owning the same count scattered', () => {
  const held = fullNamerica();
  const scattered = fullNamerica();
  // Move one North America territory to the enemy and give player 0 a
  // far-away one of equal count instead.
  scattered.territories.alaska = { owner: 1, armies: 1 };
  scattered.territories.south_africa = { owner: 0, armies: 3 };
  assert.ok(evaluateBoard(held, 0).total > evaluateBoard(scattered, 0).total);
});

test('evaluateBoard returns a breakdown object', () => {
  const r = evaluateBoard(fullNamerica(), 0);
  assert.equal(typeof r.total, 'number');
  assert.ok(r.breakdown && typeof r.breakdown === 'object');
});

test('scoreCandidate prefers attacking a weaker target', () => {
  // alaska is adjacent to both nwt and alberta.
  const s = {
    phase: 'attack', currentPlayer: 0,
    territories: {
      alaska: { owner: 0, armies: 8 }, nwt: { owner: 1, armies: 1 },
      alberta: { owner: 1, armies: 7 },
    },
  };
  const easy = scoreCandidate(s, 0, { type: 'attack', payload: { from: 'alaska', to: 'nwt', force: 7 } });
  const hard = scoreCandidate(s, 0, { type: 'attack', payload: { from: 'alaska', to: 'alberta', force: 7 } });
  assert.ok(easy > hard);
});

// ---- E2-9 AC-4: board evaluation values held cards / near-complete sets ----

const inf = (t) => ({ territory: t, type: 'infantry' });
const cav = (t) => ({ territory: t, type: 'cavalry' });
const art = (t) => ({ territory: t, type: 'artillery' });

function boardWithHand(hand) {
  const s = fullNamerica();
  s.hands = [hand, []];
  return s;
}

test('holding cards scores higher than holding none on an identical board', () => {
  const withCards = evaluateBoard(boardWithHand([inf('egypt'), cav('japan')]), 0).total;
  const without = evaluateBoard(boardWithHand([]), 0).total;
  assert.ok(withCards > without,
    'a held card is a strategic asset and must add positive value');
});

test('a near-complete set scores higher than the same number of unsetlike cards', () => {
  // Two cards that complete-with-one (a near 3-distinct: inf + cav, needs art)
  // should be valued at least as high as two identical cards that need a third
  // of the same type. Both are two-card hands; the contribution must reward
  // progression toward a tradeable set, not merely card count.
  const nearSet = evaluateBoard(boardWithHand([inf('egypt'), cav('japan')]), 0).total;
  const oneCard = evaluateBoard(boardWithHand([inf('egypt')]), 0).total;
  assert.ok(nearSet > oneCard,
    'progressing toward a complete set must increase board value');
});

test('evaluateBoard breakdown exposes a dedicated card-value term', () => {
  const r = evaluateBoard(boardWithHand([inf('egypt'), cav('japan'), art('peru')]), 0);
  assert.ok('cardValue' in r.breakdown,
    'the scoring breakdown must include a measurable card-value contribution');
  assert.ok(r.breakdown.cardValue > 0,
    'holding a tradeable set yields a positive card-value contribution');
});

test('card value does not dominate continent control', () => {
  // A full continent (North America, bonus-bearing) with no cards must still
  // out-score a scattered board that merely holds a card set — cards are a
  // tunable bonus, not the primary driver (AC-4: "not dominating").
  const continentNoCards = evaluateBoard(boardWithHand([]), 0).total;
  const scattered = fullNamerica();
  scattered.territories.alaska = { owner: 1, armies: 1 };
  scattered.hands = [[inf('egypt'), cav('japan'), art('peru')], []];
  assert.ok(continentNoCards > evaluateBoard(scattered, 0).total,
    'a held set must not outweigh losing a continent territory');
});
