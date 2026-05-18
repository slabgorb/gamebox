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

// ---------- DOM dice reveal ----------
// Renders attacker vs defender pips for each round of lastCombat.rounds.
// `animate=false` paints the final round instantly (reload of a stale
// result); `animate=true` steps through the rounds (~1.5–2s) then settles.
// onDone() fires after the last round is shown.

const PIP = (v) => `⚀⚁⚂⚃⚄⚅`[v - 1] ?? '·';

export function renderCombatReveal(root, lastCombat, { animate, onDone }) {
  if (!lastCombat || !lastCombat.rounds || lastCombat.rounds.length === 0) {
    onDone?.(); return;
  }
  const box = document.createElement('div');
  box.className = 'combat-reveal';
  const head = document.createElement('div');
  head.className = 'combat-reveal__head';
  head.textContent = `${lastCombat.from} → ${lastCombat.to}`;
  const dice = document.createElement('div');
  dice.className = 'combat-reveal__dice';
  const result = document.createElement('div');
  result.className = 'combat-reveal__result';
  box.append(head, dice, result);
  root.appendChild(box);

  const rounds = lastCombat.rounds;
  const settle = () => {
    result.textContent = lastCombat.captured ? 'Captured' : 'Repulsed';
    result.classList.add(lastCombat.captured ? 'won' : 'lost');
    onDone?.();
  };
  const paint = (r) => {
    const a = (r.aDice ?? []).map(PIP).join(' ');
    const d = (r.dDice ?? []).map(PIP).join(' ');
    dice.innerHTML =
      `<span class="atk">${a}</span><span class="vs">vs</span><span class="def">${d}</span>`;
  };

  if (!animate) { paint(rounds[rounds.length - 1]); settle(); return; }

  let i = 0;
  const stepMs = Math.max(250, Math.min(500, Math.floor(1800 / rounds.length)));
  const tick = () => {
    paint(rounds[i]);
    i += 1;
    if (i < rounds.length) setTimeout(tick, stepMs);
    else setTimeout(settle, stepMs);
  };
  tick();
}
