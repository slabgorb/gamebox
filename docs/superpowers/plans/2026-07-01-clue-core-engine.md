# Clue Core Deduction Engine — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless, fully-tested Clue deduction engine — cards, deal, envelope, state, the suggest/refute/accuse/pass action reducers, and the `cluePublicView` information-disclosure seam — with rooms modelled as abstract locations (no grid yet).

**Architecture:** Pure ES-module functions under `plugins/clue/server/`, matching the existing plugin contract (`buildInitialState`, `applyAction`, `publicView`). Seat-indexed N-player state (`state.seats`). All logic is deterministic and side-effect-free; the only randomness is a seeded `rng` passed into `buildInitialState`. No board geometry, no bots, no client — those are later sub-plans (see Roadmap).

**Tech Stack:** Node ≥20, ESM, `node --test` + `node:assert/strict`. Reuses `src/shared/cards/deck.js`'s `shuffle(arr, rng)`.

## Global Constraints

- **Node ≥20, ESM** (`"type": "module"`); all imports use explicit `.js` extensions.
- **Tests:** `node --test` with `node:test` + `node:assert/strict`; test files live at repo root `test/clue-*.test.js` (flat dir, matching `test/risk-*.test.js`).
- **No server-side dice RNG.** Dice are client-side (Plan 2). The only server randomness is the seeded `rng` argument to `buildInitialState`, used for the deal and weapon placement.
- **Plugin contract signatures (exact):**
  - `buildInitialState({ participants, rng }) → state` — `participants: [{ userId, seat }]`.
  - `applyClueAction({ state, action, actorId, rng }) → { state } | { error } | { state, ended: true, summary }`.
  - `cluePublicView({ state, viewerId }) → view`.
- **Seat-indexed state:** membership is `state.seats = [userId, ...]` (seat 0 = first player). Turn gate is `state.activeUserId` (a numeric userId, or `null` when ended).
- **Card ids are lowercase strings.** Suspects: `scarlett mustard white green peacock plum`. Weapons: `candlestick knife leadpipe revolver rope wrench`. Rooms: `kitchen ballroom conservatory diningroom billiardroom library lounge hall study`.
- **`shuffle(arr, rng)` mutates in place and returns `arr`** — always pass a `.slice()` copy.
- **Never leak hidden state:** `cluePublicView` must never expose the `envelope`, another seat's `hands` entry, another seat's `ledgers` entry, or a `suggestion.shownCard` to anyone but the suggester.

---

## Roadmap (this plan is Plan 1 of 4)

This spec (`docs/superpowers/specs/2026-07-01-clue-clone-design.md`) is decomposed into four sub-plans, each producing working, testable software:

1. **Core deduction engine (this plan)** — cards, deal, state, suggest/refute/accuse/pass, `publicView`. Rooms are abstract locations; an `enterRoom` action places a pawn directly. Fully headless, `node --test`.
2. **Board geometry + movement** — `geometry.js` traced from `docs/Cluedo_board_text.svg` (grid, rooms, doors, corner secret passages), reachable-squares BFS, `roll`/`move` actions that route into this plan's `enterRoom` reducer, and the offline `rsvg-convert` render harness.
3. **Bots** — deterministic knowledge-tracker, bounded difficulty-capped shortlist, `chooseAction` persona pick + banter, six suspect personas (`games:[clue]`), bot auto-refute.
4. **Client + integration** — React board client, `plugin.js` manifest, registration in `src/plugins/index.js`, end-to-end wiring.

**Plan 1 deliverable:** the modules `cards.js`, `state.js`, `refute.js`, `actions.js`, `view.js` under `plugins/clue/server/`, each with passing tests. No `plugin.js` and no registration yet (the game is not playable until Plans 2–4) — this is a tested engine library, exactly like the `risk` server modules.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `plugins/clue/server/cards.js` | Canonical 21-card catalog + `dealCards(rng, seatCount)` (envelope + hands). |
| `plugins/clue/server/state.js` | `buildInitialState({ participants, rng })` — seats, deal, weapon placement, initial phase. |
| `plugins/clue/server/refute.js` | `findRefuterWalk(state, suggesterSeat, named)` — pure left-walking refuter search. |
| `plugins/clue/server/actions.js` | `applyClueAction({ state, action, actorId })` — `enterRoom`/`suggest`/`refute`/`accuse`/`pass`. |
| `plugins/clue/server/view.js` | `cluePublicView({ state, viewerId })` — per-seat projection, the disclosure seam. |
| `test/clue-*.test.js` | One test file per module/action group. |

### State shape (produced by `buildInitialState`, consumed everywhere)

```js
{
  seats: [userId, ...],                 // seat-indexed roster; seat 0 first
  phase: 'move'|'suggest'|'refute'|'accuse-or-pass'|'ended',
  currentSeat: 0,                       // whose turn (int)
  activeUserId: <userId|null>,          // whose input the engine awaits (may be a refuter)
  envelope: { suspect, weapon, room },  // HIDDEN
  hands: [ [card, ...], ... ],          // HIDDEN; array indexed by seat
  pawns:   { [suspectId]: { room: <roomId|null> } },   // PUBLIC, all 6 suspects
  weapons: { [weaponId]: <roomId> },    // PUBLIC
  seatSuspect: [ suspectId, ... ],      // PUBLIC; which suspect each seat controls
  eliminated: [ false, ... ],           // PUBLIC; per seat
  ledgers: [ [ { fromSeat, card } ], ... ],  // PRIVATE per seat: cards shown TO this seat
  suggestion: {                         // in-flight suggestion, or null
    bySeat, suspect, weapon, room,
    refuterSeat: <int|null>,            // first left-seat that can disprove, or null
    shownCard: <card|null>              // set by refute; visible only to suggester
  } | null,
  log: [ ... ],                         // PUBLIC event log
  winnerSeat: <int>,                    // set only when phase==='ended'
  endedReason: <string>                 // set only when phase==='ended'
}
```

Log entry shapes: `{type:'suggest', bySeat, suspect, weapon, room}`, `{type:'no-refute', seat}` (that seat held none of the three), `{type:'refute', bySeat, ofSeat}` (bySeat disproved ofSeat), `{type:'accuse', bySeat, correct}`.

---

## Task 1: Card catalog & deal

**Files:**
- Create: `plugins/clue/server/cards.js`
- Test: `test/clue-cards.test.js`

**Interfaces:**
- Consumes: `shuffle` from `src/shared/cards/deck.js`.
- Produces:
  - `SUSPECTS`, `WEAPONS`, `ROOMS`, `ALL_CARDS` — arrays of lowercase string ids (6/6/9/21).
  - `categoryOf(card) → 'suspect'|'weapon'|'room'|null`.
  - `dealCards(rng, seatCount) → { envelope: {suspect, weapon, room}, hands: [[card,...], ...] }` — one random card per category into the envelope; the remaining 18 shuffled and dealt round-robin into `seatCount` hands.

- [ ] **Step 1: Write the failing test**

Create `test/clue-cards.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUSPECTS, WEAPONS, ROOMS, ALL_CARDS, categoryOf, dealCards,
} from '../plugins/clue/server/cards.js';

// Deterministic rng: fixed sequence so the deal is reproducible.
function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

test('catalog has canonical 6/6/9 = 21 distinct cards', () => {
  assert.equal(SUSPECTS.length, 6);
  assert.equal(WEAPONS.length, 6);
  assert.equal(ROOMS.length, 9);
  assert.equal(ALL_CARDS.length, 21);
  assert.equal(new Set(ALL_CARDS).size, 21);
});

test('categoryOf classifies each card and rejects unknowns', () => {
  assert.equal(categoryOf('scarlett'), 'suspect');
  assert.equal(categoryOf('rope'), 'weapon');
  assert.equal(categoryOf('library'), 'room');
  assert.equal(categoryOf('nope'), null);
});

test('dealCards: envelope is one-per-category, 18 dealt, disjoint, no duplicates', () => {
  for (const n of [3, 4]) {
    const { envelope, hands } = dealCards(seededRng(n), n);
    assert.ok(SUSPECTS.includes(envelope.suspect));
    assert.ok(WEAPONS.includes(envelope.weapon));
    assert.ok(ROOMS.includes(envelope.room));
    assert.equal(hands.length, n);
    const dealt = hands.flat();
    assert.equal(dealt.length, 18, `n=${n} deals all 18`);
    assert.equal(new Set(dealt).size, 18, 'no duplicate dealt cards');
    // Envelope cards are never dealt.
    for (const c of [envelope.suspect, envelope.weapon, envelope.room]) {
      assert.ok(!dealt.includes(c), `envelope card ${c} not dealt`);
    }
    // Dealt ∪ envelope == full catalog.
    const union = new Set([...dealt, envelope.suspect, envelope.weapon, envelope.room]);
    assert.equal(union.size, 21);
    // Round-robin fairness: hand sizes differ by at most 1.
    const sizes = hands.map(h => h.length);
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-cards.test.js`
Expected: FAIL — `Cannot find module '.../plugins/clue/server/cards.js'`.

- [ ] **Step 3: Write minimal implementation**

Create `plugins/clue/server/cards.js`:

```js
// Canonical Clue: The Classic Edition catalog. Card ids are lowercase strings.
import { shuffle } from '../../../src/shared/cards/deck.js';

export const SUSPECTS = ['scarlett', 'mustard', 'white', 'green', 'peacock', 'plum'];
export const WEAPONS = ['candlestick', 'knife', 'leadpipe', 'revolver', 'rope', 'wrench'];
export const ROOMS = [
  'kitchen', 'ballroom', 'conservatory', 'diningroom', 'billiardroom',
  'library', 'lounge', 'hall', 'study',
];
export const ALL_CARDS = [...SUSPECTS, ...WEAPONS, ...ROOMS];

export function categoryOf(card) {
  if (SUSPECTS.includes(card)) return 'suspect';
  if (WEAPONS.includes(card)) return 'weapon';
  if (ROOMS.includes(card)) return 'room';
  return null;
}

// Pick one card per category for the hidden envelope, then shuffle and deal the
// remaining 18 round-robin into `seatCount` hands (some hands hold one more).
export function dealCards(rng, seatCount) {
  const suspect = shuffle(SUSPECTS.slice(), rng)[0];
  const weapon = shuffle(WEAPONS.slice(), rng)[0];
  const room = shuffle(ROOMS.slice(), rng)[0];
  const envelope = { suspect, weapon, room };

  const remaining = ALL_CARDS.filter((c) => c !== suspect && c !== weapon && c !== room);
  const dealDeck = shuffle(remaining.slice(), rng); // 18 cards
  const hands = Array.from({ length: seatCount }, () => []);
  dealDeck.forEach((card, i) => { hands[i % seatCount].push(card); });

  return { envelope, hands };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clue-cards.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/server/cards.js test/clue-cards.test.js
git commit -m "feat(clue): canonical card catalog and deal"
```

---

## Task 2: `buildInitialState`

**Files:**
- Create: `plugins/clue/server/state.js`
- Test: `test/clue-state.test.js`

**Interfaces:**
- Consumes: `SUSPECTS`, `WEAPONS`, `ROOMS`, `dealCards` from `cards.js`; `shuffle` from `src/shared/cards/deck.js`.
- Produces: `buildInitialState({ participants, rng }) → state` (full shape above). Throws if seat count is not 3–4.

- [ ] **Step 1: Write the failing test**

Create `test/clue-state.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildInitialState } from '../plugins/clue/server/state.js';
import { SUSPECTS, WEAPONS, ROOMS } from '../plugins/clue/server/cards.js';

function seededRng(seed = 1) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0x100000000; };
}

const parts = (n) => Array.from({ length: n }, (_, i) => ({ userId: 100 + i, seat: i }));

test('buildInitialState wires seats, turn, and phase', () => {
  const s = buildInitialState({ participants: parts(3), rng: seededRng(7) });
  assert.deepEqual(s.seats, [100, 101, 102]);
  assert.equal(s.currentSeat, 0);
  assert.equal(s.phase, 'move');
  assert.equal(s.activeUserId, 100);
  assert.deepEqual(s.eliminated, [false, false, false]);
  assert.deepEqual(s.ledgers, [[], [], []]);
  assert.equal(s.suggestion, null);
});

test('seats are ordered by the seat field, not array order', () => {
  const shuffledParts = [{ userId: 9, seat: 2 }, { userId: 7, seat: 0 }, { userId: 8, seat: 1 }];
  const s = buildInitialState({ participants: shuffledParts, rng: seededRng(1) });
  assert.deepEqual(s.seats, [7, 8, 9]);
});

test('each seat controls a distinct suspect; all 6 pawns exist off-board', () => {
  const s = buildInitialState({ participants: parts(4), rng: seededRng(3) });
  assert.equal(s.seatSuspect.length, 4);
  assert.equal(new Set(s.seatSuspect).size, 4);
  for (const sus of s.seatSuspect) assert.ok(SUSPECTS.includes(sus));
  assert.equal(Object.keys(s.pawns).length, 6);
  for (const sus of SUSPECTS) assert.deepEqual(s.pawns[sus], { room: null });
});

test('all 6 weapons placed, each in a valid room', () => {
  const s = buildInitialState({ participants: parts(3), rng: seededRng(5) });
  assert.equal(Object.keys(s.weapons).length, 6);
  for (const w of WEAPONS) assert.ok(ROOMS.includes(s.weapons[w]));
});

test('envelope and hands are consistent (18 dealt, envelope hidden)', () => {
  const s = buildInitialState({ participants: parts(4), rng: seededRng(2) });
  const dealt = s.hands.flat();
  assert.equal(dealt.length, 18);
  for (const c of [s.envelope.suspect, s.envelope.weapon, s.envelope.room]) {
    assert.ok(!dealt.includes(c));
  }
});

test('rejects out-of-range player counts', () => {
  assert.throws(() => buildInitialState({ participants: parts(2), rng: seededRng() }), /3-4/);
  assert.throws(() => buildInitialState({ participants: parts(5), rng: seededRng() }), /3-4/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-state.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `plugins/clue/server/state.js`:

```js
import { shuffle } from '../../../src/shared/cards/deck.js';
import { SUSPECTS, WEAPONS, ROOMS, dealCards } from './cards.js';

// Order participants into a seat-indexed userId roster. `seat` is canonical;
// fall back to array position if a participant omits it.
function seatOrder(participants) {
  return participants
    .map((p, i) => ({ userId: p.userId, seat: Number.isInteger(p.seat) ? p.seat : i }))
    .sort((a, b) => a.seat - b.seat)
    .map((p) => p.userId);
}

export function buildInitialState({ participants, rng }) {
  const seats = seatOrder(participants);
  const n = seats.length;
  if (n < 3 || n > 4) throw new Error(`clue takes 3-4 players; got ${n}`);

  const { envelope, hands } = dealCards(rng, n);

  // Distribute the 6 weapons into 6 distinct rooms (canonical: any 6 of 9).
  const shuffledRooms = shuffle(ROOMS.slice(), rng);
  const weapons = {};
  WEAPONS.forEach((w, i) => { weapons[w] = shuffledRooms[i]; });

  // All six suspect pawns are on the board regardless of player count; here
  // they start off-board (room: null) — Plan 2 assigns start squares.
  const pawns = {};
  SUSPECTS.forEach((s) => { pawns[s] = { room: null }; });

  return {
    seats,
    phase: 'move',
    currentSeat: 0,
    activeUserId: seats[0],
    envelope,
    hands,
    pawns,
    weapons,
    seatSuspect: seats.map((_, i) => SUSPECTS[i]),
    eliminated: seats.map(() => false),
    ledgers: seats.map(() => []),
    suggestion: null,
    log: [],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clue-state.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/server/state.js test/clue-state.test.js
git commit -m "feat(clue): buildInitialState (seats, deal, weapon placement)"
```

---

## Task 3: `cluePublicView` — the disclosure seam (critical)

**Files:**
- Create: `plugins/clue/server/view.js`
- Test: `test/clue-view.test.js`

**Interfaces:**
- Consumes: nothing (operates on a plain state object).
- Produces: `cluePublicView({ state, viewerId }) → view`. `view.youAreSeat` is the viewer's seat (or `null` for a non-participant). Exposes public fields + the viewer's own `hand` and `ledger`. Omits `envelope`, all other hands, all other ledgers; blanks `suggestion.shownCard` for everyone but the suggester.

- [ ] **Step 1: Write the failing test**

Create `test/clue-view.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cluePublicView } from '../plugins/clue/server/view.js';

// Hand-built 3-seat state with an in-flight, already-refuted suggestion.
function fixture() {
  return {
    seats: [7, 8, 9],
    phase: 'accuse-or-pass',
    currentSeat: 0,
    activeUserId: 7,
    envelope: { suspect: 'plum', weapon: 'rope', room: 'study' },
    hands: [['mustard', 'knife'], ['scarlett', 'library'], ['green', 'hall', 'wrench']],
    pawns: { scarlett: { room: 'hall' }, mustard: { room: null }, white: { room: null },
             green: { room: null }, peacock: { room: null }, plum: { room: 'hall' } },
    weapons: { candlestick: 'kitchen', knife: 'hall', leadpipe: 'library',
               revolver: 'lounge', rope: 'ballroom', wrench: 'study' },
    seatSuspect: ['scarlett', 'mustard', 'white'],
    eliminated: [false, false, false],
    ledgers: [[{ fromSeat: 2, card: 'green' }], [], []],
    suggestion: { bySeat: 0, suspect: 'green', weapon: 'knife', room: 'hall',
                  refuterSeat: 2, shownCard: 'green' },
    log: [{ type: 'suggest', bySeat: 0, suspect: 'green', weapon: 'knife', room: 'hall' },
          { type: 'no-refute', seat: 1 },
          { type: 'refute', bySeat: 2, ofSeat: 0 }],
  };
}

test('viewer sees own seat, hand, and ledger', () => {
  const v = cluePublicView({ state: fixture(), viewerId: 7 });
  assert.equal(v.youAreSeat, 0);
  assert.deepEqual(v.hand, ['mustard', 'knife']);
  assert.deepEqual(v.ledger, [{ fromSeat: 2, card: 'green' }]);
});

test('non-participant is a spectator with no hand/ledger', () => {
  const v = cluePublicView({ state: fixture(), viewerId: 999 });
  assert.equal(v.youAreSeat, null);
  assert.deepEqual(v.hand, []);
  assert.deepEqual(v.ledger, []);
});

test('LEAK GUARD: envelope and aggregate hands/ledgers are structurally absent', () => {
  // A substring scan is unsound here: card ids (scarlett, library, ...) also
  // appear as legitimate PUBLIC identifiers in seatSuspect/pawns/weapons. The
  // sound guarantee is structural — the view must expose NO aggregate private
  // container, and each viewer must receive exactly their OWN hand and ledger.
  const src = fixture();
  for (const viewerId of [7, 8, 9, 999]) {
    const v = cluePublicView({ state: fixture(), viewerId });
    assert.equal(v.envelope, undefined, 'no envelope key');
    assert.equal(v.hands, undefined, 'no aggregate hands array');
    assert.equal(v.ledgers, undefined, 'no aggregate ledgers array');
    const seat = v.youAreSeat;
    assert.deepEqual(v.hand, seat === null ? [] : src.hands[seat], 'own hand only');
    assert.deepEqual(v.ledger, seat === null ? [] : src.ledgers[seat], 'own ledger only');
  }
});

test('shownCard is visible ONLY to the suggester', () => {
  assert.equal(cluePublicView({ state: fixture(), viewerId: 7 }).suggestion.shownCard, 'green');
  assert.equal(cluePublicView({ state: fixture(), viewerId: 8 }).suggestion.shownCard, null);
  assert.equal(cluePublicView({ state: fixture(), viewerId: 9 }).suggestion.shownCard, null);
});

test('public board fields are exposed to everyone', () => {
  const v = cluePublicView({ state: fixture(), viewerId: 8 });
  assert.deepEqual(v.weapons, fixture().weapons);
  assert.deepEqual(v.seatSuspect, ['scarlett', 'mustard', 'white']);
  assert.equal(v.log.length, 3);
  assert.equal(v.suggestion.refuterSeat, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-view.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `plugins/clue/server/view.js`:

```js
// The single information-disclosure seam. Every field here is deliberate:
// public board state for all, the viewer's own private hand/ledger, and NOTHING
// about the envelope, other hands, other ledgers, or a shown card the viewer
// did not personally receive.
export function cluePublicView({ state, viewerId }) {
  const idx = state.seats.indexOf(viewerId);
  const seat = idx === -1 ? null : idx;

  let suggestion = null;
  if (state.suggestion) {
    const isSuggester = seat !== null && seat === state.suggestion.bySeat;
    suggestion = {
      bySeat: state.suggestion.bySeat,
      suspect: state.suggestion.suspect,
      weapon: state.suggestion.weapon,
      room: state.suggestion.room,
      refuterSeat: state.suggestion.refuterSeat,
      shownCard: isSuggester ? state.suggestion.shownCard : null,
    };
  }

  return {
    youAreSeat: seat,
    seats: state.seats,
    phase: state.phase,
    currentSeat: state.currentSeat,
    activeUserId: state.activeUserId,
    pawns: state.pawns,
    weapons: state.weapons,
    seatSuspect: state.seatSuspect,
    eliminated: state.eliminated,
    log: state.log,
    suggestion,
    hand: seat === null ? [] : state.hands[seat],
    ledger: seat === null ? [] : state.ledgers[seat],
    winnerSeat: state.winnerSeat ?? null,
    // envelope, hands, ledgers are intentionally NOT copied out.
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clue-view.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/server/view.js test/clue-view.test.js
git commit -m "feat(clue): cluePublicView disclosure seam with leak guards"
```

---

## Task 4: `findRefuterWalk` — left-walking refuter search

**Files:**
- Create: `plugins/clue/server/refute.js`
- Test: `test/clue-refute-walk.test.js`

**Interfaces:**
- Consumes: `state.seats`, `state.hands`.
- Produces: `findRefuterWalk(state, suggesterSeat, named) → { passes: [seat, ...], refuterSeat: <int|null> }`. Walks seats to the left (increasing index, wrapping, skipping the suggester); `passes` are the seats that hold none of the three named cards (in walk order, up to the refuter); `refuterSeat` is the first seat holding ≥1 named card, or `null` if nobody can. Eliminated players still refute (not skipped).

- [ ] **Step 1: Write the failing test**

Create `test/clue-refute-walk.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRefuterWalk } from '../plugins/clue/server/refute.js';

const base = (hands) => ({ seats: [10, 11, 12, 13], hands, eliminated: [false, false, false, false] });
const named = { suspect: 'green', weapon: 'knife', room: 'hall' };

test('first left seat that holds a named card is the refuter', () => {
  // suggester=0. seat1 holds none, seat2 holds 'knife'.
  const s = base([['plum'], ['rope', 'study'], ['knife', 'library'], ['green']]);
  const r = findRefuterWalk(s, 0, named);
  assert.deepEqual(r.passes, [1]);
  assert.equal(r.refuterSeat, 2);
});

test('walk wraps around past the highest seat', () => {
  // suggester=2. Walk order: 3, 0, 1. seat3/seat0 hold none, seat1 holds 'hall'.
  const s = base([['plum'], ['hall'], ['rope'], ['study']]);
  const r = findRefuterWalk(s, 2, named);
  assert.deepEqual(r.passes, [3, 0]);
  assert.equal(r.refuterSeat, 1);
});

test('nobody can disprove: all others pass, refuterSeat null', () => {
  // Only the suggester (seat0) holds any named card.
  const s = base([['green', 'knife', 'hall'], ['plum'], ['rope'], ['study']]);
  const r = findRefuterWalk(s, 0, named);
  assert.deepEqual(r.passes, [1, 2, 3]);
  assert.equal(r.refuterSeat, null);
});

test('eliminated players still refute', () => {
  const s = base([['plum'], ['green'], ['rope'], ['study']]);
  s.eliminated = [false, true, false, false]; // seat1 out but still holds 'green'
  const r = findRefuterWalk(s, 0, named);
  assert.equal(r.refuterSeat, 1);
  assert.deepEqual(r.passes, []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-refute-walk.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `plugins/clue/server/refute.js`:

```js
// Walk seats to the LEFT of the suggester (increasing index, wrapping), looking
// for the first that can disprove the suggestion. Eliminated players still hold
// cards and still refute, so they are NOT skipped.
export function findRefuterWalk(state, suggesterSeat, named) {
  const n = state.seats.length;
  const cards = [named.suspect, named.weapon, named.room];
  const passes = [];
  for (let step = 1; step < n; step++) {
    const seat = (suggesterSeat + step) % n;
    const holds = cards.some((c) => state.hands[seat].includes(c));
    if (holds) return { passes, refuterSeat: seat };
    passes.push(seat);
  }
  return { passes, refuterSeat: null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clue-refute-walk.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/server/refute.js test/clue-refute-walk.test.js
git commit -m "feat(clue): left-walking refuter search"
```

---

## Task 5: `enterRoom` + `suggest` actions

**Files:**
- Create: `plugins/clue/server/actions.js`
- Test: `test/clue-actions-suggest.test.js`

**Interfaces:**
- Consumes: `SUSPECTS`, `WEAPONS`, `ROOMS` from `cards.js`; `findRefuterWalk` from `refute.js`.
- Produces: `applyClueAction({ state, action, actorId }) → { state } | { error }`. This task implements two action types:
  - `{ type: 'enterRoom', payload: { room } }` — current seat, phase `move` → places the seat's pawn in `room`, phase → `suggest`.
  - `{ type: 'suggest', payload: { suspect, weapon, room } }` — current seat, phase `suggest`, `room` must equal the seat's current room → drags the named pawn+weapon in, logs, computes the refuter walk, phase → `refute` (or `accuse-or-pass` if nobody can disprove).
  - `actorSeat(state, actorId)` and the reducer switch also route `refute`/`accuse`/`pass` (added in Tasks 6–8); this task may stub those three to `{ error: 'not implemented' }` and later tasks replace the stubs.

- [ ] **Step 1: Write the failing test**

Create `test/clue-actions-suggest.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClueAction } from '../plugins/clue/server/actions.js';

// 3-seat state, seat 0 (userId 7) on turn in phase 'move'.
function fixture() {
  return {
    seats: [7, 8, 9],
    phase: 'move',
    currentSeat: 0,
    activeUserId: 7,
    envelope: { suspect: 'plum', weapon: 'rope', room: 'study' },
    hands: [['mustard'], ['green', 'knife'], ['library']],
    pawns: Object.fromEntries(['scarlett', 'mustard', 'white', 'green', 'peacock', 'plum']
      .map((s) => [s, { room: null }])),
    weapons: { candlestick: 'kitchen', knife: 'ballroom', leadpipe: 'library',
               revolver: 'lounge', rope: 'diningroom', wrench: 'study' },
    seatSuspect: ['scarlett', 'mustard', 'white'],
    eliminated: [false, false, false],
    ledgers: [[], [], []],
    suggestion: null,
    log: [],
  };
}

test('enterRoom places the seat pawn and moves to suggest phase', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'enterRoom', payload: { room: 'hall' } }, actorId: 7 });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.state.pawns.scarlett, { room: 'hall' });
  assert.equal(r.state.phase, 'suggest');
});

test('enterRoom rejects a non-current seat and bad rooms', () => {
  assert.match(applyClueAction({ state: fixture(), action: { type: 'enterRoom', payload: { room: 'hall' } }, actorId: 8 }).error, /not your turn/);
  assert.match(applyClueAction({ state: fixture(), action: { type: 'enterRoom', payload: { room: 'attic' } }, actorId: 7 }).error, /invalid room/);
});

test('suggest requires being in the named room', () => {
  const s = fixture();
  s.phase = 'suggest';
  s.pawns.scarlett = { room: 'hall' };
  const wrong = applyClueAction({ state: s, action: { type: 'suggest', payload: { suspect: 'green', weapon: 'knife', room: 'library' } }, actorId: 7 });
  assert.match(wrong.error, /room you are in/);
});

test('suggest drags pawn+weapon in, finds refuter, pauses on that human', () => {
  const s = fixture();
  s.phase = 'suggest';
  s.pawns.scarlett = { room: 'hall' };
  // seat1 holds 'green' -> is the refuter.
  const r = applyClueAction({ state: s, action: { type: 'suggest', payload: { suspect: 'green', weapon: 'knife', room: 'hall' } }, actorId: 7 });
  assert.equal(r.error, undefined);
  assert.deepEqual(r.state.pawns.green, { room: 'hall' });   // dragged in
  assert.equal(r.state.weapons.knife, 'hall');               // dragged in
  assert.equal(r.state.phase, 'refute');
  assert.equal(r.state.suggestion.refuterSeat, 1);
  assert.equal(r.state.activeUserId, 8);                      // paused on the refuter
  assert.deepEqual(r.state.log.at(-1), { type: 'suggest', bySeat: 0, suspect: 'green', weapon: 'knife', room: 'hall' });
});

test('suggest nobody can disprove -> accuse-or-pass, passes logged', () => {
  const s = fixture();
  s.phase = 'suggest';
  s.pawns.scarlett = { room: 'hall' };
  s.hands = [['mustard'], ['peacock'], ['revolver']]; // no one holds green/wrench/hall
  const r = applyClueAction({ state: s, action: { type: 'suggest', payload: { suspect: 'green', weapon: 'wrench', room: 'hall' } }, actorId: 7 });
  assert.equal(r.state.phase, 'accuse-or-pass');
  assert.equal(r.state.suggestion.refuterSeat, null);
  assert.equal(r.state.activeUserId, 7); // back to the suggester
  const passLog = r.state.log.filter((e) => e.type === 'no-refute').map((e) => e.seat);
  assert.deepEqual(passLog, [1, 2]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-actions-suggest.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `plugins/clue/server/actions.js`:

```js
import { SUSPECTS, WEAPONS, ROOMS } from './cards.js';
import { findRefuterWalk } from './refute.js';

const clone = (s) => structuredClone(s);

function actorSeat(state, actorId) {
  const i = state.seats.indexOf(actorId);
  return i === -1 ? null : i;
}

export function applyClueAction({ state, action, actorId }) {
  const seat = actorSeat(state, actorId);
  if (seat === null) return { error: 'not a participant' };
  switch (action.type) {
    case 'enterRoom': return doEnterRoom(state, seat, action.payload);
    case 'suggest': return doSuggest(state, seat, action.payload);
    case 'refute': return { error: 'not implemented' };
    case 'accuse': return { error: 'not implemented' };
    case 'pass': return { error: 'not implemented' };
    default: return { error: `unknown action '${action.type}'` };
  }
}

function doEnterRoom(state, seat, payload) {
  if (seat !== state.currentSeat) return { error: 'not your turn' };
  if (state.phase !== 'move') return { error: `cannot enter a room in phase '${state.phase}'` };
  const room = payload?.room;
  if (!ROOMS.includes(room)) return { error: `invalid room '${room}'` };

  const next = clone(state);
  next.pawns[next.seatSuspect[seat]] = { room };
  next.phase = 'suggest';
  next.activeUserId = next.seats[seat];
  return { state: next };
}

function doSuggest(state, seat, payload) {
  if (seat !== state.currentSeat) return { error: 'not your turn' };
  if (state.phase !== 'suggest') return { error: `cannot suggest in phase '${state.phase}'` };
  const { suspect, weapon, room } = payload ?? {};
  if (!SUSPECTS.includes(suspect)) return { error: `invalid suspect '${suspect}'` };
  if (!WEAPONS.includes(weapon)) return { error: `invalid weapon '${weapon}'` };
  if (!ROOMS.includes(room)) return { error: `invalid room '${room}'` };
  if (room !== state.pawns[state.seatSuspect[seat]].room) {
    return { error: 'must suggest the room you are in' };
  }

  const next = clone(state);
  // Drag the named suspect pawn and weapon token into the room (public signal).
  next.pawns[suspect] = { room };
  next.weapons[weapon] = room;
  next.log.push({ type: 'suggest', bySeat: seat, suspect, weapon, room });

  const { passes, refuterSeat } = findRefuterWalk(next, seat, { suspect, weapon, room });
  for (const p of passes) next.log.push({ type: 'no-refute', seat: p });

  next.suggestion = { bySeat: seat, suspect, weapon, room, refuterSeat, shownCard: null };
  if (refuterSeat === null) {
    next.phase = 'accuse-or-pass';
    next.activeUserId = next.seats[seat];
  } else {
    next.phase = 'refute';
    next.activeUserId = next.seats[refuterSeat];
  }
  return { state: next };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clue-actions-suggest.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/server/actions.js test/clue-actions-suggest.test.js
git commit -m "feat(clue): enterRoom and suggest actions"
```

---

## Task 6: `refute` action

**Files:**
- Modify: `plugins/clue/server/actions.js` (replace the `refute` stub + add `doRefute`)
- Test: `test/clue-actions-refute.test.js`

**Interfaces:**
- Consumes: the `suggestion` set by Task 5.
- Produces: handling for `{ type: 'refute', payload: { card } }` — actor must be `suggestion.refuterSeat`; `card` must be one of the three named cards AND in the refuter's hand. Records `suggestion.shownCard`, appends `{ fromSeat, card }` to the suggester's ledger, logs `{type:'refute', bySeat, ofSeat}`, phase → `accuse-or-pass`, `activeUserId` → the suggester.

- [ ] **Step 1: Write the failing test**

Create `test/clue-actions-refute.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClueAction } from '../plugins/clue/server/actions.js';

// seat 0 suggested green/knife/hall; seat 2 (userId 9) is the refuter and holds both green and knife.
function fixture() {
  return {
    seats: [7, 8, 9],
    phase: 'refute',
    currentSeat: 0,
    activeUserId: 9,
    envelope: { suspect: 'plum', weapon: 'rope', room: 'study' },
    hands: [['mustard'], ['library'], ['green', 'knife']],
    pawns: {}, weapons: {},
    seatSuspect: ['scarlett', 'mustard', 'white'],
    eliminated: [false, false, false],
    ledgers: [[], [], []],
    suggestion: { bySeat: 0, suspect: 'green', weapon: 'knife', room: 'hall', refuterSeat: 2, shownCard: null },
    log: [],
  };
}

test('refuter shows a valid card: recorded to suggester ledger only', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'refute', payload: { card: 'green' } }, actorId: 9 });
  assert.equal(r.error, undefined);
  assert.equal(r.state.suggestion.shownCard, 'green');
  assert.deepEqual(r.state.ledgers[0], [{ fromSeat: 2, card: 'green' }]);
  assert.deepEqual(r.state.ledgers[1], []);
  assert.deepEqual(r.state.log.at(-1), { type: 'refute', bySeat: 2, ofSeat: 0 });
  assert.equal(r.state.phase, 'accuse-or-pass');
  assert.equal(r.state.activeUserId, 7);
});

test('refuter may choose which matching card to show', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'refute', payload: { card: 'knife' } }, actorId: 9 });
  assert.equal(r.state.suggestion.shownCard, 'knife');
});

test('rejects a card not among the suggested three', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'refute', payload: { card: 'library' } }, actorId: 9 });
  assert.match(r.error, /not one of the suggested/);
});

test('rejects a card the refuter does not hold', () => {
  const s = fixture();
  s.suggestion = { bySeat: 0, suspect: 'green', weapon: 'wrench', room: 'hall', refuterSeat: 2, shownCard: null };
  // seat2 holds green but not wrench; showing wrench is illegal.
  const r = applyClueAction({ state: s, action: { type: 'refute', payload: { card: 'wrench' } }, actorId: 9 });
  assert.match(r.error, /do not hold/);
});

test('rejects a refute from someone who is not the refuter', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'refute', payload: { card: 'green' } }, actorId: 8 });
  assert.match(r.error, /not your card/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-actions-refute.test.js`
Expected: FAIL — refute returns `{ error: 'not implemented' }`, assertions fail.

- [ ] **Step 3: Write minimal implementation**

In `plugins/clue/server/actions.js`, replace the line `case 'refute': return { error: 'not implemented' };` with:

```js
    case 'refute': return doRefute(state, seat, action.payload);
```

Then add this function at the end of the file:

```js
function doRefute(state, seat, payload) {
  if (state.phase !== 'refute' || !state.suggestion) return { error: 'no suggestion to refute' };
  if (seat !== state.suggestion.refuterSeat) return { error: 'not your card to show' };
  const card = payload?.card;
  const named = [state.suggestion.suspect, state.suggestion.weapon, state.suggestion.room];
  if (!named.includes(card)) return { error: 'card is not one of the suggested cards' };
  if (!state.hands[seat].includes(card)) return { error: 'you do not hold that card' };

  const next = clone(state);
  next.suggestion.shownCard = card;
  next.ledgers[next.suggestion.bySeat].push({ fromSeat: seat, card });
  next.log.push({ type: 'refute', bySeat: seat, ofSeat: next.suggestion.bySeat });
  next.phase = 'accuse-or-pass';
  next.activeUserId = next.seats[next.suggestion.bySeat];
  return { state: next };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clue-actions-refute.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/server/actions.js test/clue-actions-refute.test.js
git commit -m "feat(clue): refute action with private ledger update"
```

---

## Task 7: `accuse` action (elimination & win)

**Files:**
- Modify: `plugins/clue/server/actions.js` (replace the `accuse` stub + add `doAccuse`, `nextSeat`, `livingCount`)
- Test: `test/clue-actions-accuse.test.js`

**Interfaces:**
- Consumes: `state.envelope`.
- Produces: handling for `{ type: 'accuse', payload: { suspect, weapon, room } }` — allowed for the current seat in phase `move` or `accuse-or-pass`. Correct → `phase:'ended'`, `winnerSeat`, `endedReason:'accusation'`, returns `{ state, ended: true, summary }`. Wrong → `eliminated[seat]=true`; if only one seat remains it wins (`endedReason:'last-standing'`, `ended:true`); otherwise advance to the next living seat, phase `move`. Also produces helpers `nextSeat(state, from)` and `livingCount(state)` used by Task 8.

- [ ] **Step 1: Write the failing test**

Create `test/clue-actions-accuse.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClueAction } from '../plugins/clue/server/actions.js';

function fixture() {
  return {
    seats: [7, 8, 9],
    phase: 'accuse-or-pass',
    currentSeat: 0,
    activeUserId: 7,
    envelope: { suspect: 'plum', weapon: 'rope', room: 'study' },
    hands: [['mustard'], ['green'], ['library']],
    pawns: {}, weapons: {},
    seatSuspect: ['scarlett', 'mustard', 'white'],
    eliminated: [false, false, false],
    ledgers: [[], [], []],
    suggestion: { bySeat: 0, suspect: 'x', weapon: 'y', room: 'z', refuterSeat: null, shownCard: null },
    log: [],
  };
}

test('correct accusation wins and ends the game', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'accuse', payload: { suspect: 'plum', weapon: 'rope', room: 'study' } }, actorId: 7 });
  assert.equal(r.ended, true);
  assert.equal(r.state.phase, 'ended');
  assert.equal(r.state.winnerSeat, 0);
  assert.equal(r.state.endedReason, 'accusation');
  assert.equal(r.state.activeUserId, null);
  assert.deepEqual(r.state.log.at(-1), { type: 'accuse', bySeat: 0, correct: true });
});

test('wrong accusation eliminates the accuser and advances the turn', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'accuse', payload: { suspect: 'plum', weapon: 'rope', room: 'hall' } }, actorId: 7 });
  assert.equal(r.ended, undefined);
  assert.deepEqual(r.state.eliminated, [true, false, false]);
  assert.equal(r.state.currentSeat, 1);
  assert.equal(r.state.phase, 'move');
  assert.equal(r.state.activeUserId, 8);
  assert.equal(r.state.suggestion, null);
  assert.deepEqual(r.state.log.at(-1), { type: 'accuse', bySeat: 0, correct: false });
});

test('wrong accusation that leaves one player standing ends the game', () => {
  const s = fixture();
  s.eliminated = [false, true, false]; // only seats 0 and 2 remain
  const r = applyClueAction({ state: s, action: { type: 'accuse', payload: { suspect: 'green', weapon: 'rope', room: 'study' } }, actorId: 7 });
  assert.equal(r.ended, true);
  assert.equal(r.state.winnerSeat, 2);
  assert.equal(r.state.endedReason, 'last-standing');
});

test('turn advance skips already-eliminated seats', () => {
  const s = fixture();
  s.eliminated = [false, true, false]; // seat1 already out
  s.currentSeat = 2; s.activeUserId = 9;
  // seat2 makes a wrong accusation -> should wrap to seat 0 (skipping eliminated seat1),
  // but seat2 being eliminated leaves seats {0} -> game ends with seat0 winner.
  const r = applyClueAction({ state: s, action: { type: 'accuse', payload: { suspect: 'green', weapon: 'knife', room: 'hall' } }, actorId: 9 });
  assert.equal(r.ended, true);
  assert.equal(r.state.winnerSeat, 0);
});

test('rejects accusation when it is not your turn', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'accuse', payload: { suspect: 'plum', weapon: 'rope', room: 'study' } }, actorId: 9 });
  assert.match(r.error, /not your turn/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-actions-accuse.test.js`
Expected: FAIL — accuse returns `{ error: 'not implemented' }`.

- [ ] **Step 3: Write minimal implementation**

In `plugins/clue/server/actions.js`, replace `case 'accuse': return { error: 'not implemented' };` with:

```js
    case 'accuse': return doAccuse(state, seat, action.payload);
```

Add these helpers and function at the end of the file:

```js
function livingCount(state) {
  return state.eliminated.filter((e) => !e).length;
}

function nextSeat(state, from) {
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const s = (from + step) % n;
    if (!state.eliminated[s]) return s;
  }
  return from;
}

function endWith(next, winnerSeat, reason) {
  next.phase = 'ended';
  next.winnerSeat = winnerSeat;
  next.endedReason = reason;
  next.activeUserId = null;
  next.suggestion = null;
  return { state: next, ended: true };
}

function doAccuse(state, seat, payload) {
  if (seat !== state.currentSeat) return { error: 'not your turn' };
  if (state.phase !== 'move' && state.phase !== 'accuse-or-pass') {
    return { error: `cannot accuse in phase '${state.phase}'` };
  }
  const { suspect, weapon, room } = payload ?? {};
  if (!SUSPECTS.includes(suspect)) return { error: `invalid suspect '${suspect}'` };
  if (!WEAPONS.includes(weapon)) return { error: `invalid weapon '${weapon}'` };
  if (!ROOMS.includes(room)) return { error: `invalid room '${room}'` };

  const correct = suspect === state.envelope.suspect
    && weapon === state.envelope.weapon
    && room === state.envelope.room;

  const next = clone(state);
  next.log.push({ type: 'accuse', bySeat: seat, correct });

  if (correct) return endWith(next, seat, 'accusation');

  // Wrong: eliminate but keep the accuser's cards for future refutes.
  next.eliminated[seat] = true;
  if (livingCount(next) === 1) {
    return endWith(next, next.eliminated.findIndex((e) => !e), 'last-standing');
  }
  const nseat = nextSeat(next, seat);
  next.currentSeat = nseat;
  next.phase = 'move';
  next.activeUserId = next.seats[nseat];
  next.suggestion = null;
  return { state: next };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clue-actions-accuse.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/clue/server/actions.js test/clue-actions-accuse.test.js
git commit -m "feat(clue): accuse action with elimination and win detection"
```

---

## Task 8: `pass` action & turn advance

**Files:**
- Modify: `plugins/clue/server/actions.js` (replace the `pass` stub + add `doPass`)
- Test: `test/clue-actions-pass.test.js`

**Interfaces:**
- Consumes: `nextSeat` (from Task 7).
- Produces: handling for `{ type: 'pass', payload: {} }` — allowed for the current seat in phase `move` (chose not to enter/suggest) or `accuse-or-pass` (declined to accuse). Advances to the next living seat, phase → `move`, clears `suggestion`.

- [ ] **Step 1: Write the failing test**

Create `test/clue-actions-pass.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyClueAction } from '../plugins/clue/server/actions.js';

function fixture() {
  return {
    seats: [7, 8, 9],
    phase: 'accuse-or-pass',
    currentSeat: 0,
    activeUserId: 7,
    envelope: { suspect: 'plum', weapon: 'rope', room: 'study' },
    hands: [['mustard'], ['green'], ['library']],
    pawns: {}, weapons: {},
    seatSuspect: ['scarlett', 'mustard', 'white'],
    eliminated: [false, false, false],
    ledgers: [[], [], []],
    suggestion: { bySeat: 0, suspect: 'x', weapon: 'y', room: 'z', refuterSeat: 2, shownCard: 'green' },
    log: [],
  };
}

test('pass advances to the next seat and resets to move phase', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'pass', payload: {} }, actorId: 7 });
  assert.equal(r.error, undefined);
  assert.equal(r.state.currentSeat, 1);
  assert.equal(r.state.phase, 'move');
  assert.equal(r.state.activeUserId, 8);
  assert.equal(r.state.suggestion, null);
});

test('pass from the last seat wraps to seat 0', () => {
  const s = fixture();
  s.currentSeat = 2; s.activeUserId = 9;
  const r = applyClueAction({ state: s, action: { type: 'pass', payload: {} }, actorId: 9 });
  assert.equal(r.state.currentSeat, 0);
  assert.equal(r.state.activeUserId, 7);
});

test('pass skips eliminated seats', () => {
  const s = fixture();
  s.eliminated = [false, true, false];
  const r = applyClueAction({ state: s, action: { type: 'pass', payload: {} }, actorId: 7 });
  assert.equal(r.state.currentSeat, 2); // skips eliminated seat 1
});

test('pass in the move phase is allowed (declined to move)', () => {
  const s = fixture();
  s.phase = 'move'; s.suggestion = null;
  const r = applyClueAction({ state: s, action: { type: 'pass', payload: {} }, actorId: 7 });
  assert.equal(r.state.currentSeat, 1);
  assert.equal(r.state.phase, 'move');
});

test('pass rejected when it is not your turn', () => {
  const r = applyClueAction({ state: fixture(), action: { type: 'pass', payload: {} }, actorId: 8 });
  assert.match(r.error, /not your turn/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/clue-actions-pass.test.js`
Expected: FAIL — pass returns `{ error: 'not implemented' }`.

- [ ] **Step 3: Write minimal implementation**

In `plugins/clue/server/actions.js`, replace `case 'pass': return { error: 'not implemented' };` with:

```js
    case 'pass': return doPass(state, seat);
```

Add at the end of the file:

```js
function doPass(state, seat) {
  if (seat !== state.currentSeat) return { error: 'not your turn' };
  if (state.phase !== 'move' && state.phase !== 'accuse-or-pass') {
    return { error: `cannot pass in phase '${state.phase}'` };
  }
  const next = clone(state);
  const nseat = nextSeat(next, seat);
  next.currentSeat = nseat;
  next.phase = 'move';
  next.activeUserId = next.seats[nseat];
  next.suggestion = null;
  return { state: next };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/clue-actions-pass.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Run the full clue suite and commit**

Run: `node --test test/clue-*.test.js`
Expected: PASS (all clue tests green).

```bash
git add plugins/clue/server/actions.js test/clue-actions-pass.test.js
git commit -m "feat(clue): pass action and turn advance"
```

---

## Self-Review

**1. Spec coverage (Plan 1 slice):**
- Card catalog / 21 cards / envelope one-per-category / 18 dealt unevenly → Task 1. ✅
- Deal + weapon placement + seat/turn init → Task 2. ✅
- `cluePublicView` hidden-info seam + leak guards (envelope, other hands, other ledgers, shownCard-to-suggester-only) → Task 3. ✅
- Refutation walks left, first holder disproves, "couldn't disprove" public signal, eliminated players still refute → Tasks 4 (walk) + 5/6 (actions). ✅
- Suggestion drags named pawn + weapon into the room → Task 5. ✅
- Suggest only the room you are in; `enterRoom` abstract placement (grid deferred to Plan 2) → Task 5. ✅
- Refute shows one card privately, recorded to suggester's ledger only → Task 6. ✅
- Accusation from move/accuse-or-pass; correct wins; wrong eliminates but keeps refuting; last-standing win → Task 7. ✅
- Pass + turn advance skipping eliminated → Task 8. ✅
- **Deferred to later plans (out of Plan 1 scope, flagged in Roadmap):** grid geometry + dice movement + secret passages (Plan 2); bot knowledge-tracker/shortlist/persona pick + auto-refute (Plan 3); client + `plugin.js` manifest + registration + async-pause end-to-end wiring (Plan 4). The async-refute *pause* is already realized in the engine (Task 5 sets `activeUserId` to the human refuter); Plan 3 adds bot auto-refute on top.

**2. Placeholder scan:** No TBD/TODO; every code step shows complete code; the `refute`/`accuse`/`pass` stubs in Task 5 are explicitly replaced with full implementations in Tasks 6–8 (not left as placeholders). ✅

**3. Type consistency:** `applyClueAction({state, action, actorId})`, `findRefuterWalk(state, suggesterSeat, named) → {passes, refuterSeat}`, `dealCards(rng, seatCount) → {envelope, hands}`, and state fields (`seats`, `hands` (array), `ledgers` (array), `seatSuspect` (array), `eliminated` (array), `suggestion.{bySeat,refuterSeat,shownCard}`, `winnerSeat`) are used identically across all tasks and match the header shape. Log entry `{type:'no-refute', seat}` uses `seat` consistently in Tasks 5 and 3. ✅
