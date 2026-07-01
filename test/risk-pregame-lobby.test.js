// E5-3 — Pre-game lobby: pick colors + roll-off for turn order.
//
// RED tests for the two server-side seams of the story:
//   A. Roll-off for turn order — the first player is chosen by a seeded d6
//      roll-off recorded on state (`turnOrderRolls`), not hardcoded to seat 0.
//   B. Colours decoupled from seat — state carries a per-seat `colors` array
//      (palette-slot index per seat) that defaults to the canonical palette and
//      can be overridden by a per-participant pick before the game starts.
//
// The client half (colour-picker UI location in the gamebox shell, themes.ts
// rewiring, cross-surface rendering) is intentionally NOT covered here — it is
// flagged in the session Delivery Findings as a candidate split (E5-3b), being
// client-only, inert-until-build, and dependent on shell discovery.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildInitialState,
  SETUP_ARMIES_BY_COUNT,
  firstPlayer,
} from '../plugins/risk/server/state.js';
import { applyRiskAction } from '../plugins/risk/server/actions.js';
import { riskPublicView } from '../plugins/risk/server/view.js';

// Deterministic cycling rng, matching the style of risk-state.test.js.
function rngFrom(seq) { let i = 0; return () => seq[i++ % seq.length]; }

// A varied 20-value sequence: long enough that the territory shuffle, deck
// shuffle, and any roll-off all draw distinct-looking values from the cycle.
const SEED_A = [
  0.31, 0.72, 0.13, 0.94, 0.55, 0.06, 0.87, 0.28, 0.49, 0.61,
  0.02, 0.77, 0.38, 0.19, 0.90, 0.41, 0.63, 0.24, 0.85, 0.16,
];

// Deterministic seed generator for sweep tests (no Math.random — reproducible).
function seed(k) {
  const a = [];
  for (let j = 0; j < 12; j++) a.push(((k * 7 + j * 13 + 3) % 97) / 97);
  return a;
}

const THREE = [{ userId: 11, seat: 0 }, { userId: 22, seat: 1 }, { userId: 33, seat: 2 }];
function threeP(rng, participants = THREE) {
  return buildInitialState({ participants, rng });
}

// Territory ownership captured from PRE-roll-off code for SEED_A + THREE. The
// roll-off must consume rng AFTER the territory shuffle + deck build so this
// split stays byte-identical (AC5: territory dealing unchanged).
const GOLDEN_OWNERS = {
  scandinavia: 0, irkutsk: 1, ural: 2, yakutsk: 0, brazil: 1, southern_europe: 2,
  ukraine: 0, argentina: 1, siberia: 2, east_africa: 0, cent_am: 1, middle_east: 2,
  eastern_us: 0, egypt: 1, ontario: 2, eastern_australia: 0, nwt: 1, china: 2,
  western_europe: 0, indonesia: 1, great_britain: 2, south_africa: 0, alberta: 1,
  japan: 2, western_us: 0, afghanistan: 1, western_australia: 2, madagascar: 0,
  new_guinea: 1, peru: 2, congo: 0, alaska: 1, siam: 2, northern_europe: 0,
  venezuela: 1, mongolia: 2, greenland: 0, north_africa: 1, india: 2, quebec: 0,
  kamchatka: 1, iceland: 2,
};

// ── A. Roll-off for turn order ───────────────────────────────────────────────

test('roll-off records a d6 roll for every seat', () => {
  const s = threeP(rngFrom(SEED_A));
  assert.ok(Array.isArray(s.turnOrderRolls), 'state.turnOrderRolls should be an array');
  assert.equal(s.turnOrderRolls.length, 3, 'one roll per seat');
  assert.ok(
    s.turnOrderRolls.every(r => Number.isInteger(r) && r >= 1 && r <= 6),
    `each roll is a d6 face (1-6); got ${JSON.stringify(s.turnOrderRolls)}`,
  );
});

test('first player is a top roller, not hardcoded to seat 0', () => {
  const s = threeP(rngFrom(SEED_A));
  const rolls = s.turnOrderRolls;
  const max = Math.max(...rolls);
  assert.equal(rolls[s.currentPlayer], max, 'currentPlayer must hold the highest roll');
  assert.ok(rolls.every(r => r <= rolls[s.currentPlayer]), 'no seat may out-roll the winner');
});

test('activeUserId follows the roll-off winner for every seat (0 is a valid winner)', () => {
  // Guards lang-review #4: currentPlayer === 0 is a legitimate, common outcome.
  // A `winner || fallback` or truthy check would silently mishandle seat 0.
  let sawZero = false;
  let sawNonZero = false;
  for (let k = 0; k < 16; k++) {
    const s = threeP(rngFrom(seed(k)));
    assert.ok(
      Number.isInteger(s.currentPlayer) && s.currentPlayer >= 0 && s.currentPlayer < 3,
      `currentPlayer must be a valid seat index; got ${s.currentPlayer}`,
    );
    assert.equal(
      s.activeUserId, s.seats[s.currentPlayer],
      'activeUserId must equal the winning seat’s userId, even when the winner is seat 0',
    );
    if (s.currentPlayer === 0) sawZero = true;
    if (s.currentPlayer !== 0) sawNonZero = true;
  }
  assert.ok(sawNonZero, 'roll-off must be able to pick a first player other than seat 0');
  assert.ok(sawZero, 'roll-off must still let seat 0 win when it rolls highest');
});

test('roll-off is deterministic for a fixed seed', () => {
  const a = threeP(rngFrom(SEED_A));
  const b = threeP(rngFrom(SEED_A));
  assert.ok(Array.isArray(a.turnOrderRolls), 'rolls must be recorded to compare');
  assert.deepEqual(a.turnOrderRolls, b.turnOrderRolls, 'same seed → same rolls');
  assert.equal(a.currentPlayer, b.currentPlayer, 'same seed → same first player');
  assert.equal(a.activeUserId, b.activeUserId, 'same seed → same active user');
});

test('roll-off leaves territory dealing, setup pools and army counts unchanged (AC5)', () => {
  // Regression guard: golden captured from pre-roll-off code. If the roll-off
  // consumes rng before the territory shuffle, this split shifts and fails.
  const s = threeP(rngFrom(SEED_A));
  const owners = Object.fromEntries(
    Object.entries(s.territories).map(([id, t]) => [id, t.owner]),
  );
  assert.deepEqual(owners, GOLDEN_OWNERS, 'territory ownership must be unchanged by the roll-off');
  assert.equal(Object.keys(s.territories).length, 42);
  assert.ok(Object.values(s.territories).every(t => t.armies === 1), 'one army per territory');
  assert.deepEqual(
    s.setupPools, Array(3).fill(SETUP_ARMIES_BY_COUNT[3]),
    'setup pools unchanged',
  );
});

test('the roll-off winner takes the first reinforce turn, not seat 0 (AC5 end-to-end)', () => {
  // SEED_A gives a non-seat-0 winner (seat 2). Drive setup to completion and
  // confirm the first real turn returns to the winner — the old engine reset
  // currentPlayer to seat 0 here, silently nullifying the roll-off after setup.
  let s = threeP(rngFrom(SEED_A));
  const winner = firstPlayer(s);
  assert.notEqual(winner, 0, 'this seed must exercise a non-seat-0 winner');
  for (let step = 0; step < 3; step++) {
    const seat = (winner + step) % 3;
    assert.equal(s.currentPlayer, seat, 'setup rotates in turn order starting from the winner');
    const owned = Object.keys(s.territories).find(id => s.territories[id].owner === seat);
    const r = applyRiskAction({
      state: s, actorId: s.seats[seat],
      action: { type: 'setup-deploy', payload: { placements: { [owned]: s.setupPools[seat] } } },
    });
    assert.equal(r.error, undefined, r.error);
    s = r.state;
  }
  assert.equal(s.phase, 'reinforce');
  assert.equal(s.currentPlayer, winner, 'first reinforce turn belongs to the roll-off winner');
  assert.equal(s.activeUserId, s.seats[winner], 'active user follows the winner into reinforce');
});

// ── B. Colours decoupled from seat ───────────────────────────────────────────

test('colours default to the canonical seat palette when unchosen (AC2)', () => {
  const s = threeP(rngFrom(SEED_A));
  assert.ok(Array.isArray(s.colors), 'state.colors should be a per-seat array');
  assert.equal(s.colors.length, 3, 'one colour slot per seat');
  // Identity mapping: seat i occupies palette slot i (its historical colour),
  // so an unconfigured game renders exactly as before.
  assert.deepEqual(s.colors, [0, 1, 2], 'default is the identity seat→palette mapping');
});

test('a player can pick a colour other than their seat default before the game (AC1)', () => {
  const s = threeP(rngFrom(SEED_A), [
    { userId: 11, seat: 0, color: 2 }, // seat 0 picks palette slot 2 (Green)
    { userId: 22, seat: 1 },           // seat 1 keeps its default
    { userId: 33, seat: 2, color: 0 }, // seat 2 picks palette slot 0 (Red)
  ]);
  assert.equal(s.colors[0], 2, 'seat 0 took the chosen slot');
  assert.equal(s.colors[1], 1, 'seat 1 kept its default slot');
  assert.equal(s.colors[2], 0, 'seat 2 took the chosen slot');
  assert.notEqual(s.colors[0], 0, 'seat 0 is no longer locked to its seat-index colour');
});

test('an out-of-range colour pick is sanitised to a valid palette slot (lang-review #11)', () => {
  // User input must be validated: a garbage pick must not produce an invalid
  // palette slot (which would render an undefined colour on the board/dice).
  const s = threeP(rngFrom(SEED_A), [
    { userId: 11, seat: 0, color: 99 },   // out of range
    { userId: 22, seat: 1, color: -1 },   // out of range
    { userId: 33, seat: 2, color: 'red' } // wrong type
  ]);
  assert.ok(Array.isArray(s.colors), 'colors still produced despite bad input');
  assert.ok(
    s.colors.every(c => Number.isInteger(c) && c >= 0 && c <= 3),
    `every colour must be a valid palette slot 0-3; got ${JSON.stringify(s.colors)}`,
  );
});

// ── C. View seam: lobby data must reach the client ──────────────────────────

test('public view surfaces the roll-off and colours (AC4 + AC1 plumbing)', () => {
  const s = threeP(rngFrom(SEED_A));
  const v = riskPublicView({ state: s, viewerId: 11 });
  assert.ok(Array.isArray(v.turnOrderRolls), 'view must expose turnOrderRolls (not stripped as private)');
  assert.deepEqual(v.turnOrderRolls, s.turnOrderRolls, 'view rolls match state');
  assert.equal(v.currentPlayer, s.currentPlayer, 'view first player matches state');
  assert.ok(Array.isArray(v.colors), 'view must expose colors');
  assert.deepEqual(v.colors, s.colors, 'view colours match state');
});
