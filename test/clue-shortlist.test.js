// E6-4 Task 3 — bounded, difficulty-capped, sub-state-aware shortlist.
//
// Contract (AC #2 + plan Task 3): bounded (<= caps), unique ids, never
// empty, accuse gated strictly on a solved tracker, a VALUES-LESS roll
// intent (dice-are-client-side doctrine), only shipped actions (never raw
// enterRoom), and every emitted action must validate through the real
// reducers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildClueShortlist } from '../plugins/clue/server/ai/shortlist.js';
import { buildTracker } from '../plugins/clue/server/ai/knowledge.js';
import { applyClueAction } from '../plugins/clue/server/actions.js';
import { legalMoves } from '../plugins/clue/server/rules/movement.js';
import {
  miniGeo, topOfTurnState, movementState, suggestState, accusePassState,
  poison, SOLUTION,
} from './_helpers/clue-fixtures.js';

const SHORTLIST_CAP = 6;
const MOVE_CAP = 4;
const SUGGEST_CAP = 4;

function build(state, { geo, seat = 0 } = {}) {
  const tracker = buildTracker({ state, seat });
  return buildClueShortlist({ state, geo, seat, tracker });
}

// Every entry must be a shipped, applicable action. 'roll' is exempt: the
// intent is values-less by design and only the client's roll{value} POST is
// applicable (F8 contract).
function assertAllApplicable(state, shortlist, geo) {
  for (const e of shortlist) {
    if (e.action.type === 'roll') continue;
    const r = applyClueAction({
      state: structuredClone(state), action: e.action, actorId: state.seats[0], geo,
    });
    assert.equal(r.error, undefined, `entry '${e.id}' must apply cleanly: ${r.error}`);
  }
}

const FIXTURES = () => [
  ['top-of-turn corridor', topOfTurnState(), miniGeo()],
  ['top-of-turn in passage room', topOfTurnState({ inRoom: 'ra' }), miniGeo()],
  ['movement', movementState({ pendingRoll: 3 }), miniGeo()],
  ['movement blocked-in', movementState({ pendingRoll: 6, blocked: true }), miniGeo()],
  ['suggest', suggestState(), undefined],
  ['accuse-or-pass unsolved', accusePassState({ solved: false }), undefined],
  ['accuse-or-pass solved', accusePassState({ solved: true }), undefined],
];

test('every sub-state: bounded, unique ids, never empty', () => {
  for (const [name, state, geo] of FIXTURES()) {
    const sl = build(state, { geo });
    assert.ok(Array.isArray(sl) && sl.length >= 1, `${name}: non-empty`);
    assert.ok(sl.length <= SHORTLIST_CAP, `${name}: within SHORTLIST_CAP`);
    assert.equal(new Set(sl.map((e) => e.id)).size, sl.length, `${name}: ids unique`);
    for (const e of sl) {
      assert.equal(typeof e.id, 'string');
      assert.equal(typeof e.slot, 'string');
      assert.equal(typeof e.summary, 'string');
      assert.equal(typeof e.action?.type, 'string', `${name}: entry '${e.id}' carries an action`);
    }
  }
});

test('every sub-state: never emits a raw enterRoom action', () => {
  for (const [name, state, geo] of FIXTURES()) {
    const sl = build(state, { geo });
    assert.equal(
      sl.some((e) => e.action.type === 'enterRoom'), false,
      `${name}: enterRoom is the F7 cheat vector — bots move via move/secretPassage`,
    );
  }
});

test('every emitted action validates through the real reducers', () => {
  for (const [name, state, geo] of FIXTURES()) {
    const sl = build(state, { geo });
    assert.ok(sl.length >= 1, name);
    assertAllApplicable(state, sl, geo);
  }
});

test('top of turn: the roll slot is a VALUES-LESS intent', () => {
  const state = topOfTurnState();
  const sl = build(state, { geo: miniGeo() });
  const roll = sl.find((e) => e.slot === 'roll');
  assert.ok(roll, 'a roll option is offered at top of turn');
  assert.equal(roll.id, 'roll');
  assert.equal(roll.action.type, 'roll');
  assert.equal(roll.action.payload?.value, undefined, 'the bot NEVER materialises a die value');
});

test('top of turn: secret-passage offered only from a passage room', () => {
  const inRoom = build(topOfTurnState({ inRoom: 'ra' }), { geo: miniGeo() });
  const corridor = build(topOfTurnState(), { geo: miniGeo() });
  const sp = inRoom.find((e) => e.action.type === 'secretPassage');
  assert.ok(sp, 'passage room offers the secretPassage leap');
  assert.equal(corridor.some((e) => e.action.type === 'secretPassage'), false);
});

test('accuse is offered ONLY when the tracker has certainly solved the envelope', () => {
  const unsolved = build(accusePassState({ solved: false }));
  const solved = build(accusePassState({ solved: true }));
  assert.equal(unsolved.some((e) => e.slot === 'accuse'), false);
  const accuse = solved.find((e) => e.slot === 'accuse');
  assert.ok(accuse, 'solved tracker offers accuse');
  assert.equal(accuse.action.type, 'accuse');
  assert.deepEqual(accuse.action.payload, SOLUTION, 'accusation is the tracker solution');
});

test('accuse-or-pass always offers pass; top-of-turn solved offers accuse too', () => {
  for (const solved of [false, true]) {
    const sl = build(accusePassState({ solved }));
    assert.ok(sl.some((e) => e.action.type === 'pass'), `pass available (solved=${solved})`);
  }
  const top = build(topOfTurnState({ solved: true }), { geo: miniGeo() });
  assert.ok(top.some((e) => e.slot === 'accuse'), 'a solved bot may accuse without rolling');
});

test('movement: bounded by MOVE_CAP and every destination is legal', () => {
  const state = movementState({ pendingRoll: 3 });
  const geo = miniGeo();
  const sl = build(state, { geo });
  const moves = sl.filter((e) => e.action.type === 'move');
  assert.ok(moves.length >= 1, 'a rolled bot is offered moves');
  assert.ok(moves.length <= MOVE_CAP);
  const { squares, rooms } = legalMoves(state, geo, 0);
  const squareSet = new Set(squares.map(([c, r]) => `${c},${r}`));
  for (const e of moves) {
    const { square, room } = e.action.payload ?? {};
    if (room != null) {
      assert.ok(rooms.includes(room), `room '${room}' is reachable`);
    } else {
      assert.ok(Array.isArray(square) && squareSet.has(`${square[0]},${square[1]}`),
        `square ${JSON.stringify(square)} is reachable`);
    }
  }
});

test('movement blocked-in: menu falls back to a legal action instead of emptying', () => {
  const state = movementState({ pendingRoll: 6, blocked: true });
  const geo = miniGeo();
  assert.deepEqual(legalMoves(state, geo, 0), { squares: [], rooms: [] }); // truly stuck
  const sl = build(state, { geo });
  assert.ok(sl.length >= 1, 'never empty even with zero legal moves');
  assertAllApplicable(state, sl, geo);
});

test('suggest: capped, in-room only, diverse slots, info-max present', () => {
  const state = suggestState({ room: 'hall' });
  const sl = build(state);
  const suggests = sl.filter((e) => e.action.type === 'suggest');
  assert.ok(suggests.length >= 1);
  assert.ok(suggests.length <= SUGGEST_CAP);
  for (const e of suggests) {
    assert.equal(e.action.payload.room, 'hall', 'must suggest the room the pawn is in');
  }
  assert.ok(new Set(suggests.map((e) => e.slot)).size >= 2, 'menu offers distinct probe styles');

  const tracker = buildTracker({ state, seat: 0 });
  const infoMax = suggests.find((e) => e.slot === 'info-max');
  assert.ok(infoMax, 'an info-max probe is offered');
  assert.ok(tracker.unseenSuspects().includes(infoMax.action.payload.suspect),
    'info-max names an unseen suspect');
  assert.ok(tracker.unseenWeapons().includes(infoMax.action.payload.weapon),
    'info-max names an unseen weapon');
});

test('shortlist reads only own info + public state (poison invariance)', () => {
  for (const [name, state, geo] of FIXTURES()) {
    const clean = build(state, { geo });
    const dirty = buildClueShortlist({
      state: poison(state), geo, seat: 0,
      tracker: buildTracker({ state: poison(state), seat: 0 }),
    });
    assert.deepEqual(dirty, clean, `${name}: envelope/other-hand poison must not change the menu`);
  }
});
