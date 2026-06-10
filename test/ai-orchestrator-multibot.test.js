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
  assert.deepStrictEqual(calls, [seats[1], seats[2]]);
  const finalState = JSON.parse(db.prepare("SELECT state FROM games WHERE id = ?").get(gameId).state);
  assert.strictEqual(finalState.activeUserId, human);
  db.close();
});
