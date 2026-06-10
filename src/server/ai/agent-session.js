function rowToSession(row) {
  if (!row) return null;
  return {
    gameId: row.game_id,
    botUserId: row.bot_user_id,
    personaId: row.persona_id,
    claudeSessionId: row.claude_session_id,
    stalledAt: row.stalled_at,
    stallReason: row.stall_reason,
    pendingSequence: row.pending_sequence ? JSON.parse(row.pending_sequence) : null,
    resumeCount: row.resume_count ?? 0,
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
  };
}

export function createAiSession(db, { gameId, botUserId, personaId }) {
  const now = Date.now();
  db.prepare(`
    INSERT INTO ai_sessions (game_id, bot_user_id, persona_id, claude_session_id,
                             stalled_at, stall_reason, created_at, last_used_at)
    VALUES (?, ?, ?, NULL, NULL, NULL, ?, ?)
  `).run(gameId, botUserId, personaId, now, now);
}

export function getAiSession(db, gameId, botUserId) {
  return rowToSession(db.prepare(
    "SELECT * FROM ai_sessions WHERE game_id = ? AND bot_user_id = ?"
  ).get(gameId, botUserId));
}

export function listAiSessions(db, gameId) {
  return db.prepare("SELECT * FROM ai_sessions WHERE game_id = ? ORDER BY bot_user_id")
    .all(gameId).map(rowToSession);
}

export function setClaudeSessionId(db, gameId, botUserId, claudeSessionId) {
  db.prepare("UPDATE ai_sessions SET claude_session_id = ?, last_used_at = ? WHERE game_id = ? AND bot_user_id = ?")
    .run(claudeSessionId, Date.now(), gameId, botUserId);
}

// Called when we resume an existing claude session — bumps the counter so
// the orchestrator can cap context bloat by rotating to a fresh session
// after N consecutive resumes.
export function bumpResumeCount(db, gameId, botUserId) {
  db.prepare("UPDATE ai_sessions SET resume_count = resume_count + 1, last_used_at = ? WHERE game_id = ? AND bot_user_id = ?")
    .run(Date.now(), gameId, botUserId);
}

// Rotates to a fresh claude session: drops the prior session id and resets
// the resume counter.
export function rotateClaudeSession(db, gameId, botUserId) {
  db.prepare("UPDATE ai_sessions SET claude_session_id = NULL, resume_count = 0, last_used_at = ? WHERE game_id = ? AND bot_user_id = ?")
    .run(Date.now(), gameId, botUserId);
}

export function markStalled(db, gameId, botUserId, reason) {
  db.prepare("UPDATE ai_sessions SET stalled_at = ?, stall_reason = ?, pending_sequence = NULL, last_used_at = ? WHERE game_id = ? AND bot_user_id = ?")
    .run(Date.now(), reason, Date.now(), gameId, botUserId);
}

export function clearStall(db, gameId, botUserId) {
  db.prepare("UPDATE ai_sessions SET stalled_at = NULL, stall_reason = NULL, last_used_at = ? WHERE game_id = ? AND bot_user_id = ?")
    .run(Date.now(), gameId, botUserId);
}

// Used at server boot to find bot turns that were in-flight or stalled
// when the server stopped, so the orchestrator can resume them.
export function listStalledOrInFlight(db) {
  return db.prepare(`
    SELECT s.* FROM ai_sessions s
    JOIN games g ON g.id = s.game_id
    WHERE g.status = 'active'
      AND (
        s.stalled_at IS NOT NULL
        OR json_extract(g.state, '$.activeUserId') = s.bot_user_id
        OR json_extract(g.state, '$.activeUserId') IS NULL
      )
  `).all().map(rowToSession);
}

export function setPendingSequence(db, gameId, botUserId, sequence) {
  const value = (Array.isArray(sequence) && sequence.length > 0) ? JSON.stringify(sequence) : null;
  db.prepare("UPDATE ai_sessions SET pending_sequence = ?, last_used_at = ? WHERE game_id = ? AND bot_user_id = ?")
    .run(value, Date.now(), gameId, botUserId);
}

export function clearPendingSequence(db, gameId, botUserId) {
  db.prepare("UPDATE ai_sessions SET pending_sequence = NULL, last_used_at = ? WHERE game_id = ? AND bot_user_id = ?")
    .run(Date.now(), gameId, botUserId);
}

// Trash-talk inbox: human → bot. Drained by the orchestrator before each
// bot turn so the LLM can react in its banter. Cleared only after the bot
// successfully acts, so a stalled / retried turn doesn't lose the message.
export function appendUserMessage(db, gameId, botUserId, text) {
  const row = db.prepare("SELECT pending_user_messages FROM ai_sessions WHERE game_id = ? AND bot_user_id = ?").get(gameId, botUserId);
  if (!row) return false;
  const current = row.pending_user_messages ? JSON.parse(row.pending_user_messages) : [];
  current.push({ text, sentAt: Date.now() });
  db.prepare("UPDATE ai_sessions SET pending_user_messages = ?, last_used_at = ? WHERE game_id = ? AND bot_user_id = ?")
    .run(JSON.stringify(current), Date.now(), gameId, botUserId);
  return true;
}

export function peekUserMessages(db, gameId, botUserId) {
  const row = db.prepare("SELECT pending_user_messages FROM ai_sessions WHERE game_id = ? AND bot_user_id = ?").get(gameId, botUserId);
  if (!row || !row.pending_user_messages) return [];
  try { return JSON.parse(row.pending_user_messages); } catch { return []; }
}

export function clearUserMessages(db, gameId, botUserId) {
  db.prepare("UPDATE ai_sessions SET pending_user_messages = NULL, last_used_at = ? WHERE game_id = ? AND bot_user_id = ?")
    .run(Date.now(), gameId, botUserId);
}
