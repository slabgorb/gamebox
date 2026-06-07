// A human must be able to leave a Risk game even when it is NOT their turn
// (the bot is active / thinking / stalled). The routes.js turn-ownership
// guard must exempt the `resign` action, and the game must register as ended.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { openDb } from '../src/server/db.js';
import { mountRoutes } from '../src/server/routes.js';
import riskPlugin from '../plugins/risk/plugin.js';
import { insertGame } from './_helpers/games.js';

function setupApp() {
  const app = express();
  app.use(express.json());
  const db = openDb(':memory:');
  const now = Date.now();
  db.prepare("INSERT INTO users (id, email, friendly_name, color, created_at) VALUES (1,'a@b','A','#f00',?)").run(now);
  db.prepare("INSERT INTO users (id, email, friendly_name, color, created_at) VALUES (2,'b@b','B','#0f0',?)").run(now);

  // Player 1 (side a) is the active player; player 2 (side b) is NOT.
  const state = {
    phase: 'attack', currentPlayer: 0,
    territories: { N1: { owner: 0, armies: 5 }, N2: { owner: 1, armies: 3 } },
    reinforcePool: 0, setupPools: [0, 0], fortifyUsed: false,
    lastCombat: null, winner: null, log: [], sides: { a: 1, b: 2 }, activeUserId: 1,
  };
  insertGame(db, { id: 1, players: [1, 2], gameType: 'risk', state: state });

  app.use((req, res, next) => {
    const id = Number(req.header('x-test-user-id'));
    if (!id) return res.status(401).end();
    req.user = { id, email: `${id}@b`, friendlyName: id === 1 ? 'A' : 'B' };
    req.authEmail = req.user.email;
    next();
  });

  const broadcasts = [];
  mountRoutes(app, { db, registry: { risk: riskPlugin }, sse: { broadcast: (g, e) => broadcasts.push({ g, e }) } });
  return { app, db, broadcasts };
}

function startServer(app) {
  return new Promise(r => { const s = http.createServer(app); s.listen(0, () => r(s)); });
}
async function call(server, path, body, headers) {
  const port = server.address().port;
  const res = await fetch(`http://localhost:${port}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test('player 2 can resign even though player 1 is the active player', async () => {
  const { app, db } = setupApp();
  const server = await startServer(app);
  try {
    const r = await call(server, '/api/games/1/action', { type: 'resign' }, { 'x-test-user-id': '2' });
    assert.equal(r.status, 200, 'resign must NOT be blocked by the turn guard');
    assert.equal(r.body.ended, true);

    const row = db.prepare("SELECT status, winner_seat, ended_reason FROM games WHERE id = 1").get();
    assert.equal(row.status, 'ended', 'game registers as ended');
    assert.equal(row.ended_reason, 'resign');
    assert.equal(row.winner_seat, 0, 'the non-resigning player (seat 0) is the winner');
  } finally { server.close(); }
});

test('a non-resign action by the inactive player is still rejected (guard intact)', async () => {
  const { app } = setupApp();
  const server = await startServer(app);
  try {
    const r = await call(server, '/api/games/1/action', { type: 'end-attack' }, { 'x-test-user-id': '2' });
    assert.equal(r.status, 422, 'turn guard still blocks non-resign actions out of turn');
    assert.match(r.body.error, /turn/i);
  } finally { server.close(); }
});
