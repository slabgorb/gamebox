import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { riskPublicView } from '../plugins/risk/server/view.js';
import { CONTINENTS } from '../plugins/risk/server/map.js';

// E5-6 RED: `reinforcePool` is a bare number. This story surfaces an itemized
// muster — `reinforceBreakdown: { base, continents:[{name,armies}], tradeIn?,
// territoryBonus?:{territory,armies} }` — on the public view. Presentation over
// data the engine already holds (base/continent math from ownership, the set
// bonus folded into the pool, and E5-2's `bonusTerritory` on the trade-in log
// entry). These tests fail until view.js computes the breakdown.

// Build a full 42-territory board owned by player 1, then hand the listed ids
// to player 0. A COMPLETE board is required: continent detection reads
// `t.owner` for every territory in a continent and would throw on a gap.
function fullBoard(ownedByZero = []) {
  const territories = {};
  for (const c of Object.values(CONTINENTS)) {
    for (const id of c.territories) territories[id] = { owner: 1, armies: 1 };
  }
  for (const id of ownedByZero) territories[id] = { owner: 0, armies: 1 };
  return territories;
}

const SA = CONTINENTS.samerica.territories;   // 4 ids, bonus 2
const AFRICA = CONTINENTS.africa.territories;  // 6 ids, bonus 3

// A reinforce-phase state for player 0. `pool` is the reinforcePool the engine
// would have already set (base + continents, plus any set bonus a trade-in
// folded in). `log` defaults to a lone end-turn marking the muster's start.
function reinforceState({ ownedByZero = [], pool, log } = {}) {
  return {
    sides: { a: 7, b: 8 },
    phase: 'reinforce',
    currentPlayer: 0,
    reinforcePool: pool,
    territories: fullBoard(ownedByZero),
    log: log ?? [{ kind: 'end-turn', next: 0 }],
  };
}

const view = (state) => riskPublicView({ state, viewerId: 7 });
const contArmies = (b) => b.continents.reduce((sum, c) => sum + c.armies, 0);

// ── AC-1: the itemized breakdown exists ──────────────────────────────────────

test('AC-1: the reinforce-phase view exposes an itemized reinforceBreakdown', () => {
  const b = view(reinforceState({ ownedByZero: SA, pool: 5 })).reinforceBreakdown;
  assert.ok(b, 'reinforceBreakdown is present during the reinforce phase');
  assert.equal(typeof b.base, 'number', 'base is a number');
  assert.ok(Array.isArray(b.continents), 'continents is an array');
});

// ── base math: max(3, floor(owned/3)) ────────────────────────────────────────

test('base floors to 3 for a small holding and excludes continent bonuses', () => {
  // 5 scattered territories, no full continent: floor(5/3)=1 -> max(3,1)=3.
  const owned = ['alaska', 'brazil', 'egypt', 'ural', 'indonesia'];
  const b = view(reinforceState({ ownedByZero: owned, pool: 3 })).reinforceBreakdown;
  assert.equal(b.base, 3);
  assert.deepEqual(b.continents, [], 'no fully-owned continent -> no continent lines');
});

test('base scales at one army per three territories above the floor', () => {
  // 12 territories, two from each continent -> none complete -> floor(12/3)=4.
  const owned = [
    'alaska', 'nwt', 'venezuela', 'brazil', 'iceland', 'scandinavia',
    'north_africa', 'egypt', 'ural', 'siberia', 'indonesia', 'new_guinea',
  ];
  const b = view(reinforceState({ ownedByZero: owned, pool: 4 })).reinforceBreakdown;
  assert.equal(b.base, 4, 'floor(12/3) = 4');
  assert.deepEqual(b.continents, []);
});

// ── AC-3: continents are named lines, not folded into base ────────────────────

test('AC-3: a fully held continent shows as a named line, not folded into base', () => {
  // All 6 of Africa: owned=6 -> base max(3, floor(6/3)=2) = 3; Africa bonus = 3.
  const b = view(reinforceState({ ownedByZero: AFRICA, pool: 6 })).reinforceBreakdown;
  assert.equal(b.base, 3, 'the continent bonus is NOT folded into base');
  assert.deepEqual(b.continents, [{ name: 'Africa', armies: 3 }]);
});

test('AC-3: multiple held continents each get their own named line', () => {
  // Africa (6) + South America (4) = 10 owned -> base floor(10/3)=3.
  const b = view(reinforceState({ ownedByZero: [...AFRICA, ...SA], pool: 8 })).reinforceBreakdown;
  assert.equal(b.base, 3);
  const byName = Object.fromEntries(b.continents.map((c) => [c.name, c.armies]));
  assert.deepEqual(byName, { Africa: 3, 'South America': 2 });
  assert.equal(b.continents.length, 2, 'exactly the two held continents');
});

// ── AC-2: the pool components sum to reinforcePool ───────────────────────────

test('AC-2: base + continent bonuses sum to the pool when no set was traded', () => {
  const state = reinforceState({ ownedByZero: [...AFRICA, ...SA], pool: 8 });
  const b = view(state).reinforceBreakdown;
  assert.equal(b.base + contArmies(b), state.reinforcePool, 'components add up to the pool');
  assert.equal(b.tradeIn ?? undefined, undefined, 'no trade-in line when none was traded this muster');
});

test('AC-2 + AC-5: a trade-in adds a set-bonus line; the +2 placement is shown separately and is NOT in the pool sum', () => {
  // Africa held: base 3 + continent 3 = 6. A first trade-in this muster
  // (tradeBonus(0) = 4) lifts the pool to 10, and the matched set dropped +2
  // on egypt (an owned Africa territory), recorded by E5-2 on the log entry.
  const log = [
    { kind: 'end-turn', next: 0 },
    { kind: 'trade-in', player: 0, bonusTerritory: 'egypt', bonusArmies: 2 },
  ];
  const state = reinforceState({ ownedByZero: AFRICA, pool: 10, log });
  const b = view(state).reinforceBreakdown;
  assert.equal(b.base, 3);
  assert.deepEqual(b.continents, [{ name: 'Africa', armies: 3 }]);
  assert.equal(b.tradeIn, 4, 'the escalating set bonus for this muster');
  assert.equal(b.base + contArmies(b) + b.tradeIn, state.reinforcePool, 'pool components sum to the pool');
  assert.deepEqual(b.territoryBonus, { territory: 'egypt', armies: 2 }, 'the +2 placement is itemized separately');
});

// ── AC-5: territory line reads E5-2 data and is absent cleanly otherwise ──────

test('AC-5: a trade-in with no owned-territory match shows the set bonus but no territory line', () => {
  const log = [
    { kind: 'end-turn', next: 0 },
    { kind: 'trade-in', player: 0 }, // no match fired -> no bonusTerritory recorded
  ];
  const b = view(reinforceState({ ownedByZero: AFRICA, pool: 10, log })).reinforceBreakdown;
  assert.equal(b.tradeIn, 4, 'the set bonus is still itemized');
  assert.equal(b.territoryBonus ?? undefined, undefined, 'no territory line when no +2 fired');
});

test('AC-5: a trade-in from a previous turn does not leak into the current muster', () => {
  // Last turn a set was traded (+2 on egypt), the player deployed and the turn
  // ended. The current muster has NO trade-in — neither the set line nor the
  // stale territory line may appear.
  const log = [
    { kind: 'trade-in', player: 0, bonusTerritory: 'egypt', bonusArmies: 2 },
    { kind: 'deploy', player: 0, placements: {} },
    { kind: 'end-turn', next: 0 }, // the current muster starts here
  ];
  const state = reinforceState({ ownedByZero: AFRICA, pool: 6, log }); // 3 base + 3 continent, no trade
  const b = view(state).reinforceBreakdown;
  assert.equal(b.tradeIn ?? undefined, undefined, 'no set line: nothing traded this muster');
  assert.equal(b.territoryBonus ?? undefined, undefined, 'no stale territory line from last turn');
  assert.equal(b.base + contArmies(b), state.reinforcePool);
});

// ── phase scoping & client-safety ────────────────────────────────────────────

test('the breakdown is scoped to the reinforce phase; other phases omit it', () => {
  const state = reinforceState({ ownedByZero: AFRICA, pool: 6 });
  state.phase = 'attack';
  assert.equal(view(state).reinforceBreakdown ?? undefined, undefined,
    'no muster breakdown outside the reinforce phase');
});

test('continents is always an array so the client can map it without a guard', () => {
  const b = view(reinforceState({ ownedByZero: ['alaska'], pool: 3 })).reinforceBreakdown;
  assert.ok(Array.isArray(b.continents) && b.continents.length === 0,
    'an empty continent list is [] not undefined');
});

// ── AC-4: the itemized muster is wired to the client ─────────────────────────

test('AC-4: the RiskView contract declares reinforceBreakdown', () => {
  const root = resolve(import.meta.dirname, '..');
  const contract = readFileSync(resolve(root, 'src/clients/shared/contracts/risk.ts'), 'utf8');
  assert.match(contract, /reinforceBreakdown/, 'the client contract exposes the breakdown field');
});

test('AC-4: a reinforce-UI source consumes reinforceBreakdown (itemized muster, not the bare pool)', () => {
  const dir = resolve(import.meta.dirname, '..', 'src/clients/risk');
  const sources = readdirSync(dir).filter((f) => /\.(tsx|ts)$/.test(f));
  const hit = sources.some((f) => readFileSync(resolve(dir, f), 'utf8').includes('reinforceBreakdown'));
  assert.ok(hit, 'a client source renders the itemized breakdown');
});
