import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { openDb } from '../src/server/db.js';

test('openDb creates users table with email/friendly_name/color/glyph/is_bot/persona_id', () => {
  const db = openDb(':memory:');
  const cols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  assert.deepEqual(cols.sort(), ['color', 'created_at', 'email', 'friendly_name', 'glyph', 'id', 'is_bot', 'persona_id']);
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

// A games-table rebuild (e.g. the winner_seat -> winner_seats legacy drop)
// runs with foreign_keys OFF and historically forgot the participants table,
// stranding participant rows whose game no longer exists. The recreated games
// table restarts AUTOINCREMENT at 1, so the first new game collides with the
// orphans on UNIQUE(game_id, user_id) and every game creation 500s.
test('openDb removes orphan participants left by a prior games-table rebuild', () => {
  const tmpDir = fs.mkdtempSync('/tmp/gamebox-test-');
  const tmp = `${tmpDir}/game.db`;

  // Current seat-indexed schema, then strand a participant row for a game
  // that does not exist (mirrors the live DB after the winner_seats migration).
  const seeded = openDb(tmp);
  seeded.prepare("INSERT INTO users (id, email, friendly_name, color, created_at) VALUES (1, 'k@k', 'K', '#fff', 1)").run();
  seeded.pragma('foreign_keys = OFF');
  seeded.prepare('INSERT INTO participants (game_id, user_id, seat) VALUES (1, 1, 0)').run();
  seeded.close();

  const reopened = openDb(tmp);
  const orphans = reopened.prepare(
    'SELECT COUNT(*) AS n FROM participants p LEFT JOIN games g ON g.id = p.game_id WHERE g.id IS NULL'
  ).get().n;
  assert.equal(orphans, 0, 'orphan participants should be cleaned on open');
  reopened.close();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// The legacy wholesale drop must take participants with it, or the rows it
// leaves behind become the orphans above.
test('legacy games-table rebuild drops participants too (no orphans stranded)', () => {
  const tmpDir = fs.mkdtempSync('/tmp/gamebox-test-');
  const tmp = `${tmpDir}/game.db`;

  const legacy = openDb(tmp);
  legacy.prepare("INSERT INTO users (id, email, friendly_name, color, created_at) VALUES (1, 'k@k', 'K', '#fff', 1)").run();
  legacy.pragma('foreign_keys = OFF');
  // Mark the games table legacy via the singular winner_seat column, and give
  // it a game with a participant — exactly the pre-winner_seats state.
  legacy.exec('ALTER TABLE games ADD COLUMN winner_seat TEXT');
  legacy.prepare("INSERT INTO games (id, status, game_type, state, created_at, updated_at) VALUES (1, 'active', 'risk', '{}', 1, 1)").run();
  legacy.prepare('INSERT INTO participants (game_id, user_id, seat) VALUES (1, 1, 0)').run();
  legacy.close();

  const upgraded = openDb(tmp);
  const orphans = upgraded.prepare(
    'SELECT COUNT(*) AS n FROM participants p LEFT JOIN games g ON g.id = p.game_id WHERE g.id IS NULL'
  ).get().n;
  assert.equal(orphans, 0, 'legacy upgrade should leave no orphan participants');
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

test('ai_sessions is keyed by (game_id, bot_user_id)', () => {
  const db = openDb(':memory:');
  const pk = db.prepare("PRAGMA table_info(ai_sessions)").all().filter(c => c.pk > 0);
  const pkNames = pk.sort((a, b) => a.pk - b.pk).map(c => c.name);
  assert.deepStrictEqual(pkNames, ['game_id', 'bot_user_id']);
  db.close();
});

test('users has a persona_id column', () => {
  const db = openDb(':memory:');
  const names = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  assert.ok(names.includes('persona_id'));
  db.close();
});
