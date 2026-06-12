// Seat-indexed game access. Participants are rows in the participants table
// ordered by seat (seat 0 = creator, seat order = turn order). Plugin state
// declares membership either via `seats: [userId, ...]` (N-player plugins)
// or the legacy 2P `sides: {a, b}` shape (side 'a' ⇔ seat 0, 'b' ⇔ seat 1).

function participantsFor(db, gameId) {
  return db.prepare(
    'SELECT user_id AS userId, seat FROM participants WHERE game_id = ? ORDER BY seat ASC'
  ).all(gameId);
}

function rowToGame(db, row) {
  if (!row) return null;
  const state = JSON.parse(row.state);
  return {
    id: row.id,
    status: row.status,
    gameType: row.game_type,
    state,
    participants: participantsFor(db, row.id),
    endedReason: row.ended_reason,
    winnerSeats: row.winner_seats ? JSON.parse(row.winner_seats) : null,
    isDraw: row.is_draw === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// Seat lookup from the participants table (authoritative for membership).
export function seatForUser(game, userId) {
  const p = game.participants.find(p => p.userId === userId);
  return p ? p.seat : null;
}

// Seat lookup from plugin state. Handles both state shapes.
export function seatOfState(state, userId) {
  if (Array.isArray(state?.seats)) {
    const i = state.seats.indexOf(userId);
    return i === -1 ? null : i;
  }
  if (state?.sides) {
    if (state.sides.a === userId) return 0;
    if (state.sides.b === userId) return 1;
  }
  return null;
}

// Legacy alias for 2P consumers: seat 0 → 'a', seat 1 → 'b'.
export function sideOfSeat(seat) {
  return seat === 0 ? 'a' : seat === 1 ? 'b' : null;
}

// userIds is the full roster in seat order (creator first).
export function createGame(db, { userIds, gameType, initialState }) {
  if (!Array.isArray(userIds) || userIds.length < 2) {
    throw new Error('createGame needs at least 2 userIds');
  }
  if (new Set(userIds).size !== userIds.length) {
    throw new Error('duplicate userId in roster');
  }
  const now = Date.now();
  const tx = db.transaction(() => {
    const info = db.prepare(`
      INSERT INTO games (status, game_type, state, created_at, updated_at)
      VALUES ('active', ?, ?, ?, ?)
    `).run(gameType, JSON.stringify(initialState), now, now);
    const gameId = info.lastInsertRowid;
    const ins = db.prepare('INSERT INTO participants (game_id, user_id, seat) VALUES (?, ?, ?)');
    userIds.forEach((userId, seat) => ins.run(gameId, userId, seat));
    return gameId;
  });
  return getGameById(db, tx());
}

export function getGameById(db, id) {
  return rowToGame(db, db.prepare('SELECT * FROM games WHERE id = ?').get(id));
}

export function listGamesForUser(db, userId) {
  return db.prepare(`
    SELECT g.* FROM games g
    JOIN participants p ON p.game_id = g.id
    WHERE p.user_id = ?
    ORDER BY g.updated_at DESC
  `).all(userId).map(row => rowToGame(db, row));
}

// An active game of this type with exactly this participant set (order
// ignored). Replaces the old one_active_per_pair_type unique index, which
// could not express set equality once rosters vary in size.
export function findActiveGameForSet(db, userIds, gameType) {
  const placeholders = userIds.map(() => '?').join(',');
  const row = db.prepare(`
    SELECT g.* FROM games g
    WHERE g.status = 'active' AND g.game_type = ?
      AND (SELECT COUNT(*) FROM participants p WHERE p.game_id = g.id) = ?
      AND (SELECT COUNT(*) FROM participants p
           WHERE p.game_id = g.id AND p.user_id IN (${placeholders})) = ?
  `).get(gameType, userIds.length, ...userIds, userIds.length);
  return rowToGame(db, row);
}

export function endGame(db, id, { endedReason, winnerSeats = null, isDraw = false, finalState }) {
  const tx = db.transaction(() => {
    db.prepare(`UPDATE games SET
      status = 'ended', state = ?,
      ended_reason = ?, winner_seats = ?, is_draw = ?,
      updated_at = ? WHERE id = ?`).run(
      JSON.stringify(finalState),
      endedReason ?? null,
      winnerSeats == null ? null : JSON.stringify(winnerSeats),
      isDraw ? 1 : 0,
      Date.now(),
      id
    );
  });
  tx();
  return getGameById(db, id);
}
