import { legalMoves } from '../rules/legal-moves.js';
import { buildTurnPrompt, parseLlmResponse } from './prompts.js';

// Drive the bot's turn. Unlike backgammon (which throws on a bad LLM
// response), Sorry! must never deadlock a solo game: any unparseable or
// illegal LLM output falls back to a random legal move. The bot only ever
// emits a 'move' action — card draw is a server-authoritative rule step.
export async function chooseAction({ llm, persona, sessionId, state, botPlayerIdx, userMessages = [] }) {
  const moves = legalMoves(state);

  // No legal move: the only action is to pass. Resolve it mechanically — skip
  // the LLM (and never index an empty move list, which used to crash the turn).
  if (moves.length === 0) {
    return { action: { type: 'pass' }, usedLlm: false };
  }

  const prompt = buildTurnPrompt({ state, legalMoves: moves, botPlayerIdx, userMessages });

  const r = await llm.send({
    prompt,
    sessionId,
    systemPrompt: sessionId ? null : persona.systemPrompt,
  });

  let parsed = null;
  try {
    parsed = parseLlmResponse(r.text);
  } catch {
    // Unparseable LLM output — defensive random fallback below keeps play moving.
    parsed = null;
  }

  const match = parsed ? moves.find((m) => m.id === parsed.moveId) : null;

  let chosen;
  let banter;
  if (match) {
    chosen = match;
    banter = parsed.banter;
  } else {
    // Bad JSON or an illegal moveId: pick a random legal move, drop the banter.
    chosen = moves[Math.floor(Math.random() * moves.length)];
    banter = '';
  }

  return {
    action: { type: 'move', payload: { moveId: chosen.id } },
    banter,
    sessionId: r.sessionId,
  };
}
