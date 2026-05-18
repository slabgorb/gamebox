// plugins/risk/client/combat-reveal.js
// Pure transition detection for the dice reveal. The DOM replay renderer is
// added in a later task; these two functions decide WHETHER to replay.

export function combatSignature(lastCombat) {
  if (!lastCombat) return null;
  const { from, to, force, captured, rounds } = lastCombat;
  return `${from}|${to}|${force}|${captured}|${rounds ? rounds.length : 0}`;
}

export function shouldReplay(prevSignature, lastCombat) {
  const signature = combatSignature(lastCombat);
  return { signature, replay: signature != null && signature !== prevSignature };
}
