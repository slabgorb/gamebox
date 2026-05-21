import { CONTINENTS } from '../map.js';

// Bump this when the text of buildTurnPrompt changes in a way that could
// affect the LLM's response distribution. Manual bump rather than auto-hash
// so whitespace-only edits don't invalidate corpora.
export const BUILD_TURN_PROMPT_VERSION = 1;

function renderBoard(state, p) {
  const lines = [];
  for (const key of Object.keys(CONTINENTS)) {
    const c = CONTINENTS[key];
    const cells = c.territories.map(id => {
      const t = state.territories[id];
      const who = t.owner === p ? 'you' : (t.owner == null ? '—' : 'enemy');
      return `${id}:${who}/${t.armies}`;
    });
    lines.push(`${c.name} (+${c.bonus}): ${cells.join('  ')}`);
  }
  return lines.join('\n');
}

function shortlistBlock(shortlist) {
  const lines = shortlist.map(m => {
    const s = typeof m.score === 'number' ? ` (score ${m.score.toFixed(1)})` : '';
    return `  - ${m.id}: ${m.summary}${s}`;
  });
  return `Candidate moves (pre-scored — pick the one that fits your style):\n${lines.join('\n')}`;
}

function trashTalkBlock(messages) {
  const lines = messages.map(m => `  - "${m.replace(/"/g, '\\"')}"`).join('\n');
  return `Your opponent just said:\n${lines}\nReact in your banter — stay in character.`;
}

const LIVE_FOOTER =
  'Respond with a single JSON object (and nothing else): ' +
  '{"moveId": "<one of the candidate ids above>", "banter": "<one short in-character line, max ~12 words, never empty>"}';

const COLLECTION_FOOTER =
  'Respond with a single JSON object (and nothing else): ' +
  '{"moveId": "<one of the candidate ids above>"}';

export function buildTurnPrompt({ state, shortlist, botPlayerIdx, userMessages = [], mode = 'live' }) {
  const footer = mode === 'collection' ? COLLECTION_FOOTER : LIVE_FOOTER;
  const blocks = [
    `You are playing Risk as player ${botPlayerIdx}. Current phase: ${state.phase}.`,
    renderBoard(state, botPlayerIdx),
  ];
  if (userMessages.length > 0) blocks.push(trashTalkBlock(userMessages));
  blocks.push(shortlistBlock(shortlist), footer);
  return blocks.join('\n\n');
}

function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  throw new Error('no JSON object found in response');
}

export function parseLlmResponse(text) {
  let parsed;
  try { parsed = JSON.parse(extractJson(text)); }
  catch (e) { throw new Error(`response is not valid JSON: ${e.message}`); }
  if (typeof parsed.moveId !== 'string') throw new Error('response missing moveId');
  return {
    moveId: parsed.moveId,
    banter: typeof parsed.banter === 'string' ? parsed.banter : '',
  };
}
