# E4-2 Multi-bot AI Client Surface (N>2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render a per-seat AI roster (persona portrait, banter, thinking, stall+retry) for Risk games with more than two players, and wire retry/chat to target the correct bot.

**Architecture:** Add per-seat `personaId`/`isBot` to the server bootstrap roster (`window.__GAME__`), then unify the client on one `<AiRoster>` component that owns a single `EventSource`, routes `banter`/`bot_thinking`/`bot_stalled` events by `personaId`, and renders one `<BotCard>` per bot seat. Retry posts the bot's `botUserId`; chat broadcasts one POST per bot. The 2-player case collapses to a single card — the old `nPlayers === 2` special-case is retired.

**Tech Stack:** Node.js + Express + better-sqlite3 (server), React 19 + TypeScript built by Vite (client). Server tests: `node:test`. Client tests: Vitest + React Testing Library + jsdom.

## Global Constraints

- Bot events are routed **only by `personaId`** — never by the `side` field (that `a|b` field is broken for N>2; fixing it is the separate story E4-3). Copied from spec.
- The legacy singular `opponentPersonaId` overlay in `plugin-clients.js` (the arbitrary `LIMIT 1` session pick) is **not touched** — that is the separate story E4-4.
- A bot user's `userId` **is** its `botUserId`. There is one bot user per persona per game.
- Chat is **broadcast**: one shared input → one `POST /chat` per bot.
- Abandon is **game-level**: a single control, not per-card; `POST /ai/abandon` takes no body.
- The client ships as a committed Vite bundle. Any `.tsx` change is inert until `npm run build:client` regenerates `plugins/risk/client/app.js` + `app.js.map`, which must be committed.
- Server tests run with `npm test` (`node --test 'test/**/*.test.js'`). Client tests run with `npm run test:client` (`vitest run`).

---

## File Structure

- `src/server/plugin-clients.js` — **modify** `serveIndex()`: attach `personaId` + `isBot` per player.
- `src/clients/shared/useGameState.ts` — **modify** `GameCtx.players[]` type.
- `src/clients/shared/BotCard.tsx` — **create**: presentational bot card (portrait + bubble + stall+retry). Reuses `OpponentCard` as the portrait shell.
- `src/clients/shared/AiRoster.tsx` — **create**: SSE manager + per-persona state + chat broadcast + abandon. Subsumes the SSE logic from `OpponentBanter`.
- `src/clients/shared/OpponentBanter.tsx` — **delete**: logic absorbed into `AiRoster`.
- `src/clients/risk/RiskApp.tsx` — **modify**: build the `bots` array from `ctx.players`, render `<AiRoster>`, drop the `nPlayers === 2` block and the `OpponentBanter` import.
- `src/clients/shared/OpponentCard.css` — **modify**: add a `.ai-roster` flex wrapper.
- `test/risk-multibot-client-ctx.test.js` — **create**: server ctx roster test.
- `test/client/BotCard.test.tsx` — **create**: BotCard unit test.
- `test/client/AiRoster.test.tsx` — **create**: roster routing/retry/chat test.
- `test/client/risk-app-opponent-card.test.tsx` — **modify**: assert the unified roster (2P still renders one card).

`OpponentCard.tsx` is **kept** as-is (the portrait shell) and `test/client/OpponentCard.test.tsx` is unaffected.

---

### Task 1: Server — per-seat `personaId` + `isBot` in the bootstrap roster

**Files:**
- Modify: `src/server/plugin-clients.js:44-78`
- Modify: `src/clients/shared/useGameState.ts:18` (the `players` field type)
- Test: `test/risk-multibot-client-ctx.test.js`

**Interfaces:**
- Produces: each `window.__GAME__.players[]` entry gains `personaId: string | null` and `isBot: boolean`. A bot's existing `userId` is its `botUserId`. Humans get `personaId: null`, `isBot: false`.

- [ ] **Step 1: Write the failing test**

Create `test/risk-multibot-client-ctx.test.js`. This mirrors `test/cribbage-ai-client-ctx.test.js` but boots three personas and creates a 4-player Risk game (human + 3 bots).

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'node:http';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDb } from '../src/server/db.js';
import { mountRoutes } from '../src/server/routes.js';
import { mountPluginClients } from '../src/server/plugin-clients.js';
import { buildRegistry } from '../src/server/plugins.js';
import riskPlugin from '../plugins/risk/plugin.js';
import { bootAiSubsystem } from '../src/server/ai/index.js';

async function GET(port, path) {
  const r = await fetch(`http://localhost:${port}${path}`);
  return { status: r.status, text: await r.text() };
}
async function POST(port, path, body) {
  const r = await fetch(`http://localhost:${port}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() };
}

function writePersona(dir, id) {
  writeFileSync(join(dir, `${id}.yaml`),
    `id: ${id}\ndisplayName: ${id}\ncolor: "#a00"\nglyph: "x"\nsystemPrompt: hi\n`);
}

test('plugin-clients: N>2 roster carries personaId + isBot per seat', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mbctx-'));
  const personaDir = join(dir, 'personas');
  mkdirSync(personaDir);
  for (const id of ['hattie', 'the-shark', 'professor-doofi']) writePersona(personaDir, id);
  const db = openDb(join(dir, 'db.db'));

  const humanId = db.prepare(
    "INSERT INTO users (email, friendly_name, color, created_at) VALUES ('h@x','H','#000',?) RETURNING id",
  ).get(Date.now()).id;

  const { orchestrator, personas } = bootAiSubsystem({
    db, sse: { broadcast: () => {} },
    llm: { send: async () => ({ text: '{}' }) },
    personaDir,
  });
  const bots = db.prepare("SELECT id, persona_id FROM users WHERE is_bot=1 ORDER BY id").all();
  assert.equal(bots.length, 3, 'three bot users created from personaDir');

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: humanId, friendlyName: 'H' }; req.authEmail = 'h@x'; next(); });
  const registry = buildRegistry({ risk: riskPlugin });
  mountRoutes(app, { db, registry, sse: { broadcast: () => {} }, ai: { orchestrator, personas } });
  mountPluginClients(app, { db, registry, ai: { orchestrator, personas } });

  const srv = http.createServer(app);
  await new Promise(r => srv.listen(0, r));
  const port = srv.address().port;
  try {
    const create = await POST(port, '/api/games', {
      opponentIds: bots.map(b => b.id), gameType: 'risk',
    });
    assert.equal(create.status, 200, `game created: ${JSON.stringify(create.body)}`);
    const html = (await GET(port, `/play/risk/${create.body.id}/`)).text;
    const m = html.match(/window\.__GAME__\s*=\s*(\{[^<]*\})/);
    assert.ok(m, 'ctx is injected');
    const ctx = JSON.parse(m[1]);

    assert.equal(ctx.players.length, 4, 'four seats');
    const human = ctx.players.find(p => p.userId === humanId);
    assert.equal(human.isBot, false, 'human isBot false');
    assert.equal(human.personaId, null, 'human personaId null');

    const botSeats = ctx.players.filter(p => p.isBot);
    assert.equal(botSeats.length, 3, 'three bot seats');
    for (const p of botSeats) {
      assert.equal(typeof p.personaId, 'string', `bot seat ${p.seat} has personaId`);
      assert.ok(p.personaId.length > 0);
    }
    // personaId on each bot seat matches that bot user's persona_id
    const byUser = new Map(bots.map(b => [b.id, b.persona_id]));
    for (const p of botSeats) assert.equal(p.personaId, byUser.get(p.userId));
  } finally {
    srv.close();
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/risk-multibot-client-ctx.test.js`
Expected: FAIL — `ctx.players[].isBot` is `undefined` and `personaId` is absent (the roster strips `is_bot` and never sets `personaId`).

- [ ] **Step 3: Implement the roster enrichment**

In `src/server/plugin-clients.js`, edit `serveIndex()`. Replace the `players` build and the `ctx.players` assignment so each entry carries `personaId` + `isBot`.

Change the `players` mapping (currently `src/server/plugin-clients.js:44-53`) to look up the per-game session personas first:

```js
  const userRow = db.prepare('SELECT id, friendly_name, color, glyph, is_bot FROM users WHERE id = ?');
  // botUserId -> personaId for this game (one bot user per persona).
  const sessionPersona = new Map(
    db.prepare('SELECT bot_user_id, persona_id FROM ai_sessions WHERE game_id = ?')
      .all(req.game.id)
      .map(r => [r.bot_user_id, r.persona_id]),
  );
  const players = req.game.participants.map(p => {
    const u = userRow.get(p.userId);
    const isBot = u?.is_bot === 1;
    return {
      userId: p.userId, seat: p.seat,
      friendlyName: u?.friendly_name ?? `Player ${p.seat + 1}`,
      color: u?.color ?? null, glyph: u?.glyph ?? null,
      isBot,
      personaId: isBot ? (sessionPersona.get(p.userId) ?? null) : null,
    };
  });
```

Then change the `ctx.players` line (currently `src/server/plugin-clients.js:73`) — stop stripping fields; send the enriched roster as-is:

```js
    players,
```

Leave the legacy `opponent*` fields (`opponentFriendlyName`/`opponentGlyph`/`opponentColor`/`opponentPersonaId`) exactly as they are.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/risk-multibot-client-ctx.test.js`
Expected: PASS.

- [ ] **Step 5: Update the client `GameCtx` type**

In `src/clients/shared/useGameState.ts`, update the `players` field of `GameCtx` (currently line 18):

```ts
  // Full roster in seat order (multiplayer games).
  players?: {
    userId: number;
    seat: number;
    friendlyName: string;
    color: string | null;
    glyph: string | null;
    personaId: string | null;
    isBot: boolean;
  }[];
```

- [ ] **Step 6: Run the full server suite + typecheck-by-build sanity**

Run: `npm test`
Expected: PASS (the existing `cribbage-ai-client-ctx` test still passes — the legacy `opponent*` fields are untouched).

- [ ] **Step 7: Commit**

```bash
git add src/server/plugin-clients.js src/clients/shared/useGameState.ts test/risk-multibot-client-ctx.test.js
git commit -m "feat(e4-2): bootstrap roster carries per-seat personaId + isBot"
```

---

### Task 2: Client — `BotCard` presentational component

**Files:**
- Create: `src/clients/shared/BotCard.tsx`
- Modify: `src/clients/shared/OpponentCard.css` (add `.ai-roster` wrapper)
- Test: `test/client/BotCard.test.tsx`

**Interfaces:**
- Consumes: `OpponentCard` from `./OpponentCard` (portrait shell, already exists).
- Produces:
  ```ts
  interface BotBubble { text: string; thinking: boolean }
  interface BotStall { reason: string }
  interface BotCardProps {
    personaId: string;
    friendlyName: string;
    color?: string | null;
    glyph?: string | null;
    bubble: BotBubble | null;
    stall: BotStall | null;
    onRetry: () => void;
  }
  export function BotCard(props: BotCardProps): JSX.Element
  ```

- [ ] **Step 1: Write the failing test**

Create `test/client/BotCard.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BotCard } from "../../src/clients/shared/BotCard";

describe("BotCard", () => {
  it("renders the persona portrait and name", () => {
    const { container } = render(
      <BotCard
        personaId="hattie" friendlyName="Hattie" color="#a00" glyph="x"
        bubble={null} stall={null} onRetry={vi.fn()}
      />,
    );
    const card = container.querySelector(".opp-card");
    expect(card).not.toBeNull();
    expect(card!.querySelector(".opp-card__name")!.textContent).toBe("Hattie");
    const img = card!.querySelector("img.opp-card__img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/shared/portraits/hattie.png");
  });

  it("shows a banter bubble when bubble is set", () => {
    render(
      <BotCard
        personaId="hattie" friendlyName="Hattie"
        bubble={{ text: "ha!", thinking: false }} stall={null} onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("ha!")).toBeInTheDocument();
  });

  it("shows a stall badge with Retry and fires onRetry", async () => {
    const onRetry = vi.fn();
    render(
      <BotCard
        personaId="hattie" friendlyName="Hattie"
        bubble={null} stall={{ reason: "invalid_response" }} onRetry={onRetry}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:client -- BotCard`
Expected: FAIL — cannot resolve `../../src/clients/shared/BotCard`.

- [ ] **Step 3: Implement `BotCard`**

Create `src/clients/shared/BotCard.tsx`:

```tsx
import { OpponentCard } from "./OpponentCard";

export interface BotBubble {
  text: string;
  thinking: boolean;
}
export interface BotStall {
  reason: string;
}
export interface BotCardProps {
  personaId: string;
  friendlyName: string;
  color?: string | null;
  glyph?: string | null;
  bubble: BotBubble | null;
  stall: BotStall | null;
  onRetry: () => void;
}

export function BotCard({
  personaId,
  friendlyName,
  color,
  glyph,
  bubble,
  stall,
  onRetry,
}: BotCardProps) {
  return (
    <OpponentCard
      personaId={personaId}
      friendlyName={friendlyName}
      color={color}
      glyph={glyph}
    >
      {bubble && (
        <div className="opp-card__bubble">
          {bubble.text}
          {bubble.thinking && (
            <span className="opp-card__dots">
              <span />
              <span />
              <span />
            </span>
          )}
        </div>
      )}
      {stall && (
        <div className="opp-card__stall">
          <span>
            {friendlyName} froze up ({stall.reason}).
          </span>
          <div className="opp-card__stall-actions">
            <button type="button" className="opp-card__retry" onClick={onRetry}>
              Retry
            </button>
          </div>
        </div>
      )}
    </OpponentCard>
  );
}
```

- [ ] **Step 4: Add the roster wrapper CSS**

Append to `src/clients/shared/OpponentCard.css`:

```css
.ai-roster {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:client -- BotCard`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/clients/shared/BotCard.tsx src/clients/shared/OpponentCard.css test/client/BotCard.test.tsx
git commit -m "feat(e4-2): BotCard presentational component"
```

---

### Task 3: Client — `AiRoster` (SSE routing, retry, chat broadcast, abandon)

**Files:**
- Create: `src/clients/shared/AiRoster.tsx`
- Test: `test/client/AiRoster.test.tsx`

**Interfaces:**
- Consumes: `BotCard` and its `BotBubble`/`BotStall` types from `./BotCard`. The `FakeEventSource` test stub via `__lastEventSource` from `test/client/setup.ts`.
- Produces:
  ```ts
  export interface BotSeat {
    seat: number;
    userId: number;       // == botUserId
    personaId: string;
    friendlyName: string;
    color?: string | null;
    glyph?: string | null;
  }
  export interface AiRosterProps {
    bots: BotSeat[];
    gameId: number;
    userId: number;
    sseUrl: string;
  }
  export function AiRoster(props: AiRosterProps): JSX.Element | null
  ```

- [ ] **Step 1: Write the failing test**

Create `test/client/AiRoster.test.tsx`. The SSE stub from `setup.ts` exposes the live `EventSource` via `__lastEventSource.get()` and dispatches typed events through `_emit(type, data)`.

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiRoster, type BotSeat } from "../../src/clients/shared/AiRoster";
import { __lastEventSource } from "./setup";

const bots: BotSeat[] = [
  { seat: 1, userId: 11, personaId: "hattie", friendlyName: "Hattie", color: "#a00" },
  { seat: 2, userId: 12, personaId: "the-shark", friendlyName: "Shark", color: "#0a0" },
  { seat: 3, userId: 13, personaId: "doofi", friendlyName: "Doofi", color: "#00a" },
];

function emit(type: string, data: unknown) {
  __lastEventSource.get()!._emit(type, data);
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AiRoster", () => {
  it("renders one card per bot seat", () => {
    const { container } = render(
      <AiRoster bots={bots} gameId={7} userId={1} sseUrl="/api/games/7/events" />,
    );
    expect(container.querySelectorAll(".opp-card").length).toBe(3);
  });

  it("routes a banter event to the matching persona's card only", async () => {
    render(<AiRoster bots={bots} gameId={7} userId={1} sseUrl="/api/games/7/events" />);
    emit("banter", { personaId: "the-shark", displayName: "Shark", text: "boom" });
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    // Only one bubble in the DOM.
    expect(document.querySelectorAll(".opp-card__bubble").length).toBe(1);
  });

  it("shows a stall badge for the stalled bot and retries with its botUserId", async () => {
    render(<AiRoster bots={bots} gameId={7} userId={1} sseUrl="/api/games/7/events" />);
    emit("bot_stalled", { personaId: "doofi", displayName: "Doofi", reason: "invalid_response" });
    const retry = await screen.findByRole("button", { name: /retry/i });
    await userEvent.click(retry);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/games/7/ai/retry",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ botUserId: 13 }),
      }),
    );
  });

  it("broadcasts a chat message to every bot", async () => {
    render(<AiRoster bots={bots} gameId={7} userId={1} sseUrl="/api/games/7/events" />);
    const input = screen.getByPlaceholderText(/talk smack/i);
    await userEvent.type(input, "hello bots{enter}");
    await waitFor(() => {
      const chatCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/games/7/chat");
      expect(chatCalls.length).toBe(3);
    });
    const sentBotIds = fetchMock.mock.calls
      .filter((c) => c[0] === "/api/games/7/chat")
      .map((c) => JSON.parse((c[1] as RequestInit).body as string).botUserId)
      .sort((a, b) => a - b);
    expect(sentBotIds).toEqual([11, 12, 13]);
  });

  it("renders nothing when there are no bots", () => {
    const { container } = render(
      <AiRoster bots={[]} gameId={7} userId={1} sseUrl="/api/games/7/events" />,
    );
    expect(container.querySelector(".ai-roster")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:client -- AiRoster`
Expected: FAIL — cannot resolve `../../src/clients/shared/AiRoster`.

- [ ] **Step 3: Implement `AiRoster`**

Create `src/clients/shared/AiRoster.tsx`. One `EventSource`; per-persona bubble/stall in a `Map`; banter auto-hides after 5s per persona; chat broadcasts; abandon is game-level.

```tsx
import { useEffect, useRef, useState } from "react";
import { BotCard, type BotBubble, type BotStall } from "./BotCard";
import "./OpponentCard.css";

export interface BotSeat {
  seat: number;
  userId: number; // == botUserId
  personaId: string;
  friendlyName: string;
  color?: string | null;
  glyph?: string | null;
}
export interface AiRosterProps {
  bots: BotSeat[];
  gameId: number;
  userId: number;
  sseUrl: string;
}

interface PersonaState {
  bubble: BotBubble | null;
  stall: BotStall | null;
}

const EMPTY: PersonaState = { bubble: null, stall: null };

export function AiRoster({ bots, gameId, userId, sseUrl }: AiRosterProps) {
  const [state, setState] = useState<Record<string, PersonaState>>({});
  const [myFlash, setMyFlash] = useState<string | null>(null);
  const hideTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const knownPersonas = useRef(new Set(bots.map((b) => b.personaId)));
  knownPersonas.current = new Set(bots.map((b) => b.personaId));

  function patch(personaId: string, fn: (s: PersonaState) => PersonaState) {
    if (!knownPersonas.current.has(personaId)) return;
    setState((prev) => ({ ...prev, [personaId]: fn(prev[personaId] ?? EMPTY) }));
  }

  function scheduleHide(personaId: string) {
    clearTimeout(hideTimers.current[personaId]);
    hideTimers.current[personaId] = setTimeout(() => {
      patch(personaId, (s) => ({ ...s, bubble: null }));
    }, 5000);
  }

  useEffect(() => {
    const es = new EventSource(sseUrl);

    const onBanter = (ev: Event) => {
      const d = JSON.parse((ev as MessageEvent).data ?? "{}");
      if (!d.text || !d.personaId) return;
      patch(d.personaId, (s) => ({ ...s, bubble: { text: d.text, thinking: false } }));
      scheduleHide(d.personaId);
    };
    const onThinking = (ev: Event) => {
      const d = JSON.parse((ev as MessageEvent).data ?? "{}");
      if (!d.personaId) return;
      clearTimeout(hideTimers.current[d.personaId]);
      patch(d.personaId, (s) => ({
        ...s,
        stall: null,
        bubble: { text: `${d.displayName ?? "AI"} is thinking`, thinking: true },
      }));
    };
    const onStalled = (ev: Event) => {
      const d = JSON.parse((ev as MessageEvent).data ?? "{}");
      if (!d.personaId) return;
      patch(d.personaId, (s) => ({ ...s, stall: { reason: d.reason ?? "unknown" } }));
    };
    const onUpdate = () => {
      // Clear lingering "thinking" bubbles once a real state update lands.
      setState((prev) => {
        const next: Record<string, PersonaState> = {};
        for (const [k, v] of Object.entries(prev)) {
          next[k] = v.bubble?.thinking ? { ...v, bubble: null } : v;
        }
        return next;
      });
    };
    const onUserChat = (ev: Event) => {
      const d = JSON.parse((ev as MessageEvent).data ?? "{}");
      if (d.userId !== userId || !d.text) return;
      setMyFlash(d.text);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setMyFlash(null), 4000);
    };

    es.addEventListener("banter", onBanter);
    es.addEventListener("bot_thinking", onThinking);
    es.addEventListener("bot_stalled", onStalled);
    es.addEventListener("update", onUpdate);
    es.addEventListener("user_chat", onUserChat);

    return () => {
      es.removeEventListener("banter", onBanter);
      es.removeEventListener("bot_thinking", onThinking);
      es.removeEventListener("bot_stalled", onStalled);
      es.removeEventListener("update", onUpdate);
      es.removeEventListener("user_chat", onUserChat);
      es.close();
      for (const t of Object.values(hideTimers.current)) clearTimeout(t);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [sseUrl, userId]);

  async function onRetry(botUserId: number, personaId: string) {
    try {
      const r = await fetch(`/api/games/${gameId}/ai/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botUserId }),
      });
      if (r.ok) patch(personaId, (s) => ({ ...s, stall: null }));
      else {
        const detail = (await r.json().catch(() => ({}))).error || String(r.status);
        alert(`retry failed: ${detail}`);
      }
    } catch (e) {
      alert(`retry failed: ${(e as Error).message}`);
    }
  }

  async function onAbandon() {
    if (!confirm("End this game?")) return;
    try {
      const r = await fetch(`/api/games/${gameId}/ai/abandon`, { method: "POST" });
      if (r.ok) window.location.reload();
      else {
        const detail = (await r.json().catch(() => ({}))).error || String(r.status);
        alert(`abandon failed: ${detail}`);
      }
    } catch (e) {
      alert(`abandon failed: ${(e as Error).message}`);
    }
  }

  async function onChatSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = (inputRef.current?.value ?? "").trim();
    if (!text) return;
    if (inputRef.current) inputRef.current.value = "";
    await Promise.all(
      bots.map((b) =>
        fetch(`/api/games/${gameId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, botUserId: b.userId }),
        }).catch(() => {}),
      ),
    );
  }

  if (bots.length === 0) return null;
  const anyStalled = bots.some((b) => state[b.personaId]?.stall);

  return (
    <div className="ai-roster">
      {bots.map((b) => {
        const s = state[b.personaId] ?? EMPTY;
        return (
          <BotCard
            key={b.userId}
            personaId={b.personaId}
            friendlyName={b.friendlyName}
            color={b.color}
            glyph={b.glyph}
            bubble={s.bubble}
            stall={s.stall}
            onRetry={() => onRetry(b.userId, b.personaId)}
          />
        );
      })}

      <form className="opp-card__chat" onSubmit={onChatSubmit}>
        <input
          ref={inputRef}
          type="text"
          maxLength={200}
          placeholder="Talk smack…"
          autoComplete="off"
        />
        <button type="submit" hidden>
          Submit
        </button>
      </form>
      {myFlash && <div className="opp-card__my-bubble">{myFlash}</div>}

      {anyStalled && (
        <button type="button" className="opp-card__abandon" onClick={onAbandon}>
          Abandon game
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:client -- AiRoster`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/clients/shared/AiRoster.tsx test/client/AiRoster.test.tsx
git commit -m "feat(e4-2): AiRoster — personaId-routed SSE, per-bot retry, chat broadcast"
```

---

### Task 4: Wire `AiRoster` into `RiskApp` and retire the 2P special-case

**Files:**
- Modify: `src/clients/risk/RiskApp.tsx:15-16` (imports), `:163-177` (the gated block)
- Delete: `src/clients/shared/OpponentBanter.tsx`
- Test: `test/client/risk-app-opponent-card.test.tsx` (rewrite assertions)

**Interfaces:**
- Consumes: `AiRoster` + `BotSeat` from `../shared/AiRoster`; `seatHex` from `./themes`; `ctx.players` (now carrying `personaId`/`isBot` from Task 1).

- [ ] **Step 1: Rewrite the failing test**

Replace the body of `test/client/risk-app-opponent-card.test.tsx`. The fixture must now provide `ctx.players` (the roster is built from it). Keep the existing `view`/`territories` fixture and the `dice-tray` stub; only the `ctx` and assertions change.

```tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TERRITORIES } from "../../src/clients/risk/map-geometry.js";

const ids = Object.keys(TERRITORIES);
const territories: Record<string, { owner: 0 | 1; armies: number }> =
  Object.fromEntries(ids.map((id) => [id, { owner: 0, armies: 5 }]));
territories[ids[0]] = { owner: 1, armies: 2 };

const view = {
  phase: "attack",
  currentPlayer: 0,
  youAre: 0,
  seats: [1, 11],
  territories,
  reinforcePool: 0,
  setupPools: [0, 0],
  fortifyUsed: false,
  lastCombat: null,
  winner: null,
  log: [],
};

function mockCtx(players: unknown[], extra: Record<string, unknown> = {}) {
  vi.doMock("../../src/clients/shared/useGameState", () => ({
    useGameState: () => ({
      view,
      status: "live",
      actionError: null,
      post: vi.fn(),
      ctx: {
        gameId: 99,
        userId: 1,
        gameType: "risk",
        sseUrl: "/api/games/99/events",
        actionUrl: "/api/games/99/action",
        stateUrl: "/api/games/99",
        yourFriendlyName: "Me",
        yourColor: "#c33",
        players,
        ...extra,
      },
    }),
  }));
}

beforeEach(() => {
  if (!customElements.get("dice-tray")) {
    customElements.define("dice-tray", class extends HTMLElement {});
  }
});
afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../../src/clients/shared/useGameState");
});

describe("RiskApp AI roster", () => {
  it("renders a bot card for each bot seat in ctx.players", async () => {
    vi.resetModules();
    mockCtx([
      { userId: 1, seat: 0, friendlyName: "Me", color: "#c33", glyph: null, isBot: false, personaId: null },
      { userId: 11, seat: 1, friendlyName: "Hattie", color: "#a00", glyph: "x", isBot: true, personaId: "hattie" },
    ]);
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    const { container } = render(<RiskApp />);
    await waitFor(() =>
      expect(screen.getByText(/Phase: attack/i)).toBeInTheDocument(),
    );
    const cards = container.querySelectorAll(".opp-card");
    expect(cards.length).toBe(1);
    const img = cards[0].querySelector("img.opp-card__img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/shared/portraits/hattie.png");
  });

  it("renders no card when the only opponent is human", async () => {
    vi.resetModules();
    mockCtx([
      { userId: 1, seat: 0, friendlyName: "Me", color: "#c33", glyph: null, isBot: false, personaId: null },
      { userId: 22, seat: 1, friendlyName: "Pat", color: "#36c", glyph: null, isBot: false, personaId: null },
    ]);
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    const { container } = render(<RiskApp />);
    await waitFor(() =>
      expect(screen.getByText(/Phase: attack/i)).toBeInTheDocument(),
    );
    expect(container.querySelector(".opp-card")).toBeNull();
  });

  it("falls back to opponentPersonaId for a legacy 2P bot seat", async () => {
    vi.resetModules();
    mockCtx(
      [
        { userId: 1, seat: 0, friendlyName: "Me", color: "#c33", glyph: null, isBot: false, personaId: null },
        { userId: 11, seat: 1, friendlyName: "Bot", color: "#a00", glyph: "x", isBot: true, personaId: null },
      ],
      { opponentPersonaId: "professor-doofi", opponentFriendlyName: "Professor Doofi", opponentColor: "#8b5cf6", opponentGlyph: "✦" },
    );
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    const { container } = render(<RiskApp />);
    await waitFor(() =>
      expect(screen.getByText(/Phase: attack/i)).toBeInTheDocument(),
    );
    const img = container.querySelector("img.opp-card__img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/shared/portraits/professor-doofi.png");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:client -- risk-app-opponent-card`
Expected: FAIL — RiskApp still renders the old `nPlayers === 2` `OpponentCard` driven by `opponentPersonaId`, so the multi-seat / fallback assertions fail.

- [ ] **Step 3: Update the imports in `RiskApp.tsx`**

Replace lines 15-16 (`OpponentCard` / `OpponentBanter` imports) with:

```tsx
import { AiRoster, type BotSeat } from "../shared/AiRoster";
```

(`seatHex` is already imported on line 18.)

- [ ] **Step 4: Build the `bots` array and render `<AiRoster>`**

In `RiskApp.tsx`, after `seatNames` is computed (around line 94), add the bot-roster derivation:

```tsx
  // Bots to surface in the AI roster. A bot's userId is its botUserId.
  // personaId comes from the enriched roster; for a legacy 2P game that
  // predates the server change, fall back to the singular overlay.
  const bots: BotSeat[] = (ctx.players ?? [])
    .filter((p) => p.isBot && p.userId !== ctx.userId)
    .map((p) => {
      const personaId =
        p.personaId ?? (nPlayers === 2 ? ctx.opponentPersonaId ?? null : null);
      if (!personaId) return null;
      return {
        seat: p.seat,
        userId: p.userId,
        personaId,
        friendlyName: nPlayers === 2 ? ctx.opponentFriendlyName ?? p.friendlyName : p.friendlyName,
        color: nPlayers > 2 ? seatHex(p.seat) : ctx.opponentColor ?? p.color,
        glyph: nPlayers === 2 ? ctx.opponentGlyph ?? p.glyph : p.glyph,
      } satisfies BotSeat;
    })
    .filter((b): b is BotSeat => b !== null);
```

Then replace the entire `nPlayers === 2 && ( <OpponentCard> … </OpponentCard> )` block (currently `src/clients/risk/RiskApp.tsx:163-177`) with:

```tsx
      <AiRoster
        bots={bots}
        gameId={ctx.gameId}
        userId={ctx.userId}
        sseUrl={ctx.sseUrl}
      />
```

- [ ] **Step 5: Delete the obsolete component**

```bash
git rm src/clients/shared/OpponentBanter.tsx
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npm run test:client -- risk-app-opponent-card`
Expected: PASS (3 tests).

- [ ] **Step 7: Run the full client suite**

Run: `npm run test:client`
Expected: PASS — confirm no other test imported `OpponentBanter` (grep first: `grep -rn "OpponentBanter" test/ src/`; expected: no matches).

- [ ] **Step 8: Commit**

```bash
git add src/clients/risk/RiskApp.tsx test/client/risk-app-opponent-card.test.tsx
git commit -m "feat(e4-2): unify Risk client on AiRoster; retire 2P opp-card path"
```

---

### Task 5: Rebuild the client bundle and verify the full suite

**Files:**
- Modify (generated): `plugins/risk/client/app.js`, `plugins/risk/client/app.js.map`, `plugins/risk/client/app.css`

**Interfaces:** none (build + verification only).

- [ ] **Step 1: Rebuild the committed client bundle**

Run: `npm run build:client`
Expected: `[build-clients] building risk` … `[build-clients] done`. This regenerates `plugins/risk/client/app.js` (+ map + css) from the new `.tsx` source. Without this, the running game still serves the old bundle.

- [ ] **Step 2: Confirm the bundle picked up the change**

Run: `grep -c "ai-roster" plugins/risk/client/app.js`
Expected: a non-zero count (the new wrapper class is in the bundle).

- [ ] **Step 3: Run the full server + client suites**

Run: `npm test && npm run test:client`
Expected: both suites PASS.

- [ ] **Step 4: Commit the rebuilt bundle**

```bash
git add plugins/risk/client/app.js plugins/risk/client/app.js.map plugins/risk/client/app.css
git commit -m "build(e4-2): rebuild risk client bundle with AiRoster"
```

---

## Self-Review

**Spec coverage:**
- Per-seat persona portrait/banter/thinking/stall surface for N>2 → Tasks 2, 3, 4.
- Wire retry with `botUserId` → Task 3 (Step 3 `onRetry`), tested Task 3 Step 1.
- Chat broadcast to every bot → Task 3 (`onChatSubmit`), tested Task 3 Step 1.
- Abandon as one game-level control → Task 3 (`onAbandon`, `anyStalled` gate).
- Route by `personaId`, ignore `side` → Task 3 (all handlers key on `d.personaId`).
- Server bridge (`personaId`/`isBot` per seat), legacy `opponent*` untouched → Task 1.
- Unify (option A), N=2 collapses to one card, 2P fallback → Task 4 (`bots` derivation + fallback test).
- Rebuild the committed bundle → Task 5.
- Not E4-3 / not E4-4 → honored (no `side` use; overlay untouched).

**Placeholder scan:** none — every code/test step carries complete code and exact commands.

**Type consistency:** `BotSeat` (Task 3) is imported and produced identically in Task 4. `BotBubble`/`BotStall` defined in Task 2, consumed in Task 3. `onRetry: () => void` in `BotCard` (Task 2) matches `() => onRetry(b.userId, b.personaId)` wiring (Task 3). `ctx.players[]` fields added in Task 1 (`personaId`, `isBot`) match the fixtures and derivation in Task 4. Retry/chat bodies (`{ botUserId }`, `{ text, botUserId }`) match the server `resolveBotUserId` contract.
