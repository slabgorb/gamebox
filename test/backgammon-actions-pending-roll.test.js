// CROSS-BUG-3: AC4 + AC5 engine-side.
//
// Today doRoll / doRollInitial demand a fully-formed payload (values 1..6,
// throwParams[]) and reject anything else. After the refactor:
//   - When the active player is a bot, the bot's wake-up POSTs a roll
//     INTENT — an action whose payload carries no values. The engine stores
//     state.pendingRoll = { player, kind } and pauses (phase stays pre-roll
//     / initial-roll; no dice are set).
//   - The human's client picks up pendingRoll, physically rolls, then POSTs
//     the same action type WITH values. The engine clears pendingRoll and
//     applies the dice exactly as before.
//
// These tests pin the new contract for `applyBackgammonAction`. They MUST
// fail today because the engine rejects values-less roll payloads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyBackgammonAction } from '../plugins/backgammon/server/actions.js';
import { buildInitialState } from '../plugins/backgammon/server/state.js';

function preRollState({ activePlayer = 'a', humanId = 1, botId = 2 } = {}) {
  const s = buildInitialState({
    participants: [{ userId: humanId, side: 'a' }, { userId: botId, side: 'b' }],
    options: {},
  });
  s.turn.activePlayer = activePlayer;
  s.turn.phase = 'pre-roll';
  s.turn.dice = null;
  return s;
}

function initialRollState({ humanId = 1, botId = 2 } = {}) {
  const s = buildInitialState({
    participants: [{ userId: humanId, side: 'a' }, { userId: botId, side: 'b' }],
    options: {},
  });
  // initial-roll is the default initial phase; both sides null.
  return s;
}

test('AC4: pre-roll bot intent (roll action with no payload values) stores pendingRoll', () => {
  // Bot is on side 'b' (botId = 2). The bot's orchestrator-driven wake-up
  // POSTs a roll action with no values; the engine must capture that as
  // intent rather than reject it.
  const s = preRollState({ activePlayer: 'b', humanId: 1, botId: 2 });

  const r = applyBackgammonAction({
    state: s, actorId: 2,
    action: { type: 'roll', payload: { throwParams: [] } }, // values intentionally absent
  });

  assert.equal(r.error, undefined, 'engine must accept values-less roll as intent');
  assert.ok(r.state.pendingRoll, 'pendingRoll set');
  assert.equal(r.state.pendingRoll.kind, 'roll');
  // player can be the side letter or the userId; the brief says { player: botIdx, kind }.
  // We accept either shape here — Dev's call — but it MUST identify the bot.
  const p = r.state.pendingRoll.player;
  assert.ok(
    p === 'b' || p === 2 || p === 1, // botIdx (1) when sides.a=human, sides.b=bot
    `pendingRoll.player must identify the bot (got ${JSON.stringify(p)})`,
  );
  assert.equal(r.state.turn.phase, 'pre-roll', 'phase must NOT advance to moving');
  assert.equal(r.state.turn.dice, null, 'dice must remain unset until physics resolves');
});

test('AC4: initial-roll bot intent stores pendingRoll with kind=roll-initial', () => {
  const s = initialRollState({ humanId: 1, botId: 2 });

  const r = applyBackgammonAction({
    state: s, actorId: 2,
    action: { type: 'roll-initial', payload: { throwParams: [] } }, // no value
  });

  assert.equal(r.error, undefined, 'engine must accept values-less initial-roll as intent');
  assert.ok(r.state.pendingRoll, 'pendingRoll set');
  assert.equal(r.state.pendingRoll.kind, 'roll-initial');
  assert.equal(r.state.initialRoll.b, null, 'bot side initial roll value is NOT generated server-side');
  assert.equal(r.state.turn.phase, 'initial-roll', 'phase unchanged');
});

test('AC5: posting roll values while pendingRoll is set applies the dice and clears pendingRoll', () => {
  // Simulate the post-intent state: bot signalled intent, human client
  // rolled, and POSTs the values. Engine applies dice and clears pendingRoll.
  const s = preRollState({ activePlayer: 'b', humanId: 1, botId: 2 });
  s.pendingRoll = { player: 'b', kind: 'roll' };

  const r = applyBackgammonAction({
    state: s, actorId: 2, // bot is still the active player; the human is acting as proxy
    action: { type: 'roll', payload: { values: [3, 5], throwParams: [] } },
  });

  assert.equal(r.error, undefined, 'resolved roll applies cleanly');
  assert.ok(
    r.state.pendingRoll == null,
    'pendingRoll is cleared after the dice values are applied',
  );
  assert.equal(r.state.turn.phase, 'moving', 'phase advances once dice land');
  assert.deepEqual(r.state.turn.dice.values, [3, 5]);
  assert.deepEqual(r.state.turn.dice.remaining, [3, 5]);
});

test('AC5: posting initial-roll value while pendingRoll is set applies the value and clears pendingRoll', () => {
  const s = initialRollState({ humanId: 1, botId: 2 });
  s.pendingRoll = { player: 'b', kind: 'roll-initial' };

  const r = applyBackgammonAction({
    state: s, actorId: 2,
    action: { type: 'roll-initial', payload: { value: 4, throwParams: [] } },
  });

  assert.equal(r.error, undefined);
  assert.ok(r.state.pendingRoll == null, 'pendingRoll cleared after initial-roll value lands');
  assert.equal(r.state.initialRoll.b, 4, 'bot side initial-roll value applied from client physics');
});

test('AC8 regression: human pre-roll WITH values (no pendingRoll) still rolls normally', () => {
  // Human is side 'a', active. They post values directly (their own client
  // rolled). No pendingRoll involved. Existing behavior must be preserved.
  const s = preRollState({ activePlayer: 'a', humanId: 1, botId: 2 });

  const r = applyBackgammonAction({
    state: s, actorId: 1,
    action: { type: 'roll', payload: { values: [2, 6], throwParams: [] } },
  });

  assert.equal(r.error, undefined);
  assert.equal(r.state.turn.phase, 'moving');
  assert.deepEqual(r.state.turn.dice.values, [2, 6]);
});
