# Clue Clone — Design

**Date:** 2026-07-01
**Status:** Approved for planning
**Canonical rules source:** `docs/ClueClassicRules_2020.pdf` (Clue: The Classic Edition, 2020, 3–6 players)
**Analog plugins:** `plugins/sorry` (grid board + 4P), `plugins/words` (AI shortlist pattern), `plugins/backgammon` (AI shortlist + pause-for-human-input)

---

## 1. Overview

A new gamebox plugin: a full-board Clue deduction game. Players move pawns around Mr. Boddy's mansion, enter rooms, make **suggestions**, receive private refutations, deduce the contents of the hidden envelope (one suspect + one weapon + one room), and win by making a correct **accusation**.

This is a **personal fan project** for the playgroup's private use — not distributed, not for sale — so it uses the **canonical Clue theme directly** (real suspect/weapon/room names), with no trademark reskin.

### Goals

- A faithful, full-board Clue implementation as a `clue` plugin, matching the 2020 Classic Edition rules.
- **Mixed 3–4 seats**: any combination of humans and bots, seat-indexed (the E4-1 platform capability). Empty seats fill with bots.
- Bots that **deduce competently** (never misdeduce) but play with **persona style and deliberate imperfection**, using the established words/backgammon shortlist pattern.
- Reuse the existing board treatment (Sorry! grid, Risk render harness) — no new geometry engine.

### Non-goals

- Not 5–6 players (the canonical max is 6; we cap at 4 to bound board/UX/bot scope for the first cut — see §10 Open items).
- No net-new AI framework: bots use the existing `chooseAction` contract and persona catalog.
- No custom rules variants (Detective Notes automation beyond a basic per-player deduction ledger is out of scope for v1).

### The one genuinely new thing: hidden information

Every existing gamebox game is either full-information (Risk, Sorry!, backgammon) or has a hand only its **owner** sees (Words rack). Clue is the first game where **the per-viewer projection *is* the game** — what each seat is permitted to know (their hand, the cards privately shown to *them*, the public refute log — but never the envelope or others' hands) is the entire mechanic. The `publicView` seam therefore carries the design risk and gets the heaviest test coverage (§9).

---

## 2. Cast, equipment & cards (canonical)

**6 suspects** (pawn colors in parens): Miss Scarlett (Red), Col. Mustard (Yellow), Mrs. White (White), Mr. Green (Green), Mrs. Peacock (Blue), Prof. Plum (Purple).

**6 weapons:** Candlestick, Knife (Dagger), Lead Pipe, Revolver, Rope, Wrench (Spanner).

**9 rooms:** Kitchen, Ballroom, Conservatory, Dining Room, Billiard Room, Library, Lounge, Hall, Study. Plus the central Cellar/stairway ("X") holding the envelope (not a playable room).

**21 cards** = 6 suspect + 6 weapon + 9 room. Envelope takes exactly one of each category (3 cards). The remaining **18 cards are shuffled and dealt one at a time around the table — unevenly** (18 ÷ 3 = 6 each for 3 players; 18 ÷ 4 = some hold 5, some 4 for 4 players).

**Secret passages** connect the four **corner rooms** diagonally: Kitchen ↔ Study, Conservatory ↔ Lounge. (Canonical corner pairing.)

**Weapon start positions:** each of the 6 weapon tokens starts in a *different* room (any 6 of the 9), placed at setup. Weapon and suspect positions are **public** and are dragged around by suggestions — a real deduction signal.

---

## 3. Board geometry — reuse, not reinvent

The mansion decomposes into primitives the box already builds:

| Primitive | Reuses | Notes |
|-----------|--------|-------|
| Corridor grid (white squares) | Sorry! path model (`plugins/sorry/server/geometry.js`) | Pawns move orthogonally (never diagonal), 1 square per pip. |
| 9 room polygons | Risk polygon approach (`src/clients/risk/map-geometry.js`) | Iterated offline with the `rsvg-convert` SVG→PNG **render harness**; only overlaps matter, so rooms need clean non-overlap. |
| Door squares | New data | The corridor cells adjacent to each room that gate entry; doors are not counted as a square. |
| Secret passages | New data (adjacency list) | 2 edges (Kitchen↔Study, Conservatory↔Lounge). |

**Pipeline:** server geometry module → client mirror → drift guard → fixtures, exactly the design-handoff pattern used for the Risk map. Board geometry is authored/verified offline via the render harness before any gameplay wiring.

**Dice are client-side.** A single die (1–6). Per the "dice are client-side rules, not bot decisions" doctrine, the client rolls and POSTs the value back; the server never generates dice RNG and no bot ever "decides" a roll. This uses the backgammon `pendingRoll` pause: the engine records a pending roll and waits for the die value.

### Movement rules (canonical, encoded server-side)

- Move exactly N orthogonal squares per the die; forward/backward/crosswise, **never diagonal**; may not revisit a square in the same turn.
- **No two pawns on one square**; may not move *through* an occupied square. A room may hold any number of pawns/weapons.
- **Entering a room** ends the move (excess pips ignored — no exact count needed). Entry is via a **doorway**; a blocked doorway (occupied entrance square) cannot be used.
- **Secret passage**: on your turn, if in a corner room, leap to the opposite corner room *without rolling*; a suggestion may follow.
- **Leaving a room**: via a doorway (roll & move out), a secret passage, or being transferred by another player's suggestion. **Cannot leave and re-enter the same room in one turn** (requires ≥2 turns).
- **Reachable-squares are computed server-side** (BFS to depth = die value, respecting blocking and no-revisit) and surfaced in `publicView` for the seat on turn — the client renders and clicks a destination; it never recomputes legality (mirrors Sorry!'s `view.legalMoves`).

---

## 4. State model

Full server state (authoritative, never sent whole to any client):

```
{
  seats: [userId, ...],            // seat-indexed roster (seat 0 = creator/first); turn order
  phase: 'pending-roll' | 'moving' | 'suggest' | 'refute' | 'accuse-or-pass' | 'ended',
  currentSeat: <int>,
  activeUserId: <userId | null>,   // whose input the engine is blocking on (may be a REFUTER, not currentSeat)
  envelope: { suspect, weapon, room },      // HIDDEN — redacted from every publicView
  hands: { <seat>: [cardId, ...] },         // HIDDEN — each seat sees only its own
  pawns:   { <suspectId>: <location> },     // PUBLIC, AUTHORITATIVE — ALL 6 suspect pawns
                                            //   are on the board regardless of player count
                                            //   (canonical); location = {room} or {square:[x,y]}
  weapons: { <weaponId>:  <roomId> },       // PUBLIC
  seatSuspect: { <seat>: <suspectId> },     // PUBLIC — which suspect each seat controls; a seat's
                                            //   pawn location is pawns[seatSuspect[seat]]
  eliminated: { <seat>: bool },             // wrong-accusation players: can't win, still refute
  pendingRoll: <int | null>,                // die value awaited from client
  suggestion: {                             // the in-flight suggestion during refute
    bySeat, suspect, weapon, room,
    refuterSeat,                            // seat currently being asked (to the left, wrapping)
    shownCard: <cardId | null>             // recorded to the suggester's private ledger only
  } | null,
  ledgers: { <seat>: [ {fromSeat, card} ] },// PRIVATE per seat: cards shown TO this seat
  log: [ ... ],                             // PUBLIC event log (see below)
  winnerSeats, endedReason
}
```

**Public log** records suggestions and *who refuted whom* — e.g. `{type:'suggest', bySeat:1, suspect, weapon, room}` and `{type:'refute', bySeat:3, ofSeat:1}` (that seat 3 disproved seat 1) — **but never which card was shown**, except in the suggester's private ledger. "No one could disprove" is also logged (a strong public signal).

### `cluePublicView({ state, viewerId })` — the seam

Resolves `youAreSeat = state.seats.indexOf(viewerId)`, then returns:

- **Own hand** (`hands[youAreSeat]`), **own private ledger** (`ledgers[youAreSeat]`).
- Public board: `pawns`, `weapons`, `positions`, `eliminated`, `log`.
- **Redacted:** `envelope`, all other `hands`, all other `ledgers`, the in-flight `suggestion.shownCard` unless the viewer is the suggester.
- `legalMoves` / `reachableSquares` / `availableSuggestions` **only** for the seat whose input is being awaited (`viewerId === activeUserId`).

This function is pure and is the single choke point for information disclosure. See §9 for its test obligations.

---

## 5. Turn flow & phases

```
pending-roll ──roll(value)──▶ moving ──moveTo(square)──▶ (entered a room?)
                                   │ no room reached
                                   ▼
                              accuse-or-pass
   room reached ──▶ suggest ──suggest(suspect,weapon,room)──▶ refute
                                                                  │
                            refute resolves (card shown / all-pass)
                                                                  ▼
                                                          accuse-or-pass ──pass──▶ next seat
                                                                  └──accuse──▶ (check envelope)
```

- **Suggestion** is only legal in the room you *just entered* (or the room you were placed in by another's suggestion — then you may suggest next turn without moving). Naming the room forces `room === your current room`.
- Making a suggestion **drags the named suspect pawn and weapon token into your room** (public). Transferred pawns/weapons stay where dragged; they are not returned. A suspect dragged into a room may, on their controller's next turn, suggest from there without moving.
- **Accusation** may be made on your turn regardless of room (before or after a suggestion, once per game). Correct → reveal envelope, win. Wrong → `eliminated[seat]=true`; the player keeps their cards and continues to refute others' suggestions but can never win or move.

---

## 6. Refutation & the async pause

When seat *S* suggests, refutation walks **to the left** — `refuterSeat = (S+1) mod N`, then `+2`, … skipping *S* — until a seat that holds ≥1 of the three named cards is found, or all pass.

- **Bot refuter:** auto-refutes **instantly and deterministically**. If it holds multiple matching cards it reveals the one that **leaks the least new information** to the suggester (prefer a card the suggester has likely already seen / that this bot has shown before). Recorded to the suggester's ledger; public log gets only "seat X disproved."
- **Human refuter:** the suggester's turn **pauses server-side** (`activeUserId = refuter's userId`, `phase = 'refute'`) awaiting the human's card choice — the identical mechanism to backgammon pausing on `pendingRoll` for a human-supplied value. No new blocking primitive. If the human holds exactly one matching card the client may auto-select it; if multiple, they choose which to show.

This is the async-deduction hazard flagged at design time, resolved by reusing the existing pause pattern rather than inventing turn-blocking.

---

## 7. Bot architecture

Three layers mapping 1:1 onto the words/backgammon `chooseAction` contract:

```
chooseAction({ llm, persona, state, botPlayerIdx }) → { action, banter, sessionId }
   action ∈ shortlist   // validated; illegal id → InvalidLlmMove
```

### 7.1 Knowledge tracker (deterministic, server-side, invisible)

Per bot: a **card × player possibility matrix**. Facts marked from three sources:

1. **Own hand** — cards it holds are definitively *not* in the envelope and *not* in others' hands.
2. **Cards shown to it** (its private ledger) — that specific player holds that card.
3. **Public refute log** — "seat P could not disprove {A,B,C}" ⇒ P holds none of A,B,C (mark all three "not-P"). "Seat P disproved seat Q's {A,B,C}" ⇒ P holds ≥1 of A,B,C (a weaker constraint; tracked as a clause).

Standard Clue **constraint propagation** runs to fixpoint: category elimination (when 5 of 6 suspects are located in hands, the 6th is the envelope), player-hand-size limits, and single-clause resolution (a "P holds one of {A,B,C}" clause where two are already located elsewhere ⇒ P holds the third). This is the **"never misdeduce"** guarantee — pure bookkeeping, no LLM. It is the invisible-logic-server-side half of the doctrine.

### 7.2 Shortlist builder (deterministic, with a difficulty knob)

Builds a **bounded, diverse menu** of reasonable actions — the `POINTS_CAP` analog. Slot types:

- **info-max probe** — a suggestion naming currently-unknown suspect/weapon to maximize expected information gain.
- **chase** — a suggestion/movement driving toward a room the bot suspects is the answer.
- **bluff** — a suggestion including a card the bot itself holds, to mislead opponents (explicitly canonical and encouraged; §"Other notes" of the rules).
- **safe / low-info** — a low-commitment option.
- **accuse** — offered **only once the envelope is fully solved** by the tracker. A cocky persona may get it offered one deduction step early as an explicit difficulty/personality lever (risking elimination); a cautious persona only when certain.
- **movement shortlist** — for the `moving` phase, a small set of reachable destinations (toward rooms of interest / via secret passage), pre-scored so the persona picks among a few, not the whole BFS frontier (backgammon `MAX_SHORTLIST` pattern).

The cap ensures bots don't play information-theoretically perfectly; imperfection is a **designed property of the menu**, not LLM incompetence.

### 7.3 Persona pick + banter (LLM)

The persona chooses one shortlisted action **by id** and returns banter; style is *which* reasonable slot it picks. Same parse/validate path as words/backgammon (`InvalidLlmResponse` / `InvalidLlmMove`).

### 7.4 Personas — suspects double as personas

Per the "new plugin needs a game-scoped persona" doctrine, a `clue` persona set is **in-scope for this design, not a follow-up** — without it there are zero AI opponents. Elegantly, in Clue you *play as a suspect*, so the **six suspects are the six bot personas**. Each is a persona-catalog YAML (`src/server/ai/persona-catalog` loader; required `id/displayName/color/glyph/systemPrompt`, optional `voiceExamples`, and **`games: [clue]`** to scope it). Portraits auto-load by persona id. Persona `color` aligns with the canonical pawn color.

---

## 8. Plugin manifest & files

```
plugins/clue/
  plugin.js                       // { id:'clue', displayName:'Clue', players:{min:3,max:4},
                                   //   clientDir, initialState, applyAction, publicView }
  server/
    state.js                      // buildInitialState({ participants, rng }): deal + envelope + weapon placement
    actions.js                    // applyClueAction — roll/move/suggest/refute/accuse/pass
    view.js                       // cluePublicView({ state, viewerId })
    geometry.js                   // grid, rooms, doors, secret passages (offline-authored)
    cards.js                      // canonical 21-card catalog + deal/envelope logic
    rules/
      movement.js                 // reachable-squares BFS, room entry/exit, blocking
      refute.js                   // left-walking refuter search + least-leak card choice
    ai/
      knowledge.js                // deterministic knowledge-matrix tracker + propagation
      shortlist.js                // bounded diverse suggestion/movement menu
      clue-player.js              // chooseAction (persona pick), prompts.js
      prompts.js
  client/                         // built bundle (gitignored) — React app mirroring geometry
personas: src/server/ai/persona-catalog/{scarlett,mustard,white,green,peacock,plum}.yaml  (games:[clue])
registry: add clue to src/plugins/index.js
```

Client is React (per the migration), rendered from `src/clients/clue/` and built by `npm run build:client` into `plugins/clue/client/` (bundles gitignored — a `.tsx` change is inert until rebuilt + server restart).

---

## 9. Testing & harness

- **Board render harness (offline).** Author `geometry.js` and verify via `rsvg-convert` SVG→PNG before wiring gameplay. Room polygons must not overlap; door squares must sit on the corridor grid adjacent to their room.
- **Drift guard + fixtures.** Server geometry ↔ client mirror kept in lockstep (the Risk pattern), with fixture snapshots.
- **Hidden-information leak tests (the critical suite).** For `cluePublicView`: assert that for every non-owner seat, the projection contains **no envelope card**, **no other seat's hand card**, and **no other seat's private ledger entry**; assert the suggester sees the shown card but no other seat does; assert `legalMoves`/`reachableSquares` appear only for `activeUserId`. A leak here silently breaks the whole game without crashing — these are property tests, run over randomized deals.
- **Deduction-correctness tests.** The knowledge tracker must (a) never mark a false certainty, and (b) reach the solved state on any fully-determined transcript. Fixture transcripts with known envelopes drive both.
- **Rules tests.** Uneven deal totals to 18; envelope has exactly one per category; suggestion drags pawn+weapon; can't re-enter same room same turn; secret-passage adjacency; wrong accusation eliminates but keeps refuting; refute walks left and stops at first holder.
- **Async pause test.** A bot suggestion whose first left-holder is a human pauses on that human's `activeUserId` and resumes correctly after the card choice.
- Tests run via the `testing-runner` subagent (`node --test`), never invoked directly.

---

## 10. Open items / decisions deferred to planning

- **Player max = 4 vs 6.** Capped at 4 for the first cut to bound board/UX/bot scope. The card/deduction engine is player-count-agnostic (deals to N), so 5–6 is a later config-level bump (palette + start squares + more dealt hands) — mirrors the Risk 2-4 → 5-6 follow-up shape. Flag, don't build, for v1.
- **Weapon start distribution.** Canonical is "any 6 of 9 rooms." Use seeded RNG (deterministic per game) — decide fixed-vs-random at plan time.
- **Detective Notes UI.** v1 gives humans the raw public log + their private ledger; an auto-filled deduction grid is a nice-to-have, explicitly deferred.
- **Suggestion-transfer edge cases.** A human whose suspect-pawn is dragged into a room by another player gains a "suggest-in-place next turn" option; confirm the UX affordance during planning.

---

## Summary

Full-board, 3–4 mixed-seat Clue clone. The deduction *loop* and card model are the heart; `cluePublicView` is the single information-disclosure seam and the primary test target. The board reuses the Sorry! grid + Risk render-harness treatment (no new engine); dice stay client-side. Bots are the house pattern — a deterministic knowledge-tracker (never misdeduces) feeds a bounded, difficulty-capped shortlist, and a persona picks by id + banters — with the six canonical suspects doubling as the six game-scoped personas.
