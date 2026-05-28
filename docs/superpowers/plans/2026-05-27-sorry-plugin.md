# Sorry! Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a full-ruleset, 2-player **Sorry!** game plugin to Gamebox, playable vs two contrasting AI personas.

**Architecture:** A self-contained plugin at `plugins/sorry/` mirroring `plugins/backgammon/`. A server-authoritative engine (state → legal-moves → actions) drives play; the card draw is an automatic server-side rule (no client RNG handshake — the client animates the already-revealed `drawnCard`). The AI adapter enumerates legal moves and asks the LLM to pick one `moveId`, falling back to a random legal move on bad output. Two personas in `data/ai-personas/` gate on `games: [sorry]`.

**Tech Stack:** Node ESM (no build for server), vitest for tests, vanilla JS client (matching existing plugins).

**Reference contracts (read before starting):**
- Plugin shape: `plugins/backgammon/plugin.js`
- Host action contract + `activeUserId` mirroring: `plugins/backgammon/server/actions.js`
- AI adapter contract: `plugins/backgammon/server/ai/backgammon-player.js`
- LLM response parsing: `plugins/backgammon/server/ai/prompts.js` (`parseLlmResponse`, `extractJson`)
- Errors: `src/server/ai/errors.js` (`InvalidLlmResponse`, `InvalidLlmMove`)
- Registry: `src/plugins/index.js`
- AI adapter registry: `src/server/ai/index.js`
- Persona schema: `data/ai-personas/aunt-irene.yaml`, validated by `src/server/ai/persona-catalog.js`

---

## Board Geometry (shared definitions)

All movement is computed along a **per-side path**: an ordered list of physical square ids from a pawn's start-exit, clockwise around the 60-space track, into that side's 5-square safety zone, ending at Home. This makes forward movement simple index arithmetic and isolates bump logic to the shared track.

**Physical squares:**
- Track: integers `0..59` (shared, clockwise).
- Safety: `'a-safe-0'..'a-safe-4'`, `'b-safe-0'..'b-safe-4'` (own-color only — cannot be bumped).
- Start: `'a-start'`, `'b-start'` (holding pen, 4 pawns each at game start).
- Home: `'a-home'`, `'b-home'` (terminal).

**Per-side geometry constants** (`server/geometry.js`) — internally consistent layout matching standard Sorry! relationships (opposite-corner colors):

| side | startExit (track idx) | safetyEntry (track idx) | slides (track start idx → length) |
|------|----------------------|-------------------------|-----------------------------------|
| a    | 4                    | 1                       | `9→4`, `34→5`                     |
| b    | 34                   | 31                      | `39→4`, `4→5`                     |

A pawn leaving Start enters the track at `startExit`. It travels clockwise; when it reaches `safetyEntry` it turns into its own safety zone (`-safe-0..4`) and then Home. `path('a')` therefore = `[4,5,...,59,0,1, 'a-safe-0','a-safe-1','a-safe-2','a-safe-3','a-safe-4','a-home']` (track from startExit clockwise up to and including safetyEntry, then safety, then home). `path('b')` is the analogous list starting at 34, wrapping to 31.

> Slides belong to a color; a pawn that lands on the **start square of a slide that is not its own color** travels to the slide's end, bumping every pawn (own or opponent) strictly between start and end back to their Start. Landing on your own color's slide does nothing special.

---

## Task 1: Plugin skeleton + registration

**Files:**
- Create: `plugins/sorry/plugin.js`
- Create: `plugins/sorry/server/state.js`
- Create: `plugins/sorry/server/view.js`
- Modify: `src/plugins/index.js`
- Test: `test/sorry/plugin-registration.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/sorry/plugin-registration.test.js
import { describe, it, expect } from 'vitest';
import { plugins } from '../../src/plugins/index.js';

describe('sorry plugin registration', () => {
  it('is registered with the expected shape', () => {
    const p = plugins.sorry;
    expect(p).toBeDefined();
    expect(p.id).toBe('sorry');
    expect(p.displayName).toBe('Sorry!');
    expect(p.players).toBe(2);
    expect(typeof p.initialState).toBe('function');
    expect(typeof p.applyAction).toBe('function');
    expect(typeof p.publicView).toBe('function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sorry/plugin-registration.test.js`
Expected: FAIL — `plugins.sorry` is undefined.

- [ ] **Step 3: Create the minimal plugin modules**

```js
// plugins/sorry/server/state.js
export function buildInitialState({ participants }) {
  if (!Array.isArray(participants) || participants.length !== 2) {
    throw new Error('sorry requires exactly 2 participants');
  }
  const pA = participants.find(p => p?.side === 'a');
  const pB = participants.find(p => p?.side === 'b');
  if (!pA || !pB) throw new Error("sorry: missing side 'a' or 'b' participant");
  if (pA.userId === undefined || pB.userId === undefined) throw new Error('sorry: participant missing userId');
  if (pA.userId === pB.userId) throw new Error('sorry: participants must have distinct userIds');
  return { sides: { a: pA.userId, b: pB.userId } }; // expanded in Task 3
}
```

```js
// plugins/sorry/server/view.js
export function sorryPublicView({ state, viewerId }) {
  let youAre = null;
  if (state.sides?.a === viewerId) youAre = 'a';
  else if (state.sides?.b === viewerId) youAre = 'b';
  // Redact deck order; expose everything else (filled out in Task 3/5).
  const { deck, ...rest } = state;
  return { ...rest, deckCount: Array.isArray(deck) ? deck.length : 0, youAre };
}
```

```js
// plugins/sorry/plugin.js
import { buildInitialState } from './server/state.js';
import { applySorryAction } from './server/actions.js';
import { sorryPublicView } from './server/view.js';

export default {
  id: 'sorry',
  displayName: 'Sorry!',
  players: 2,
  clientDir: 'plugins/sorry/client',
  initialState: buildInitialState,
  applyAction: applySorryAction,
  publicView: sorryPublicView,
};
```

Create a stub `plugins/sorry/server/actions.js` so the import resolves (replaced in Task 4):

```js
// plugins/sorry/server/actions.js
export function applySorryAction({ state }) {
  return { error: 'not implemented' };
}
```

- [ ] **Step 4: Register the plugin**

In `src/plugins/index.js`, add the import alongside the others and the map entry:

```js
import sorryPlugin from '../../plugins/sorry/plugin.js';
```
```js
  sorry: sorryPlugin,
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/sorry/plugin-registration.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/sorry src/plugins/index.js test/sorry/plugin-registration.test.js
git commit -m "feat(sorry): plugin skeleton + registration"
```

---

## Task 2: Deck

**Files:**
- Create: `plugins/sorry/server/deck.js`
- Test: `test/sorry/deck.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/sorry/deck.test.js
import { describe, it, expect } from 'vitest';
import { buildDeck, draw, RANK_COUNTS } from '../../plugins/sorry/server/deck.js';

describe('sorry deck', () => {
  it('has exactly 45 cards with canonical rank counts', () => {
    const deck = buildDeck(() => 0.5);
    expect(deck).toHaveLength(45);
    const counts = {};
    for (const c of deck) counts[c] = (counts[c] ?? 0) + 1;
    expect(counts).toEqual(RANK_COUNTS);
    expect(RANK_COUNTS).toEqual({ 1: 5, 2: 4, 3: 4, 4: 4, 5: 4, 7: 4, 8: 4, 10: 4, 11: 4, 12: 4, sorry: 4 });
  });

  it('draw returns top card, shrinking the deck; reshuffles discard when empty', () => {
    const { card, deck, discard } = draw({ deck: [1, 2], discard: [3], rng: () => 0 });
    expect(card).toBe(1);
    expect(deck).toEqual([2]);
    expect(discard).toEqual([3]);
    const empty = draw({ deck: [], discard: [5, 7], rng: () => 0 });
    expect(empty.card).toBeDefined();
    expect([5, 7]).toContain(empty.card);
    expect(empty.discard).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sorry/deck.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the deck**

```js
// plugins/sorry/server/deck.js
export const RANK_COUNTS = { 1: 5, 2: 4, 3: 4, 4: 4, 5: 4, 7: 4, 8: 4, 10: 4, 11: 4, 12: 4, sorry: 4 };

function shuffle(cards, rng) {
  const a = cards.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function buildDeck(rng = Math.random) {
  const cards = [];
  for (const [rank, n] of Object.entries(RANK_COUNTS)) {
    const value = rank === 'sorry' ? 'sorry' : Number(rank);
    for (let i = 0; i < n; i++) cards.push(value);
  }
  return shuffle(cards, rng);
}

// Pops the top card. If the deck is empty, the discard pile is shuffled to
// form a fresh deck first. Pure: returns the next {card, deck, discard}.
export function draw({ deck, discard, rng = Math.random }) {
  let d = deck.slice();
  let disc = discard.slice();
  if (d.length === 0) {
    if (disc.length === 0) throw new Error('sorry: no cards left to draw');
    d = shuffle(disc, rng);
    disc = [];
  }
  const [card, ...rest] = d;
  return { card, deck: rest, discard: disc };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sorry/deck.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/sorry/server/deck.js test/sorry/deck.test.js
git commit -m "feat(sorry): 45-card deck with draw/reshuffle"
```

---

## Task 3: Board geometry + full initial state

**Files:**
- Create: `plugins/sorry/server/geometry.js`
- Modify: `plugins/sorry/server/state.js`
- Test: `test/sorry/geometry.test.js`, `test/sorry/state.test.js`

- [ ] **Step 1: Write the failing tests**

```js
// test/sorry/geometry.test.js
import { describe, it, expect } from 'vitest';
import { path, SLIDES, START_EXIT, SAFETY_ENTRY } from '../../plugins/sorry/server/geometry.js';

describe('sorry geometry', () => {
  it('path for side a starts at startExit and ends at home', () => {
    const p = path('a');
    expect(p[0]).toBe(START_EXIT.a);          // 4
    expect(p[p.length - 1]).toBe('a-home');
    expect(p.slice(-6)).toEqual(['a-safe-0','a-safe-1','a-safe-2','a-safe-3','a-safe-4','a-home']);
  });
  it('path turns into safety right after safetyEntry', () => {
    const p = path('a');
    const entryPos = p.indexOf(SAFETY_ENTRY.a); // 1
    expect(p[entryPos + 1]).toBe('a-safe-0');
  });
  it('defines two slides per side', () => {
    expect(SLIDES.a).toHaveLength(2);
    expect(SLIDES.b).toHaveLength(2);
    expect(SLIDES.a[0]).toMatchObject({ start: expect.any(Number), length: expect.any(Number) });
  });
});
```

```js
// test/sorry/state.test.js
import { describe, it, expect } from 'vitest';
import { buildInitialState } from '../../plugins/sorry/server/state.js';

const participants = [{ side: 'a', userId: 11 }, { side: 'b', userId: 22 }];

describe('sorry initial state', () => {
  it('places 4 pawns per side in start and draws the first card', () => {
    const s = buildInitialState({ participants });
    expect(s.sides).toEqual({ a: 11, b: 22 });
    expect(s.pawns.a).toHaveLength(4);
    expect(s.pawns.b).toHaveLength(4);
    expect(s.pawns.a.every(p => p.zone === 'start')).toBe(true);
    expect(s.currentPlayer).toBe('a');
    expect(s.drawnCard).toBeDefined();        // first card already drawn for player a
    expect(s.deck.length + s.discard.length + 1).toBe(45);
    expect(s.activeUserId).toBe(11);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/sorry/geometry.test.js test/sorry/state.test.js`
Expected: FAIL — modules/fields missing.

- [ ] **Step 3: Implement geometry**

```js
// plugins/sorry/server/geometry.js
export const TRACK_LEN = 60;
export const START_EXIT = { a: 4, b: 34 };
export const SAFETY_ENTRY = { a: 1, b: 31 };
// Slides belong to a color. {start: track index of the slide's first square, length: squares advanced}.
export const SLIDES = {
  a: [{ start: 9, length: 4 }, { start: 34, length: 5 }],
  b: [{ start: 39, length: 4 }, { start: 4, length: 5 }],
};

// Ordered list of physical square ids a pawn of `side` traverses, from the
// square it lands on leaving Start, clockwise to and including safetyEntry,
// then its 5 safety squares, then home.
export function path(side) {
  const exit = START_EXIT[side];
  const entry = SAFETY_ENTRY[side];
  const out = [];
  let i = exit;
  // walk clockwise until we have just appended safetyEntry
  while (true) {
    out.push(i);
    if (i === entry) break;
    i = (i + 1) % TRACK_LEN;
  }
  for (let k = 0; k < 5; k++) out.push(`${side}-safe-${k}`);
  out.push(`${side}-home`);
  return out;
}
```

- [ ] **Step 4: Implement full initial state**

Replace `plugins/sorry/server/state.js` body's return with the full shape and first draw:

```js
// plugins/sorry/server/state.js
import { buildDeck, draw } from './deck.js';

export function buildInitialState({ participants, options }) {
  if (!Array.isArray(participants) || participants.length !== 2) {
    throw new Error('sorry requires exactly 2 participants');
  }
  const pA = participants.find(p => p?.side === 'a');
  const pB = participants.find(p => p?.side === 'b');
  if (!pA || !pB) throw new Error("sorry: missing side 'a' or 'b' participant");
  if (pA.userId === undefined || pB.userId === undefined) throw new Error('sorry: participant missing userId');
  if (pA.userId === pB.userId) throw new Error('sorry: participants must have distinct userIds');

  const rng = typeof options?.rng === 'function' ? options.rng : Math.random;
  const mkPawns = () => Array.from({ length: 4 }, (_, i) => ({ id: i, zone: 'start', index: 0 }));
  const fullDeck = buildDeck(rng);
  const { card, deck, discard } = draw({ deck: fullDeck, discard: [], rng });

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

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run test/sorry/geometry.test.js test/sorry/state.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add plugins/sorry/server/geometry.js plugins/sorry/server/state.js test/sorry/geometry.test.js test/sorry/state.test.js
git commit -m "feat(sorry): board geometry + initial state with first draw"
```

---

## Task 4: Legal-move enumeration

**Files:**
- Create: `plugins/sorry/server/rules/legal-moves.js`
- Test: `test/sorry/legal-moves.test.js`

Each legal move is `{ id, kind, pawnId, ... }` where `kind` is one of
`out` (Start→startExit, cards 1/2), `forward` (advance N along path), `back`
(cards 4 = −4, 10 may be −1), `split` (card 7 split across two pawns: an array
of two `forward` legs summing to 7), `swap` (card 11: swap one own track pawn
with an opponent track pawn), `sorry` (Sorry! card: a Start pawn replaces an
opponent track pawn, bumping it home). A pawn at `home` never moves; pawns in a
`safety` zone cannot exceed Home (overshoot is illegal). `out`/`sorry`/`swap`
targets must be track squares (never safety/home/start).

- [ ] **Step 1: Write the failing tests**

```js
// test/sorry/legal-moves.test.js
import { describe, it, expect } from 'vitest';
import { legalMoves } from '../../plugins/sorry/server/rules/legal-moves.js';
import { START_EXIT } from '../../plugins/sorry/server/geometry.js';

function baseState(over = {}) {
  return {
    pawns: {
      a: [{ id: 0, zone: 'start', index: 0 }, { id: 1, zone: 'start', index: 0 },
          { id: 2, zone: 'start', index: 0 }, { id: 3, zone: 'start', index: 0 }],
      b: [{ id: 0, zone: 'start', index: 0 }, { id: 1, zone: 'start', index: 0 },
          { id: 2, zone: 'start', index: 0 }, { id: 3, zone: 'start', index: 0 }],
    },
    currentPlayer: 'a',
    drawnCard: 1,
    ...over,
  };
}

describe('sorry legal moves', () => {
  it('card 1 from all-in-start yields only out-moves to startExit', () => {
    const moves = legalMoves(baseState({ drawnCard: 1 }));
    expect(moves.length).toBeGreaterThan(0);
    expect(moves.every(m => m.kind === 'out')).toBe(true);
    expect(moves[0].to).toEqual({ zone: 'track', index: START_EXIT.a });
  });

  it('a 3 with all pawns in start has no legal move', () => {
    const moves = legalMoves(baseState({ drawnCard: 3 }));
    expect(moves).toEqual([]);
  });

  it('card 4 moves a track pawn backward 4', () => {
    const s = baseState({ drawnCard: 4 });
    s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
    const moves = legalMoves(s);
    const back = moves.find(m => m.pawnId === 0 && m.kind === 'back');
    expect(back.to).toEqual({ zone: 'track', index: 6 });
  });

  it('card 7 offers a two-pawn split summing to 7', () => {
    const s = baseState({ drawnCard: 7 });
    s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
    s.pawns.a[1] = { id: 1, zone: 'track', index: 20 };
    const moves = legalMoves(s);
    const split = moves.find(m => m.kind === 'split');
    expect(split.legs).toHaveLength(2);
    expect(split.legs[0].steps + split.legs[1].steps).toBe(7);
  });

  it('card 11 offers a swap with an opponent track pawn', () => {
    const s = baseState({ drawnCard: 11 });
    s.pawns.a[0] = { id: 0, zone: 'track', index: 10 };
    s.pawns.b[0] = { id: 0, zone: 'track', index: 25 };
    const moves = legalMoves(s);
    expect(moves.some(m => m.kind === 'swap' && m.pawnId === 0 && m.targetPawnId === 0)).toBe(true);
  });

  it('Sorry! brings a start pawn onto an opponent track pawn', () => {
    const s = baseState({ drawnCard: 'sorry' });
    s.pawns.b[0] = { id: 0, zone: 'track', index: 25 };
    const moves = legalMoves(s);
    const sorry = moves.find(m => m.kind === 'sorry');
    expect(sorry.to).toEqual({ zone: 'track', index: 25 });
    expect(sorry.targetPawnId).toBe(0);
  });

  it('a safety-zone pawn cannot overshoot Home', () => {
    const s = baseState({ drawnCard: 5 });
    s.pawns.a = s.pawns.a.map(p => ({ ...p, zone: 'home' }));
    s.pawns.a[0] = { id: 0, zone: 'safety', index: 3 }; // 1 step from home; 5 overshoots
    const moves = legalMoves(s);
    expect(moves.find(m => m.pawnId === 0)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/sorry/legal-moves.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement legal-move enumeration**

```js
// plugins/sorry/server/rules/legal-moves.js
import { path, START_EXIT } from '../geometry.js';

// Resolve a pawn's current position to its index within its side's path()
// list. Start pawns are "before" the path (index -1).
function pathPos(side, pawn) {
  if (pawn.zone === 'start') return -1;
  const p = path(side);
  if (pawn.zone === 'track') return p.indexOf(pawn.index);
  if (pawn.zone === 'safety') return p.indexOf(`${side}-safe-${pawn.index}`);
  if (pawn.zone === 'home') return p.length - 1;
  return -1;
}

function squareToLoc(sq) {
  if (typeof sq === 'number') return { zone: 'track', index: sq };
  if (sq.endsWith('-home')) return { zone: 'home', index: 0 };
  const m = sq.match(/-safe-(\d)$/);
  if (m) return { zone: 'safety', index: Number(m[1]) };
  return null;
}

// Advance `steps` (may be negative) along the path from a pawn; return the
// destination loc, or null if it would overshoot home or fall off the start.
function advance(side, pawn, steps) {
  const p = path(side);
  const pos = pathPos(side, pawn);
  const target = pos + steps;
  if (target < 0) return null;                 // backward off the track / out of start
  if (target > p.length - 1) return null;      // overshoot home
  return squareToLoc(p[target]);
}

function ownTrackOrSafety(pawns, side) {
  return pawns[side].filter(p => p.zone === 'track' || p.zone === 'safety');
}

export function legalMoves(state) {
  const side = state.currentPlayer;
  const opp = side === 'a' ? 'b' : 'a';
  const card = state.drawnCard;
  const mine = state.pawns[side];
  const moves = [];

  const pushForward = (pawn, steps, kind = 'forward') => {
    const to = advance(side, pawn, steps);
    if (to) moves.push({ id: `${kind}:${pawn.id}:${steps}`, kind, pawnId: pawn.id, steps, to });
  };

  // Out of start (cards 1 and 2 only)
  if (card === 1 || card === 2) {
    for (const pawn of mine) {
      if (pawn.zone === 'start') {
        moves.push({ id: `out:${pawn.id}`, kind: 'out', pawnId: pawn.id, to: { zone: 'track', index: START_EXIT[side] } });
      }
    }
  }

  const numeric = { 1: 1, 2: 2, 3: 3, 5: 5, 8: 8, 12: 12 };
  if (card in numeric) {
    for (const pawn of mine) {
      if (pawn.zone === 'track' || pawn.zone === 'safety') pushForward(pawn, numeric[card]);
    }
  }

  if (card === 4) {
    for (const pawn of ownTrackOrSafety(state.pawns, side)) pushForward(pawn, -4, 'back');
  }

  if (card === 10) {
    for (const pawn of ownTrackOrSafety(state.pawns, side)) {
      pushForward(pawn, 10, 'forward');
      pushForward(pawn, -1, 'back');
    }
  }

  if (card === 7) {
    const movers = ownTrackOrSafety(state.pawns, side);
    for (const pawn of movers) pushForward(pawn, 7, 'forward');
    // splits across two distinct pawns summing to 7
    for (let s = 1; s <= 6; s++) {
      const other = 7 - s;
      for (const p1 of movers) {
        for (const p2 of movers) {
          if (p1.id === p2.id) continue;
          const to1 = advance(side, p1, s);
          const to2 = advance(side, p2, other);
          if (to1 && to2) {
            moves.push({
              id: `split:${p1.id}:${s}:${p2.id}:${other}`,
              kind: 'split',
              legs: [{ pawnId: p1.id, steps: s, to: to1 }, { pawnId: p2.id, steps: other, to: to2 }],
            });
          }
        }
      }
    }
  }

  if (card === 11) {
    const myTrack = mine.filter(p => p.zone === 'track');
    const oppTrack = state.pawns[opp].filter(p => p.zone === 'track');
    for (const pawn of myTrack) {
      pushForward(pawn, 11, 'forward');
      for (const t of oppTrack) {
        moves.push({ id: `swap:${pawn.id}:${t.id}`, kind: 'swap', pawnId: pawn.id, targetPawnId: t.id, to: { zone: 'track', index: t.index } });
      }
    }
  }

  if (card === 'sorry') {
    const startPawns = mine.filter(p => p.zone === 'start');
    const oppTrack = state.pawns[opp].filter(p => p.zone === 'track');
    if (startPawns.length > 0) {
      for (const t of oppTrack) {
        moves.push({ id: `sorry:${startPawns[0].id}:${t.id}`, kind: 'sorry', pawnId: startPawns[0].id, targetPawnId: t.id, to: { zone: 'track', index: t.index } });
      }
    }
  }

  return moves;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/sorry/legal-moves.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/sorry/server/rules/legal-moves.js test/sorry/legal-moves.test.js
git commit -m "feat(sorry): legal-move enumeration for all cards"
```

---

## Task 5: Slides + bumping

**Files:**
- Create: `plugins/sorry/server/rules/slides.js`
- Test: `test/sorry/slides.test.js`

- [ ] **Step 1: Write the failing test**

```js
// test/sorry/slides.test.js
import { describe, it, expect } from 'vitest';
import { resolveLanding } from '../../plugins/sorry/server/rules/slides.js';

// resolveLanding({ pawns, side, landingIndex }) returns the FINAL track index
// (after any slide) plus the list of bumped {side, pawnId} pawns sent to start.
describe('sorry slides + bumps', () => {
  it('bumps a lone opponent pawn on the landing square', () => {
    const pawns = { a: [], b: [{ id: 0, zone: 'track', index: 25 }] };
    const r = resolveLanding({ pawns, side: 'a', landingIndex: 25 });
    expect(r.finalIndex).toBe(25);
    expect(r.bumped).toContainEqual({ side: 'b', pawnId: 0 });
  });

  it('triggers an opponent-colored slide and bumps everyone in the slide path', () => {
    // side b slide starts at track 39 length 4 -> ends at 43.
    const pawns = { a: [{ id: 0, zone: 'track', index: 41 }], b: [] };
    const r = resolveLanding({ pawns, side: 'a', landingIndex: 39 }); // a lands on b's slide start
    expect(r.finalIndex).toBe(43);
    expect(r.bumped).toContainEqual({ side: 'a', pawnId: 0 }); // own pawn caught in the slide is bumped too
  });

  it('does NOT slide on your own color slide start', () => {
    // side a slide starts at track 9.
    const pawns = { a: [], b: [] };
    const r = resolveLanding({ pawns, side: 'a', landingIndex: 9 });
    expect(r.finalIndex).toBe(9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sorry/slides.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement slides + bumping**

```js
// plugins/sorry/server/rules/slides.js
import { SLIDES, TRACK_LEN } from '../geometry.js';

// Find a slide whose start square equals landingIndex and whose color is NOT
// `side`. Returns {start, length} or null.
function foreignSlideAt(side, landingIndex) {
  for (const [color, slides] of Object.entries(SLIDES)) {
    if (color === side) continue;
    const hit = slides.find(s => s.start === landingIndex);
    if (hit) return hit;
  }
  return null;
}

// Determine the final landing square after slides, and which pawns get bumped
// back to Start. Bumping rules:
//  - Any pawn (own or opponent) sitting on the final square is bumped.
//  - If a slide triggers, every pawn strictly between start and end (inclusive
//    of the squares passed) is bumped, including the mover's own.
export function resolveLanding({ pawns, side, landingIndex }) {
  const slide = foreignSlideAt(side, landingIndex);
  let finalIndex = landingIndex;
  const sweptSquares = new Set([landingIndex]);
  if (slide) {
    finalIndex = (slide.start + slide.length) % TRACK_LEN;
    for (let k = 1; k <= slide.length; k++) sweptSquares.add((slide.start + k) % TRACK_LEN);
  }
  const bumped = [];
  for (const color of ['a', 'b']) {
    for (const p of pawns[color]) {
      if (p.zone !== 'track') continue;
      if (sweptSquares.has(p.index)) bumped.push({ side: color, pawnId: p.id });
    }
  }
  return { finalIndex, bumped };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sorry/slides.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/sorry/server/rules/slides.js test/sorry/slides.test.js
git commit -m "feat(sorry): slide traversal and bumping"
```

---

## Task 6: Apply action (turn engine)

**Files:**
- Modify: `plugins/sorry/server/actions.js` (replace stub)
- Test: `test/sorry/actions.test.js`

`applySorryAction({ state, action, actorId })` validates the chosen `moveId`
against `legalMoves(state)`, applies it (movement + slides/bumps via
`resolveLanding`, swap, Sorry!-bump), checks for a win (all 4 pawns home), then
advances the turn: discard the played card, draw the next, switch player unless
the card was a **2** (same player draws again). If the new player has no legal
move, auto-pass (discard, draw, switch) until someone can move. `activeUserId`
is set to the current player's userId, or the winner stays until `ended`.

- [ ] **Step 1: Write the failing tests**

```js
// test/sorry/actions.test.js
import { describe, it, expect } from 'vitest';
import { applySorryAction } from '../../plugins/sorry/server/actions.js';
import { legalMoves } from '../../plugins/sorry/server/rules/legal-moves.js';

function stateWith(over) {
  return {
    sides: { a: 11, b: 22 },
    pawns: {
      a: [{ id: 0, zone: 'start', index: 0 }, { id: 1, zone: 'start', index: 0 },
          { id: 2, zone: 'start', index: 0 }, { id: 3, zone: 'start', index: 0 }],
      b: [{ id: 0, zone: 'start', index: 0 }, { id: 1, zone: 'start', index: 0 },
          { id: 2, zone: 'start', index: 0 }, { id: 3, zone: 'start', index: 0 }],
    },
    deck: [3, 5, 8, 12, 10, 1, 2, 4, 11, 7],
    discard: [],
    drawnCard: 1,
    currentPlayer: 'a',
    winner: null,
    lastEvent: null,
    activeUserId: 11,
    ...over,
  };
}

describe('sorry applyAction', () => {
  it('rejects an unknown moveId without mutating', () => {
    const s = stateWith({});
    const r = applySorryAction({ state: s, action: { type: 'move', payload: { moveId: 'bogus' } }, actorId: 11 });
    expect(r.error).toBeDefined();
  });

  it('applies an out-move and advances the turn to opponent', () => {
    const s = stateWith({});
    const move = legalMoves(s)[0]; // an out-move
    const r = applySorryAction({ state: s, action: { type: 'move', payload: { moveId: move.id } }, actorId: 11 });
    expect(r.error).toBeUndefined();
    expect(r.state.pawns.a.find(p => p.id === move.pawnId).zone).toBe('track');
    expect(r.state.currentPlayer).toBe('b');           // turn passed
    expect(r.state.discard).toContain(1);              // card discarded
    expect(r.state.activeUserId).toBe(22);
  });

  it('a 2 keeps the same player (draw again)', () => {
    const s = stateWith({ drawnCard: 2 });
    const move = legalMoves(s)[0];
    const r = applySorryAction({ state: s, action: { type: 'move', payload: { moveId: move.id } }, actorId: 11 });
    expect(r.state.currentPlayer).toBe('a');
  });

  it('bumps an opponent pawn back to start on landing', () => {
    const s = stateWith({ drawnCard: 1 });
    s.pawns.a[0] = { id: 0, zone: 'track', index: 3 };
    s.pawns.b[0] = { id: 0, zone: 'track', index: 4 }; // a's startExit-adjacent; 3+1 == 4
    const move = legalMoves(s).find(m => m.pawnId === 0 && m.kind === 'forward');
    const r = applySorryAction({ state: s, action: { type: 'move', payload: { moveId: move.id } }, actorId: 11 });
    expect(r.state.pawns.b[0].zone).toBe('start');
  });

  it('declares a win when all four pawns reach home', () => {
    const s = stateWith({ drawnCard: 1 });
    s.pawns.a = [
      { id: 0, zone: 'home', index: 0 }, { id: 1, zone: 'home', index: 0 },
      { id: 2, zone: 'home', index: 0 }, { id: 3, zone: 'safety', index: 4 },
    ];
    const move = legalMoves(s).find(m => m.pawnId === 3);
    const r = applySorryAction({ state: s, action: { type: 'move', payload: { moveId: move.id } }, actorId: 11 });
    expect(r.ended).toBe(true);
    expect(r.state.winner).toBe('a');
    expect(r.scoreDelta).toEqual({ 11: 1 });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run test/sorry/actions.test.js`
Expected: FAIL — stub returns `{ error: 'not implemented' }`.

- [ ] **Step 3: Implement the turn engine**

```js
// plugins/sorry/server/actions.js
import { legalMoves } from './rules/legal-moves.js';
import { resolveLanding } from './rules/slides.js';
import { draw } from './deck.js';

function actorSide(state, actorId) {
  if (state.sides.a === actorId) return 'a';
  if (state.sides.b === actorId) return 'b';
  return null;
}

function sendToStart(pawns, { side, pawnId }) {
  return pawns[side].map(p => (p.id === pawnId ? { ...p, zone: 'start', index: 0 } : p));
}

// Place `pawnId` of `side` at loc; if loc is a track square, run slides/bumps.
function place(pawns, side, pawnId, loc) {
  let next = { a: pawns.a.slice(), b: pawns.b.slice() };
  let finalLoc = loc;
  if (loc.zone === 'track') {
    const r = resolveLanding({ pawns: next, side, landingIndex: loc.index });
    finalLoc = { zone: 'track', index: r.finalIndex };
    for (const b of r.bumped) {
      if (b.side === side && b.pawnId === pawnId) continue; // the mover lands, not bumps itself
      next[b.side] = sendToStart(next, b);
    }
  }
  next[side] = next[side].map(p => (p.id === pawnId ? { ...p, zone: finalLoc.zone, index: finalLoc.index } : p));
  return next;
}

function applyMove(state, move) {
  const side = state.currentPlayer;
  const opp = side === 'a' ? 'b' : 'a';
  let pawns = state.pawns;

  switch (move.kind) {
    case 'out':
    case 'forward':
    case 'back':
      pawns = place(pawns, side, move.pawnId, move.to);
      break;
    case 'split':
      for (const leg of move.legs) pawns = place(pawns, side, leg.pawnId, leg.to);
      break;
    case 'swap': {
      const mineLoc = pawns[side].find(p => p.id === move.pawnId);
      const theirLoc = pawns[opp].find(p => p.id === move.targetPawnId);
      const myIdx = mineLoc.index, theirIdx = theirLoc.index;
      pawns = { ...pawns,
        [side]: pawns[side].map(p => p.id === move.pawnId ? { ...p, index: theirIdx } : p),
        [opp]: pawns[opp].map(p => p.id === move.targetPawnId ? { ...p, index: myIdx } : p) };
      // landing after a swap can trigger a slide for the mover
      pawns = place(pawns, side, move.pawnId, { zone: 'track', index: theirIdx });
      break;
    }
    case 'sorry':
      pawns = { ...pawns, [opp]: sendToStart(pawns, { side: opp, pawnId: move.targetPawnId }) };
      pawns = place(pawns, side, move.pawnId, move.to);
      break;
    default:
      return null;
  }
  return pawns;
}

function allHome(sidePawns) {
  return sidePawns.every(p => p.zone === 'home');
}

// Advance turn: discard played card, draw next, switch player (unless card was
// 2), then skip players with no legal move (auto-pass).
function advanceTurn(state, playedCard) {
  let deck = state.deck, discard = [...state.discard, playedCard];
  let current = playedCard === 2 ? state.currentPlayer : (state.currentPlayer === 'a' ? 'b' : 'a');

  for (let guard = 0; guard < 3; guard++) {
    const d = draw({ deck, discard });
    deck = d.deck; discard = d.discard;
    const probe = { ...state, currentPlayer: current, drawnCard: d.card };
    if (legalMoves(probe).length > 0) {
      return { ...state, pawns: state.pawns, deck, discard, drawnCard: d.card, currentPlayer: current };
    }
    // no move for this card → discard it and pass to the other player
    discard = [...discard, d.card];
    current = current === 'a' ? 'b' : 'a';
  }
  // Extremely unlikely; surface the last drawn card anyway.
  const d = draw({ deck, discard });
  return { ...state, deck: d.deck, discard: d.discard, drawnCard: d.card, currentPlayer: current };
}

export function applySorryAction({ state, action, actorId }) {
  const side = actorSide(state, actorId);
  if (side === null) return { error: 'unknown participant' };
  if (state.winner) return { error: 'game is over' };
  if (action.type !== 'move') return { error: `unknown action: ${action.type}` };
  if (side !== state.currentPlayer) return { error: 'not your turn' };

  const moveId = action.payload?.moveId;
  const chosen = legalMoves(state).find(m => m.id === moveId);
  if (!chosen) return { error: 'move is not legal' };

  const pawns = applyMove(state, chosen);
  if (!pawns) return { error: 'could not apply move' };

  // Win check
  if (allHome(pawns[side])) {
    const won = { ...state, pawns, winner: side, activeUserId: state.sides[side], lastEvent: { kind: 'win', side } };
    return { state: won, ended: true, scoreDelta: { [state.sides[side]]: 1 }, summary: { kind: 'win', side } };
  }

  const advanced = advanceTurn({ ...state, pawns }, state.drawnCard);
  const next = { ...advanced, activeUserId: state.sides[advanced.currentPlayer], lastEvent: { kind: 'move', moveId } };
  return { state: next, ended: false, summary: { kind: 'move', moveId } };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run test/sorry/actions.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/sorry/server/actions.js test/sorry/actions.test.js
git commit -m "feat(sorry): turn engine with bumps, swap, sorry, win + auto-pass"
```

---

## Task 7: AI adapter

**Files:**
- Create: `plugins/sorry/server/ai/prompts.js`
- Create: `plugins/sorry/server/ai/sorry-player.js`
- Test: `test/sorry/sorry-player.test.js`

`chooseAction` mirrors `backgammon-player.js`: enumerate legal moves, build a
prompt, send to the LLM, parse `{moveId, banter}`, validate against the legal
set, and on `InvalidLlmResponse`/`InvalidLlmMove` the **caller (orchestrator)**
handles the stall — but the test here verifies a defensive in-adapter fallback:
on unparseable output we still return a random legal move so a solo game never
deadlocks. Reuse `parseLlmResponse`/`extractJson` semantics from backgammon's
prompts (copy the small helpers; they are not exported cross-plugin).

- [ ] **Step 1: Write the failing test**

```js
// test/sorry/sorry-player.test.js
import { describe, it, expect } from 'vitest';
import { chooseAction } from '../../plugins/sorry/server/ai/sorry-player.js';

function fakeState() {
  return {
    sides: { a: 11, b: 22 },
    pawns: {
      a: [{ id: 0, zone: 'start', index: 0 }, { id: 1, zone: 'start', index: 0 },
          { id: 2, zone: 'start', index: 0 }, { id: 3, zone: 'start', index: 0 }],
      b: [{ id: 0, zone: 'start', index: 0 }, { id: 1, zone: 'start', index: 0 },
          { id: 2, zone: 'start', index: 0 }, { id: 3, zone: 'start', index: 0 }],
    },
    drawnCard: 1, currentPlayer: 'a',
  };
}

describe('sorry AI adapter', () => {
  it('returns the LLM-chosen legal move', async () => {
    const state = fakeState();
    const llm = { send: async () => ({ text: '{"moveId":"out:0","banter":"Here we go!"}', sessionId: 's1' }) };
    const r = await chooseAction({ llm, persona: { systemPrompt: 'x' }, sessionId: null, state, botPlayerIdx: 0 });
    expect(r.action).toEqual({ type: 'move', payload: { moveId: 'out:0' } });
    expect(r.banter).toBe('Here we go!');
  });

  it('falls back to a random legal move on unparseable output', async () => {
    const state = fakeState();
    const llm = { send: async () => ({ text: 'I refuse to answer', sessionId: 's2' }) };
    const r = await chooseAction({ llm, persona: { systemPrompt: 'x' }, sessionId: null, state, botPlayerIdx: 0 });
    expect(r.action.type).toBe('move');
    expect(r.action.payload.moveId).toMatch(/^out:/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sorry/sorry-player.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement prompts + adapter**

```js
// plugins/sorry/server/ai/prompts.js
function describePawns(side, pawns) {
  return pawns[side].map(p => `#${p.id}:${p.zone}${p.zone === 'track' || p.zone === 'safety' ? '@' + p.index : ''}`).join(' ');
}

export function buildTurnPrompt({ state, legalMoves, botPlayerIdx, userMessages = [] }) {
  const side = botPlayerIdx === 0 ? 'a' : 'b';
  const opp = side === 'a' ? 'b' : 'a';
  const blocks = [
    `You are playing Sorry! as side ${side.toUpperCase()}. Goal: get all 4 pawns Home.`,
    `Your pawns:    ${describePawns(side, state.pawns)}`,
    `Opponent pawns: ${describePawns(opp, state.pawns)}`,
    `You drew: ${state.drawnCard}`,
  ];
  if (userMessages.length > 0) {
    blocks.push(`Opponent said: ${userMessages.map(m => `"${m.replace(/"/g, '\\"')}"`).join(' ')}\nReact in banter — stay in character.`);
  }
  blocks.push('Legal moves:\n' + legalMoves.map(m => `  - ${m.id}: ${describeMove(m)}`).join('\n'));
  blocks.push('Respond with a single JSON object (and nothing else): {"moveId": "<one of the ids above>", "banter": "<one short in-character line, never empty>"}');
  return blocks.join('\n\n');
}

function describeMove(m) {
  switch (m.kind) {
    case 'out': return `bring pawn #${m.pawnId} out of Start`;
    case 'forward': return `move pawn #${m.pawnId} forward ${m.steps}`;
    case 'back': return `move pawn #${m.pawnId} back ${-m.steps}`;
    case 'split': return `split: ${m.legs.map(l => `#${l.pawnId}+${l.steps}`).join(', ')}`;
    case 'swap': return `swap your pawn #${m.pawnId} with opponent pawn #${m.targetPawnId}`;
    case 'sorry': return `SORRY! send pawn #${m.pawnId} out, bump opponent pawn #${m.targetPawnId} home`;
    default: return m.id;
  }
}

function extractJson(text) {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = text.indexOf('{'); const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  throw new Error('no JSON object found in response');
}

export function parseLlmResponse(text) {
  const parsed = JSON.parse(extractJson(text));
  if (typeof parsed.moveId !== 'string') throw new Error('response missing moveId');
  return { moveId: parsed.moveId, banter: typeof parsed.banter === 'string' ? parsed.banter : '' };
}
```

```js
// plugins/sorry/server/ai/sorry-player.js
import { legalMoves } from '../rules/legal-moves.js';
import { buildTurnPrompt, parseLlmResponse } from './prompts.js';

export async function chooseAction({ llm, persona, sessionId, state, botPlayerIdx, userMessages = [] }) {
  const moves = legalMoves(state);
  if (moves.length === 0) throw new Error('no legal moves for sorry bot');

  const prompt = buildTurnPrompt({ state, legalMoves: moves, botPlayerIdx, userMessages });
  const r = await llm.send({ prompt, sessionId, systemPrompt: sessionId ? null : persona.systemPrompt });

  let chosen, banter = '';
  try {
    const parsed = parseLlmResponse(r.text);
    chosen = moves.find(m => m.id === parsed.moveId);
    banter = parsed.banter;
  } catch {
    chosen = undefined;
  }
  if (!chosen) {
    // Defensive fallback: never deadlock a solo game on bad LLM output.
    chosen = moves[Math.floor(Math.random() * moves.length)];
  }
  return { action: { type: 'move', payload: { moveId: chosen.id } }, banter, sessionId: r.sessionId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/sorry/sorry-player.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add plugins/sorry/server/ai test/sorry/sorry-player.test.js
git commit -m "feat(sorry): AI adapter with prompt + random-legal fallback"
```

---

## Task 8: Register AI adapter + personas

**Files:**
- Modify: `src/server/ai/index.js` (register the `sorry` adapter)
- Create: `data/ai-personas/the-bully.yaml`
- Create: `data/ai-personas/the-tortoise.yaml`
- Test: `test/sorry/ai-registration.test.js`

> Before editing `src/server/ai/index.js`, open it and follow its existing
> registration pattern (how `backgammon`'s `chooseAction` is wired into the
> adapters map keyed by `game_type`). Mirror that exactly for `sorry`.

- [ ] **Step 1: Write the failing test**

```js
// test/sorry/ai-registration.test.js
import { describe, it, expect } from 'vitest';
import { loadPersonaCatalog } from '../../src/server/ai/persona-catalog.js';

describe('sorry personas', () => {
  it('ships two personas scoped to the sorry game', () => {
    const catalog = loadPersonaCatalog();
    const sorryPersonas = catalog.filter(p => p.games.includes('sorry'));
    expect(sorryPersonas.length).toBeGreaterThanOrEqual(2);
    const ids = sorryPersonas.map(p => p.id);
    expect(ids).toContain('the-bully');
    expect(ids).toContain('the-tortoise');
  });
});
```

> Verify the exact `loadPersonaCatalog` export name/signature in
> `src/server/ai/persona-catalog.js` before running; adjust the import to match
> if it differs (e.g. a default export or a different function name).

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/sorry/ai-registration.test.js`
Expected: FAIL — no sorry personas.

- [ ] **Step 3: Create the persona YAMLs**

```yaml
# data/ai-personas/the-bully.yaml
id: the-bully
displayName: The Bully
games:
  - sorry
color: '#dc2626'
glyph: ★
systemPrompt: |
  You are The Bully, who plays Sorry! to make your opponent suffer. You
  love bumping pawns back to Start, you relish the Sorry! card, and you
  will take a slide that knocks an opponent home even when a quieter move
  would advance you further. Aggression first, position second.

  When asked to choose a move, you will be given a list of legal moves with
  string IDs. You MUST respond with valid JSON of the form:
  {"moveId": "<exact-id-from-list>", "banter": "<short in-character line, never empty>"}

  Banter is one short taunt at most. Never explain your strategy or warn the
  opponent what you intend to do next.
voiceExamples:
  - "Back to Start with you!"
  - "Aw, were you using that pawn?"
  - "Sorry. Not sorry."

# data/ai-personas/the-tortoise.yaml
```

```yaml
# data/ai-personas/the-tortoise.yaml
id: the-tortoise
displayName: The Tortoise
games:
  - sorry
color: '#16a34a'
glyph: ✦
systemPrompt: |
  You are The Tortoise, a patient Sorry! player who believes slow and steady
  wins the race. You avoid leaving pawns exposed, you favor reaching your
  safety zone, and you take steady forward progress over flashy bumps unless
  a bump is clearly safe and useful. You are unbothered by setbacks.

  When asked to choose a move, you will be given a list of legal moves with
  string IDs. You MUST respond with valid JSON of the form:
  {"moveId": "<exact-id-from-list>", "banter": "<short in-character line, never empty>"}

  Banter is one short, calm line at most. Never explain your strategy.
voiceExamples:
  - "No need to hurry."
  - "Steady does it."
  - "I'll get there."
```

- [ ] **Step 4: Register the adapter**

In `src/server/ai/index.js`, import `chooseAction` from
`plugins/sorry/server/ai/sorry-player.js` and add it to the adapters map under
the `sorry` key, matching the backgammon entry's shape.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run test/sorry/ai-registration.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/server/ai/index.js data/ai-personas/the-bully.yaml data/ai-personas/the-tortoise.yaml test/sorry/ai-registration.test.js
git commit -m "feat(sorry): register AI adapter + two contrasting personas"
```

---

## Task 9: Client UI

**Files:**
- Create: `plugins/sorry/client/index.html`
- Create: `plugins/sorry/client/app.js`
- Create: `plugins/sorry/client/style.css`

> Open an existing client (`plugins/backgammon/client/index.html` + `app.js`)
> first and copy its bootstrapping: how it fetches the public view, subscribes
> to SSE updates, reads `youAre`, and POSTs actions. Match that structure — do
> not invent a new client framework.

This task is UI and not strictly TDD. Verify by running the app (Task 10).

- [ ] **Step 1: Board render**

Render the 60-square track as a square ring, the two safety zones and Homes,
and the two Start pens. Draw each pawn at its `zone`/`index` using the side's
color from the persona/board palette. Read state from the public view (`pawns`,
`drawnCard`, `currentPlayer`, `youAre`, `winner`).

- [ ] **Step 2: Card + move interaction**

Show `drawnCard` face-up with a brief flip animation when it changes. When it is
`youAre`'s turn, fetch the legal moves for the current state (compute
client-side by importing the same enumeration, or surface them in the public
view — see note below) and let the player click a pawn/destination to choose a
`moveId`, then POST `{ type: 'move', payload: { moveId } }`.

> **Decision for implementer:** the cleanest way to give the client the legal
> move list is to include `legalMoves` in `sorryPublicView` for the viewer whose
> turn it is. Add that to `view.js` (call `legalMoves(state)` when
> `state.currentPlayer === youAre`) and assert it in a small view test. This
> keeps move-legality authority on the server.

- [ ] **Step 3: Win banner**

When `winner` is set, show a win/lose banner keyed off `youAre === winner`.

- [ ] **Step 4: Commit**

```bash
git add plugins/sorry/client
git commit -m "feat(sorry): client board, card flip, move interaction, win banner"
```

---

## Task 10: Orchestrator integration check + manual playtest

**Files:**
- Test: `test/sorry/orchestrator-turn.test.js`

- [ ] **Step 1: Write an integration test for a full bot turn**

Drive a game where the bot is the current player and assert that applying the
adapter's chosen action through `applySorryAction` produces a valid next state
and, when the drawn card is a `2`, the bot remains the current player (the
engine's draw-again path). Use a deterministic `llm.send` stub that always picks
the first legal move.

```js
// test/sorry/orchestrator-turn.test.js
import { describe, it, expect } from 'vitest';
import { buildInitialState } from '../../plugins/sorry/server/state.js';
import { applySorryAction } from '../../plugins/sorry/server/actions.js';
import { chooseAction } from '../../plugins/sorry/server/ai/sorry-player.js';
import { legalMoves } from '../../plugins/sorry/server/rules/legal-moves.js';

describe('sorry bot turn integration', () => {
  it('bot move applies cleanly and advances state', async () => {
    // force a deck whose first card lets a pawn come out
    let state = buildInitialState({ participants: [{ side: 'a', userId: 11 }, { side: 'b', userId: 22 }], options: { rng: () => 0 } });
    state = { ...state, drawnCard: 1 };
    const firstId = legalMoves(state)[0].id;
    const llm = { send: async () => ({ text: `{"moveId":"${firstId}","banter":"hi"}`, sessionId: 's' }) };
    const { action } = await chooseAction({ llm, persona: { systemPrompt: 'x' }, sessionId: null, state, botPlayerIdx: 0 });
    const r = applySorryAction({ state, action, actorId: 11 });
    expect(r.error).toBeUndefined();
    expect(['a', 'b']).toContain(r.state.currentPlayer);
    expect(r.state.activeUserId).toBe(r.state.sides[r.state.currentPlayer]);
  });
});
```

- [ ] **Step 2: Run the full suite**

Run: `npx vitest run test/sorry`
Expected: PASS (all sorry tests green).

- [ ] **Step 3: Manual playtest**

Start the app, create a Sorry! game vs **The Bully**, and play a few turns.
Confirm: pawns leave Start on 1/2, bumps send pawns home, slides trigger,
Sorry! card works, the bot banters, and a win ends the game. (Use the `/run`
or project launch skill.)

- [ ] **Step 4: Commit**

```bash
git add test/sorry/orchestrator-turn.test.js
git commit -m "test(sorry): bot-turn integration check"
```

---

## Self-Review Notes

- **Spec coverage:** full ruleset (cards incl. 7-split/11-swap/Sorry!, slides, safety, bumping) → Tasks 4–6; 2 personas → Task 8; client w/ card-flip → Task 9; testing list → Tasks 2–7,10; error handling (illegal move rejected, no-move auto-pass, deck reshuffle, bad-LLM fallback) → Tasks 2,4,6,7. Covered.
- **Card-draw as a rule, not an action:** the draw happens inside `buildInitialState` and `advanceTurn` (server-authoritative); the bot never emits a "draw" action — it only emits `move`. Matches the design's collapsed-mechanic decision.
- **Type consistency:** move objects use `{ id, kind, pawnId, steps?, to, legs?, targetPawnId? }` consistently across `legal-moves.js`, `actions.js`, and `prompts.js`; locations are `{ zone, index }` throughout; `resolveLanding` returns `{ finalIndex, bumped:[{side,pawnId}] }` consistently.
- **Geometry constants are an internally-consistent standard-Sorry layout.** If the manual playtest reveals an off-by-one vs a physical board, adjust the constants in `geometry.js` only — all logic derives from `path()`/`SLIDES`.
