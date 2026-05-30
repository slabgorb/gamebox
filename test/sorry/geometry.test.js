import { test } from 'node:test';
import assert from 'node:assert/strict';
import { path, SLIDES, START_EXIT, SAFETY_ENTRY, DIAMOND, TRACK_LEN } from '../../plugins/sorry/server/geometry.js';

test('track length and per-side entry/exit constants are correct', () => {
  assert.equal(TRACK_LEN, 60);
  assert.equal(START_EXIT.a, 4);
  assert.equal(START_EXIT.b, 34);
  // Canonical-board offsets: safety mouth at +2, diamond at +3, start at +4.
  assert.equal(SAFETY_ENTRY.a, 2);
  assert.equal(SAFETY_ENTRY.b, 32);
  assert.equal(DIAMOND.a, 3);
  assert.equal(DIAMOND.b, 33);
  assert.equal(DIAMOND.green, 18);
  assert.equal(DIAMOND.orange, 48);
});

test("path('a') starts at startExit and ends with the safety zone then home", () => {
  const p = path('a');
  assert.equal(p[0], START_EXIT.a, 'first square is the start-exit track index');
  assert.deepEqual(
    p.slice(-6),
    ['a-safe-0', 'a-safe-1', 'a-safe-2', 'a-safe-3', 'a-safe-4', 'a-home'],
  );
});

test("path('a') turns into the safety zone immediately after safetyEntry", () => {
  const p = path('a');
  const entryPos = p.indexOf(SAFETY_ENTRY.a); // track index 1
  assert.ok(entryPos >= 0, 'safetyEntry index appears on the track portion of the path');
  assert.equal(p[entryPos + 1], 'a-safe-0');
});

test("path('b') starts at its own startExit and ends at its own home", () => {
  const p = path('b');
  assert.equal(p[0], START_EXIT.b);
  assert.equal(p[p.length - 1], 'b-home');
  assert.deepEqual(
    p.slice(-6),
    ['b-safe-0', 'b-safe-1', 'b-safe-2', 'b-safe-3', 'b-safe-4', 'b-home'],
  );
});

test('path wraps clockwise around the track modulo TRACK_LEN', () => {
  // side a exits at 4, walks clockwise to safetyEntry 1, so it must wrap past 59→0.
  const p = path('a');
  const trackPortion = p.filter((sq) => typeof sq === 'number');
  assert.ok(trackPortion.includes(59), 'clockwise walk passes 59 before wrapping');
  assert.ok(trackPortion.includes(0), 'clockwise walk wraps to 0');
  // No track index is visited twice.
  assert.equal(new Set(trackPortion).size, trackPortion.length, 'no duplicate track squares');
});

test('SLIDES defines exactly two well-formed slides per side, same colour as the edge', () => {
  for (const side of ['a', 'b', 'green', 'orange']) {
    assert.equal(SLIDES[side].length, 2, `side ${side} has two slides`);
    for (const s of SLIDES[side]) {
      assert.equal(typeof s.start, 'number');
      assert.equal(typeof s.length, 'number');
    }
  }
  // Canonical positions: slide 1 at corner+1 (length 3, ends on start-exit),
  // slide 2 at corner+9 (length 5, ends one short of the next corner).
  assert.deepEqual(SLIDES.a,      [{ start: 1,  length: 3 }, { start: 9,  length: 5 }]);
  assert.deepEqual(SLIDES.b,      [{ start: 31, length: 3 }, { start: 39, length: 5 }]);
  assert.deepEqual(SLIDES.green,  [{ start: 16, length: 3 }, { start: 24, length: 5 }]);
  assert.deepEqual(SLIDES.orange, [{ start: 46, length: 3 }, { start: 54, length: 5 }]);
});
