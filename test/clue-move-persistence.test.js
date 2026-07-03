// E7-3 regression guard: a Clue pawn move must survive a page refresh.
//
// The playtest report hypothesised that a 'move' action was NOT persisted the
// same way the suggestion log is (pawn reverts on reload, log stays intact).
// This suite drives the REAL action route + persistence + rehydration path —
// the exact reload seam — and asserts the moved pawn is what a refreshing
// client reads back. It also asserts the suggestion log is untouched (AC3).
//
// STATUS: these pass on current main. The investigation (see the E7-3 session
// file) found the reported revert does not reproduce here — writeGameState
// serialises the whole state, so `pawns` and `log` persist together and
// cluePublicView returns `state.pawns` verbatim on reload. The suite stays as a
// permanent guard: if a future change ever writes state per-field, or rebuilds
// pawn location from the log on rehydration, these break loudly.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { openDb } from '../src/server/db.js';
import { mountRoutes } from '../src/server/routes.js';
import cluePlugin from '../plugins/clue/plugin.js';
import { insertGame } from './_helpers/games.js';

// A valid 3-player Clue game with the human at seat 0 (scarlett), on turn in
// phase 'move'. `patch(state)` lets a test place scarlett / seed the log.
function seedState(patch) {
  let s = 42;
  const rng = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const participants = [
    { userId: 1, seat: 0 },
    { userId: 2, seat: 1 },
    { userId: 3, seat: 2 },
  ];
  const state = cluePlugin.initialState({ participants, rng });
  return patch ? patch(state) : state;
}

function setupApp(state) {
  const app = express();
  app.use(express.json());
  const db = openDb(':memory:');
  const now = Date.now();
  for (const id of [1, 2, 3]) {
    db.prepare("INSERT INTO users (id, email, friendly_name, color, created_at) VALUES (?, ?, 'U', '#f00', ?)")
      .run(id, `u${id}@b`, now);
  }
  insertGame(db, { id: 1, players: [1, 2, 3], gameType: 'clue', state });
  app.use((req, res, next) => {
    const id = Number(req.header('x-test-user-id'));
    if (!id) return res.status(401).end();
    req.user = { id, email: `u${id}@b`, friendlyName: 'U' };
    req.authEmail = req.user.email;
    next();
  });
  mountRoutes(app, { db, registry: { clue: cluePlugin }, sse: { broadcast: () => {} } });
  return { app, db };
}

function startServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => resolve(server));
  });
}

async function call(server, method, path, body, headers = {}) {
  const port = server.address().port;
  const res = await fetch(`http://localhost:${port}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

const H = { 'x-test-user-id': '1' }; // seat 0 = scarlett = human

// A corridor-square move (scarlett starts at [7,24]; die 1 reaches [7,23]).
test('E7-3: a corridor-square move survives a reload', async () => {
  const { app, db } = setupApp(seedState());
  const server = await startServer(app);
  try {
    assert.deepEqual(
      JSON.parse(db.prepare('SELECT state FROM games WHERE id=1').get().state).pawns.scarlett,
      { square: [7, 24] },
      'precondition: scarlett at her start square',
    );
    assert.equal((await call(server, 'POST', '/api/games/1/action', { type: 'roll', payload: { value: 1 } }, H)).status, 200);
    const move = await call(server, 'POST', '/api/games/1/action', { type: 'move', payload: { square: [7, 23] } }, H);
    assert.equal(move.status, 200);

    // Reload path A: the raw persisted row.
    const persisted = JSON.parse(db.prepare('SELECT state FROM games WHERE id=1').get().state);
    assert.deepEqual(persisted.pawns.scarlett, { square: [7, 23] }, 'move not written to the persisted state row');

    // Reload path B: what a refreshing client actually fetches (GET -> publicView).
    const reloaded = await call(server, 'GET', '/api/games/1', null, H);
    assert.equal(reloaded.status, 200);
    assert.deepEqual(reloaded.body.state.pawns.scarlett, { square: [7, 23] }, 'reloaded view shows the pre-move position');
  } finally {
    server.close();
  }
});

// A room entry (scarlett on the lounge door threshold [7,21]; die 1 enters).
test('E7-3: a room entry survives a reload', async () => {
  const { app, db } = setupApp(seedState((s) => {
    s.pawns.scarlett = { square: [7, 21] }; // lounge doorway
    return s;
  }));
  const server = await startServer(app);
  try {
    assert.equal((await call(server, 'POST', '/api/games/1/action', { type: 'roll', payload: { value: 1 } }, H)).status, 200);
    const move = await call(server, 'POST', '/api/games/1/action', { type: 'move', payload: { room: 'lounge' } }, H);
    assert.equal(move.status, 200, `room entry rejected: ${JSON.stringify(move.body)}`);

    const persisted = JSON.parse(db.prepare('SELECT state FROM games WHERE id=1').get().state);
    assert.deepEqual(persisted.pawns.scarlett, { room: 'lounge' }, 'room entry not written to the persisted row');

    const reloaded = await call(server, 'GET', '/api/games/1', null, H);
    assert.deepEqual(reloaded.body.state.pawns.scarlett, { room: 'lounge' }, 'reloaded view lost the room entry');
    assert.equal(reloaded.body.state.phase, 'suggest', 'room entry should leave the player in suggest phase');
  } finally {
    server.close();
  }
});

// AC3: the move must not disturb an existing suggestion log — the reporter's
// exact framing was "suggestion history intact, pawn reverted". Both must hold.
test('E7-3: a move preserves the suggestion log across a reload', async () => {
  const priorLog = [{ type: 'suggest', bySeat: 0, suspect: 'plum', weapon: 'rope', room: 'study' }];
  const { app, db } = setupApp(seedState((s) => {
    s.log = structuredClone(priorLog);
    return s;
  }));
  const server = await startServer(app);
  try {
    assert.equal((await call(server, 'POST', '/api/games/1/action', { type: 'roll', payload: { value: 1 } }, H)).status, 200);
    assert.equal((await call(server, 'POST', '/api/games/1/action', { type: 'move', payload: { square: [7, 23] } }, H)).status, 200);

    const reloaded = await call(server, 'GET', '/api/games/1', null, H);
    assert.deepEqual(reloaded.body.state.pawns.scarlett, { square: [7, 23] }, 'pawn move lost on reload');
    assert.deepEqual(reloaded.body.state.log, priorLog, 'suggestion log changed by an unrelated move');
  } finally {
    server.close();
  }
});
