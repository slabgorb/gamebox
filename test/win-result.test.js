import { test } from 'node:test';
import assert from 'node:assert/strict';
import { winSeatsFromState } from '../src/server/win-result.js';

test('winnerSeats array passes through', () => {
  assert.deepEqual(winSeatsFromState({ winnerSeats: [1, 3] }), { winnerSeats: [1, 3], isDraw: false });
});

test('winnerSeat int becomes a one-element array', () => {
  assert.deepEqual(winSeatsFromState({ winnerSeat: 2 }), { winnerSeats: [2], isDraw: false });
});

test('winnerSide a/b maps to seat 0/1', () => {
  assert.deepEqual(winSeatsFromState({ winnerSide: 'a' }), { winnerSeats: [0], isDraw: false });
  assert.deepEqual(winSeatsFromState({ winnerSide: 'b' }), { winnerSeats: [1], isDraw: false });
});

test('draw is explicit, no winners', () => {
  assert.deepEqual(winSeatsFromState({ winnerSide: 'draw' }), { winnerSeats: null, isDraw: true });
});

test('no winner yields nulls', () => {
  assert.deepEqual(winSeatsFromState({}), { winnerSeats: null, isDraw: false });
});
