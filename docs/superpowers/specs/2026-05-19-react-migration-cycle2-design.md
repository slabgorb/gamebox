# React Frontend Migration — Cycle 2 Design

**Status:** Design (game selection + shared-layer gaps; pending implementation plan)
**Date:** 2026-05-19
**Parent spec:** `docs/superpowers/specs/2026-05-18-react-frontend-migration-design.md`
**Predecessor:** Cycle 1 plan `docs/superpowers/plans/2026-05-18-react-frontend-migration-cycle1.md` (Risk + shared foundation) + parity tail `docs/superpowers/plans/2026-05-19-cycle1-dicetray-parity-fixes.md`.

---

## 1. Motive

Cycle 1 proved the per-plugin Vite library build, the shared `useGameState` hook, and the `<dice-tray>` wrapper on a single game (Risk). Cycle 2's purpose is **not** to add features — it is to:

1. Convert a second plugin to the React paradigm (so the pattern stops being "the Risk way" and becomes "the gamebox way").
2. **Fill the two remaining shared-layer gaps** (`<OpponentCard>`, `<GameChrome>`) that the parent spec §5 promised but Cycle 1 deferred (Risk's own action bar + end screen filled their roles).
3. Surface and fix any second-game friction in the shared layer before fanning out to cycles 3–6.

A second migration is where the abstraction either generalises or doesn't. We want to discover that on a small game, not on the largest one.

---

## 2. Current State

**Done in Cycle 1:**

- `tsconfig.client.json`, `vitest.config.ts`, `vite.config.client.js`, `scripts/build-clients.mjs`.
- `src/clients/shared/`: `useGameState`, `ErrorBoundary`, `DiceTray` (with the `throwAll` parity fix), Risk view/action TS contracts + drift guard.
- `src/clients/risk/` fully ported, bundled to `plugins/risk/client/app.js`.
- Server protocol: Risk attacks are client-resolved, server validates via `replayAttack`.

**Gaps that block any non-Risk game:**

- `src/clients/shared/OpponentCard.tsx` — Cycle-1 spec §5.4 listed this as in scope; Risk did not need it (no opponent card surface), so it was deferred. Every other game (words, cribbage, backgammon, buraco, rummikub) renders an opponent card.
- `src/clients/shared/GameChrome.tsx` — page shell with status line + leave/resign controls. Risk's `<ExitControls>` and `<EndScreen>` are bespoke; the other games share a chrome that should live in `shared/`.
- Generic game-view contract. Cycle 1 wrote a Risk-specific contract (`contracts/risk.ts`). Each game will get its own, but a base `GameView<T>` / `GameAction<T>` shape can hoist the common envelope (gameId, players, activeUserId, you, scores, history) so per-game contracts only specify the delta.

**State of shared assets:**

- `public/shared/opponent-card.js` + `.css` — the vanilla source of truth for the port.
- `public/shared/dice.js` — already wrapped (Cycle 1).
- `public/shared/cards/` — card sprite assets; consumed by words/cribbage/buraco/rummikub vanilla clients today. Stays as a static asset; React components reference URLs the same way the vanilla code does.

---

## 3. Decisions

**3.1 — Pick the second game by build size, not by user demand.**

Module count (vanilla client `.js` files per plugin):

| Game       | Modules | Has dice? | Has opponent card? | Has cards? |
|------------|---------|-----------|--------------------|------------|
| cribbage   | 6       | no        | yes                | yes        |
| buraco     | 6       | no        | yes                | yes        |
| backgammon | 15      | **yes**   | yes                | no         |
| words      | 12      | no        | yes                | tile rack  |
| rummikub   | 14      | no        | yes                | tile rack  |

**Decision:** **Cribbage** is Cycle 2. Six modules, no dice (defers any dice-tray polish to a later cycle that needs it), has an opponent card (forces the `<OpponentCard>` port — exactly the shared-layer gap we need to close), has card assets (forces a `<Card>` shared component to exist, which seeds cycles 3+5+6). It is the smallest game that exercises the most shared-layer gaps simultaneously.

**Buraco** is also six modules but is Sonia's game (memory: pt-BR conventions, Brazilian rules) and has more bespoke scoring UX — a worse "shake the pattern" subject. Pick it for Cycle 3 once chrome is settled.

**3.2 — Promote `<Card>` to the shared layer in Cycle 2.**

Every card game in cycles 2/3/5/6 needs the same `<Card>` primitive (suit/rank → sprite URL → `<img>`). Cribbage's port creates the primitive in `src/clients/shared/Card.tsx`; cycles 3/5/6 consume it as-is. Tile-rack games (words, rummikub) are not blocked by this decision — they get their own `<Tile>` primitive later.

**3.3 — Keep per-game contracts per-game.**

Resist the urge to write a `contracts/base.ts` that all games extend. We have one example (Risk) — that's not enough to abstract. Cribbage gets its own `contracts/cribbage.ts`. After cycle 3 we will have three examples and can re-evaluate.

**3.4 — Server is untouched.**

No Amendment-A-style protocol changes in Cycle 2. Cribbage's pegging, show, and crib mechanics are server-resolved today and stay that way. The reason Cycle 1 had Amendment A was Risk-specific (visible round-by-round combat); cribbage has no analogous user-facing surface that benefits from client-resolution.

---

## 4. Target Architecture

Identical to parent spec §4. New files only:

```
src/clients/
  shared/
    OpponentCard.tsx     # port of public/shared/opponent-card.js + .css
    GameChrome.tsx       # status line, leave/resign, error boundary mount
    Card.tsx             # suit/rank → asset URL → <img>
    contracts/
      cribbage.ts        # CribbageView, CribbageAction, drift guard target
  cribbage/
    main.tsx
    CribbageApp.tsx
    Hand.tsx             # port of plugins/cribbage/client/hand.js
    PegBoard.tsx         # port of peg-board.js
    Pegging.tsx          # port of pegging.js
    Show.tsx             # port of show.js
    sounds.ts            # port of sounds.js (no React, just a module)
```

Built to `plugins/cribbage/client/app.js` via `GAMEBOX_PLUGIN=cribbage npx vite build --config vite.config.client.js`. Vanilla modules are deleted at the end of Cycle 2 (parent spec §10 AC carries over).

---

## 5. Shared Layer Additions

### 5.1 `<OpponentCard>`

Verbatim semantic port of `public/shared/opponent-card.js`. Inputs: opponent name, portrait URL, score, status text (e.g. "waiting", "pegging…"), is-active highlight. CSS lifted from `opponent-card.css` either inline (CSS modules) or imported as a side-effect — match whatever convention the cycle-1 Risk components settled on.

### 5.2 `<GameChrome>`

Wraps every game-app root. Props: `title`, `status` slot, `controls` slot (typically a Lobby link + Resign button), `onLeave`, `onResign`. Renders the status line + the children prop (the game's main surface). Replaces the per-game `<ExitControls>` pattern in cycle 1.

Risk's existing `<ExitControls>` + `<EndScreen>` are **not** retrofitted into `<GameChrome>` in this cycle. That's a sweep for Cycle 7 (or whenever we've ported all six games and have enough variance to design the right shell).

### 5.3 `<Card>`

Stateless. Inputs: `suit`, `rank`, optional `faceDown`. Resolves to `/shared/cards/<id>.svg` (the existing asset path). No drag/flip behaviour — those are game-specific overlays that consumers add.

---

## 6. Out of Scope (Cycle 2)

- Words, backgammon, buraco, rummikub — each is its own cycle.
- Lobby (`public/lobby/`) — Cycle 7.
- Visual redesign of cribbage. Pure paradigm port.
- Retrofitting Risk to use `<GameChrome>`. Risk's bespoke shell is good enough until the shell pattern is proven on ≥2 games.
- AI behaviour changes. Cribbage AI is server-side and untouched.

---

## 7. Acceptance Criteria (Cycle 2)

- `src/clients/shared/` gains `OpponentCard.tsx`, `GameChrome.tsx`, `Card.tsx`.
- `src/clients/cribbage/main.tsx` builds to `plugins/cribbage/client/app.js` via `GAMEBOX_PLUGIN=cribbage`.
- `plugins/cribbage/client/index.html` loads `app.js` (no other JS).
- Vanilla files removed from `plugins/cribbage/client/` except `index.html`, `style.css`, `app.js`, `app.js.map`, `assets/`, `sounds/`.
- Server suite (`npm test`) remains green; no `src/server/**` changes.
- Vitest covers: `<OpponentCard>` (renders/highlights), `<GameChrome>` (slots + leave/resign callbacks), `<Card>` (asset URL resolution), cribbage drift guard, key cribbage component behaviour (Hand selection, PegBoard rendering from a view fixture).
- Manual parity: cribbage plays identically to the pre-migration client (deal, discard to crib, pegging, show, crib show, scoring, win, opponent banter pushed via SSE).

---

## 8. Risks

- **`<OpponentCard>` CSS drift.** The vanilla `.css` is loaded as a `<link>` today; bundling it via Vite changes the cascade order. Mitigation: import the CSS file from `OpponentCard.tsx` so Vite emits it adjacent to `app.js`; verify visually in parity step.
- **Card sprite path coupling.** Vanilla cribbage builds card URLs from runtime strings; the React port must use the same path scheme or assets 404. Mitigation: keep `Card.tsx` exclusively constructing `/shared/cards/<id>.svg`; do not relocate assets.
- **Second-game discovery.** Cycle 2's whole point is exposing shared-layer rough edges. Expect 1–2 refactors of `useGameState` or `<ErrorBoundary>` mid-cycle. Budget for it; do not treat them as scope creep.

---

## 9. Decomposition Hint (for the Cycle 2 plan author)

Suggested phase structure (analogous to Cycle 1 but smaller):

- **Phase 0:** No infra work — Cycle 1 already built it.
- **Phase 1:** Shared additions (`<OpponentCard>`, `<GameChrome>`, `<Card>`) with vitest coverage.
- **Phase 2:** Cribbage TS contract + drift guard (mirrors Cycle 1 Task 1.1).
- **Phase 3:** Cribbage components (Hand → PegBoard → Pegging → Show → CribbageApp).
- **Phase 4:** Build, swap index.html, delete vanilla modules, full regression + parity.

No Phase 3-equivalent server work (no Amendment-A in this cycle).
