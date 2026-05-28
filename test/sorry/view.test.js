import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sorryPublicView } from '../../plugins/sorry/server/view.js';
import { legalMoves } from '../../plugins/sorry/server/rules/legal-moves.js';
import { baseState } from '../_helpers/sorry-fixtures.js';

// =========================================================================
// E3-6 AC #3 — sorryPublicView exposes `legalMoves` to the active viewer only.
// The implementer decision: call legalMoves(state) and include it in the view
// when state.currentPlayer === youAre. The client reads that array; it never
// re-implements legal-moves.js. legalMoves must NOT leak to the opponent.
// =========================================================================

test("sorryPublicView: the current player's view carries the engine legalMoves verbatim", () => {
  const state = baseState(); // currentPlayer 'a', card 1 → four out:* moves
  const view = sorryPublicView({ state, viewerId: 'user-a' });

  assert.ok(Array.isArray(view.legalMoves), 'current player must receive a legalMoves array');
  assert.ok(view.legalMoves.length > 0, 'legalMoves must be non-empty when moves exist');
  // The view exposes the engine's result, it does not recompute a different list.
  assert.deepEqual(view.legalMoves, legalMoves(state));
});

test("sorryPublicView: the opponent's view does NOT receive a populated legalMoves list", () => {
  const state = baseState(); // 'a' is to move; 'b' is the opponent
  const view = sorryPublicView({ state, viewerId: 'user-b' });

  // AC #3 allows either omission or an empty array — never the active move list.
  assert.ok(
    view.legalMoves === undefined ||
      (Array.isArray(view.legalMoves) && view.legalMoves.length === 0),
    `opponent must not receive legal moves, got ${JSON.stringify(view.legalMoves)}`,
  );
});

test('sorryPublicView: a non-participant (spectator) receives no legal moves', () => {
  const state = baseState();
  const view = sorryPublicView({ state, viewerId: 'nobody-here' }); // youAre === null

  assert.equal(view.youAre, null);
  assert.ok(
    view.legalMoves === undefined ||
      (Array.isArray(view.legalMoves) && view.legalMoves.length === 0),
    `spectator must not receive legal moves, got ${JSON.stringify(view.legalMoves)}`,
  );
});

test('sorryPublicView: adding legalMoves must not un-redact the deck order (regression guard)', () => {
  const state = baseState({ deck: [1, 2, 'sorry'] });
  const view = sorryPublicView({ state, viewerId: 'user-a' });

  assert.equal(view.deck, undefined, 'raw deck order must stay redacted');
  assert.equal(view.deckCount, 3, 'deckCount must still reflect the hidden deck size');
});
