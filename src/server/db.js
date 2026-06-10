import Database from 'better-sqlite3';

// Seat-indexed schema (2026-06-07 multiplayer design). Participants live in
// their own table keyed by (game_id, seat); seat 0 is the creator and seat
// order is turn order. The legacy player_a_id/player_b_id columns and the
// 'a'/'b' side vocabulary are gone from the database layer.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  friendly_name TEXT NOT NULL,
  color         TEXT NOT NULL,
  glyph         TEXT,
  is_bot        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS games (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  status          TEXT NOT NULL CHECK (status IN ('active', 'ended')),
  game_type       TEXT NOT NULL,
  state           TEXT NOT NULL DEFAULT '{}',
  ended_reason    TEXT,
  winner_seats    TEXT,
  is_draw         INTEGER NOT NULL DEFAULT 0,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  game_id  INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
  user_id  INTEGER NOT NULL REFERENCES users(id),
  seat     INTEGER NOT NULL,
  PRIMARY KEY (game_id, seat),
  UNIQUE (game_id, user_id)
);
CREATE INDEX IF NOT EXISTS participants_by_user ON participants(user_id);

CREATE TABLE IF NOT EXISTS turn_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  game_id     INTEGER NOT NULL REFERENCES games(id),
  turn_number INTEGER NOT NULL,
  seat        INTEGER NOT NULL,
  kind        TEXT NOT NULL,
  summary     TEXT NOT NULL,
  created_at  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS turn_log_by_game ON turn_log(game_id, id);

CREATE TABLE IF NOT EXISTS ai_sessions (
  game_id           INTEGER PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
  bot_user_id       INTEGER NOT NULL REFERENCES users(id),
  persona_id        TEXT NOT NULL,
  claude_session_id TEXT,
  stalled_at        INTEGER,
  stall_reason      TEXT,
  pending_sequence  TEXT,
  resume_count      INTEGER NOT NULL DEFAULT 0,
  pending_user_messages TEXT,
  created_at        INTEGER NOT NULL,
  last_used_at      INTEGER NOT NULL
);
`;

// A database created before the seat-indexed schema carries the old games
// table (player_a_id et al). In-flight games were declared discardable when
// the multiplayer design was approved, so the upgrade drops every game-scoped
// table wholesale and lets SCHEMA recreate them. Users are preserved.
function dropLegacyGameTables(db) {
  const gamesCols = db.prepare("PRAGMA table_info(games)").all().map(c => c.name);
  const legacy = gamesCols.includes('player_a_id') || gamesCols.includes('winner_seat');
  if (gamesCols.length === 0 || !legacy) return;
  db.pragma('foreign_keys = OFF');
  db.exec(`
    DROP TABLE IF EXISTS turn_log;
    DROP TABLE IF EXISTS ai_sessions;
    DROP TABLE IF EXISTS moves;
    DROP TABLE IF EXISTS games;
    DROP INDEX IF EXISTS one_active_per_pair;
    DROP INDEX IF EXISTS one_active_per_pair_type;
  `);
  db.pragma('foreign_keys = ON');
}

export function openDb(filePath = 'game.db') {
  const db = new Database(filePath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  dropLegacyGameTables(db);
  db.exec(SCHEMA);

  // Users schema deltas — old databases predate these columns.
  const userCols = db.prepare("PRAGMA table_info(users)").all().map(c => c.name);
  if (!userCols.includes('glyph')) {
    db.exec("ALTER TABLE users ADD COLUMN glyph TEXT");
  }
  if (!userCols.includes('is_bot')) {
    db.exec("ALTER TABLE users ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0");
  }

  return db;
}
