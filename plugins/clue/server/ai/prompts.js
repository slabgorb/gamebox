// Turn-prompt builder + response parser for the Clue bot.
//
// The prompt is own-info-only by construction: it renders the bot's own
// hand, the TRACKER's deduction summary (itself own-info-only), and the
// public log — the envelope and other hands are never inputs here.
const RESPONSE_FOOTER = 'Respond with a single JSON object (and nothing else): {"moveId": "<one of the ids above>", "banter": "<one short in-character line, max ~12 words, never empty>"}';

const LOG_TAIL = 8;

function renderLogEntry(e) {
  switch (e.type) {
    case 'suggest': return `seat ${e.bySeat} suggested ${e.suspect} / ${e.weapon} / ${e.room}`;
    case 'no-refute': return `seat ${e.seat} could not refute`;
    case 'refute': return `seat ${e.bySeat} showed a card to seat ${e.ofSeat}`;
    case 'accuse': return `seat ${e.bySeat} accused (${e.correct ? 'correct' : 'wrong'})`;
    default: return null;
  }
}

function deductionBlock(tracker) {
  const lines = ['What you know so far:'];
  for (const category of ['suspect', 'weapon', 'room']) {
    const open = tracker.envelopeCandidates(category);
    lines.push(`- ${category} candidates still open: ${open.join(', ') || '(solved)'}`);
  }
  const solution = tracker.envelopeSolution();
  if (solution) {
    lines.push(`- SOLVED: it was ${solution.suspect} with the ${solution.weapon} in the ${solution.room}`);
  }
  return lines.join('\n');
}

function trashTalkBlock(userMessages) {
  if (!userMessages.length) return null;
  return `Table chatter to react to (in character, one line):\n${userMessages.map((m) => `- ${m}`).join('\n')}`;
}

export function buildTurnPrompt({ state, shortlist, seat, tracker, userMessages = [] }) {
  const log = state.log
    .map(renderLogEntry)
    .filter((line) => line !== null)
    .slice(-LOG_TAIL);
  const blocks = [
    `You are playing Clue as seat ${seat}. Phase: ${state.phase}.`,
    `Your cards: ${state.hands[seat].join(', ') || '(none)'}`,
    deductionBlock(tracker),
    log.length ? `Recent table history:\n${log.map((l) => `- ${l}`).join('\n')}` : null,
    `Your options:\n${shortlist.map((e) => `- id: ${e.id} (${e.slot}) — ${e.summary}`).join('\n')}`,
    trashTalkBlock(userMessages),
    RESPONSE_FOOTER,
  ];
  return blocks.filter((b) => b !== null).join('\n\n');
}

function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('no JSON object found in response');
  }
  return text.slice(start, end + 1);
}

export function parseLlmResponse(text) {
  const json = extractJson(text);
  let parsed;
  try { parsed = JSON.parse(json); }
  catch (e) { throw new Error(`response is not valid JSON: ${e.message}`); }
  if (typeof parsed.moveId !== 'string') throw new Error('response missing moveId');
  return {
    moveId: parsed.moveId,
    banter: typeof parsed.banter === 'string' ? parsed.banter : '',
  };
}
