# E4-2 — Multi-bot AI client surface for N>2 games

**Date:** 2026-06-20
**Epic:** E4 — N-Player AI Platform
**Story:** E4-2 (5 pts)
**Author:** Architect (design mode)

## Problem

E4-1 shipped the N-player AI platform **server-side**: seat-indexed `ai_sessions`,
one bot user per persona, multi-bot orchestrator drive loop, `winner_seats`.

The Risk **client** never caught up:

- `src/clients/risk/RiskApp.tsx` gates the entire bot UI behind `nPlayers === 2 &&`.
  In a 4P game with 3 bots, the bots' `banter` / `bot_thinking` / `bot_stalled`
  SSE events fire but nothing renders — bot personalities are invisible.
- The opponent-card `/ai/retry` and `/chat` POSTs send **no body**, so
  `resolveBotUserId(sessions, req.body)` (`src/server/routes.js:424`) returns
  `null` for any game with >1 session → **HTTP 400**. A stalled bot can't be
  retried and you can't talk to a bot.

## Goal

Render a per-seat AI roster/status surface for N>2 — persona portrait, banter,
thinking indicator, stalled badge — and wire retry + chat to target the correct
`botUserId`. Chat **broadcasts** to every bot.

## Non-goals (scope boundaries)

- **Not E4-3** (`side: a|b` SSE coercion). We route bot events by `personaId`,
  which is present in every `banter`/`bot_thinking`/`bot_stalled` payload and is
  unique per bot (E4-1 = one bot user per persona). We deliberately **ignore the
  `side` field** for identity. → E4-2 ships independent of E4-3.
- **Not E4-4** (arbitrary persona overlay). We attach a *correct* per-seat
  `personaId` to the roster by joining `ai_sessions` on `userId`. We leave the
  legacy singular `opponentPersonaId` overlay (`plugin-clients.js:57-60`,
  arbitrary `LIMIT 1` session pick) untouched — that fix is E4-4. No double-fix.

## Established facts (with refs)

| Fact | Location |
|------|----------|
| Bot UI gated at exactly 2 players | `src/clients/risk/RiskApp.tsx:163` |
| Single-opponent `ctx.opponent*` fields drive the 2P card | `RiskApp.tsx:163-177` |
| `OpponentBanter` is a singleton: one `EventSource`, one bubble, one stall | `src/clients/shared/OpponentBanter.tsx` |
| retry/chat POSTs send no `botUserId` | `OpponentBanter.tsx` `onRetry`/`onChatSubmit` |
| `resolveBotUserId` → `null` (400) when >1 session and no `body.botUserId` | `src/server/routes.js:424-427` |
| `/ai/retry` & `/chat` already accept `body.botUserId` (E4-1) | `routes.js:355-392` |
| `/ai/abandon` is game-level, needs no bot id | `routes.js:394-401` |
| Bot SSE events carry `personaId` + `displayName`, **not** `botUserId`, plus broken `side: a|b` | `src/server/ai/orchestrator.js:166,238,311,431` |
| Bootstrap knows `is_bot` but **strips** it and never sets per-seat `personaId` | `src/server/plugin-clients.js:51,73` |
| `ctx.players` = `{userId, seat, friendlyName, color, glyph}[]` | `src/clients/shared/useGameState.ts` |
| A bot's `userId` **is** its `botUserId` | E4-1 design (one bot user per persona) |

## Design

### 1. Server — enrich the bootstrap roster (one edit)

`src/server/plugin-clients.js` `serveIndex()`:

- When `ai` is enabled, build a `botUserId → personaId` map from the game's
  `ai_sessions` (`SELECT bot_user_id, persona_id FROM ai_sessions WHERE game_id = ?`).
- Each `players[]` entry gains:
  - `personaId: string | null` — from the session map, `null` for humans.
  - `isBot: boolean` — un-strip the existing `is_bot` (rename camelCase).
- Legacy `opponent*` fields stay **exactly** as they are (2P back-compat; E4-4
  owns the overlay).

This single enrichment is the bridge the client lacks: it tells the client which
seats are bots, which portrait each uses, and the `botUserId` to POST — all keyed
to the same `personaId` the SSE events already carry.

`src/clients/shared/useGameState.ts` — extend `GameCtx.players[]` type with
`personaId: string | null` and `isBot: boolean`.

### 2. Client — unify on a roster (approved: option A)

Retire the `nPlayers === 2 &&` special case. One component handles 1..N bots; at
N=2 it renders exactly one card — behaviorally identical to today.

**New shared component `AiRoster`** (`src/clients/shared/AiRoster.tsx`) — game-agnostic:

```
interface BotSeat {
  seat: number;
  userId: number;       // == botUserId
  personaId: string;
  friendlyName: string;
  color?: string | null;
  glyph?: string | null;
}
interface AiRosterProps {
  bots: BotSeat[];
  gameId: number;
  userId: number;
  sseUrl: string;
}
```

Responsibilities:
- Open **one** `EventSource(sseUrl)`.
- Maintain `Map<personaId, { bubble, stall }>`; dispatch each
  `banter`/`bot_thinking`/`bot_stalled` to the entry matching the event's
  `personaId`. Unknown personaId → ignore.
- Listen `user_chat` for the single shared "your message" flash (filter
  `data.userId === userId`), and `update` to clear stale "thinking" bubbles.
- Render one `BotCard` per `bots[]` entry.
- Shared chat input → **broadcast**: on submit, `POST /chat {text, botUserId}`
  once per bot. Single shared flash.
- One **game-level** Abandon control, shown when any bot is stalled →
  `POST /ai/abandon` (no body), then reload (as today).

**`BotCard`** — presentational, reuses the existing `opp-card` markup/CSS
(portrait by `personaId`, name, color). Shows its own bubble, thinking dots, and
stall badge with a per-bot **Retry** → `POST /ai/retry {botUserId: userId}`.

**Caller wiring (`RiskApp.tsx`):** replace the gated block with a computed
`bots` array from `ctx.players.filter(p => p.isBot)`, resolving color per seat
with Risk's own `seatHex(seat)` for N>2 (else `ctx.opponentColor`). This keeps
`seatHex` (a Risk theme detail) out of the shared component. Render
`<AiRoster bots={bots} gameId={ctx.gameId} userId={ctx.userId} sseUrl={ctx.sseUrl} />`.

**2P no-regression fallback:** if a bot seat arrives without `personaId` (legacy
game booted before the server change), fall back to `ctx.opponentPersonaId` for
the single opponent so the shipped 2P experience never goes dark.

**Refactor:** the SSE/state logic currently inside `OpponentBanter` moves up into
`AiRoster`'s manager; `BotCard` becomes the presentational shell (reusing
`OpponentCard`'s portrait). `OpponentBanter`/`OpponentCard` are collapsed into the
new structure rather than left as dead parallel paths.

### Data flow

```
bot turn → orchestrator broadcasts {type, personaId, displayName, text|reason}
  → AiRoster onEvent: Map[personaId].{bubble|stall} = …
    → BotCard[personaId] re-renders

Retry  : BotCard.onRetry → POST /api/games/:id/ai/retry  {botUserId: userId}
Chat   : AiRoster.onSubmit → for bot of bots: POST /chat {text, botUserId}
Abandon: AiRoster.onAbandon → POST /api/games/:id/ai/abandon  (no body)
```

### Error handling

- retry/chat/abandon failures: surface via `alert`/flash, as today.
- Portrait 404 (persona has no asset): existing `<img onError>` removes the img,
  glyph fallback remains.
- SSE event with a `personaId` not in `bots`: ignored (no card to route to).

## Testing (spdd)

**Server (vitest, node):**
- `serveIndex` ctx for a 4P game with 3 bots → `players` has 3 entries with
  `personaId` set and `isBot: true`, and the human with `personaId: null`,
  `isBot: false`.
- 2P game → bot seat carries `personaId`; legacy `opponentPersonaId` still present.

**Client (vitest + React Testing Library):**
- `AiRoster` renders one `BotCard` per bot seat (3 cards for a 4P/3-bot game).
- A `banter` event for persona X updates **only** card X's bubble.
- A `bot_stalled` event for persona X shows the stall badge + Retry on card X only.
- Retry click → `fetch('/api/games/:id/ai/retry', {botUserId: X.userId})`.
- Chat submit → `fetch('/api/games/:id/chat', …)` called once per bot, each with
  its `botUserId`.
- N=2 still renders a single card (unify regression guard).

## Files touched

- `src/server/plugin-clients.js` — roster enrichment (personaId + isBot).
- `src/clients/shared/useGameState.ts` — `GameCtx.players[]` type.
- `src/clients/shared/AiRoster.tsx` — **new**; subsumes `OpponentBanter` SSE/state.
- `src/clients/shared/OpponentCard.tsx` / `OpponentBanter.tsx` — refactor into
  `BotCard` + roster manager (no dead parallel paths).
- `src/clients/risk/RiskApp.tsx` — swap the `nPlayers === 2` block for `<AiRoster>`.
- Tests (server + client).

## Build note

The client ships as a committed vite bundle (`plugins/risk/client/app.js` +
`app.js.map`). After source changes, **rebuild and commit the bundle**:

```
GAMEBOX_PLUGIN=risk npx vite build --config vite.config.client.js
```

(or `npm run dev:client` for watch mode during development). A change that edits
`.tsx` source without regenerating `app.js` will not affect the running game.

## Open risk

Unify touches the just-shipped 2P path. Mitigated by the `personaId →
opponentPersonaId` fallback and the explicit N=2 regression test.
