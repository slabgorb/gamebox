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

// The board itself stays fully public — redaction is scoped to hands only.
test('redaction does not disturb the public board view', () => {
  const state = stateWithHands();
  const v = riskPublicView({ state, viewerId: 7 });
  assert.deepEqual(v.territories, state.territories, 'territories remain fully visible');
  assert.equal(v.youAre, 0);
});
