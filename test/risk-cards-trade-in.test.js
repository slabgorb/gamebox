import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';
import { allTerritories } from '../plugins/risk/server/map.js';

const inf = (t) => ({ territory: t, type: 'infantry' });
const cav = (t) => ({ territory: t, type: 'cavalry' });
const art = (t) => ({ territory: t, type: 'artillery' });
const wild = () => ({ territory: null, type: 'wild' });

const OWNED0 = ['alaska', 'nwt', 'brazil'];

// A reinforce-phase state where player 0 (userId 7) is active and holds `hand`.
// `hand` cards are referenced by index in a trade-in payload.
function reinforceWithHand(hand, { pool = 3, tradeInCount = 0, hand1 = [] } = {}) {
  const territories = {};
  for (const id of allTerritories()) territories[id] = { owner: 1, armies: 1 };
  for (const id of OWNED0) territories[id] = { owner: 0, armies: 1 };
  return {
    phase: 'reinforce', currentPlayer: 0, territories,
    reinforcePool: pool, setupPools: [0, 0], fortifyUsed: false,
    lastCombat: null, winner: null, log: [],
    sides: { a: 7, b: 8 }, activeUserId: 7,
    deck: [], discard: [], hands: [hand, hand1], tradeInCount,
  };
}

const tradeIn = (cardIndices) => ({ type: 'trade-in', payload: { cardIndices } });

// ---- AC3: set-shape validation -------------------------------------------

// Cards on territories the player does NOT own, so AC5's +2 never fires here.
test('accepts a three-of-a-kind set', () => {
  const s = reinforceWithHand([inf('egypt'), inf('japan'), inf('peru')]);
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
  assert.equal(r.error, undefined, `three-of-a-kind should be valid: ${r.error}`);
});

test('accepts a three-distinct set', () => {
  const s = reinforceWithHand([inf('egypt'), cav('japan'), art('peru')]);
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
  assert.equal(r.error, undefined, `three-distinct should be valid: ${r.error}`);
});

test('accepts any two cards plus a wild', () => {
  const s = reinforceWithHand([inf('egypt'), cav('japan'), wild()]);
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
  assert.equal(r.error, undefined, `two + wild should be valid: ${r.error}`);
});

test('accepts a set with two wilds and one other card', () => {
  const s = reinforceWithHand([wild(), wild(), inf('egypt')]);
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
  assert.equal(r.error, undefined, `two wilds + one card should be valid: ${r.error}`);
});

test('rejects two-same-one-different with no wild', () => {
  const s = reinforceWithHand([inf('egypt'), inf('japan'), cav('peru')]);
  const before = JSON.stringify(s.hands);
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
  assert.match(r.error, /not a valid set/, 'two-same + one-different is not a valid set');
  assert.equal(JSON.stringify(s.hands), before, 'rejected trade must not mutate the hand');
});

test('rejects a set of the wrong size', () => {
  const s = reinforceWithHand([inf('egypt'), inf('japan')]);
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1]), actorId: 7 });
  assert.match(r.error, /exactly three cards/, 'a trade-in must be exactly three cards');
});

test('rejects card indices not in the hand', () => {
  const s = reinforceWithHand([inf('egypt'), cav('japan'), art('peru')]);
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 9]), actorId: 7 });
  assert.match(r.error, /not in hand/, 'out-of-range card index must be rejected');
});

test('rejects a trade-in from the player whose turn it is not', () => {
  const s = reinforceWithHand([inf('egypt'), cav('japan'), art('peru')]);
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 8 });
  assert.match(r.error, /not your turn/);
});

test('rejects a trade-in outside the reinforce phase', () => {
  const s = reinforceWithHand([inf('egypt'), cav('japan'), art('peru')]);
  s.phase = 'attack';
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
  assert.match(r.error, /not allowed in phase/, 'trade-in is only legal during reinforcement');
});

// ---- AC4 + AC8: escalating bonus, added to the reinforce pool --------------

test('successive trade-ins yield the escalating bonus 4,6,8,10,12,15', () => {
  const sequence = [4, 6, 8, 10, 12, 15];
  for (let priorTrades = 0; priorTrades < sequence.length; priorTrades++) {
    const s = reinforceWithHand(
      [inf('egypt'), cav('japan'), art('peru')],
      { pool: 3, tradeInCount: priorTrades },
    );
    const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
    assert.equal(r.error, undefined, `trade ${priorTrades + 1} rejected: ${r.error}`);
    assert.equal(
      r.state.reinforcePool, 3 + sequence[priorTrades],
      `trade #${priorTrades + 1} should add ${sequence[priorTrades]} armies to the pool`,
    );
    assert.equal(r.state.tradeInCount, priorTrades + 1, 'tradeInCount increments by one');
    assert.equal(r.state.hands[0].length, 0, 'the three traded cards leave the hand');
  }
});

test('the seventh and eighth trades continue at +5 each (20, 25)', () => {
  for (const [priorTrades, expected] of [[6, 20], [7, 25]]) {
    const s = reinforceWithHand(
      [inf('egypt'), cav('japan'), art('peru')],
      { pool: 0, tradeInCount: priorTrades },
    );
    const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
    assert.equal(r.error, undefined, `trade ${priorTrades + 1} rejected: ${r.error}`);
    assert.equal(r.state.reinforcePool, expected,
      `trade #${priorTrades + 1} should grant ${expected} armies`);
  }
});

// ---- AC5: territory-match +2 ----------------------------------------------

test('a traded card matching an owned territory grants +2 on that territory', () => {
  // alaska is owned by player 0; egypt and japan are not. Distinct types => valid set.
  const s = reinforceWithHand([inf('alaska'), cav('egypt'), art('japan')]);
  const startArmies = s.territories.alaska.armies;
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
  assert.equal(r.error, undefined, `trade rejected: ${r.error}`);
  assert.equal(r.state.territories.alaska.armies, startArmies + 2,
    'the matching owned territory receives +2 armies');
  assert.equal(r.state.reinforcePool, 3 + 4,
    'the +2 is in addition to the set bonus, which still lands in the pool');
});

test('no territory-match bonus when no traded card matches an owned territory', () => {
  const s = reinforceWithHand([inf('egypt'), cav('japan'), art('peru')]);
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
  assert.equal(r.error, undefined, `trade rejected: ${r.error}`);
  for (const id of OWNED0) {
    assert.equal(r.state.territories[id].armies, 1,
      `no +2 should land on ${id} when no card matches it`);
  }
});

// ---- E5-2 AC2: once per trade ---------------------------------------------

test('only one +2 is applied even when multiple traded cards match owned territories', () => {
  // alaska AND nwt are both owned by player 0 and both named by traded cards.
  // The rule breaks after the first match, so exactly one +2 lands in total.
  const s = reinforceWithHand([inf('alaska'), cav('nwt'), art('japan')]);
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
  assert.equal(r.error, undefined, `trade rejected: ${r.error}`);
  const matchedTotal = r.state.territories.alaska.armies + r.state.territories.nwt.armies;
  // Each owned territory starts at 1 (total 2). Exactly one +2 => total 4, never 6.
  assert.equal(matchedTotal, 4,
    'exactly one +2 lands across all owned territories named by the set');
});

// ---- E5-2 AC3: wild cards never trigger a bonus ---------------------------

test('a wild card (null territory) never triggers a territory bonus', () => {
  // Two wilds + a card on an UNOWNED territory: nothing names an owned territory.
  const s = reinforceWithHand([wild(), wild(), inf('egypt')]);
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
  assert.equal(r.error, undefined, `trade rejected: ${r.error}`);
  for (const id of OWNED0) {
    assert.equal(r.state.territories[id].armies, 1,
      `no +2 should land on ${id} via a wild card`);
  }
});

test('with a wild in the set, only the real owned-territory card grants the +2', () => {
  // alaska is owned by player 0; the wild contributes no territory match.
  const s = reinforceWithHand([inf('alaska'), cav('egypt'), wild()]);
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
  assert.equal(r.error, undefined, `trade rejected: ${r.error}`);
  assert.equal(r.state.territories.alaska.armies, 3,
    'the real owned-territory card grants +2; the wild grants nothing');
});

// ---- E5-2 AC4: the bonus is recorded in the trade-in log entry -------------

test('the trade-in log entry records the territory bonus when one fires', () => {
  const s = reinforceWithHand([inf('alaska'), cav('egypt'), art('japan')]);
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
  assert.equal(r.error, undefined, `trade rejected: ${r.error}`);
  const entry = r.state.log.find(e => e.kind === 'trade-in');
  assert.ok(entry, 'a trade-in log entry is recorded');
  assert.equal(entry.bonusTerritory, 'alaska',
    'the log entry names the territory that received the +2');
  assert.equal(entry.bonusArmies, 2,
    'the log entry records the +2 amount so E5-6 can itemize it');
});

test('the trade-in log entry omits the bonus fields when no territory matched', () => {
  const s = reinforceWithHand([inf('egypt'), cav('japan'), art('peru')]);
  const r = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
  assert.equal(r.error, undefined, `trade rejected: ${r.error}`);
  const entry = r.state.log.find(e => e.kind === 'trade-in');
  assert.ok(entry, 'a trade-in log entry is recorded');
  assert.equal(entry.bonusTerritory ?? null, null,
    'no bonusTerritory is recorded when nothing matched');
  assert.equal(entry.bonusArmies ?? null, null,
    'no bonusArmies is recorded when nothing matched');
});

// ---- AC6: forced trade-in at >=5 cards -------------------------------------

test('a player holding five cards must trade before deploying', () => {
  const s = reinforceWithHand(
    [inf('egypt'), inf('japan'), inf('peru'), cav('china'), art('india')],
    { pool: 3 },
  );
  const r = applyRiskAction({
    state: s,
    action: { type: 'deploy', payload: { placements: { alaska: 3 } } },
    actorId: 7,
  });
  assert.match(r.error, /trade/i, 'deploy is blocked while holding >=5 cards');
});

test('after trading below five cards, deploy is allowed', () => {
  const s = reinforceWithHand(
    [inf('egypt'), inf('japan'), inf('peru'), cav('china'), art('india')],
    { pool: 3 },
  );
  const traded = applyRiskAction({ state: s, action: tradeIn([0, 1, 2]), actorId: 7 });
  assert.equal(traded.error, undefined, `forced trade rejected: ${traded.error}`);
  assert.equal(traded.state.hands[0].length, 2, 'hand drops from 5 to 2 after trading 3');

  const pool = traded.state.reinforcePool;
  const deployed = applyRiskAction({
    state: traded.state,
    action: { type: 'deploy', payload: { placements: { alaska: pool } } },
    actorId: 7,
  });
  assert.equal(deployed.error, undefined, `deploy after trade rejected: ${deployed.error}`);
  assert.equal(deployed.state.phase, 'attack', 'deploy advances to the attack phase');
});
