import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openDb } from '../src/server/db.js';

test('openDb creates users table with email/friendly_name/color/glyph/is_bot', () => {
  const db = openDb(':memory:');
  const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  assert.deepEqual(cols.sort(), ['color', 'created_at', 'email', 'friendly_name', 'glyph', 'id', 'is_bot']);
});

test('openDb creates seat-indexed games table (no player_a/b columns)', () => {
  const db = openDb(':memory:');
  const cols = db.prepare("PRAGMA table_info(games)").all().map(c => c.name);
  for (const expected of ['id', 'status', 'game_type', 'state',
    'ended_reason', 'winner_seats', 'is_draw', 'created_at', 'updated_at']) {
    assert.ok(cols.includes(expected), `games missing column ${expected}`);
  }
  for (const dropped of ['player_a_id', 'player_b_id', 'winner_side', 'current_turn',
    'bag', 'board', 'rack_a', 'rack_b', 'score_a', 'score_b']) {
    assert.ok(!cols.includes(dropped), `games should not have legacy column ${dropped}`);
  }
});

test('participants table exists with (game_id, seat) primary key', () => {
  const db = openDb(':memory:');
  const cols = db.prepare("PRAGMA table_info(participants)").all().map(c => c.name);
  assert.deepEqual(cols.sort(), ['game_id', 'seat', 'user_id']);
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='participants_by_user'").get();
  assert.ok(idx, 'participants_by_user index missing');
});

test('turn_log table exists with seat column', () => {
  const db = openDb(':memory:');
  const cols = db.prepare("PRAGMA table_info(turn_log)").all().map(c => c.name);
  for (const expected of ['id', 'game_id', 'turn_number', 'seat', 'kind', 'summary', 'created_at']) {
    assert.ok(cols.includes(expected), `turn_log missing ${expected}`);
  }
  assert.ok(!cols.includes('side'), 'turn_log should not have legacy side column');
  const idx = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='turn_log_by_game'").get();
  assert.ok(idx, 'turn_log_by_game index missing');
});

test('legacy pre-seat database is rebuilt wholesale (users preserved, games discarded)', () => {
  const tmpDir = fs.mkdtempSync('/tmp/gamebox-test-');
  const tmp = `${tmpDir}/game.db`;

  // Build a legacy-shaped DB file: old games table with player_a_id columns.
  const legacy = openDb(tmp);
  legacy.pragma('foreign_keys = OFF');
  legacy.exec(`
    DROP TABLE turn_log; DROP TABLE ai_sessions; DROP TABLE participants; DROP TABLE games;
    CREATE TABLE games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_a_id INTEGER NOT NULL, player_b_id INTEGER NOT NULL,
      status TEXT NOT NULL, game_type TEXT NOT NULL DEFAULT 'words',
      state TEXT NOT NULL DEFAULT '{}', ended_reason TEXT, winner_side TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
  `);
  legacy.prepare("INSERT INTO users (email, friendly_name, color, created_at) VALUES ('keep@me', 'Keep', '#fff', 1)").run();
  legacy.prepare("INSERT INTO games (player_a_id, player_b_id, status, created_at, updated_at) VALUES (1, 2, 'active', 1, 1)").run();
  legacy.close();

  const upgraded = openDb(tmp);
  const cols = upgraded.prepare("PRAGMA table_info(games)").all().map(c => c.name);
  assert.ok(!cols.includes('player_a_id'), 'legacy games table should be rebuilt');
  assert.equal(upgraded.prepare('SELECT COUNT(*) AS n FROM games').get().n, 0, 'legacy games discarded');
  assert.equal(upgraded.prepare("SELECT friendly_name FROM users WHERE email='keep@me'").get().friendly_name, 'Keep', 'users preserved');
  upgraded.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('games table has winner_seats TEXT, not winner_seat', () => {
  const db = openDb(':memory:');
  const cols = db.prepare("PRAGMA table_info(games)").all();
  const names = cols.map(c => c.name);
  assert.ok(names.includes('winner_seats'), 'winner_seats column present');
  assert.ok(!names.includes('winner_seat'), 'legacy winner_seat column gone');
  assert.strictEqual(cols.find(c => c.name === 'winner_seats').type, 'TEXT');
  db.close();
});

test('legacy moves table is dropped on upgrade and absent on fresh DBs', () => {
  const db = openDb(':memory:');
  const row = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='moves'").get();
  assert.equal(row, undefined, 'moves table should not exist');
});
