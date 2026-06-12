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
