import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';
import { allTerritories, neighborsOf } from '../plugins/risk/server/map.js';
import { shuffle } from '../src/shared/cards/deck.js';

const inf = (t) => ({ territory: t, type: 'infantry' });
const cav = (t) => ({ territory: t, type: 'cavalry' });
const art = (t) => ({ territory: t, type: 'artillery' });

// Mulberry32 — deterministic PRNG for reshuffle assertions.
function rngFrom(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Player 0 (userId 7) is the current player in the attack phase, owning `from`
// with 5 armies; the enemy owns everything else. `to` (a neighbor of `from`,
// 1 defender) is the lone capture target so the opponent is not eliminated.
function attackStateReadyToCapture({ deck = [], discard = [], hands = [[], []] } = {}) {
  const from = allTerritories().find((id) => neighborsOf(id).length > 0);
  const to = neighborsOf(from)[0];
  const territories = {};
  for (const id of allTerritories()) territories[id] = { owner: 1, armies: 1 };
  territories[from] = { owner: 0, armies: 5 };
  territories[to] = { owner: 1, armies: 1 };
  const state = {
    phase: 'attack', currentPlayer: 0, territories,
    reinforcePool: 0, setupPools: [0, 0], fortifyUsed: false,
    lastCombat: null, winner: null, log: [],
    sides: { a: 7, b: 8 }, activeUserId: 7,
    deck, discard, hands, tradeInCount: 0,
  };
  return { state, from, to };
}

function captureThenEndTurn(state, from, to, rng) {
  // Resolved capture: 1 defender => attacker rolls 3 dice, defender rolls 1.
  let r = applyRiskAction({
    state,
    action: { type: 'attack', payload: { from, to, resolved: { rounds: [{ aDice: [6, 6, 6], dDice: [1] }] } } },
    actorId: 7,
  });
  assert.equal(r.error, undefined, `capture rejected: ${r.error}`);
  assert.equal(r.state.territories[to].owner, 0, 'precondition: territory was captured');
  // end attack -> fortify -> end turn (rng drives the card draw's reshuffle)
  r = applyRiskAction({ state: r.state, action: { type: 'end-attack' }, actorId: 7 });
  assert.equal(r.error, undefined, `end-attack rejected: ${r.error}`);
  r = applyRiskAction({ state: r.state, action: { type: 'end-turn' }, actorId: 7, rng });
  assert.equal(r.error, undefined, `end-turn rejected: ${r.error}`);
  return r.state;
}

// AC2: a card is awarded at end of turn ONLY when the player captured >=1
// territory that turn.
test('capturing a territory awards exactly one card at end of turn', () => {
  const { state, from, to } = attackStateReadyToCapture({
    deck: [inf('egypt'), cav('japan'), inf('peru')],
  });
  const ended = captureThenEndTurn(state, from, to);
  assert.equal(ended.hands[0].length, 1, 'capturing player draws exactly one card');
  assert.equal(ended.hands[1].length, 0, 'the other player draws nothing');
  assert.equal(ended.deck.length, 2, 'the drawn card left the deck');
});

test('ending a turn with no capture awards no card', () => {
  const { state } = attackStateReadyToCapture({
    deck: [inf('egypt'), cav('japan')],
  });
  // No attack at all: end attack -> end turn.
  let r = applyRiskAction({ state, action: { type: 'end-attack' }, actorId: 7 });
  assert.equal(r.error, undefined, `end-attack rejected: ${r.error}`);
  r = applyRiskAction({ state: r.state, action: { type: 'end-turn' }, actorId: 7 });
  assert.equal(r.error, undefined, `end-turn rejected: ${r.error}`);
  assert.equal(r.state.hands[0].length, 0, 'no capture => no card');
  assert.equal(r.state.deck.length, 2, 'deck untouched when no card is awarded');
});

// AC8: when the draw deck is exhausted, the discard pile reshuffles into it.
test('an empty deck reshuffles the discard pile to satisfy an award', () => {
  const discard = [inf('egypt'), cav('japan')];
  const { state, from, to } = attackStateReadyToCapture({ deck: [], discard });
  const ended = captureThenEndTurn(state, from, to);
  assert.equal(ended.hands[0].length, 1, 'card was drawn even though the deck was empty');
  const drawn = ended.hands[0][0];
  const cameFromDiscard = discard.some(c => c.territory === drawn.territory && c.type === drawn.type);
  assert.ok(cameFromDiscard, 'the drawn card originated from the reshuffled discard pile');
  assert.equal(ended.deck.length, 1, 'two discards reshuffled into the deck, one was drawn');
});

// AC8: the reshuffle must actually shuffle (with the game rng), not just
// re-stack the discard in its existing order.
test('an exhausted deck is reshuffled with the game rng, not re-stacked', () => {
  const discard = [inf('egypt'), cav('japan'), inf('peru'), art('china')];
  // Reproduce the order the engine's seeded reshuffle should produce.
  const expected = shuffle(discard.map(c => ({ ...c })), rngFrom(99));
  const drawnExpected = expected[expected.length - 1]; // drawCard pops the top
  const remainingExpected = expected.slice(0, -1);

  const { state, from, to } = attackStateReadyToCapture({
    deck: [], discard: discard.map(c => ({ ...c })),
  });
  const ended = captureThenEndTurn(state, from, to, rngFrom(99));

  assert.equal(ended.hands[0].length, 1, 'a card was drawn after reshuffle');
  assert.deepEqual(ended.hands[0][0], drawnExpected, 'drew the top of the rng-shuffled deck');
  assert.deepEqual(ended.deck, remainingExpected, 'remaining deck is the rng-shuffled order');
});

// AC2 regression guard: capturedThisTurn must be reset at end of turn, so a
// later non-capturing turn awards no card.
test('capturedThisTurn resets — a later non-capturing turn awards no card', () => {
  const { state, from, to } = attackStateReadyToCapture({
    deck: [inf('egypt'), cav('japan'), inf('peru')],
  });
  const afterP0 = captureThenEndTurn(state, from, to);
  assert.equal(afterP0.hands[0].length, 1, 'player 0 drew on the capturing turn');
  assert.equal(afterP0.currentPlayer, 1, 'turn passed to player 1');

  // Player 1 ends a turn in which they captured nothing.
  afterP0.phase = 'fortify';
  const afterP1 = applyRiskAction({ state: afterP0, action: { type: 'end-turn' }, actorId: 8 });
  assert.equal(afterP1.error, undefined, `player 1 end-turn rejected: ${afterP1.error}`);
  assert.equal(afterP1.state.hands[1].length, 0, 'player 1 captured nothing, so draws no card');
  assert.equal(afterP1.state.hands[0].length, 1, "player 0's hand is unchanged");
});
