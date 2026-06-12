# E4-1: N-Player AI Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a single game run multiple AI bots at once — each persona is its own bot user, each bot seat its own `ai_sessions` row — and record team wins as a seat array, proven by 4-player Risk vs a human/bot mix.

**Architecture:** Re-key `ai_sessions` from `game_id` to `(game_id, bot_user_id)`; every session accessor gains a `botUserId` argument. The orchestrator's `_runOnce(gameId)` becomes a loop that drives each eligible bot's full turn in seat order, re-scanning after each bot so turns chain bot→bot without a human poke. The existing per-game `inFlight` lock stays as the serialization point. `winner_seat INTEGER` becomes `winner_seats TEXT` (JSON int array) so a partnership win records both seats. Bots become real `users` rows (one per persona, carrying `persona_id`), so the lobby picks a named persona directly and the N>2 bot rejection is deleted.

**Tech Stack:** Node.js (ESM), better-sqlite3, `node:test` + `node:assert`, Express, SSE. Tests run via `npm test` (`node --test 'test/**/*.test.js'`).

---

## Background: the single-bot assumptions being removed

Reviewer/implementer context — every place that assumes one bot per game:

- `src/server/db.js` — `ai_sessions` PK is `game_id`; `users` has no `persona_id`.
- `src/server/ai/agent-session.js` — every function keyed by `game_id` only; `createAiSession`, `getAiSession`, `setClaudeSessionId`, `bumpResumeCount`, `rotateClaudeSession`, `markStalled`, `clearStall`, `setPendingSequence`, `clearPendingSequence`, `appendUserMessage`, `peekUserMessages`, `clearUserMessages`, `listStalledOrInFlight`.
- `src/server/ai/index.js` — `ensureBotUser` creates ONE generic bot; adapters fixed.
- `src/server/ai/orchestrator.js` — `_runOnce` fetches one session via `getAiSession(db, gameId)`; `winner_seat` written in 3 places as a single int.
- `src/server/routes.js` — creation rejects bots at N>2 (lines ~133-138), requires `personaId` in body (~141-150), creates one session (~174-179); action wake-up checks a single next bot (~322-335); SSE replay / retry / chat / abandon each fetch one session.
- `src/server/games.js` — `endGame` writes `winner_seat`; `rowToGame` reads `winner_seat` (line ~22).
- `public/lobby/lobby.js` — win check `game.winnerSeat === game.you`; separate persona-pick step.

`winner_seat` is also read by the lobby `/api/me` payload. The DB currently holds one discardable 2P Risk game, so wholesale schema replacement is fine.

---

## File Structure

- **`src/server/db.js`** — schema: `ai_sessions` composite PK + index; `users.persona_id`; `games.winner_seats` replaces `winner_seat`. Add a drop trigger for the legacy `winner_seat` shape.
- **`src/server/ai/agent-session.js`** — all accessors re-keyed to `(gameId, botUserId)`; new `listAiSessions(db, gameId)`.
- **`src/server/ai/index.js`** — `ensureBotUsers(db, catalog)` replaces `ensureBotUser`.
- **`src/server/ai/orchestrator.js`** — multi-bot loop in `_runOnce`; `winner_seats` writes via a shared helper.
- **`src/server/games.js`** — `endGame({ winnerSeats })`; `rowToGame` reads `winner_seats`.
- **`src/server/routes.js`** — creation allows bots at N>2, derives persona from bot user, creates one session per bot seat; wake-up schedules on any bot; SSE/retry/chat/abandon iterate sessions.
- **`public/lobby/lobby.js`** — AI personas as roster entries; `winnerSeats.includes(you)`.
- **Tests** — `test/ai-sessions-multi.test.js` (new), `test/ai-orchestrator-multibot.test.js` (new), `test/games-create.test.js` (extend), `test/db-schema.test.js` (extend), `test/lobby.test.js` (extend).

---

## Task 1: `winner_seats` column replaces `winner_seat`

**Files:**
- Modify: `src/server/db.js` (SCHEMA `games` table; `dropLegacyGameTables`)
- Test: `test/db-schema.test.js`

- [ ] **Step 1: Write the failing test**

Add to `test/db-schema.test.js`:

```js
test('games table has winner_seats TEXT, not winner_seat', () => {
  const db = openDb(':memory:');
  const cols = db.prepare("PRAGMA table_info(games)").all();
  const names = cols.map(c => c.name);
  assert.ok(names.includes('winner_seats'), 'winner_seats column present');
  assert.ok(!names.includes('winner_seat'), 'legacy winner_seat column gone');
  assert.strictEqual(cols.find(c => c.name === 'winner_seats').type, 'TEXT');
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern='winner_seats TEXT' test/db-schema.test.js`
Expected: FAIL — `winner_seats column present` (column is currently `winner_seat`).

- [ ] **Step 3: Edit the schema**

In `src/server/db.js`, in the `games` CREATE TABLE, replace:

```
  winner_seat     INTEGER,
```

with:

```
  winner_seats    TEXT,
```

In `dropLegacyGameTables`, broaden the trigger so a DB carrying the old single-seat column is also rebuilt. Replace the guard line:

```js
  if (gamesCols.length === 0 || !gamesCols.includes('player_a_id')) return;
```

with:

```js
  const legacy = gamesCols.includes('player_a_id') || gamesCols.includes('winner_seat');
  if (gamesCols.length === 0 || !legacy) return;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern='winner_seats TEXT' test/db-schema.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db.js test/db-schema.test.js
git commit -m "feat(e4-1): games.winner_seats TEXT replaces winner_seat"
```

---

## Task 2: `endGame` and `rowToGame` speak `winnerSeats`

**Files:**
- Modify: `src/server/games.js` (`endGame` ~103-118; `rowToGame` ~22)
- Test: `test/games.test.js`

- [ ] **Step 1: Write the failing test**

Add to `test/games.test.js` (reuse the file's existing `openDb`/seed helpers; if it seeds via a local `setup()`, follow that pattern):

```js
test('endGame stores winnerSeats array and reads it back', () => {
  const db = openDb(':memory:');
  const u = db.prepare("INSERT INTO users (email, friendly_name, color, created_at) VALUES (?,?,?,?) RETURNING id");
  const a = u.get('a@x', 'A', '#a00', Date.now()).id;
  const b = u.get('b@x', 'B', '#0a0', Date.now()).id;
  const game = createGame(db, { userIds: [a, b], gameType: 'risk', initialState: { seats: [a, b] } });
  endGame(db, game.id, { endedReason: 'plugin', winnerSeats: [1], isDraw: false, finalState: { done: true } });
  const ended = getGameById(db, game.id);
  assert.deepStrictEqual(ended.winnerSeats, [1]);
  assert.strictEqual(ended.status, 'ended');
  db.close();
});

test('endGame stores a partnership win as two seats', () => {
  const db = openDb(':memory:');
  const u = db.prepare("INSERT INTO users (email, friendly_name, color, created_at) VALUES (?,?,?,?) RETURNING id");
  const ids = [0,1,2,3].map(i => u.get(`p${i}@x`, `P${i}`, '#777', Date.now()).id);
  const game = createGame(db, { userIds: ids, gameType: 'cribbage', initialState: { seats: ids } });
  endGame(db, game.id, { endedReason: 'plugin', winnerSeats: [1, 3], isDraw: false, finalState: {} });
  assert.deepStrictEqual(getGameById(db, game.id).winnerSeats, [1, 3]);
  db.close();
});
```

Ensure the test file imports `createGame, endGame, getGameById` from `../src/server/games.js` and `openDb` from `../src/server/db.js` (match existing imports in the file).

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern='winnerSeats' test/games.test.js`
Expected: FAIL — `endGame` rejects the unknown `winnerSeats` option / `ended.winnerSeats` is undefined.

- [ ] **Step 3: Update `rowToGame`**

In `src/server/games.js`, find the `rowToGame` mapping that contains `winnerSeat: row.winner_seat` (~line 22) and replace that line with:

```js
    winnerSeats: row.winner_seats ? JSON.parse(row.winner_seats) : null,
```

- [ ] **Step 4: Update `endGame`**

Replace the whole `endGame` function with:

```js
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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test --test-name-pattern='winnerSeats' test/games.test.js`
Expected: PASS (both tests).

- [ ] **Step 6: Commit**

```bash
git add src/server/games.js test/games.test.js
git commit -m "feat(e4-1): endGame and rowToGame use winnerSeats array"
```

---

## Task 3: Normalize plugin win results to `winnerSeats` (shared helper)

A plugin may return `winnerSeat` (int, Risk), `winnerSide` (`'a'`/`'b'`/`'draw'`, 2P plugins), or — after Waves 3/4 — `winnerSeats` (array). One helper converts any of these to `{ winnerSeats, isDraw }` so the action route and orchestrator never branch on it inline.

**Files:**
- Create: `src/server/win-result.js`
- Test: `test/win-result.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/win-result.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { winSeatsFromState } from '../src/server/win-result.js';

test('winnerSeats array passes through', () => {
  assert.deepEqual(winSeatsFromState({ winnerSeats: [1, 3] }), { winnerSeats: [1, 3], isDraw: false });
});

test('winnerSeat int becomes a one-element array', () => {
  assert.deepEqual(winSeatsFromState({ winnerSeat: 2 }), { winnerSeats: [2], isDraw: false });
});

test('winnerSide a/b maps to seat 0/1', () => {
  assert.deepEqual(winSeatsFromState({ winnerSide: 'a' }), { winnerSeats: [0], isDraw: false });
  assert.deepEqual(winSeatsFromState({ winnerSide: 'b' }), { winnerSeats: [1], isDraw: false });
});

test('draw is explicit, no winners', () => {
  assert.deepEqual(winSeatsFromState({ winnerSide: 'draw' }), { winnerSeats: null, isDraw: true });
});

test('no winner yields nulls', () => {
  assert.deepEqual(winSeatsFromState({}), { winnerSeats: null, isDraw: false });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/win-result.test.js`
Expected: FAIL — `Cannot find module '../src/server/win-result.js'`.

- [ ] **Step 3: Write the helper**

Create `src/server/win-result.js`:

```js
// Normalize a finished plugin state's winner declaration into the platform's
// canonical shape: a seat array plus an explicit draw flag.
//   - winnerSeats: [seat, ...]  (N-player / partnership plugins)
//   - winnerSeat: int           (Risk and other solo N-player plugins)
//   - winnerSide: 'a'|'b'|'draw' (legacy 2P plugins)
export function winSeatsFromState(state) {
  if (Array.isArray(state.winnerSeats)) {
    return { winnerSeats: state.winnerSeats, isDraw: false };
  }
  if (Number.isInteger(state.winnerSeat)) {
    return { winnerSeats: [state.winnerSeat], isDraw: false };
  }
  if (state.winnerSide === 'a') return { winnerSeats: [0], isDraw: false };
  if (state.winnerSide === 'b') return { winnerSeats: [1], isDraw: false };
  if (state.winnerSide === 'draw') return { winnerSeats: null, isDraw: true };
  return { winnerSeats: null, isDraw: false };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/win-result.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/win-result.js test/win-result.test.js
git commit -m "feat(e4-1): winSeatsFromState normalizes plugin win declarations"
```

---

## Task 4: Action route writes `winnerSeats` via the helper

**Files:**
- Modify: `src/server/routes.js` (action route end-of-game block ~289-309)
- Test: `test/action-route.test.js`

- [ ] **Step 1: Read the current block**

In `src/server/routes.js`, the action route currently derives `winnerSeat`/`isDraw` inline and calls `endGame(... { winnerSeat, isDraw ... })`, then builds `endedSummary` with `winnerSeat` and `winnerSide: isDraw ? 'draw' : sideOfSeat(winnerSeat)`. Read lines ~285-309 to anchor the edit.

- [ ] **Step 2: Write the failing test**

Add to `test/action-route.test.js` a test that plays a 2P game to a win through the action route and asserts the ended game row carries `winnerSeats`. Follow the file's existing harness (it already creates a game and POSTs actions). Skeleton:

```js
test('winning action records winnerSeats on the game', async () => {
  // ... existing harness: create a 2P game whose plugin ends with winnerSide 'a'
  // play the winning action via the action route ...
  const ended = getGameById(db, gameId);
  assert.deepStrictEqual(ended.winnerSeats, [0]);
});
```

If `test/action-route.test.js` uses a fake plugin, set its `applyAction` to return `{ ended: true, state: { winnerSide: 'a' } }` on the trigger action.

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test --test-name-pattern='records winnerSeats' test/action-route.test.js`
Expected: FAIL — `ended.winnerSeats` is null/undefined because the route still writes `winnerSeat`.

- [ ] **Step 4: Update the route**

Add the import near the other `src/server` imports at the top of `routes.js`:

```js
import { winSeatsFromState } from './win-result.js';
```

Replace the inline winner derivation + `endGame` call in the action route's end block with:

```js
        const { winnerSeats, isDraw } = winSeatsFromState(newState);
        endGame(db, req.game.id, {
          endedReason: newState.endedReason ?? 'plugin',
          winnerSeats,
          isDraw,
          finalState: newState,
        });
        const endedSummary = {
          kind: 'game-ended',
          reason: newState.endedReason ?? 'plugin',
          winnerSeats,
          winnerSide: isDraw ? 'draw'
            : (winnerSeats && winnerSeats.length === 1 ? sideOfSeat(winnerSeats[0]) : null),
        };
        turnRows.push(appendTurnEntry(db, req.game.id, actorSeat, 'game-ended', endedSummary));
```

(The `winnerSide` in the summary stays one-seat-only for 2P history compatibility; partnership history phrasing lands in Waves 3/4.)

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test --test-name-pattern='records winnerSeats' test/action-route.test.js`
Expected: PASS.

- [ ] **Step 6: Run the full suite to catch winner_seat fallout**

Run: `npm test`
Expected: failures only in tests that assert the old `winnerSeat` field on `/api/me` or game payloads — those are fixed in Task 9 (lobby) and Task 10 (sweep). Note which tests fail; do not fix unrelated ones here.

- [ ] **Step 7: Commit**

```bash
git add src/server/routes.js test/action-route.test.js
git commit -m "feat(e4-1): action route records winnerSeats via helper"
```

---

## Task 5: `ai_sessions` composite key + `users.persona_id`

**Files:**
- Modify: `src/server/db.js` (SCHEMA: `ai_sessions` PK, index; `users.persona_id` column + ALTER)
- Test: `test/db-schema.test.js`

- [ ] **Step 1: Write the failing test**

Add to `test/db-schema.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern='ai_sessions is keyed|persona_id column' test/db-schema.test.js`
Expected: FAIL — PK is `['game_id']`; `persona_id` absent.

- [ ] **Step 3: Update the schema**

In `src/server/db.js`, in the `ai_sessions` CREATE TABLE, change the `game_id` line from:

```
  game_id           INTEGER PRIMARY KEY REFERENCES games(id) ON DELETE CASCADE,
```

to:

```
  game_id           INTEGER NOT NULL REFERENCES games(id) ON DELETE CASCADE,
```

The `bot_user_id` column already exists (`INTEGER NOT NULL REFERENCES users(id)`) — leave it as-is; just append a table-level composite PK and a `game_id` index. Change the closing of the table from:

```
  created_at        INTEGER NOT NULL,
  last_used_at      INTEGER NOT NULL
);
```

to:

```
  created_at        INTEGER NOT NULL,
  last_used_at      INTEGER NOT NULL,
  PRIMARY KEY (game_id, bot_user_id)
);
CREATE INDEX IF NOT EXISTS ai_sessions_by_game ON ai_sessions(game_id);
```

In the `users` CREATE TABLE, add a `persona_id` column after `is_bot`:

```
  is_bot        INTEGER NOT NULL DEFAULT 0,
  persona_id    TEXT,
```

In `openDb`, alongside the existing user-column ALTERs, add:

```js
  if (!userCols.includes('persona_id')) {
    db.exec("ALTER TABLE users ADD COLUMN persona_id TEXT");
  }
```

Because the legacy-rebuild trigger (Task 1) already fires on any pre-existing DB carrying `winner_seat`, an old `ai_sessions` table is dropped and recreated with the new PK; the ALTER is only for the `persona_id` user column on otherwise-current DBs.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern='ai_sessions is keyed|persona_id column' test/db-schema.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/db.js test/db-schema.test.js
git commit -m "feat(e4-1): ai_sessions composite key + users.persona_id"
```

---

## Task 6: Session accessors re-keyed to `(gameId, botUserId)`

Every accessor in `agent-session.js` gains a `botUserId` argument; add `listAiSessions(db, gameId)`. `getAiSession` keeps its name but takes `(db, gameId, botUserId)`.

**Files:**
- Modify: `src/server/ai/agent-session.js` (all functions)
- Test: `test/ai-sessions-multi.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `test/ai-sessions-multi.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/server/db.js';
import { createGame } from '../src/server/games.js';
import {
  createAiSession, getAiSession, listAiSessions,
  setClaudeSessionId, markStalled, clearStall,
  setPendingSequence, appendUserMessage, peekUserMessages, clearUserMessages,
} from '../src/server/ai/agent-session.js';

function seedGameWithTwoBots(db) {
  const u = db.prepare("INSERT INTO users (email, friendly_name, color, is_bot, persona_id, created_at) VALUES (?,?,?,?,?,?) RETURNING id");
  const human = db.prepare("INSERT INTO users (email, friendly_name, color, created_at) VALUES (?,?,?,?) RETURNING id").get('h@x', 'H', '#111', Date.now()).id;
  const bot1 = u.get('ai+hattie@bot.local', 'Hattie', '#a00', 1, 'hattie', Date.now()).id;
  const bot2 = u.get('ai+the-shark@bot.local', 'Shark', '#0a0', 1, 'the-shark', Date.now()).id;
  const game = createGame(db, { userIds: [human, bot1, bot2], gameType: 'risk', initialState: { seats: [human, bot1, bot2] } });
  return { gameId: game.id, human, bot1, bot2 };
}

test('two bot sessions coexist in one game and are listed', () => {
  const db = openDb(':memory:');
  const { gameId, bot1, bot2 } = seedGameWithTwoBots(db);
  createAiSession(db, { gameId, botUserId: bot1, personaId: 'hattie' });
  createAiSession(db, { gameId, botUserId: bot2, personaId: 'the-shark' });
  const all = listAiSessions(db, gameId);
  assert.strictEqual(all.length, 2);
  assert.deepStrictEqual(all.map(s => s.botUserId).sort((a,b)=>a-b), [bot1, bot2].sort((a,b)=>a-b));
  db.close();
});

test('per-bot mutations do not bleed across bots in the same game', () => {
  const db = openDb(':memory:');
  const { gameId, bot1, bot2 } = seedGameWithTwoBots(db);
  createAiSession(db, { gameId, botUserId: bot1, personaId: 'hattie' });
  createAiSession(db, { gameId, botUserId: bot2, personaId: 'the-shark' });
  setClaudeSessionId(db, gameId, bot1, 'sess-1');
  markStalled(db, gameId, bot2, 'timeout');
  const s1 = getAiSession(db, gameId, bot1);
  const s2 = getAiSession(db, gameId, bot2);
  assert.strictEqual(s1.claudeSessionId, 'sess-1');
  assert.strictEqual(s1.stalledAt, null);
  assert.strictEqual(s2.claudeSessionId, null);
  assert.strictEqual(s2.stallReason, 'timeout');
  clearStall(db, gameId, bot2);
  assert.strictEqual(getAiSession(db, gameId, bot2).stalledAt, null);
  db.close();
});

test('trash talk and pending sequence are per-bot', () => {
  const db = openDb(':memory:');
  const { gameId, bot1, bot2 } = seedGameWithTwoBots(db);
  createAiSession(db, { gameId, botUserId: bot1, personaId: 'hattie' });
  createAiSession(db, { gameId, botUserId: bot2, personaId: 'the-shark' });
  appendUserMessage(db, gameId, bot1, 'hi hattie');
  setPendingSequence(db, gameId, bot2, [{ type: 'move' }]);
  assert.deepStrictEqual(peekUserMessages(db, gameId, bot1).map(m => m.text), ['hi hattie']);
  assert.deepStrictEqual(peekUserMessages(db, gameId, bot2), []);
  assert.deepStrictEqual(getAiSession(db, gameId, bot2).pendingSequence, [{ type: 'move' }]);
  clearUserMessages(db, gameId, bot1);
  assert.deepStrictEqual(peekUserMessages(db, gameId, bot1), []);
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ai-sessions-multi.test.js`
Expected: FAIL — `listAiSessions` is not exported; `getAiSession` ignores the 3rd arg.

- [ ] **Step 3: Rewrite `agent-session.js`**

Replace the entire file with the re-keyed version:

```js
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

export function bumpResumeCount(db, gameId, botUserId) {
  db.prepare("UPDATE ai_sessions SET resume_count = resume_count + 1, last_used_at = ? WHERE game_id = ? AND bot_user_id = ?")
    .run(Date.now(), gameId, botUserId);
}

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

// Server-boot resume: any bot session in an active game whose seat is the
// active player, or in a concurrent (activeUserId null) phase, or already
// stalled. One row per (game, bot); the orchestrator re-checks each bot's
// gate before acting, so over-selecting here is harmless.
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ai-sessions-multi.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/server/ai/agent-session.js test/ai-sessions-multi.test.js
git commit -m "feat(e4-1): session accessors keyed by (gameId, botUserId) + listAiSessions"
```

---

## Task 7: Orchestrator drives every eligible bot

`_runOnce(gameId)` becomes: list the game's sessions; loop, and for each session whose gate passes, drive that bot's whole turn (the existing single-bot logic, extracted to `_runBot(gameId, session, depth)`). After a bot finishes, re-scan from the top so a turn that passed to another bot is picked up in the same wake-up. The per-game `inFlight` lock is unchanged — it already serializes all work for a game.

**Files:**
- Modify: `src/server/ai/orchestrator.js`
- Test: `test/ai-orchestrator-multibot.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `test/ai-orchestrator-multibot.test.js`. It wires a fake plugin whose `applyAction` advances `activeUserId` from bot1 → bot2 → human, so one external `runTurn` must drive both bots in sequence. Use a fake LLM that returns the plugin's single legal action.

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/server/db.js';
import { createGame } from '../src/server/games.js';
import { createAiSession } from '../src/server/ai/agent-session.js';
import { createOrchestrator } from '../src/server/ai/orchestrator.js';

function seed(db) {
  const u = db.prepare("INSERT INTO users (email, friendly_name, color, is_bot, persona_id, created_at) VALUES (?,?,?,?,?,?) RETURNING id");
  const human = db.prepare("INSERT INTO users (email, friendly_name, color, created_at) VALUES (?,?,?,?) RETURNING id").get('h@x','H','#111',Date.now()).id;
  const bot1 = u.get('ai+hattie@bot.local','Hattie','#a00',1,'hattie',Date.now()).id;
  const bot2 = u.get('ai+the-shark@bot.local','Shark','#0a0',1,'the-shark',Date.now()).id;
  const seats = [human, bot1, bot2];
  // state.turnIdx points at whose turn it is; bot turns advance it by one.
  const initialState = { seats, turnIdx: 1, activeUserId: bot1 };
  const game = createGame(db, { userIds: seats, gameType: 'faketurn', initialState });
  createAiSession(db, { gameId: game.id, botUserId: bot1, personaId: 'hattie' });
  createAiSession(db, { gameId: game.id, botUserId: bot2, personaId: 'the-shark' });
  return { gameId: game.id, human, bot1, bot2, seats };
}

test('one wake-up drives both bots until the turn returns to the human', async () => {
  const db = openDb(':memory:');
  const { gameId, human, seats } = seed(db);
  const calls = [];
  const fakePlugin = {
    applyAction({ state, actorId }) {
      calls.push(actorId);
      const nextIdx = state.turnIdx + 1;
      const done = nextIdx >= seats.length;
      const next = {
        ...state,
        turnIdx: done ? 0 : nextIdx,
        activeUserId: done ? seats[0] : seats[nextIdx],
      };
      return { state: next, summary: { kind: 'pass' }, ended: false };
    },
  };
  const adapters = {
    faketurn: {
      plugin: fakePlugin,
      chooseAction: async ({ botPlayerIdx }) => ({ action: { type: 'pass' }, usedLlm: false }),
    },
  };
  const personas = new Map([
    ['hattie', { id: 'hattie', displayName: 'Hattie' }],
    ['the-shark', { id: 'the-shark', displayName: 'Shark' }],
  ]);
  const sse = { broadcast() {}, subscriberCount() { return 0; } };
  const orch = createOrchestrator({ db, llm: {}, llmByGameType: {}, sse, personas, adapters });
  await orch.runTurn(gameId);
  // Both bots acted exactly once, in seat order, then control returned to the human.
  assert.deepStrictEqual(calls, [seats[1], seats[2]]);
  const finalState = JSON.parse(db.prepare("SELECT state FROM games WHERE id = ?").get(gameId).state);
  assert.strictEqual(finalState.activeUserId, human);
  db.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/ai-orchestrator-multibot.test.js`
Expected: FAIL — current `_runOnce` calls `getAiSession(db, gameId)` (now requiring a `botUserId`), returns null, logs "no ai_sessions row", and only the first bot (if any) would act. `calls` will not equal `[bot1, bot2]`.

- [ ] **Step 3: Restructure the orchestrator**

In `src/server/ai/orchestrator.js`:

1. Update the import line to pull the per-bot signatures and the lister:

```js
import { getAiSession, listAiSessions, markStalled, clearStall, setPendingSequence, clearPendingSequence, setClaudeSessionId, bumpResumeCount, rotateClaudeSession, peekUserMessages, clearUserMessages } from './agent-session.js';
```

2. Add the import for the win helper near the top:

```js
import { winSeatsFromState } from '../win-result.js';
```

3. Add a shared end-game writer (place it above `createOrchestrator`):

```js
// Single place the orchestrator marks a game ended, so every bot-action path
// records winnerSeats identically.
function writeEndGame(db, gameId, newState) {
  const { winnerSeats, isDraw } = winSeatsFromState(newState);
  db.prepare("UPDATE games SET status='ended', ended_reason=?, winner_seats=?, is_draw=? WHERE id=?")
    .run(newState.endedReason ?? 'plugin',
         winnerSeats == null ? null : JSON.stringify(winnerSeats),
         isDraw ? 1 : 0, gameId);
}
```

4. Replace the three inline `UPDATE games SET status='ended' ... winner_seat=?` blocks (in the auto-action path, the pending-sequence path, and the LLM path) with a call to the helper. Each currently reads:

```js
          db.prepare("UPDATE games SET status='ended', ended_reason=?, winner_seat=?, is_draw=? WHERE id=?")
            .run(newState.endedReason ?? 'plugin',
                 Number.isInteger(newState.winnerSeat) ? newState.winnerSeat
                   : newState.winnerSide === 'a' ? 0 : newState.winnerSide === 'b' ? 1 : null,
                 newState.winnerSide === 'draw' ? 1 : 0, gameId);
```

Replace each with:

```js
          writeEndGame(db, gameId, newState);
```

5. Rename `_runOnce` to `_runBot` and give it a `session` parameter instead of fetching one. Change the signature and delete the fetch+null-guard at the top:

```js
  async function _runBot(gameId, session, depth = 0) {
    const gameRow = db.prepare("SELECT * FROM games WHERE id = ?").get(gameId);
    if (!gameRow || gameRow.status !== 'active') return;
    const state = JSON.parse(gameRow.state);
    // ... rest of the existing body unchanged ...
```

Delete these now-obsolete lines that were at the very top of the old `_runOnce`:

```js
    const session = getAiSession(db, gameId);
    if (!session) {
      logger.warn?.(`[ai] runTurn: no ai_sessions row for game ${gameId}`);
      return;
    }
```

6. Inside `_runBot`, every call that previously passed only `(db, gameId, ...)` to a session mutator now also passes `session.botUserId`. Update each call site in the function body:

- `markStalled(db, gameId, reason)` → `markStalled(db, gameId, session.botUserId, reason)` (all occurrences)
- `clearStall(db, gameId)` → `clearStall(db, gameId, session.botUserId)`
- `setPendingSequence(db, gameId, rest)` → `setPendingSequence(db, gameId, session.botUserId, rest)`
- `setPendingSequence(db, gameId, r.sequenceTail)` → `setPendingSequence(db, gameId, session.botUserId, r.sequenceTail)`
- `clearPendingSequence(db, gameId)` → `clearPendingSequence(db, gameId, session.botUserId)`
- `setClaudeSessionId(db, gameId, r.sessionId)` → `setClaudeSessionId(db, gameId, session.botUserId, r.sessionId)`
- `bumpResumeCount(db, gameId)` → `bumpResumeCount(db, gameId, session.botUserId)`
- `rotateClaudeSession(db, gameId)` → `rotateClaudeSession(db, gameId, session.botUserId)`
- `peekUserMessages(db, gameId)` → `peekUserMessages(db, gameId, session.botUserId)`
- `clearUserMessages(db, gameId)` → `clearUserMessages(db, gameId, session.botUserId)`

7. Every internal recursion `await _runOnce(gameId, N)` inside the body becomes `await _runBot(gameId, session, N)` (same bot keeps driving its own turn).

8. Add the new multi-bot `_runOnce` that scans sessions and drives each eligible bot. Place it directly above `runTurn`:

```js
  // Drive every bot that is eligible to act in this game, in seat order,
  // re-scanning after each bot so a turn that passes bot->bot is continued in
  // the same wake-up. Eligibility mirrors _runBot's own gate (active seat, or
  // an unfilled slot in a concurrent phase); _runBot re-checks and no-ops if
  // the gate fails, so this scan only needs to avoid infinite looping.
  async function _runOnce(gameId) {
    for (let pass = 0; pass < MAX_BOT_PASSES; pass++) {
      const gameRow = db.prepare("SELECT state, status FROM games WHERE id = ?").get(gameId);
      if (!gameRow || gameRow.status !== 'active') return;
      const state = JSON.parse(gameRow.state);
      const sessions = listAiSessions(db, gameId);
      if (sessions.length === 0) return;
      const eligible = sessions.find(s => botEligible(state, s.botUserId));
      if (!eligible) return;
      await _runBot(gameId, eligible);
    }
  }
```

9. Add the eligibility predicate and the pass cap near the top of the module (after `MAX_TURN_DEPTH`):

```js
// Backstop on how many bot turns one external wake-up will chain across a
// game. A 4-player game with 3 bots can legitimately need several passes
// (bot -> bot -> bot -> human); sized well above that.
const MAX_BOT_PASSES = 60;

// Mirror of _runBot's act-or-skip gate, used by the scan loop to pick the
// next bot to drive. Kept in sync with the gate inside _runBot.
function botEligible(state, botUserId) {
  if (state.pendingCombat || state.pendingRoll) return false;
  if (state.activeUserId === botUserId) return true;
  if (state.activeUserId != null) return false;
  const idx = botPlayerIdxOf(state, botUserId);
  const sideKey = idx === 0 ? 'a' : 'b';
  return (
    (state.phase === 'discard' && state.pendingDiscards?.[idx] == null) ||
    (state.phase === 'show' && state.acknowledged?.[idx] === false) ||
    (state.turn?.phase === 'initial-roll' && state.initialRoll?.[sideKey] == null)
  );
}
```

10. `runTurn` is unchanged — it still calls `_runOnce(gameId)` through the `inFlight` chain, which now drives all bots.

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/ai-orchestrator-multibot.test.js`
Expected: PASS — `calls` equals `[bot1, bot2]`, final `activeUserId` is the human.

- [ ] **Step 5: Run the existing orchestrator tests (2P regression)**

Run: `node --test test/ai-orchestrator.test.js test/ai-orchestrator-pending-roll.test.js test/ai-orchestrator-risk-turn.test.js test/ai-cribbage-show-auto.test.js test/cribbage-ai-full-deal.test.js test/ai-backgammon-full-leg.test.js`
Expected: These call `getAiSession(db, gameId)` and the old mutator signatures in their setup/asserts. Where a test constructs sessions or asserts on them, update those calls to pass `botUserId` (the single bot's id, already known in each test's setup). Do NOT change orchestrator behavior to accommodate a test — only the test's own session-accessor calls. Re-run until green.

- [ ] **Step 6: Commit**

```bash
git add src/server/ai/orchestrator.js test/ai-orchestrator-multibot.test.js test/ai-orchestrator.test.js test/ai-orchestrator-pending-roll.test.js test/ai-orchestrator-risk-turn.test.js test/ai-cribbage-show-auto.test.js test/cribbage-ai-full-deal.test.js test/ai-backgammon-full-leg.test.js
git commit -m "feat(e4-1): orchestrator drives every eligible bot per wake-up"
```

---

## Task 8: One bot user per persona at boot

`ensureBotUser` (single generic bot) becomes `ensureBotUsers(db, catalog)` — one user per persona, carrying `persona_id`, friendly name / color / glyph from the persona. Idempotent on `email`.

**Files:**
- Modify: `src/server/ai/index.js` (`ensureBotUser` → `ensureBotUsers`; call site in `bootAiSubsystem`)
- Test: `test/ai-bootstrap.test.js`

- [ ] **Step 1: Write the failing test**

Add to `test/ai-bootstrap.test.js` (follow the file's existing boot harness / `openDb`):

```js
test('boot creates one bot user per persona, carrying persona_id', () => {
  const db = openDb(':memory:');
  bootAiSubsystem({ db, sse: fakeSse(), llm: fakeLlm(), personaDir: REAL_PERSONA_DIR });
  const bots = db.prepare("SELECT friendly_name, persona_id, is_bot FROM users WHERE is_bot = 1 ORDER BY persona_id").all();
  // One bot per persona file on disk.
  const personaCount = readdirSync(REAL_PERSONA_DIR).filter(f => f.endsWith('.yaml')).length;
  assert.strictEqual(bots.length, personaCount);
  assert.ok(bots.every(b => typeof b.persona_id === 'string' && b.persona_id.length > 0));
  db.close();
});

test('boot is idempotent — second boot adds no duplicate bot users', () => {
  const db = openDb(':memory:');
  bootAiSubsystem({ db, sse: fakeSse(), llm: fakeLlm(), personaDir: REAL_PERSONA_DIR });
  const first = db.prepare("SELECT COUNT(*) n FROM users WHERE is_bot = 1").get().n;
  bootAiSubsystem({ db, sse: fakeSse(), llm: fakeLlm(), personaDir: REAL_PERSONA_DIR });
  const second = db.prepare("SELECT COUNT(*) n FROM users WHERE is_bot = 1").get().n;
  assert.strictEqual(first, second);
  db.close();
});
```

Add any missing imports the test needs at the top of the file: `readdirSync` from `node:fs`, and a `REAL_PERSONA_DIR` constant pointing at `resolve(<repo>/data/ai-personas)`. If the file already defines `fakeSse`/`fakeLlm`/a persona dir constant, reuse them.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern='one bot user per persona|idempotent' test/ai-bootstrap.test.js`
Expected: FAIL — only one generic `AI Opponent` bot exists; `persona_id` is null.

- [ ] **Step 3: Replace `ensureBotUser`**

In `src/server/ai/index.js`, delete the `DEFAULT_BOT_EMAIL` / `DEFAULT_BOT_NAME` constants and the `ensureBotUser` function, and add:

```js
// One bot user per persona. The user IS the persona: its persona_id ties the
// roster pick to the AI session created at game start, and to the portrait
// served at /shared/portraits/{personaId}.png. Idempotent on email.
function ensureBotUsers(db, catalog) {
  const now = Date.now();
  const insert = db.prepare(`
    INSERT INTO users (email, friendly_name, color, glyph, is_bot, persona_id, created_at)
    VALUES (?, ?, ?, ?, 1, ?, ?)
    ON CONFLICT(email) DO UPDATE SET
      friendly_name = excluded.friendly_name,
      color = excluded.color,
      glyph = excluded.glyph,
      persona_id = excluded.persona_id
  `);
  for (const p of catalog.values()) {
    insert.run(`ai+${p.id}@bot.local`, p.displayName, p.color, p.glyph, p.id, now);
  }
}
```

Update the call in `bootAiSubsystem` — replace:

```js
  ensureBotUser(db);
```

with:

```js
  ensureBotUsers(db, catalog);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --test-name-pattern='one bot user per persona|idempotent' test/ai-bootstrap.test.js`
Expected: PASS.

- [ ] **Step 5: Run the full bootstrap test file**

Run: `node --test test/ai-bootstrap.test.js`
Expected: PASS. If a test asserted the old single `AI Opponent` bot, update it to the per-persona reality (the bot for a given persona is `WHERE persona_id = ?`).

- [ ] **Step 6: Commit**

```bash
git add src/server/ai/index.js test/ai-bootstrap.test.js
git commit -m "feat(e4-1): one bot user per persona at boot (ensureBotUsers)"
```

---

## Task 9: Game creation allows bots at N>2; one session per bot seat

Delete the N>2 bot rejection. A bot opponent's persona comes from its user row (`persona_id`), not the request body. Create one `ai_sessions` row per bot seat and kick the orchestrator once.

**Files:**
- Modify: `src/server/routes.js` (creation path ~128-181)
- Test: `test/games-create.test.js`

- [ ] **Step 1: Write the failing tests**

Add to `test/games-create.test.js` (follow the file's existing app/supertest harness and seed helpers; seed bots with `is_bot=1, persona_id` set):

```js
test('creates a 4-player game with two human-picked AI personas', async () => {
  // seed: creator + 1 human + 2 bot users (persona_id 'hattie','the-shark'),
  // and a plugin registered as risk with players {min:2,max:4}.
  const res = await postGame({ as: creator, opponentIds: [human2, botHattie, botShark], gameType: 'risk' });
  assert.strictEqual(res.status, 200);
  const sessions = db.prepare("SELECT bot_user_id, persona_id FROM ai_sessions WHERE game_id = ? ORDER BY bot_user_id").all(res.body.id);
  assert.strictEqual(sessions.length, 2);
  const byBot = Object.fromEntries(sessions.map(s => [s.bot_user_id, s.persona_id]));
  assert.strictEqual(byBot[botHattie], 'hattie');
  assert.strictEqual(byBot[botShark], 'the-shark');
});

test('bot persona is taken from the user row, not the request body', async () => {
  const res = await postGame({ as: creator, opponentIds: [botHattie], gameType: 'risk' });
  // 2P bot game: still creates exactly one session with the bot's own persona.
  assert.strictEqual(res.status, 200);
  const s = db.prepare("SELECT persona_id FROM ai_sessions WHERE game_id = ?").get(res.body.id);
  assert.strictEqual(s.persona_id, 'hattie');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test --test-name-pattern='two human-picked AI personas|persona is taken from the user row' test/games-create.test.js`
Expected: FAIL — the N>2 bot rejection returns 400 for the first; the second still requires `personaId` in the body.

- [ ] **Step 3: Update the creation path**

In `src/server/routes.js`, delete the N>2 rejection block:

```js
    const botRows = opponentRows.filter(r => r.is_bot === 1);
    // AI orchestration is 2P-only (one bot per game): bots are allowed only
    // in a 2-player game where the single opponent is the bot.
    if (botRows.length > 0 && totalPlayers > 2) {
      return res.status(400).json({ error: 'AI opponents are not supported in multiplayer games' });
    }
    const opponentIsBot = botRows.length === 1 && totalPlayers === 2;

    let personaId = null;
    if (opponentIsBot) {
      personaId = req.body?.personaId;
      if (typeof personaId !== 'string' || !personaId) {
        return res.status(400).json({ error: 'personaId required for AI opponent' });
      }
      if (!ai?.personas?.has(personaId)) {
        return res.status(400).json({ error: `unknown personaId: ${personaId}` });
      }
    }
```

Replace it with persona-from-user-row resolution. Fetch `is_bot` and `persona_id` for each opponent (extend the existing `opponentRows` query to select `persona_id`), then:

```js
    // Each bot opponent carries its own persona on the user row (one bot user
    // per persona). The roster picks the persona directly — no body.personaId.
    const botSeats = [];
    for (let i = 0; i < opponentIds.length; i++) {
      const row = opponentRows[i];
      if (row.is_bot !== 1) continue;
      if (!ai) {
        return res.status(400).json({ error: 'AI opponents are not available' });
      }
      if (!row.persona_id || !ai.personas.has(row.persona_id)) {
        return res.status(400).json({ error: `bot user ${row.id} has no valid persona` });
      }
      // Seat = creator(0) + opponent index + 1.
      botSeats.push({ seat: i + 1, botUserId: row.id, personaId: row.persona_id });
    }
```

Update the `opponentRows` fetch to include `persona_id`:

```js
    const opponentRows = opponentIds.map(id =>
      db.prepare('SELECT id, is_bot, persona_id FROM users WHERE id = ?').get(id));
```

Replace the single-session creation block:

```js
    const game = createGame(db, { userIds: roster, gameType, initialState });
    if (opponentIsBot && ai) {
      createAiSession(db, { gameId: game.id, botUserId: opponentIds[0], personaId });
      // Kick the bot immediately ...
      ai.orchestrator.scheduleTurn(game.id);
    }
    res.json({ id: game.id, gameType });
```

with:

```js
    const game = createGame(db, { userIds: roster, gameType, initialState });
    if (botSeats.length > 0 && ai) {
      for (const b of botSeats) {
        createAiSession(db, { gameId: game.id, botUserId: b.botUserId, personaId: b.personaId });
      }
      // One kick drives whichever bot is first to act; the orchestrator chains
      // the rest within the same wake-up.
      ai.orchestrator.scheduleTurn(game.id);
    }
    res.json({ id: game.id, gameType });
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test --test-name-pattern='two human-picked AI personas|persona is taken from the user row' test/games-create.test.js`
Expected: PASS.

- [ ] **Step 5: Fix the remaining single-session route call sites**

Several routes still call `getAiSession(db, req.game.id)` (2-arg) and the old session mutators. Update them:

- **SSE replay** (`/api/games/:gameId/events`, ~213-245): replace the single `getAiSession` + single-bot status replay with a loop over `listAiSessions(db, req.game.id)`, emitting `bot_stalled` / `bot_thinking` per stalled/eligible bot. Use the existing `seatOfState`/`sideOfSeat` helpers per session. If any bot is eligible and nothing is in flight, call `ai.orchestrator.scheduleTurn(req.game.id)` once (outside the loop).
- **Action wake-up** (~322-335): the `nextActiveUserId` bot check stays, but the concurrent-phase branch must fire if *any* bot session exists:

```js
        } else if (nextActiveUserId == null) {
          const has = db.prepare("SELECT 1 FROM ai_sessions WHERE game_id = ? LIMIT 1").get(req.game.id);
          if (has) ai.orchestrator.scheduleTurn(req.game.id);
        }
```

- **Retry** (`/api/games/:gameId/ai/retry`): the request targets a specific bot. Accept `botUserId` in the body; default to the sole bot if the game has exactly one session (back-comat). Replace the body with:

```js
    const sessions = listAiSessions(db, req.game.id);
    if (sessions.length === 0) return res.status(404).json({ error: 'no AI session' });
    const botUserId = Number.isInteger(req.body?.botUserId)
      ? req.body.botUserId
      : (sessions.length === 1 ? sessions[0].botUserId : null);
    if (botUserId == null) return res.status(400).json({ error: 'botUserId required' });
    const sess = getAiSession(db, req.game.id, botUserId);
    if (!sess) return res.status(404).json({ error: 'no AI session for bot' });
    if (sess.stalledAt == null) return res.status(422).json({ error: 'not stalled' });
    clearStall(db, req.game.id, botUserId);
    ai.orchestrator.scheduleTurn(req.game.id);
    res.json({ ok: true });
```

- **Chat** (`/api/games/:gameId/chat`): trash talk now needs a target bot. Accept `botUserId`; default to the sole bot:

```js
    const sessions = listAiSessions(db, req.game.id);
    if (sessions.length === 0) return res.status(404).json({ error: 'no AI session' });
    const botUserId = Number.isInteger(req.body?.botUserId)
      ? req.body.botUserId
      : (sessions.length === 1 ? sessions[0].botUserId : null);
    if (botUserId == null) return res.status(400).json({ error: 'botUserId required' });
    // ... existing text validation ...
    appendUserMessage(db, req.game.id, botUserId, text);
```

- **Abandon** (`/api/games/:gameId/ai/abandon`): replace `getAiSession(db, req.game.id)` with an existence check `listAiSessions(db, req.game.id).length > 0`; the rest (ending the game) is unchanged. Use `winner_seats=NULL` in its UPDATE (it currently sets `winner_seat=NULL`):

```js
    db.prepare("UPDATE games SET status='ended', ended_reason=?, winner_seats=NULL, updated_at=? WHERE id=?")
      .run('ai_stalled', Date.now(), req.game.id);
```

Update the `routes.js` import line to include `listAiSessions`:

```js
import { createAiSession, getAiSession, listAiSessions, clearStall, appendUserMessage } from './ai/agent-session.js';
```

- [ ] **Step 6: Run the route + AI test files**

Run: `node --test test/games-create.test.js test/action-route.test.js test/ai-agent-session.test.js test/games.test.js`
Expected: PASS. Update any test still calling 2-arg session accessors or asserting the old `personaId`-in-body contract.

- [ ] **Step 7: Commit**

```bash
git add src/server/routes.js test/games-create.test.js
git commit -m "feat(e4-1): create one AI session per bot seat; allow bots at N>2"
```

---

## Task 10: Lobby — AI personas as roster entries; winnerSeats read

**Files:**
- Modify: `public/lobby/lobby.js` (opponent/add-players steps; persona step removal; `endedCard` win check)
- Test: `test/lobby.test.js`

- [ ] **Step 1: Write the failing test**

`test/lobby.test.js` is server-side (it tests `/api/me` and `/api/users` payloads). Add a test that a 4P game won by a partner shows as a win for both partners' `/api/me`, and that `/api/users` exposes bots with `personaId`:

```js
test('/api/users exposes bots with personaId', async () => {
  // seed one bot user persona_id 'hattie'
  const res = await getUsers({ as: human });
  const bot = res.body.find(u => u.isBot);
  assert.ok(bot);
  assert.strictEqual(bot.personaId, 'hattie');
});

test('/api/me marks a partnership win for both seats', async () => {
  // create a 4P cribbage game, end it with winnerSeats [1,3]
  endGame(db, gameId, { endedReason: 'plugin', winnerSeats: [1, 3], isDraw: false, finalState: {} });
  const meSeat1 = await getMe({ as: seat1User });
  const g1 = meSeat1.body.games.find(g => g.id === gameId);
  assert.strictEqual(g1.won, true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --test-name-pattern='exposes bots with personaId|partnership win for both seats' test/lobby.test.js`
Expected: FAIL — `/api/users` omits `personaId`; `/api/me` win logic uses `winnerSeat`.

- [ ] **Step 3: Expose `personaId` on `/api/users`**

In `src/server/routes.js`, the `/api/users` handler maps users. Add `personaId`:

```js
  app.get('/api/users', requireIdentity, (_req, res) => {
    res.json(listUsers(db).map(u => ({
      id: u.id, friendlyName: u.friendlyName, color: u.color, glyph: u.glyph,
      isBot: u.isBot, personaId: u.personaId ?? null,
    })));
  });
```

Confirm `listUsers`/`getUserById` map `persona_id` → `personaId` in `games.js` (or wherever `listUsers` lives). If not, add `personaId: row.persona_id` to that mapping.

- [ ] **Step 4: Update `/api/me` win logic**

Find where `/api/me` builds each game's `won`/outcome (it currently uses `winnerSeat`). Replace the single-seat check with membership:

```js
      const winnerSeats = g.winnerSeats; // array or null
      const won = Array.isArray(winnerSeats) && winnerSeats.includes(yourSeat);
```

Wherever the payload echoes `winnerSeat`, change it to `winnerSeats` (array).

- [ ] **Step 5: Update the lobby client**

In `public/lobby/lobby.js`:

- In `endedCard()` replace `const won = game.winnerSeat != null && game.winnerSeat === game.you;` with:

```js
  const won = Array.isArray(game.winnerSeats) && game.winnerSeats.includes(game.you);
```

and the winner-name lookup `opponents.find(o => o.seat === game.winnerSeat)` with a seats-aware version:

```js
  const winnerOpp = Array.isArray(game.winnerSeats)
    ? opponents.find(o => game.winnerSeats.includes(o.seat))
    : null;
```

- In the opponent/add-players flow, render bots as selectable roster entries: when listing users, group `isBot` users under an "AI players" heading. Each bot picked occupies a normal opponent slot — no separate persona step. Remove the `showPersonaStep()` branch and its call; the bot's persona is its identity. The POST body stays `{ opponentIds, gameType }` (no `personaId`). Keep the existing `maxExtra = players.max - 2` add-players cap, but allow bots into those slots (delete the `.filter(u => !u.isBot)` on the add-players candidate list).

- [ ] **Step 6: Run test to verify it passes**

Run: `node --test --test-name-pattern='exposes bots with personaId|partnership win for both seats' test/lobby.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/server/routes.js public/lobby/lobby.js test/lobby.test.js
git commit -m "feat(e4-1): lobby picks AI personas as roster entries; winnerSeats read"
```

---

## Task 11: Headless N-seat harness + 4P Risk vs bots (acceptance)

The acceptance criterion: a 4-player Risk game with a human/bot mix plays to a winner end-to-end, driven server-side. The headless harness currently assumes 2 seats.

**Files:**
- Modify: the headless harness (locate via `grep -rl "headless" test/ src/` — likely `test/_helpers/` or a `risk-full-game` driver)
- Test: `test/risk-multiplayer.test.js` (extend) or new `test/ai-risk-4p-multibot.test.js`

- [ ] **Step 1: Locate the harness**

Run: `grep -rln "initialState\|applyAction" test/_helpers/ test/risk-full-game.test.js test/risk-multiplayer.test.js`
Read the existing 4P Risk driver in `test/risk-multiplayer.test.js` (198 lines, added with the June 7 work) to reuse its seat-driving loop.

- [ ] **Step 2: Write the failing test**

Create `test/ai-risk-4p-multibot.test.js`: seed a 4-seat Risk game (1 human + 3 bot personas), create 3 AI sessions, then drive the game by alternately (a) applying the human's seat actions directly via the plugin and (b) calling `orchestrator.runTurn(gameId)` to let all bots take their turns, until `status='ended'`. Assert the game ends with a non-null `winnerSeats` of length 1, and that every bot got at least one turn (track via a counting fake LLM or the turn_log seats).

```js
test('4-player Risk with three bots plays to a winner', async () => {
  // ... seed, create sessions, drive loop ...
  const ended = getGameById(db, gameId);
  assert.strictEqual(ended.status, 'ended');
  assert.ok(Array.isArray(ended.winnerSeats) && ended.winnerSeats.length === 1);
  const seatsThatActed = new Set(db.prepare("SELECT DISTINCT seat FROM turn_log WHERE game_id = ?").all(gameId).map(r => r.seat));
  assert.ok([1,2,3].every(s => seatsThatActed.has(s)), 'all three bot seats took turns');
});
```

Use a deterministic fake LLM that always picks the first legal Risk action so the game terminates without real subprocesses. If a full game is too long to terminate deterministically, scope the assertion to "the game advances through all four seats at least one full round and records turn_log entries for each bot seat" rather than full termination — note this scoping in the test comment.

- [ ] **Step 3: Run test to verify it fails**

Run: `node --test test/ai-risk-4p-multibot.test.js`
Expected: FAIL — until the harness drives N seats and the orchestrator chains all three bots.

- [ ] **Step 4: Generalize the harness to N seats**

Update the harness's seat loop to iterate `state.seats.length` instead of a hardcoded 2, and to call `orchestrator.runTurn` whenever the active seat is a bot. (Exact edit depends on the located file; follow its existing structure — replace any `[0, 1]` / `a`/`b` seat iteration with `state.seats.map((_, i) => i)`.)

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/ai-risk-4p-multibot.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add test/ai-risk-4p-multibot.test.js <harness file>
git commit -m "test(e4-1): 4-player Risk vs three bots plays to a winner"
```

---

## Task 12: Full-suite green + winner_seat sweep

**Files:**
- Modify: any remaining test or source referencing `winner_seat` (singular) or 2-arg session accessors

- [ ] **Step 1: Find stragglers**

Run: `grep -rn "winner_seat\b\|winnerSeat\b" src/ public/ test/ | grep -v winner_seats | grep -v winnerSeats`
Expected: a short list. For each: source files must use `winner_seats`/`winnerSeats`; test files must assert the array shape. (The turn-summary `winnerSide` field is intentionally retained — leave it.)

- [ ] **Step 2: Find 2-arg session accessor stragglers**

Run: `grep -rn "getAiSession(db, [a-zA-Z._]*)\b" src/ test/ | grep -v "botUserId\|, bot"`
Inspect each hit; any `getAiSession(db, gameId)` with no third arg is a bug — fix to pass the bot id (or switch to `listAiSessions` where a game-wide scan is meant).

- [ ] **Step 3: Run the whole suite**

Run: `npm test`
Expected: PASS — same count as the pre-E4-1 baseline (1115 passing, 1 skipped) plus the new E4-1 tests, zero failures. Every previously-passing 2P test still passes unchanged in behavior (only session-accessor call signatures in test setup may have changed).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "test(e4-1): full suite green; winner_seat -> winner_seats sweep"
```

---

## Self-Review Notes (completed during planning)

- **Spec coverage (Section 1 of the design):** per-persona bot users → Task 8; lobby roster picker + persona step removal → Task 10; composite `ai_sessions` → Tasks 5, 6; multi-bot wake-up + turn chaining → Task 7; in-flight lock retained (Task 7, `runTurn` unchanged); `winner_seats` array → Tasks 1, 2, 3, 4; lobby win check → Task 10; delete N>2 bot rejection + Risk proof → Tasks 9, 11; headless N-seat harness → Task 11; migration wholesale drop → Task 1 (`dropLegacyGameTables` trigger).
- **Type consistency:** `winSeatsFromState` returns `{ winnerSeats, isDraw }` and is the only winner-normalizer (used by Task 4 route + Task 7 orchestrator). `endGame` takes `winnerSeats`. Session accessors uniformly take `(db, gameId, botUserId, ...)`. `listAiSessions(db, gameId)` is the only game-wide scan.
- **Deferred to later waves (not this plan):** Sorry!/cribbage/buraco state-shape changes; partnership `winnerSeats` history phrasing; per-bot retry/chat UI in the client (server accepts `botUserId`; the lobby/game client wiring for targeting a specific bot is a thin follow-up noted in Task 9/10 and revisited in the game waves).
```
