# React Frontend Migration — Design

**Date:** 2026-05-18
**Status:** Approved (design); **Amended 2026-05-18** — see Amendment A;
Cycle 1 ready for planning
**Scope of this document:** The full target architecture for moving the
gamebox frontend to React, plus the complete specification of **Cycle 1**
(shared foundation + Risk pilot). Cycles 2–7 inherit this architecture and
get their own short specs referencing this one.

---

## Amendment A (2026-05-18) — Risk combat becomes client-resolved + visible

This amendment supersedes the conflicting clauses noted below. It exists
because the original spec treated Risk as a faithful paradigm port; the
user has since redefined the Risk pilot to also fix a gameplay-legibility
problem and add auto-rolling 3D dice.

**Problem being solved:** a whole multi-round Risk attack collapses into a
single server result. The player commits an attack, loses N armies, and
never sees the round-by-round attrition that produced it. Combat is
opaque and undramatic.

**Decisions (user-directed, override the spec where they conflict):**

1. **Client-side trust is explicitly a non-concern.** Risk is a casual
   game played among friends/family; combat integrity is not defended.
2. **Risk combat becomes client-resolved for human-initiated attacks.**
   The `attack` action no longer means "server rolls everything and
   returns a summary." The attacker's client **auto-rolls each combat
   round** with the real 3D dice (`<dice-tray>` driven programmatically
   via its `.throw()` method — physics, but no drag gesture; the player
   watches), applies standard Risk per-round attrition **visibly, round
   by round**, and when the attack ends POSTs the resolved outcome. The
   server **validates and applies** that outcome.
3. **Bot-initiated attacks stay server-resolved** (a bot has no client to
   roll). The client animates the server's recorded `lastCombat.rounds`
   in the **same round-by-round reveal UI**. These dice are server-picked
   (physics cannot be forced to a predetermined value, and the dice-lib
   is intentionally not modified — see Amendment rationale); per
   decision 1 this asymmetry is acceptable. The visual structure
   (attacker vs defender, per round, attrition shown) is identical to the
   physics path; only the die rendering differs (3D tumble for the
   player's own attacks vs styled per-round display for replayed bot
   results).
4. **The dice-lib (`@local/dice-lib`) is NOT modified.** It is used
   exactly as built (`<dice-tray>` + programmatic `.throw()`). The
   earlier idea of adding a forced-outcome mode is rejected.

**Clauses superseded by this amendment:**

- **§4.3 / §11 "no server changes" / "no server or protocol change":**
  superseded *only* for the Risk `attack` action. The Risk combat
  protocol changes (client posts a resolved combat outcome; server
  validates + applies; existing server-side resolution retained for bot
  attacks and as the validator). All *other* server surfaces
  (`plugin-clients.js`, `window.__GAME__`, SSE transport, `express.static`)
  remain unchanged.
- **§5.4:** `<DiceTray>` is **in scope for Cycle 1** (Risk now uses it).
  Add `<CombatReveal>` — the round-by-round combat theatre component.
- **§7 / §8 / §10 / §11:** extended by Amendment A.4 below.

**A.1 — Combat protocol (Risk `attack`)**

- Client (human attacker) computes the combat round-by-round:
  - Determine attacker/defender dice counts per standard Risk rules from
    the current territory armies and chosen force.
  - For each round: auto-roll attacker dice and defender dice via two
    `<dice-tray>` instances (programmatic `.throw()`); on settle, read
    the physics values; apply attrition (sort desc, compare highest
    pairs, loser(s) lose one army per compared pair, defender wins ties).
  - Continue rounds until the attack terminates per rules (attacker
    chooses to stop, attacker can no longer attack, or the territory is
    captured).
- Client POSTs the resolved outcome to the existing action URL:
  `{ type: 'attack', payload: { from, to, resolved: { rounds:
  [{ aDice, dDice }], attackerLosses, defenderLosses, captured } } }`.
- Server (Risk `attack` handler) **validates** the posted outcome
  (territory ownership/adjacency, dice counts legal for the declared
  force, attrition math consistent with the posted dice) and **applies**
  the army/territory deltas. On validation failure the server rejects the
  action (no state change) and the client surfaces the error and resyncs.
- Server retains its existing authoritative resolver for **bot attacks**
  (orchestrator-driven) and reuses the same validation math.

**A.2 — Components (Cycle 1, revised)**

Shared layer adds:

- `<DiceTray>` — typed React wrapper over the prebuilt `<dice-tray>`
  custom element from `public/shared/dice.js`. Exposes a `roll(count)`
  imperative handle that calls the element's `.throw()` and resolves with
  the settled values; surfaces `dice-settle` / `dice-error`.

Risk client adds:

- `<CombatReveal>` — drives the round-by-round theatre. Two modes:
  `live` (human attack: feeds rounds from sequential `<DiceTray>` rolls,
  applying attrition as each round settles) and `replay` (bot attack:
  steps through server-recorded `rounds` on a timer). Both render two
  trays/areas side by side (attacker tinted to attacker color, defender
  to defender color), a running army count, and a final
  Captured/Repulsed banner.

Risk client adds a pure module:

- `combat-rules.ts` — pure Risk attrition: dice counts for a force, and
  `resolveRound(aDice, dDice) → { attackerLoss, defenderLoss }`,
  `resolveCombat(...)`. Shared by the client resolver and the server
  validator (the server imports the same rules module to validate).

**A.3 — Combat resolution location**

`plugins/risk/server/` gains a `combat-rules` equivalent (or the existing
combat module is refactored so the *rule math* is a pure function the
client and server both call). The client *drives* resolution via dice;
the server *validates* via the same pure rules. Exact server file targets
are determined during planning by reading `plugins/risk/server/`.

**A.4 — Testing / AC / scope deltas**

- Testing: add Vitest coverage for `combat-rules` (attrition math, dice
  counts, tie-to-defender), `<DiceTray>` (mock custom element: `.throw()`
  called, settle propagated), and `<CombatReveal>` live + replay modes
  (fixture-driven, fake timers). Add server tests for the new `attack`
  validation path (accept a valid resolved outcome; reject inconsistent
  dice/attrition; bot path still server-resolved).
- AC additions (Cycle 1): a human attack plays out round-by-round with
  auto-rolling 3D dice and visible attrition; the posted outcome is
  applied by the server; an inconsistent posted outcome is rejected;
  a bot attack is shown round-by-round from server data; all server
  (`node --test`) and client (Vitest) suites green.
- Out-of-scope unchanged except: the Risk `attack` protocol change is now
  **in** scope; the dice-lib remains out of scope (unmodified).

**Cycle 1 size note:** this amendment enlarges Cycle 1 to: (1) shared
React layer, (2) Risk React port, (3) Risk combat protocol change, (4)
auto-rolling visible combat theatre. The plan keeps these as distinct
phases; (3)+(4) may be split into Cycle 1b during planning if the task
graph is too large for one execution pass.

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
