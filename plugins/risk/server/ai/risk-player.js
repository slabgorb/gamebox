// plugins/risk/server/ai/risk-player.js
import { enumerateLegalMoves } from './legal-moves.js';
import { scoreCandidate } from './board-eval.js';
import { buildTurnPrompt, parseLlmResponse } from './prompts.js';
import { InvalidLlmResponse, InvalidLlmMove } from '../../../../src/server/ai/errors.js';

export { InvalidLlmResponse, InvalidLlmMove };

const MAX_SHORTLIST = 6;
const TERMINATORS_BY_PHASE = { attack: 'end-attack', fortify: 'end-turn' };

export async function chooseAction({ llm, persona, sessionId, state, botPlayerIdx, userMessages = [] }) {
  const moves = enumerateLegalMoves(state, botPlayerIdx);
  if (moves.length === 0) {
    throw new Error(`no legal moves for phase '${state.phase}'`);
  }

  const scored = moves
    .map(m => ({ ...m, score: scoreCandidate(state, botPlayerIdx, m.action) }))
    .sort((a, b) => b.score - a.score);
  const shortlist = scored.slice(0, MAX_SHORTLIST);

  // Force-include the phase terminator (end-attack / end-turn) if it was
  // pushed out of the top-N by higher-scoring moves. Phase terminators
  // are not optional — the bot must always be able to signal "I'm done
  // with this phase," and silent omission causes forfeits when the LLM
  // picks the terminator anyway.
  const terminatorId = TERMINATORS_BY_PHASE[state.phase];
  if (terminatorId && !shortlist.some(m => m.id === terminatorId)) {
    const terminator = scored.find(m => m.id === terminatorId);
    if (terminator) shortlist.push(terminator);
  }

  const prompt = buildTurnPrompt({ state, shortlist, botPlayerIdx, userMessages });
  const r = await llm.send({
    prompt,
    sessionId,
    systemPrompt: sessionId ? null : persona.systemPrompt,
  });

  let parsed;
  try { parsed = parseLlmResponse(r.text); }
  catch (e) { throw new InvalidLlmResponse(e.message); }

  const match = shortlist.find(m => m.id === parsed.moveId);
  if (!match) throw new InvalidLlmMove(parsed.moveId, shortlist.map(m => m.id));

  return {
    action: match.action,
    banter: parsed.banter,
    sessionId: r.sessionId,
    sequenceTail: [],
  };
}
