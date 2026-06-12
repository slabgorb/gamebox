# Sorry! Explicit Pass Turns — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Sorry! engine's silent `settleToPlayable` auto-pass with an explicit, acknowledged `pass` action — humans tap a Pass button, the bot passes mechanically and visibly — fixing both the "invisible turns" confusion and the bot no-move crash.

**Architecture:** The engine stops looping over unplayable cards. When the player on turn has no legal move, the only legal action is `pass`, which discards the drawn card, draws the next, and switches the turn. `state.lastEvent` carries a pass breadcrumb the client renders. The bot adapter returns a `pass` action (no LLM call) when it has no moves.

**Tech Stack:** Node ESM engine (`plugins/sorry/server/`), `node:test`; React/TSX client (`src/clients/sorry/`), Vitest + Testing Library.

**Test commands:**
- Single node file: `node --test test/sorry/<file>.test.js`
- All node: `npm test`
- Single client file: `npx vitest run test/client/<file>.test.tsx`
- All client: `npm run test:client`

---

### Task 1: Add a `pass` action + `drawAndSwitch` helper to the engine

**Files:**
- Modify: `plugins/sorry/server/actions.js`
- Test: `test/sorry/actions.test.js`

- [ ] **Step 1: Write failing tests** — append to `test/sorry/actions.test.js`. Use the shared fixture import already present in that file (`baseState` from `../_helpers/sorry-fixtures.js`); if not imported, add `import { baseState } from '../_helpers/sorry-fixtures.js';` and `import { legalMoves } from '../../plugins/sorry/server/rules/legal-moves.js';`.

```js
test('pass: discards the drawn card, draws the next, and switches the turn', () => {
  // All pawns in Start + card 3 ⇒ no legal move ⇒ pass is the only action.
  const state = baseState({ drawnCard: 3, deck: [1, 2, 5], discard: [] });
  assert.equal(legalMoves(state).length, 0, 'precondition: no legal move');

  const r = applySorryAction({ state, action: { type: 'pass' }, actorId: 'user-a' });

  assert.equal(r.error, undefined);
  assert.equal(r.ended, false);
  assert.equal(r.state.currentPlayer, 'b', 'pass yields the turn');
  assert.equal(r.state.activeUserId, r.state.sides.b);
  assert.equal(r.state.drawnCard, 1, 'opponent draws the next card (deck[0])');
  assert.ok(r.state.discard.includes(3), 'the passed card is discarded');
  assert.deepEqual(r.summary, { kind: 'pass', card: 3 });
});

test('pass: is rejected when the player still has a legal move', () => {
  const state = baseState({ drawnCard: 1 }); // card 1 ⇒ four out:* moves exist
  assert.ok(legalMoves(state).length > 0, 'precondition: a move exists');
  const r = applySorryAction({ state, action: { type: 'pass' }, actorId: 'user-a' });
  assert.match(r.error, /legal move/i);
});

test('pass: sets lastEvent to the pass breadcrumb', () => {
  const state = baseState({ drawnCard: 3, deck: [1], discard: [] });
  const r = applySorryAction({ state, action: { type: 'pass' }, actorId: 'user-a' });
  assert.deepEqual(r.state.lastEvent, { kind: 'pass', side: 'a', card: 3 });
});

test('a move clears lastEvent (the pass breadcrumb does not persist past real play)', () => {
  const state = baseState({ drawnCard: 1, deck: [1], lastEvent: { kind: 'pass', side: 'b', card: 4 } });
  const r = applySorryAction({ state, action: { type: 'move', payload: { moveId: 'out:0' } }, actorId: 'user-a' });
  assert.equal(r.error, undefined);
  assert.equal(r.state.lastEvent, null);
});
```

- [ ] **Step 2: Run tests — verify they fail**

Run: `node --test test/sorry/actions.test.js`
Expected: the four new tests FAIL (`pass` rejected as `unknown action: pass`; `lastEvent` not set/cleared).

- [ ] **Step 3: Implement** in `plugins/sorry/server/actions.js`.

Add the shared helper (place it just above `advanceTurn`), replacing the body of `advanceTurn` to use it:

```js
// Discard the just-resolved card, draw the next, and set the player on turn.
// `keepTurn` is true after a draw-again (a played 2); a pass never keeps the
// turn. Always re-anchors activeUserId to the new current player so the
// orchestrator's bot-wake gate stays consistent.
function drawAndSwitch(state, pawnsAfter, discardedCard, keepTurn, rng) {
  const currentPlayer = keepTurn ? state.currentPlayer : opponent(state.currentPlayer);
  const drawn = draw({ deck: state.deck, discard: [...state.discard, discardedCard], rng });
  return {
    ...state,
    pawns: pawnsAfter,
    deck: drawn.deck,
    discard: drawn.discard,
    drawnCard: drawn.card,
    currentPlayer,
    activeUserId: state.sides[currentPlayer],
  };
}
```

Delete the old `advanceTurn` function and the `settleToPlayable` export + `SETTLE_GUARD` const (they are removed in this task; `state.js` import is fixed in Task 2). Replace the top guard and add the pass branch in `applySorryAction`:

```js
export function applySorryAction({ state, action, actorId, rng = Math.random }) {
  const side = actorSide(state, actorId);
  if (side === null) return { error: 'unknown participant' };
  if (!action || (action.type !== 'move' && action.type !== 'pass')) {
    return { error: `unknown action: ${action?.type}` };
  }
  if (side !== state.currentPlayer) return { error: 'not your turn' };

  if (action.type === 'pass') {
    if (legalMoves(state).length > 0) return { error: 'you still have a legal move' };
    const card = state.drawnCard;
    const next = drawAndSwitch(state, state.pawns, card, false, rng);
    const withEvent = { ...next, winner: null, lastEvent: { kind: 'pass', side, card } };
    return { state: withEvent, ended: false, summary: { kind: 'pass', card } };
  }

  const moveId = action.payload?.moveId;
  const m = legalMoves(state).find((x) => x.id === moveId);
  if (!m) return { error: 'move is not legal' };

  const pawnsAfter = applyChosenMove(state, side, m);
  if (!pawnsAfter) return { error: 'move is not legal' };

  if (allHome(pawnsAfter[side])) {
    const winnerUserId = state.sides[side];
    const winState = {
      ...state,
      pawns: pawnsAfter,
      discard: [...state.discard, state.drawnCard],
      drawnCard: null,
      winner: side,
      activeUserId: winnerUserId,
    };
    return { state: winState, ended: true, scoreDelta: { [winnerUserId]: 1 }, summary: { kind: 'win', side } };
  }

  const playedCard = state.drawnCard;
  const next = drawAndSwitch(state, pawnsAfter, playedCard, playedCard === 2, rng);
  const withEvent = { ...next, winner: null, lastEvent: null };
  return { state: withEvent, ended: false, summary: { kind: m.kind } };
}
```

Add `import { legalMoves } from './rules/legal-moves.js';` is already present at the top of the file — confirm it stays. `draw` import already present.

- [ ] **Step 4: Run tests — verify pass-related tests pass and the file's existing tests still pass**

Run: `node --test test/sorry/actions.test.js`
Expected: PASS (all tests in the file).

- [ ] **Step 5: Commit**

```bash
git add plugins/sorry/server/actions.js test/sorry/actions.test.js
git commit -m "feat(sorry): explicit pass action; remove silent auto-settle from advanceTurn"
```

---

### Task 2: `buildInitialState` stops settling; update the opening regression test

**Files:**
- Modify: `plugins/sorry/server/state.js`
- Test: `test/sorry/state.test.js`

- [ ] **Step 1: Rewrite the failing regression test.** In `test/sorry/state.test.js`, add the import `import { applySorryAction } from '../../plugins/sorry/server/actions.js';` near the other imports, then REPLACE the test titled `'the starting player always has a legal move (opening turn never deadlocks)'` with:

```js
test('the opening never deadlocks: side a can always either move or legally pass', () => {
  // No silent settling. The opening card may be unplayable (every pawn in Start,
  // only 1/2 leave Start), in which case a pass must be legal and advance the turn.
  for (let seed = 1; seed <= 100; seed++) {
    const s = buildInitialState({ participants, rng: mulberry32(seed) });
    assert.equal(s.currentPlayer, 'a', `seed ${seed}: the opening is always side a's turn`);
    const moves = legalMoves(s);
    if (moves.length === 0) {
      const r = applySorryAction({ state: s, action: { type: 'pass' }, actorId: 11 });
      assert.equal(r.error, undefined, `seed ${seed}: pass rejected on a no-move opening`);
      assert.equal(r.state.currentPlayer, 'b', `seed ${seed}: a no-move opening passes to b`);
    }
  }
});
```

Also fix the stale comment in the `'initial state places 4 pawns…'` test: replace the line `// rng: () => 0 deals a 1, which side a can play — so a legitimately starts and` / `// activeUserId is a's userId (an unusable opening would auto-pass to b).` with:

```js
  // The opening is always side a's turn now (no auto-settle); rng: () => 0 deals a 1.
```

(The assertions in that test — `currentPlayer === 'a'`, `activeUserId === 11`, `lastEvent === null` — remain valid and unchanged.)

- [ ] **Step 2: Run — verify failure**

Run: `node --test test/sorry/state.test.js`
Expected: FAIL — `buildInitialState` still calls `settleToPlayable`, but more importantly Task 1 already deleted `settleToPlayable`, so `state.js`'s import now throws on load (`SyntaxError`/undefined). The whole file errors. That is the expected red.

- [ ] **Step 3: Implement** — rewrite `plugins/sorry/server/state.js` to drop the settle:

```js
import { buildDeck, draw } from './deck.js';

// The host engine calls this as initialState({ participants, rng, variant }) —
// `rng` is a top-level key (see src/server/routes.js and the cribbage/buraco/words
// plugins). Accept it at the top level so game creation uses the engine's seeded rng.
export function buildInitialState({ participants, rng = Math.random } = {}) {
  if (!Array.isArray(participants) || participants.length !== 2) {
    throw new Error('sorry requires exactly 2 participants');
  }
  const pA = participants.find((p) => p?.side === 'a');
  const pB = participants.find((p) => p?.side === 'b');
  if (!pA || !pB) throw new Error("sorry: missing side 'a' or 'b' participant");
  if (pA.userId === undefined || pB.userId === undefined) throw new Error('sorry: participant missing userId');
  if (pA.userId === pB.userId) throw new Error('sorry: participants must have distinct userIds');

  const mkPawns = () => Array.from({ length: 4 }, (_, i) => ({ id: i, zone: 'start', index: 0 }));
  const fullDeck = buildDeck(rng);
  const { card, deck, discard } = draw({ deck: fullDeck, discard: [], rng });

  // Deal the opening card; side a is always on turn. If a cannot use the card
  // (every pawn in Start, only a 1/2 leaves Start) it has no legal moves and a
  // will pass — no silent settling.
  return {
    sides: { a: pA.userId, b: pB.userId },
    pawns: { a: mkPawns(), b: mkPawns() },
    deck,
    discard,
    drawnCard: card,
    currentPlayer: 'a',
    winner: null,
    lastEvent: null,
    activeUserId: pA.userId,
  };
}
```

- [ ] **Step 4: Run the full sorry engine suite — verify green**

Run: `node --test test/sorry/state.test.js test/sorry/actions.test.js test/sorry/orchestrator-turn.test.js`
Expected: PASS. (The orchestrator-turn tests seed `deck:[1,...]` so the next player always has a move; they remain valid.)

- [ ] **Step 5: Commit**

```bash
git add plugins/sorry/server/state.js test/sorry/state.test.js
git commit -m "feat(sorry): buildInitialState no longer auto-settles the opening card"
```

---

### Task 3: Bot passes mechanically when it has no legal move (no LLM call, no crash)

**Files:**
- Modify: `plugins/sorry/server/ai/sorry-player.js`
- Test: `test/sorry/sorry-player.test.js`

- [ ] **Step 1: Write the failing test** — append to `test/sorry/sorry-player.test.js`:

```js
// =========================================================================
// No legal move ⇒ the bot passes mechanically, without calling the LLM.
// (Guards the empty-move crash: moves[random*0] was undefined → undefined.id.)
// =========================================================================

test('chooseAction: returns a pass action and does not call the LLM when there are no legal moves', async () => {
  let called = false;
  const llm = { send: async () => { called = true; return { text: '{}', sessionId: 's' }; } };
  // All pawns in Start + card 3 ⇒ no legal move (3 cannot leave Start).
  const state = baseState({ drawnCard: 3 });
  const r = await chooseAction({ llm, persona, sessionId: null, state, botPlayerIdx: 0, userMessages: [] });
  assert.deepEqual(r.action, { type: 'pass' });
  assert.equal(r.usedLlm, false);
  assert.equal(called, false, 'the LLM must not be invoked on a forced pass');
});
```

- [ ] **Step 2: Run — verify failure**

Run: `node --test test/sorry/sorry-player.test.js`
Expected: FAIL — current code calls `llm.send` and then throws on `chosen.id` (chosen is undefined).

- [ ] **Step 3: Implement** — add the early return at the top of `chooseAction` in `plugins/sorry/server/ai/sorry-player.js`, right after `const moves = legalMoves(state);`:

```js
  const moves = legalMoves(state);

  // No legal move: the only action is to pass. Resolve it mechanically — skip
  // the LLM (and never index an empty move list, which used to crash the turn).
  if (moves.length === 0) {
    return { action: { type: 'pass' }, usedLlm: false };
  }
```

- [ ] **Step 4: Run — verify green (and the rest of the file still passes)**

Run: `node --test test/sorry/sorry-player.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/sorry/server/ai/sorry-player.js test/sorry/sorry-player.test.js
git commit -m "fix(sorry): bot passes mechanically on a no-move turn instead of crashing"
```

---

### Task 4: Extend client contracts (pass action + lastEvent)

**Files:**
- Modify: `src/clients/shared/contracts/sorry.ts`

- [ ] **Step 1: Read the contract** — `src/clients/shared/contracts/sorry.ts`. Confirm the current `SorryAction` and `SorryView` shapes.

- [ ] **Step 2: Add the `pass` action variant.** If `SorryAction` is a union like `{ type: 'move'; payload: { moveId: string } }`, add `| { type: 'pass' }`. If it is a single interface, widen `type` to `'move' | 'pass'` and make `payload` optional.

- [ ] **Step 3: Add `lastEvent` to `SorryView`** (and a `SorryPassEvent` type):

```ts
export interface SorryPassEvent {
  kind: 'pass';
  side: SorrySide;
  card: SorryCard;
}
```

Add to `SorryView`: `lastEvent: SorryPassEvent | null;`

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -i sorry || echo "no new sorry type errors"`
Expected: no new sorry-related type errors (pre-existing unrelated risk errors per memory may remain).

- [ ] **Step 5: Commit**

```bash
git add src/clients/shared/contracts/sorry.ts
git commit -m "feat(sorry): contract types for pass action and lastEvent"
```

---

### Task 5: Client — Pass button + lastEvent note

**Files:**
- Modify: `src/clients/sorry/SorryApp.tsx`
- Modify: `plugins/sorry/client/style.css`
- Test: `test/client/sorry-app.test.tsx`

- [ ] **Step 1: Write the failing tests** — append to `test/client/sorry-app.test.tsx` (add `fireEvent` to the import: `import { render, screen, fireEvent } from "@testing-library/react";`):

```js
it("shows a Pass button on your turn when you have no legal move, and posts a pass", () => {
  h.view = baseView({ youAre: "a", currentPlayer: "a", drawnCard: 3, legalMoves: [] });
  render(<SorryApp />);
  const btn = screen.getByTestId("pass-button");
  fireEvent.click(btn);
  expect(h.post).toHaveBeenCalledWith({ type: "pass" });
});

it("shows no Pass button when you have a legal move", () => {
  h.view = baseView({
    youAre: "a",
    currentPlayer: "a",
    legalMoves: [{ id: "out:0", kind: "out", pawnId: 0, to: { zone: "track", index: 4 } }],
  });
  render(<SorryApp />);
  expect(screen.queryByTestId("pass-button")).toBeNull();
});

it("renders a note when the opponent had no move and passed", () => {
  h.view = baseView({ youAre: "a", currentPlayer: "a", lastEvent: { kind: "pass", side: "b", card: 4 } });
  render(<SorryApp />);
  const note = screen.getByTestId("last-event");
  expect(note).toHaveTextContent(/no legal move, passed/i);
  expect(note).toHaveTextContent(/4/);
});
```

- [ ] **Step 2: Run — verify failure**

Run: `npx vitest run test/client/sorry-app.test.tsx`
Expected: FAIL — no `pass-button`/`last-event` test ids exist yet.

- [ ] **Step 3: Implement** in `src/clients/sorry/SorryApp.tsx`. After computing `myTurn`, add:

```jsx
  const legalMoves = view.legalMoves ?? [];
  const mustPass = myTurn && legalMoves.length === 0;
```

Replace the turn-prompt block with one that branches on `mustPass`:

```jsx
      <div className={`va-turn${myTurn ? " is-mine" : ""}`} data-testid="turn-prompt" role="status">
        {myTurn ? (
          mustPass ? (
            <span>
              <strong>Your turn</strong> — you drew{" "}
              <b className="va-turn-card">{cardFace(view.drawnCard)}</b>, but there's no legal move.{" "}
              <button
                type="button"
                className="va-pass-btn"
                data-testid="pass-button"
                onClick={() => post({ type: "pass" })}
              >
                Pass
              </button>
            </span>
          ) : (
            <span>
              <strong>Your turn</strong> — you drew{" "}
              <b className="va-turn-card">{cardFace(view.drawnCard)}</b>. Tap a glowing space to move.
            </span>
          )
        ) : (
          <span>
            <strong>{ctx.opponentFriendlyName ?? "Opponent"}</strong> is thinking…
          </span>
        )}
      </div>

      {view.lastEvent?.kind === "pass" && (
        <div className="va-lastevent" data-testid="last-event" role="status">
          {view.lastEvent.side === view.youAre ? "You" : (ctx.opponentFriendlyName ?? "Opponent")} drew{" "}
          <b>{cardFace(view.lastEvent.card)}</b> — no legal move, passed.
        </div>
      )}
```

- [ ] **Step 4: Add styles** to `plugins/sorry/client/style.css` (after the `.va-turn-card` rule):

```css
.va-pass-btn {
  margin-left: 6px;
  padding: 4px 16px;
  font-family: var(--serif-display);
  font-weight: 700;
  font-size: 13px;
  letter-spacing: 0.08em;
  color: #fff5dc;
  background: linear-gradient(180deg, var(--leather-1) 0%, var(--leather-2) 55%, var(--leather-3) 100%);
  border: 1px solid #3a1f0a;
  border-radius: 4px;
  cursor: pointer;
  box-shadow: inset 0 1px 0 rgba(255,222,180,0.45), 0 1px 2px rgba(0,0,0,0.3);
}
.va-pass-btn:hover { filter: brightness(1.08); }
.va-lastevent {
  margin-top: 8px;
  text-align: center;
  font-family: var(--serif-body);
  font-style: italic;
  font-size: 13px;
  color: var(--ink-faint);
}
```

- [ ] **Step 5: Run — verify green (full client sorry suite)**

Run: `npx vitest run test/client/sorry-app.test.tsx test/client/sorry-board.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/clients/sorry/SorryApp.tsx plugins/sorry/client/style.css test/client/sorry-app.test.tsx
git commit -m "feat(sorry): Pass button on no-move turns + lastEvent pass note"
```

---

### Task 6: Full regression + build + deploy

- [ ] **Step 1: Run the whole node suite**

Run: `npm test`
Expected: PASS (watch for any other sorry test that assumed auto-settle — none expected; orchestrator-turn seeds its decks).

- [ ] **Step 2: Run the whole client suite**

Run: `npm run test:client`
Expected: PASS.

- [ ] **Step 3: Build the sorry client bundle**

Run: `GAMEBOX_PLUGIN=sorry npx vite build --config vite.config.client.js`
Expected: writes `plugins/sorry/client/app.js` + `app.css`, no errors.

- [ ] **Step 4: Deploy to prod (this Mac) and verify**

Run: `launchctl kickstart -k gui/501/com.slabgorb.words-server && sleep 1 && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/`
Expected: `200`.

- [ ] **Step 5: Commit anything outstanding** (build artifacts if tracked)

```bash
git add -A plugins/sorry/client
git commit -m "build(sorry): rebuild client bundle for pass turns" || echo "nothing to commit"
```

---

## Self-Review

- **Spec coverage:** §1 engine → Tasks 1–2. §2 view (no change) → verified, no task needed. §3 client → Task 5. §4 bot → Task 3. §5 error handling → Task 1 (pass-rejected test). Edge cases (`2` replay, win, repeated passes, opening) → Tasks 1–2 tests. Contracts → Task 4. ✅
- **Placeholders:** none — every code step has full code.
- **Type/name consistency:** `drawAndSwitch(state, pawnsAfter, discardedCard, keepTurn, rng)`, `lastEvent: { kind:'pass', side, card }`, `summary: { kind:'pass', card }`, action `{ type:'pass' }`, test ids `pass-button` / `last-event` — used identically across tasks. ✅
- **Note:** Task 2 Step 2's red appears because Task 1 already removed `settleToPlayable`, so `state.js`'s import is dangling until Task 2 Step 3 — expected; the tasks are ordered to be run in sequence.
