import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialState } from '../plugins/clue/server/state.js';
import { SUSPECTS, WEAPONS, ROOMS } from '../plugins/clue/server/cards.js';

function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

const parts = (n) => Array.from({ length: n }, (_, i) => ({ userId: 100 + i, seat: i }));

test('buildInitialState wires seats, turn, and phase', () => {
  const s = buildInitialState({ participants: parts(3), rng: seededRng(7) });
  assert.deepEqual(s.seats, [100, 101, 102]);
  assert.equal(s.currentSeat, 0);
  assert.equal(s.phase, 'move');
  assert.equal(s.activeUserId, 100);
  assert.deepEqual(s.eliminated, [false, false, false]);
  assert.deepEqual(s.ledgers, [[], [], []]);
  assert.equal(s.suggestion, null);
});

test('seats are ordered by the seat field, not array order', () => {
  const shuffledParts = [{ userId: 9, seat: 2 }, { userId: 7, seat: 0 }, { userId: 8, seat: 1 }];
  const s = buildInitialState({ participants: shuffledParts, rng: seededRng(1) });
  assert.deepEqual(s.seats, [7, 8, 9]);
});

test('each seat controls a distinct suspect; all 6 pawns exist off-board', () => {
  const s = buildInitialState({ participants: parts(4), rng: seededRng(3) });
  assert.equal(s.seatSuspect.length, 4);
  assert.equal(new Set(s.seatSuspect).size, 4);
  for (const sus of s.seatSuspect) assert.ok(SUSPECTS.includes(sus));
  assert.equal(Object.keys(s.pawns).length, 6);
  for (const sus of SUSPECTS) assert.deepEqual(s.pawns[sus], { room: null });
});

test('all 6 weapons placed, each in a valid room', () => {
  const s = buildInitialState({ participants: parts(3), rng: seededRng(5) });
  assert.equal(Object.keys(s.weapons).length, 6);
  for (const w of WEAPONS) assert.ok(ROOMS.includes(s.weapons[w]));
});

// AC: "6 weapons in distinct rooms." The plan's example test only checks each
// weapon sits in a *valid* room — it would pass even if all six shared one room.
test('the 6 weapons occupy 6 distinct rooms', () => {
  const s = buildInitialState({ participants: parts(4), rng: seededRng(11) });
  const placements = WEAPONS.map((w) => s.weapons[w]);
  assert.equal(new Set(placements).size, 6, 'each weapon in its own distinct room');
});

test('envelope and hands are consistent (18 dealt, envelope hidden)', () => {
  const s = buildInitialState({ participants: parts(4), rng: seededRng(2) });
  const dealt = s.hands.flat();
  assert.equal(dealt.length, 18);
  for (const c of [s.envelope.suspect, s.envelope.weapon, s.envelope.room]) {
    assert.ok(!dealt.includes(c));
  }
});

test('rejects out-of-range player counts', () => {
  assert.throws(() => buildInitialState({ participants: parts(2), rng: seededRng() }), /3-4/);
  assert.throws(() => buildInitialState({ participants: parts(5), rng: seededRng() }), /3-4/);
});
