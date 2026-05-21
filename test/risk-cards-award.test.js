import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';
import { allTerritories, neighborsOf } from '../plugins/risk/server/map.js';

const inf = (t) => ({ territory: t, type: 'infantry' });
const cav = (t) => ({ territory: t, type: 'cavalry' });

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

function captureThenEndTurn(state, from, to) {
  // Resolved capture: 1 defender => attacker rolls 3 dice, defender rolls 1.
  let r = applyRiskAction({
    state,
    action: { type: 'attack', payload: { from, to, resolved: { rounds: [{ aDice: [6, 6, 6], dDice: [1] }] } } },
    actorId: 7,
  });
  assert.equal(r.error, undefined, `capture rejected: ${r.error}`);
  assert.equal(r.state.territories[to].owner, 0, 'precondition: territory was captured');
  // end attack -> fortify -> end turn
  r = applyRiskAction({ state: r.state, action: { type: 'end-attack' }, actorId: 7 });
  assert.equal(r.error, undefined, `end-attack rejected: ${r.error}`);
  r = applyRiskAction({ state: r.state, action: { type: 'end-turn' }, actorId: 7 });
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
