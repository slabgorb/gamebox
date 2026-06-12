// Generic helpers for the shared turn_log table. Plugins own the shape of
// `summary`; this module owns persistence and ordering. Entries are
// attributed to a seat index; the returned rows also carry a legacy `side`
// alias ('a' for seat 0, 'b' for seat 1, null beyond) for 2P clients.

function sideAlias(seat) {
  return seat === 0 ? 'a' : seat === 1 ? 'b' : null;
}

export function appendTurnEntry(db, gameId, seat, kind, summary) {
  const now = Date.now();
  const max = db.prepare(
    'SELECT COALESCE(MAX(turn_number), 0) AS m FROM turn_log WHERE game_id = ?'
  ).get(gameId).m;
  const turnNumber = max + 1;
  const info = db.prepare(`
    INSERT INTO turn_log (game_id, turn_number, seat, kind, summary, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(gameId, turnNumber, seat, kind, JSON.stringify(summary), now);
  return {
    id: info.lastInsertRowid,
    gameId,
    turnNumber,
    seat,
    side: sideAlias(seat),
    kind,
    summary,
    createdAt: now,
  };
}

export function listTurnEntries(db, gameId) {
  const rows = db.prepare(`
    SELECT id, game_id AS gameId, turn_number AS turnNumber, seat, kind, summary, created_at AS createdAt
    FROM turn_log WHERE game_id = ? ORDER BY id ASC
  `).all(gameId);
  return rows.map(r => ({ ...r, side: sideAlias(r.seat), summary: JSON.parse(r.summary) }));
}
