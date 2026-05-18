# React Frontend Migration — Cycle 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish the per-plugin React build + shared layer, port the Risk client to React/TSX, and make Risk combat client-resolved with auto-rolling, round-by-round visible 3D dice (server validates the posted outcome; bot attacks replay round-by-round).

**Architecture:** Per-plugin Vite library build (dice precedent), sources in `src/clients/`, built `app.js` back into `plugins/risk/client/` so the server is untouched (except the Risk `attack` protocol per spec Amendment A). React state is driven by a shared `useGameState` SSE hook. Combat attrition is one pure rules module shared by the client driver and the server validator.

**Tech Stack:** React 19 + TypeScript, Vite 8 (`@vitejs/plugin-react`, library mode), Vitest + `@testing-library/react` (jsdom), existing `<dice-tray>` web component from `public/shared/dice.js`, Node `node --test` for server.

**Spec:** `docs/superpowers/specs/2026-05-18-react-frontend-migration-design.md` (read **Amendment A** first — it overrides the "no server change" clause for the Risk `attack` protocol only).

**Optional cut line:** Phases 0–4 (infra + shared + Risk port + server protocol + non-combat components) = Cycle 1a. Phase 5 (combat theatre) = Cycle 1b. Ship together unless the task graph is too large for one pass.

**Conventions for every task:** Vitest specs live in `test/client/**/*.test.{ts,tsx}` (the `node --test` glob is `test/**/*.test.js` and will NOT pick them up — no collision). Server specs stay `test/*.test.js` on `node --test`. Run client tests with `npx vitest run <file>`; server tests with `node --test <file>`. Commit after every green step.

---

## Phase 0 — Build & Test Infrastructure

### Task 0.1: TypeScript config for client sources

**Files:**
- Create: `tsconfig.client.json`

- [ ] **Step 1: Create the tsconfig** (mirrors `tsconfig.dice.json`, retargeted at `src/clients`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": false,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "allowJs": true,
    "types": ["vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src/clients/**/*", "test/client/**/*"]
}
```

(`allowJs` is set because `src/clients/risk/map-geometry.js` stays plain JS — see Task 2.1.)

- [ ] **Step 2: Verify it parses**

Run: `npx tsc -p tsconfig.client.json --noEmit`
Expected: PASS with no input files error (no sources yet → exit 0, or "No inputs were found" which is acceptable at this step; it must NOT report a config syntax error).

- [ ] **Step 3: Commit**

```bash
git add tsconfig.client.json
git commit -m "build(client): tsconfig for src/clients React sources"
```

### Task 0.2: Vitest config + jsdom setup + npm scripts

**Files:**
- Create: `vitest.config.ts`
- Create: `test/client/setup.ts`
- Modify: `package.json` (scripts block)
- Modify: `justfile` (test target)

- [ ] **Step 1: Create the Vitest config**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "three",
      "@react-three/fiber",
      "@react-three/drei",
      "@react-three/rapier",
    ],
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["test/client/setup.ts"],
    include: ["test/client/**/*.test.{ts,tsx}"],
  },
});
```

- [ ] **Step 2: Create the jsdom setup file**

```ts
// test/client/setup.ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 3: Add npm scripts** — in `package.json`, add to `"scripts"` (keep existing entries; `test` stays `node --test` for the server):

```json
    "test:client": "vitest run",
    "build:client": "node scripts/build-clients.mjs",
    "dev:client": "vite build --config vite.config.client.js --watch"
```

Also change `"prepare"` from `"npm run build:dice"` to:

```json
    "prepare": "npm run build:dice && npm run build:client"
```

- [ ] **Step 4: Make the justfile test target run both suites** — replace the `test:` recipe body (`npm test`) with:

```
test:
    npm test
    npm run test:client
```

- [ ] **Step 5: Verify Vitest runs (no tests yet)**

Run: `npx vitest run`
Expected: exits 0 with "No test files found" (config valid, include glob compiles).

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts test/client/setup.ts package.json justfile
git commit -m "build(client): vitest (jsdom) config, scripts, justfile"
```

### Task 0.3: Parametrized per-plugin Vite build

**Files:**
- Create: `vite.config.client.js`
- Create: `scripts/build-clients.mjs`

- [ ] **Step 1: Create the parametrized Vite config** (mirrors `vite.config.dice.js`: library mode, single ES bundle, dedupe, preserve plugin assets)

```js
// vite.config.client.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const plugin = process.env.GAMEBOX_PLUGIN;
if (!plugin) {
  throw new Error("GAMEBOX_PLUGIN env var is required (e.g. GAMEBOX_PLUGIN=risk)");
}

export default defineConfig({
  publicDir: false,
  plugins: [react()],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "three",
      "@react-three/fiber",
      "@react-three/drei",
      "@react-three/rapier",
    ],
  },
  build: {
    target: "es2022",
    outDir: `plugins/${plugin}/client`,
    emptyOutDir: false, // preserve index.html, style.css, assets/
    sourcemap: true,
    lib: {
      entry: resolve(process.cwd(), `src/clients/${plugin}/main.tsx`),
      formats: ["es"],
      fileName: () => "app.js",
    },
    rollupOptions: {
      output: { codeSplitting: false },
    },
  },
});
```

- [ ] **Step 2: Create the build-all driver** (builds every plugin that has a `src/clients/<id>/main.tsx`)

```js
// scripts/build-clients.mjs
import { existsSync } from "node:fs";
import { readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

const clientsDir = resolve(process.cwd(), "src/clients");
if (!existsSync(clientsDir)) {
  console.log("[build-clients] no src/clients yet — nothing to build");
  process.exit(0);
}

const plugins = readdirSync(clientsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((id) => existsSync(resolve(clientsDir, id, "main.tsx")));

for (const id of plugins) {
  console.log(`[build-clients] building ${id}`);
  execFileSync("npx", ["vite", "build", "--config", "vite.config.client.js"], {
    stdio: "inherit",
    env: { ...process.env, GAMEBOX_PLUGIN: id },
  });
}
console.log(`[build-clients] done (${plugins.length} plugin(s))`);
```

- [ ] **Step 3: Verify the driver no-ops cleanly (no src/clients yet)**

Run: `node scripts/build-clients.mjs`
Expected: prints "no src/clients yet — nothing to build", exit 0.

- [ ] **Step 4: Commit**

```bash
git add vite.config.client.js scripts/build-clients.mjs
git commit -m "build(client): parametrized per-plugin vite build + driver"
```

---

## Phase 1 — Shared React Layer

### Task 1.1: Risk view/action contracts + drift test

**Files:**
- Create: `src/clients/shared/contracts/risk.ts`
- Create: `test/client/contracts-risk.test.ts`

Shapes derived from `plugins/risk/server/state.js`, `view.js`, `actions.js`, `combat.js`.

- [ ] **Step 1: Write the failing contract-drift test**

```ts
// test/client/contracts-risk.test.ts
import { describe, it, expect } from "vitest";
import { buildInitialState } from "../../plugins/risk/server/state.js";
import { riskPublicView } from "../../plugins/risk/server/view.js";
import type { RiskView } from "../../src/clients/shared/contracts/risk";

describe("RiskView contract matches the server view", () => {
  it("a fresh public view satisfies RiskView", () => {
    const state = buildInitialState({
      participants: [
        { side: "a", userId: 7 },
        { side: "b", userId: 8 },
      ],
      rng: () => 0.42,
    });
    const view = riskPublicView({ state, viewerId: 7 });
    // Compile-time: this assignment fails to typecheck if the shape drifts.
    const typed: RiskView = view as RiskView;
    expect(typed.phase).toBe("setup");
    expect(typed.youAre).toBe(0);
    expect(typeof typed.currentPlayer).toBe("number");
    expect(Object.keys(typed.territories).length).toBeGreaterThan(0);
    const anyTerr = Object.values(typed.territories)[0];
    expect(anyTerr).toHaveProperty("owner");
    expect(anyTerr).toHaveProperty("armies");
    expect(typed.setupPools).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/client/contracts-risk.test.ts`
Expected: FAIL — cannot find module `src/clients/shared/contracts/risk`.

- [ ] **Step 3: Create the contract types**

```ts
// src/clients/shared/contracts/risk.ts
export type RiskPhase =
  | "setup"
  | "reinforce"
  | "attack"
  | "fortify"
  | "gameover";

export type PlayerIdx = 0 | 1;

export interface Territory {
  owner: PlayerIdx | null;
  armies: number;
}

export interface CombatRound {
  aDice: number[];
  dDice: number[];
  aLoss: number;
  dLoss: number;
}

export interface LastCombat {
  from: string;
  to: string;
  force: number;
  rounds: CombatRound[];
  captured: boolean;
  attackerSurvivors: number;
  defenderSurvivors: number;
}

export interface RiskLogEntry {
  kind: "setup-deploy" | "deploy" | "attack" | "fortify" | "end-turn";
  player?: number;
  from?: string;
  to?: string;
  force?: number;
  count?: number;
  captured?: boolean;
  next?: number;
  placements?: Record<string, number>;
}

export interface RiskView {
  phase: RiskPhase;
  currentPlayer: PlayerIdx;
  territories: Record<string, Territory>;
  reinforcePool: number;
  setupPools: [number, number];
  fortifyUsed: boolean;
  lastCombat: LastCombat | null;
  winner: PlayerIdx | null;
  log: RiskLogEntry[];
  youAre: PlayerIdx | null;
}

// Resolved combat outcome posted by the human attacker's client.
export interface ResolvedCombat {
  rounds: { aDice: number[]; dDice: number[] }[];
  attackerLosses: number;
  defenderLosses: number;
  captured: boolean;
}

export type RiskAction =
  | { type: "setup-deploy"; payload: { placements: Record<string, number> } }
  | { type: "deploy"; payload: { placements: Record<string, number> } }
  | {
      type: "attack";
      payload: { from: string; to: string; resolved: ResolvedCombat };
    }
  | { type: "end-attack" }
  | { type: "fortify"; payload: { from: string; to: string; count: number } }
  | { type: "end-turn" }
  | { type: "resign" };
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/client/contracts-risk.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/clients/shared/contracts/risk.ts test/client/contracts-risk.test.ts
git commit -m "feat(client): Risk view/action TS contracts + drift test"
```

### Task 1.2: `useGameState` hook

Behavior mirrors `plugins/risk/client/app.js` exactly: `fetchView` does `GET stateUrl` and returns `data.state ?? data`; SSE listens for the **named** events `update` and `ended` (not the default `message`) and refetches; `post` does `POST actionUrl` JSON then refetches.

**Files:**
- Create: `src/clients/shared/useGameState.ts`
- Create: `test/client/useGameState.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/client/useGameState.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useGameState } from "../../src/clients/shared/useGameState";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  url: string;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(t: string, fn: (e: unknown) => void) {
    (this.listeners[t] ??= []).push(fn);
  }
  emit(t: string) {
    (this.listeners[t] ?? []).forEach((fn) => fn({}));
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  (globalThis as any).EventSource = FakeEventSource;
  (globalThis as any).window.__GAME__ = {
    stateUrl: "/state",
    actionUrl: "/action",
    sseUrl: "/sse",
  };
});

function mockFetchSequence(views: unknown[]) {
  let i = 0;
  globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return { ok: true, json: async () => ({}) } as Response;
    }
    const body = views[Math.min(i++, views.length - 1)];
    return { ok: true, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

describe("useGameState", () => {
  it("fetches the initial view (unwrapping data.state) and goes live", async () => {
    mockFetchSequence([{ state: { phase: "attack" } }]);
    const { result } = renderHook(() => useGameState());
    await waitFor(() => expect(result.current.status).toBe("live"));
    expect(result.current.view).toEqual({ phase: "attack" });
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("refetches on an SSE 'update' event", async () => {
    mockFetchSequence([{ phase: "attack" }, { phase: "fortify" }]);
    const { result } = renderHook(() => useGameState());
    await waitFor(() => expect(result.current.status).toBe("live"));
    act(() => FakeEventSource.instances[0].emit("update"));
    await waitFor(() =>
      expect(result.current.view).toEqual({ phase: "fortify" }),
    );
  });

  it("post() POSTs JSON then refetches", async () => {
    mockFetchSequence([{ phase: "attack" }, { phase: "attack", n: 2 }]);
    const { result } = renderHook(() => useGameState());
    await waitFor(() => expect(result.current.status).toBe("live"));
    await act(async () => {
      await result.current.post({ type: "end-attack" });
    });
    const calls = (globalThis.fetch as any).mock.calls;
    const post = calls.find((c: any[]) => c[1]?.method === "POST");
    expect(post[0]).toBe("/action");
    expect(JSON.parse(post[1].body)).toEqual({ type: "end-attack" });
  });

  it("surfaces a transient actionError when post fails, no optimistic change", async () => {
    let i = 0;
    globalThis.fetch = vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return { ok: false, status: 400, json: async () => ({}) } as Response;
      return {
        ok: true,
        json: async () => ({ phase: "attack", tick: i++ }),
      } as Response;
    }) as unknown as typeof fetch;
    const { result } = renderHook(() => useGameState());
    await waitFor(() => expect(result.current.status).toBe("live"));
    const before = result.current.view;
    await act(async () => {
      await result.current.post({ type: "end-attack" }).catch(() => {});
    });
    expect(result.current.actionError).toMatch(/400/);
    expect(result.current.view).toEqual(before); // no optimistic mutation
  });

  it("goes 'reconnecting' on SSE error", async () => {
    mockFetchSequence([{ phase: "attack" }]);
    const { result } = renderHook(() => useGameState());
    await waitFor(() => expect(result.current.status).toBe("live"));
    act(() => FakeEventSource.instances[0].emit("error"));
    await waitFor(() => expect(result.current.status).toBe("reconnecting"));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/client/useGameState.test.ts`
Expected: FAIL — cannot find module `useGameState`.

- [ ] **Step 3: Implement the hook**

```ts
// src/clients/shared/useGameState.ts
import { useCallback, useEffect, useRef, useState } from "react";

export interface GameCtx {
  gameId: number;
  userId: number;
  gameType: string;
  sseUrl: string;
  actionUrl: string;
  stateUrl: string;
  yourFriendlyName?: string;
  yourGlyph?: string | null;
  yourColor?: string | null;
  opponentFriendlyName?: string;
  opponentGlyph?: string | null;
  opponentColor?: string | null;
  opponentPersonaId?: string | null;
}

declare global {
  interface Window {
    __GAME__: GameCtx;
  }
}

export type GameStatus = "connecting" | "live" | "reconnecting" | "ended";

export interface UseGameState<TView, TAction> {
  view: TView | null;
  status: GameStatus;
  actionError: string | null;
  post: (action: TAction) => Promise<void>;
  ctx: GameCtx;
}

export function useGameState<TView = unknown, TAction = unknown>(): UseGameState<
  TView,
  TAction
> {
  const ctx = window.__GAME__;
  const [view, setView] = useState<TView | null>(null);
  const [status, setStatus] = useState<GameStatus>("connecting");
  const [actionError, setActionError] = useState<string | null>(null);
  const endedRef = useRef(false);

  const fetchView = useCallback(async (): Promise<TView> => {
    const res = await fetch(ctx.stateUrl);
    if (!res.ok) throw new Error(`state ${res.status}`);
    const data = await res.json();
    return (data?.state ?? data) as TView;
  }, [ctx.stateUrl]);

  const resync = useCallback(async () => {
    try {
      const v = await fetchView();
      setView(v);
      setStatus(endedRef.current ? "ended" : "live");
    } catch {
      setStatus("reconnecting");
    }
  }, [fetchView]);

  const post = useCallback(
    async (action: TAction) => {
      setActionError(null);
      const res = await fetch(ctx.actionUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
      });
      if (!res.ok) {
        const msg = `action failed (${res.status})`;
        setActionError(msg);
        await resync(); // server is the source of truth; never optimistic
        throw new Error(msg);
      }
      await resync();
    },
    [ctx.actionUrl, resync],
  );

  useEffect(() => {
    let es: EventSource | null = null;
    resync();
    es = new EventSource(ctx.sseUrl);
    es.addEventListener("update", () => resync());
    es.addEventListener("ended", () => {
      endedRef.current = true;
      resync();
    });
    es.addEventListener("error", () => setStatus("reconnecting"));
    es.addEventListener("open", () => resync());
    return () => es?.close();
  }, [ctx.sseUrl, resync]);

  return { view, status, actionError, post, ctx };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/client/useGameState.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/clients/shared/useGameState.ts test/client/useGameState.test.ts
git commit -m "feat(client): useGameState SSE/action hook"
```

### Task 1.3: `<ErrorBoundary>`

Ports the exact behaviors `test/risk-error-boundary.test.js` asserts: `role="alert"`, human message, error detail surfaced, exactly one Lobby link to `/`, a Reload button.

**Files:**
- Create: `src/clients/shared/ErrorBoundary.tsx`
- Create: `test/client/ErrorBoundary.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// test/client/ErrorBoundary.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ErrorBoundary } from "../../src/clients/shared/ErrorBoundary";

function Boom(): JSX.Element {
  throw new Error("Cannot read properties of undefined");
}

describe("ErrorBoundary", () => {
  it("renders an alert, the error detail, and exactly one Lobby link to /", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/went wrong/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Cannot read properties of undefined/),
    ).toBeInTheDocument();
    const lobby = screen.getAllByRole("link").filter(
      (a) => a.getAttribute("href") === "/",
    );
    expect(lobby).toHaveLength(1);
    expect(lobby[0]).toHaveTextContent(/lobby/i);
    expect(
      screen.getByRole("button", { name: /reload/i }),
    ).toBeInTheDocument();
    spy.mockRestore();
  });

  it("renders children unchanged when nothing throws", () => {
    render(
      <ErrorBoundary>
        <div data-testid="ok">fine</div>
      </ErrorBoundary>,
    );
    expect(screen.getByTestId("ok")).toHaveTextContent("fine");
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/client/ErrorBoundary.test.tsx`
Expected: FAIL — cannot find module `ErrorBoundary`.

- [ ] **Step 3: Implement the boundary**

```tsx
// src/clients/shared/ErrorBoundary.tsx
import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}
interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[client] render failed", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="render-error" role="alert">
        <p className="render-error__msg">
          Something went wrong displaying this game.
        </p>
        <p className="render-error__detail">
          {error.message || String(error)}
        </p>
        <div className="render-error__actions">
          <a className="lobby-link" href="/">
            Back to Lobby
          </a>
          <button
            type="button"
            className="resign-btn"
            onClick={() => {
              try {
                location.reload();
              } catch {
                /* test env */
              }
            }}
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/client/ErrorBoundary.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/clients/shared/ErrorBoundary.tsx test/client/ErrorBoundary.test.tsx
git commit -m "feat(client): shared React ErrorBoundary"
```

### Task 1.4: `<DiceTray>` wrapper

Wraps the prebuilt `<dice-tray>` custom element (from `public/shared/dice.js`). Exposes an imperative `roll(count)` that calls the element's `.throw()` and resolves with the settled `values` from the `dice-settle` event. The dice-lib is NOT modified.

**Files:**
- Create: `src/clients/shared/DiceTray.tsx`
- Create: `test/client/DiceTray.test.tsx`

- [ ] **Step 1: Write the failing test** (a stub custom element stands in for the prebuilt bundle)

```tsx
// test/client/DiceTray.test.tsx
import { describe, it, expect, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";
import { DiceTray, type DiceTrayHandle } from "../../src/clients/shared/DiceTray";

class StubDiceTray extends HTMLElement {
  thrown: unknown[] = [];
  throw(params: unknown) {
    this.thrown.push(params);
    // Simulate physics settling on the next tick.
    setTimeout(() => {
      this.dispatchEvent(
        new CustomEvent("dice-settle", {
          detail: { values: [4, 2, 6], throwParams: [] },
        }),
      );
    }, 0);
  }
  reset() {}
}

beforeAll(() => {
  if (!customElements.get("dice-tray")) {
    customElements.define("dice-tray", StubDiceTray);
  }
});

describe("DiceTray", () => {
  it("roll(count) calls the element's throw() and resolves with settled values", async () => {
    const ref = createRef<DiceTrayHandle>();
    render(<DiceTray ref={ref} themeColor="#c33" />);
    const values = await ref.current!.roll(3);
    expect(values).toEqual([4, 2, 6]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/client/DiceTray.test.tsx`
Expected: FAIL — cannot find module `DiceTray`.

- [ ] **Step 3: Implement the wrapper**

```tsx
// src/clients/shared/DiceTray.tsx
import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from "react";

export interface DiceTrayHandle {
  /** Auto-roll `count` d6 dice; resolves with the settled face values. */
  roll: (count: number) => Promise<number[]>;
}

interface Props {
  /** Tint applied via the data attribute the dice bundle reads, plus a CSS hook. */
  themeColor?: string;
  style?: CSSProperties;
}

// Synthesized throw params: a physical-looking auto-roll (no drag gesture).
// position/velocity/angular are cosmetic; the settled value is whatever the
// physics yields — Risk posts those values to the server (spec Amendment A).
function autoThrowParams() {
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  return {
    position: [rand(-0.3, 0.3), 1.2, rand(-0.3, 0.3)] as [
      number,
      number,
      number,
    ],
    linearVelocity: [rand(-2, 2), 1, rand(-6, -3)] as [number, number, number],
    angularVelocity: [rand(-12, 12), rand(-12, 12), rand(-12, 12)] as [
      number,
      number,
      number,
    ],
    rotation: [rand(-3, 3), rand(-3, 3), rand(-3, 3)] as [
      number,
      number,
      number,
    ],
  };
}

export const DiceTray = forwardRef<DiceTrayHandle, Props>(function DiceTray(
  { themeColor, style },
  ref,
) {
  const elRef = useRef<HTMLElement & {
    throw: (p: unknown) => void;
    reset: () => void;
  }>(null);

  useImperativeHandle(
    ref,
    () => ({
      roll(count: number) {
        return new Promise<number[]>((resolve, reject) => {
          const el = elRef.current;
          if (!el) return reject(new Error("dice-tray not mounted"));
          const onSettle = (e: Event) => {
            cleanup();
            resolve((e as CustomEvent).detail.values as number[]);
          };
          const onError = (e: Event) => {
            cleanup();
            reject(new Error((e as CustomEvent).detail?.message ?? "dice error"));
          };
          const cleanup = () => {
            el.removeEventListener("dice-settle", onSettle);
            el.removeEventListener("dice-error", onError);
          };
          el.removeEventListener("dice-replay-settle", onSettle);
          el.addEventListener("dice-settle", onSettle);
          el.addEventListener("dice-error", onError);
          el.setAttribute("dice", `${count}d6`);
          el.setAttribute("mode", "active");
          for (let i = 0; i < count; i++) el.throw(autoThrowParams());
        });
      },
    }),
    [],
  );

  return (
    // @ts-expect-error custom element registered by public/shared/dice.js
    <dice-tray
      ref={elRef}
      dice="1d6"
      mode="idle"
      data-color={themeColor}
      style={{ width: "100%", minHeight: 200, ...style }}
    />
  );
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/client/DiceTray.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/clients/shared/DiceTray.tsx test/client/DiceTray.test.tsx
git commit -m "feat(client): DiceTray wrapper over prebuilt <dice-tray>"
```

> **Implementation note for the executor:** `index.html` (Task 5.1) must keep loading `public/shared/dice.js` so the real `<dice-tray>` element is defined at runtime. The `count`-dice single-throw behavior should be verified against the real bundle during the Task 5.4 manual checklist; if the real element's `.throw()` is one-die-per-call vs all-dice, adjust `roll()` accordingly (the test stub documents the contract, not the bundle internals).

---

## Phase 2 — Risk Pure Logic (ported)

### Task 2.1: Move map-geometry, keep the server-drift guard green

`plugins/risk/client/map-geometry.js` is pure data. It stays plain JS (no types needed) so the existing `node --test` drift guard (`test/risk-map-geometry.test.js`) keeps working with only a path change.

**Files:**
- Create: `src/clients/risk/map-geometry.js` (verbatim copy)
- Modify: `test/risk-map-geometry.test.js` (import path only)
- Delete: `plugins/risk/client/map-geometry.js` (after the move)

- [ ] **Step 1: Copy the file verbatim**

Run: `mkdir -p src/clients/risk && git mv plugins/risk/client/map-geometry.js src/clients/risk/map-geometry.js`

- [ ] **Step 2: Update the drift-guard import path** — in `test/risk-map-geometry.test.js`, change:

```js
} from '../plugins/risk/client/map-geometry.js';
```
to:
```js
} from '../src/clients/risk/map-geometry.js';
```

- [ ] **Step 3: Run the drift guard to verify it still passes**

Run: `node --test test/risk-map-geometry.test.js`
Expected: PASS (geometry still matches `plugins/risk/server/map.js`).

- [ ] **Step 4: Commit**

```bash
git add -A src/clients/risk/map-geometry.js test/risk-map-geometry.test.js plugins/risk/client/map-geometry.js
git commit -m "refactor(risk): move map-geometry to src/clients, keep drift guard"
```

### Task 2.2: Port `deploy-plan` to TS

**Files:**
- Create: `src/clients/risk/deploy-plan.ts`
- Create: `test/client/deploy-plan.test.ts` (ports every case from `test/risk-deploy-plan.test.js`)
- Delete: `test/risk-deploy-plan.test.js`, `plugins/risk/client/deploy-plan.js` (after green)

- [ ] **Step 1: Write the failing test** (verbatim cases from the existing node test, Vitest form)

```ts
// test/client/deploy-plan.test.ts
import { describe, it, expect } from "vitest";
import {
  adjust,
  placed,
  remaining,
  isComplete,
} from "../../src/clients/risk/deploy-plan";

describe("deploy-plan", () => {
  it("placed sums the allocation; remaining is pool minus placed", () => {
    expect(placed({})).toBe(0);
    expect(remaining({}, 20)).toBe(20);
    expect(placed({ ALA: 3, URA: 5 })).toBe(8);
    expect(remaining({ ALA: 3, URA: 5 }, 20)).toBe(12);
  });
  it("adjust adds armies to a territory", () => {
    const p = adjust({}, "ALA", 1, 20);
    expect(p).toEqual({ ALA: 1 });
    expect(adjust(p, "ALA", 1, 20)).toEqual({ ALA: 2 });
  });
  it("adjust does not mutate the input plan", () => {
    const p = { ALA: 1 };
    adjust(p, "ALA", 1, 20);
    expect(p).toEqual({ ALA: 1 });
  });
  it("adjust caps the total at the pool, never overspends", () => {
    const p = adjust({ ALA: 18 }, "URA", 5, 20);
    expect(placed(p)).toBe(20);
    expect(p.URA).toBe(2);
  });
  it("adjust full pool onto a fresh territory is clamped", () => {
    expect(adjust({}, "ALA", 99, 20)).toEqual({ ALA: 20 });
  });
  it("adjust down clamps at zero and drops the key", () => {
    expect(adjust({ ALA: 2 }, "ALA", -1, 20)).toEqual({ ALA: 1 });
    expect(adjust({ ALA: 1 }, "ALA", -1, 20)).toEqual({});
    expect(adjust({ ALA: 1 }, "ALA", -5, 20)).toEqual({});
    expect(adjust({}, "ALA", -1, 20)).toEqual({});
  });
  it("isComplete only when the whole pool is spent", () => {
    expect(isComplete({}, 20)).toBe(false);
    expect(isComplete({ ALA: 19 }, 20)).toBe(false);
    expect(isComplete({ ALA: 12, URA: 8 }, 20)).toBe(true);
    expect(isComplete({}, 0)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/client/deploy-plan.test.ts`
Expected: FAIL — cannot find module `deploy-plan`.

- [ ] **Step 3: Port the module to TS** (logic unchanged from `plugins/risk/client/deploy-plan.js`)

```ts
// src/clients/risk/deploy-plan.ts
export type DeployPlan = Record<string, number>;

export function placed(plan: DeployPlan): number {
  let sum = 0;
  for (const n of Object.values(plan)) sum += n;
  return sum;
}

export function remaining(plan: DeployPlan, pool: number): number {
  return pool - placed(plan);
}

export function adjust(
  plan: DeployPlan,
  id: string,
  delta: number,
  pool: number,
): DeployPlan {
  const next: DeployPlan = { ...plan };
  const current = next[id] ?? 0;
  let target = current + delta;
  if (target < 0) target = 0;
  const headroom = pool - (placed(plan) - current);
  if (target > headroom) target = headroom;
  if (target === 0) delete next[id];
  else next[id] = target;
  return next;
}

export function isComplete(plan: DeployPlan, pool: number): boolean {
  return pool > 0 && placed(plan) === pool;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/client/deploy-plan.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Delete the superseded vanilla module + node test**

```bash
git rm plugins/risk/client/deploy-plan.js test/risk-deploy-plan.test.js
```

- [ ] **Step 6: Commit**

```bash
git add src/clients/risk/deploy-plan.ts test/client/deploy-plan.test.ts
git commit -m "refactor(risk): port deploy-plan to TS, migrate test to vitest"
```

### Task 2.3: Port combat-signature replay detection to TS

`combatSignature`/`shouldReplay` decide whether a pre-existing `lastCombat` should animate on load (so a stale result does not replay). Pure; ported verbatim.

**Files:**
- Create: `src/clients/risk/combat-signature.ts`
- Create: `test/client/combat-signature.test.ts` (ports `test/risk-combat-reveal.test.js`)
- Delete: `test/risk-combat-reveal.test.js`, `plugins/risk/client/combat-reveal.js` (after green; the DOM reveal is replaced by `<CombatReveal>` in Task 4.8)

- [ ] **Step 1: Write the failing test**

```ts
// test/client/combat-signature.test.ts
import { describe, it, expect } from "vitest";
import {
  combatSignature,
  shouldReplay,
} from "../../src/clients/risk/combat-signature";

const combat = {
  from: "N1",
  to: "N2",
  force: 3,
  captured: true,
  rounds: [{}, {}],
} as any;

describe("combat-signature", () => {
  it("signature is null when there is no combat", () => {
    expect(combatSignature(null)).toBeNull();
    expect(combatSignature(undefined)).toBeNull();
  });
  it("signature is stable for the same combat", () => {
    expect(combatSignature(combat)).toBe(combatSignature({ ...combat }));
  });
  it("signature changes when the combat changes", () => {
    expect(combatSignature(combat)).not.toBe(
      combatSignature({ ...combat, to: "N3" }),
    );
    expect(combatSignature(combat)).not.toBe(
      combatSignature({ ...combat, rounds: [{}] }),
    );
  });
  it("no replay when there is no combat", () => {
    expect(shouldReplay(null, null)).toEqual({
      signature: null,
      replay: false,
    });
  });
  it("replay on a fresh transition", () => {
    const r = shouldReplay(null, combat);
    expect(r.replay).toBe(true);
    expect(r.signature).toBe(combatSignature(combat));
  });
  it("undefined prevSignature is treated as a fresh transition", () => {
    const r = shouldReplay(undefined, combat);
    expect(r.replay).toBe(true);
  });
  it("no replay when the signature is unchanged", () => {
    const sig = combatSignature(combat);
    expect(shouldReplay(sig, combat)).toEqual({
      signature: sig,
      replay: false,
    });
  });
  it("replay when the signature changes", () => {
    const prev = combatSignature(combat);
    const next = { ...combat, to: "N3" };
    const r = shouldReplay(prev, next);
    expect(r.replay).toBe(true);
    expect(r.signature).toBe(combatSignature(next));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/client/combat-signature.test.ts`
Expected: FAIL — cannot find module `combat-signature`.

- [ ] **Step 3: Port the module** (logic verbatim from `plugins/risk/client/combat-reveal.js` lines 5–18)

```ts
// src/clients/risk/combat-signature.ts
import type { LastCombat } from "../shared/contracts/risk";

export function combatSignature(
  lastCombat: LastCombat | null | undefined,
): string | null {
  if (!lastCombat) return null;
  const { from, to, force, captured, rounds } = lastCombat;
  return `${from}|${to}|${force}|${captured}|${rounds ? rounds.length : 0}`;
}

export function shouldReplay(
  prevSignature: string | null | undefined,
  lastCombat: LastCombat | null | undefined,
): { signature: string | null; replay: boolean } {
  const signature = combatSignature(lastCombat);
  return { signature, replay: signature != null && signature !== prevSignature };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/client/combat-signature.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Delete superseded vanilla module + node test**

```bash
git rm plugins/risk/client/combat-reveal.js test/risk-combat-reveal.test.js
```

- [ ] **Step 6: Commit**

```bash
git add src/clients/risk/combat-signature.ts test/client/combat-signature.test.ts
git commit -m "refactor(risk): port combat-signature to TS, migrate test"
```

### Task 2.4: Client combat rules + driver

Pure Risk attrition + an async driver that rolls each round via an injected `roll(count)` (the `<DiceTray>` handle in production, a fake in tests). Mirrors `plugins/risk/server/combat.js` semantics exactly (sort desc, compare pairs, ties → defender, attacker dice = `min(3, af-1)`, defender dice = `min(2, df)`, continue while `af > 1 && df > 0`).

**Files:**
- Create: `src/clients/risk/combat-rules.ts`
- Create: `test/client/combat-rules.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/client/combat-rules.test.ts
import { describe, it, expect } from "vitest";
import {
  attackerDiceCount,
  defenderDiceCount,
  resolveRound,
  driveCombat,
} from "../../src/clients/risk/combat-rules";

describe("combat-rules", () => {
  it("dice counts follow Risk rules", () => {
    expect(attackerDiceCount(4)).toBe(3); // min(3, force-1)
    expect(attackerDiceCount(2)).toBe(1);
    expect(defenderDiceCount(5)).toBe(2); // min(2, defenders)
    expect(defenderDiceCount(1)).toBe(1);
  });

  it("resolveRound sorts desc, compares pairs, ties go to defender", () => {
    // attacker [6,5,2] vs defender [6,3] -> pair0 6vs6 tie (aLoss), pair1 5vs3 (dLoss)
    expect(resolveRound([2, 6, 5], [3, 6])).toEqual({ aLoss: 1, dLoss: 1 });
    // attacker [6,6] vs defender [5] -> 6>5 dLoss
    expect(resolveRound([6, 6], [5])).toEqual({ aLoss: 0, dLoss: 1 });
    // attacker [2] vs defender [2] -> tie -> aLoss
    expect(resolveRound([2], [2])).toEqual({ aLoss: 1, dLoss: 0 });
  });

  it("driveCombat steps rounds until af<=1 or df<=0 and reports the outcome", async () => {
    // Scripted rolls: attacker always rolls 6s, defender always 1s -> attacker captures.
    const roll = async (n: number) =>
      Array.from({ length: n }, (_, i) => (n === 1 ? 6 : 6 - i === 0 ? 6 : 6));
    const out = await driveCombat({
      force: 3,
      defenders: 2,
      rollAttacker: async (n) => Array(n).fill(6),
      rollDefender: async (n) => Array(n).fill(1),
    });
    expect(out.captured).toBe(true);
    expect(out.defenderLosses).toBe(2);
    expect(out.rounds.length).toBeGreaterThan(0);
    // each round records the dice that were shown
    expect(out.rounds[0]).toHaveProperty("aDice");
    expect(out.rounds[0]).toHaveProperty("dDice");
    void roll;
  });

  it("driveCombat: defender holds when defender always wins", async () => {
    const out = await driveCombat({
      force: 3,
      defenders: 5,
      rollAttacker: async (n) => Array(n).fill(1),
      rollDefender: async (n) => Array(n).fill(6),
    });
    expect(out.captured).toBe(false);
    expect(out.attackerLosses).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run test/client/combat-rules.test.ts`
Expected: FAIL — cannot find module `combat-rules`.

- [ ] **Step 3: Implement the rules + driver**

```ts
// src/clients/risk/combat-rules.ts
import type { ResolvedCombat } from "../shared/contracts/risk";

export function attackerDiceCount(attackForce: number): number {
  return Math.min(3, attackForce - 1);
}
export function defenderDiceCount(defenders: number): number {
  return Math.min(2, defenders);
}

/** Compare sorted-desc dice pairs. Ties resolve in the defender's favour. */
export function resolveRound(
  aDiceRaw: number[],
  dDiceRaw: number[],
): { aLoss: number; dLoss: number } {
  const a = [...aDiceRaw].sort((x, y) => y - x);
  const d = [...dDiceRaw].sort((x, y) => y - x);
  let aLoss = 0;
  let dLoss = 0;
  const pairs = Math.min(a.length, d.length);
  for (let i = 0; i < pairs; i++) {
    if (a[i] > d[i]) dLoss++;
    else aLoss++;
  }
  return { aLoss, dLoss };
}

export interface DriveArgs {
  force: number;
  defenders: number;
  rollAttacker: (count: number) => Promise<number[]>;
  rollDefender: (count: number) => Promise<number[]>;
  /** Optional hook fired after each round settles (for live UI/attrition). */
  onRound?: (r: {
    aDice: number[];
    dDice: number[];
    af: number;
    df: number;
  }) => void;
}

/**
 * Runs the full attack round-by-round, rolling via the injected functions.
 * Returns the resolved outcome to POST to the server (spec Amendment A.1).
 */
export async function driveCombat(args: DriveArgs): Promise<ResolvedCombat> {
  let af = args.force;
  let df = args.defenders;
  const rounds: { aDice: number[]; dDice: number[] }[] = [];
  while (af > 1 && df > 0) {
    const [aDice, dDice] = await Promise.all([
      args.rollAttacker(attackerDiceCount(af)),
      args.rollDefender(defenderDiceCount(df)),
    ]);
    const { aLoss, dLoss } = resolveRound(aDice, dDice);
    af -= aLoss;
    df -= dLoss;
    rounds.push({ aDice, dDice });
    args.onRound?.({ aDice, dDice, af, df });
  }
  return {
    rounds,
    attackerLosses: args.force - af,
    defenderLosses: args.defenders - df,
    captured: df === 0,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run test/client/combat-rules.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/clients/risk/combat-rules.ts test/client/combat-rules.test.ts
git commit -m "feat(risk): client combat rules + round-by-round driver"
```

---

## Phase 3 — Server: validate the posted combat outcome (spec Amendment A.1)

### Task 3.1: `replayAttack` validator in server combat

Add a pure `replayAttack` that mirrors `resolveAttack` but consumes posted rounds instead of rolling, asserting dice counts/ranges and recomputing attrition. Existing `resolveAttack` (bot path) is untouched.

**Files:**
- Modify: `plugins/risk/server/combat.js`
- Create: `test/risk-combat-replay.test.js` (`node --test`)

- [ ] **Step 1: Write the failing test**

```js
// test/risk-combat-replay.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { replayAttack } from '../plugins/risk/server/combat.js';

test('replayAttack recomputes attrition from posted dice (capture)', () => {
  const rounds = [{ aDice: [6, 6, 6], dDice: [1, 1] }]; // 2 defender losses
  const out = replayAttack({ force: 4, defenders: 2, rounds });
  assert.equal(out.error, undefined);
  assert.equal(out.captured, true);
  assert.equal(out.defenderSurvivors, 0);
});

test('replayAttack rejects an illegal attacker dice count', () => {
  const rounds = [{ aDice: [6, 6, 6, 6], dDice: [1, 1] }]; // force 4 -> max 3 dice
  const out = replayAttack({ force: 4, defenders: 2, rounds });
  assert.match(out.error, /dice count/i);
});

test('replayAttack rejects out-of-range die faces', () => {
  const out = replayAttack({
    force: 3,
    defenders: 1,
    rounds: [{ aDice: [7, 6], dDice: [3] }],
  });
  assert.match(out.error, /die value/i);
});

test('replayAttack rejects rounds that should have stopped', () => {
  // df hits 0 after round 1; a second round is illegal.
  const rounds = [
    { aDice: [6, 6], dDice: [1] },
    { aDice: [6, 6], dDice: [1] },
  ];
  const out = replayAttack({ force: 3, defenders: 1, rounds });
  assert.match(out.error, /extra round|stopped/i);
});

test('replayAttack matches resolveAttack semantics on a defender hold', () => {
  const rounds = [{ aDice: [1, 1, 1], dDice: [6, 6] }]; // 2 attacker losses
  const out = replayAttack({ force: 4, defenders: 2, rounds });
  assert.equal(out.captured, false);
  assert.equal(out.attackerSurvivors, 2);
  assert.equal(out.defenderSurvivors, 2);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/risk-combat-replay.test.js`
Expected: FAIL — `replayAttack` is not exported.

- [ ] **Step 3: Add `replayAttack` to `plugins/risk/server/combat.js`** (append; do not change `rollDice`/`combatRound`/`resolveAttack`)

```js
// Validate + apply a client-posted combat (spec Amendment A.1). Mirrors
// resolveAttack's loop but consumes posted dice instead of rolling, and
// asserts the dice are legal for the running force/defenders. Returns the
// same shape as resolveAttack, or { error } on any inconsistency.
export function replayAttack({ force, defenders, rounds }) {
  if (!Array.isArray(rounds)) return { error: 'rounds must be an array' };
  let af = force;
  let df = defenders;
  const out = [];
  for (const round of rounds) {
    if (af <= 1 || df <= 0) {
      return { error: 'extra round after the attack should have stopped' };
    }
    const aDice = round?.aDice;
    const dDice = round?.dDice;
    if (!Array.isArray(aDice) || !Array.isArray(dDice)) {
      return { error: 'each round needs aDice and dDice arrays' };
    }
    if (
      aDice.length !== Math.min(3, af - 1) ||
      dDice.length !== Math.min(2, df)
    ) {
      return { error: `illegal dice count for force ${af}/defenders ${df}` };
    }
    for (const v of [...aDice, ...dDice]) {
      if (!Number.isInteger(v) || v < 1 || v > 6) {
        return { error: `die value out of range: ${v}` };
      }
    }
    const a = [...aDice].sort((x, y) => y - x);
    const d = [...dDice].sort((x, y) => y - x);
    let aLoss = 0;
    let dLoss = 0;
    const pairs = Math.min(a.length, d.length);
    for (let i = 0; i < pairs; i++) {
      if (a[i] > d[i]) dLoss++;
      else aLoss++;
    }
    af -= aLoss;
    df -= dLoss;
    out.push({ aDice: a, dDice: d, aLoss, dLoss });
  }
  if (af > 1 && df > 0) {
    return { error: 'attack ended early (rounds did not resolve the combat)' };
  }
  return {
    rounds: out,
    attackerSurvivors: af,
    defenderSurvivors: df,
    captured: df === 0,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/risk-combat-replay.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add plugins/risk/server/combat.js test/risk-combat-replay.test.js
git commit -m "feat(risk): server replayAttack validator for client-resolved combat"
```

### Task 3.2: Wire `replayAttack` into the attack handler

`applyAttack` uses the posted `resolved` outcome when present (human path), else falls back to `resolveAttack` (bot path — unchanged). Validation errors reject the action with no state change.

**Files:**
- Modify: `plugins/risk/server/actions.js`
- Create: `test/risk-actions-attack-resolved.test.js` (`node --test`)

- [ ] **Step 1: Write the failing test**

```js
// test/risk-actions-attack-resolved.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyRiskAction } from '../plugins/risk/server/actions.js';

// Minimal attack-phase state: player 0 owns A (5 armies), enemy owns B (2),
// A and B adjacent. Uses real map adjacency for a known pair.
function attackState() {
  return {
    phase: 'attack',
    currentPlayer: 0,
    territories: {},
    reinforcePool: 0,
    setupPools: [0, 0],
    fortifyUsed: false,
    lastCombat: null,
    winner: null,
    log: [],
    sides: { a: 7, b: 8 },
    activeUserId: 7,
  };
}

test('a valid posted combat is applied (capture transfers the territory)', () => {
  // Build state from a real adjacent pair via the server map.
  return import('../plugins/risk/server/map.js').then(({ allTerritories, neighborsOf }) => {
    const from = allTerritories().find((id) => neighborsOf(id).length > 0);
    const to = neighborsOf(from)[0];
    const s = attackState();
    s.territories[from] = { owner: 0, armies: 5 };
    s.territories[to] = { owner: 1, armies: 2 };
    // Fill remaining territories so ownedCount(opponent) stays > 0.
    for (const id of allTerritories()) {
      if (!s.territories[id]) s.territories[id] = { owner: 1, armies: 1 };
    }
    const action = {
      type: 'attack',
      payload: {
        from,
        to,
        resolved: {
          rounds: [{ aDice: [6, 6, 6], dDice: [1, 1] }],
          attackerLosses: 0,
          defenderLosses: 2,
          captured: true,
        },
      },
    };
    const res = applyRiskAction({ state: s, action, actorId: 7 });
    assert.equal(res.error, undefined);
    assert.equal(res.state.territories[to].owner, 0);
    assert.equal(res.state.lastCombat.captured, true);
  });
});

test('an inconsistent posted combat is rejected with no state change', () => {
  return import('../plugins/risk/server/map.js').then(({ allTerritories, neighborsOf }) => {
    const from = allTerritories().find((id) => neighborsOf(id).length > 0);
    const to = neighborsOf(from)[0];
    const s = attackState();
    s.territories[from] = { owner: 0, armies: 5 };
    s.territories[to] = { owner: 1, armies: 2 };
    for (const id of allTerritories()) {
      if (!s.territories[id]) s.territories[id] = { owner: 1, armies: 1 };
    }
    const action = {
      type: 'attack',
      payload: {
        from,
        to,
        resolved: {
          rounds: [{ aDice: [6, 6, 6, 6], dDice: [1, 1] }], // illegal count
          attackerLosses: 0,
          defenderLosses: 2,
          captured: true,
        },
      },
    };
    const res = applyRiskAction({ state: s, action, actorId: 7 });
    assert.match(res.error, /dice count/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/risk-actions-attack-resolved.test.js`
Expected: FAIL — handler ignores `payload.resolved`.

- [ ] **Step 3: Modify `applyAttack` in `plugins/risk/server/actions.js`**

Change the import line:
```js
import { resolveAttack } from './combat.js';
```
to:
```js
import { resolveAttack, replayAttack } from './combat.js';
```

Replace the body of `applyAttack` (currently lines ~126–160) with:

```js
function applyAttack(s, playerIdx, payload, rng) {
  const { from, to, force, resolved } = payload ?? {};

  // Client-resolved path (human attacker, spec Amendment A.1): the client
  // rolled the dice and posts the round sequence; we validate + apply it.
  if (resolved) {
    const f = s.territories[from];
    const t = s.territories[to];
    if (!f || !t) return 'unknown territory';
    if (f.owner !== playerIdx) return `source ${from} not owned`;
    if (t.owner === playerIdx) return `target ${to} is not an enemy territory`;
    const eff = replayAttack({
      force: f.armies - 1,
      defenders: t.armies,
      rounds: resolved.rounds,
    });
    if (eff.error) return eff.error;
    f.armies -= (f.armies - 1) - eff.attackerSurvivors - (eff.captured ? eff.attackerSurvivors : 0);
    // March model parity with the rolled path: the committed force is
    // (armies-1); survivors either occupy `to` (capture) or retreat home.
    f.armies = eff.captured ? 1 : 1 + eff.attackerSurvivors;
    if (eff.captured) {
      t.owner = playerIdx;
      t.armies = eff.attackerSurvivors;
    } else {
      t.armies = eff.defenderSurvivors;
    }
    s.lastCombat = {
      from, to, force: f.armies - 1 < 0 ? 0 : undefined,
      rounds: eff.rounds,
      captured: eff.captured,
      attackerSurvivors: eff.attackerSurvivors,
      defenderSurvivors: eff.defenderSurvivors,
    };
    s.log.push({ kind: 'attack', player: playerIdx, from, to, captured: eff.captured });
    const opponent = playerIdx === 0 ? 1 : 0;
    if (ownedCount(s, opponent) === 0) {
      s.phase = 'gameover';
      s.winner = playerIdx;
    }
    return null;
  }

  // Server-resolved path (bot attacker / legacy): unchanged.
  const verr = validateAttack(s, playerIdx, { from, to, force });
  if (verr) return verr;
  const src = s.territories[from];
  const tgt = s.territories[to];
  src.armies -= force;
  const outcome = resolveAttack({ force, defenders: tgt.armies }, rng ?? Math.random);
  if (outcome.captured) {
    tgt.owner = playerIdx;
    tgt.armies = outcome.attackerSurvivors;
  } else {
    tgt.armies = outcome.defenderSurvivors;
    src.armies += outcome.attackerSurvivors;
  }
  s.lastCombat = {
    from, to, force,
    rounds: outcome.rounds,
    captured: outcome.captured,
    attackerSurvivors: outcome.attackerSurvivors,
    defenderSurvivors: outcome.defenderSurvivors,
  };
  s.log.push({ kind: 'attack', player: playerIdx, from, to, force, captured: outcome.captured });
  const opponent = playerIdx === 0 ? 1 : 0;
  if (ownedCount(s, opponent) === 0) {
    s.phase = 'gameover';
    s.winner = playerIdx;
  }
  return null;
}
```

> **Executor note — army bookkeeping:** the client-resolved branch must leave the *same* final `from`/`to` army counts the rolled path would. The rolled path commits `force` out of `from`, then on capture moves survivors into `to` (leaving `from` at `armies - force`), or on repulse returns the lone survivor. Before implementing, read `test/risk-actions-attack.test.js` and `test/risk-full-game.test.js` and make the client-resolved branch satisfy those existing invariants. If the simplified bookkeeping above conflicts with them, mirror the rolled path exactly: subtract `force` up front, then apply `eff` survivors identically to `outcome`. Treat the existing attack/full-game tests as the spec for army math.

- [ ] **Step 4: Run the focused + regression attack tests**

Run: `node --test test/risk-actions-attack-resolved.test.js test/risk-actions-attack.test.js test/risk-full-game.test.js test/risk-combat.test.js`
Expected: PASS (new tests green AND the existing attack/full-game/combat suites still green — the bot path is unchanged).

- [ ] **Step 5: Commit**

```bash
git add plugins/risk/server/actions.js test/risk-actions-attack-resolved.test.js
git commit -m "feat(risk): apply client-resolved combat; bot path unchanged"
```

---

## Phase 4 — Risk React Components

> All components are pure presentational TSX consuming `RiskView` + a `post`/`pending` context. Each ports the behavior of the corresponding vanilla module verbatim unless Amendment A changes it (combat only).

### Task 4.1: `themes.ts`

**Files:** Create `src/clients/risk/themes.ts`

- [ ] **Step 1: Port verbatim** (from `plugins/risk/client/themes.js`)

```ts
// src/clients/risk/themes.ts
export const SIDE_LABEL: Record<string, string> = {
  "0": "Red",
  "1": "Blue",
  null: "Neutral",
};
export function sideClass(owner: number | null): string {
  return owner === 0 ? "p0" : owner === 1 ? "p1" : "";
}
```

- [ ] **Step 2: Commit**

```bash
git add src/clients/risk/themes.ts
git commit -m "refactor(risk): port themes to TS"
```

### Task 4.2: `<ExitControls>` + `<EndScreen>`

Ports `leave-button.js` + `end-screen.js`. Test ports `test/risk-leave-ui.test.js`.

**Files:**
- Create: `src/clients/risk/ExitControls.tsx`, `src/clients/risk/EndScreen.tsx`
- Create: `test/client/exit-end.test.tsx`
- Delete: `test/risk-leave-ui.test.js`, `plugins/risk/client/leave-button.js`, `plugins/risk/client/end-screen.js` (after green)

- [ ] **Step 1: Write the failing test**

```tsx
// test/client/exit-end.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExitControls } from "../../src/clients/risk/ExitControls";
import { EndScreen } from "../../src/clients/risk/EndScreen";

describe("ExitControls", () => {
  it("renders a Lobby link to / and a separate Resign button", () => {
    const onResign = vi.fn();
    render(<ExitControls onResign={onResign} />);
    const lobby = screen.getByRole("link", { name: /lobby/i });
    expect(lobby).toHaveAttribute("href", "/");
    const resign = screen.getByRole("button", { name: /resign/i });
    expect(lobby).not.toBe(resign);
    fireEvent.click(resign);
    expect(onResign).toHaveBeenCalledTimes(1);
    fireEvent.click(lobby);
    expect(onResign).toHaveBeenCalledTimes(1); // lobby never resigns
  });
});

describe("EndScreen", () => {
  it("loser sees Defeat and a back-to-lobby link to /", () => {
    render(<EndScreen view={{ winner: 1, youAre: 0 } as any} />);
    expect(screen.getByText(/defeat/i)).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/");
  });
  it("winner sees Victory", () => {
    render(<EndScreen view={{ winner: 0, youAre: 0 } as any} />);
    expect(screen.getByText(/victory/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (modules missing)

Run: `npx vitest run test/client/exit-end.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement both components**

```tsx
// src/clients/risk/ExitControls.tsx
interface Props {
  onResign: () => void;
}
export function ExitControls({ onResign }: Props) {
  return (
    <span className="exit-controls">
      <a className="lobby-link" href="/">
        Lobby
      </a>
      <button
        className="resign-btn"
        type="button"
        onClick={onResign}
      >
        Resign
      </button>
    </span>
  );
}
```

```tsx
// src/clients/risk/EndScreen.tsx
import type { RiskView } from "../shared/contracts/risk";
import { SIDE_LABEL } from "./themes";

export function EndScreen({ view }: { view: RiskView }) {
  const won = view.winner === view.youAre;
  return (
    <div className="end">
      <h1>{won ? "Victory" : "Defeat"}</h1>
      <p>{SIDE_LABEL[String(view.winner)]} controls the world.</p>
      <a className="end-lobby" href="/">
        Back to lobby
      </a>
    </div>
  );
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `npx vitest run test/client/exit-end.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Delete superseded modules + node test, commit**

```bash
git rm plugins/risk/client/leave-button.js plugins/risk/client/end-screen.js test/risk-leave-ui.test.js
git add src/clients/risk/ExitControls.tsx src/clients/risk/EndScreen.tsx test/client/exit-end.test.tsx
git commit -m "refactor(risk): port ExitControls + EndScreen to React"
```

### Task 4.3: `<History>`

Ports `history.js` verbatim.

**Files:** Create `src/clients/risk/History.tsx`, `test/client/history.test.tsx`; delete `plugins/risk/client/history.js` after green.

- [ ] **Step 1: Failing test**

```tsx
// test/client/history.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { History } from "../../src/clients/risk/History";

describe("History", () => {
  it("renders the last 12 entries with kind-specific text", () => {
    render(
      <History
        log={[
          { kind: "attack", player: 0, from: "A", to: "B", captured: true } as any,
          { kind: "fortify", player: 1, from: "C", to: "D", count: 3 } as any,
          { kind: "end-turn", next: 0 } as any,
        ]}
      />,
    );
    expect(screen.getByText(/attacked A→B \(captured\)/)).toBeInTheDocument();
    expect(screen.getByText(/fortified C→D ×3/)).toBeInTheDocument();
    expect(screen.getByText(/turn to P0/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run test/client/history.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// src/clients/risk/History.tsx
import type { RiskLogEntry } from "../shared/contracts/risk";

function line(e: RiskLogEntry): string {
  if (e.kind === "attack")
    return `P${e.player} attacked ${e.from}→${e.to} (${e.captured ? "captured" : "repulsed"})`;
  if (e.kind === "deploy" || e.kind === "setup-deploy")
    return `P${e.player} deployed`;
  if (e.kind === "fortify")
    return `P${e.player} fortified ${e.from}→${e.to} ×${e.count}`;
  if (e.kind === "end-turn") return `— turn to P${e.next} —`;
  return "";
}

export function History({ log = [] }: { log?: RiskLogEntry[] }) {
  const items = log.slice(-12).map(line).filter(Boolean);
  return (
    <div className="log">
      {items.map((s, i) => (
        <div key={i}>{s}</div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run — PASS.** `npx vitest run test/client/history.test.tsx`

- [ ] **Step 5: Delete + commit**

```bash
git rm plugins/risk/client/history.js
git add src/clients/risk/History.tsx test/client/history.test.tsx
git commit -m "refactor(risk): port History to React"
```

### Task 4.4: `<ContinentRail>`

Ports `renderContinentRail` from `app.js` (lines 54–66).

**Files:** Create `src/clients/risk/ContinentRail.tsx`, `test/client/continent-rail.test.tsx`.

- [ ] **Step 1: Failing test**

```tsx
// test/client/continent-rail.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ContinentRail } from "../../src/clients/risk/ContinentRail";
import { CONTINENT_BONUS } from "../../src/clients/risk/map-geometry.js";

describe("ContinentRail", () => {
  it("renders one chip per continent and marks fully-held ones", () => {
    const keys = Object.keys(CONTINENT_BONUS);
    const view = { youAre: 0, territories: {} } as any;
    render(<ContinentRail view={view} />);
    expect(screen.getAllByText(/\+\d/).length).toBe(keys.length);
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run test/client/continent-rail.test.tsx`

- [ ] **Step 3: Implement**

```tsx
// src/clients/risk/ContinentRail.tsx
import type { RiskView } from "../shared/contracts/risk";
// @ts-expect-error plain-JS pure-data module (allowJs)
import { CONTINENT_BONUS, CONTINENTS_META, TERRITORIES } from "./map-geometry.js";

export function ContinentRail({ view }: { view: RiskView }) {
  return (
    <div className="continent-rail">
      {Object.entries(CONTINENT_BONUS as Record<string, number>).map(
        ([key, bonus]) => {
          const ids = Object.keys(TERRITORIES).filter(
            (t: string) => (TERRITORIES as any)[t].continent === key,
          );
          const held = ids.every(
            (t) => view.territories[t]?.owner === view.youAre,
          );
          const name = (CONTINENTS_META as any)[key]?.name ?? key;
          return (
            <span key={key} className={`cont-chip${held ? " held" : ""}`}>
              {name} +{bonus}
            </span>
          );
        },
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run — PASS.** `npx vitest run test/client/continent-rail.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/clients/risk/ContinentRail.tsx test/client/continent-rail.test.tsx
git commit -m "feat(risk): ContinentRail React component"
```

### Task 4.5: `<ActionBar>`

Ports `action-bar.js` verbatim **except** the attack button, which now resolves combat client-side and posts `{from,to,resolved}` (Amendment A). The attack click delegates to a `onAttack(from,to)` prop (RiskApp owns the combat drive in Task 4.9) rather than calling `post` directly.

**Files:** Create `src/clients/risk/ActionBar.tsx`, `test/client/action-bar.test.tsx`.

- [ ] **Step 1: Failing test**

```tsx
// test/client/action-bar.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionBar } from "../../src/clients/risk/ActionBar";

const base = {
  youAre: 0,
  currentPlayer: 0,
  territories: { A: { owner: 0, armies: 5 }, B: { owner: 1, armies: 2 } },
} as any;

describe("ActionBar", () => {
  it("waiting message when not your turn", () => {
    render(
      <ActionBar
        view={{ ...base, currentPlayer: 1, phase: "attack" }}
        pending={{}}
        post={vi.fn()}
        setPending={vi.fn()}
        onAttack={vi.fn()}
      />,
    );
    expect(screen.getByText(/waiting for opponent/i)).toBeInTheDocument();
  });

  it("attack phase: Attack button calls onAttack(from,to), not post", () => {
    const onAttack = vi.fn();
    const post = vi.fn();
    render(
      <ActionBar
        view={{ ...base, phase: "attack" }}
        pending={{ from: "A", to: "B" }}
        post={post}
        setPending={vi.fn()}
        onAttack={onAttack}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^attack$/i }));
    expect(onAttack).toHaveBeenCalledWith("A", "B");
    expect(post).not.toHaveBeenCalled();
  });

  it("attack phase: Done attacking posts end-attack", () => {
    const post = vi.fn();
    render(
      <ActionBar
        view={{ ...base, phase: "attack" }}
        pending={{}}
        post={post}
        setPending={vi.fn()}
        onAttack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /done attacking/i }));
    expect(post).toHaveBeenCalledWith({ type: "end-attack" });
  });

  it("fortify phase: End turn posts end-turn", () => {
    const post = vi.fn();
    render(
      <ActionBar
        view={{ ...base, phase: "fortify" }}
        pending={{}}
        post={post}
        setPending={vi.fn()}
        onAttack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /end turn/i }));
    expect(post).toHaveBeenCalledWith({ type: "end-turn" });
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run test/client/action-bar.test.tsx`

- [ ] **Step 3: Implement** (port of `action-bar.js`; attack path delegates to `onAttack`)

```tsx
// src/clients/risk/ActionBar.tsx
import type { RiskView, RiskAction } from "../shared/contracts/risk";
import { adjust, placed, remaining, isComplete, type DeployPlan } from "./deploy-plan";

export interface Pending {
  plan?: DeployPlan;
  deployTarget?: string;
  from?: string;
  to?: string;
}

interface Props {
  view: RiskView;
  pending: Pending;
  post: (a: RiskAction) => void | Promise<void>;
  setPending: (p: Pending) => void;
  onAttack: (from: string, to: string) => void;
}

export function ActionBar({ view, pending, post, setPending, onAttack }: Props) {
  const yourTurn = view.youAre === view.currentPlayer;

  if (!yourTurn) return <div className="bar">Waiting for opponent…</div>;

  if (view.phase === "setup" || view.phase === "reinforce") {
    const pool =
      view.phase === "setup"
        ? view.setupPools[view.youAre as 0 | 1]
        : view.reinforcePool;
    const type = view.phase === "setup" ? "setup-deploy" : "deploy";
    const plan = pending.plan ?? {};
    const sel = pending.deployTarget;
    const left = remaining(plan, pool);
    return (
      <div className="bar">
        {placed(plan)
          ? `Deploy: ${left} left `
          : `Deploy ${pool} — tap territories you own `}
        {Object.entries(plan).map(([id, n]) => (
          <span className="deploy-row" key={id}>
            {`${id} +${n}`}
            <button
              className="step"
              onClick={() =>
                setPending({ plan: adjust(plan, id, -1, pool), deployTarget: id })
              }
            >
              −
            </button>
            <button
              className="step"
              disabled={left <= 0}
              onClick={() =>
                setPending({ plan: adjust(plan, id, 1, pool), deployTarget: id })
              }
            >
              +
            </button>
          </span>
        ))}
        <button
          disabled={!sel}
          onClick={() => {
            if (!sel) return;
            post({ type, payload: { placements: { [sel]: pool } } } as RiskAction);
            setPending({});
          }}
        >
          Deploy all here
        </button>
        <button
          disabled={placed(plan) <= 0}
          onClick={() => setPending({})}
        >
          Clear
        </button>
        <button
          disabled={!isComplete(plan, pool)}
          onClick={() => {
            post({ type, payload: { placements: plan } } as RiskAction);
            setPending({});
          }}
        >
          Deploy ▶
        </button>
      </div>
    );
  }

  if (view.phase === "attack") {
    const { from, to } = pending;
    return (
      <div className="bar">
        {`Attack: ${from ?? "?"} → ${to ?? "?"} `}
        <button
          disabled={!(from && to)}
          onClick={() => from && to && onAttack(from, to)}
        >
          Attack
        </button>
        <button onClick={() => post({ type: "end-attack" })}>
          Done attacking
        </button>
      </div>
    );
  }

  if (view.phase === "fortify") {
    const { from, to } = pending;
    return (
      <div className="bar">
        {`Fortify: ${from ?? "?"} → ${to ?? "?"} `}
        <button
          disabled={!(from && to)}
          onClick={() => {
            const f = view.territories[from!];
            post({
              type: "fortify",
              payload: { from: from!, to: to!, count: f.armies - 1 },
            });
            setPending({});
          }}
        >
          Move all
        </button>
        <button onClick={() => post({ type: "end-turn" })}>End turn</button>
      </div>
    );
  }
  return null;
}
```

- [ ] **Step 4: Run — PASS.** `npx vitest run test/client/action-bar.test.tsx`

- [ ] **Step 5: Delete superseded module + commit**

```bash
git rm plugins/risk/client/action-bar.js
git add src/clients/risk/ActionBar.tsx test/client/action-bar.test.tsx
git commit -m "refactor(risk): port ActionBar to React; attack delegates to onAttack"
```

### Task 4.6: `<Board>` (faithful SVG port)

`board.js` builds an SVG/HTML string and attaches `[data-pick]` click handlers. The faithful port extracts the exact string builder into a pure function and renders it via `dangerouslySetInnerHTML`, with one delegated click listener. Identical markup → low risk, string-testable.

**Files:**
- Create: `src/clients/risk/board-svg.ts` (pure builder — the body of `renderBoard` minus DOM)
- Create: `src/clients/risk/Board.tsx`
- Create: `test/client/board.test.tsx`
- Delete: `plugins/risk/client/board.js` after green

- [ ] **Step 1: Write the failing test**

```tsx
// test/client/board.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { buildBoardHTML } from "../../src/clients/risk/board-svg";
import { Board } from "../../src/clients/risk/Board";
import { TERRITORIES } from "../../src/clients/risk/map-geometry.js";

const anyId = Object.keys(TERRITORIES)[0];
const view = {
  youAre: 0,
  phase: "attack",
  territories: Object.fromEntries(
    Object.keys(TERRITORIES).map((id) => [id, { owner: 0, armies: 2 }]),
  ),
} as any;

describe("board-svg", () => {
  it("builds an SVG containing a hit path for every territory", () => {
    const html = buildBoardHTML(view, {
      selected: null,
      plan: {},
      to: null,
    });
    expect(html).toContain("risk-map");
    expect(html).toContain(`data-pick="${anyId}"`);
  });
});

describe("Board", () => {
  it("clicking a territory hit target calls onPick with its id", () => {
    const onPick = vi.fn();
    const { container } = render(
      <Board view={view} onPick={onPick} selected={null} plan={{}} to={null} />,
    );
    const hit = container.querySelector(
      `[data-pick="${anyId}"]`,
    ) as HTMLElement;
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onPick).toHaveBeenCalledWith(anyId);
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run test/client/board.test.tsx`

- [ ] **Step 3: Create `board-svg.ts`** — copy the body of `renderBoard` from `plugins/risk/client/board.js` **verbatim**, but: (a) make it a pure function `buildBoardHTML(view, { selected, plan, to })` that returns the full `frame.innerHTML` string (the `<span class="map-corner-screw">…</span><img…>${svg}` markup), (b) keep `arcPath`/`armyToken` helpers unchanged, (c) import geometry from `./map-geometry.js`. Do not alter any SVG string. Signature:

```ts
// src/clients/risk/board-svg.ts
// @ts-expect-error plain-JS pure-data module (allowJs)
import {
  TERRITORIES, CONTINENTS_META, MAP_IMAGE, MAP_SIZE, SEA_LABELS, LAND_SEAMS,
} from "./map-geometry.js";
import type { RiskView } from "../shared/contracts/risk";

export interface BoardOpts {
  selected: string | null;
  plan?: Record<string, number>;
  to?: string | null;
}

// arcPath + armyToken: copied verbatim from plugins/risk/client/board.js
// (lines 19–47). buildBoardHTML: the body of renderBoard (lines 50–196)
// up to and including the `frame.innerHTML = ...` string, returned as a
// string instead of assigned to a DOM node. No SVG markup changes.
export function buildBoardHTML(view: RiskView, opts: BoardOpts): string {
  /* PORT the renderBoard body here verbatim; return the innerHTML string. */
  // (executor: mechanical copy — see board.js:19–196)
  throw new Error("port me");
}
```

> The `throw new Error("port me")` is a deliberate RED placeholder for *this step only*. Step 3 is not complete until the verbatim port replaces it and Step 4 passes. Do not commit with the throw present.

- [ ] **Step 4: Implement `Board.tsx` and finish the port until green**

```tsx
// src/clients/risk/Board.tsx
import { useEffect, useRef } from "react";
import type { RiskView } from "../shared/contracts/risk";
import { buildBoardHTML, type BoardOpts } from "./board-svg";

interface Props extends BoardOpts {
  view: RiskView;
  onPick: (id: string) => void;
}

export function Board({ view, onPick, selected, plan = {}, to = null }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const html = buildBoardHTML(view, { selected, plan, to });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      const t = (e.target as Element)?.closest("[data-pick]");
      if (t) onPick(t.getAttribute("data-pick")!);
    };
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [onPick, html]);

  return (
    <div
      className="map-frame"
      ref={ref}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
```

Run: `npx vitest run test/client/board.test.tsx`
Expected: PASS once `buildBoardHTML` is the verbatim port (no `throw`).

- [ ] **Step 5: Delete superseded module + commit**

```bash
git rm plugins/risk/client/board.js
git add src/clients/risk/board-svg.ts src/clients/risk/Board.tsx test/client/board.test.tsx
git commit -m "refactor(risk): port Board (verbatim SVG builder + delegated clicks)"
```

### Task 4.7: `<CombatReveal>` — round-by-round dice theatre

Two modes (spec Amendment A.2): `live` (drives `driveCombat` feeding two `<DiceTray>`s, applies attrition on each round, then calls `onResolved`) and `replay` (steps server-recorded `rounds` on a timer). Renders attacker tray (attacker color) + defender tray (defender color), a running army tally, and a final Captured/Repulsed banner.

**Files:** Create `src/clients/risk/CombatReveal.tsx`, `test/client/combat-reveal.test.tsx`.

- [ ] **Step 1: Failing test** (fake `DiceTray` via a mocked handle; fake timers for replay)

```tsx
// test/client/combat-reveal.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CombatReveal } from "../../src/clients/risk/CombatReveal";

describe("CombatReveal live mode", () => {
  it("drives the combat and calls onResolved with the posted outcome", async () => {
    const onResolved = vi.fn();
    render(
      <CombatReveal
        mode="live"
        from="A"
        to="B"
        force={4}
        defenders={2}
        attackerColor="#c33"
        defenderColor="#36c"
        // injected deterministic rolls so the test is stable
        rollAttacker={async (n: number) => Array(n).fill(6)}
        rollDefender={async (n: number) => Array(n).fill(1)}
        onResolved={onResolved}
      />,
    );
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    const out = onResolved.mock.calls[0][0];
    expect(out.captured).toBe(true);
    expect(out.rounds.length).toBeGreaterThan(0);
    expect(screen.getByText(/captured/i)).toBeInTheDocument();
  });
});

describe("CombatReveal replay mode", () => {
  it("steps recorded rounds and shows the result", async () => {
    vi.useFakeTimers();
    render(
      <CombatReveal
        mode="replay"
        from="A"
        to="B"
        attackerColor="#c33"
        defenderColor="#36c"
        rounds={[
          { aDice: [6, 6], dDice: [1] },
          { aDice: [6], dDice: [2] },
        ]}
        captured
      />,
    );
    await vi.runAllTimersAsync();
    expect(screen.getByText(/captured/i)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run test/client/combat-reveal.test.tsx`

- [ ] **Step 3: Implement** (the injected `rollAttacker`/`rollDefender` default to driving the real `<DiceTray>` handles; tests inject deterministic fakes)

```tsx
// src/clients/risk/CombatReveal.tsx
import { useEffect, useRef, useState } from "react";
import { DiceTray, type DiceTrayHandle } from "../shared/DiceTray";
import { driveCombat } from "./combat-rules";

type Rolls = (n: number) => Promise<number[]>;

interface CommonProps {
  from: string;
  to: string;
  attackerColor: string;
  defenderColor: string;
}
type LiveProps = CommonProps & {
  mode: "live";
  force: number;
  defenders: number;
  rollAttacker?: Rolls;
  rollDefender?: Rolls;
  onResolved: (out: import("../shared/contracts/risk").ResolvedCombat) => void;
};
type ReplayProps = CommonProps & {
  mode: "replay";
  rounds: { aDice: number[]; dDice: number[] }[];
  captured: boolean;
};
type Props = LiveProps | ReplayProps;

const STEP_MS = 700;

export function CombatReveal(props: Props) {
  const atkRef = useRef<DiceTrayHandle>(null);
  const defRef = useRef<DiceTrayHandle>(null);
  const [round, setRound] = useState<{ aDice: number[]; dDice: number[] } | null>(
    null,
  );
  const [done, setDone] = useState<boolean | null>(null); // captured?
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (props.mode === "live") {
      const ra: Rolls =
        props.rollAttacker ?? ((n) => atkRef.current!.roll(n));
      const rd: Rolls =
        props.rollDefender ?? ((n) => defRef.current!.roll(n));
      driveCombat({
        force: props.force,
        defenders: props.defenders,
        rollAttacker: ra,
        rollDefender: rd,
        onRound: (r) => setRound({ aDice: r.aDice, dDice: r.dDice }),
      }).then((out) => {
        setDone(out.captured);
        props.onResolved(out);
      });
      return;
    }

    // replay: step recorded rounds on a timer
    let i = 0;
    const tick = () => {
      if (i >= props.rounds.length) {
        setDone(props.captured);
        return;
      }
      setRound(props.rounds[i]);
      i += 1;
      setTimeout(tick, STEP_MS);
    };
    tick();
  }, [props]);

  return (
    <div className="combat-reveal">
      <div className="combat-reveal__head">
        {props.from} → {props.to}
      </div>
      <div className="combat-reveal__trays">
        <div className="tray atk" style={{ ["--die" as any]: props.attackerColor }}>
          <DiceTray ref={atkRef} themeColor={props.attackerColor} />
          <span className="pips atk">{(round?.aDice ?? []).join(" ")}</span>
        </div>
        <span className="vs">vs</span>
        <div className="tray def" style={{ ["--die" as any]: props.defenderColor }}>
          <DiceTray ref={defRef} themeColor={props.defenderColor} />
          <span className="pips def">{(round?.dDice ?? []).join(" ")}</span>
        </div>
      </div>
      {done !== null && (
        <div className={`combat-reveal__result ${done ? "won" : "lost"}`}>
          {done ? "Captured" : "Repulsed"}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run — PASS.** `npx vitest run test/client/combat-reveal.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/clients/risk/CombatReveal.tsx test/client/combat-reveal.test.tsx
git commit -m "feat(risk): round-by-round CombatReveal (live + replay) with 3D dice"
```

### Task 4.8: `<RiskApp>` orchestration + `main.tsx`

Ports `app.js` orchestration: `useGameState`, `pending` selection state, `pick()`, phase routing, combat seed-on-load (`shouldReplay`), and the new combat flow — when the player commits an attack, mount `<CombatReveal mode="live">`; on `onResolved`, `post({type:'attack',payload:{from,to,resolved}})`. When a *new* `lastCombat` arrives from the server (bot attack) and `shouldReplay` says so, mount `<CombatReveal mode="replay">`.

**Files:**
- Create: `src/clients/risk/RiskApp.tsx`, `src/clients/risk/main.tsx`
- Create: `test/client/risk-app.test.tsx`
- Delete: `plugins/risk/client/app.js` after green

- [ ] **Step 1: Failing test** (smoke: renders board + bar from a mocked `useGameState`)

```tsx
// test/client/risk-app.test.tsx
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const view = {
  phase: "attack",
  currentPlayer: 0,
  youAre: 0,
  territories: { A: { owner: 0, armies: 5 }, B: { owner: 1, armies: 2 } },
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
    ctx: { opponentColor: "#36c", yourColor: "#c33" },
  }),
}));

beforeEach(() => {
  if (!customElements.get("dice-tray")) {
    customElements.define("dice-tray", class extends HTMLElement {});
  }
});

describe("RiskApp", () => {
  it("renders the banner and board for an in-progress game", async () => {
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    render(<RiskApp />);
    await waitFor(() =>
      expect(screen.getByText(/Phase: attack/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /done attacking/i }),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — FAIL.** `npx vitest run test/client/risk-app.test.tsx`

- [ ] **Step 3: Implement `RiskApp.tsx`**

```tsx
// src/clients/risk/RiskApp.tsx
import { useState, useRef } from "react";
import { useGameState } from "../shared/useGameState";
import type { RiskView, RiskAction } from "../shared/contracts/risk";
import { adjust } from "./deploy-plan";
import { shouldReplay } from "./combat-signature";
import { Board } from "./Board";
import { ActionBar, type Pending } from "./ActionBar";
import { ContinentRail } from "./ContinentRail";
import { History } from "./History";
import { EndScreen } from "./EndScreen";
import { ExitControls } from "./ExitControls";
import { CombatReveal } from "./CombatReveal";

export function RiskApp() {
  const { view, post, ctx } = useGameState<RiskView, RiskAction>();
  const [pending, setPending] = useState<Pending>({});
  const [live, setLive] = useState<{ from: string; to: string; force: number } | null>(
    null,
  );
  const seenSig = useRef<string | null | undefined>(undefined);

  if (!view) return <div className="banner">Loading…</div>;
  if (view.phase === "gameover") return <EndScreen view={view} />;

  const attackerColor = ctx.yourColor ?? "#c33";
  const defenderColor = ctx.opponentColor ?? "#36c";

  function pick(id: string) {
    const ph = view!.phase;
    if (ph === "setup" || ph === "reinforce") {
      if (view!.territories[id]?.owner === view!.youAre) {
        const pool =
          ph === "setup"
            ? view!.setupPools[view!.youAre as 0 | 1]
            : view!.reinforcePool;
        setPending({
          plan: adjust(pending.plan ?? {}, id, 1, pool),
          deployTarget: id,
        });
      }
    } else if (ph === "attack" || ph === "fortify") {
      if (!pending.from) setPending({ from: id });
      else if (!pending.to) setPending({ ...pending, to: id });
      else setPending({ from: id });
    }
  }

  // Bot-attack replay: a new lastCombat the player did not just cause.
  const { signature, replay } = shouldReplay(seenSig.current, view.lastCombat);
  seenSig.current = signature;

  return (
    <div>
      <div className="banner">
        {`Phase: ${view.phase} · ${
          view.youAre === view.currentPlayer ? "Your move" : "Opponent"
        }`}
        <ExitControls
          onResign={() => {
            if (
              window.confirm(
                "Resign this game? You forfeit — your opponent wins.",
              )
            ) {
              post({ type: "resign" });
            }
          }}
        />
      </div>

      <ContinentRail view={view} />

      <Board
        view={view}
        onPick={pick}
        selected={pending.from ?? pending.deployTarget ?? null}
        plan={pending.plan}
        to={pending.to ?? null}
      />

      {live && (
        <CombatReveal
          mode="live"
          from={live.from}
          to={live.to}
          force={live.force}
          defenders={view.territories[live.to].armies}
          attackerColor={attackerColor}
          defenderColor={defenderColor}
          onResolved={(resolved) => {
            setLive(null);
            setPending({});
            post({
              type: "attack",
              payload: { from: live.from, to: live.to, resolved },
            });
          }}
        />
      )}

      {!live && replay && view.lastCombat && (
        <CombatReveal
          mode="replay"
          from={view.lastCombat.from}
          to={view.lastCombat.to}
          attackerColor={attackerColor}
          defenderColor={defenderColor}
          rounds={view.lastCombat.rounds}
          captured={view.lastCombat.captured}
        />
      )}

      <ActionBar
        view={view}
        pending={pending}
        post={post}
        setPending={setPending}
        onAttack={(from, to) => {
          const f = view.territories[from];
          setLive({ from, to, force: f.armies - 1 });
        }}
      />

      <History log={view.log} />
    </div>
  );
}
```

- [ ] **Step 4: Implement `main.tsx`**

```tsx
// src/clients/risk/main.tsx
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import { RiskApp } from "./RiskApp";

const root = document.getElementById("risk-root");
if (root) {
  createRoot(root).render(
    <ErrorBoundary>
      <RiskApp />
    </ErrorBoundary>,
  );
}
```

- [ ] **Step 5: Run — PASS**

Run: `npx vitest run test/client/risk-app.test.tsx`
Expected: PASS.

- [ ] **Step 6: Delete superseded app.js + commit**

```bash
git rm plugins/risk/client/app.js
git add src/clients/risk/RiskApp.tsx src/clients/risk/main.tsx test/client/risk-app.test.tsx
git commit -m "feat(risk): RiskApp orchestration + main entry; combat theatre wired"
```

---

## Phase 5 — Build, swap, clean, regress

### Task 5.1: Update `index.html` for the bundled entry

`index.html` must keep loading `public/shared/dice.js` (defines `<dice-tray>`) and load the built `app.js`. The dead `opponent-card` includes (never instantiated by Risk) are removed.

**Files:** Modify `plugins/risk/client/index.html`

- [ ] **Step 1: Replace the file body**

```html
<!-- plugins/risk/client/index.html -->
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>Risk</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main id="risk-root" aria-live="polite"></main>
  <script type="module" src="/shared/dice.js"></script>
  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add plugins/risk/client/index.html
git commit -m "refactor(risk): index.html loads dice.js + bundled app.js"
```

### Task 5.2: Build the Risk bundle

- [ ] **Step 1: Build**

Run: `GAMEBOX_PLUGIN=risk npx vite build --config vite.config.client.js`
Expected: writes `plugins/risk/client/app.js` (+ `app.js.map`); preserves `index.html`, `style.css`, `assets/`.

- [ ] **Step 2: Sanity-check the output exists and is an ES bundle**

Run: `head -c 200 plugins/risk/client/app.js && echo && ls plugins/risk/client`
Expected: bundled JS; directory still has `index.html`, `style.css`, `assets/chart-of-the-world.png`, `app.js`, `app.js.map`.

- [ ] **Step 3: Commit the built artifact** (the repo already commits `public/shared/dice.js`; built clients follow the same convention)

```bash
git add plugins/risk/client/app.js plugins/risk/client/app.js.map
git commit -m "build(risk): built React app.js bundle"
```

### Task 5.3: Rewrite the client-files test for the new shape

`test/risk-client-files.test.js` asserts 12 vanilla modules. After migration the deliverable is `index.html`, `style.css`, built `app.js`, and the map asset.

**Files:** Modify `test/risk-client-files.test.js`

- [ ] **Step 1: Replace the file**

```js
// test/risk-client-files.test.js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

// Post-React-migration deliverable: a built bundle + static shell + assets.
// Component sources live in src/clients/risk/ and are covered by vitest.
for (const f of ['index.html', 'style.css', 'app.js', 'assets/chart-of-the-world.png']) {
  test(`risk client has ${f}`, () => {
    assert.ok(existsSync(resolve(root, 'plugins/risk/client', f)), `missing ${f}`);
  });
}

test('risk React sources exist in src/clients', () => {
  for (const f of ['main.tsx', 'RiskApp.tsx', 'Board.tsx']) {
    assert.ok(
      existsSync(resolve(root, 'src/clients/risk', f)),
      `missing src/clients/risk/${f}`,
    );
  }
});
```

- [ ] **Step 2: Run it**

Run: `node --test test/risk-client-files.test.js`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add test/risk-client-files.test.js
git commit -m "test(risk): client-files test asserts post-migration shape"
```

### Task 5.4: Full regression + manual parity checklist

- [ ] **Step 1: Server suite (node --test)**

Run: `npm test`
Expected: PASS — entire `test/**/*.test.js` suite green, including `risk-actions-*`, `risk-combat*`, `risk-full-game`, `risk-map-geometry`, `risk-view`, `risk-client-files`, `ai-*`. Investigate and fix any failure before proceeding.

- [ ] **Step 2: Client suite (vitest)**

Run: `npm run test:client`
Expected: PASS — every `test/client/**/*.test.{ts,tsx}` green.

- [ ] **Step 3: Type-check the client sources**

Run: `npx tsc -p tsconfig.client.json --noEmit`
Expected: PASS — no type errors.

- [ ] **Step 4: Manual parity + dice theatre (run the server, play Risk)**

Start the server (`npm start`), open a Risk game, and verify:
- [ ] Setup deploy, reinforce deploy, fortify, end-turn, resign, Lobby link, end screen all behave as before the migration.
- [ ] Board renders identically (antique map, tokens, selection ring, march arrow, continent rail).
- [ ] Error boundary: force a render throw (e.g. temporarily reference a bad territory id in a dev build) → recoverable panel with Lobby + Reload, never a blank screen.
- [ ] **Your attack:** committing an attack plays out **round by round** with two 3D dice trays auto-rolling (no drag), attacker tinted to your color, defender to the opponent's; army tally decrements visibly; final Captured/Repulsed banner; the server applies the outcome (territory/army state matches the dice you watched).
- [ ] **Inconsistent outcome rejected:** (dev check) tampering the posted `resolved` is rejected by the server (no state change) and the client resyncs.
- [ ] **Bot attack:** when the AI attacks you, its combat replays round-by-round in the same theatre from the server's recorded rounds.
- [ ] SSE: opponent/bot move pushes an update and the board refreshes.

- [ ] **Step 5: Commit any fixes, then finalize**

```bash
git add -A
git commit -m "test(risk): Cycle 1 regression green; parity verified"
```

---

## Self-Review

**Spec coverage (against `2026-05-18-react-frontend-migration-design.md` incl. Amendment A):**
- §4.1/§4.2 build pipeline → Task 0.3, 5.2. §4.3 server unchanged except Risk attack → Phase 3 only touches `combat.js`/`actions.js`. §5.2 `useGameState` → 1.2. §5.3 contracts/drift → 1.1, 2.1. §5.4 ErrorBoundary/DiceTray → 1.3, 1.4. §7 errors → 1.2 (post/reconnect), 1.3 (boundary). §8 testing → every task is TDD; suites split node/vitest (0.2). §9 Cycle 1 = this plan. §10 AC → Task 5.4 checklist. Amendment A.1 protocol → 3.1, 3.2; A.2 components → 4.7; A.3 rules shared client/server → 2.4 (client) + 3.1 (server validator); A.4 testing/AC → 3.x tests + 5.4.
- Cycles 2–7 (other games, lobby) are explicitly out of scope (spec §9) — not in this plan.

**Placeholder scan:** one intentional RED marker in Task 4.6 Step 3 (`throw new Error("port me")`) with an explicit "do not commit with the throw present" gate and the verbatim-port instruction (board.js:19–196). No other TBD/TODO; every code step is complete.

**Type consistency:** `RiskView`/`RiskAction`/`ResolvedCombat` defined in 1.1 are used unchanged in 2.4, 4.5, 4.7, 4.8. `DiceTrayHandle.roll` (1.4) is the type consumed by `CombatReveal` (4.7). `driveCombat` args/return (2.4) match `replayAttack` semantics (3.1) and the `resolved` payload shape in the contract (1.1) and the server handler (3.2). `Pending` is defined in 4.5 and imported by 4.8. `useGameState` return shape (1.2) matches its consumption in 4.8.

**Open risk flagged for the executor (not a placeholder — a verification gate):** the real `<dice-tray>.throw()` granularity (one call per die vs one per roll) is documented in 1.4 and must be confirmed against the prebuilt bundle during 5.4; `roll()` adjusts accordingly. The client-resolved army bookkeeping in 3.2 is gated on satisfying the existing `risk-actions-attack`/`risk-full-game` suites (treated as the army-math spec).
