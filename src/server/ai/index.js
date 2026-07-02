import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { loadPersonaCatalog } from './persona-catalog.js';
import { createOrchestrator } from './orchestrator.js';
import { listStalledOrInFlight } from './agent-session.js';
import { ClaudeCliClient, modelForGameType } from './llm-client.js';
import cribbagePlugin from '../../../plugins/cribbage/plugin.js';
import { chooseAction as cribbageChoose, chooseBanter as cribbageBanter } from '../../../plugins/cribbage/server/ai/cribbage-player.js';
import backgammonPlugin from '../../../plugins/backgammon/plugin.js';
import { chooseAction as backgammonChoose } from '../../../plugins/backgammon/server/ai/backgammon-player.js';
import wordsPlugin from '../../../plugins/words/plugin.js';
import { chooseAction as wordsChoose } from '../../../plugins/words/server/ai/words-player.js';
import riskPlugin from '../../../plugins/risk/plugin.js';
import { chooseAction as riskChoose, resolvePendingCombat as riskResolvePending } from '../../../plugins/risk/server/ai/risk-player.js';
import sorryPlugin from '../../../plugins/sorry/plugin.js';
import { chooseAction as sorryChoose } from '../../../plugins/sorry/server/ai/sorry-player.js';
import cluePlugin from '../../../plugins/clue/plugin.js';
import { chooseAction as clueChoose } from '../../../plugins/clue/server/ai/clue-player.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');
const DEFAULT_PERSONA_DIR = resolve(PROJECT_ROOT, 'data', 'ai-personas');

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

export function bootAiSubsystem({ db, sse, llm, personaDir = DEFAULT_PERSONA_DIR }) {
  if (!existsSync(personaDir)) {
    throw new Error(`AI persona directory not found: ${personaDir}`);
  }
  const catalog = loadPersonaCatalog(personaDir);
  if (catalog.size === 0) throw new Error(`No personas loaded from ${personaDir}`);
  ensureBotUsers(db, catalog);

  const client = llm ?? new ClaudeCliClient({});
  const adapters = {
    cribbage:   { plugin: cribbagePlugin,   chooseAction: cribbageChoose, chooseBanter: cribbageBanter },
    backgammon: { plugin: backgammonPlugin, chooseAction: backgammonChoose },
    words:      { plugin: wordsPlugin,      chooseAction: wordsChoose },
    risk:       { plugin: riskPlugin,       chooseAction: riskChoose, resolvePending: riskResolvePending },
    sorry:      { plugin: sorryPlugin,      chooseAction: sorryChoose },
    clue:       { plugin: cluePlugin,       chooseAction: clueChoose },
  };
  // Per-game-type client map: each adapter gets a client at its resolved
  // model (Risk → Sonnet, others → Haiku). An injected `llm` (tests) is
  // reused for every game type so fakes still drive all adapters.
  const llmByGameType = {};
  for (const gameType of Object.keys(adapters)) {
    llmByGameType[gameType] = llm ?? new ClaudeCliClient({ model: modelForGameType(gameType) });
  }
  const orchestrator = createOrchestrator({
    db, llm: client, llmByGameType, sse, personas: catalog, adapters,
  });

  for (const sess of listStalledOrInFlight(db)) {
    orchestrator.scheduleTurn(sess.gameId);
  }

  return { orchestrator, personas: catalog, llmByGameType };
}
