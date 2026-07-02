// chooseAction for the Clue bot — persona pick + banter over the capped
// shortlist, with a deterministic auto-refute short-circuit.
//
// Mirrors the words/backgammon contract exactly. The refute is the
// invisible-mechanic-server-side half of the dice/refute doctrine: no LLM
// call, no resume slot burned (usedLlm: false). The roll intent stays
// values-less end to end — the client rolls, never this module.
import { BOARD } from '../geometry.js';
import { chooseRefuteCard } from '../refute.js';
import { buildTracker } from './knowledge.js';
import { buildClueShortlist } from './shortlist.js';
import { buildTurnPrompt, parseLlmResponse } from './prompts.js';
import { InvalidLlmResponse, InvalidLlmMove } from '../../../../src/server/ai/errors.js';

export { InvalidLlmResponse, InvalidLlmMove };

export async function chooseAction({
  llm, persona, sessionId, state, botPlayerIdx, userMessages = [], geo = BOARD,
}) {
  const seat = botPlayerIdx;

  // Refute short-circuit: deterministic least-leak reveal, no LLM.
  if (state.phase === 'refute' && state.activeUserId === state.seats[seat]) {
    const card = chooseRefuteCard(state, seat);
    return { action: { type: 'refute', payload: { card } }, usedLlm: false };
  }

  const tracker = buildTracker({ state, seat });
  const shortlist = buildClueShortlist({ state, geo, seat, tracker });
  const prompt = buildTurnPrompt({ state, shortlist, seat, tracker, userMessages });

  const r = await llm.send({
    prompt,
    sessionId,
    systemPrompt: sessionId ? null : persona.systemPrompt,
  });

  // Single option: there is no decision, so bad LLM output must never
  // derail the turn. The call above still ran (menu of one) so banter and
  // resume-slot accounting stay normal; on a flub, play the forced entry.
  if (shortlist.length === 1) {
    let banter;
    try { banter = parseLlmResponse(r.text).banter; }
    catch { banter = ''; } // forced move: a flubbed banter is dropped, never fatal (sorry precedent)
    return { action: shortlist[0].action, banter, sessionId: r.sessionId };
  }

  let parsed;
  try { parsed = parseLlmResponse(r.text); }
  catch (e) { throw new InvalidLlmResponse(e.message); }

  const match = shortlist.find((m) => m.id === parsed.moveId);
  if (!match) throw new InvalidLlmMove(parsed.moveId, shortlist.map((m) => m.id));

  return { action: match.action, banter: parsed.banter, sessionId: r.sessionId };
}
