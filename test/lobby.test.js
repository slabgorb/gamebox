import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { openDb } from '../src/server/db.js';
import { mountRoutes } from '../src/server/routes.js';
import { createGame, endGame } from '../src/server/games.js';

const stub = {
  id: 'stub', displayName: 'Stub', players: { min: 2, max: 2 }, clientDir: 'x',
  initialState: ({ participants }) => ({
    activeUserId: participants[0].userId,
    sides: { a: participants[0].userId, b: participants[1].userId },
  }),
  applyAction: ({ state }) => ({ state, ended: false }),
  publicView: ({ state }) => state,
};

const stub4 = {
  id: 'stub4', displayName: 'Stub4P', players: { min: 2, max: 4 }, clientDir: 'x',
  initialState: ({ participants }) => ({
    activeUserId: participants[0].userId,
  }),
  applyAction: ({ state }) => ({ state, ended: false }),
  publicView: ({ state }) => state,
};

async function setup() {
  const app = express();
  app.use(express.json());
  const db = openDb(':memory:');
  const now = Date.now();
  for (let i = 1; i <= 4; i++) {
    db.prepare("INSERT INTO users (id, email, friendly_name, color, created_at) VALUES (?, ?, ?, ?, ?)")
      .run(i, `u${i}@b`, `User${i}`, '#000', now);
  }
  app.use((req, res, next) => {
    const id = Number(req.header('x-test-user-id'));
    if (!id) return res.status(401).end();
    req.user = { id };
    req.authEmail = `${id}@test`;
    next();
  });
  mountRoutes(app, { db, registry: { stub, stub4 }, sse: { broadcast: () => {} } });
  const server = await new Promise(r => { const s = http.createServer(app); s.listen(0, () => r(s)); });
  return { server, db };
}

async function call(server, method, path, body, headers = {}) {
  const port = server.address().port;
  const res = await fetch(`http://localhost:${port}${path}`, {
    method, headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test('lobby data: GET /api/plugins lists registered plugins', async () => {
  const { server } = await setup();
  try {
    const r = await call(server, 'GET', '/api/plugins', null, { 'x-test-user-id': '1' });
    assert.equal(r.status, 200);
    const stubPlugin = r.body.plugins.find(p => p.id === 'stub');
    assert.ok(stubPlugin, 'stub plugin should be listed');
    assert.equal(stubPlugin.displayName, 'Stub');
  } finally { server.close(); }
});

test('lobby data: GET /api/games + POST /api/games for current user', async () => {
  const { server } = await setup();
  try {
    await call(server, 'POST', '/api/games', { opponentId: 2, gameType: 'stub' }, { 'x-test-user-id': '1' });
    const r = await call(server, 'GET', '/api/games', null, { 'x-test-user-id': '1' });
    assert.equal(r.status, 200);
    assert.equal(r.body.games.length, 1);
    assert.equal(r.body.games[0].gameType, 'stub');
    // Opponent identity now lives in /api/me (opponents by seat); the bare
    // games list carries only id/type/status/updatedAt.
    const me = await call(server, 'GET', '/api/me', null, { 'x-test-user-id': '1' });
    assert.equal(me.status, 200);
    const lobbyGame = me.body.games.find(x => x.id === r.body.games[0].id);
    assert.equal(lobbyGame.opponent.id, 2);
    assert.equal(lobbyGame.you, 0, 'creator holds seat 0');
  } finally { server.close(); }
});

test('/api/users exposes bots with personaId', async () => {
  const { server, db } = await setup();
  try {
    // Seed a bot user with persona_id 'hattie'
    db.prepare("INSERT INTO users (id, email, friendly_name, color, is_bot, persona_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .run(10, 'bot@b', 'Hattie Bot', '#f00', 1, 'hattie', Date.now());
    const r = await call(server, 'GET', '/api/users', null, { 'x-test-user-id': '1' });
    assert.equal(r.status, 200);
    const bot = r.body.find(u => u.isBot);
    assert.ok(bot, 'should have at least one bot user');
    assert.strictEqual(bot.personaId, 'hattie');
  } finally { server.close(); }
});

test('/api/me marks a partnership win for both seats', async () => {
  const { server, db } = await setup();
  try {
    // Create a 4P game: user 1 at seat 0, user 2 at seat 1, user 3 at seat 2, user 4 at seat 3
    const game = createGame(db, {
      userIds: [1, 2, 3, 4],
      gameType: 'stub4',
      initialState: { activeUserId: 1 },
    });
    // End it with winnerSeats [1, 3] — user 2 (seat 1) and user 4 (seat 3) win
    endGame(db, game.id, {
      endedReason: 'plugin',
      winnerSeats: [1, 3],
      isDraw: false,
      finalState: { activeUserId: null },
    });
    // User 2 is at seat 1, which is in winnerSeats
    const me2 = await call(server, 'GET', '/api/me', null, { 'x-test-user-id': '2' });
    assert.equal(me2.status, 200);
    const g2 = me2.body.games.find(g => g.id === game.id);
    assert.ok(g2, 'game should appear in /api/me for user 2');
    assert.strictEqual(g2.won, true, 'seat 1 user should be marked as winner');
    // User 1 is at seat 0, which is NOT in winnerSeats
    const me1 = await call(server, 'GET', '/api/me', null, { 'x-test-user-id': '1' });
    const g1 = me1.body.games.find(g => g.id === game.id);
    assert.strictEqual(g1.won, false, 'seat 0 user should not be marked as winner');
  } finally { server.close(); }
});
