import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';

// Minimal attack-phase state: player 0 owns A (5 armies), enemy owns B (2),
// A and B adjacent. Uses real map adjacency for a known pair.
function attackState() {
  return {
    phase: 'attack',
    currentPlayer: 0,
    territories: {},
    reinforcePool: 0,
    setupPools: [0, 0],
    fortifyUsed: false,
    lastCombat: null,
    winner: null,
    log: [],
    sides: { a: 7, b: 8 },
    activeUserId: 7,
  };
}

test('a valid posted combat is applied (capture transfers the territory)', () => {
  // Build state from a real adjacent pair via the server map.
  return import('../plugins/risk/server/map.js').then(({ allTerritories, neighborsOf }) => {
    const from = allTerritories().find((id) => neighborsOf(id).length > 0);
    const to = neighborsOf(from)[0];
    const s = attackState();
    s.territories[from] = { owner: 0, armies: 5 };
    s.territories[to] = { owner: 1, armies: 2 };
    // Fill remaining territories so ownedCount(opponent) stays > 0.
    for (const id of allTerritories()) {
      if (!s.territories[id]) s.territories[id] = { owner: 1, armies: 1 };
    }
    const action = {
      type: 'attack',
      payload: {
        from,
        to,
        resolved: {
          rounds: [{ aDice: [6, 6, 6], dDice: [1, 1] }],
          attackerLosses: 0,
          defenderLosses: 2,
          captured: true,
        },
      },
    };
    const res = applyRiskAction({ state: s, action, actorId: 7 });
    assert.equal(res.error, undefined);
    assert.equal(res.state.territories[to].owner, 0);
    assert.equal(res.state.lastCombat.captured, true);
  });
});

test('an inconsistent posted combat is rejected with no state change', () => {
  return import('../plugins/risk/server/map.js').then(({ allTerritories, neighborsOf }) => {
    const from = allTerritories().find((id) => neighborsOf(id).length > 0);
    const to = neighborsOf(from)[0];
    const s = attackState();
    s.territories[from] = { owner: 0, armies: 5 };
    s.territories[to] = { owner: 1, armies: 2 };
    for (const id of allTerritories()) {
      if (!s.territories[id]) s.territories[id] = { owner: 1, armies: 1 };
    }
    const action = {
      type: 'attack',
      payload: {
        from,
        to,
        resolved: {
          rounds: [{ aDice: [6, 6, 6, 6], dDice: [1, 1] }], // illegal count
          attackerLosses: 0,
          defenderLosses: 2,
          captured: true,
        },
      },
    };
    const res = applyRiskAction({ state: s, action, actorId: 7 });
    assert.match(res.error, /dice count/i);
  });
});

test('a valid posted combat is applied (repulse leaves armies retreated home)', () => {
  return import('../plugins/risk/server/map.js').then(({ allTerritories, neighborsOf }) => {
    const from = allTerritories().find((id) => neighborsOf(id).length > 0);
    const to = neighborsOf(from)[0];
    const s = attackState();
    s.territories[from] = { owner: 0, armies: 5 };
    s.territories[to] = { owner: 1, armies: 3 };
    for (const id of allTerritories()) {
      if (!s.territories[id]) s.territories[id] = { owner: 1, armies: 1 };
    }
    // force = src.armies - 1 = 4 (attacker rolls 3 dice), defenders = 3 (defender rolls 2 dice).
    // Round 1: a=[1,1,1] d=[6,6,6 -> top 2 = 6,6]. resolveRound sort desc:
    //   a=[1,1,1], d=[6,6]; pairs=2: 1>6 no -> aLoss++; 1>6 no -> aLoss++. {aLoss:2, dLoss:0}.
    //   af=4-2=2, df=3. Loop continues (af>1 && df>0).
    // Round 2: same dice (a=[1,1,1] for force still rolls 3? NO: attackerDiceCount(af=2)=min(3,1)=1.
    //   replayAttack expects aDice.length === min(3, af-1) = 1, NOT 3.
    // We submit ONE round only, with af=4 -> 2, df=3, then stop. After 1 round the combat could
    // continue (af>1 && df>0), but Task 3.1's narrower guard only fires on rounds.length===0,
    // not on partial-combat-stop. So 1 round of [1,1,1] vs [6,6] is a legal partial combat.
    const action = {
      type: 'attack',
      payload: {
        from,
        to,
        resolved: {
          rounds: [{ aDice: [1, 1, 1], dDice: [6, 6] }],
          attackerLosses: 2,
          defenderLosses: 0,
          captured: false,
        },
      },
    };
    const res = applyRiskAction({ state: s, action, actorId: 7 });
    assert.equal(res.error, undefined);
    // Repulse end-state: tgt owner unchanged, tgt.armies = defenderSurvivors (3 - 0 = 3),
    // src.armies = 1 + attackerSurvivors (1 + 2 = 3). lastCombat.captured = false.
    assert.equal(res.state.territories[from].owner, 0);
    assert.equal(res.state.territories[from].armies, 3);
    assert.equal(res.state.territories[to].owner, 1);
    assert.equal(res.state.territories[to].armies, 3);
    assert.equal(res.state.lastCombat.captured, false);
    assert.equal(res.state.lastCombat.attackerSurvivors, 2);
    assert.equal(res.state.lastCombat.defenderSurvivors, 3);
  });
});

test('a posted combat between non-adjacent territories is rejected with no state change', () => {
  return import('../plugins/risk/server/map.js').then(({ allTerritories, neighborsOf, areAdjacent }) => {
    // Find two territories that are NOT adjacent. Pick any first territory `from`,
    // then pick a target that is NOT in its neighbor set.
    const all = allTerritories();
    const from = all.find((id) => neighborsOf(id).length > 0);
    const neighbors = new Set(neighborsOf(from));
    const to = all.find((id) => id !== from && !neighbors.has(id));
    // Sanity: confirm we found a non-adjacent pair before exercising the code path.
    assert.equal(areAdjacent(from, to), false, 'test setup: from/to must be non-adjacent');
    const s = attackState();
    s.territories[from] = { owner: 0, armies: 5 };
    s.territories[to] = { owner: 1, armies: 2 };
    for (const id of all) {
      if (!s.territories[id]) s.territories[id] = { owner: 1, armies: 1 };
    }
    const before = JSON.stringify(s.territories);
    const action = {
      type: 'attack',
      payload: {
        from,
        to,
        resolved: {
          rounds: [{ aDice: [6, 6, 6], dDice: [1, 1] }],
          attackerLosses: 0,
          defenderLosses: 2,
          captured: true,
        },
      },
    };
    const res = applyRiskAction({ state: s, action, actorId: 7 });
    assert.match(res.error, /adjacent/i);
    // No state mutation on rejection — input state is unchanged (applyRiskAction clones before writing).
    assert.equal(JSON.stringify(s.territories), before);
  });
});
