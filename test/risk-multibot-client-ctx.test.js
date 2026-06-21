import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/server/db.js';
import { mountRoutes } from '../src/server/routes.js';
import { mountPluginClients } from '../src/server/plugin-clients.js';
import { buildRegistry } from '../src/server/plugins.js';
import riskPlugin from '../plugins/risk/plugin.js';
import { bootAiSubsystem } from '../src/server/ai/index.js';
import { createAiSession } from '../src/server/ai/agent-session.js';

async function GET(port, path) {
  const r = await fetch(`http://localhost:${port}${path}`);
  return { status: r.status, text: await r.text() };
}
async function POST(port, path, body) {
  const r = await fetch(`http://localhost:${port}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

function writePersona(dir, id) {
  writeFileSync(join(dir, `${id}.yaml`),
    `id: ${id}\ndisplayName: ${id}\ncolor: "#a00"\nglyph: "x"\nsystemPrompt: hi\n`);
}

test('plugin-clients: N>2 roster carries personaId + isBot per seat', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mbctx-'));
  const personaDir = join(dir, 'personas');
  mkdirSync(personaDir);
  for (const id of ['hattie', 'the-shark', 'professor-doofi']) writePersona(personaDir, id);
  const db = openDb(join(dir, 'db.db'));

  const humanId = db.prepare(
    "INSERT INTO users (email, friendly_name, color, created_at) VALUES ('h@x','H','#000',?) RETURNING id",
  ).get(Date.now()).id;

  const { orchestrator, personas } = bootAiSubsystem({
    db, sse: { broadcast: () => {} },
    llm: { send: async () => ({ text: '{}' }) },
    personaDir,
  });
  const bots = db.prepare("SELECT id, persona_id FROM users WHERE is_bot=1 ORDER BY id").all();
  assert.equal(bots.length, 3, 'three bot users created from personaDir');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: humanId, friendlyName: 'H' }; req.authEmail = 'h@x'; next(); });
  const registry = buildRegistry({ risk: riskPlugin });
  mountRoutes(app, { db, registry, sse: { broadcast: () => {} }, ai: { orchestrator, personas } });
  mountPluginClients(app, { db, registry, ai: { orchestrator, personas } });

  const srv = http.createServer(app);
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  try {
    const create = await POST(port, '/api/games', {
      opponentIds: bots.map(b => b.id), gameType: 'risk',
    });
    assert.equal(create.status, 200, `game created: ${JSON.stringify(create.body)}`);
    const html = (await GET(port, `/play/risk/${create.body.id}/`)).text;
    const m = html.match(/window\.__GAME__\s*=\s*(\{[^<]*\})/);
    assert.ok(m, 'ctx is injected');
    const ctx = JSON.parse(m[1]);

    assert.equal(ctx.players.length, 4, 'four seats');
    const human = ctx.players.find(p => p.userId === humanId);
    assert.equal(human.isBot, false, 'human isBot false');
    assert.equal(human.personaId, null, 'human personaId null');

    const botSeats = ctx.players.filter(p => p.isBot);
    assert.equal(botSeats.length, 3, 'three bot seats');
    for (const p of botSeats) {
      assert.equal(typeof p.personaId, 'string', `bot seat ${p.seat} has personaId`);
      assert.ok(p.personaId.length > 0);
    }
    // personaId on each bot seat matches that bot user's persona_id
    const byUser = new Map(bots.map(b => [b.id, b.persona_id]));
    for (const p of botSeats) assert.equal(p.personaId, byUser.get(p.userId));
  } finally {
    srv.close();
  }
});

test('plugin-clients: legacy opponent overlay resolves the rendered opponent seat, not an arbitrary session', async () => {
  // E4-4: serveIndex builds the legacy single-opponent overlay fields
  // (opponentPersonaId / opponentFriendlyName / opponentGlyph / opponentColor)
  // from a bare `SELECT persona_id FROM ai_sessions WHERE game_id = ?`.get().
  // In a multi-bot game that returns whichever session row the DB surfaces
  // first — not necessarily the seat actually being rendered as the opponent.
  // The overlay must resolve the persona for the specific opponent seat.
  const dir = mkdtempSync(join(tmpdir(), 'mbctx-overlay-'));
  const personaDir = join(dir, 'personas');
  mkdirSync(personaDir);
  for (const id of ['alpha', 'bravo']) writePersona(personaDir, id);
  const db = openDb(join(dir, 'db.db'));

  const humanId = db.prepare(
    "INSERT INTO users (email, friendly_name, color, created_at) VALUES ('h@x','H','#000',?) RETURNING id",
  ).get(Date.now()).id;

  const { orchestrator, personas } = bootAiSubsystem({
    db, sse: { broadcast: () => {} },
    llm: { send: async () => ({ text: '{}' }) },
    personaDir,
  });

  // Two bots. A bare `.get()` over the game's sessions surfaces the row with
  // the lowest rowid / lowest bot_user_id. Identify that "decoy" bot vs the
  // bot we will actually place at the rendered opponent seat.
  const bots = db.prepare("SELECT id, persona_id FROM users WHERE is_bot=1 ORDER BY id").all();
  assert.equal(bots.length, 2, 'two bot users created from personaDir');
  const decoy = bots[0];        // lowest bot_user_id — what a bare .get() tends to surface
  const opponentBot = bots[1];  // higher id — placed at the lower (opponent) seat
  assert.notEqual(decoy.persona_id, opponentBot.persona_id, 'the two bots have distinct personas');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: humanId, friendlyName: 'H' }; req.authEmail = 'h@x'; next(); });
  const registry = buildRegistry({ risk: riskPlugin });
  mountRoutes(app, { db, registry, sse: { broadcast: () => {} }, ai: { orchestrator, personas } });
  mountPluginClients(app, { db, registry, ai: { orchestrator, personas } });

  const srv = http.createServer(app);
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  try {
    // opponentBot at seat 1 (the legacy single-opponent seat), decoy at seat 2.
    const create = await POST(port, '/api/games', {
      opponentIds: [opponentBot.id, decoy.id], gameType: 'risk',
    });
    assert.equal(create.status, 200, `game created: ${JSON.stringify(create.body)}`);
    const gameId = create.body.id;

    // Re-seed ai_sessions so row order is INDEPENDENT of seat order: the decoy
    // (already the lowest bot_user_id) is inserted first, giving it the lowest
    // rowid too. A resolver that grabs "the first session for this game" will
    // return the decoy under either index plan — never the rendered opponent.
    db.prepare("DELETE FROM ai_sessions WHERE game_id = ?").run(gameId);
    createAiSession(db, { gameId, botUserId: decoy.id, personaId: decoy.persona_id });
    createAiSession(db, { gameId, botUserId: opponentBot.id, personaId: opponentBot.persona_id });

    const html = (await GET(port, `/play/risk/${gameId}/`)).text;
    const m = html.match(/window\.__GAME__\s*=\s*(\{[^<]*\})/);
    assert.ok(m, 'ctx is injected');
    const ctx = JSON.parse(m[1]);

    // Control: the seat-scoped players[] map already resolves seat 1 correctly.
    const opponentSeat = ctx.players.find(p => p.seat === 1);
    assert.equal(opponentSeat.userId, opponentBot.id, 'seat 1 is the opponent bot');
    assert.equal(opponentSeat.personaId, opponentBot.persona_id, 'seat-scoped personaId is correct');

    // The overlay (legacy single-opponent fields) must describe seat 1's bot —
    // not the decoy session the DB returns first.
    assert.equal(ctx.opponentPersonaId, opponentBot.persona_id,
      'overlay persona resolves to the rendered opponent seat');
    assert.notEqual(ctx.opponentPersonaId, decoy.persona_id,
      'overlay must not surface the arbitrary (decoy) session persona');
    assert.equal(ctx.opponentFriendlyName, opponentBot.persona_id,
      'overlay display name (persona displayName == id) matches the opponent seat');
    assert.equal(ctx.opponentPersonaId, opponentSeat.personaId,
      'overlay persona agrees with the opponent seat entry in players[]');
  } finally {
    srv.close();
  }
});
