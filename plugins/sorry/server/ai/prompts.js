// Sorry! prompt construction and LLM-response parsing.
//
// `parseLlmResponse` and `extractJson` are intentionally copied from
// plugins/backgammon/server/ai/prompts.js rather than imported — each plugin
// owns its own copy so a change to one game's parsing never silently affects
// another.

function pawnLocation(pawn) {
  if (pawn.zone === 'start') return 'Start';
  if (pawn.zone === 'home') return 'Home';
  if (pawn.zone === 'safety') return `safety square ${pawn.index}`;
  return `track ${pawn.index}`;
}

function pawnLine(pawn) {
  return `  - pawn ${pawn.id}: ${pawnLocation(pawn)}`;
}

function cardLabel(card) {
  return card === 'sorry' ? 'Sorry!' : String(card);
}

function describeMove(m) {
  switch (m.kind) {
    case 'out':
      return `Bring pawn ${m.pawnId} out of Start onto the track.`;
    case 'forward':
      return `Move pawn ${m.pawnId} forward ${m.steps}.`;
    case 'back':
      return `Move pawn ${m.pawnId} back ${Math.abs(m.steps)}.`;
    case 'split':
      return `Split move: pawn ${m.legs[0].pawnId} by ${m.legs[0].steps}, pawn ${m.legs[1].pawnId} by ${m.legs[1].steps}.`;
    case 'swap':
      return `Swap your pawn ${m.pawnId} with opponent pawn ${m.targetPawnId}.`;
    case 'sorry':
      return `Sorry! Bump opponent pawn ${m.targetPawnId} home and take its square with your Start pawn ${m.pawnId}.`;
    default:
      return `Move ${m.id}.`;
  }
}

function legalMovesBlock(legalMoves) {
  const lines = legalMoves.map((m) => `  - ${m.id}: ${describeMove(m)}`);
  return `Legal moves (choose exactly one by its id):\n${lines.join('\n')}`;
}

function reactionBlock(messages) {
  const lines = messages.map((m) => `  - "${String(m).replace(/"/g, '\\"')}"`).join('\n');
  return `Your opponent just said to you (since your last turn):\n${lines}\nReact in your banter — stay in character.`;
}

const RESPONSE_FOOTER =
  'Respond with a single JSON object (and nothing else): ' +
  '{"moveId": "<one of the legal move ids above>", ' +
  '"banter": "<one short in-character line, max ~12 words, never empty — even one syllable counts>"}';

export function buildTurnPrompt({ state, legalMoves, botPlayerIdx, userMessages = [] }) {
  const botSide = botPlayerIdx === 0 ? 'a' : 'b';
  const oppSide = botSide === 'a' ? 'b' : 'a';
  const sideLabel = botSide === 'a' ? 'side A' : 'side B';

  const blocks = [
    `You are playing ${sideLabel} in a game of Sorry!.`,
    `Card drawn this turn: ${cardLabel(state.drawnCard)}`,
    `Your pawns:\n${state.pawns[botSide].map(pawnLine).join('\n')}`,
    `Opponent pawns:\n${state.pawns[oppSide].map(pawnLine).join('\n')}`,
  ];
  if (userMessages.length > 0) blocks.push(reactionBlock(userMessages));
  blocks.push(legalMovesBlock(legalMoves), RESPONSE_FOOTER);
  return blocks.join('\n\n');
}

// --- LLM response parsing (copied from backgammon, see header note) -------

function extractJson(text) {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  throw new Error('no JSON object found in response');
}

export function parseLlmResponse(text) {
  const json = extractJson(text);
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch (e) {
    throw new Error(`response is not valid JSON: ${e.message}`);
  }
  if (typeof parsed.moveId !== 'string') throw new Error('response missing moveId');
  return {
    moveId: parsed.moveId,
    banter: typeof parsed.banter === 'string' ? parsed.banter : '',
  };
}

export { extractJson };
