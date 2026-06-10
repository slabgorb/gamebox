import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/server/db.js';
import { createUser } from '../src/server/users.js';
import {
  createGame, listGamesForUser, seatForUser, seatOfState, sideOfSeat, findActiveGameForSet, endGame, getGameById,
} from '../src/server/games.js';

function withUsers(n = 2) {
  const db = openDb(':memory:');
  const users = [];
  for (let i = 0; i < n; i++) {
    users.push(createUser(db, { email: `u${i}@x.com`, friendlyName: `User${i}` }));
  }
  return { db, users };
}

function makeGame(db, userIds, gameType = 'stub', initialState = {}) {
  return createGame(db, { userIds, gameType, initialState });
}

test('createGame seats players in roster order (creator = seat 0)', () => {
  const { db, users: [a, b] } = withUsers();
  const g = makeGame(db, [b.id, a.id]); // b creates
  assert.deepEqual(g.participants, [
    { userId: b.id, seat: 0 },
    { userId: a.id, seat: 1 },
  ]);
  assert.equal(g.status, 'active');
});

test('createGame supports 4-player rosters', () => {
  const { db, users } = withUsers(4);
  const ids = users.map(u => u.id);
  const g = makeGame(db, ids);
  assert.equal(g.participants.length, 4);
  assert.deepEqual(g.participants.map(p => p.userId), ids);
  assert.deepEqual(g.participants.map(p => p.seat), [0, 1, 2, 3]);
});

test('createGame rejects duplicate userIds', () => {
  const { db, users: [a] } = withUsers();
  assert.throws(() => makeGame(db, [a.id, a.id]), /duplicate/i);
});

test('seatForUser returns seat index or null', () => {
  const { db, users: [a, b] } = withUsers();
  const g = makeGame(db, [a.id, b.id]);
  assert.equal(seatForUser(g, a.id), 0);
  assert.equal(seatForUser(g, b.id), 1);
  assert.equal(seatForUser(g, 999), null);
});

test('seatOfState handles both seats[] and legacy sides{} shapes', () => {
  assert.equal(seatOfState({ seats: [10, 20, 30] }, 30), 2);
  assert.equal(seatOfState({ seats: [10, 20] }, 99), null);
  assert.equal(seatOfState({ sides: { a: 10, b: 20 } }, 10), 0);
  assert.equal(seatOfState({ sides: { a: 10, b: 20 } }, 20), 1);
  assert.equal(seatOfState({ sides: { a: 10, b: 20 } }, 99), null);
});

test('sideOfSeat maps seats 0/1 to a/b, null beyond', () => {
  assert.equal(sideOfSeat(0), 'a');
  assert.equal(sideOfSeat(1), 'b');
  assert.equal(sideOfSeat(2), null);
  assert.equal(sideOfSeat(null), null);
});

test('listGamesForUser returns games where user holds any seat', () => {
  const { db, users } = withUsers(3);
  const g = makeGame(db, users.map(u => u.id));
  for (const u of users) {
    const xs = listGamesForUser(db, u.id);
    assert.equal(xs.length, 1);
    assert.equal(xs[0].id, g.id);
  }
});

test('findActiveGameForSet matches the participant set regardless of order', () => {
  const { db, users } = withUsers(3);
  const ids = users.map(u => u.id);
  const g = makeGame(db, ids, 'risk');
  assert.equal(findActiveGameForSet(db, [...ids].reverse(), 'risk').id, g.id);
  assert.equal(findActiveGameForSet(db, ids, 'words'), null, 'different type');
  assert.equal(findActiveGameForSet(db, ids.slice(0, 2), 'risk'), null, 'subset is not the set');
});

test('findActiveGameForSet ignores ended games', () => {
  const { db, users } = withUsers(2);
  const ids = users.map(u => u.id);
  const g = makeGame(db, ids, 'risk');
  db.prepare("UPDATE games SET status='ended' WHERE id = ?").run(g.id);
  assert.equal(findActiveGameForSet(db, ids, 'risk'), null);
});

test('endGame records winner_seat and is_draw', () => {
  const { db, users } = withUsers(4);
  const g = makeGame(db, users.map(u => u.id), 'risk');
  const ended = endGame(db, g.id, { endedReason: 'conquest', winnerSeat: 2, finalState: { done: true } });
  assert.equal(ended.status, 'ended');
  assert.equal(ended.winnerSeat, 2);
  assert.equal(ended.isDraw, false);
  const drawn = endGame(db, g.id, { endedReason: 'draw', isDraw: true, finalState: {} });
  assert.equal(drawn.winnerSeat, null);
  assert.equal(drawn.isDraw, true);
});

test('endGame stores winnerSeats array and reads it back', () => {
  const db = openDb(':memory:');
  const u = db.prepare("INSERT INTO users (email, friendly_name, color, created_at) VALUES (?,?,?,?) RETURNING id");
  const a = u.get('a@x', 'A', '#a00', Date.now()).id;
  const b = u.get('b@x', 'B', '#0a0', Date.now()).id;
  const game = createGame(db, { userIds: [a, b], gameType: 'risk', initialState: { seats: [a, b] } });
  endGame(db, game.id, { endedReason: 'plugin', winnerSeats: [1], isDraw: false, finalState: { done: true } });
  const ended = getGameById(db, game.id);
  assert.deepStrictEqual(ended.winnerSeats, [1]);
  assert.strictEqual(ended.status, 'ended');
  db.close();
});

test('endGame stores a partnership win as two seats', () => {
  const db = openDb(':memory:');
  const u = db.prepare("INSERT INTO users (email, friendly_name, color, created_at) VALUES (?,?,?,?) RETURNING id");
  const ids = [0,1,2,3].map(i => u.get(`p${i}@x`, `P${i}`, '#777', Date.now()).id);
  const game = createGame(db, { userIds: ids, gameType: 'cribbage', initialState: { seats: ids } });
  endGame(db, game.id, { endedReason: 'plugin', winnerSeats: [1, 3], isDraw: false, finalState: {} });
  assert.deepStrictEqual(getGameById(db, game.id).winnerSeats, [1, 3]);
  db.close();
});
