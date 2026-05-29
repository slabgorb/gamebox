# Sorry! — True 60-Loop Movement + Forced-Move Banter Call

**Date:** 2026-05-28
**Status:** Approved (design)
**Scope:** Two contained changes to the Sorry! plugin:
1. **Engine** — replace the linear `path()`-index movement model with an absolute-square walker so backward cards wrap around the real 60-square loop (the canonical "back up near your Safety mouth" play).
2. **Bot** — when the AI has exactly one legal move, make a *banter-only* LLM call instead of a *play* (move-decision) call.

These are independent and could ship separately, but are designed together here.

---

## Part 1 — Engine: true 60-loop movement

### Problem

`plugins/sorry/server/rules/legal-moves.js` resolves a pawn's position to an
index in its side's **linear `path()`** list
(`[startExit … safetyEntry, safety×5, home]`, from `geometry.js`). Movement is
index arithmetic:

```js
const target = pos + steps;       // steps may be negative
if (target < 0) return null;      // backward off the path start → illegal
if (target > p.length - 1) return null; // overshoot Home → illegal
```

Consequences of the linear model:

- A pawn near Start **cannot back up past its own start-exit square** — `target < 0`
  returns `null`. The canonical Sorry! play (draw a 4 just after leaving Start,
  back up to land one short of your own Safety mouth, then dash into Home with a
  small forward card) is **impossible**.
- The board squares physically **behind** Start — the "dead zone" between a
  side's Safety entry and its Start exit (squares **2–3** for side a, **32–33**
  for side b) — are unreachable, even though they are real squares a pawn can
  legitimately occupy after backing up.

### Geometry recap (unchanged)

`geometry.js` (authoritative, untouched by this change):

```
TRACK_LEN   = 60
START_EXIT  = { a: 4,  b: 34 }
SAFETY_ENTRY= { a: 1,  b: 31 }
```

- Track positions are **already stored as absolute squares 0–59**
  (`pawn = { zone:'track', index }`); `out` places a pawn at `START_EXIT[side]`
  and slides resolve with `% TRACK_LEN`.
- Side a forward path: `4 → 5 → … → 59 → 0 → 1 (safety entry) → a-safe-0…4 → a-home`.
- The Safety entry square is a normal track square; a pawn of that side moving
  **forward off it** diverts into Safety. Other pawns pass over it normally.

### Change: absolute-square `step` walker

Replace `pathPos` / `squareToLoc` / the index-based `advance` with a single
one-square primitive over absolute squares + zones. `loc = { zone, index }`:

| From | Forward (`dir = +1`) | Backward (`dir = −1`) |
|---|---|---|
| `track`, `index === SAFETY_ENTRY[side]` | `{ zone:'safety', index:0 }` (divert) | `{ zone:'track', index:(index−1+60)%60 }` (pass over, **no** divert) |
| `track`, elsewhere | `{ zone:'track', index:(index+1)%60 }` | `{ zone:'track', index:(index−1+60)%60 }` |
| `safety`, `k < 4` | `{ zone:'safety', index:k+1 }` | `null` (Safety is forward-only) |
| `safety`, `k === 4` | `{ zone:'home', index:0 }` | `null` |
| `home` | `null` (overshoot) | `null` |

```js
function advance(side, pawn, steps) {
  let loc = { zone: pawn.zone, index: pawn.index };
  const dir = steps >= 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(steps); i++) {
    loc = step(side, loc, dir);
    if (loc === null) return null; // overshoot Home / illegal backward
  }
  return loc;
}
```

`advance` is only ever called for `track`/`safety` pawns (the `out` move handles
Start pawns separately), so `start` need not appear in the walker.

### Behavior

- **Forward / overshoot — identical to today.** In the forward (and
  non-underflowing backward) region the walker reproduces the old path-index
  result square-for-square: divert into Safety at the mouth, exact landing on
  Home legal, past-Home illegal. All current forward / AC tests stay green.
- **Backward into the dead zone — the fix.**
  - Side a pawn at square 4 (start exit), card 4 (back-4): `4→3→2→1→0` lands on
    **square 0**, one short of the Safety mouth at square 1. A subsequent
    forward-1 reaches square 1; forward-2 enters `a-safe-0`.
  - Side a pawn at square 4, card 10 back-1: lands on **square 3** (dead zone);
    forward movement from there walks `3→4→5→…` around the loop to Safety.
  - Side b symmetric around start-exit 34 / safety-entry 31 (dead zone 32–33).
  - Backward **passes over** the Safety entry without diverting — the entry is a
    one-way forward turn-in.
- **Safety is forward-only.** Backing a pawn that is already in the Safety Zone
  is illegal (`step` returns `null` for backward-from-safety). This is the
  canonical reading ("once in its Safety Zone a pawn moves forward to Home").
  No existing test pins back-out, so there is no regression. `ownTrackOrSafety`
  may stay as the candidate filter — Safety pawns simply yield no backward move.
- **Backward landing on a foreign slide start** triggers that slide, via the
  unchanged `resolveAndPlace` → `resolveLanding` track-landing path. Correct per
  real Sorry! (you slide whenever you land on another color's slide triangle,
  regardless of arrival direction).
- **Card 7 split, card 11 swap, Sorry! card — untouched.** None use backward
  steps; their existing enumeration and `applyChosenMove` handling are unchanged.

### Tests

Two existing tests pin the **old (buggy)** underflow-returns-null behavior and
must be rewritten to the canonical landings:

- `test/sorry/legal-moves.test.js` — *"AC4: a pawn whose -4 destination falls
  before the path start gets no move"* → now lands on the wrapped square.
- `test/sorry/legal-moves.test.js` — *"AC5: card 10 omits the back-1 when it
  would underflow the path start"* → now produces the dead-zone landing.

New coverage to add (TDD, RED first):

- Back-4 from start-exit lands one short of the Safety mouth (a: sq 4 → sq 0;
  b: sq 34 → sq 30), for **both** sides.
- Back-1 from start-exit lands in the dead zone (a: sq 4 → sq 3; b: sq 34 → sq 33).
- Forward out of the dead zone walks the full loop to Safety (e.g. a pawn parked
  on sq 3 + forward reaches the track, not Safety, until it crosses sq 1).
- The "back up then dash into Safety" sequence: from the post-back-4 square a
  small forward card diverts into `*-safe-*` / Home.
- A Safety-Zone pawn yields **no** backward move on cards 4 and 10.
- (Regression) all existing forward/overshoot/exact-Home cases still pass.

`geometry.js` is unchanged; `path()` is retained because the test file imports it
for expected-position math. `pathPos` / `squareToLoc` are deleted from
`legal-moves.js`.

### Files touched (Part 1)

- `plugins/sorry/server/rules/legal-moves.js` — rewrite `advance`, delete
  `pathPos`/`squareToLoc`, add `step`.
- `test/sorry/legal-moves.test.js` — rewrite 2 underflow tests, add new
  backward/dead-zone/Safety coverage.

---

## Part 2 — Bot: forced-move = banter-only call

### Problem

`plugins/sorry/server/ai/sorry-player.js#chooseAction` always issues a full
**play** call for any turn with ≥1 legal move: it builds a prompt listing every
legal move and asks the LLM for `{ moveId, banter }`, then validates and (on bad
output) falls back to a random legal move. In Sorry!, turns with **exactly one**
legal move are common (a single pawn out, a single unblocked card). For those,
the move is forced — there is no decision — so the move-selection half of the
call is wasted, and the illegal-move fallback path is dead weight.

### Change

Add a middle branch in `chooseAction` (orchestrator contract:
`{ action, banter?, sessionId?, usedLlm? }`, broadcasts `r.banter`,
`usedLlm === false` ⇒ no subprocess / no resume-slot burn):

```
moves.length === 0 → pass, usedLlm:false   (unchanged; stays silent — no banter)
moves.length === 1 → banter-only call      (new)
moves.length  >= 2 → play call             (unchanged)
```

**Banter-only call:**

1. New `buildBanterPrompt({ state, move, botPlayerIdx, userMessages })` in
   `ai/prompts.js`: states the position (own/opponent pawns, drawn card),
   declares *"You have exactly one legal move: `<describeMove(move)>`. You will
   play it. React in character."*, **keeps the opponent-chat reaction block**
   (`userMessages`), and asks for `{"banter": "<one short in-character line>"}`
   only — **no legal-move menu, no `moveId`**.
2. New `parseBanter(text)` in `ai/prompts.js`: reuse `extractJson`, read
   `.banter`; on any failure fall back to the raw trimmed text, then to `''`.
   **Never throws** — a forced move can never be derailed by bad LLM output, so
   no random fallback is needed here.
3. Send via the same `llm.send` with the resumed game session (`sessionId`) so
   banter stays in character and hits the prompt cache, exactly like the play
   path.
4. Return:
   ```js
   {
     action: { type: 'move', payload: { moveId: moves[0].id } },
     banter,
     sessionId: r.sessionId,
   }
   ```
   `usedLlm` is left unset (not `false`) — a real LLM call happened, so the
   orchestrator's normal resume-slot accounting applies.

### Behavior / decisions

- This is **still one LLM round-trip** — the goal is to downgrade it from
  "decide + talk" to "just talk," not to remove it. Wins: smaller prompt, no
  move-selection reasoning, and the illegal-move random-fallback path is
  eliminated for forced turns.
- Forced-move banter **does** react to opponent chat (confirmed) — the reaction
  block is included.
- The zero-move **pass turn stays silent** (confirmed) — no banter call added
  there; `{ action:{type:'pass'}, usedLlm:false }` is unchanged.
- Architecture: kept **self-contained inside `chooseAction`** rather than routed
  through the orchestrator's `chooseBanter` side-call. That side-call only fires
  for *auto-entries*; a Sorry! forced move still flows through `chooseAction`,
  so a self-contained branch is the smaller, clearer change and needs no
  orchestrator edit.

### Tests

- `chooseAction` with exactly one legal move: returns a `move` action whose
  `moveId === moves[0].id`, includes `banter`, and does **not** present a move
  menu to the LLM (assert `buildBanterPrompt` shape / that the play prompt
  builder is not used).
- Banter parse tolerance: malformed/empty LLM output ⇒ the forced move still
  plays (action intact), banter degrades to `''`, no throw.
- The single-move banter prompt includes the opponent-chat reaction block when
  `userMessages` is non-empty.
- (Regression) zero-move pass unchanged; ≥2-move play call unchanged.

### Files touched (Part 2)

- `plugins/sorry/server/ai/sorry-player.js` — add the `moves.length === 1`
  branch.
- `plugins/sorry/server/ai/prompts.js` — add `buildBanterPrompt`, `parseBanter`.
- `test/sorry/sorry-player.js` (and/or a prompts test) — new coverage above.

---

## Out of scope / noted findings

- **Own-pawn collision:** the engine does not forbid landing on a square already
  occupied by one of your *own* pawns (it would bump it to Start). Pre-existing;
  backward movement may newly expose it. Not addressed here — flag as a finding.
- **Pass-turn banter:** intentionally left silent (per decision above); could be
  a future enhancement.

## Verification (post-implementation)

- `npm test` (node) and `npm run test:client` (vitest) green.
- Live playtest on prod (this Mac) vs `the-bully`: confirm a back-4 near Start
  produces the dead-zone landing and a follow-up small card dashes into Safety;
  confirm a forced (single-move) bot turn still emits banter. Restart after any
  server-code change: `launchctl kickstart -k gui/501/com.slabgorb.words-server`.
