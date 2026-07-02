// E5-10: conquest advance — the attacker CHOOSES how many armies move into a
// captured territory instead of the all-in default.
//
// Contract pinned by these tests:
//   - `payload.resolved.advanceCount` (integer) picks the advancing armies on
//     a capture. Valid range: [dice rolled in the winning (final) round,
//     attackerSurvivors]. In the march-out model the origin holds
//     1 + survivors at conquest time, so max = survivors ≡ "origin armies - 1".
//   - Out-of-range or non-integer advanceCount → error, no state change.
//   - Omitted advanceCount → defaults to max (all survivors advance — the
//     pre-E5-10 behavior; keeps the bot / defender-proxy path turnkey).
//   - On a repulse advanceCount is irrelevant and ignored.
//   - When pendingCombat is set (bot attacker, defender-proxy resolving) a
//     proxy-posted advanceCount is IGNORED: the advance choice belongs to the
//     attacker, and the bot's policy is max. A hostile proxy must not be able
//     to strand the bot's armies.
//
// These MUST fail against the current actions.js, which hardcodes
// tgt.armies = attackerSurvivors (all-in) and ignores advanceCount entirely.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';
import { resolvePendingCombat } from '../plugins/risk/server/ai/risk-player.js';

// Same harness as risk-actions-pending-combat: alaska/nwt are adjacent on the
// real map; alberta keeps the defender alive after losing nwt.
function attackState() {
  return {
    phase: 'attack', currentPlayer: 0,
    territories: {
      alaska: { owner: 0, armies: 10 }, nwt: { owner: 1, armies: 2 },
      alberta: { owner: 1, armies: 1 }, kamchatka: { owner: 0, armies: 1 },
    },
    reinforcePool: 0, setupPools: [0, 0], fortifyUsed: false,
    lastCombat: null, winner: null, log: [], sides: { a: 7, b: 8 }, activeUserId: 7,
  };
}

// One-round sweep: force 9 marches, 3 dice vs 2, no attacker losses.
// survivors = 9, winning-round dice = 3 → advance range [3, 9].
function sweepAction(advanceCount) {
  return {
    type: 'attack',
    payload: {
      from: 'alaska', to: 'nwt',
      resolved: {
        rounds: [{ aDice: [6, 6, 6], dDice: [1, 1] }],
        ...(advanceCount !== undefined ? { advanceCount } : {}),
      },
    },
  };
}

test('capture with advanceCount = min (winning-round dice) moves exactly that many', () => {
  const s = attackState();
  const r = applyRiskAction({ state: s, actorId: 7, action: sweepAction(3) });
  assert.equal(r.error, undefined);
  assert.equal(r.state.territories.nwt.owner, 0, 'capture transfers ownership');
  assert.equal(r.state.territories.nwt.armies, 3, 'exactly advanceCount armies advance');
  // Origin keeps the 1 left behind plus the survivors who did not advance.
  assert.equal(r.state.territories.alaska.armies, 7, 'origin holds 1 + (9 - 3)');
});

test('capture with advanceCount = max (survivors) matches the old all-in behavior', () => {
  const s = attackState();
  const r = applyRiskAction({ state: s, actorId: 7, action: sweepAction(9) });
  assert.equal(r.error, undefined);
  assert.equal(r.state.territories.nwt.armies, 9);
  assert.equal(r.state.territories.alaska.armies, 1, 'origin always keeps at least 1');
});

test('capture with a mid-range advanceCount splits survivors between origin and target', () => {
  const s = attackState();
  const r = applyRiskAction({ state: s, actorId: 7, action: sweepAction(5) });
  assert.equal(r.error, undefined);
  assert.equal(r.state.territories.nwt.armies, 5);
  assert.equal(r.state.territories.alaska.armies, 5, '1 + (9 - 5)');
});

test('min comes from the FINAL round dice count, not the largest roll of the battle', () => {
  // Multi-round battle: 3 dice in round 1, but the winning round rolls 1 die.
  // force 4 (alaska 5), defender 3. R1 loses 2 attackers; R2-R4 grind the
  // defender down 1 per round with a single die. survivors=2, final dice=1
  // → advance range [1, 2].
  const s = attackState();
  s.territories.alaska.armies = 5;
  s.territories.nwt.armies = 3;
  const rounds = [
    { aDice: [1, 1, 1], dDice: [6, 6] }, // aLoss 2 → af 2, df 3
    { aDice: [6], dDice: [1, 1] },       // dLoss 1 → df 2
    { aDice: [6], dDice: [1, 1] },       // dLoss 1 → df 1
    { aDice: [6], dDice: [1] },          // dLoss 1 → df 0, captured
  ];
  const r = applyRiskAction({
    state: s, actorId: 7,
    action: { type: 'attack', payload: { from: 'alaska', to: 'nwt', resolved: { rounds, advanceCount: 1 } } },
  });
  assert.equal(r.error, undefined, 'advanceCount 1 is legal when the winning round rolled 1 die');
  assert.equal(r.state.territories.nwt.owner, 0);
  assert.equal(r.state.territories.nwt.armies, 1);
  assert.equal(r.state.territories.alaska.armies, 2, '1 + (2 survivors - 1 advanced)');
});

test('advanceCount below min is rejected with no state change', () => {
  const s = attackState();
  const before = JSON.stringify(s.territories);
  const r = applyRiskAction({ state: s, actorId: 7, action: sweepAction(2) });
  assert.match(r.error, /advance/i, 'error names the advance');
  assert.equal(JSON.stringify(s.territories), before, 'input state untouched on rejection');
});

test('advanceCount above max (survivors) is rejected with no state change', () => {
  const s = attackState();
  const before = JSON.stringify(s.territories);
  const r = applyRiskAction({ state: s, actorId: 7, action: sweepAction(10) });
  assert.match(r.error, /advance/i);
  assert.equal(JSON.stringify(s.territories), before);
});

test('non-integer advanceCount values are rejected', () => {
  for (const bad of [3.5, '5', null, NaN, -1]) {
    const s = attackState();
    const r = applyRiskAction({ state: s, actorId: 7, action: sweepAction(bad) });
    assert.match(
      r.error ?? '', /advance/i,
      `advanceCount ${String(bad)} must be rejected`,
    );
  }
});

test('omitted advanceCount defaults to max — all survivors advance (pre-E5-10 behavior)', () => {
  const s = attackState();
  const r = applyRiskAction({ state: s, actorId: 7, action: sweepAction(undefined) });
  assert.equal(r.error, undefined);
  assert.equal(r.state.territories.nwt.armies, 9, 'default advance is the full survivor count');
  assert.equal(r.state.territories.alaska.armies, 1);
});

test('advanceCount on a repulse is ignored — no error, retreat bookkeeping unchanged', () => {
  // Partial combat: one round, attacker loses 2, stops. Not captured.
  const s = attackState();
  s.territories.alaska.armies = 5; // force 4
  s.territories.nwt.armies = 3;
  const r = applyRiskAction({
    state: s, actorId: 7,
    action: {
      type: 'attack',
      payload: {
        from: 'alaska', to: 'nwt',
        resolved: { rounds: [{ aDice: [1, 1, 1], dDice: [6, 6] }], advanceCount: 2 },
      },
    },
  });
  assert.equal(r.error, undefined, 'advanceCount is irrelevant on a repulse');
  assert.equal(r.state.territories.nwt.owner, 1, 'no capture');
  assert.equal(r.state.territories.alaska.armies, 3, '1 + 2 survivors retreat home');
  assert.equal(r.state.territories.nwt.armies, 3);
});

test('bot conquest (pendingCombat): proxy-posted advanceCount is ignored, bot advances max', () => {
  // The defender-proxy resolves a bot attack. A proxy trying to strand the
  // bot's armies with advanceCount=1 must not be honored — the advance choice
  // belongs to the attacker.
  const s = attackState();
  s.pendingCombat = { from: 'alaska', to: 'nwt', force: 5, attackerIdx: 0, defenderIdx: 1 };
  const r = applyRiskAction({
    state: s, actorId: 8, // defender's userId (seat 1) posts the resolution
    action: {
      type: 'attack',
      payload: {
        from: 'alaska', to: 'nwt',
        resolved: { rounds: [{ aDice: [6, 6, 6], dDice: [1, 1] }], advanceCount: 1 },
      },
    },
  });
  assert.equal(r.error, undefined);
  assert.ok(r.state.pendingCombat == null, 'pendingCombat cleared');
  assert.equal(r.state.territories.nwt.owner, 0, 'bot captured');
  assert.equal(r.state.territories.nwt.armies, 9, 'bot advances ALL survivors, proxy choice ignored');
  assert.equal(r.state.territories.alaska.armies, 1);
});

test('bot-vs-bot: resolvePendingCombat output applies cleanly and advances max in one step', () => {
  // AC-5: a bot conquest must resolve within a single orchestrator
  // continuation — the resolver's action needs no follow-up advance choice.
  const s = attackState();
  s.pendingCombat = { from: 'alaska', to: 'nwt', force: 9, attackerIdx: 0, defenderIdx: 1 };
  // Deterministic rng: attacker's 3 dice roll 6s, defender's 2 dice roll 1s.
  const seq = [0.99, 0.99, 0.99, 0.01, 0.01];
  let i = 0;
  const rng = () => seq[i++ % seq.length];
  const action = resolvePendingCombat(s, rng);
  assert.ok(action, 'resolver produces an action for the pending combat');
  const r = applyRiskAction({ state: s, actorId: 8, action });
  assert.equal(r.error, undefined, 'resolver action applies without an advance step');
  assert.ok(r.state.pendingCombat == null, 'pendingCombat cleared');
  assert.equal(r.state.territories.nwt.owner, 0);
  assert.equal(r.state.territories.nwt.armies, 9, 'default bot policy: advance all survivors');
  assert.equal(r.state.territories.alaska.armies, 1);
});
