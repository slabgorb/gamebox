import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialState } from '../../plugins/sorry/server/state.js';
import { applySorryAction } from '../../plugins/sorry/server/actions.js';
import { chooseAction } from '../../plugins/sorry/server/ai/sorry-player.js';
import { legalMoves } from '../../plugins/sorry/server/rules/legal-moves.js';

// =========================================================================
// E3-6 AC #6 — orchestrator turn-continuation contract.
//
// The bot drives a whole turn in one wake-up and the host re-wakes it only
// while `activeUserId === <bot userId>`. After applySorryAction the invariant
// `state.activeUserId === state.sides[state.currentPlayer]` must always hold,
// so the orchestrator's bot-wake gate stays consistent. A drawn `2` grants a
// draw-again: currentPlayer (and therefore activeUserId) stays on the bot, so
// the orchestrator wakes it a second time within the same turn.
//
// No mocks beyond a deterministic LLM stub: the real adapter + real engine run.
// The deck is seeded with a leading `1` so the *next* draw is deterministic
// (draw() pops deck[0]) and the new current player always has a legal move —
// otherwise the engine's auto-pass would bounce the turn unpredictably.
// =========================================================================

// Side 'a' is the bot (currentPlayer starts 'a', activeUserId starts sides.a).
const participants = [
  { side: 'a', userId: 'bot' },
  { side: 'b', userId: 'human' },
];

const persona = { systemPrompt: 'test persona' };

// Deterministic stub: returns the exact JSON contract for the first legal move
// of the supplied state, so the adapter applies it verbatim (no fallback).
function firstLegalMoveLlm(state) {
  const moves = legalMoves(state);
  return {
    send: async () => ({
      text: JSON.stringify({ moveId: moves[0].id, banter: 'first!' }),
      sessionId: 'sess-1',
    }),
  };
}

test('nominal bot turn: adapter move applies, turn passes, activeUserId tracks the new current player', async () => {
  const base = buildInitialState({ participants });
  // Card 1 brings a pawn out and PASSES the turn (only 2 grants draw-again).
  const state = { ...base, drawnCard: 1, deck: [1, ...base.deck] };

  const llm = firstLegalMoveLlm(state);
  const { action, banter } = await chooseAction({
    llm, persona, sessionId: null, state, botPlayerIdx: 0, userMessages: [],
  });

  // Guardrail: the bot only ever emits a 'move' action, never a 'draw'.
  assert.equal(action.type, 'move');
  assert.equal(banter, 'first!');

  const result = applySorryAction({ state, action, actorId: 'bot' });

  assert.equal(result.error, undefined, `engine rejected a legal bot move: ${result.error}`);
  assert.equal(result.ended, false);

  // The move actually changed the board — one bot pawn left Start.
  const startBefore = state.pawns.a.filter((p) => p.zone === 'start').length;
  const startAfter = result.state.pawns.a.filter((p) => p.zone === 'start').length;
  assert.equal(startAfter, startBefore - 1, 'expected exactly one bot pawn to leave Start');

  // Card 1 passes the turn to the opponent...
  assert.equal(result.state.currentPlayer, 'b');
  // ...and the orchestrator invariant holds: activeUserId === sides[currentPlayer].
  assert.equal(result.state.activeUserId, result.state.sides[result.state.currentPlayer]);
  assert.equal(result.state.activeUserId, 'human');
});

test('draw-again (card 2): the bot retains the turn so the orchestrator re-wakes it', async () => {
  const base = buildInitialState({ participants });
  // Card 2 brings a pawn out AND grants a draw-again: same player keeps the turn.
  const state = { ...base, drawnCard: 2, deck: [1, ...base.deck] };

  const llm = firstLegalMoveLlm(state);
  const { action } = await chooseAction({
    llm, persona, sessionId: null, state, botPlayerIdx: 0, userMessages: [],
  });
  assert.equal(action.type, 'move');

  const result = applySorryAction({ state, action, actorId: 'bot' });

  assert.equal(result.error, undefined, `engine rejected a legal bot move: ${result.error}`);
  assert.equal(result.ended, false);

  // The crux of turn-continuation: currentPlayer is unchanged after a 2...
  assert.equal(result.state.currentPlayer, 'a');
  // ...so activeUserId still points at the bot — the orchestrator must wake it again.
  assert.equal(result.state.activeUserId, result.state.sides[result.state.currentPlayer]);
  assert.equal(result.state.activeUserId, 'bot');
});

test('the orchestrator invariant (activeUserId === sides[currentPlayer]) holds at game start too', () => {
  const state = buildInitialState({ participants });
  assert.equal(state.activeUserId, state.sides[state.currentPlayer]);
});
