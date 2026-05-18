// plugins/risk/client/app.js
// Host integration: all transport URLs and context come from window.__GAME__,
// which the host injects into index.html before serving it (plugin-clients.js).
//   ctx.stateUrl  → GET  /api/games/:id          returns { state: <view> }
//   ctx.actionUrl → POST /api/games/:id/action    body: { type, payload? }
//   ctx.sseUrl    → SSE  /api/games/:id/events    events: 'update', 'ended'
import { renderBoard } from './board.js';
import { renderActionBar } from './action-bar.js';
import { renderHistory } from './history.js';
import { renderEnd } from './end-screen.js';

const ctx = window.__GAME__;
const root = document.getElementById('risk-root');
let pending = {};

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

async function render() {
  let view;
  try { view = await fetchView(); }
  catch { root.textContent = 'Unable to load game.'; return; }
  root.innerHTML = '';
  if (view.phase === 'gameover') { renderEnd(root, view); return; }
  const banner = document.createElement('div');
  banner.className = 'banner';
  banner.textContent = `Phase: ${view.phase} · ${view.youAre === view.currentPlayer ? 'Your move' : 'Opponent'}`;
  root.appendChild(banner);
  renderBoard(root, view, { onPick: id => pick(view, id), selected: pending.from ?? pending.deployTarget });
  renderActionBar(root, view, { post, pending, setPending: p => { pending = p; render(); } });
  renderHistory(root, view.log);
}

const es = new EventSource(ctx.sseUrl);
es.addEventListener('update', () => render());
es.addEventListener('ended', () => render());
render();
