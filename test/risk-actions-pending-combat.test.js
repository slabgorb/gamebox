// CROSS-BUG-3: AC1 + AC2 server-side.
//
// Today applyRiskAction with an attack action that has no `resolved` payload
// runs the SERVER-RESOLVED path: it calls resolveAttack → rollDice and
// mutates territories. That path is the bot-attack path (humans always client-
// roll per Amendment A.1). The fix collapses it to a STORE-INTENT step:
//   - state.pendingCombat = { from, to, force, attackerIdx, defenderIdx }
//   - no dice rolled, no territories mutated, no phase change
// The defender's client picks up pendingCombat, drives the physics, and POSTs
// the resolved payload as a SECOND action; the existing resolved-path validator
// applies it and clears pendingCombat.
//
// These tests pin the new contract. They MUST fail today because
// plugins/risk/server/actions.js:applyAttack still runs the rolled path.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';

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

test('AC1: bot-intent attack (no resolved) stores pendingCombat instead of resolving', () => {
  const s = attackState();
  const before = JSON.stringify(s.territories);

  // Spy rng — it MUST NOT be invoked on the bot-intent path.
  let rngCalls = 0;
  const rng = () => { rngCalls += 1; return 0.5; };

  const r = applyRiskAction({
    state: s, actorId: 7, rng,
    action: { type: 'attack', payload: { from: 'alaska', to: 'nwt', force: 5 } },
  });

  assert.equal(r.error, undefined, 'bot-intent attack must succeed without error');
  assert.equal(rngCalls, 0, 'rng must not be invoked on bot-intent attack (no server-side dice)');

  assert.ok(r.state.pendingCombat, 'pendingCombat must be set on bot-intent');
  assert.equal(r.state.pendingCombat.from, 'alaska');
  assert.equal(r.state.pendingCombat.to, 'nwt');
  assert.equal(r.state.pendingCombat.force, 5);
  assert.equal(r.state.pendingCombat.attackerIdx, 0);
  assert.equal(r.state.pendingCombat.defenderIdx, 1);

  // No territory mutation, no phase change, no lastCombat update.
  assert.equal(JSON.stringify(r.state.territories), before, 'territories untouched');
  assert.equal(r.state.phase, 'attack', 'still in attack phase');
  assert.equal(r.state.lastCombat, null, 'lastCombat not yet written');
});

test('AC2: resolved-payload POST clears pendingCombat after applying the outcome', () => {
  const s = attackState();
  // Simulate the post-intent state: pendingCombat already set.
  s.pendingCombat = {
    from: 'alaska', to: 'nwt', force: 5,
    attackerIdx: 0, defenderIdx: 1,
  };

  // Defender's client physics produced a captured outcome. We mimic the
  // resolved payload — replayAttack will compute survivors from rounds.
  const r = applyRiskAction({
    state: s, actorId: 7,
    action: {
      type: 'attack',
      payload: {
        from: 'alaska', to: 'nwt', force: 5,
        resolved: {
          rounds: [
            // attacker rolls 3 dice vs defender's 2 — defender's 2 armies wiped in one round
            { aDice: [6, 6, 6], dDice: [1, 1] },
          ],
        },
      },
    },
  });

  assert.equal(r.error, undefined, 'resolved POST applies cleanly');
  assert.ok(
    r.state.pendingCombat == null,
    'pendingCombat is cleared after the resolved POST is applied',
  );
  assert.equal(r.state.territories.nwt.owner, 0, 'capture transferred ownership');
  assert.equal(r.state.lastCombat.captured, true);
});

test('AC2: server never calls rollDice on the bot-intent path even with a deterministic rng', () => {
  // Reach further: if any of the round-resolution helpers are exercised on
  // the bot-intent path, replayAttack/resolveAttack would consume rng. The
  // spy proves only the storage step ran.
  const s = attackState();
  let rngCalls = 0;
  const rng = () => { rngCalls += 1; return 0.99; };

  applyRiskAction({
    state: s, actorId: 7, rng,
    action: { type: 'attack', payload: { from: 'alaska', to: 'nwt', force: 2 } },
  });

  assert.equal(rngCalls, 0, 'no rng consumed on bot-intent attack');
});

test('AC2: human resolved-payload attack still works (regression guard for AC8)', () => {
  // This mirrors the existing Amendment A.1 path. With the bot-intent path
  // collapsing to storage, a human's flow (which always carries a `resolved`
  // payload) must still travel the validator/applier untouched.
  const s = attackState();
  s.territories.nwt.armies = 2; // small defender so a 3-vs-2 sweep is plausible

  const r = applyRiskAction({
    state: s, actorId: 7,
    action: {
      type: 'attack',
      payload: {
        from: 'alaska', to: 'nwt', force: 9, // committed implicitly = src.armies-1 = 9
        resolved: {
          rounds: [{ aDice: [6, 6, 6], dDice: [1, 1] }],
        },
      },
    },
  });

  assert.equal(r.error, undefined);
  assert.equal(r.state.territories.nwt.owner, 0, 'human resolved attack still captures');
});
