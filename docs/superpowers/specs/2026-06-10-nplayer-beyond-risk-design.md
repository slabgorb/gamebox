# N-Player Beyond Risk — Design

**Date:** 2026-06-10
**Status:** Approved
**Approach:** Platform-first, games in waves (Approach A)
**Builds on:** `2026-06-07-risk-4p-multiplayer-design.md` (seat-indexed platform)

## Problem

The seat-indexed N-player platform shipped 2026-06-07 for Risk: a
`participants` table, `winner_seat`/`is_draw`, `turn_log.seat`, plugin
`players: {min, max}`, and `POST /api/games` with `opponentIds[]`. Risk is
N-player; the other six plugins stay 2P with a two-line participants adapter.

The playgroup wants 4-player versions of more games, and — unlike the June 7
Risk effort — they want **AI opponents at N>2**, including bot partners in the
partnership games. The two blockers are (1) AI orchestration is hardcoded to
one bot per game, and (2) three target plugins (`sorry`, `cribbage`, `buraco`)
still carry `sides: {a, b}` 2-player state shapes.

## Decisions

- **Games this epic:** Sorry! (2–4, free-for-all), Cribbage (2 or 4,
  partnership), Buraco (2 or 4, partnership). Words is deferred (config-level
  follow-on). No 3-player cribbage/buraco — those jump heads-up → 2v2 so team
  logic has exactly one shape.
- **Teams:** modeled inside plugin state by seat parity (seats 0&2 vs 1&3).
  The platform's only team-related change is `winner_seat` → `winner_seats`
  (JSON int array). No first-class `teams` table (YAGNI for two card games).
- **Partner selection:** the creator's partner is the 2nd opponent invited
  (seat 2, opposite). The lobby shows "Your partner: X" as a hint during the
  pick. No new picker UI.
- **AI at N>2:** supported, including bot partners. Bots become real roster
  entries (one bot user per persona). The June 7 "no bots when N>2" rejection
  is deleted.
- **Bot identity:** each persona is its own bot user; rosters can mix humans
  and named AI personas (e.g. "you + Sonia + Hattie + the-shark"). Each bot
  seat gets its own persona/portrait/style.
- **Migration:** none. Wholesale drop/recreate as on June 7; in-flight games
  are discardable.
- **Resign at N>2:** rejected with 422 everywhere (same posture as Risk).

## Epic Structure

Numbered epic **E4**, kanban (numeric prefix avoids the hyphenated-epic-id pf
bug). One story per coherent slice:

- **E4-1** — N-player AI platform (keystone). Acceptance: 4P Risk vs a
  human/bot mix plays end-to-end.
- **E4-2** — Sorry! 2–4P (free-for-all; exercises multi-bot without teams).
- **E4-3** — Cribbage 2/4P partnership.
- **E4-4** — Buraco 2/4P duplas (largest; confirm/close the `meld-value.js`
  stub during planning).

**E4-1 blocks E4-2/3/4.** E4-2, E4-3, E4-4 are independent of each other once
E4-1 lands.

## Section 1: Platform & AI (Wave 1 / E4-1)

**Bots become roster entries.** At boot, `ensureBotUsers()` creates one bot
user per persona in the catalog (14 today), `ai+{personaId}@bot.local`, with
friendly name / color / glyph from the persona YAML. `/api/users` returns each
flagged `isBot` with its `personaId`, filtered by the persona's `games` list.

- The lobby's existing opponent / add-players steps render an "AI players"
  group alongside humans. `opponentIds` is unchanged — picking "Hattie" *is*
  picking the persona, so the separate persona-picker step is removed.
- Portraits keep working: they are keyed by persona id
  (`/shared/portraits/{personaId}.png`), which is now the bot user's persona.

**`ai_sessions` goes composite.** Primary key `game_id` → `(game_id,
bot_user_id)`. One session row per bot seat, each with its own
`claude_session_id`, stall state, `pending_sequence`, `resume_count`, and
`pending_user_messages`.

**Multi-bot wake-up.** The orchestrator's single-bot gate generalizes to a
per-session loop. After any action (and on game creation), iterate the game's
sessions and wake each bot whose gate passes:

- explicit turn: `state.activeUserId === session.botUserId`, or
- concurrent phase (`activeUserId == null`) with that bot's slot unfilled —
  cribbage discard (`pendingDiscards[idx] == null`), cribbage show
  (`acknowledged[idx] === false`), backgammon initial-roll (unchanged, 2P).

The turn-continuation contract is unchanged **per bot**: one wake-up drives
that bot's entire turn. New case: a bot's turn ends by handing to *another*
bot — the action path re-runs the wake check after each bot action so bots
chain without a human poke. A per-game in-flight lock serializes sequential
bot turns; concurrent phases are exempt (they already re-read freshest state
inside the write transaction before applying, so simultaneous submissions both
land).

**`winner_seat` → `winner_seats`** (JSON int array; `[2]` solo, `[1,3]` team).
`is_draw` unchanged. Plugins return `winnerSeats` (or `winnerSeat`/`winnerSide`
for unconverted callers during transition); the platform normalizes to the
array. Lobby win check becomes `winnerSeats.includes(you)`.

**Migration:** wholesale drop/recreate, same as June 7. Only game currently in
the DB is a fresh setup-phase 2P Risk — discardable.

**Proof of wave:** delete the `totalPlayers > 2` bot rejection in
`routes.js`. 4P Risk with a human/bot mix is the acceptance test. The headless
harness generalizes to N seats here so multi-bot games are driveable end-to-end.

## Section 2: Sorry! 2–4P (Wave 2 / E4-2)

**State: side-dicts → seat arrays.**

```js
{
  seats: [userId, ...],          // 2..4, replaces sides {a,b}
  colors: [color, ...],          // by seat (fixed palette, no picker)
  pawns: [[4 pawns], ...],       // by seat; pawn { id, zone, index }
  currentPlayer: seatIdx,        // replaces 'a'|'b'
  deck, discard, drawnCard,
  winner: null,                  // → winnerSeats: [seat] on win
  activeUserId,
}
```

The `opponent(side)` helper in `actions.js` is removed; "the other player"
becomes "every other seat." Bumps, slides, and Sorry!-card targeting already
operate on *any* victim pawn — the code just stops assuming one opponent.

**Geometry is already 4-seat.** `geometry.js` carries all four edges (slides,
mouths, diamonds). Rename edge keys to seat indexes 0–3 with a fixed
seat→edge map (seat 0 bottom, clockwise). At 2P, seats take opposite edges
(0 and 2) so 2P boards look unchanged.

**Colors:** fixed palette by seat-edge (the four canonical board colors), no
picker — same call as Risk. High-contrast pawn outline ships per seat already.

**Rules at 3–4P:** mechanics unchanged, free-for-all. Shared deck; turn order
= seat order; first player home with all 4 pawns wins (`winnerSeats: [seat]`).
Self-capture stays forbidden; bumping any opponent stays legal. Forced-move
banter-only turns work per seat. No elimination — all seats play to the end.

**Client:** board already draws four edges; widen owner→color from 2 to N, add
the Risk-style roster strip (current seat highlighted), end screen names the
winner. Bot seats show persona portraits.

**Resign at N>2:** 422 (no sane mid-game pawn redistribution).

## Section 3: Cribbage 2/4P Partnership (Wave 3 / E4-3)

**Teams by seat parity.** Seats 0&2 vs 1&3 (partner opposite = 2nd invite).
`scores: [0, 0]` is already a 2-length array → becomes **team** scores with
`team = seat % 2`; at 2P seat = team, so the 121 target and both peg tracks
survive unchanged.

**Deal by count (canonical four-hand cribbage):**

- 2P: 6 cards each, discard 2 each to crib (unchanged).
- 4P: 5 cards each, **discard exactly 1 each** — crib is always 4 cards.
  `hands` and `pendingDiscards` become length-N arrays; discard stays
  concurrent (`activeUserId = null`), all four submitting independently — the
  exact shape the multi-bot gate handles.
- Dealer is a seat index, rotates clockwise per deal; his-heels credits the
  dealer's team.

**Pegging:** rotation is seat order from left of dealer; four hands in the
count. "Go" generalizes from "other player" to "next seat still holding cards
under 31." Pegging points credit the pegger's team.

**Show:** canonical order — left of dealer around the circle, dealer last,
crib last; each hand credits its team. `acknowledged` becomes length-N
(concurrent, same orchestrator pattern as discard).

**Win:** first team to 121 mid-count ends instantly (already how 2P works);
`winnerSeats` = both partner seats.

**Client:** four hand positions (partner across, opponents on the sides),
team-colored peg tracks, roster strip with portraits, "your team / their team"
labels replacing you/them. Own hand only until show.

**Resign at 4P:** 422.

## Section 4: Buraco 2/4P Duplas (Wave 4 / E4-4)

**Teams by seat parity** — *duplas*, partners opposite. Buraco Brasileiro
conventions throughout (Sonia's game; pt-BR terms where they add flavor —
*dupla*, *morto*, *batida*, *buraco limpo/sujo*).

**State splits per-seat vs per-team:**

- Per **seat**: `hands` (11 cards each; 4P deals 44 from the double deck),
  `currentTurn` = seat index, draw→meld→discard turn shape unchanged, rotation
  in seat order.
- Per **team**: `melds` (partners build the same *jogos* — the heart of duplas
  play), `mortos`, `mortoTaken`, `scores {total, deals[]}`. All become
  2-length arrays keyed `team = seat % 2`; at 2P seat = team, so existing
  shapes and scoring flow map over unchanged.

**Morto, per team:** first player on a team to empty their hand takes the
team's morto (once). Existing empty-by-discard vs empty-by-meld behavior
carries over, attributed to the team. One morto per dupla, two total.

**Batida:** going out requires the team has taken its morto and holds at least
one buraco (`isBuracoLimpo`/`isBuracoSujo` applied to team melds). Deal
scoring: both partners' remaining hand cards count against the team; existing
deal-score machinery re-keyed by team. Match win at the existing target →
`winnerSeats` = the dupla.

**Open item:** `scoring/meld-value.js` appears to be an empty stub. Confirm
during E4-4 planning whether deal scoring has a real gap; if so, scope the fix
into the story rather than discovering it mid-implementation.

**Client:** partner across, own hand only, team meld areas visible to all,
roster strip with portraits.

**Resign at 4P:** 422.

## Section 5: Testing & Error Handling

**Regression canary (all waves):** every existing 2P test for Risk, Sorry!,
cribbage, and buraco must pass **unchanged**. The 2P-collapses-to-N invariant
(seat = team, opposite edges, 6-card 2P crib deal) is what makes that
possible — if a 2P test has to change, the generalization is wrong.

**Server unit tests per wave:**

- E4-1: composite `ai_sessions` keying; multi-bot wake-up chaining two+ bots
  without a human poke; concurrent-phase bots (4 discards, 4 acks) landing
  without clobber; the in-flight lock; `winner_seats` array round-trip and
  membership.
- E4-2: seat rotation at 3/4P, bump/slide targeting any seat, win at all-home,
  resign 422 at N>2.
- E4-3: 5-card/1-discard 4P deal, team-score attribution (pegging, his-heels,
  show, crib), dealer rotation, show order, win at 121 mid-count.
- E4-4: morto-per-dupla, batida gating on team buraco, team deal scoring,
  rotation, win at target.

**Creation validation tests:** `opponentIds` bounds per plugin; bot personas
**allowed** at N>2 now (the inverse of June 7's rejection test); duplicate
participant-set rejection; partner-hint seat ordering.

**Headless harness:** generalizes to N seats in E4-1 so multi-bot games are
driveable; Sorry!/cribbage/buraco N-player server tests drive plugins directly
via `initialState`/`applyAction`.

**Error posture:** creation/action validation fails loud with 4xx + message;
no silent seat fallbacks; resign at N>2 = 422 everywhere.

## Out of Scope (deferred)

- Words 4P (config-level follow-on: seat arrays + roster UI).
- 5–6 player anything (config-only after seats generalize).
- 3-player cribbage (cutthroat) and 3-player buraco (non-standard).
- Partner reassignment / seat backfill on mid-game abandonment.
- First-class platform `teams` table.
