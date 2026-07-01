import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialState, SETUP_ARMIES_BY_COUNT, playerIndex, userIdOf, liveSeats, firstPlayer } from '../plugins/risk/server/state.js';
import { applyRiskAction } from '../plugins/risk/server/actions.js';
import { allTerritories } from '../plugins/risk/server/map.js';

function rngOf(seed = 42) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function participantsOf(n) {
  return Array.from({ length: n }, (_, seat) => ({ userId: 100 + seat, seat }));
}

function fourPlayerState() {
  return buildInitialState({ participants: participantsOf(4), rng: rngOf() });
}

// Force a deterministic mid-game shape: seat `owner` holds every territory
// except the ones named in `others` ({territoryId: {owner, armies}}).
function riggedState(others) {
  const s = fourPlayerState();
  s.phase = 'attack';
  for (const id of allTerritories()) s.territories[id] = { owner: 0, armies: 3 };
  for (const [id, t] of Object.entries(others)) s.territories[id] = { ...t };
  s.currentPlayer = 0;
  s.activeUserId = userIdOf(s, 0);
  s.setupPools = [0, 0, 0, 0];
  return s;
}

// A resolved combat where the attacker always wins with 3 dice vs the
// defender's dice — rounds engineered for the given force/defenders.
function winningRounds(force, defenders) {
  const rounds = [];
  let af = force, df = defenders;
  while (af > 1 && df > 0) {
    const aDice = Array(Math.min(3, af - 1)).fill(6);
    const dDice = Array(Math.min(2, df)).fill(1);
    const pairs = Math.min(aDice.length, dDice.length);
    df -= pairs;
    rounds.push({ aDice, dDice });
  }
  return rounds;
}

test('4P setup: round-robin territory deal (two seats get 11, two get 10) and 30 armies each', () => {
  const s = fourPlayerState();
  assert.equal(s.seats.length, 4);
  assert.deepEqual(s.setupPools, [30, 30, 30, 30]);
  assert.equal(s.hands.length, 4);
  const counts = [0, 0, 0, 0];
  for (const t of Object.values(s.territories)) counts[t.owner] += 1;
  assert.equal(counts.reduce((a, b) => a + b, 0), 42);
  assert.deepEqual([...counts].sort((a, b) => b - a), [11, 11, 10, 10]);
});

test('3P setup uses canonical 35 armies; 2P keeps the house 20', () => {
  const s3 = buildInitialState({ participants: participantsOf(3), rng: rngOf() });
  assert.deepEqual(s3.setupPools, [35, 35, 35]);
  const s2 = buildInitialState({ participants: participantsOf(2), rng: rngOf() });
  assert.deepEqual(s2.setupPools, [20, 20]);
  assert.equal(SETUP_ARMIES_BY_COUNT[4], 30);
});

test('5 participants are rejected', () => {
  assert.throws(() => buildInitialState({ participants: participantsOf(5), rng: rngOf() }), /2-4/);
});

test('setup deploys rotate through all four seats before reinforce', () => {
  let s = fourPlayerState();
  // E5-3: setup rotates in turn order starting from the roll-off winner, and
  // the first reinforce turn returns to that winner (not hardcoded seat 0).
  const first = firstPlayer(s);
  for (let step = 0; step < 4; step++) {
    const seat = (first + step) % 4;
    assert.equal(s.currentPlayer, seat);
    const owned = Object.keys(s.territories).find(id => s.territories[id].owner === seat);
    const r = applyRiskAction({
      state: s,
      action: { type: 'setup-deploy', payload: { placements: { [owned]: s.setupPools[seat] } } },
      actorId: userIdOf(s, seat),
      rng: rngOf(),
    });
    assert.equal(r.error, undefined, r.error);
    s = r.state;
  }
  assert.equal(s.phase, 'reinforce');
  assert.equal(s.currentPlayer, first);
  assert.ok(s.reinforcePool >= 3);
});

test('resign is rejected in a multiplayer game', () => {
  const s = riggedState({});
  const r = applyRiskAction({ state: s, action: { type: 'resign' }, actorId: userIdOf(s, 1), rng: rngOf() });
  assert.match(r.error, /resign is not supported in multiplayer/);
});

test('elimination: conqueror takes the victim cards and the seat is skipped in rotation', () => {
  // Seat 1 holds exactly one territory (brazil) with 2 defenders; seat 0
  // attacks from peru with overwhelming force. Seat 1 holds 3 cards.
  const s = riggedState({ brazil: { owner: 1, armies: 2 } });
  s.territories.peru = { owner: 0, armies: 10 };
  s.hands[1] = [
    { territory: 'alaska', type: 'infantry' },
    { territory: 'ural', type: 'cavalry' },
    { territory: null, type: 'wild' },
  ];
  const r = applyRiskAction({
    state: s,
    action: {
      type: 'attack',
      payload: { from: 'peru', to: 'brazil', resolved: { rounds: winningRounds(9, 2) } },
    },
    actorId: userIdOf(s, 0),
    rng: rngOf(),
  });
  assert.equal(r.error, undefined, r.error);
  const ns = r.state;
  assert.equal(ns.eliminated[1], true);
  assert.deepEqual(ns.eliminationOrder, [1]);
  assert.equal(ns.hands[0].length, 3, 'conqueror takes the cards');
  assert.equal(ns.hands[1].length, 0);
  assert.ok(ns.log.some(e => e.kind === 'eliminated' && e.player === 1 && e.by === 0 && e.cardsTaken === 3));
  assert.equal(ns.phase, 'attack', 'game continues with two live opponents left');

  // End-turn rotation must skip the dead seat (0 → 2, not 0 → 1).
  ns.phase = 'fortify';
  const r2 = applyRiskAction({ state: ns, action: { type: 'end-turn' }, actorId: userIdOf(ns, 0), rng: rngOf() });
  assert.equal(r2.error, undefined, r2.error);
  assert.equal(r2.state.currentPlayer, 2);
  assert.equal(r2.state.activeUserId, userIdOf(r2.state, 2));
});

test('last seat standing wins the multiplayer game', () => {
  // Seats 1 and 2 already eliminated; seat 3 holds one territory.
  const s = riggedState({ brazil: { owner: 3, armies: 1 } });
  s.eliminated = [false, true, true, false];
  s.eliminationOrder = [1, 2];
  s.territories.peru = { owner: 0, armies: 10 };
  const r = applyRiskAction({
    state: s,
    action: {
      type: 'attack',
      payload: { from: 'peru', to: 'brazil', resolved: { rounds: winningRounds(9, 1) } },
    },
    actorId: userIdOf(s, 0),
    rng: rngOf(),
  });
  assert.equal(r.error, undefined, r.error);
  assert.equal(r.state.phase, 'gameover');
  assert.equal(r.state.winner, 0);
  assert.equal(r.state.winnerSeat, 0);
  assert.equal(r.ended, true);
});

test('eliminated seats cannot act', () => {
  const s = riggedState({ brazil: { owner: 2, armies: 3 } });
  s.eliminated = [false, true, false, false];
  const r = applyRiskAction({
    state: s,
    action: { type: 'end-attack' },
    actorId: userIdOf(s, 1),
    rng: rngOf(),
  });
  assert.match(r.error, /eliminated/);
});

test('multiplayer pendingCombat defender is the territory owner, not "the other player"', () => {
  const s = riggedState({ brazil: { owner: 2, armies: 3 } });
  const r = applyRiskAction({
    state: s,
    action: { type: 'attack', payload: { from: 'peru', to: 'brazil', force: 2 } },
    actorId: userIdOf(s, 0),
    rng: rngOf(),
  });
  // peru defaults to owner 0/armies 3 from riggedState; attack intent path.
  assert.equal(r.error, undefined, r.error);
  assert.equal(r.state.pendingCombat.attackerIdx, 0);
  assert.equal(r.state.pendingCombat.defenderIdx, 2);
  assert.equal(r.state.activeUserId, userIdOf(r.state, 2), 'defender drives the dice');
  assert.equal(liveSeats(r.state).length, 4);
});

test('publicView exposes per-seat card counts and only the own hand', async () => {
  const { riskPublicView } = await import('../plugins/risk/server/view.js');
  const s = fourPlayerState();
  s.hands = [[{ territory: null, type: 'wild' }], [], [{ territory: 'peru', type: 'infantry' }, { territory: 'ural', type: 'cavalry' }], []];
  const v = riskPublicView({ state: s, viewerId: userIdOf(s, 2) });
  assert.equal(v.youAre, 2);
  assert.deepEqual(v.cardCounts, [1, 0, 2, 0]);
  assert.equal(v.hand.length, 2);
  assert.equal(v.hands, undefined, 'no raw hands in the view');
  assert.equal(v.deck, undefined);
});
