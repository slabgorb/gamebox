// plugins/risk/server/ai/risk-player.js
import { enumerateLegalMoves } from './legal-moves.js';
import { scoreCandidate } from './board-eval.js';
import { buildTurnPrompt, parseLlmResponse } from './prompts.js';
import { InvalidLlmResponse, InvalidLlmMove } from '../../../../src/server/ai/errors.js';

export { InvalidLlmResponse, InvalidLlmMove };

const MAX_SHORTLIST = 6;
const TERMINATORS_BY_PHASE = { attack: 'end-attack', fortify: 'end-turn' };

export async function chooseAction({
  llm, persona, sessionId, state, botPlayerIdx, userMessages = [], mode = 'live',
}) {
  const moves = enumerateLegalMoves(state, botPlayerIdx);
  if (moves.length === 0) {
    throw new Error(`no legal moves for phase '${state.phase}'`);
  }

  const scored = moves
    .map(m => ({ ...m, score: scoreCandidate(state, botPlayerIdx, m.action) }))
    .sort((a, b) => b.score - a.score);
  const shortlist = scored.slice(0, MAX_SHORTLIST);

  // Phase terminators are not optional — force-include them.
  const terminatorId = TERMINATORS_BY_PHASE[state.phase];
  if (terminatorId && !shortlist.some(m => m.id === terminatorId)) {
    const terminator = scored.find(m => m.id === terminatorId);
    if (terminator) shortlist.push(terminator);
  }

  const prompt = buildTurnPrompt({ state, shortlist, botPlayerIdx, userMessages, mode });
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

  // Serialize shortlist to a slim {id, summary, score} shape suitable for
  // training-corpus consumption — drop the full action payload (derivable
  // from state + id at training-prep time) to keep transcript lines small.
  const slimShortlist = shortlist.map(m => ({
    id: m.id,
    summary: m.summary,
    score: m.score,
  }));

  return {
    action: match.action,
    chosenMoveId: match.id,
    shortlist: slimShortlist,
    banter: parsed.banter,
    sessionId: r.sessionId,
    sequenceTail: [],
  };
}
