# Risk Persona Treatment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Mount the shared `OpponentCard` + `OpponentBanter` (Cycle 2) inside Risk's React shell as a top-right pinned overlay, so the opponent persona, banter bubble, thinking dots, stalled-bot controls, and trash-talk input all appear during Risk-vs-bot games.

**Architecture:** Pure client-side change. Two source files (`RiskApp.tsx`, `plugins/risk/client/style.css`) plus one new test. The shared `.opp-card` CSS pins itself to bottom-right of the viewport via `position: fixed`; Risk overrides that scoped to `#risk-root` to lift the card to top-right. The orchestrator already broadcasts `banter` / `bot_thinking` / `bot_stalled` / `user_chat` SSE events for Risk bots — no server change.

**Tech Stack:** React 19, TypeScript, Vitest + Testing Library + jsdom (existing test harness with stubbed `EventSource` and `localStorage` in `test/client/setup.ts`), Vite (rolldown) for the client bundle.

---

## File Structure

| File | Responsibility | Action |
|---|---|---|
| `src/clients/risk/RiskApp.tsx` | Risk game shell | **Modify** — add 2 imports, render `<OpponentCard><OpponentBanter/></OpponentCard>` after `<ContinentRail/>` |
| `plugins/risk/client/style.css` | Risk-scoped client styling | **Modify** — append `#risk-root .opp-card` override block (top-right desktop, in-flow stack on narrow viewports) |
| `test/client/risk-app-opponent-card.test.tsx` | Smoke test for Risk persona mount | **Create** — assert OpponentCard renders inside RiskApp when `ctx.opponentPersonaId` is set |
| `plugins/risk/client/app.js` | Built bundle | **Rebuilt** by `npx vite build --config vite.config.client.js` with `GAMEBOX_PLUGIN=risk` |

No file is deleted. No contract (`src/clients/shared/contracts/risk.ts`) changes. No server-side code changes.

**Why no wrapping `<aside>` div** — the spec floated a `.risk-opp-overlay` wrapper, but `OpponentCard.css` declares `.opp-card { position: fixed; ... }`, which means a parent's positioning is ignored. The simplest honest fix is a Risk-scoped CSS override on `.opp-card` itself. The plan reflects this refinement of the spec.

---

## Task 1: Failing smoke test — OpponentCard mounts inside RiskApp

**Files:**
- Create: `test/client/risk-app-opponent-card.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `test/client/risk-app-opponent-card.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TERRITORIES } from "../../src/clients/risk/map-geometry.js";

// Same fixture shape as test/client/risk-app.test.tsx so Board can iterate
// every territory. Phase=attack gives us a stable mid-game frame.
const ids = Object.keys(TERRITORIES);
const territories: Record<string, { owner: 0 | 1; armies: number }> =
  Object.fromEntries(ids.map((id) => [id, { owner: 0, armies: 5 }]));
territories[ids[0]] = { owner: 1, armies: 2 };

const view = {
  phase: "attack",
  currentPlayer: 0,
  youAre: 0,
  territories,
  reinforcePool: 0,
  setupPools: [0, 0],
  fortifyUsed: false,
  lastCombat: null,
  winner: null,
  log: [],
};

vi.mock("../../src/clients/shared/useGameState", () => ({
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
      opponentFriendlyName: "Professor Doofi",
      opponentColor: "#8b5cf6",
      opponentPersonaId: "professor-doofi",
      opponentGlyph: "✦",
    },
  }),
}));

beforeEach(() => {
  if (!customElements.get("dice-tray")) {
    customElements.define("dice-tray", class extends HTMLElement {});
  }
});

describe("RiskApp opponent card", () => {
  it("mounts the OpponentCard when ctx has opponentPersonaId", async () => {
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    const { container } = render(<RiskApp />);
    await waitFor(() =>
      expect(screen.getByText(/Phase: attack/i)).toBeInTheDocument(),
    );
    const card = container.querySelector(".opp-card");
    expect(card).not.toBeNull();
    expect(card!.querySelector(".opp-card__name")!.textContent).toBe(
      "Professor Doofi",
    );
    // Opp portrait img wired with persona-derived src
    const img = card!.querySelector("img.opp-card__img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(
      "/shared/portraits/professor-doofi.png",
    );
  });

  it("renders no .opp-card when opponentPersonaId is null", async () => {
    // Re-import with a separate vi.doMock so we can override ctx.
    vi.resetModules();
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
          opponentFriendlyName: "Opponent",
          opponentColor: "#36c",
          opponentPersonaId: null,
        },
      }),
    }));
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    const { container } = render(<RiskApp />);
    await waitFor(() =>
      expect(screen.getByText(/Phase: attack/i)).toBeInTheDocument(),
    );
    expect(container.querySelector(".opp-card")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/client/risk-app-opponent-card.test.tsx`

Expected: FAIL — the first test fails with `expected null not to be null` on the `.opp-card` query, because `RiskApp.tsx` does not yet render `OpponentCard`. The second test should already pass (no card to find).

- [ ] **Step 3: Commit the failing test**

```bash
git add test/client/risk-app-opponent-card.test.tsx
git commit -m "test(risk): smoke test for OpponentCard mount in RiskApp"
```

---

## Task 2: Mount OpponentCard + OpponentBanter in RiskApp

**Files:**
- Modify: `src/clients/risk/RiskApp.tsx`

- [ ] **Step 1: Add the imports**

In `src/clients/risk/RiskApp.tsx`, add two imports beneath the existing imports (e.g. after `import { CombatReveal } from "./CombatReveal";`):

```tsx
import { OpponentCard } from "../shared/OpponentCard";
import { OpponentBanter } from "../shared/OpponentBanter";
```

Note: `OpponentCard.tsx` declares `import "./OpponentCard.css"` as a side effect, so this single import also pulls in the shared persona styles. No CSS import needed in `RiskApp.tsx`.

- [ ] **Step 2: Render the card inside the Risk root**

Inside `RiskApp`'s `return (...)`, immediately after the existing `<ContinentRail view={view} />` line and before `<Board ... />`, insert:

```tsx
<OpponentCard
  personaId={ctx.opponentPersonaId ?? null}
  friendlyName={ctx.opponentFriendlyName ?? "Opponent"}
  color={ctx.opponentColor}
  glyph={ctx.opponentGlyph}
>
  <OpponentBanter
    gameId={ctx.gameId}
    userId={ctx.userId}
    sseUrl={ctx.sseUrl}
    friendlyName={ctx.opponentFriendlyName ?? "Opponent"}
  />
</OpponentCard>
```

Placement note: the card uses `position: fixed`, so its DOM location does not affect screen position. Placing it after `<ContinentRail/>` keeps the JSX readable and gives it a stable spot in the document for the smoke test's `container.querySelector(".opp-card")`.

- [ ] **Step 3: Run the smoke test to verify it passes**

Run: `npx vitest run test/client/risk-app-opponent-card.test.tsx`

Expected: PASS — both tests green. The first asserts persona mount; the second asserts the null-personaId guard still suppresses rendering.

- [ ] **Step 4: Run the full client test suite to verify no regressions**

Run: `npx vitest run`

Expected: all existing tests still pass. In particular, `test/client/risk-app.test.tsx` continues to pass — its `ctx` does not include `opponentPersonaId`, so `OpponentCard` renders `null` (its early-return on `personaId == null`), and `OpponentBanter` never mounts because it sits inside the null card's children slot. No EventSource is opened for that test.

- [ ] **Step 5: Commit**

```bash
git add src/clients/risk/RiskApp.tsx
git commit -m "feat(risk): mount shared OpponentCard + OpponentBanter"
```

---

## Task 3: Override `.opp-card` positioning for Risk (top-right + responsive)

**Files:**
- Modify: `plugins/risk/client/style.css`

- [ ] **Step 1: Append the Risk-scoped override block**

At the bottom of `plugins/risk/client/style.css`, append:

```css
/* Opponent persona card — shared CSS pins .opp-card to bottom-right of the
   viewport. In Risk the bottom edge holds the action bar / history log, so
   lift the card to the top-right instead. Scoped to #risk-root so cribbage
   keeps its original positioning. */
#risk-root .opp-card {
  top: 16px;
  right: 12px;
  bottom: auto;
}

/* Narrow viewports: drop the card into normal block flow under the continent
   rail so it doesn't crowd Asia/Australia territory pins on mobile. */
@media (max-width: 959px) {
  #risk-root .opp-card {
    position: static;
    top: auto;
    right: auto;
    width: 100%;
    max-width: 280px;
    margin: 0.5rem auto;
  }
}
```

- [ ] **Step 2: Manual visual verification (build + browser)**

Build the Risk bundle:

```bash
GAMEBOX_PLUGIN=risk npx vite build --config vite.config.client.js
```

Expected: vite writes a new `plugins/risk/client/app.js` (and `app.css` if CSS was bundled — `app.css` is the lib's CSS output). No errors.

Then with the local server running (the launchd `com.slabgorb.words-server` is already alive on port 3000; if not, `launchctl kickstart -k gui/$(id -u)/com.slabgorb.words-server`), open a Risk game in the browser:

- Visit `http://localhost:3000/play/risk/<id>/` where `<id>` is an active Risk-vs-bot game (`game 59` per current DB).
- **Expected:** portrait + name "Professor Doofi" (or whatever persona is assigned) appears pinned top-right.
- Resize the browser window below 960 px wide. **Expected:** card drops out of the corner and stacks below the continent rail, max-width 280 px, centered.
- On the bot's turn, observe the "is thinking" placeholder with animated dots; when the bot returns banter, a bubble shows under the portrait.

If the overlay needs translucency tuning to keep Asia/Australia pins readable, adjust `.opp-card__portrait` background or add a `background: rgba(...)` on `#risk-root .opp-card` — this is a CSS-only follow-up and not required for the task to be considered complete.

- [ ] **Step 3: Run the full test suite once more after CSS change**

CSS does not affect test assertions (jsdom does not lay out), but rerun to confirm no module-resolution surprises:

```bash
npx vitest run
```

Expected: all tests pass.

- [ ] **Step 4: Commit the CSS source**

`plugins/risk/client/app.js` and `app.css` are gitignored (verified via `git check-ignore plugins/risk/client/app.js`, exit 0). Commit only the source file; the local rebuild from Step 2 already updated the on-disk bundle, and `npm run build:client` (which runs during `prepare`) keeps the bundle in sync everywhere else.

```bash
git add plugins/risk/client/style.css
git commit -m "style(risk): top-right .opp-card override + responsive fallback"
```

---

## Task 4: End-to-end manual verification checklist

This is a manual smoke task, not a code change. Run it after Tasks 1–3 are merged-equivalent (committed locally).

- [ ] **Step 1: Confirm server is serving the new bundle**

The cache-busting fix from earlier in this session appends `?v=<mtime>` to script URLs, so the browser will fetch the rebuilt bundle on next page load without a manual hard-reload. Verify:

```bash
curl -s -H 'cf-access-authenticated-user-email: slabgorb@gmail.com' \
  'http://localhost:3000/play/risk/59/' | grep 'app.js'
```

Expected: a line like `<script type="module" src="app.js?v=<recent-mtime>"></script>` where the timestamp matches the freshly-built bundle.

- [ ] **Step 2: Walk the persona flow in the browser**

Open `http://localhost:3000/play/risk/59/` (or another active Risk-vs-bot game). Verify:

1. Portrait + persona name appears top-right (desktop) or below the continent rail (mobile width).
2. On bot turn: "<DisplayName> is thinking" with animated dots while the LLM call is in flight.
3. After the bot returns banter: bubble appears under the portrait, visible ~5 s, fades.
4. Trash-talk input at the bottom of the card: typing + Enter shows a one-shot blue "my-bubble" flash; the message reaches the bot's next prompt (verify in the next turn's flavor text if the bot acknowledges it).
5. Force a stall (kill the `claude` subprocess mid-bot-turn, or temporarily corrupt the persona file): stalled UI replaces the bubble with Retry / Abandon buttons. Click Retry → bot resumes. Click Abandon → game ends.

- [ ] **Step 3: Confirm no regression in cribbage**

Open an active cribbage game (e.g. `/play/cribbage/56/`). The persona card must still appear bottom-right (cribbage uses the unmodified `.opp-card` defaults). If it has shifted, the `#risk-root .opp-card` scope leaked — investigate the selector specificity.

---

## Self-Review

**Spec coverage check (every requirement in `2026-05-19-risk-persona-treatment-design.md` has a task):**

- "Mount OpponentCard + OpponentBanter in RiskApp.tsx" → Task 2.
- "Position the card as a pinned overlay in the top-right of the Risk map frame" → Task 3 (positioning via Risk-scoped CSS override, refined from the spec's `.risk-opp-overlay` wrapper which would not have worked with `position: fixed`).
- "Responsive fallback: stack below continent rail on narrow viewports" → Task 3, `@media (max-width: 959px)` block.
- "One smoke test confirming the card mounts when ctx.opponentPersonaId is set" → Task 1, including a negative test for the null-personaId case.
- "Out of scope items (multi-AI, stranded-game migration, Risk chrome, banter pacing)" → not touched by any task; preserved as Cycle B parking lot.

**Placeholder scan:** no TBDs, no "implement later", no "similar to Task N", no missing code blocks. Every code change is shown in full.

**Type consistency:** `OpponentCard` props (`personaId: string | null`, `friendlyName: string`, `color?`, `glyph?`, `children?`) match the source at `src/clients/shared/OpponentCard.tsx:4-10`. `OpponentBanter` props (`gameId`, `userId`, `sseUrl`, `friendlyName`) match `src/clients/shared/OpponentBanter.tsx:4-9`. `ctx` fields (`opponentPersonaId`, `opponentFriendlyName`, `opponentColor`, `opponentGlyph`) match `useGameState.ts:GameCtx`.

**Risks called out in spec are addressed:** overlay-vs-territory-pins → translucent backing noted in Task 3 Step 2; banter chattiness → accepted per spec, no code change needed.

---
