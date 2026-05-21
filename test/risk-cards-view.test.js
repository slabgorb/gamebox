import { test } from 'node:test';
import assert from 'node:assert/strict';
import { riskPublicView } from '../plugins/risk/server/view.js';

const inf = (t) => ({ territory: t, type: 'infantry' });
const cav = (t) => ({ territory: t, type: 'cavalry' });
const art = (t) => ({ territory: t, type: 'artillery' });
const wild = () => ({ territory: null, type: 'wild' });

function stateWithHands() {
  return {
    sides: { a: 7, b: 8 },
    phase: 'reinforce',
    territories: { alaska: { owner: 0, armies: 3 } },
    hands: [
      [inf('alaska'), wild()],
      [cav('egypt'), art('japan'), inf('peru')],
    ],
  };
}

// AC7: a viewer sees their own hand in full, but only the COUNT of the
// opponent's hand — never the opponent's card identities.
test('a player sees their own hand in full', () => {
  const v = riskPublicView({ state: stateWithHands(), viewerId: 7 });
  assert.deepEqual(v.hand, [inf('alaska'), wild()], 'player 0 sees their own two cards');
});

test('a player sees only the opponent card count, not identities', () => {
  const v = riskPublicView({ state: stateWithHands(), viewerId: 7 });
  assert.equal(v.opponentCardCount, 3, 'player 0 sees the opponent holds three cards');
  assert.equal(v.hands, undefined,
    'the raw per-player hands array must not leak through the view');
});

test('the deck and discard piles never appear in the view', () => {
  const state = stateWithHands();
  state.deck = [inf('china'), inf('india')];
  state.discard = [cav('siam')];
  const v = riskPublicView({ state, viewerId: 7 });
  assert.equal(v.deck, undefined, 'deck order must not leak to a client');
  assert.equal(v.discard, undefined, 'discard pile must not leak to a client');
});

test('the opposite player gets the mirror-image redaction', () => {
  const v = riskPublicView({ state: stateWithHands(), viewerId: 8 });
  assert.deepEqual(v.hand, [cav('egypt'), art('japan'), inf('peru')],
    'player 1 sees their own three cards');
  assert.equal(v.opponentCardCount, 2, 'player 1 sees the opponent holds two cards');
  assert.equal(v.hands, undefined, 'no raw hands array leaks');
});

test('a non-participant viewer learns no card identities', () => {
  const v = riskPublicView({ state: stateWithHands(), viewerId: 99 });
  assert.equal(v.youAre, null, 'a spectator has no side');
  assert.equal(v.hands, undefined, 'spectators never receive raw hands');
  assert.ok(v.hand === undefined || v.hand.length === 0,
    'a spectator holds no revealed cards');
});

test('nextTradeBonus reflects the escalating bonus for the next trade, counter stays private', () => {
  const fresh = riskPublicView({ state: stateWithHands(), viewerId: 7 });
  assert.equal(fresh.nextTradeBonus, 4, 'first trade-in (count 0) grants 4 armies');
  assert.equal(fresh.tradeInCount, undefined, 'the raw trade counter must not leak');

  const mid = stateWithHands();
  mid.tradeInCount = 2;
  const v = riskPublicView({ state: mid, viewerId: 7 });
  assert.equal(v.nextTradeBonus, 8, 'third trade-in (count 2) grants 8 armies');
  assert.equal(v.tradeInCount, undefined, 'counter still redacted');
});

// The board itself stays fully public — redaction is scoped to hands only.
test('redaction does not disturb the public board view', () => {
  const state = stateWithHands();
  const v = riskPublicView({ state, viewerId: 7 });
  assert.deepEqual(v.territories, state.territories, 'territories remain fully visible');
  assert.equal(v.youAre, 0);
});
