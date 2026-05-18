# Risk Visual Treatment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Risk's 18-line text-chip client with a war-room visual treatment: a drawn SVG region map on an antique campaign-map palette, the shared opponent-card (portrait + banter + taunt input), and an animated combat dice reveal.

**Architecture:** Vanilla ES modules, no build step (matches the existing Risk client). Client cannot import `server/map.js` (outside the served clientDir), so `client/map-geometry.js` becomes the single client-side source of map structure (continent, neighbors, polygon path, label anchor per territory) and a Node test cross-checks it against `server/map.js` to prevent drift. Pure logic (geometry data, combat-replay transition detection) is TDD'd; SVG rendering, CSS theme, and dice animation are visual and verified manually against a live AI game. No server or shared-component changes.

**Tech Stack:** Node 25 `node:test` + `node:assert/strict`, browser-native ES modules, SVG, the existing `public/shared/opponent-card.{js,css}`.

**Spec:** `docs/superpowers/specs/2026-05-18-risk-visual-treatment-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `plugins/risk/client/map-geometry.js` | **NEW** — pure data: per-territory `{ continent, neighbors, path, label }` + `CONTINENT_BONUS`. Single client-side map source. |
| `plugins/risk/client/combat-reveal.js` | **NEW** — pure `combatSignature()` / `shouldReplay()` + DOM dice-replay renderer. |
| `plugins/risk/client/board.js` | REWRITE — SVG renderer driven by `map-geometry.js`. |
| `plugins/risk/client/style.css` | REWRITE — antique theme, all rules scoped under `#risk-root`. |
| `plugins/risk/client/index.html` | +2 lines: shared opponent-card `<link>` + `<script>`. |
| `plugins/risk/client/app.js` | Wire combat-reveal into render loop; seed combat signature on first load; add continent-bonus rail. |
| `plugins/risk/client/themes.js` | Unchanged logic — kept as-is. |
| `plugins/risk/client/action-bar.js`, `history.js`, `end-screen.js` | Unchanged logic — restyled only via `style.css`. |
| `test/risk-client-files.test.js` | Extend expected-file list with the two new modules. |
| `test/risk-map-geometry.test.js` | **NEW** — geometry vs `server/map.js` drift guard + bounds. |
| `test/risk-combat-reveal.test.js` | **NEW** — `shouldReplay` transition logic. |

---

## Task 1: Lock the client file list

**Files:**
- Modify: `test/risk-client-files.test.js:9`
- Create (stubs): `plugins/risk/client/map-geometry.js`, `plugins/risk/client/combat-reveal.js`

- [ ] **Step 1: Update the failing test**

Replace line 9 of `test/risk-client-files.test.js`:

```js
for (const f of ['index.html', 'style.css', 'app.js', 'board.js', 'action-bar.js', 'history.js', 'end-screen.js', 'themes.js', 'map-geometry.js', 'combat-reveal.js']) {
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/risk-client-files.test.js`
Expected: FAIL — `missing map-geometry.js` and `missing combat-reveal.js`.

- [ ] **Step 3: Create stub files**

`plugins/risk/client/map-geometry.js`:
```js
// plugins/risk/client/map-geometry.js
// Single client-side source of Risk map structure. Cross-checked against
// server/map.js by test/risk-map-geometry.test.js.
export const TERRITORIES = {};
export const CONTINENT_BONUS = {};
```

`plugins/risk/client/combat-reveal.js`:
```js
// plugins/risk/client/combat-reveal.js
export function combatSignature() { return null; }
export function shouldReplay() { return { signature: null, replay: false }; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/risk-client-files.test.js`
Expected: PASS — all 10 file checks pass.

- [ ] **Step 5: Commit**

```bash
git add test/risk-client-files.test.js plugins/risk/client/map-geometry.js plugins/risk/client/combat-reveal.js
git commit -m "test(risk): expect map-geometry + combat-reveal client modules"
```

---

## Task 2: Map geometry data + drift guard

**Files:**
- Modify: `plugins/risk/client/map-geometry.js`
- Test: `test/risk-map-geometry.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/risk-map-geometry.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TERRITORIES, CONTINENT_BONUS } from '../plugins/risk/client/map-geometry.js';
import {
  allTerritories, neighborsOf, continentOf, continentBonus, CONTINENTS,
} from '../plugins/risk/server/map.js';

const VW = 800, VH = 600;

test('geometry covers exactly the engine territories', () => {
  assert.deepEqual(Object.keys(TERRITORIES).sort(), allTerritories().sort());
});

test('each territory neighbors match the engine, symmetric', () => {
  for (const id of allTerritories()) {
    assert.deepEqual(
      [...TERRITORIES[id].neighbors].sort(),
      [...neighborsOf(id)].sort(),
      `neighbors drift for ${id}`,
    );
  }
});

test('each territory continent matches the engine', () => {
  for (const id of allTerritories()) {
    assert.equal(TERRITORIES[id].continent, continentOf(id), `continent drift for ${id}`);
  }
});

test('continent bonuses match the engine', () => {
  for (const key of Object.keys(CONTINENTS)) {
    assert.equal(CONTINENT_BONUS[key], continentBonus(key), `bonus drift for ${key}`);
  }
});

test('every territory has a drawable path and an in-bounds label', () => {
  for (const id of allTerritories()) {
    const g = TERRITORIES[id];
    assert.equal(typeof g.path, 'string');
    assert.ok(g.path.trim().length > 0, `${id} empty path`);
    assert.ok(Number.isFinite(g.label.x) && g.label.x >= 0 && g.label.x <= VW, `${id} label.x oob`);
    assert.ok(Number.isFinite(g.label.y) && g.label.y >= 0 && g.label.y <= VH, `${id} label.y oob`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/risk-map-geometry.test.js`
Expected: FAIL — empty `TERRITORIES`.

- [ ] **Step 3: Write the geometry data**

Replace the contents of `plugins/risk/client/map-geometry.js`:

```js
// plugins/risk/client/map-geometry.js
// Single client-side source of Risk map structure. The browser cannot import
// server/map.js (outside the served clientDir), so structure is duplicated
// here and drift-guarded by test/risk-map-geometry.test.js.
// Coordinate space: SVG viewBox "0 0 800 600". Four continents in a ring
// around a central sea; every adjacency is drawn as a connector line,
// inter-continent ones styled as straits.

export const CONTINENT_BONUS = { norland: 2, ostmark: 3, sudreach: 2, westfen: 2 };

export const TERRITORIES = {
  // NORLAND — top-left
  N1: { continent: 'norland',  neighbors: ['N2', 'N3', 'W3'], label: { x: 140, y: 105 }, path: 'M40,50 L210,40 L240,150 L70,180 Z' },
  N2: { continent: 'norland',  neighbors: ['N1', 'N3'],       label: { x: 290, y: 105 }, path: 'M210,40 L360,60 L350,170 L240,150 Z' },
  N3: { continent: 'norland',  neighbors: ['N1', 'N2', 'E1'], label: { x: 210, y: 225 }, path: 'M70,180 L240,150 L350,170 L330,290 L100,300 Z' },
  // OSTMARK — top-right (ring E1-E2-E3-E4-E1)
  E1: { continent: 'ostmark',  neighbors: ['E2', 'E4', 'N3'], label: { x: 555, y: 100 }, path: 'M470,50 L620,40 L640,150 L490,170 Z' },
  E2: { continent: 'ostmark',  neighbors: ['E1', 'E3', 'W2'], label: { x: 560, y: 225 }, path: 'M490,170 L640,150 L630,280 L480,300 Z' },
  E3: { continent: 'ostmark',  neighbors: ['E2', 'E4'],       label: { x: 695, y: 330 }, path: 'M630,280 L770,260 L760,390 L620,400 Z' },
  E4: { continent: 'ostmark',  neighbors: ['E3', 'E1', 'S1'], label: { x: 710, y: 205 }, path: 'M640,150 L780,130 L770,260 L630,280 Z' },
  // SUDREACH — bottom-right (path S1-S2-S3)
  S1: { continent: 'sudreach', neighbors: ['S2', 'E4'],       label: { x: 680, y: 480 }, path: 'M610,420 L760,410 L750,540 L600,550 Z' },
  S2: { continent: 'sudreach', neighbors: ['S1', 'S3'],       label: { x: 520, y: 500 }, path: 'M450,440 L600,430 L590,560 L440,570 Z' },
  S3: { continent: 'sudreach', neighbors: ['S2', 'W1'],       label: { x: 370, y: 510 }, path: 'M300,450 L450,440 L440,570 L290,580 Z' },
  // WESTFEN — bottom-left (triangle W1-W2-W3)
  W1: { continent: 'westfen',  neighbors: ['W2', 'W3', 'S3'], label: { x: 190, y: 500 }, path: 'M120,440 L270,430 L260,560 L110,570 Z' },
  W2: { continent: 'westfen',  neighbors: ['W1', 'W3', 'E2'], label: { x: 195, y: 365 }, path: 'M120,300 L270,290 L270,430 L120,440 Z' },
  W3: { continent: 'westfen',  neighbors: ['W1', 'W2', 'N1'], label: { x: 75,  y: 375 }, path: 'M30,300 L120,300 L120,440 L40,450 Z' },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/risk-map-geometry.test.js`
Expected: PASS — all 5 tests pass (covers, neighbors, continent, bonus, bounds).

- [ ] **Step 5: Run the full suite to confirm nothing broke**

Run: `npm test`
Expected: PASS — existing Risk + global tests still green.

- [ ] **Step 6: Commit**

```bash
git add plugins/risk/client/map-geometry.js test/risk-map-geometry.test.js
git commit -m "feat(risk): map geometry data + server-drift guard test"
```

---

## Task 3: Combat-reveal transition logic

**Files:**
- Modify: `plugins/risk/client/combat-reveal.js`
- Test: `test/risk-combat-reveal.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/risk-combat-reveal.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combatSignature, shouldReplay } from '../plugins/risk/client/combat-reveal.js';

const combat = { from: 'N1', to: 'N2', force: 3, captured: true, rounds: [{}, {}] };

test('signature is null when there is no combat', () => {
  assert.equal(combatSignature(null), null);
  assert.equal(combatSignature(undefined), null);
});

test('signature is stable for the same combat', () => {
  assert.equal(combatSignature(combat), combatSignature({ ...combat }));
});

test('signature changes when the combat changes', () => {
  assert.notEqual(combatSignature(combat), combatSignature({ ...combat, to: 'N3' }));
  assert.notEqual(combatSignature(combat), combatSignature({ ...combat, rounds: [{}] }));
});

test('no replay when there is no combat', () => {
  assert.deepEqual(shouldReplay(null, null), { signature: null, replay: false });
});

test('replay on a fresh transition', () => {
  const r = shouldReplay(null, combat);
  assert.equal(r.replay, true);
  assert.equal(r.signature, combatSignature(combat));
});

test('no replay when the signature is unchanged', () => {
  const sig = combatSignature(combat);
  assert.deepEqual(shouldReplay(sig, combat), { signature: sig, replay: false });
});

test('replay when the signature changes', () => {
  const prev = combatSignature(combat);
  const next = { ...combat, to: 'N3' };
  const r = shouldReplay(prev, next);
  assert.equal(r.replay, true);
  assert.equal(r.signature, combatSignature(next));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/risk-combat-reveal.test.js`
Expected: FAIL — stub returns `null` / `{replay:false}` always.

- [ ] **Step 3: Implement the pure functions**

Replace the top of `plugins/risk/client/combat-reveal.js` (keep the file's later DOM code added in Task 5; for now the file contains only this):

```js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/risk-combat-reveal.test.js`
Expected: PASS — all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add plugins/risk/client/combat-reveal.js test/risk-combat-reveal.test.js
git commit -m "feat(risk): combat-reveal transition detection"
```

---

## Task 4: SVG board renderer

**Files:**
- Rewrite: `plugins/risk/client/board.js`

No JS unit test — DOM/SVG rendering is verified manually in Task 7. The drift guard (Task 2) already protects the data this consumes.

- [ ] **Step 1: Rewrite `board.js`**

Replace the entire contents of `plugins/risk/client/board.js`:

```js
// plugins/risk/client/board.js
import { TERRITORIES } from './map-geometry.js';
import { sideClass } from './themes.js';

const SVG = 'http://www.w3.org/2000/svg';

// Renders the map as an SVG: a connector line per adjacency (inter-continent
// edges get the `strait` class), a region polygon per territory coloured by
// owner, and the army count at the territory's label anchor. Tapping a region
// calls onPick(id); `selected` rings one region.
export function renderBoard(root, view, { onPick, selected }) {
  const svg = document.createElementNS(SVG, 'svg');
  svg.setAttribute('viewBox', '0 0 800 600');
  svg.setAttribute('class', 'risk-map');

  // Edges first so regions paint over the connector ends. Dedup with a<b.
  const drawn = new Set();
  for (const [id, g] of Object.entries(TERRITORIES)) {
    for (const n of g.neighbors) {
      const key = id < n ? `${id}|${n}` : `${n}|${id}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const a = TERRITORIES[id].label, b = TERRITORIES[n].label;
      const line = document.createElementNS(SVG, 'line');
      line.setAttribute('x1', a.x); line.setAttribute('y1', a.y);
      line.setAttribute('x2', b.x); line.setAttribute('y2', b.y);
      const strait = TERRITORIES[id].continent !== TERRITORIES[n].continent;
      line.setAttribute('class', strait ? 'edge strait' : 'edge');
      svg.appendChild(line);
    }
  }

  for (const [id, g] of Object.entries(TERRITORIES)) {
    const t = view.territories[id];
    const region = document.createElementNS(SVG, 'path');
    region.setAttribute('d', g.path);
    region.setAttribute('class',
      `region ${sideClass(t.owner)}${selected === id ? ' sel' : ''}`);
    region.addEventListener('click', () => onPick(id));
    svg.appendChild(region);

    const label = document.createElementNS(SVG, 'text');
    label.setAttribute('x', g.label.x);
    label.setAttribute('y', g.label.y);
    label.setAttribute('class', 'region-label');
    label.setAttribute('text-anchor', 'middle');
    label.textContent = `${id} · ${t.armies}`;
    label.addEventListener('click', () => onPick(id));
    svg.appendChild(label);
  }

  root.appendChild(svg);
}
```

- [ ] **Step 2: Run the full suite (regression — no rendering assertions)**

Run: `npm test`
Expected: PASS — `risk-client-files` still green; nothing imports `board.js` in tests so no behavioural change.

- [ ] **Step 3: Commit**

```bash
git add plugins/risk/client/board.js
git commit -m "feat(risk): SVG region-map board renderer"
```

---

## Task 5: Dice-replay renderer

**Files:**
- Modify: `plugins/risk/client/combat-reveal.js` (append the DOM renderer below the pure functions from Task 3)

No JS unit test — animation is visual, verified in Task 7. The pure logic it depends on is already tested in Task 3.

- [ ] **Step 1: Append the renderer to `combat-reveal.js`**

Append to `plugins/risk/client/combat-reveal.js` (below the existing exports — do not remove `combatSignature`/`shouldReplay`):

```js
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
```

- [ ] **Step 2: Run the regression suite**

Run: `node --test test/risk-combat-reveal.test.js && npm test`
Expected: PASS — Task 3 tests unaffected (pure exports unchanged); full suite green.

- [ ] **Step 3: Commit**

```bash
git add plugins/risk/client/combat-reveal.js
git commit -m "feat(risk): dice-replay DOM renderer"
```

---

## Task 6: Wire-up — opponent card, app render loop, continent rail

**Files:**
- Modify: `plugins/risk/client/index.html`
- Modify: `plugins/risk/client/app.js`

- [ ] **Step 1: Add the shared opponent-card to `index.html`**

In `plugins/risk/client/index.html`, add inside `<head>` after the existing stylesheet link:

```html
  <link rel="stylesheet" href="/shared/opponent-card.css" />
```

And in `<body>` before the existing `<script type="module" src="app.js"></script>`:

```html
  <script type="module" src="/shared/opponent-card.js"></script>
```

- [ ] **Step 2: Rewrite `app.js` to wire combat-reveal and the continent rail**

Replace the entire contents of `plugins/risk/client/app.js`:

```js
// plugins/risk/client/app.js
// Host integration: all transport URLs and context come from window.__GAME__,
// injected into index.html by the host (plugin-clients.js).
import { renderBoard } from './board.js';
import { renderActionBar } from './action-bar.js';
import { renderHistory } from './history.js';
import { renderEnd } from './end-screen.js';
import { CONTINENT_BONUS, TERRITORIES } from './map-geometry.js';
import { shouldReplay, renderCombatReveal } from './combat-reveal.js';

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
```

- [ ] **Step 3: Run the regression suite**

Run: `npm test`
Expected: PASS — `risk-client-files` (10 files) green; geometry + combat-reveal tests green; no behavioural test imports `app.js`.

- [ ] **Step 4: Commit**

```bash
git add plugins/risk/client/index.html plugins/risk/client/app.js
git commit -m "feat(risk): wire opponent-card, dice reveal, continent rail"
```

---

## Task 7: Antique campaign-map theme + live manual verification

**Files:**
- Rewrite: `plugins/risk/client/style.css`

- [ ] **Step 1: Rewrite `style.css` (all rules scoped under `#risk-root`)**

Replace the entire contents of `plugins/risk/client/style.css`:

```css
/* plugins/risk/client/style.css — antique campaign-map theme.
   All rules scoped under #risk-root so nothing leaks into the shared
   opponent-card (it keeps its neutral Gamebox styling). */
* { box-sizing: border-box; }
body { margin: 0; font-family: Georgia, 'Times New Roman', serif;
       background: #2b2417; color: #f3e8c8; }

#risk-root { --p0: #a8432b; --p1: #2c647f; --neutral: #8a7c5c;
  --ink: #5e4a28; --brass: #d4a93a; --parch: #e3d4ad;
  max-width: 860px; margin: 0 auto; padding: 1rem; }

#risk-root .banner { padding: .5rem .75rem; background: #3a2f1c;
  border: 1px solid var(--ink); border-radius: .3rem; margin-bottom: .5rem;
  letter-spacing: .03em; }

#risk-root .continent-rail { display: flex; flex-wrap: wrap; gap: .4rem;
  margin: .25rem 0 .75rem; }
#risk-root .cont-chip { font-size: .75rem; text-transform: capitalize;
  padding: .25rem .5rem; border: 1px solid var(--ink); border-radius: .3rem;
  background: #3a2f1c; opacity: .7; }
#risk-root .cont-chip.held { opacity: 1; border-color: var(--brass);
  color: var(--brass); }

#risk-root .risk-map { width: 100%; height: auto; display: block;
  background: var(--parch);
  border: 3px solid var(--ink); border-radius: .4rem; }
#risk-root .risk-map .edge { stroke: #b59a63; stroke-width: 2; }
#risk-root .risk-map .edge.strait { stroke: #8a7c5c; stroke-width: 2;
  stroke-dasharray: 6 5; }
#risk-root .risk-map .region { fill: var(--neutral);
  stroke: #3a2c12; stroke-width: 2; cursor: pointer; }
#risk-root .risk-map .region.p0 { fill: var(--p0); }
#risk-root .risk-map .region.p1 { fill: var(--p1); }
#risk-root .risk-map .region.sel { stroke: var(--brass); stroke-width: 4; }
#risk-root .risk-map .region-label { fill: #f3e8c8; font: 600 16px Georgia;
  paint-order: stroke; stroke: #2b1d0c; stroke-width: 3px; cursor: pointer; }

#risk-root .combat-reveal { margin: .75rem 0; padding: .6rem;
  background: #3a2f1c; border: 1px solid var(--ink); border-radius: .3rem;
  text-align: center; }
#risk-root .combat-reveal__head { font-size: .8rem; opacity: .8; }
#risk-root .combat-reveal__dice { font-size: 1.8rem; letter-spacing: .15rem;
  margin: .3rem 0; }
#risk-root .combat-reveal__dice .atk { color: var(--p0); }
#risk-root .combat-reveal__dice .def { color: var(--p1); }
#risk-root .combat-reveal__dice .vs { font-size: .9rem; opacity: .6;
  margin: 0 .5rem; }
#risk-root .combat-reveal__result { font-weight: bold; letter-spacing: .05em; }
#risk-root .combat-reveal__result.won { color: var(--brass); }
#risk-root .combat-reveal__result.lost { color: #8a7c5c; }

#risk-root .bar { display: flex; flex-wrap: wrap; gap: .5rem;
  margin: 1rem 0; align-items: center; }
#risk-root button { font: inherit; padding: .5rem .8rem; border-radius: .3rem;
  border: 1px solid var(--ink); background: #4a3a1e; color: #f3e8c8;
  cursor: pointer; }
#risk-root button:hover:not(:disabled) { border-color: var(--brass); }
#risk-root button:disabled { opacity: .4; cursor: not-allowed; }
#risk-root .log { font-size: .8rem; opacity: .8; max-height: 9rem;
  overflow: auto; border-top: 1px solid var(--ink); padding-top: .4rem; }
#risk-root .end { text-align: center; padding: 2rem; }
#risk-root .end h1 { color: var(--brass); letter-spacing: .08em; }
```

- [ ] **Step 2: Run the full suite**

Run: `npm test`
Expected: PASS — full suite green (10 client files, geometry drift guard, combat-reveal logic, all pre-existing Risk engine tests).

- [ ] **Step 3: Live manual verification against an AI game**

Start the server: `npm start` (serves on the configured port). In a browser, start a new Risk game vs an AI opponent (Admiral Vonnegut, Colonel Jaune, or Major Robert). Verify each:

  - [ ] Opponent portrait renders top-corner (persona art, not a glyph fallback) with the officer's name.
  - [ ] The "Talk smack…" input is present; typing a taunt and submitting produces an in-character banter bubble from the opponent within a few seconds.
  - [ ] The map renders as four parchment continents with connector lines; the five inter-continent connectors are dashed (straits).
  - [ ] Regions are coloured by owner (red/blue), neutral tan when unowned; army counts are legible at each region.
  - [ ] Tapping a region selects it (brass outline) and drives deploy/attack/fortify exactly as before (no behavioural regression).
  - [ ] On a *fresh* attack the dice step through round-by-round (~1.5–2s) then settle on "Captured"/"Repulsed".
  - [ ] Reload the page mid-game: the last combat shows its final state **instantly**, no animation replay.
  - [ ] The continent rail shows all four bonuses; fully holding a continent highlights its chip in brass.
  - [ ] Win/lose end screen renders themed.

  If any check fails, fix the relevant module and re-run from Step 2 before committing.

- [ ] **Step 4: Commit**

```bash
git add plugins/risk/client/style.css
git commit -m "feat(risk): antique campaign-map theme + verified live"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- War-room direction / drawn regions → Tasks 2, 4, 7 ✓
- Antique palette → Task 7 ✓
- Opponent card + taunt input (integration only, no shared-component edits) → Task 6 Step 1 ✓
- Banter via SSE → delivered by the shared component (no Risk code) ✓
- Combat dice animate-then-settle, instant on stale reload → Tasks 3, 5, 6 (seed-on-first-load) ✓
- Continent-bonus rail → Task 6 ✓
- map-geometry as data, drift-guarded → Task 2 ✓
- No server / shared-component changes → respected throughout ✓
- Out-of-scope items (42-territory map, interactive combat) → not introduced ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every command has expected output. ✓

**Type/name consistency:** `TERRITORIES`, `CONTINENT_BONUS` (Task 2) used identically in Tasks 4, 6. `combatSignature`/`shouldReplay` (Task 3) consumed in Task 6; `renderCombatReveal` (Task 5) consumed in Task 6. `sideClass` reused from existing `themes.js` (unchanged). CSS classes emitted by `board.js`/`combat-reveal.js`/`app.js` (`region`, `edge`, `strait`, `sel`, `region-label`, `combat-reveal*`, `continent-rail`, `cont-chip`, `held`, `banner`) all styled in Task 7. ✓
