import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { openDb } from '../src/server/db.js';
import { mountRoutes } from '../src/server/routes.js';
import { buildRegistry } from '../src/server/plugins.js';
import cribbagePlugin from '../plugins/cribbage/plugin.js';
import { bootAiSubsystem } from '../src/server/ai/index.js';
import { getAiSession, markStalled, peekUserMessages } from '../src/server/ai/agent-session.js';

function makeApp() {
  const dir = mkdtempSync(join(tmpdir(), 'ai-route-'));
  const personaDir = join(dir, 'personas');
  mkdirSync(personaDir);
  writeFileSync(join(personaDir, 'hattie.yaml'),
    'id: hattie\ndisplayName: Hattie\ncolor: "#ec4899"\nglyph: "♡"\nsystemPrompt: hi\n');
  const db = openDb(join(dir, 'db.db'));

  const now = Date.now();
  const humanId = db.prepare("INSERT INTO users (email, friendly_name, color, created_at) VALUES ('h@x','H','#000',?) RETURNING id").get(now).id;
  const events = [];
  const sse = { broadcast: (g, ev) => events.push({ g, ...ev }) };
  // Smart-enough LLM mock: pick the first legal move id mentioned in the
  // prompt. With Phase 3's shortlist, the legal ids vary by deal, so a
  // hard-coded moveId would flake on the random shuffle.
  const llm = {
    send: async ({ prompt }) => {
      const ids = [...prompt.matchAll(/(discard:\d+,\d+|play:[^\s]+|cut|next|seq:\d+|roll[\w-]*|accept-double|decline-double|offer-double:\d+)/g)].map(m => m[1]);
      const moveId = ids[0] ?? 'cut';
      return { text: `{"moveId":"${moveId}","banter":""}`, sessionId: 'sid' };
    },
  };
  const bootResult = bootAiSubsystem({ db, sse, llm, personaDir });
  const { orchestrator } = bootResult;
  const botId = db.prepare("SELECT id FROM users WHERE is_bot = 1").get().id;

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: humanId, friendlyName: 'H' }; req.authEmail = 'h@x'; next(); });
  const registry = buildRegistry({ cribbage: cribbagePlugin });
  mountRoutes(app, { db, registry, sse, ai: bootResult });
  return { app, db, humanId, botId, events, orchestrator };
}

function listen(app) {
  return new Promise(resolve => {
    const srv = http.createServer(app);
    srv.listen(0, () => resolve({ srv, port: srv.address().port }));
  });
}

async function POST(port, path, body) {
  const r = await fetch(`http://localhost:${port}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await r.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: r.status, body: parsed };
}

test('POST /api/games: with bot opponent + valid personaId, creates ai_sessions row', async () => {
  const { app, db, botId } = makeApp();
  const { srv, port } = await listen(app);
  try {
    const r = await POST(port, '/api/games', { opponentId: botId, gameType: 'cribbage', personaId: 'hattie' });
    assert.equal(r.status, 200);
    const sess = getAiSession(db, r.body.id, botId);
    assert.ok(sess);
    assert.equal(sess.personaId, 'hattie');
    assert.equal(sess.botUserId, botId);
  } finally {
    srv.close();
  }
});

test('POST /api/games: with bot opponent and no body.personaId, uses persona from user row', async () => {
  const { app, db, botId } = makeApp();
  const { srv, port } = await listen(app);
  try {
    // persona_id comes from the bot user row — body.personaId is no longer required
    const r = await POST(port, '/api/games', { opponentId: botId, gameType: 'cribbage' });
    assert.equal(r.status, 200);
    const sess = getAiSession(db, r.body.id, botId);
    assert.ok(sess);
    assert.equal(sess.personaId, 'hattie');
  } finally {
    srv.close();
  }
});

test('POST /api/games: body.personaId is ignored; persona always comes from user row', async () => {
  const { app, db, botId } = makeApp();
  const { srv, port } = await listen(app);
  try {
    // Passing a body.personaId that doesn't match is fine — it is simply ignored
    const r = await POST(port, '/api/games', { opponentId: botId, gameType: 'cribbage', personaId: 'nobody' });
    assert.equal(r.status, 200);
    const sess = getAiSession(db, r.body.id, botId);
    assert.equal(sess.personaId, 'hattie');
  } finally {
    srv.close();
  }
});

test('POST /api/games: with human opponent, no ai_sessions row created', async () => {
  const { app, db, humanId, botId } = makeApp();
  const now = Date.now();
  const otherHumanId = db.prepare("INSERT INTO users (email, friendly_name, color, created_at) VALUES ('h2@x','H2','#222',?) RETURNING id").get(now).id;
  const { srv, port } = await listen(app);
  try {
    const r = await POST(port, '/api/games', { opponentId: otherHumanId, gameType: 'cribbage' });
    assert.equal(r.status, 200);
    assert.equal(getAiSession(db, r.body.id, botId), null);
  } finally {
    srv.close();
  }
});

test('POST /api/games/:id/ai/retry: clears stall and re-runs orchestrator', async () => {
  const { app, db, botId, orchestrator } = makeApp();
  const { srv, port } = await listen(app);
  try {
    const create = await POST(port, '/api/games', { opponentId: botId, gameType: 'cribbage', personaId: 'hattie' });
    const gameId = create.body.id;
    markStalled(db, gameId, botId, 'timeout');
    const r = await POST(port, `/api/games/${gameId}/ai/retry`, {});
    assert.equal(r.status, 200);
    await new Promise(r => setImmediate(r));
    const sess = getAiSession(db, gameId, botId);
    assert.equal(sess.stalledAt, null);
  } finally {
    srv.close();
  }
});

test('POST /api/games/:id/chat: queues a message for the sole bot', async () => {
  const { app, db, botId } = makeApp();
  const { srv, port } = await listen(app);
  try {
    const create = await POST(port, '/api/games', { opponentId: botId, gameType: 'cribbage', personaId: 'hattie' });
    const gameId = create.body.id;
    const r = await POST(port, `/api/games/${gameId}/chat`, { text: 'good luck' });
    assert.equal(r.status, 200);
    const msgs = peekUserMessages(db, gameId, botId);
    assert.equal(msgs.length, 1);
    assert.equal(msgs[0].text, 'good luck');
  } finally {
    srv.close();
  }
});

test('POST /api/games/:id/chat: unknown botUserId → 404 and enqueues nothing', async () => {
  const { app, db, botId } = makeApp();
  const { srv, port } = await listen(app);
  try {
    const create = await POST(port, '/api/games', { opponentId: botId, gameType: 'cribbage', personaId: 'hattie' });
    const gameId = create.body.id;
    const r = await POST(port, `/api/games/${gameId}/chat`, { botUserId: 999999, text: 'hello' });
    assert.equal(r.status, 404);
    // The real bot's inbox stays empty.
    assert.equal(peekUserMessages(db, gameId, botId).length, 0);
  } finally {
    srv.close();
  }
});

test('POST /api/games/:id/ai/abandon: ends game with endedReason ai_stalled', async () => {
  const { app, db, botId } = makeApp();
  const { srv, port } = await listen(app);
  try {
    const create = await POST(port, '/api/games', { opponentId: botId, gameType: 'cribbage', personaId: 'hattie' });
    const gameId = create.body.id;
    markStalled(db, gameId, botId, 'timeout');
    const r = await POST(port, `/api/games/${gameId}/ai/abandon`, {});
    assert.equal(r.status, 200);
    const game = db.prepare("SELECT status, ended_reason FROM games WHERE id = ?").get(gameId);
    assert.equal(game.status, 'ended');
    assert.equal(game.ended_reason, 'ai_stalled');
  } finally {
    srv.close();
  }
});

test('GET /api/games/:id/events: replays current stall on subscribe', async () => {
  const { app, db, botId } = makeApp();
  const { srv, port } = await listen(app);
  try {
    const create = await POST(port, '/api/games', { opponentId: botId, gameType: 'cribbage', personaId: 'hattie' });
    const gameId = create.body.id;
    markStalled(db, gameId, botId, 'timeout');

    const ctrl = new AbortController();
    const resp = await fetch(`http://localhost:${port}/api/games/${gameId}/events`, { signal: ctrl.signal });
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    const deadline = Date.now() + 1000;
    while (Date.now() < deadline && !buf.includes('event: bot_stalled')) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value);
    }
    ctrl.abort();
    assert.match(buf, /event: bot_stalled/);
    assert.match(buf, /"reason":"timeout"/);
    assert.match(buf, /"displayName":"Hattie"/);
  } finally {
    srv.close();
  }
});

test('GET /api/games/:id/events: kicks orchestrator when bot should act', async () => {
  const { app, db, botId, events } = makeApp();
  const { srv, port } = await listen(app);
  try {
    const create = await POST(port, '/api/games', { opponentId: botId, gameType: 'cribbage', personaId: 'hattie' });
    const gameId = create.body.id;
    // Set game state so it's clearly the bot's turn (non-dealer in cut phase).
    const gameRow = db.prepare('SELECT state FROM games WHERE id = ?').get(gameId);
    const state = JSON.parse(gameRow.state);
    state.activeUserId = botId;
    state.phase = 'cut';
    db.prepare('UPDATE games SET state = ? WHERE id = ?').run(JSON.stringify(state), gameId);

    events.length = 0;
    const ctrl = new AbortController();
    const resp = await fetch(`http://localhost:${port}/api/games/${gameId}/events`, { signal: ctrl.signal });
    await new Promise(r => setTimeout(r, 100));
    ctrl.abort();
    try { await resp.body.cancel(); } catch {}

    // Orchestrator was kicked → emitted bot_thinking on the broadcast bus.
    assert.ok(
      events.some(e => e.type === 'bot_thinking'),
      `expected bot_thinking, got ${events.map(e => e.type).join(',')}`,
    );
  } finally {
    srv.close();
  }
});

test('GET /api/games/:id/events: no stall replay when AI session is healthy', async () => {
  const { app, botId } = makeApp();
  const { srv, port } = await listen(app);
  try {
    const create = await POST(port, '/api/games', { opponentId: botId, gameType: 'cribbage', personaId: 'hattie' });
    const gameId = create.body.id;

    const ctrl = new AbortController();
    const resp = await fetch(`http://localhost:${port}/api/games/${gameId}/events`, { signal: ctrl.signal });
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';
    // Read whatever's immediately available, then bail.
    await new Promise(r => setTimeout(r, 100));
    try {
      const { value } = await Promise.race([
        reader.read(),
        new Promise(r => setTimeout(() => r({ value: undefined }), 50)),
      ]);
      if (value) buf += dec.decode(value);
    } catch {}
    ctrl.abort();
    assert.equal(/event: bot_stalled/.test(buf), false);
  } finally {
    srv.close();
  }
});

test('POST /api/games/:id/ai/retry: 422 if no stall pending', async () => {
  const { app, botId } = makeApp();
  const { srv, port } = await listen(app);
  try {
    const create = await POST(port, '/api/games', { opponentId: botId, gameType: 'cribbage', personaId: 'hattie' });
    const r = await POST(port, `/api/games/${create.body.id}/ai/retry`, {});
    assert.equal(r.status, 422);
  } finally {
    srv.close();
  }
});

test('GET /api/ai/personas: returns the catalog', async () => {
  const { app } = makeApp();
  const { srv, port } = await listen(app);
  try {
    const r = await fetch(`http://localhost:${port}/api/ai/personas`);
    const body = await r.json();
    assert.equal(r.status, 200);
    assert.ok(body.personas.some(p => p.id === 'hattie'));
  } finally {
    srv.close();
  }
});

test('POST /action: when newState.activeUserId is a bot, orchestrator schedules turn', async () => {
  const { app, db, humanId, botId, events } = makeApp();
  const { srv, port } = await listen(app);
  try {
    const create = await POST(port, '/api/games', { opponentId: botId, gameType: 'cribbage', personaId: 'hattie' });
    const gameId = create.body.id;

    const game = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId);
    const state = JSON.parse(game.state);
    const humanSide = state.sides.a === humanId ? 0 : 1;
    const cards = state.hands[humanSide].slice(0, 2);

    await POST(port, `/api/games/${gameId}/action`, { type: 'discard', payload: { cards } });

    await new Promise(r => setTimeout(r, 50));

    assert.ok(events.some(e => e.type === 'bot_thinking') || events.some(e => e.type === 'banter'),
      'orchestrator was scheduled');
  } finally {
    srv.close();
  }
});
