// E6-5 Task 4 — orchestrator wiring for clue.
//
// F8b (BLOCKING, inherited from E6-4): clue's `pendingRoll` is the RESOLVED
// die value ("move now") — the semantic INVERSE of backgammon's awaiting-client
// object ("pause"). The generic `if (state.pendingCombat || state.pendingRoll)
// return` gate must not apply to clue: a numeric pendingRoll DRIVES the bot.
//
// The bot's top-of-turn roll intent is VALUES-LESS and engine-rejected
// (E6-4 pin) — it must be intercepted as a client-dice request (SSE
// `clue_roll_request`), never applied.
//
// Reviewer Finding #6 (E6-4): a non-refuter bot mid-refute must not be driven
// (activeUserId gate); the active bot refuter is driven deterministically.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getAiSession } from '../src/server/ai/agent-session.js';
import { buildTracker } from '../plugins/clue/server/ai/knowledge.js';
import { buildClueShortlist } from '../plugins/clue/server/ai/shortlist.js';
import { bootClueGame, gameState, rawState, BOT_PERSONA } from './_helpers/clue-orchestrator-harness.js';

test('F8b: a numeric pendingRoll DRIVES the clue bot through its whole turn', async () => {
  // Bot (seat 1) on turn, die already resolved to 4 by a client. The bot must
  // move — not be paused by the generic pendingRoll gate — and then keep
  // driving (accuse-or-pass -> pass) until the turn leaves it, all in ONE
  // wake-up (orchestrator turn-continuation contract).
  const { db, gameId, botId, humanB, llm, orchestrator } = bootClueGame({
    mutateState: (s, { botId: bot }) => {
      s.currentSeat = 1;
      s.activeUserId = bot;
      s.pendingRoll = 4;
    },
  });

  const s0 = gameState(db, gameId);
  const tracker = buildTracker({ state: s0, seat: 1 });
  const shortlist = buildClueShortlist({ state: s0, seat: 1, tracker });
  const move = shortlist.find((e) => e.slot === 'corridor');
  assert.ok(move, 'resolved-die sub-state offers corridor moves (mustard start, die 4)');

  llm.pushResponse({ text: JSON.stringify({ moveId: move.id, banter: 'On the march.' }), sessionId: 's1' });
  // Second decision (accuse-or-pass) is a forced menu of one (pass): the
  // send still happens (banter contract) but any parseable text works.
  llm.pushResponse({ text: '{}', sessionId: 's2' });

  await orchestrator.runTurn(gameId);

  const s1 = gameState(db, gameId);
  assert.deepEqual(s1.pawns[s1.seatSuspect[1]], { square: move.action.payload.square },
    'bot pawn landed on the shortlisted square — the numeric pendingRoll drove the move');
  assert.equal(s1.pendingRoll, null);
  assert.equal(s1.phase, 'move');
  assert.equal(s1.currentSeat, 2, 'bot finished its turn (move -> pass)');
  assert.equal(s1.activeUserId, humanB, 'turn handed to the next seat in one wake-up');
  assert.equal(llm.calls.length, 2, 'move decision + forced-pass banter call');
  assert.equal(getAiSession(db, gameId, botId).stalledAt, null, 'a driven turn is not a stall');
});

test('F8b: a values-less roll intent is intercepted as clue_roll_request, never applied', async () => {
  // Bot on turn at the top of its turn (pendingRoll null). Its only decision
  // is the values-less roll intent; the orchestrator must broadcast a
  // client-dice request and yield WITHOUT touching the engine.
  const { db, gameId, botId, broadcasts, llm, orchestrator } = bootClueGame({
    mutateState: (s, { botId: bot }) => {
      s.currentSeat = 1;
      s.activeUserId = bot;
    },
  });
  // Top-of-turn menu is [roll] (menu of one) — the send still happens.
  llm.pushResponse({ text: JSON.stringify({ moveId: 'roll', banter: 'Fingers crossed.' }), sessionId: 's1' });

  const before = rawState(db, gameId);
  await orchestrator.runTurn(gameId);

  const req = broadcasts.find((b) => b.type === 'clue_roll_request');
  assert.ok(req, 'clue_roll_request must be broadcast for a bot roll intent');
  assert.equal(req.payload.seat, 1);
  assert.equal(req.payload.personaId, BOT_PERSONA);

  assert.equal(rawState(db, gameId), before, 'engine state untouched — the intent was not applied');
  const after = gameState(db, gameId);
  assert.equal(after.pendingRoll, null, 'no die value materialised server-side');
  assert.equal(after.activeUserId, botId, 'bot stays the active player awaiting the client die');
  assert.ok(!broadcasts.some((b) => b.type === 'bot_stalled'), 'a dice pause is not a stall');
  assert.equal(getAiSession(db, gameId, botId).stalledAt, null);
});

test('Finding #6: a non-refuter bot is NOT driven during another seat\'s refute', async () => {
  // Human A (seat 0) suggested; human B (seat 2) is the refuter and holds
  // activeUserId. The bot (seat 1) is mid-refute-phase but NOT active: the
  // orchestrator must not drive it at all.
  const { db, gameId, llm, broadcasts, orchestrator, botId } = bootClueGame({
    mutateState: (s, { humanB: refuter }) => {
      s.phase = 'refute';
      s.currentSeat = 0;
      s.activeUserId = refuter;
      s.suggestion = {
        bySeat: 0, suspect: 'green', weapon: 'knife', room: 'hall',
        refuterSeat: 2, shownCard: null,
      };
    },
  });

  const before = rawState(db, gameId);
  await orchestrator.runTurn(gameId);

  assert.equal(rawState(db, gameId), before, 'state must not change');
  assert.equal(llm.calls.length, 0, 'inactive bot must not be driven to a decision');
  assert.deepEqual(broadcasts, [], 'no bot events while a human refute is pending');
  assert.equal(getAiSession(db, gameId, botId).stalledAt, null);
});

test('Finding #6: the active bot refuter IS driven deterministically (no LLM call)', async () => {
  // Human A (seat 0) suggested {green, knife, hall}; the bot (seat 1) is the
  // refuter and holds both matching cards. The refute short-circuit is
  // deterministic — no LLM call, no stall — and hands the turn back to the
  // suggester.
  const { db, gameId, botId, humanA, llm, orchestrator } = bootClueGame({
    mutateState: (s, { botId: bot }) => {
      s.phase = 'refute';
      s.currentSeat = 0;
      s.activeUserId = bot;
      s.hands[1] = ['green', 'knife'];
      s.suggestion = {
        bySeat: 0, suspect: 'green', weapon: 'knife', room: 'hall',
        refuterSeat: 1, shownCard: null,
      };
    },
  });

  await orchestrator.runTurn(gameId);

  const s1 = gameState(db, gameId);
  assert.equal(s1.phase, 'accuse-or-pass', 'refute applied — game resumed');
  assert.equal(s1.activeUserId, humanA, 'turn returned to the suggester');
  const shown = s1.ledgers[0].at(-1);
  assert.ok(shown && ['green', 'knife'].includes(shown.card), 'suggester ledger records the shown card');
  assert.equal(shown.fromSeat, 1);
  assert.equal(llm.calls.length, 0, 'auto-refute must not consult the LLM');
  assert.equal(getAiSession(db, gameId, botId).stalledAt, null);
});
