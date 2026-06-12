import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/server/db.js';
import {
  createAiSession,
  getAiSession,
  setClaudeSessionId,
  markStalled,
  clearStall,
  listStalledOrInFlight,
  setPendingSequence,
  clearPendingSequence,
} from '../src/server/ai/agent-session.js';
import { insertGame } from './_helpers/games.js';

function tmpDb() {
  const dir = mkdtempSync(join(tmpdir(), 'ai-session-'));
  const db = openDb(join(dir, 'test.db'));
  const now = Date.now();
  const u1 = db.prepare("INSERT INTO users (email, friendly_name, color, created_at) VALUES ('a@x', 'A', '#000', ?) RETURNING id").get(now).id;
  const u2 = db.prepare("INSERT INTO users (email, friendly_name, color, is_bot, created_at) VALUES ('bot@x', 'Bot', '#fff', 1, ?) RETURNING id").get(now).id;
  const aId = Math.min(u1, u2), bId = Math.max(u1, u2);
  const gameId = insertGame(db, { players: [aId, bId], gameType: 'cribbage' });
  return { db, gameId, botUserId: u2 };
}

test('createAiSession: inserts a row with null claude_session_id and timestamps', () => {
  const { db, gameId, botUserId } = tmpDb();
  createAiSession(db, { gameId, botUserId, personaId: 'hattie' });
  const row = getAiSession(db, gameId, botUserId);
  assert.equal(row.gameId, gameId);
  assert.equal(row.botUserId, botUserId);
  assert.equal(row.personaId, 'hattie');
  assert.equal(row.claudeSessionId, null);
  assert.equal(row.stalledAt, null);
  assert.ok(row.createdAt > 0);
});

test('createAiSession: duplicate game_id rejected', () => {
  const { db, gameId, botUserId } = tmpDb();
  createAiSession(db, { gameId, botUserId, personaId: 'hattie' });
  assert.throws(() => createAiSession(db, { gameId, botUserId, personaId: 'hattie' }), /UNIQUE/);
});

test('setClaudeSessionId: stores UUID and bumps last_used_at', async () => {
  const { db, gameId, botUserId } = tmpDb();
  createAiSession(db, { gameId, botUserId, personaId: 'hattie' });
  const before = getAiSession(db, gameId, botUserId).lastUsedAt;
  await new Promise(r => setTimeout(r, 5));
  setClaudeSessionId(db, gameId, botUserId, 'uuid-1');
  const after = getAiSession(db, gameId, botUserId);
  assert.equal(after.claudeSessionId, 'uuid-1');
  assert.ok(after.lastUsedAt > before);
});

test('markStalled / clearStall: round-trip', () => {
  const { db, gameId, botUserId } = tmpDb();
  createAiSession(db, { gameId, botUserId, personaId: 'hattie' });
  markStalled(db, gameId, botUserId, 'timeout');
  let row = getAiSession(db, gameId, botUserId);
  assert.ok(row.stalledAt > 0);
  assert.equal(row.stallReason, 'timeout');
  clearStall(db, gameId, botUserId);
  row = getAiSession(db, gameId, botUserId);
  assert.equal(row.stalledAt, null);
  assert.equal(row.stallReason, null);
});

test('listStalledOrInFlight: returns active games whose activeUserId is a bot or that are stalled', () => {
  const { db, gameId, botUserId } = tmpDb();
  createAiSession(db, { gameId, botUserId, personaId: 'hattie' });
  const state = JSON.stringify({ activeUserId: botUserId });
  db.prepare("UPDATE games SET state = ? WHERE id = ?").run(state, gameId);
  const rows = listStalledOrInFlight(db);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].gameId, gameId);
});

test('setPendingSequence stores and clears a JSON-encoded tail', () => {
  const { db, gameId, botUserId } = tmpDb();
  createAiSession(db, { gameId, botUserId, personaId: 'hattie' });
  setPendingSequence(db, gameId, botUserId, [
    { type: 'move', payload: { from: 13, to: 8, die: 5 } },
    { type: 'move', payload: { from: 13, to: 10, die: 3 } },
  ]);
  let sess = getAiSession(db, gameId, botUserId);
  assert.deepEqual(sess.pendingSequence, [
    { type: 'move', payload: { from: 13, to: 8, die: 5 } },
    { type: 'move', payload: { from: 13, to: 10, die: 3 } },
  ]);

  setPendingSequence(db, gameId, botUserId, []);
  sess = getAiSession(db, gameId, botUserId);
  assert.equal(sess.pendingSequence, null,
    'empty array stores as NULL');
});

test('clearPendingSequence sets the column to NULL', () => {
  const { db, gameId, botUserId } = tmpDb();
  createAiSession(db, { gameId, botUserId, personaId: 'hattie' });
  setPendingSequence(db, gameId, botUserId, [{ type: 'move', payload: { from: 1, to: 2, die: 1 } }]);
  clearPendingSequence(db, gameId, botUserId);
  assert.equal(getAiSession(db, gameId, botUserId).pendingSequence, null);
});

test('getAiSession exposes pendingSequence as null when never set', () => {
  const { db, gameId, botUserId } = tmpDb();
  createAiSession(db, { gameId, botUserId, personaId: 'hattie' });
  assert.equal(getAiSession(db, gameId, botUserId).pendingSequence, null);
});
