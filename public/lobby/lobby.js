// Gamebox lobby — "Game Shelf" skeuomorphic build.
// Vanilla JS, no build step. Renders top-down board-game-lid cards into
// the same DOM structure the previous lobby.js used (#sec-yours, etc).

import { boxArt } from './box-art.js';

async function fetchJson(path) {
  const r = await fetch(path);
  if (!r.ok) throw new Error(`${path}: ${r.status}`);
  return r.json();
}

const PLUGIN_META = {
  words:      { tagline: 'Cross-word tile game' },
  rummikub:   { tagline: 'Tile runs and groups' },
  backgammon: { tagline: 'Race off the board' },
  cribbage:   { tagline: 'Pegs, pairs, and fifteen-twos' },
  buraco:     { tagline: 'Brazilian rummy — sequences, jokers, mortos' },
  risk:       { tagline: 'Conquer the map, one die at a time' },
  sorry:      { tagline: 'The slidy diagonal chasing game' },
};
const PLUGIN_VARIANTS = {
  words: [
    { variant: 'wwf',      label: 'Words with Friends' },
    { variant: 'scrabble', label: 'Scrabble rules' },
  ],
};
// Games where the creator picks their checker colour (the opponent takes the
// contrast; see plugins/sorry/server/colors.js). Hex mirrors the board palette.
const PLUGIN_COLORS = {
  sorry: [
    { color: 'red',    label: 'Red',    hex: '#b8332a' },
    { color: 'blue',   label: 'Blue',   hex: '#2c647f' },
    { color: 'green',  label: 'Green',  hex: '#3e9a5c' },
    { color: 'orange', label: 'Orange', hex: '#d4863a' },
  ],
};

let DISPLAY_NAMES = {};
function displayName(gameType) { return DISPLAY_NAMES[gameType] ?? gameType; }
function variantLabel(gameType, variant) {
  if (!variant) return '';
  const v = (PLUGIN_VARIANTS[gameType] ?? []).find(x => x.variant === variant);
  return v?.label ?? variant;
}
function tagline(gameType) { return PLUGIN_META[gameType]?.tagline ?? ''; }

function relTime(ts) {
  if (!ts) return '';
  const d = Date.now() - ts;
  const s = Math.max(1, Math.round(d / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  const days = Math.round(h / 24);
  if (days < 14) return `${days}d ago`;
  const weeks = Math.round(days / 7);
  return `${weeks}w ago`;
}
function avatarInitial(name) {
  if (!name) return '?';
  return name.trim().slice(0, 1).toUpperCase();
}
function setAvatar(el, user) {
  el.textContent = avatarInitial(user.friendlyName);
  if (user.color) el.style.background = user.color;
  if (user.glyph) el.dataset.glyph = user.glyph; else delete el.dataset.glyph;
}
function glyphMark(user) {
  return user?.glyph ? ` <span class="glyph-mark" aria-hidden="true">${escapeHtml(user.glyph)}</span>` : '';
}
function glyphAttr(user) {
  return user?.glyph ? ` data-glyph="${escapeAttr(user.glyph)}"` : '';
}
function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function escapeAttr(s) { return escapeHtml(s); }

// Card builders

function activeCard(game) {
  const a = document.createElement('a');
  a.className = 'card';
  a.href = `/play/${game.gameType}/${game.id}/`;

  const yourTurn = !!game.yourTurn;
  const overdue  = yourTurn && (Date.now() - game.updatedAt) > 24*60*60*1000;

  const opponents = game.opponents ?? [game.opponent];
  const oppNames = opponents.map(o => o.friendlyName).join(', ');
  const variantText = variantLabel(game.gameType, game.variant);
  const variantHTML = variantText ? `<div class="variant">${escapeHtml(variantText)}</div>` : '';
  const meta = yourTurn
    ? `Your move · ${escapeHtml(relTime(game.updatedAt))}`
    : `${escapeHtml(oppNames)} ${opponents.length > 1 ? 'are' : 'is'} pondering · ${escapeHtml(relTime(game.updatedAt))}`;
  const oppColor = game.opponent.color || '#1a73e8';

  a.innerHTML = `
    <div class="lid">${boxArt(game.gameType, game.variant)}
      <div class="titlestrip">
        <div class="title">${escapeHtml(displayName(game.gameType))}</div>
        ${variantHTML}
      </div>
    </div>
    <div class="sideband">
      <div>
        <div class="opp-row">
          <span class="opp-mono"${glyphAttr(game.opponent)} style="background:${escapeAttr(oppColor)}">${escapeHtml(avatarInitial(game.opponent.friendlyName))}</span>
          <span><span class="opp-vs">vs.</span> <strong class="opp-name" style="color:${escapeAttr(oppColor)}">${escapeHtml(oppNames)}${opponents.length > 1 ? '' : glyphMark(game.opponent)}</strong></span>
        </div>
        <div class="meta">${meta}</div>
      </div>
      <div class="score-row">
        <div class="score">${game.yourScore}<span class="dash">–</span>${game.theirScore}</div>
        ${yourTurn ? '' : '<span class="chev" aria-hidden="true">›</span>'}
      </div>
    </div>
    ${yourTurn ? `<div class="plaque">Your Move<span class="rv-bl"></span><span class="rv-br"></span></div>` : ''}
    ${overdue   ? `<div class="nudge">⚐ they've been waiting</div>` : ''}
  `;
  return a;
}

function endedCard(game) {
  const a = document.createElement('a');
  a.className = 'card ended';
  a.href = `/play/${game.gameType}/${game.id}/`;

  const oppColor = game.opponent.color || '#999';
  const opponents = game.opponents ?? [game.opponent];
  const oppNames = opponents.map(o => o.friendlyName).join(', ');
  const won = game.winnerSeat != null && game.winnerSeat === game.you;
  const winnerOpp = opponents.find(o => o.seat === game.winnerSeat);
  const outcome = won ? `You won` :
    (game.endedReason === 'draw' || game.isDraw) ? `Draw with ${oppNames}` :
    winnerOpp ? `${winnerOpp.friendlyName} won` :
    `Ended vs ${oppNames}`;

  a.innerHTML = `
    <div class="lid">${boxArt(game.gameType, game.variant)}
      <div class="titlestrip">
        <div class="title">${escapeHtml(displayName(game.gameType))}</div>
      </div>
    </div>
    <div class="sideband">
      <div>
        <div class="opp-row">
          <span class="opp-mono"${glyphAttr(game.opponent)} style="background:${escapeAttr(oppColor)}">${escapeHtml(avatarInitial(game.opponent.friendlyName))}</span>
          <span class="opp-name" style="color:${escapeAttr(oppColor)}">${escapeHtml(outcome)}${glyphMark(game.opponent)}</span>
        </div>
        <div class="meta">${escapeHtml(relTime(game.updatedAt))}</div>
      </div>
      <div class="score">${game.yourScore}–${game.theirScore}</div>
    </div>
  `;
  return a;
}

// Render

function renderBucket(sectionEl, listEl, countEl, items, builder) {
  listEl.innerHTML = '';
  if (items.length === 0) { sectionEl.hidden = true; return; }
  sectionEl.hidden = false;
  if (countEl) countEl.textContent = items.length;
  for (const g of items) listEl.appendChild(builder(g));
}

async function main() {
  const [meResp, plugins] = await Promise.all([
    fetch('/api/me'),
    fetchJson('/api/plugins').then(r => r.plugins).catch(() => []),
  ]);
  if (meResp.status === 403) {
    const body = await meResp.json().catch(() => ({}));
    const email = body.email ?? '';
    location.replace(`/lockout?email=${encodeURIComponent(email)}`);
    return;
  }
  if (!meResp.ok) {
    throw new Error(`/api/me: ${meResp.status}`);
  }
  const meRes = await meResp.json();
  const me = meRes?.user ?? null;
  if (!me) { document.getElementById('me-name').textContent = ''; return; }

  for (const p of plugins) DISPLAY_NAMES[p.id] = p.displayName;

  const meNameEl = document.getElementById('me-name');
  meNameEl.textContent = me.friendlyName;
  if (me.glyph) meNameEl.insertAdjacentHTML('beforeend', glyphMark(me));
  setAvatar(document.getElementById('me-avatar'), me);

  const games = meRes.games ?? [];
  const active = games.filter(g => g.status === 'active');
  const ended  = games.filter(g => g.status === 'ended');

  const yours  = active.filter(g => g.yourTurn).sort((a, b) => a.updatedAt - b.updatedAt);
  const theirs = active.filter(g => !g.yourTurn).sort((a, b) => b.updatedAt - a.updatedAt);
  const recentEnded = ended.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 5);

  renderBucket(
    document.getElementById('sec-yours'),
    document.getElementById('list-yours'),
    document.getElementById('count-yours'),
    yours, activeCard,
  );

  const theirsLabel = document.getElementById('theirs-label');
  if (theirs.length > 0) {
    const oppNames = new Set(theirs.map(g => g.opponent.friendlyName));
    theirsLabel.textContent = oppNames.size === 1 ? [...oppNames][0] : 'their reply';
  }
  renderBucket(
    document.getElementById('sec-theirs'),
    document.getElementById('list-theirs'),
    document.getElementById('count-theirs'),
    theirs, activeCard,
  );

  renderBucket(
    document.getElementById('sec-ended'),
    document.getElementById('list-ended'),
    document.getElementById('count-ended'),
    recentEnded, endedCard,
  );

  const empty = document.getElementById('sec-empty');
  const caughtUp = document.getElementById('sec-caught-up');
  if (active.length === 0 && ended.length === 0) {
    empty.hidden = false;
  } else if (yours.length === 0 && theirs.length > 0) {
    caughtUp.hidden = false;
    const oppNames = new Set(theirs.map(g => g.opponent.friendlyName));
    document.getElementById('caught-up-label').textContent =
      oppNames.size === 1 ? `waiting on ${[...oppNames][0]}` : 'waiting on others';
  }

  const toggle = document.getElementById('ended-toggle');
  if (recentEnded.length > 3) toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
  });

  document.getElementById('lobby').hidden = false;
  document.getElementById('fab').hidden = false;
  wireNewGame(me, plugins);
  wireLogout();
}

function wireLogout() {
  const card = document.getElementById('me-card');
  const dlg = document.getElementById('logout-prompt');
  const cancel = document.getElementById('lo-cancel');
  const confirm = document.getElementById('lo-confirm');
  if (!card || !dlg) return;

  card.addEventListener('click', () => dlg.showModal());
  cancel.addEventListener('click', () => dlg.close());
  dlg.addEventListener('cancel', () => dlg.close());
  confirm.addEventListener('click', () => {
    confirm.disabled = true;
    confirm.textContent = 'Signing out…';
    window.location.assign('/cdn-cgi/access/logout');
  });
}

// New-game flow

function wireNewGame(me, plugins) {
  const fab = document.getElementById('fab');
  const dlg = document.getElementById('newgame');
  const stepsEl = document.getElementById('ng-steps');
  const titleEl = document.getElementById('ng-title');
  const cancel = document.getElementById('ng-cancel');

  cancel.onclick = () => dlg.close();
  dlg.addEventListener('cancel', () => dlg.close());

  let allUsers = [];

  fab.onclick = async () => {
    const users = await fetchJson('/api/users').then(arr => arr.filter(u => u.id !== me.id));
    allUsers = users;
    if (users.length === 0) {
      alert("You're the only player on this server.");
      return;
    }
    if (users.length === 1) showGameStep(users[0], plugins);
    else                     showOpponentStep(users, plugins);
    dlg.showModal();
  };

  function showOpponentStep(users, plugins) {
    titleEl.textContent = 'Pick a sparring partner';
    stepsEl.innerHTML = `<div class="ng-step">Step 1 of ${PLUGIN_VARIANTS.words ? 3 : 2}</div>`;
    for (const u of users) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ng-tile';
      btn.innerHTML = `
        <span class="ng-mono"${glyphAttr(u)} style="background:${escapeAttr(u.color || '#888')};margin-left:16px">${escapeHtml(avatarInitial(u.friendlyName))}</span>
        <span class="ng-body"><span class="ng-name">${escapeHtml(u.friendlyName)}${glyphMark(u)}</span></span>
        <span class="ng-chev" aria-hidden="true">›</span>`;
      btn.onclick = () => showGameStep(u, plugins);
      li.appendChild(btn);
      stepsEl.appendChild(li);
    }
  }

  function showGameStep(opponent, plugins) {
    titleEl.textContent = `New game vs. ${opponent.friendlyName}`;
    stepsEl.innerHTML = `<div class="ng-step">Step 2 — choose your weapon</div>`;
    for (const p of plugins) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ng-tile with-art';
      btn.innerHTML = `
        <span class="ng-art">${boxArt(p.id)}</span>
        <span class="ng-body" style="padding-left:0">
          <span class="ng-name">${escapeHtml(p.displayName)}</span>
          <span class="ng-tagline">${escapeHtml(tagline(p.id))}</span>
        </span>
        <span class="ng-chev" aria-hidden="true">›</span>`;
      btn.onclick = () => {
        if ((p.players?.max ?? 2) > 2 && !opponent.isBot) showAddPlayersStep(opponent, p, plugins);
        else if (PLUGIN_VARIANTS[p.id]) showVariantStep(opponent, p, plugins);
        else proceedAfterRules(opponent, p.id, null, plugins);
      };
      li.appendChild(btn);
      stepsEl.appendChild(li);
    }
  }

  // Multiplayer games (players.max > 2, e.g. Risk): after the first opponent
  // is picked, offer the rest of the human roster as optional extra seats.
  // Seat order = creator, first opponent, then extras in tick order.
  function showAddPlayersStep(opponent, plugin, plugins) {
    const maxExtra = (plugin.players?.max ?? 2) - 2;
    const others = allUsers.filter(u => u.id !== opponent.id && !u.isBot);
    if (maxExtra === 0 || others.length === 0) {
      proceedAfterRules(opponent, plugin.id, null, plugins);
      return;
    }
    titleEl.textContent = `${plugin.displayName} — add more players?`;
    stepsEl.innerHTML = `<div class="ng-step">vs. ${escapeHtml(opponent.friendlyName)} — tick up to ${maxExtra} more</div>`;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'ng-back';
    back.textContent = 'back';
    back.onclick = () => showGameStep(opponent, plugins);
    stepsEl.appendChild(back);

    const picked = new Set();
    const checkboxes = [];
    for (const u of others) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ng-tile';
      btn.setAttribute('aria-pressed', 'false');
      btn.innerHTML = `
        <span class="ng-mono"${glyphAttr(u)} style="background:${escapeAttr(u.color || '#888')};margin-left:16px">${escapeHtml(avatarInitial(u.friendlyName))}</span>
        <span class="ng-body"><span class="ng-name">${escapeHtml(u.friendlyName)}${glyphMark(u)}</span></span>
        <span class="ng-chev" aria-hidden="true">＋</span>`;
      btn.onclick = () => {
        if (picked.has(u.id)) {
          picked.delete(u.id);
          btn.setAttribute('aria-pressed', 'false');
          btn.style.outline = '';
        } else if (picked.size < maxExtra) {
          picked.add(u.id);
          btn.setAttribute('aria-pressed', 'true');
          btn.style.outline = '2px solid currentColor';
        }
        go.textContent = startLabel();
      };
      checkboxes.push(btn);
      li.appendChild(btn);
      stepsEl.appendChild(li);
    }

    const startLabel = () => `Start with ${2 + picked.size} players`;
    const goLi = document.createElement('li');
    const go = document.createElement('button');
    go.type = 'button';
    go.className = 'ng-tile';
    go.style.justifyContent = 'center';
    go.textContent = startLabel();
    go.onclick = () => startGame(opponent, plugin.id, null, null, null, [...picked]);
    goLi.appendChild(go);
    stepsEl.appendChild(goLi);
  }

  // After rules (variant) are settled: pick a checker colour if the game offers
  // one, then a persona for bots, otherwise create the game.
  function proceedAfterRules(opponent, gameType, variant, plugins) {
    if (PLUGIN_COLORS[gameType]) showColorStep(opponent, gameType, variant, plugins);
    else if (opponent.isBot) showPersonaStep(opponent, gameType, variant, null);
    else startGame(opponent, gameType, variant, null, null);
  }

  function showColorStep(opponent, gameType, variant, plugins) {
    titleEl.textContent = `${displayName(gameType)} — pick your colour`;
    stepsEl.innerHTML = `<div class="ng-step">Choose your checker colour</div>`;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'ng-back';
    back.textContent = 'back';
    back.onclick = () => showGameStep(opponent, plugins);
    stepsEl.appendChild(back);
    for (const c of PLUGIN_COLORS[gameType]) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ng-tile';
      btn.innerHTML = `
        <span class="ng-mono" style="background:${escapeAttr(c.hex)};margin-left:16px"></span>
        <span class="ng-body"><span class="ng-name">${escapeHtml(c.label)}</span></span>
        <span class="ng-chev" aria-hidden="true">›</span>`;
      btn.onclick = () => {
        if (opponent.isBot) showPersonaStep(opponent, gameType, variant, c.color);
        else startGame(opponent, gameType, variant, null, c.color);
      };
      li.appendChild(btn);
      stepsEl.appendChild(li);
    }
  }

  function showVariantStep(opponent, plugin, plugins) {
    titleEl.textContent = `${plugin.displayName} — pick the rulebook`;
    stepsEl.innerHTML = `<div class="ng-step">Step 3 of 3</div>`;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'ng-back';
    back.textContent = 'back';
    back.onclick = () => showGameStep(opponent, plugins);
    stepsEl.appendChild(back);
    for (const v of PLUGIN_VARIANTS[plugin.id]) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ng-tile with-art';
      btn.innerHTML = `
        <span class="ng-art">${boxArt(plugin.id, v.variant)}</span>
        <span class="ng-body" style="padding-left:0"><span class="ng-name">${escapeHtml(v.label)}</span></span>
        <span class="ng-chev" aria-hidden="true">›</span>`;
      btn.onclick = () => proceedAfterRules(opponent, plugin.id, v.variant, plugins);
      li.appendChild(btn);
      stepsEl.appendChild(li);
    }
  }

  async function showPersonaStep(opponent, gameType, variant, color = null) {
    titleEl.textContent = `Choose your AI opponent`;
    stepsEl.innerHTML = `<div class="ng-step">Final step — pick a persona</div>`;
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'ng-back';
    back.textContent = 'back';
    back.onclick = () => showGameStep(opponent, plugins);
    stepsEl.appendChild(back);
    const data = await fetchJson(`/api/ai/personas?game=${encodeURIComponent(gameType)}`);
    for (const p of data.personas) {
      const li = document.createElement('li');
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ng-tile';
      btn.innerHTML = `
        <span class="ng-mono"${p.glyph ? ` data-glyph="${escapeAttr(p.glyph)}"` : ''} style="background:${escapeAttr(p.color || '#888')};margin-left:16px">${escapeHtml(avatarInitial(p.displayName))}</span>
        <span class="ng-body"><span class="ng-name">${escapeHtml(p.displayName)}</span></span>
        <span class="ng-chev" aria-hidden="true">›</span>`;
      btn.onclick = () => startGame(opponent, gameType, variant, p.id, color);
      li.appendChild(btn);
      stepsEl.appendChild(li);
    }
  }

  async function startGame(opponent, gameType, variant, personaId = null, color = null, extraIds = []) {
    const body = { opponentIds: [opponent.id, ...extraIds], gameType };
    if (variant) body.variant = variant;
    if (personaId) body.personaId = personaId;
    if (color) body.color = color;
    const r = await fetch('/api/games', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      alert(err.error ?? 'failed to create game');
      return;
    }
    const { id, gameType: gt } = await r.json();
    window.location.href = `/play/${gt}/${id}/`;
  }
}

main().catch(err => { document.body.innerHTML = `<pre>${err.stack || err.message}</pre>`; });
