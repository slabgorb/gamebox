# React Frontend Migration — Design

**Date:** 2026-05-18
**Status:** Approved (design); Cycle 1 ready for planning
**Scope of this document:** The full target architecture for moving the
gamebox frontend to React, plus the complete specification of **Cycle 1**
(shared foundation + Risk pilot). Cycles 2–7 inherit this architecture and
get their own short specs referencing this one.

---

## 1. Motive

This is a forward move, not a rescue. The existing vanilla clients are not
considered broken. The migration is driven by:

- **Consistency with the dice.** The 3D dice tray (`src/shared/dice/index.tsx`)
  is already React; we want one paradigm and one set of component tooling
  across the whole frontend instead of two.
- **Velocity & ecosystem.** JSX, hooks, component reuse, and the
  Vitest + `@testing-library/react` workflow (all already installed).
- **Richer UI.** Headroom for animation, transitions, and interactive
  polish that is painful to express imperatively.

Explicitly *not* a motive: the current `renderX(root, view, ctx)`
imperative code being unmaintainable. We are widening a working
bridgehead, not putting out a fire.

## 2. Current State (the facts)

- Node/Express + SQLite (`better-sqlite3`) server, SSE for realtime,
  6 game plugins: risk, words, cribbage, backgammon, buraco, rummikub.
- Each plugin `client/` is **buildless raw ES modules**: `index.html`
  + imperative DOM code, served by `express.static`. The server injects
  `window.__GAME__` into `index.html` and state arrives via SSE.
- React already has a beachhead: React 19, `@react-three/fiber`,
  `@testing-library/react`, `vitest`, `@vitejs/plugin-react` installed.
  `src/shared/dice/index.tsx` is built by `vite.config.dice.js` in
  **library mode** into a single `public/shared/dice.js` ES module that
  vanilla clients import.
- Server tests run via `node --test`; Vitest is available for React.

## 3. Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Build pipeline | Per-plugin Vite build following the dice precedent | Lowest risk; Express serving + `window.__GAME__` injection unchanged; each plugin builds independently |
| Shared-code delivery | Source-shared directory bundled per plugin (Approach A) | Inherits the dice's proven `dedupe` fix; avoids the documented `file:`-dep dual-instance trap; keeps plugins independently buildable |
| Language | TypeScript (`.tsx`) | Matches the dice; typed view/action contracts |
| Sequencing | Shared foundation first, then Risk pilot, then 5 games + lobby | Hardest case (Risk) validates the pattern; remaining cycles are templated repeats |
| Server changes | None | The realtime/serving contract is correct; only the rendering layer changes |

### Approaches considered for shared-code delivery

- **A — Source-shared directory, bundled per plugin (CHOSEN).** Each plugin
  build bundles its own copy of the shared layer. Cost: duplicated
  kilobytes across per-game pages that are cached anyway — irrelevant.
- **B — Prebuilt shared runtime (dice-style), thin entries.** Rejected:
  re-introduces the externalized-React dual-instance dedupe scar
  documented in `vite.config.dice.js`; adds ordered build steps.
- **C — Internal workspace package `@gamebox/ui`.** Rejected: the
  `file:` dep model (as used by `@local/dice-lib`) is exactly what
  caused the "Multiple instances of Three.js / hooks return null" pain
  the dice config warns about. Monorepo ceremony for no benefit at this
  scale.

## 4. Target Architecture

### 4.1 Directory layout

Sources live in `src/clients/`; builds land back into each plugin's
`client/` so the server stays oblivious.

```
src/clients/
  shared/
    useGameState.ts        # SSE subscribe + action POST + bootstrap
    contracts/             # typed view/action shapes per game
      risk.ts
    DiceTray.tsx           # typed React wrapper over prebuilt dice.js
    OpponentCard.tsx       # port of public/shared/opponent-card.js
    GameChrome.tsx         # page shell, status line, leave/resign
    ErrorBoundary.tsx      # shared port of risk/client/error-boundary.js
  risk/
    main.tsx               # entry; mounts <RiskApp/> into #root
    RiskApp.tsx
    Board.tsx, ActionBar.tsx, CombatReveal.tsx, History.tsx, ...
vite.config.client.js      # ONE parametrized config; plugin id via env
```

### 4.2 Build pipeline

- **One parametrized config** `vite.config.client.js` (not six). Invoked as
  `GAMEBOX_PLUGIN=risk vite build --config vite.config.client.js`:
  reads `src/clients/<plugin>/main.tsx`, emits a single `app.js`
  (+ sourcemap) into `plugins/<plugin>/client/`.
- Mirrors the dice library-mode pattern: `react()` plugin,
  `build.lib` single ES output, `emptyOutDir: false` (preserve plugin
  assets), and the **same `dedupe` list** as `vite.config.dice.js`
  (`react`, `react-dom`, `three`, `@react-three/*`).
- `package.json` gains `build:client` and `dev:client` scripts;
  `build:client` joins `prepare` alongside `build:dice`. A small loop
  builds all migrated plugins.
- Each plugin's `index.html` continues to load `./app.js` — unchanged;
  it just happens to be a React bundle now.
- `dice.js` remains a prebuilt artifact in `public/shared/`.
  `<DiceTray>` wraps it; it is **not** rebuilt by this pipeline.

### 4.3 Server

`src/server/plugin-clients.js`, `window.__GAME__` injection,
`express.static`, and SSE are **unchanged**. This is a hard constraint:
any change forced in the server is a design deviation to be logged and
discussed, not made silently.

## 5. Shared Layer

### 5.1 Bootstrap

`window.__GAME__` (server-injected) carries:
`gameId, userId, gameType, sseUrl, actionUrl, stateUrl`, plus
opponent/persona fields (`opponentFriendlyName`, `opponentGlyph`,
`opponentColor`, `opponentPersonaId`). `main.tsx` reads it once and
passes it into `useGameState`. The set of injected fields does not change.

### 5.2 `useGameState` — the core reusable primitive

```ts
const { view, status, post } = useGameState<TView, TAction>();
//  view   : latest game state, typed per plugin
//  status : 'connecting' | 'live' | 'reconnecting' | 'ended'
//  post   : (action: TAction) => Promise<void>
```

Responsibilities (centralizing what every vanilla client does today):

1. On mount: `GET stateUrl` for the initial `view`, then open
   `EventSource(sseUrl)`.
2. On each SSE message: parse and **replace** `view` (replace, not merge —
   matches today's `render(root, view)` semantics). React re-renders.
3. `post(action)`: `POST actionUrl` with JSON body. On rejection, surface
   the error to the caller and a transient banner. **No optimistic state
   mutation** — the authoritative next state arrives via SSE. The server
   remains the single source of truth.
4. EventSource error → `status: 'reconnecting'`; rely on native
   auto-reconnect; on reopen, `GET stateUrl` to resync so a missed event
   cannot leave the client desynced.

This hook is the highest-value test surface and is covered once for all
six games.

### 5.3 Typed contracts

`src/clients/shared/contracts/<plugin>.ts` defines `<Plugin>View` and
`<Plugin>Action`. The existing **server-drift guard test** is the
mechanical source of truth; the contract is written to match it, and a
test asserts the TS type stays aligned with the server-produced fixtures.
The same guard pattern extends to each game as it migrates.

### 5.4 Shared components

- `<DiceTray>` — typed React wrapper that drives the prebuilt
  `public/shared/dice.js`. Does not rebuild dice.
- `<OpponentCard>` — port of `public/shared/opponent-card.js` and its CSS;
  consumes the injected opponent/persona fields.
- `<GameChrome>` — page shell: status line, leave/resign controls
  (ports `leave-button.js` behavior).
- `<ErrorBoundary>` — shared port of `risk/client/error-boundary.js`;
  wraps every plugin root so a render throw never blanks a game.

## 6. Data Flow

```
server SSE ──► useGameState ──► view (React state) ──► <App> tree ──► DOM
   ▲                                                       │
   └─────────── POST actionUrl ◄── post(action) ◄──── onClick
```

Unidirectional and server-authoritative. The contract is identical to
today; only the rendering layer changes from imperative to declarative.

## 7. Error Handling

| Failure | Behavior |
|---|---|
| Render throw in a component | `<ErrorBoundary>` catches it, shows a recoverable panel — never a blank screen. Wraps every plugin root. |
| SSE drops | `status: 'reconnecting'` banner; native EventSource auto-reconnect; `GET stateUrl` resync on reopen — no event-gap desync. |
| `post(action)` rejects | Transient error banner; **no optimistic state change**; the board moves only when the server's SSE confirms. A rejected action leaves the UI exactly as it was. |

## 8. Testing

- **Shared layer:** `useGameState` tested against a mock EventSource +
  `fetch` — initial fetch, message→re-render, post success/failure,
  reconnect resync. Covered once, reused by all games.
- **Components:** render with a fixture `view`; assert DOM output and that
  interactions call `post` with the correct action payload. Assert
  behavior, not internals — no implementation coupling.
- **Contract drift:** the existing Risk server-drift guard remains
  authoritative; a test asserts the `RiskView` TS type matches the
  server-produced fixtures. Pattern extends per game.
- **Server tests:** untouched (`node --test`) — the server did not change,
  so its suite is the regression anchor and must stay green throughout.

## 9. Migration Decomposition

This document specifies the architecture and **Cycle 1 in full**. Each
cycle is an independent spec→plan→implementation pass.

1. **Cycle 1 — Shared foundation + Risk pilot.** Build
   `vite.config.client.js`, the full `src/clients/shared/` layer
   (`useGameState`, contracts, `DiceTray`, `OpponentCard`, `GameChrome`,
   `ErrorBoundary`), and convert **Risk** end-to-end (map, dice, combat
   reveal, history, deploy plan, leave/resign).
   **Done when:** Risk plays identically to today, the vanilla Risk client
   is deleted, and all tests (server `node --test` + new Vitest) are green.
2. **Cycles 2–6** — words, cribbage, backgammon, buraco, rummikub. Each is
   its own short spec + plan, a templated repeat of the Risk pattern, each
   independently shippable.
3. **Cycle 7 — Lobby** (`public/lobby/`). Ported last; a different surface
   (no per-game SSE) that benefits from settled component conventions.

## 10. Acceptance Criteria (Cycle 1)

- `vite.config.client.js` builds `src/clients/risk/main.tsx` to
  `plugins/risk/client/app.js` via `GAMEBOX_PLUGIN=risk`.
- `package.json` has `build:client` / `dev:client`; `prepare` builds both
  dice and migrated clients.
- `src/clients/shared/` provides `useGameState`, `contracts/risk.ts`,
  `DiceTray`, `OpponentCard`, `GameChrome`, `ErrorBoundary`.
- Risk client is fully React; the old `plugins/risk/client/*.js` vanilla
  modules are removed; `index.html` still loads `./app.js`.
- No changes to `src/server/**`.
- Vitest suite covers `useGameState` (fetch/SSE/post/reconnect) and Risk
  component behavior; Risk contract-drift test passes.
- `node --test` server suite remains green.
- Risk is functionally indistinguishable from the pre-migration client
  (setup, deploy, attack/combat reveal, fortify, history, leave/resign,
  AI opponent, error boundary).

## 11. Out of Scope

- Any change to the server, SSE protocol, or `window.__GAME__` payload.
- Rebuilding or restructuring `dice.js` itself.
- Cycles 2–7 implementation (architecture only is fixed here).
- Visual redesign — this is a paradigm port; existing look/behavior is
  preserved unless a later cycle specs a redesign.
- State-management libraries (Redux/Zustand/etc.) — `useGameState` +
  React state is the deliberate, sufficient choice.
