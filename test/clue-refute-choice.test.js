// E6-4 Task 2 — deterministic least-leak bot refute selection.
//
// Hard contract (AC #2): the chosen card is HELD by the refuter, is one of
// the three NAMED cards, and the choice is deterministic. The least-leak
// ranking is best-effort over information the refuter legitimately owns
// (plan finding F6: the public refute log omits the shown card by design,
// so no new state field may be invented here).
//
// NOTE: the shipped refute module lives at plugins/clue/server/refute.js —
// NOT rules/refute.js as the plan doc says (logged as a delivery finding).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chooseRefuteCard } from '../plugins/clue/server/refute.js';

function st(refuterHand, log = []) {
  return {
    seats: [7, 8, 9],
    hands: [[], [], [...refuterHand]],
    ledgers: [[], [], []],
    log,
    suggestion: {
      bySeat: 0, suspect: 'green', weapon: 'knife', room: 'hall',
      refuterSeat: 2, shownCard: null,
    },
  };
}

test('returns the only held card among the three named', () => {
  assert.equal(chooseRefuteCard(st(['green', 'library']), 2), 'green');
});

test('never returns a card the refuter does not hold or that is not named', () => {
  const holds = ['peacock', 'wrench', 'knife', 'library', 'study'];
  const card = chooseRefuteCard(st(holds), 2);
  assert.equal(card, 'knife'); // the single held-and-named card
});

test('deterministic: repeated calls on identical inputs return the same card', () => {
  const picks = new Set();
  for (let i = 0; i < 20; i++) {
    picks.add(chooseRefuteCard(st(['green', 'knife', 'hall']), 2));
  }
  assert.equal(picks.size, 1, 'multiple matches must not be chosen randomly');
  const [card] = picks;
  assert.ok(['green', 'knife', 'hall'].includes(card));
});

test('named cards default to the in-flight suggestion', () => {
  // No explicit `named` argument: the selection reads state.suggestion.
  const card = chooseRefuteCard(st(['hall', 'revolver']), 2);
  assert.equal(card, 'hall');
});

test('explicit named override wins over state.suggestion', () => {
  const s = st(['green', 'peacock', 'rope']);
  const card = chooseRefuteCard(s, 2, { suspect: 'peacock', weapon: 'rope', room: 'study' });
  assert.notEqual(card, 'green'); // green is not among the overridden trio
  assert.ok(['peacock', 'rope'].includes(card));
});

test('reads only the refuter\'s own hand — other hands may be garbage', () => {
  const s = st(['green', 'knife', 'hall']);
  const clean = chooseRefuteCard(s, 2);
  const poisoned = st(['green', 'knife', 'hall']);
  poisoned.hands[0] = ['CORRUPT'];
  poisoned.hands[1] = ['CORRUPT'];
  poisoned.envelope = { suspect: 'green', weapon: 'knife', room: 'hall' };
  assert.equal(chooseRefuteCard(poisoned, 2), clean);
});
