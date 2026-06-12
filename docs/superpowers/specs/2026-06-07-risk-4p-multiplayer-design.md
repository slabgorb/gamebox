# Risk 4-Player Multiplayer — Design

**Date:** 2026-06-07
**Status:** Approved
**Approach:** Seat-indexed platform generalization (Approach A)

## Problem

Gamebox is hardcoded to 2 players per match at four layers: DB schema
(`player_a_id`/`player_b_id`, `CHECK (side IN ('a','b'))`), platform core
(`plugins.js` throws on `players !== 2`, single `opponentId` at creation,
a/b ternary chains in turn routing), AI orchestration (one bot per game),
and the Risk plugin itself (`sides: {a,b}`, `idx % 2`, `hands: [[],[]]`).

The playgroup wants 4-player Risk. The 2P constraint was driven by async
pacing with no players available, not by the engine — with a playgroup,
that constraint is gone for Risk.

## Decisions

- **Player count:** Risk supports 2–4 seats; 4 is the playgroup target.
- **AI:** deferred entirely. N>2 games are humans-only; creation rejects
  bot userIds in `opponentIds`. The orchestrator, `ai_sessions`,
  headless-game harness, and persona seating stay 2P-only and untouched.
- **Migration:** none. In-flight games are discardable; existing rows get
  `status = 'ended'` (or tables are dropped/recreated — implementer's call).
- **Resign at N>2:** rejected with 422. Seat elimination happens only by
  conquest. (Resign-to-neutral mechanic shelved as a possible follow-on.)
- **Other plugins:** stay 2P (`players: {min: 2, max: 2}`) with a two-line
  participants adapter; their internal a/b state shapes are untouched.

## Section 1: Data Model

**`participants` table (new):**

```sql
CREATE TABLE participants (
  game_id  INTEGER NOT NULL REFERENCES games(id),
  user_id  INTEGER NOT NULL REFERENCES users(id),
  seat     INTEGER NOT NULL,            -- 0..N-1, turn order
  PRIMARY KEY (game_id, seat),
  UNIQUE (game_id, user_id)
);
```

**`games` table:**

- Drop `player_a_id`, `player_b_id`, `CHECK (player_a_id < player_b_id)`.
- `winner_side TEXT` → `winner_seat INTEGER NULL` plus
  `is_draw INTEGER NOT NULL DEFAULT 0`. Draw is explicit rather than
  overloading NULL (NULL also means abandoned/unfinished). Risk cannot
  draw; Words can.
- Drop the `one_active_per_pair_type` unique index. Its job moves to an
  application-level check at creation: same game type + identical
  participant set + active → reject. (SQLite cannot express set-equality
  in an index once N varies.)

**`turn_log`:** `side TEXT CHECK (side IN ('a','b'))` → `seat INTEGER NOT NULL`.

**State convention (JSON blob):** `state.sides: {a, b}` →
`state.seats: [userId, ...]` ordered by seat. `activeUserId` is unchanged —
the turn-ownership contract built on it stays as-is. Seat index is both
the DB identity and the plugin's internal player index: one vocabulary,
no mapping layer.

## Section 2: Platform Core

**Plugin contract (`src/server/plugins.js`):**

- `players: 2` → `players: { min, max }`. Risk declares `{min: 2, max: 4}`;
  the other six declare `{min: 2, max: 2}`. Validation gate checks
  `2 <= min <= max <= 6`.
- `initialState({ participants, rng, ... })` — `participants` is
  `[{ userId, seat }, ...]` sorted by seat. The six 2P plugins adapt with
  `const [a, b] = participants.map(p => p.userId)` at the top of
  `buildInitialState`; internals untouched.
- `legalActions`, `applyAction`, `publicView` signatures unchanged.

**Game creation (`POST /api/games`):**

- Body: `{ opponentId }` → `{ opponentIds: [...] }`. Validate: integers,
  no duplicates, no self, count within plugin's `min-1..max-1`, no bot
  userIds when N>2.
- Creator is seat 0; opponents get seats 1..N in invite order. No more
  `Math.min/max` ID ordering — seat order is turn order.
- Duplicate-game check: app-level set-equality query against `participants`.

**Turn machinery (routes.js / games.js):**

- `activeUserId` gating: unchanged (already N-player-correct).
- Actor-seat derivation: ternary chains collapse to one exported helper
  `seatOf(state, userId)` (`state.seats.indexOf(userId)` with a
  participants-table fallback), used everywhere. No silent `?? 'a'`
  fallbacks survive.
- SSE: payloads carry `seat` instead of `side`; otherwise unchanged.
- Resign with N players: forwarded to the plugin, which decides. 2P
  plugins keep "resign = you lose"; Risk rejects resign at N>2.

**Win records / lobby data:** scores become a by-seat array;
`won` check is `game.winnerSeat === yourSeat`.

## Section 3: Risk Plugin — N-Player Rules & State

**State shape (`plugins/risk/server/state.js`):**

```js
{
  seats: [userId0, userId1, userId2, userId3],   // replaces sides: {a,b}
  currentPlayer: 0,                               // seat index 0..N-1
  setupPools: [30, 30, 30, 30],                   // N entries
  hands: [[], [], [], []],                        // N entries
  territories: { id: { owner: seatIdx, armies } } // owner 0..N-1
}
```

`playerIndex()` / `userIdOf()` become `state.seats.indexOf(userId)` /
`state.seats[seat]` — same names, so `actions.js` / `combat.js` /
`validate.js` mostly stop assuming the answer is 0 or 1.

**Setup:** territory shuffle deals round-robin `idx % N` (at 4 players two
seats get 11 territories, two get 10 — canonical). Starting armies:
2 players → 20 (existing house rule, unchanged), 3 → 35, 4 → 30
(canonical). Setup placement alternates by seat order.

**Generalizes for free:** reinforcement math (`territories/3` min 3 +
continent bonuses), combat, fortify, card trade-in escalation (global
`tradeInCount`), self-capture ban.

**New at N>2:**

- **Elimination:** when a seat's last territory falls, the eliminator
  takes their cards (canonical). If that pushes the eliminator's hand to
  6+, they must immediately trade in before continuing the attack phase.
  Eliminated seats are skipped in turn rotation.
- **Win condition:** last seat standing (equivalently, all 42 territories).
- **Resign:** rejected with 422 at N>2.

**publicView:** own hand visible; other seats expose card count only;
per-seat army/territory totals exposed for the rail/header.

## Section 4: Lobby & Game Creation UI

- Plugins with `max === 2`: flow unchanged (single-pick, auto-advance).
- Risk: after picking one opponent and Risk as the game, an
  "add more players?" step offers remaining users (up to 3 opponents
  total). Smallest diff to the existing modal flow.
- POST sends `opponentIds: [...]`.
- **Seat colors:** fixed palette by seat (0 red, 1 blue, 2 green,
  3 yellow). No picker, no contrast logic. Color ships in publicView per
  seat; client themes off it.
- **Lobby cards:** "vs Sonia, Bob, Pat" (seat order, you excluded);
  win/loss via `winnerSeat === yourSeat`; turn indicator unchanged
  (`activeUserId` drives it).
- **History/turn log:** seat → display-name via the participants list in
  the game payload; 2P "you/them" phrasing falls out of the same lookup.

## Section 5: Risk Client (`src/clients/risk/`)

- **themes.ts:** two-sided own/enemy theming becomes a 4-entry seat
  palette; territory fills, army badges, continent rail color by owner
  seat.
- **Board.tsx / map-geometry.js:** no geometry changes; only owner→color
  widens.
- **Header:** all seats in turn order with army/territory/card-count
  chips, current seat highlighted, eliminated seats grayed/struck. At 2P
  this collapses to the existing you/them header.
- **CombatReveal / combat-rules:** mechanically unchanged (combat is
  always exactly two seats); labels use seat name/color.
- **Card tray, action bar, deploy plan:** own-seat only; color sourcing
  only.
- **EndScreen:** winner by seat name + final standings by elimination
  order.
- **Elimination moment:** log entry + brief banner
  ("Bob has been eliminated — Pat takes 3 cards"). No new screens.

## Section 6: Testing & Error Handling

- **Server unit tests:** seat rotation with eliminations (skip dead
  seats), eliminator card-capture incl. forced trade at 6+, round-robin
  territory deal at 3/4 players, setup pool counts, resign rejected at
  N>2, win detection at last-seat-standing. Existing 2P Risk tests must
  pass unchanged — the 20-army 2P game is the regression canary.
- **Creation validation tests:** opponentIds bounds per plugin, duplicate
  participant-set rejection, bot userIds rejected for N>2.
- **Headless harness:** stays 2P (deferred with the AI layer). N-player
  server tests drive the plugin directly via `initialState`/`applyAction`.
- **Error posture:** creation/action validation fails loud with 4xx +
  message; no silent seat fallbacks.

## Out of Scope (deferred)

- AI personas in N>2 games (orchestrator, `ai_sessions` composite key,
  multi-bot wake-up, headless N-player harness).
- 5–6 player Risk (config-only after this lands: bump `max`, extend
  palette, canonical army counts 5 → 25, 6 → 20).
- Resign-to-neutral mechanic.
- N-player support in any other plugin.
