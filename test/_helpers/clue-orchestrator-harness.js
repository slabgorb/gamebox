// E6-5 harness — boots the REAL AI subsystem (temp-file DB, real persona
// catalog, FakeLlmClient, recording SSE) around a 3-seat clue game:
// seat 0 = human A, seat 1 = the miss-scarlett bot, seat 2 = human B.
// One bot keeps the wake-up continuation chain bounded and observable.
// Modeled on test/ai-orchestrator-pending-roll.test.js.
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../../src/server/db.js';
import { FakeLlmClient } from '../../src/server/ai/fake-llm-client.js';
import { bootAiSubsystem } from '../../src/server/ai/index.js';
import { createAiSession } from '../../src/server/ai/agent-session.js';
import { buildInitialState } from '../../plugins/clue/server/state.js';
import { det } from './clue-fixtures.js';
import { insertGame } from './games.js';

export const BOT_PERSONA = 'miss-scarlett';

export function bootClueGame({ llmResponses = [], mutateState = () => {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'clue-orch-'));
  const db = openDb(join(dir, 'test.db'));
  const now = Date.now();
  const broadcasts = [];
  const sse = { broadcast: (gid, ev) => broadcasts.push({ gid, ...ev }) };
  const llm = new FakeLlmClient(llmResponses);
  const personaDir = join(process.cwd(), 'data', 'ai-personas');
  const boot = bootAiSubsystem({ db, sse, llm, personaDir });

  const insUser = db.prepare(
    "INSERT INTO users (email, friendly_name, color, created_at) VALUES (?, ?, '#000', ?) RETURNING id",
  );
  const humanA = insUser.get('human-a@x', 'Human A', now).id;
  const humanB = insUser.get('human-b@x', 'Human B', now).id;
  const botId = db.prepare('SELECT id FROM users WHERE persona_id = ?').get(BOT_PERSONA).id;

  const seats = [humanA, botId, humanB];
  const state = buildInitialState({
    participants: seats.map((userId, seat) => ({ userId, seat })),
    rng: det(42),
  });
  mutateState(state, { seats, humanA, botId, humanB });

  const gameId = insertGame(db, { players: seats, gameType: 'clue', state });
  createAiSession(db, { gameId, botUserId: botId, personaId: BOT_PERSONA });

  return {
    db, gameId, seats, humanA, botId, humanB, broadcasts, llm,
    orchestrator: boot.orchestrator, boot,
  };
}

export function gameState(db, gameId) {
  return JSON.parse(db.prepare('SELECT state FROM games WHERE id = ?').get(gameId).state);
}

export function rawState(db, gameId) {
  return db.prepare('SELECT state FROM games WHERE id = ?').get(gameId).state;
}
