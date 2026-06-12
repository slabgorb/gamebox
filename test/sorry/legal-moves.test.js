import { test } from 'node:test';
import assert from 'node:assert/strict';
import { legalMoves } from '../../plugins/sorry/server/rules/legal-moves.js';
import { path, START_EXIT } from '../../plugins/sorry/server/geometry.js';
import { baseState } from '../_helpers/sorry-fixtures.js';

// --- helpers -------------------------------------------------------------

// Position of a path square id within side a's ordered path (for expected math).
const PA = path('a');
const idxOf = (sq) => PA.indexOf(sq);

// =========================================================================
// AC1 — legalMoves is exported, pure, and always returns an array
// =========================================================================

test('AC1: legalMoves is a function exported from rules/legal-moves.js', () => {
  assert.equal(typeof legalMoves, 'function');
});

test('AC1: returns an array for a valid state', () => {
  const moves = legalMoves(baseState({ drawnCard: 1 }));
  assert.ok(Array.isArray(moves), 'legalMoves must return an array');
});

test('AC1: returns an empty array (not null/undefined) when no move is possible', () => {
  // Card 3 with every pawn in Start: nothing to move, no out-privilege.
  const moves = legalMoves(baseState({ drawnCard: 3 }));
  assert.ok(Array.isArray(moves));
  assert.equal(moves.length, 0);
});

test('AC1: does not mutate the input state (pure function)', () => {
  const state = baseState({ drawnCard: 7 });
  state.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
  state.pawns.a[1] = { id: 1, zone: 'track', index: 20 };
  const before = structuredClone(state);
  legalMoves(state);
  assert.deepEqual(state, before, 'state must be untouched after enumeration');
});

test('AC1: every returned move carries a stable string id and a kind', () => {
  const state = baseState({ drawnCard: 1 });
  const moves = legalMoves(state);
  const ids = moves.map((m) => m.id);
  for (const m of moves) {
    assert.equal(typeof m.id, 'string');
    assert.ok(m.id.length > 0, 'id must be a non-empty string');
    assert.ok(
      ['out', 'forward', 'back', 'split', 'swap', 'sorry'].includes(m.kind),
      `unexpected kind: ${m.kind}`,
    );
  }
  assert.equal(new Set(ids).size, ids.length, 'move ids must be unique within the legal set');
});

// =========================================================================
// AC2 — cards 1 & 2: out moves for Start pawns (+ forward for track/safety)
// =========================================================================

test('AC2: card 1 from all-in-start yields only out-moves to startExit', () => {
  const moves = legalMoves(baseState({ drawnCard: 1 }));
  assert.ok(moves.length > 0);
  assert.ok(moves.every((m) => m.kind === 'out'), 'all moves should be out-moves');
  assert.equal(moves.length, 4, 'one out-move per Start pawn');
  for (const m of moves) {
    assert.deepEqual(m.to, { zone: 'track', index: START_EXIT.a });
    assert.equal(typeof m.pawnId, 'number');
  }
});

test('AC2: card 2 mixes out-moves and a forward-2 for a track pawn', () => {
  const s = baseState({ drawnCard: 2 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
  const moves = legalMoves(s);

  const outs = moves.filter((m) => m.kind === 'out');
  assert.equal(outs.length, 3, 'three Start pawns remain → three out-moves');

  const fwd = moves.find((m) => m.kind === 'forward' && m.pawnId === 0);
  assert.ok(fwd, 'track pawn should get a forward move');
  assert.equal(fwd.steps, 2);
  assert.deepEqual(fwd.to, { zone: 'track', index: PA[idxOf(10) + 2] }); // square 12
});

test('AC2: no out-moves appear when no pawn is in Start', () => {
  const s = baseState({ drawnCard: 1 });
  s.pawns.a = s.pawns.a.map((p, i) => ({ id: i, zone: 'track', index: 10 + i }));
  const moves = legalMoves(s);
  assert.ok(moves.length > 0);
  assert.ok(moves.every((m) => m.kind !== 'out'), 'no Start pawns → no out-moves');
});

// =========================================================================
// AC3 — numeric forward cards (1,2,3,5,8,12)
// =========================================================================

test('AC3: card 3 with one track pawn yields a single forward-3 move (no out)', () => {
  const s = baseState({ drawnCard: 3 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
  const moves = legalMoves(s);
  assert.equal(moves.length, 1, 'only the lone track pawn can move');
  const m = moves[0];
  assert.equal(m.kind, 'forward');
  assert.equal(m.pawnId, 0);
  assert.equal(m.steps, 3);
  assert.deepEqual(m.to, { zone: 'track', index: PA[idxOf(10) + 3] }); // square 13
});

test('AC3: card 8 enumerates a forward move for every track/safety pawn', () => {
  const s = baseState({ drawnCard: 8 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
  s.pawns.a[1] = { id: 1, zone: 'track', index: 20 };
  const moves = legalMoves(s);
  const movers = moves.filter((m) => m.kind === 'forward');
  assert.equal(movers.length, 2, 'one forward move per eligible pawn');
  assert.deepEqual(movers.map((m) => m.pawnId).sort(), [0, 1]);
  for (const m of movers) assert.equal(m.steps, 8);
});

// =========================================================================
// AC4 — card 4: back -4
// =========================================================================

test('AC4: card 4 moves a track pawn backward 4', () => {
  const s = baseState({ drawnCard: 4 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
  const moves = legalMoves(s);
  const back = moves.find((m) => m.pawnId === 0 && m.kind === 'back');
  assert.ok(back, 'expected a back move for the track pawn');
  assert.deepEqual(back.to, { zone: 'track', index: 6 });
});

test('AC4: card 4 backs a pawn at its start-exit around the loop into the dead zone', () => {
  const s = baseState({ drawnCard: 4 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 4 }; // start exit; -4 wraps behind Start
  const moves = legalMoves(s);
  const back = moves.find((m) => m.pawnId === 0 && m.kind === 'back');
  assert.ok(back, 'expected a back move that wraps the loop');
  // 4 → 3 → 2 → 1 → 0: lands on square 0, one short of the safety mouth (sq 1).
  assert.deepEqual(back.to, { zone: 'track', index: 0 });
});

// =========================================================================
// AC5 — card 10: forward +10 AND back -1
// =========================================================================

test('AC5: card 10 offers both a forward-10 and a back-1 for a track pawn', () => {
  const s = baseState({ drawnCard: 10 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 20 };
  const moves = legalMoves(s);

  const fwd = moves.find((m) => m.pawnId === 0 && m.kind === 'forward');
  const back = moves.find((m) => m.pawnId === 0 && m.kind === 'back');
  assert.ok(fwd, 'expected forward-10');
  assert.ok(back, 'expected back-1');
  assert.equal(fwd.steps, 10);
  assert.equal(back.steps, -1);
  assert.deepEqual(fwd.to, { zone: 'track', index: PA[idxOf(20) + 10] }); // square 30
  assert.deepEqual(back.to, { zone: 'track', index: PA[idxOf(20) - 1] }); // square 19
});

test('AC5: card 10 back-1 from the start-exit lands in the dead zone behind Start', () => {
  const s = baseState({ drawnCard: 10 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 4 };
  const moves = legalMoves(s);
  const back = moves.find((m) => m.pawnId === 0 && m.kind === 'back');
  assert.ok(back, 'expected a back-1 move');
  assert.deepEqual(back.to, { zone: 'track', index: 3 }); // 4 → 3 (dead zone)
  assert.ok(moves.find((m) => m.pawnId === 0 && m.kind === 'forward'), 'forward-10 still legal');
});

// =========================================================================
// AC6 — card 7: single full-7 forward AND two-pawn splits summing to 7
// =========================================================================

test('AC6: card 7 offers a two-pawn split whose legs sum to 7', () => {
  const s = baseState({ drawnCard: 7 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
  s.pawns.a[1] = { id: 1, zone: 'track', index: 20 };
  const moves = legalMoves(s);
  const split = moves.find((m) => m.kind === 'split');
  assert.ok(split, 'expected at least one split move');
  assert.equal(split.legs.length, 2);
  assert.equal(split.legs[0].steps + split.legs[1].steps, 7);
  for (const leg of split.legs) {
    assert.equal(typeof leg.pawnId, 'number');
    assert.ok(leg.steps >= 1 && leg.steps <= 6, 'split leg steps in 1..6');
    assert.ok(leg.to && typeof leg.to.zone === 'string', 'each leg has a destination');
  }
});

test('AC6: card 7 also offers single-pawn full-7 forward moves', () => {
  const s = baseState({ drawnCard: 7 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
  s.pawns.a[1] = { id: 1, zone: 'track', index: 20 };
  const moves = legalMoves(s);
  const full7 = moves.filter((m) => m.kind === 'forward' && m.steps === 7);
  assert.equal(full7.length, 2, 'one full-7 forward per eligible pawn');
});

test('AC6: a lone track pawn on card 7 produces a forward-7 but no split', () => {
  const s = baseState({ drawnCard: 7 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
  const moves = legalMoves(s);
  assert.ok(moves.find((m) => m.kind === 'forward' && m.steps === 7 && m.pawnId === 0));
  assert.equal(moves.find((m) => m.kind === 'split'), undefined, 'no second pawn → no split');
});

// =========================================================================
// AC7 — card 11: forward +11 AND swap with opponent track pawn
// =========================================================================

test('AC7: card 11 offers a swap with an opponent track pawn', () => {
  const s = baseState({ drawnCard: 11 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
  s.pawns.b[0] = { id: 0, zone: 'track', index: 25 };
  const moves = legalMoves(s);
  const swap = moves.find((m) => m.kind === 'swap' && m.pawnId === 0 && m.targetPawnId === 0);
  assert.ok(swap, 'expected a swap move pairing own pawn 0 with opponent pawn 0');
  assert.deepEqual(swap.to, { zone: 'track', index: 25 });
});

test('AC7: card 11 also offers a forward-11 for an own track pawn', () => {
  const s = baseState({ drawnCard: 11 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
  s.pawns.b[0] = { id: 0, zone: 'track', index: 25 };
  const moves = legalMoves(s);
  const fwd = moves.find((m) => m.kind === 'forward' && m.pawnId === 0);
  assert.ok(fwd, 'expected a forward move');
  assert.equal(fwd.steps, 11);
});

test('AC7: a safety-zone pawn cannot be party to a swap on card 11', () => {
  const s = baseState({ drawnCard: 11 });
  s.pawns.a[0] = { id: 0, zone: 'safety', index: 2 }; // own pawn in safety
  s.pawns.b[0] = { id: 0, zone: 'track', index: 25 };
  const moves = legalMoves(s);
  assert.equal(
    moves.find((m) => m.kind === 'swap'),
    undefined,
    'safety pawns are excluded from swaps (track-only)',
  );
});

// =========================================================================
// AC8 — Sorry! card
// =========================================================================

test('AC8: Sorry! brings a Start pawn onto an opponent track pawn', () => {
  const s = baseState({ drawnCard: 'sorry' });
  s.pawns.b[0] = { id: 0, zone: 'track', index: 25 };
  const moves = legalMoves(s);
  const sorry = moves.find((m) => m.kind === 'sorry');
  assert.ok(sorry, 'expected a sorry move');
  assert.deepEqual(sorry.to, { zone: 'track', index: 25 });
  assert.equal(sorry.targetPawnId, 0);
  // pawnId must be one of our Start pawns.
  assert.ok(s.pawns.a.some((p) => p.id === sorry.pawnId && p.zone === 'start'));
});

test('AC8: Sorry! with no opponent on the track yields no moves', () => {
  const s = baseState({ drawnCard: 'sorry' }); // both sides all-in-start
  const moves = legalMoves(s);
  assert.deepEqual(moves, []);
});

test('AC8: Sorry! with no Start pawn yields no moves', () => {
  const s = baseState({ drawnCard: 'sorry' });
  s.pawns.a = s.pawns.a.map((p, i) => ({ id: i, zone: 'track', index: 10 + i }));
  s.pawns.b[0] = { id: 0, zone: 'track', index: 25 };
  const moves = legalMoves(s);
  assert.equal(moves.find((m) => m.kind === 'sorry'), undefined, 'no Start pawn → no sorry move');
});

// =========================================================================
// AC9 — safety-zone overshoot is illegal; exact landing on Home is legal
// =========================================================================

test('AC9: a safety-zone pawn cannot overshoot Home', () => {
  const s = baseState({ drawnCard: 5 });
  s.pawns.a = s.pawns.a.map((p) => ({ ...p, zone: 'home', index: 0 }));
  s.pawns.a[0] = { id: 0, zone: 'safety', index: 3 }; // 2 steps from Home; +5 overshoots
  const moves = legalMoves(s);
  assert.equal(moves.find((m) => m.pawnId === 0), undefined, 'overshooting Home produces no move');
});

test('AC9: a safety-zone pawn landing exactly on Home is legal', () => {
  const s = baseState({ drawnCard: 1 });
  s.pawns.a = s.pawns.a.map((p) => ({ ...p, zone: 'home', index: 0 }));
  s.pawns.a[0] = { id: 0, zone: 'safety', index: 4 }; // one step from Home
  const moves = legalMoves(s);
  const m = moves.find((mv) => mv.pawnId === 0);
  assert.ok(m, 'exact landing on Home must be a legal move');
  assert.deepEqual(m.to, { zone: 'home', index: 0 });
});

test('AC9: a pawn already at Home never produces a move', () => {
  const s = baseState({ drawnCard: 8 });
  s.pawns.a = s.pawns.a.map((p) => ({ ...p, zone: 'home', index: 0 }));
  const moves = legalMoves(s);
  assert.deepEqual(moves, [], 'all pawns home → no moves');
});

// =========================================================================
// True 60-loop movement: backward wraps the loop; Safety is forward-only.
// =========================================================================

test('LOOP: card 4 wraps side b around its start-exit too', () => {
  const s = baseState({ drawnCard: 4, currentPlayer: 'b' });
  s.pawns.b[0] = { id: 0, zone: 'track', index: 34 }; // b start exit
  const moves = legalMoves(s);
  const back = moves.find((m) => m.pawnId === 0 && m.kind === 'back');
  assert.ok(back, 'expected a wrap-back move for side b');
  // 34 → 33 → 32 → 31 → 30: one short of b's safety mouth (sq 31).
  assert.deepEqual(back.to, { zone: 'track', index: 30 });
});

test('LOOP: from square 0 a forward-3 dives through the mouth at +2 into Safety', () => {
  const s = baseState({ drawnCard: 3 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 0 };
  const moves = legalMoves(s);
  const fwd = moves.find((m) => m.pawnId === 0 && m.kind === 'forward');
  assert.ok(fwd, 'expected a forward move');
  // 0 → 1 (track) → 2 (mouth, still track) → safe-0 (forward step FROM the mouth diverts).
  assert.deepEqual(fwd.to, { zone: 'safety', index: 0 });
});

test('LOOP: the diamond at +3 blocks an own pawn from moving forward (clockwise barrier)', () => {
  const s = baseState({ drawnCard: 1 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 3 }; // diamond — only reachable by backing out of start
  const moves = legalMoves(s);
  assert.equal(
    moves.find((m) => m.pawnId === 0 && m.kind === 'forward'),
    undefined,
    'own-colour forward from the diamond is illegal',
  );
});

test('LOOP: a pawn already in Safety cannot move backward on card 4', () => {
  const s = baseState({ drawnCard: 4 });
  s.pawns.a[0] = { id: 0, zone: 'safety', index: 2 };
  const moves = legalMoves(s);
  assert.equal(moves.find((m) => m.pawnId === 0 && m.kind === 'back'), undefined, 'Safety is forward-only');
});

test('LOOP: card 10 offers no back-1 for a Safety pawn', () => {
  const s = baseState({ drawnCard: 10 });
  s.pawns.a[0] = { id: 0, zone: 'safety', index: 1 };
  const moves = legalMoves(s);
  assert.equal(moves.find((m) => m.pawnId === 0 && m.kind === 'back'), undefined, 'no back-out of Safety');
});

test('LOOP: backward from the safety-entry square wraps on the track (no backward divert)', () => {
  const s = baseState({ drawnCard: 10 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 2 }; // a's safety-entry square
  const moves = legalMoves(s);
  const back = moves.find((m) => m.pawnId === 0 && m.kind === 'back');
  assert.ok(back, 'expected a back-1 move');
  assert.deepEqual(back.to, { zone: 'track', index: 1 }); // 2 → 1, stays on track
});

test('LOOP: a multi-step forward that crosses the mouth at +2 still dives into Safety', () => {
  const s = baseState({ drawnCard: 5 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 58 }; // 58→59→0→1→2(mouth)→safe-0
  const moves = legalMoves(s);
  const fwd = moves.find((m) => m.pawnId === 0 && m.kind === 'forward');
  assert.ok(fwd, 'expected a forward move');
  assert.deepEqual(fwd.to, { zone: 'safety', index: 0 });
});

test('LOOP: two back-1 cards from start-exit land you on the safety mouth (canonical play)', () => {
  // Card 10 has a "back 1" option. From start-exit at +4, back 1 lands at +3
  // (the diamond, reachable counter-clockwise), and the second back 1 lands
  // exactly on the safety mouth at +2 — the next forward step then enters Safety.
  const s1 = baseState({ drawnCard: 10 });
  s1.pawns.a[0] = { id: 0, zone: 'track', index: 4 };
  const back1 = legalMoves(s1).find((m) => m.pawnId === 0 && m.kind === 'back');
  assert.ok(back1);
  assert.deepEqual(back1.to, { zone: 'track', index: 3 }); // first back-1: onto the diamond

  const s2 = baseState({ drawnCard: 10 });
  s2.pawns.a[0] = { id: 0, zone: 'track', index: 3 }; // already on the diamond
  const back2 = legalMoves(s2).find((m) => m.pawnId === 0 && m.kind === 'back');
  assert.ok(back2);
  assert.deepEqual(back2.to, { zone: 'track', index: 2 }); // second back-1: onto the safety mouth
});

// =========================================================================
// Self-capture is illegal — a pawn may not LAND on a square one of its own
// pawns holds. (Slides that sweep your own pawns elsewhere still bump them —
// that legal mechanic lives in resolveLanding and is covered in slides.test.)
// =========================================================================

test('OWN: a forward move may not land on a square occupied by your own pawn', () => {
  const s = baseState({ drawnCard: 3 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
  s.pawns.a[1] = { id: 1, zone: 'track', index: 13 }; // 10 + 3 lands here
  const moves = legalMoves(s);
  assert.equal(moves.find((m) => m.id === 'forward:0:3'), undefined, 'no self-capture');
  assert.ok(moves.find((m) => m.id === 'forward:1:3'), 'the other pawn can still move to an empty square');
});

test('OWN: a backward move may not land on your own pawn either', () => {
  const s = baseState({ drawnCard: 4 }); // back 4
  s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
  s.pawns.a[1] = { id: 1, zone: 'track', index: 6 }; // 10 - 4 lands here
  const moves = legalMoves(s);
  assert.equal(moves.find((m) => m.pawnId === 0 && m.kind === 'back'), undefined, 'no backward self-capture');
});

test('OWN: out is blocked when your own pawn sits on the start-exit square', () => {
  const s = baseState({ drawnCard: 1 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: START_EXIT.a }; // occupies the exit
  const moves = legalMoves(s);
  assert.equal(moves.find((m) => m.kind === 'out'), undefined, 'cannot come out onto your own pawn');
  assert.ok(moves.find((m) => m.id === 'forward:0:1'), 'the pawn already out can still advance');
});

test('OWN: a card-7 split leg may not land on a non-mover own pawn', () => {
  const s = baseState({ drawnCard: 7 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
  s.pawns.a[1] = { id: 1, zone: 'track', index: 20 };
  s.pawns.a[2] = { id: 2, zone: 'track', index: 13 }; // pawn 0's +3 leg would land here
  const moves = legalMoves(s);
  // The (pawn 0 +3, pawn 1 +4) split lands pawn 0 on non-mover pawn 2 → illegal.
  const illegal = moves.find(
    (m) => m.kind === 'split' &&
      m.legs.some((l) => l.pawnId === 0 && l.steps === 3) &&
      m.legs.some((l) => l.pawnId === 1),
  );
  assert.equal(illegal, undefined, 'a split leg cannot self-capture a non-mover pawn');
  // Splits in general are still offered (e.g. pairing 0 with 2, which vacates 13).
  assert.ok(moves.some((m) => m.kind === 'split'), 'other splits remain legal');
});
