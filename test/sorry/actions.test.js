import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applySorryAction } from '../../plugins/sorry/server/actions.js';
import { legalMoves } from '../../plugins/sorry/server/rules/legal-moves.js';
import { START_EXIT, SLIDES, TRACK_LEN } from '../../plugins/sorry/server/geometry.js';

// =========================================================================
// Helpers — build deterministic states. We never go through buildInitialState
// (which draws from a shuffled deck); instead we hand-craft state so the
// drawn card, deck order, and pawn placements are fully controlled. This is
// the same placement style as test/sorry/slides.test.js.
// =========================================================================

const USER = { a: 'user-a', b: 'user-b' };

const startFour = () => Array.from({ length: 4 }, (_, i) => ({ id: i, zone: 'start', index: 0 }));

// Build a `{ a: [...], b: [...] }` pawn map. Every pawn defaults to Start;
// `placements` overrides specific pawns by id.
function makePawns(placements = {}) {
  const sides = { a: startFour(), b: startFour() };
  for (const [side, list] of Object.entries(placements)) {
    for (const p of list) sides[side][p.id] = { id: p.id, zone: p.zone, index: p.index };
  }
  return sides;
}

function makeState(overrides = {}) {
  const { pawns, ...rest } = overrides;
  const base = {
    sides: { a: USER.a, b: USER.b },
    pawns: pawns ?? makePawns(),
    deck: [],
    discard: [],
    drawnCard: 1,
    currentPlayer: 'a',
    winner: null,
    lastEvent: null,
    activeUserId: USER.a,
  };
  return { ...base, ...rest };
}

const move = (moveId) => ({ type: 'move', payload: { moveId } });

// Find the legal move matching a predicate and assert it exists (paranoia:
// a test that drives a move which isn't actually legal proves nothing).
function requireMove(state, predicate, label) {
  const m = legalMoves(state).find(predicate);
  assert.ok(m, `precondition: a legal ${label} move must exist for this state`);
  return m;
}

// A track square that is not the start of any slide (slide starts: 4, 9, 34, 39).
const NON_SLIDE = 13;

// =========================================================================
// Contract — export shape and return shape
// =========================================================================

test('contract: applySorryAction is an exported function', () => {
  assert.equal(typeof applySorryAction, 'function');
});

test('contract: a successful move returns { state, ended, summary } with no error', () => {
  const state = makeState({
    drawnCard: 1,
    deck: [2],
    pawns: makePawns(), // all in start; card 1 → out moves available
  });
  const m = requireMove(state, (x) => x.kind === 'out' && x.pawnId === 0, 'out');
  const result = applySorryAction({ state, action: move(m.id), actorId: USER.a });

  assert.equal(result.error, undefined, 'no error on a legal move');
  assert.ok(result.state, 'returns a new state');
  assert.equal(typeof result.ended, 'boolean', 'ended is a boolean');
  assert.ok(result.summary && typeof result.summary === 'object', 'summary is a structured object');
});

// =========================================================================
// AC1 — unknown/illegal moveId is rejected without mutation
// =========================================================================

test('AC1: an illegal moveId returns { error: "move is not legal" } and no state', () => {
  const state = makeState({ drawnCard: 1 });
  const before = structuredClone(state);
  const result = applySorryAction({ state, action: move('forward:0:99'), actorId: USER.a });

  assert.equal(result.error, 'move is not legal');
  assert.equal('state' in result, false, 'rejection carries no state key');
  assert.deepEqual(state, before, 'the original state object is not mutated');
});

// =========================================================================
// AC2 — out-of-turn / unknown actor rejected without mutation
// =========================================================================

test('AC2: an unknown participant returns { error: "unknown participant" } and no mutation', () => {
  const state = makeState({ drawnCard: 1 });
  const before = structuredClone(state);
  const result = applySorryAction({ state, action: move('out:0'), actorId: 'nobody' });

  assert.equal(result.error, 'unknown participant');
  assert.equal('state' in result, false);
  assert.deepEqual(state, before, 'no mutation on unknown participant');
});

test('AC2: acting out of turn returns { error: "not your turn" } and no mutation', () => {
  // currentPlayer is 'a', but USER.b (a known participant) tries to act.
  const state = makeState({ drawnCard: 1, currentPlayer: 'a' });
  const before = structuredClone(state);
  const result = applySorryAction({ state, action: move('out:0'), actorId: USER.b });

  assert.equal(result.error, 'not your turn');
  assert.equal('state' in result, false);
  assert.deepEqual(state, before, 'no mutation when acting out of turn');
});

// =========================================================================
// AC3 — out-move places pawn at START_EXIT and advances turn to opponent
//
// NOTE (conflict, see session Design Deviations): START_EXIT.a === 4, and
// SLIDES.b owns a slide starting at square 4 — i.e. a's exit square is a
// FOREIGN slide start for side a. resolveLanding would carry an 'a' pawn
// landing on 4 forward to (4+5)%60 = 9. AC3 nonetheless fixes the out pawn
// at index START_EXIT[side]. Story-context ACs are the higher authority, so
// this test pins index 4: the engine must treat `out` as a placement that
// does NOT run slide resolution.
// =========================================================================

test('AC3: a legal out move (card 1) places the pawn on track at START_EXIT and switches to opponent', () => {
  const state = makeState({
    drawnCard: 1,
    deck: [2], // opponent draws a 2 → has a legal out move → no auto-pass
    pawns: makePawns(),
  });
  const m = requireMove(state, (x) => x.kind === 'out' && x.pawnId === 0, 'out');
  const result = applySorryAction({ state, action: move(m.id), actorId: USER.a });

  assert.equal(result.error, undefined);
  const movedPawn = result.state.pawns.a[0];
  assert.equal(movedPawn.zone, 'track', 'out pawn is on the track');
  assert.equal(movedPawn.index, START_EXIT.a, 'out pawn sits at START_EXIT[side] (no slide on placement)');

  assert.equal(result.state.currentPlayer, 'b', 'card 1 is not a 2 → turn switches');
  assert.ok(result.state.discard.includes(1), 'the played card is discarded');
  assert.equal(result.state.drawnCard, 2, 'opponent draws the next card off the deck');
  assert.equal(result.state.activeUserId, USER.b, 'activeUserId mirrors the new current player');
});

// =========================================================================
// AC4 — card 2 keeps the same player (draw again)
// =========================================================================

test('AC4: playing a 2 keeps currentPlayer and draws again for the same side', () => {
  const state = makeState({
    drawnCard: 2,
    deck: [3], // same player draws a 3 next; they have a legal forward → no auto-pass
    pawns: makePawns(),
  });
  const m = requireMove(state, (x) => x.kind === 'out' && x.pawnId === 0, 'out');
  const result = applySorryAction({ state, action: move(m.id), actorId: USER.a });

  assert.equal(result.error, undefined);
  assert.equal(result.state.currentPlayer, 'a', 'card 2 → same player continues');
  assert.ok(result.state.discard.includes(2), 'the played 2 is discarded');
  assert.equal(result.state.drawnCard, 3, 'same player draws the next card');
  assert.equal(result.state.activeUserId, USER.a, 'activeUserId stays with the same player');
});

// =========================================================================
// AC5 — landing on an occupied track square bumps the occupant to Start
// =========================================================================

test('AC5: moving onto an opponent track pawn sends that pawn back to Start', () => {
  const state = makeState({
    drawnCard: 3,
    deck: [3], // opponent will have a forward move → avoid auto-pass noise
    pawns: makePawns({
      a: [{ id: 0, zone: 'track', index: 10 }],
      b: [
        { id: 1, zone: 'track', index: NON_SLIDE }, // 10 + 3 == 13, the landing square
        { id: 2, zone: 'track', index: 50 }, // keeps b in play so it has a legal move
      ],
    }),
  });
  const m = requireMove(
    state,
    (x) => x.kind === 'forward' && x.pawnId === 0 && x.to.index === NON_SLIDE,
    'forward onto the occupied square',
  );
  const result = applySorryAction({ state, action: move(m.id), actorId: USER.a });

  assert.equal(result.error, undefined);
  assert.equal(result.state.pawns.a[0].zone, 'track');
  assert.equal(result.state.pawns.a[0].index, NON_SLIDE, 'mover takes the landing square');

  const bumped = result.state.pawns.b[1];
  assert.equal(bumped.zone, 'start', 'bumped opponent pawn returns to Start');
  assert.equal(bumped.index, 0, 'bumped pawn index resets to 0');
});

// =========================================================================
// AC6 — Sorry! card removes target opponent pawn and places own pawn
// =========================================================================

test('AC6: a sorry move sends the target opponent pawn to Start and places own pawn there', () => {
  const TARGET_SQ = 20; // not a slide start
  const state = makeState({
    drawnCard: 'sorry',
    deck: [3],
    pawns: makePawns({
      a: [], // all of a in Start (default) → a sorry-eligible start pawn exists
      b: [
        { id: 0, zone: 'track', index: TARGET_SQ },
        { id: 1, zone: 'track', index: 50 }, // keep b with a future legal move
      ],
    }),
  });
  const m = requireMove(state, (x) => x.kind === 'sorry' && x.targetPawnId === 0, 'sorry');
  const result = applySorryAction({ state, action: move(m.id), actorId: USER.a });

  assert.equal(result.error, undefined);
  const target = result.state.pawns.b[0];
  assert.equal(target.zone, 'start', 'targeted opponent pawn is bumped to Start');
  assert.equal(target.index, 0);

  const placed = result.state.pawns.a[m.pawnId];
  assert.equal(placed.zone, 'track', 'acting pawn lands on the track');
  assert.equal(placed.index, TARGET_SQ, "acting pawn takes the target's former square");
});

// =========================================================================
// AC7 — win detection when all four of the acting side's pawns reach home
// =========================================================================

test('AC7: bringing the last pawn home ends the game with a scoreDelta for the winner', () => {
  const state = makeState({
    drawnCard: 1,
    pawns: makePawns({
      a: [
        { id: 0, zone: 'home', index: 0 },
        { id: 1, zone: 'home', index: 0 },
        { id: 2, zone: 'home', index: 0 },
        { id: 3, zone: 'safety', index: 4 }, // last safety square; +1 reaches home
      ],
    }),
  });
  const m = requireMove(
    state,
    (x) => x.kind === 'forward' && x.pawnId === 3 && x.to.zone === 'home',
    'forward into home',
  );
  const result = applySorryAction({ state, action: move(m.id), actorId: USER.a });

  assert.equal(result.error, undefined);
  assert.equal(result.ended, true, 'win sets ended: true');
  assert.deepEqual(result.scoreDelta, { [USER.a]: 1 }, 'winner receives a scoreDelta of 1');
  assert.equal(result.state.pawns.a[3].zone, 'home', 'the fourth pawn is home');
  assert.equal(result.state.winner, 'a', 'winner is recorded on the state');
  assert.equal(result.state.activeUserId, USER.a, 'activeUserId stays the winner so the host can attribute the win');
  assert.equal(result.summary.kind, 'win');
  assert.equal(result.summary.side, 'a');
});

// =========================================================================
// AC8 — auto-pass when the next player has no legal move for the drawn card
// =========================================================================

test('AC8: a drawn card the next player cannot use is auto-passed back', () => {
  const state = makeState({
    drawnCard: 3, // a moves a track pawn forward 3
    deck: [5, 2], // b draws 5 (no pawns out → no legal move → auto-pass), then a draws 2
    pawns: makePawns({
      a: [{ id: 0, zone: 'track', index: 10 }],
      // b: all in Start; card 5 yields neither an out (5 ≠ 1,2) nor a forward → empty
    }),
  });
  const m = requireMove(state, (x) => x.kind === 'forward' && x.pawnId === 0, 'forward');
  const result = applySorryAction({ state, action: move(m.id), actorId: USER.a });

  assert.equal(result.error, undefined);
  assert.equal(result.state.currentPlayer, 'a', 'b had no move for the 5 → turn bounces back to a');
  assert.equal(result.state.drawnCard, 2, 'the unusable 5 is skipped; a faces the next card');
  assert.ok(result.state.discard.includes(3), 'the played card is discarded');
  assert.ok(result.state.discard.includes(5), 'the auto-passed card is discarded, not left as drawnCard');
  assert.equal(result.state.activeUserId, USER.a, 'activeUserId mirrors the resolved current player');
});

// =========================================================================
// AC9 — activeUserId is always consistent with currentPlayer on non-win returns
// =========================================================================

test('AC9: every non-error, non-win return has activeUserId === sides[currentPlayer]', () => {
  const state = makeState({
    drawnCard: 1,
    deck: [3],
    pawns: makePawns(),
  });
  const m = requireMove(state, (x) => x.kind === 'out' && x.pawnId === 0, 'out');
  const result = applySorryAction({ state, action: move(m.id), actorId: USER.a });

  assert.equal(result.error, undefined);
  assert.equal(result.ended, false);
  assert.equal(
    result.state.activeUserId,
    result.state.sides[result.state.currentPlayer],
    'the orchestrator gate invariant must hold on every ordinary transition',
  );
});

// =========================================================================
// Inherited finding #1 (E3-3 review) — mover-exclusion contract
//
// A pawn whose own move lands it on a FOREIGN slide start must slide to
// finalIndex and must NOT appear in its own bump list (no self-bump).
// =========================================================================

test('finding#1: a mover landing on a foreign slide start slides to finalIndex and is not self-bumped', () => {
  const slide = SLIDES.b[0]; // owned by b → foreign to a → triggers for an 'a' mover
  const slideStart = slide.start; // 39
  const finalIndex = (slide.start + slide.length) % TRACK_LEN; // 43
  const origin = slideStart - 3; // 36 — a forward-3 lands exactly on the slide start
  const sweptVictim = slideStart + 2; // an opponent pawn caught mid-slide

  const state = makeState({
    drawnCard: 3,
    deck: [3],
    pawns: makePawns({
      a: [{ id: 0, zone: 'track', index: origin }],
      b: [
        { id: 1, zone: 'track', index: sweptVictim },
        { id: 2, zone: 'track', index: 50 }, // keeps b with a legal move afterward
      ],
    }),
  });
  const m = requireMove(
    state,
    (x) => x.kind === 'forward' && x.pawnId === 0 && x.to.index === slideStart,
    'forward onto a foreign slide start',
  );
  const result = applySorryAction({ state, action: move(m.id), actorId: USER.a });

  assert.equal(result.error, undefined);
  const mover = result.state.pawns.a[0];
  assert.equal(mover.zone, 'track', 'mover stays on the track');
  assert.equal(mover.index, finalIndex, 'mover is carried to the slide end, not its self-bumped Start');
  assert.notEqual(mover.zone, 'start', 'the mover must never self-bump back to Start');

  // The genuine victim swept by the slide is still bumped.
  assert.equal(result.state.pawns.b[1].zone, 'start', 'opponent pawn in the swept path is bumped');
});

// =========================================================================
// Inherited finding #2 (E3-3 review) — caller owns the trust boundary
//
// Validation (actor / turn / legality) happens BEFORE any slide resolution,
// so a rejected action never reaches resolveLanding and never mutates state.
// An unrecognized action type is likewise rejected cleanly.
// =========================================================================

test('finding#2: an unknown action type is rejected with an error and no mutation', () => {
  const state = makeState({ drawnCard: 1 });
  const before = structuredClone(state);
  const result = applySorryAction({ state, action: { type: 'teleport', payload: {} }, actorId: USER.a });

  assert.ok(result.error, 'an unrecognized action type yields an error');
  assert.equal('state' in result, false, 'no state is produced for an unknown action');
  assert.deepEqual(state, before, 'unknown action does not mutate state');
});
