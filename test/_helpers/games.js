// Seed helper for the seat-indexed schema: inserts a game row plus its
// participants (seat order = array order, seat 0 = creator).
export function insertGame(db, {
  id = null,
  players,
  gameType,
  state = {},
  status = 'active',
  now = Date.now(),
} = {}) {
  const stateJson = typeof state === 'string' ? state : JSON.stringify(state);
  const row = id != null
    ? db.prepare(`INSERT INTO games (id, status, game_type, state, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?, ?) RETURNING id`)
        .get(id, status, gameType, stateJson, now, now)
    : db.prepare(`INSERT INTO games (status, game_type, state, created_at, updated_at)
                  VALUES (?, ?, ?, ?, ?) RETURNING id`)
        .get(status, gameType, stateJson, now, now);
  const ins = db.prepare('INSERT INTO participants (game_id, user_id, seat) VALUES (?, ?, ?)');
  players.forEach((userId, seat) => ins.run(row.id, userId, seat));
  return row.id;
}
