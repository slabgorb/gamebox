# Sorry! True 60-Loop Movement + Forced-Move Banter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Sorry! backward cards wrap the real 60-square loop (enabling the canonical "back up near your Safety mouth, then dash into Home" play), and make the AI spend only a banter call (not a move-decision call) when it has exactly one legal move.

**Architecture:** Two independent changes. (1) Replace the linear `path()`-index movement model in `legal-moves.js` with an absolute-square `step` walker over squares 0–59. (2) Add a `moves.length === 1` branch in the Sorry! bot's `chooseAction` that issues a banter-only LLM prompt and plays the forced move directly.

**Tech Stack:** Node ESM, `node:test` + `node:assert/strict`. Tests run with `node --test <file>`; full suite via `npm test`. Spec: `docs/superpowers/specs/2026-05-28-sorry-true-loop-movement-design.md`.

**Key geometry (from `plugins/sorry/server/geometry.js`, unchanged):** `TRACK_LEN = 60`, `START_EXIT = { a: 4, b: 34 }`, `SAFETY_ENTRY = { a: 1, b: 31 }`. Track positions are absolute squares 0–59 stored on `pawn.index`. Dead zone behind Start: squares 2–3 (side a), 32–33 (side b).

---

## Task 1: Engine — absolute-square movement walker

**Files:**
- Modify: `plugins/sorry/server/rules/legal-moves.js` (replace `pathPos`/`squareToLoc`/`advance`, lines 1–33)
- Test: `test/sorry/legal-moves.test.js` (rewrite 2 tests at lines 134–140 and 161–172; add a new section)

- [ ] **Step 1: Rewrite the two tests that pin the old underflow-null behavior**

In `test/sorry/legal-moves.test.js`, replace the test at lines 134–140 (`'AC4: a pawn whose -4 destination falls before the path start gets no move'`) with:

```js
test('AC4: card 4 backs a pawn at its start-exit around the loop into the dead zone', () => {
  const s = baseState({ drawnCard: 4 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 4 }; // start exit; -4 wraps behind Start
  const moves = legalMoves(s);
  const back = moves.find((m) => m.pawnId === 0 && m.kind === 'back');
  assert.ok(back, 'expected a back move that wraps the loop');
  // 4 → 3 → 2 → 1 → 0: lands on square 0, one short of the safety mouth (sq 1).
  assert.deepEqual(back.to, { zone: 'track', index: 0 });
});
```

Replace the test at lines 161–172 (`'AC5: card 10 omits the back-1 when it would underflow the path start'`) with:

```js
test('AC5: card 10 back-1 from the start-exit lands in the dead zone behind Start', () => {
  const s = baseState({ drawnCard: 10 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 4 };
  const moves = legalMoves(s);
  const back = moves.find((m) => m.pawnId === 0 && m.kind === 'back');
  assert.ok(back, 'expected a back-1 move');
  assert.deepEqual(back.to, { zone: 'track', index: 3 }); // 4 → 3 (dead zone)
  assert.ok(moves.find((m) => m.pawnId === 0 && m.kind === 'forward'), 'forward-10 still legal');
});
```

- [ ] **Step 2: Add a new test section for backward wrap, dead-zone, and Safety-is-forward-only**

Append at the end of `test/sorry/legal-moves.test.js`:

```js
// =========================================================================
// True 60-loop movement: backward wraps the loop; Safety is forward-only.
// =========================================================================

test('LOOP: card 4 wraps side b around its start-exit too', () => {
  const s = baseState({ drawnCard: 4, currentPlayer: 'b' });
  s.pawns.b[0] = { id: 0, zone: 'track', index: 34 }; // b start exit
  const moves = legalMoves(s);
  const back = moves.find((m) => m.pawnId === 0 && m.kind === 'back');
  assert.ok(back, 'expected a wrap-back move for side b');
  // 34 → 33 → 32 → 31 → 30: one short of b's safety mouth (sq 31).
  assert.deepEqual(back.to, { zone: 'track', index: 30 });
});

test('LOOP: from square 0 a forward-2 dives through the mouth into Safety', () => {
  const s = baseState({ drawnCard: 2 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 0 };
  const moves = legalMoves(s);
  const fwd = moves.find((m) => m.pawnId === 0 && m.kind === 'forward');
  assert.ok(fwd, 'expected a forward move');
  assert.deepEqual(fwd.to, { zone: 'safety', index: 0 }); // 0 → 1(mouth) → safe-0
});

test('LOOP: a pawn parked in the dead zone moves forward along the track, not into Safety', () => {
  const s = baseState({ drawnCard: 5 });
  s.pawns.a[0] = { id: 0, zone: 'track', index: 3 }; // dead zone behind Start
  const moves = legalMoves(s);
  const fwd = moves.find((m) => m.pawnId === 0 && m.kind === 'forward');
  assert.ok(fwd, 'expected a forward move');
  assert.deepEqual(fwd.to, { zone: 'track', index: 8 }); // 3→4→5→6→7→8, never crosses mouth (sq 1)
});

test('LOOP: a pawn already in Safety cannot move backward on card 4', () => {
  const s = baseState({ drawnCard: 4 });
  s.pawns.a[0] = { id: 0, zone: 'safety', index: 2 };
  const moves = legalMoves(s);
  assert.equal(moves.find((m) => m.pawnId === 0 && m.kind === 'back'), undefined, 'Safety is forward-only');
});

test('LOOP: card 10 offers no back-1 for a Safety pawn', () => {
  const s = baseState({ drawnCard: 10 });
  s.pawns.a[0] = { id: 0, zone: 'safety', index: 1 };
  const moves = legalMoves(s);
  assert.equal(moves.find((m) => m.pawnId === 0 && m.kind === 'back'), undefined, 'no back-out of Safety');
});
```

- [ ] **Step 3: Run the tests and verify they FAIL**

Run: `node --test test/sorry/legal-moves.test.js`
Expected: FAIL — the rewritten AC4/AC5 and the new LOOP tests fail because the current `advance` returns `null` on backward underflow (e.g. `back` is `undefined` where a move is now expected).

- [ ] **Step 4: Replace the path-index movement model with the walker**

In `plugins/sorry/server/rules/legal-moves.js`, replace the import on line 1 and the three functions on lines 3–33 (`pathPos`, `squareToLoc`, `advance`) with:

```js
import { START_EXIT, SAFETY_ENTRY, TRACK_LEN } from '../geometry.js';

// One physical step along the absolute 60-square loop (dir = +1 forward, -1
// backward). Forward diverts into Safety at the side's safety mouth and ends at
// Home; Safety is a one-way lane (no backing out). Returns null for an illegal
// step: overshooting past Home, or moving backward out of Safety/Home.
function step(side, loc, dir) {
  if (dir > 0) {
    if (loc.zone === 'home') return null; // already Home — cannot advance
    if (loc.zone === 'safety') {
      return loc.index === 4 ? { zone: 'home', index: 0 } : { zone: 'safety', index: loc.index + 1 };
    }
    // track: divert into Safety when leaving the side's own safety mouth.
    if (loc.index === SAFETY_ENTRY[side]) return { zone: 'safety', index: 0 };
    return { zone: 'track', index: (loc.index + 1) % TRACK_LEN };
  }
  // backward
  if (loc.zone !== 'track') return null; // Safety/Home are forward-only
  return { zone: 'track', index: (loc.index - 1 + TRACK_LEN) % TRACK_LEN };
}

// Advance `steps` (may be negative) along the loop from a pawn; return the
// destination loc, or null if any step is illegal. Only called for track/safety
// pawns (Start pawns move via the `out` move, never through here).
function advance(side, pawn, steps) {
  let loc = { zone: pawn.zone, index: pawn.index };
  const dir = steps >= 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(steps); i++) {
    loc = step(side, loc, dir);
    if (loc === null) return null;
  }
  return loc;
}
```

Note: `START_EXIT` is still used later in the file (the `out` move). `path` is no longer imported here. The rest of `legalMoves` (the `pushForward` helper, card branches, `ownTrackOrSafety`) is unchanged.

- [ ] **Step 5: Run the Sorry! engine tests and verify they PASS**

Run: `node --test test/sorry/legal-moves.test.js test/sorry/actions.test.js test/sorry/slides.test.js test/sorry/geometry.test.js test/sorry/state.test.js`
Expected: PASS — rewritten AC4/AC5 + new LOOP tests pass, and all existing forward/overshoot/exact-Home/split/swap/sorry tests still pass (the walker reproduces the old forward results square-for-square).

- [ ] **Step 6: Commit**

```bash
git add plugins/sorry/server/rules/legal-moves.js test/sorry/legal-moves.test.js
git commit -m "feat(sorry): true 60-loop movement — backward wraps the board

Replace the linear path()-index advance() with an absolute-square step
walker. Backward cards now wrap behind Start into the dead zone (sq 2-3
for a, 32-33 for b), enabling the canonical back-up-then-dash-into-Safety
play. Safety stays forward-only; forward/overshoot semantics unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Bot prompts — banter-only prompt builder and parser

**Files:**
- Modify: `plugins/sorry/server/ai/prompts.js` (add `buildBanterPrompt`, `parseBanter`, `BANTER_FOOTER`)
- Test: `test/sorry/prompts.test.js` (append new tests)

- [ ] **Step 1: Write failing tests for the banter prompt and parser**

First, add `buildBanterPrompt` and `parseBanter` to the existing prompts import in `test/sorry/prompts.test.js` (the multi-line `import { buildTurnPrompt, parseLlmResponse, extractJson }` block becomes `import { buildTurnPrompt, buildBanterPrompt, parseLlmResponse, parseBanter, extractJson }`). `baseState` is already imported there. Then append:

```js
test('buildBanterPrompt: states the forced move and omits the legal-move menu', () => {
  const move = { id: 'forward:0:8', kind: 'forward', pawnId: 0, steps: 8, to: { zone: 'track', index: 18 } };
  const state = baseState({ drawnCard: 8 });
  const prompt = buildBanterPrompt({ state, move, botPlayerIdx: 0, userMessages: [] });
  assert.match(prompt, /one legal move/i);
  assert.match(prompt, /Move pawn 0 forward 8/);
  assert.doesNotMatch(prompt, /choose exactly one by its id/i); // no move menu
  assert.doesNotMatch(prompt, /"moveId"/); // banter-only response footer
  assert.match(prompt, /"banter"/);
});

test('buildBanterPrompt: includes the opponent-chat reaction block', () => {
  const move = { id: 'forward:0:8', kind: 'forward', pawnId: 0, steps: 8, to: { zone: 'track', index: 18 } };
  const state = baseState({ drawnCard: 8 });
  const prompt = buildBanterPrompt({ state, move, botPlayerIdx: 0, userMessages: ['nice try'] });
  assert.match(prompt, /opponent just said/i);
  assert.match(prompt, /nice try/);
});

test('parseBanter: reads the banter field from a JSON object', () => {
  assert.equal(parseBanter('{"banter":"Forced, but fabulous."}'), 'Forced, but fabulous.');
});

test('parseBanter: accepts a plain-text line when there is no JSON', () => {
  assert.equal(parseBanter('Forced, but fabulous.'), 'Forced, but fabulous.');
});

test('parseBanter: returns empty string for empty/whitespace input and never throws', () => {
  assert.equal(parseBanter(''), '');
  assert.equal(parseBanter('   '), '');
  assert.equal(parseBanter(undefined), '');
});
```

(If `baseState` is not already imported in `prompts.test.js`, add `import { baseState } from '../_helpers/sorry-fixtures.js';`.)

- [ ] **Step 2: Run the tests and verify they FAIL**

Run: `node --test test/sorry/prompts.test.js`
Expected: FAIL — `buildBanterPrompt` / `parseBanter` are not exported (`undefined is not a function`).

- [ ] **Step 3: Implement `buildBanterPrompt`, `parseBanter`, and `BANTER_FOOTER`**

In `plugins/sorry/server/ai/prompts.js`, add after the existing `RESPONSE_FOOTER` constant:

```js
const BANTER_FOOTER =
  'Respond with a single JSON object (and nothing else): ' +
  '{"banter": "<one short in-character line, max ~12 words, never empty — even one syllable counts>"}';
```

Add after `buildTurnPrompt`:

```js
// Forced-move turn: the bot has exactly one legal move, so there is no decision
// to make — ask only for an in-character line, not a move choice. Keeps the
// opponent-chat reaction block so banter still responds to trash talk.
export function buildBanterPrompt({ state, move, botPlayerIdx, userMessages = [] }) {
  const botSide = botPlayerIdx === 0 ? 'a' : 'b';
  const oppSide = botSide === 'a' ? 'b' : 'a';
  const sideLabel = botSide === 'a' ? 'side A' : 'side B';

  const blocks = [
    `You are playing ${sideLabel} in a game of Sorry!.`,
    `Card drawn this turn: ${cardLabel(state.drawnCard)}`,
    `Your pawns:\n${state.pawns[botSide].map(pawnLine).join('\n')}`,
    `Opponent pawns:\n${state.pawns[oppSide].map(pawnLine).join('\n')}`,
    `You have exactly one legal move, and it will be played for you: ${describeMove(move)}`,
  ];
  if (userMessages.length > 0) blocks.push(reactionBlock(userMessages));
  blocks.push(BANTER_FOOTER);
  return blocks.join('\n\n');
}
```

Add after `parseLlmResponse`:

```js
// Lenient banter extraction for a forced-move turn. Never throws — a forced
// move plays regardless of the LLM's output. Prefers a JSON `banter` field,
// falls back to the raw trimmed text, then to the empty string.
export function parseBanter(text) {
  if (typeof text !== 'string') return '';
  try {
    const parsed = JSON.parse(extractJson(text));
    if (typeof parsed.banter === 'string') return parsed.banter.trim();
  } catch {
    // Not JSON — fall through to the raw-text fallback below.
  }
  return text.trim();
}
```

- [ ] **Step 4: Run the tests and verify they PASS**

Run: `node --test test/sorry/prompts.test.js`
Expected: PASS — all five new tests pass alongside the existing prompt tests.

- [ ] **Step 5: Commit**

```bash
git add plugins/sorry/server/ai/prompts.js test/sorry/prompts.test.js
git commit -m "feat(sorry): banter-only prompt + lenient parser for forced moves

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Bot — forced-move banter call in `chooseAction`

**Files:**
- Modify: `plugins/sorry/server/ai/sorry-player.js` (add a `moves.length === 1` branch; extend the import)
- Test: `test/sorry/sorry-player.test.js` (append new tests)

- [ ] **Step 1: Write failing tests for the one-move banter branch**

Append to `test/sorry/sorry-player.test.js`:

```js
// =========================================================================
// Forced move (exactly one legal move): banter-only call, no move menu.
// =========================================================================

// A state with exactly one legal move: pawn 0 on the track, the other three
// already Home (Home pawns produce no move on a numeric card).
const oneMoveState = () => baseState({
  drawnCard: 8,
  pawns: {
    a: [
      { id: 0, zone: 'track', index: 10 },
      { id: 1, zone: 'home', index: 0 },
      { id: 2, zone: 'home', index: 0 },
      { id: 3, zone: 'home', index: 0 },
    ],
    b: [
      { id: 0, zone: 'start', index: 0 },
      { id: 1, zone: 'start', index: 0 },
      { id: 2, zone: 'start', index: 0 },
      { id: 3, zone: 'start', index: 0 },
    ],
  },
});

test('chooseAction: forced move plays the only legal move and uses a banter-only prompt', async () => {
  let sentPrompt = null;
  const llm = { send: async ({ prompt }) => { sentPrompt = prompt; return { text: '{"banter":"Forced, but fabulous."}', sessionId: 'bs1' }; } };
  const r = await chooseAction({ llm, persona, sessionId: null, state: oneMoveState(), botPlayerIdx: 0, userMessages: [] });
  assert.deepEqual(r.action, { type: 'move', payload: { moveId: 'forward:0:8' } });
  assert.equal(r.banter, 'Forced, but fabulous.');
  assert.equal(r.sessionId, 'bs1');
  assert.doesNotMatch(sentPrompt, /choose exactly one by its id/i); // no decision menu
});

test('chooseAction: forced-move banter degrades to empty string on unparseable output, move still plays', async () => {
  const llm = { send: async () => ({ text: '', sessionId: 'bs2' }) };
  const r = await chooseAction({ llm, persona, sessionId: null, state: oneMoveState(), botPlayerIdx: 0, userMessages: [] });
  assert.deepEqual(r.action, { type: 'move', payload: { moveId: 'forward:0:8' } });
  assert.equal(r.banter, '');
});

test('chooseAction: forced-move prompt still reacts to opponent chat', async () => {
  let sentPrompt = null;
  const llm = { send: async ({ prompt }) => { sentPrompt = prompt; return { text: '{"banter":"Heard that."}', sessionId: 'bs3' }; } };
  await chooseAction({ llm, persona, sessionId: null, state: oneMoveState(), botPlayerIdx: 0, userMessages: ['nice try'] });
  assert.match(sentPrompt, /opponent just said/i);
  assert.match(sentPrompt, /nice try/);
});
```

- [ ] **Step 2: Run the tests and verify they FAIL**

Run: `node --test test/sorry/sorry-player.test.js`
Expected: FAIL — current `chooseAction` issues the full play prompt (which contains "choose exactly one by its id"), so the `doesNotMatch` assertion fails; and on empty `text` it falls back to a random legal move rather than the banter-only path.

- [ ] **Step 3: Add the one-move branch to `chooseAction`**

In `plugins/sorry/server/ai/sorry-player.js`, change the import on line 2 to:

```js
import { buildTurnPrompt, buildBanterPrompt, parseLlmResponse, parseBanter } from './prompts.js';
```

Then insert this branch immediately after the `moves.length === 0` block (after the `return { action: { type: 'pass' }, usedLlm: false };` closing brace, before `const prompt = buildTurnPrompt(...)`):

```js
  // Exactly one legal move: there is no decision to make. Spend a banter-only
  // call (no move menu, no moveId) instead of a full play call, and play the
  // forced move directly. Banter still reacts to opponent chat. A forced move
  // can never be derailed by bad LLM output, so parseBanter never throws.
  if (moves.length === 1) {
    const move = moves[0];
    const banterPrompt = buildBanterPrompt({ state, move, botPlayerIdx, userMessages });
    const br = await llm.send({
      prompt: banterPrompt,
      sessionId,
      systemPrompt: sessionId ? null : persona.systemPrompt,
    });
    return {
      action: { type: 'move', payload: { moveId: move.id } },
      banter: parseBanter(br.text),
      sessionId: br.sessionId,
    };
  }
```

- [ ] **Step 4: Run the tests and verify they PASS**

Run: `node --test test/sorry/sorry-player.test.js`
Expected: PASS — the three new forced-move tests pass, and the existing multi-move play / fallback / pass tests still pass (`baseState()` with all pawns in Start on card 1 yields four `out` moves, so it still takes the play branch).

- [ ] **Step 5: Commit**

```bash
git add plugins/sorry/server/ai/sorry-player.js test/sorry/sorry-player.test.js
git commit -m "feat(sorry): forced-move turns use a banter-only call, not a play call

When the bot has exactly one legal move there is no decision to make —
issue a banter-only prompt and play the forced move directly, skipping
move-selection reasoning and the illegal-move fallback. Pass turns stay
silent; multi-move turns are unchanged.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Full verification, build, deploy, live playtest

**Files:** none (verification only)

- [ ] **Step 1: Run the full node suite**

Run: `npm test`
Expected: PASS — full node suite green (baseline was 1087 passing / 1 skipped; no count regression).

- [ ] **Step 2: Run the client suite (no client code changed — regression guard)**

Run: `npm run test:client`
Expected: PASS — 214 passing (unchanged; this work is server-only).

- [ ] **Step 3: Deploy to prod (this Mac) — server code changed, restart required**

```bash
launchctl kickstart -k gui/501/com.slabgorb.words-server
curl -s -o /dev/null -w "%{http_code}\n" localhost:3000
```
Expected: `200`. (No client rebuild needed — no `src/clients/` changes.)

- [ ] **Step 4: Live playtest the backward-loop play**

Drive a live game vs `the-bully` (header auth `cf-access-authenticated-user-email: slabgorbai@gmail.com`, per the spec's verification notes / `project_e3_sorry_plugin` memory). Confirm:
- A pawn just out of Start drawing a 4 offers a backward move that lands one short of the Safety mouth (not "no move").
- A follow-up small forward card from there dives into Safety / Home.
- A forced (single-move) bot turn still emits banter in the chat.

- [ ] **Step 5: Update the project memory**

Update `/Users/slabgorb/.claude/projects/-Users-slabgorb-Projects-words/memory/project_e3_sorry_plugin.md`: mark board-brainstorm item #2 (true-60-loop movement) DONE, and note the forced-move banter-call optimization. Keep the MEMORY.md pointer line accurate.

---

## Notes / out of scope

- **Own-pawn collision** (landing on a square occupied by your own pawn bumps it
  to Start instead of being illegal) is pre-existing and NOT fixed here. Backward
  movement may newly expose it — flag as a finding if it surfaces in playtest.
- **Pass-turn banter** stays intentionally silent (zero-move turns), per the
  approved design.
