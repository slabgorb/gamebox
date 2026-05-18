// plugins/risk/client/app.js
// Host integration: all transport URLs and context come from window.__GAME__,
// injected into index.html by the host (plugin-clients.js).
import { renderBoard } from './board.js';
import { renderActionBar } from './action-bar.js';
import { renderHistory } from './history.js';
import { renderEnd } from './end-screen.js';
import { CONTINENT_BONUS, TERRITORIES } from './map-geometry.js';
import { shouldReplay, renderCombatReveal } from './combat-reveal.js';
import { renderLeaveButton } from './leave-button.js';

const ctx = window.__GAME__;
const root = document.getElementById('risk-root');
let pending = {};
let lastSeenSig;        // undefined until the first view seeds it
let seeded = false;

async function fetchView() {
  const res = await fetch(ctx.stateUrl);
  if (!res.ok) throw new Error(`state ${res.status}`);
  const data = await res.json();
  return data.state ?? data;
}

async function post(action) {
  await fetch(ctx.actionUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(action),
  });
  await render();
}

function pick(view, id) {
  const ph = view.phase;
  if (ph === 'setup' || ph === 'reinforce') {
    if (view.territories[id].owner === view.youAre) pending = { deployTarget: id };
  } else if (ph === 'attack' || ph === 'fortify') {
    if (!pending.from) pending = { from: id };
    else if (!pending.to) pending = { ...pending, to: id };
    else pending = { from: id };
  }
  render();
}

function renderContinentRail(view) {
  const rail = document.createElement('div');
  rail.className = 'continent-rail';
  for (const [key, bonus] of Object.entries(CONTINENT_BONUS)) {
    const ids = Object.keys(TERRITORIES).filter(t => TERRITORIES[t].continent === key);
    const held = ids.every(t => view.territories[t].owner === view.youAre);
    const chip = document.createElement('span');
    chip.className = `cont-chip${held ? ' held' : ''}`;
    chip.textContent = `${key} +${bonus}`;
    rail.appendChild(chip);
  }
  return rail;
}

async function render() {
  let view;
  try { view = await fetchView(); }
  catch { root.textContent = 'Unable to load game.'; return; }

  // Seed the combat signature on first load so a pre-existing result does
  // not animate on page open (spec: instant on reload of a stale result).
  if (!seeded) {
    const seed = shouldReplay(undefined, view.lastCombat);
    lastSeenSig = seed.signature;
    seeded = true;
  }

  root.innerHTML = '';
  if (view.phase === 'gameover') { renderEnd(root, view); return; }

  const banner = document.createElement('div');
  banner.className = 'banner';
  banner.textContent = `Phase: ${view.phase} · ${view.youAre === view.currentPlayer ? 'Your move' : 'Opponent'}`;
  // Persistent escape hatch — present every non-gameover render, so you can
  // bail even when it's the opponent/bot's turn or the bot has stalled.
  renderLeaveButton(banner, {
    onLeave: () => {
      if (window.confirm('Leave this game? You forfeit — your opponent wins.')) {
        post({ type: 'resign' });
      }
    },
  });
  root.appendChild(banner);

  root.appendChild(renderContinentRail(view));
  renderBoard(root, view, { onPick: id => pick(view, id), selected: pending.from ?? pending.deployTarget });

  const { signature, replay } = shouldReplay(lastSeenSig, view.lastCombat);
  lastSeenSig = signature;
  if (view.lastCombat) {
    renderCombatReveal(root, view.lastCombat, { animate: replay, onDone: () => {} });
  }

  renderActionBar(root, view, { post, pending, setPending: p => { pending = p; render(); } });
  renderHistory(root, view.log);
}

const es = new EventSource(ctx.sseUrl);
es.addEventListener('update', () => render());
es.addEventListener('ended', () => render());
render();
