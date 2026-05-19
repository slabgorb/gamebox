# Cribbage React Port — Cycle 2 Design (Brainstormed)

**Status:** Design — pending implementation plan
**Date:** 2026-05-19
**Supersedes:** `2026-05-19-react-migration-cycle2-design.md` (initial SM draft + Architect review)
**Parent spec:** `docs/superpowers/specs/2026-05-18-react-frontend-migration-design.md`
**Predecessor cycle:** `docs/superpowers/plans/2026-05-18-react-frontend-migration-cycle1.md` + parity tail `2026-05-19-cycle1-dicetray-parity-fixes.md`

This doc consolidates the brainstorm decisions from 2026-05-19 with the SM's initial scoping and the Architect's review. Read this; the predecessor doc is retained only for audit history.

---

## 1. Goal & Scope

Port the cribbage plugin's client to React, preserving identical functional behavior to the pre-migration vanilla client. The server is untouched.

**In scope:**

- New shared components in `src/clients/shared/`:
  - `<OpponentCard>` — presentational shell (portrait + name; renders nothing when no AI persona).
  - `<OpponentBanter>` — SSE-driven AI surface: bubble queue, thinking dots, stall banner with retry/abandon, trash-talk chat input.
  - `<GameChrome>` — page shell with title, status slot, controls slot, children.
  - `<Card>` — `<img>` wrapper.
  - `card-assets.ts` — thin re-export of `cardImageUrl`/`backImageUrl` from `public/shared/cards/card-element.js`.
  - `contracts/cribbage.ts` — `CribbageView`, `CribbageAction` types + drift guard.
- New cribbage React tree in `src/clients/cribbage/`: `main.tsx`, `CribbageApp.tsx`, `Hand.tsx`, `PegBoard.tsx`, `Pegging.tsx`, `Show.tsx`, `sounds.ts`.
- Cribbage `index.html` updated to load the built `app.js` only.
- Vanilla cribbage client modules deleted at end of cycle.

**Out of scope:**

- Any change to `plugins/cribbage/server/**` or `src/server/**`. No Amendment-A analogue.
- Deleting `public/shared/opponent-card.{js,css}` — still imported by words, backgammon, buraco, rummikub. Deleted in the cycle that ports the last AI-opposed game.
- Retrofitting `RiskApp` to use `<GameChrome>`. Risk's bespoke shell stays until enough games inform the right chrome API (Cycle 7-ish).
- Visual redesign. Pure paradigm port.
- AI behavior or cribbage rules changes.
- Premature shared abstractions: no `contracts/base.ts` (Architect R2), no `useSounds()` hook, no `<Tile>` primitive, no `usePrev()` hook.

**Acceptance:** cribbage plays indistinguishably from pre-migration. `npm test` green; new vitest suite green; `tsc -p tsconfig.client.json --noEmit` clean.

---

## 2. Decisions

### 2.1 SSE event architecture (Q1, locked)

`<OpponentBanter>` opens its own `EventSource` on `ctx.sseUrl`. The shared `useGameState` hook is unchanged. This is verbatim port of the vanilla pattern. The cost — two SSE connections per page — is accepted; vanilla already pays it.

The alternative (growing a `subscribe(event, handler)` API on `useGameState`) was rejected to minimize Cycle-2 footprint on the shared hook. If Cycle 3+ surfaces a third per-page event consumer the decision is revisited.

### 2.2 Phase structure (Q2, locked)

Mirrors Cycle 1. Four phases:

1. **Shared additions** (`src/clients/shared/`).
2. **Cribbage contract** + drift guard.
3. **Cribbage components** (Hand → PegBoard → Pegging → Show → sounds → CribbageApp → main).
4. **Build, swap, clean, regress.**

Plus a Phase 0 audit (verify Cycle-1 infra is unchanged; no commits).

### 2.3 Decisions inherited from the Architect review

- **R1** Cribbage is Cycle 2.
- **R2** No `contracts/base.ts` until ≥3 examples.
- **R3** Server untouched.
- **R4** `<OpponentCard>` is decomposed into a presentational shell plus `<OpponentBanter>` (SSE-driven).
- **R5** `<Card>` wraps `cardImageUrl`/`backImageUrl` from `card-element.js`; one source of truth for asset paths.
- **R6** CSS bundling: side-effect import (`import './OpponentCard.css'`); no CSS modules. The BEM `.opp-card__*` namespace already isolates.
- **R7** Transition detection (sounds): local `useRef<CribbageView | null>` in `CribbageApp`; do not modify `useGameState`.

### 2.4 Decisions locked during brainstorm

- **ctx flow** mirrors Risk: `CribbageApp` calls `useGameState`, pulls `ctx`, passes fields as props to children. Children do not call `useGameState` themselves. Exception: `<OpponentBanter>` is independent (Q1=A) and takes `sseUrl`/`gameId`/`userId` as props from `CribbageApp`.
- **Composition** of `<OpponentCard>` + `<OpponentBanter>`: `<OpponentCard><OpponentBanter /></OpponentCard>` (children prop). Required to keep `opponent-card.css` verbatim — the CSS positions bubble/stall absolutely inside `.opp-card`.
- **Sounds module destination:** `src/clients/cribbage/sounds.ts` (game-scoped). Not extracted to shared — premature abstraction with one consumer.
- **Vanilla cleanup:** `public/shared/opponent-card.{js,css}` stays in place until the last AI-opposed game ports.
- **Test approach for SSE-driven components:** mock `EventSource` in `test/client/setup.ts` (jsdom does not ship one).
- **`<GameChrome>` as pure layout slots** — no `onLeave`/`onResign` callback props. Behavior varies per game (Risk has end-screen flow; cribbage just reloads); slots are honest about what `GameChrome` is.
- **Chat input always-enabled.** Disabled only during the in-flight POST. Matches vanilla — chat sends even between turns.

---

## 3. Architecture & File Layout

No Phase-0 infrastructure work — Cycle 1 already built `vite.config.client.js`, `tsconfig.client.json`, `vitest.config.ts`, the `build-clients.mjs` driver, and the `<ErrorBoundary>`/`useGameState`/`DiceTray` shared layer.

```
src/clients/
  shared/
    OpponentCard.tsx
    OpponentCard.css          # lifted verbatim from public/shared/opponent-card.css
    OpponentBanter.tsx
    GameChrome.tsx
    Card.tsx
    card-assets.ts            # re-exports cardImageUrl/backImageUrl from card-element.js (runtime external)
    card-assets.d.ts          # ambient declaration for the runtime-resolved module
    contracts/
      cribbage.ts
  cribbage/
    main.tsx
    CribbageApp.tsx
    Hand.tsx
    PegBoard.tsx
    Pegging.tsx
    Show.tsx
    sounds.ts
```

**Modified:** `plugins/cribbage/client/index.html` (loads built `app.js` only); `test/client/setup.ts` (adds `EventSource` mock); `vite.config.client.js` (adds `rollupOptions.external` for `/shared/cards/card-element.js` — required by §4.4 import mechanics).

**Built artifact (gitignored, same convention as Risk):** `plugins/cribbage/client/app.js` + `app.js.map`.

**Deleted at end of Cycle 2 (Phase 4):** `plugins/cribbage/client/{hand.js,peg-board.js,pegging.js,show.js,sounds.js}`. Old vanilla `app.js` replaced in-place by the built bundle.

**Untouched:** `plugins/cribbage/server/**`, `plugins/cribbage/client/{sounds/*.mp3,assets/}`, `public/shared/opponent-card.{js,css}`, `public/shared/cards/card-element.js`.

**Build invocation:** `GAMEBOX_PLUGIN=cribbage npx vite build --config vite.config.client.js`. `scripts/build-clients.mjs` picks it up automatically because it scans `src/clients/<id>/main.tsx`.

---

## 4. Shared Components

### 4.1 `<OpponentCard>`

Pure presentational shell. Replaces only the structural parts of vanilla `opponent-card.js` (portrait + name). Banter/stall/chat live in `<OpponentBanter>` rendered as children.

```tsx
interface Props {
  personaId: string | null;      // null → render nothing (matches vanilla "skip render when no AI persona")
  friendlyName: string;
  color?: string | null;         // portrait background fallback
  glyph?: string | null;         // text fallback when portrait fails to load
  children?: ReactNode;          // OpponentBanter goes here
}
```

Mounts the existing `.opp-card__portrait` / `.opp-card__name` DOM verbatim so the bundled `OpponentCard.css` selectors match without edits. Returns `null` when `personaId == null`.

Tests: render with persona → portrait visible; render without persona → renders nothing; portrait `onerror` → fallback glyph shows.

### 4.2 `<OpponentBanter>`

The component the Architect's R4 carved out of the vanilla module. Owns its own `EventSource`. Approximately 120 LOC.

```tsx
interface Props {
  gameId: number;
  userId: number;
  sseUrl: string;
  friendlyName: string;          // for "X is thinking" / "X froze up" text
}
```

**Local state:** queue (string[]), showing (boolean), thinking (boolean), stalled ({reason:string} | null), myFlash (string | null).

**SSE handlers** (on its own `EventSource`, opened in `useEffect`):

- `bot_thinking` → set thinking; clear stall.
- `banter` → push text into queue; clear thinking; kick `showBubbleNext`.
- `bot_stalled` → set stalled; clear thinking.
- `update` → clear thinking.
- `user_chat` → flash my-bubble if event `userId === my userId`.

**Bubble queue:** 5s display + 400ms fade — identical timer values to vanilla.

**POSTs:**

- Chat form submit → `POST /api/games/${gameId}/chat` with `{text}`. On non-OK, flash `(failed: ${detail})` into my-bubble.
- Retry button → `POST /api/games/${gameId}/ai/retry`. On OK, clear stall.
- Abandon button → `POST /api/games/${gameId}/ai/abandon` (after `confirm()`). On OK, `location.reload()`.

**DOM:** rendered inside `.opp-card` (as children of `<OpponentCard>`); preserves vanilla class names so `OpponentCard.css` is verbatim.

**Cleanup:** `useEffect` returns `() => es.close()`. Bubble timer cleared on unmount.

**SSE reconnect:** the vanilla module doesn't reconnect; the port matches (relies on browser's built-in EventSource auto-reconnect).

Tests: mock `EventSource`; dispatch synthetic events; assert bubble text, thinking dots visible, stall banner with retry/abandon buttons, chat submit POSTs to right URL. Retry/abandon POSTs mocked via `fetch`.

### 4.3 `<GameChrome>`

Page shell. Used by `CribbageApp`. Risk does not adopt it this cycle.

```tsx
interface Props {
  title: string;
  status: ReactNode;             // slot
  controls?: ReactNode;          // slot — leave/resign/lobby link buttons
  children: ReactNode;           // main game surface
}
```

Renders a fixed header (title + status slot + controls slot) and `children` below. No leave/resign callbacks baked in. Caller composes whatever buttons they want into `controls`.

Tests: renders title; renders slots verbatim; children render below.

### 4.4 `<Card>` + `card-assets.ts`

```ts
// src/clients/shared/card-assets.ts
// @ts-expect-error — resolved at runtime via Vite externals; see vite.config.client.js
export { cardImageUrl, backImageUrl } from "/shared/cards/card-element.js";
```

**Build-time mechanics:** The path `/shared/cards/card-element.js` is a runtime URL, not a module Vite can resolve from disk. To make the import survive bundling we add `/shared/cards/card-element.js` to `rollupOptions.external` in `vite.config.client.js`. Rollup then emits the import verbatim into the bundle, and at runtime the browser fetches the file from `public/shared/cards/card-element.js` (already served by the static handler — the same way Cycle 1's `<dice-tray>` consumes the prebuilt `public/shared/dice.js`).

A sibling `card-assets.d.ts` declares the exports for the type-checker:

```ts
// src/clients/shared/card-assets.d.ts
declare module "/shared/cards/card-element.js" {
  export function cardImageUrl(card: { suit?: string; rank?: string; kind?: 'joker'; color?: string }): string;
  export function backImageUrl(n?: number): string;
}
```

This is the single source of truth for card asset URLs. Path edits go through `card-element.js`; consumers across cycles 2/3/5/6 pick them up via the runtime URL automatically.

```tsx
// src/clients/shared/Card.tsx
interface Props {
  card: { suit?: string; rank?: string; kind?: 'joker'; color?: string };
  faceDown?: boolean;
  className?: string;
}
```

Renders `<img>` with `src={faceDown ? backImageUrl() : cardImageUrl(card)}`, alt text identical to vanilla `renderCard()`. No drag/flip behavior. Cribbage consumers wrap it for clickability (`Hand` owns selection state).

Tests: face-up uses `cardImageUrl`; face-down uses `backImageUrl`; joker path delegates to the existing util.

---

## 5. Cribbage Components

### 5.1 `CribbageApp.tsx`

Orchestrator. Calls `useGameState<CribbageView, CribbageAction>()`. Renders:

- `<GameChrome>` shell with `<OpponentCard><OpponentBanter /></OpponentCard>` composed into the chrome's `controls` slot (matching vanilla layout).
- Game surface below: Hand (opponent, face-down), PegBoard, Hand (mine), phase-driven Pegging/Show/etc.

**Transition detection (R7).** One `useRef<CribbageView | null>` holds the previous view. A `useEffect` keyed on `[view]` fires `applyTransition(prevRef.current, view)` then sets `prevRef.current = view`. `applyTransition` is a plain function in the same file — four branches mapping the four vanilla transitions to `sounds.ts` calls:

- not-my-turn → my-turn (and `next.phase === 'pegging'`) → `play('your-turn')`
- `prev.phase !== 'match-end' && next.phase === 'match-end'` → `play('cheer-100')`; skunk (loser < 91) → `setTimeout(play('cheer-50'), 600)`
- `prev.phase === 'show' && next.phase === 'discard'` → render a deal-summary toast (4500ms)
- per-side score delta > 0 (and not match-end) → `playForScore(delta)`

`applyTransition` lives inline in `CribbageApp.tsx` for now. If a second game needs the prev-state pattern, extract to a shared module then; not now.

**Action posting:** thin callbacks (`onDiscard`, `onCut`, `onPlay`, `onShowAck`, `onResign`) call `post(action)`. Error surface (`actionError` from `useGameState`) rendered as a dismissible toast, same pattern as Risk's `RiskApp`.

**Audio priming:** one-time `useEffect` adds `document.addEventListener('click', primeAudio, { once: true })` — matches vanilla "first interaction primes Audio".

**Toast/skunk-banner state:** local `useState`. Toast text + a setTimeout to clear. Skunk banner derived from view + win-side.

### 5.2 `Hand.tsx`

Port of `hand.js` (39 LOC). Renders cards via `<Card>`. Owns local selection state (`useState<Set<cardId>>`). Variants driven by props:

- **My hand, `phase='discard'`** → up to 2 selectable; `onConfirmDiscard(ids)` fires when 2 selected + parent's confirm button is clicked.
- **My hand, `phase='pegging'`** → cards filtered via `isPlayable()` (from `Pegging.tsx`); click plays the card.
- **My hand, `phase='show'`** → display only.
- **Opponent hand** → shows back of each card, count-driven from `view.hands[opp].count`.

Tests: discard mode permits exactly 2 selections; pegging mode disables unplayable cards; show mode is read-only; opponent hand renders N backs.

### 5.3 `PegBoard.tsx`

Port of `peg-board.js` (189 LOC — the bulk of cribbage). Renders the scoring track. Inputs:

- `scores: [number, number]`
- `prevScores: [number, number]` (server-provided; drives trailing peg)
- `matchTarget: number` (121 default)

Stateless SVG. Verbatim geometry port. Same approach as Risk's `Board.tsx` verbatim SVG port.

Tests: peg positions correct at `[0,0]` and a sample mid-game position; trailing peg uses `prevScores`.

### 5.4 `Pegging.tsx`

Port of `pegging.js` (31 LOC). Renders the running-count strip. Inputs:

- `pegging: CribbageView['pegging']` (running, plays so far, last-play)
- `isMyTurn: boolean`
- `onPlay(cardId)` callback

Exports `isPlayable(card, runningTotal)` as a pure function (consumed by `Hand.tsx`).

Tests: renders running total; emits `onPlay` on click; pure `isPlayable` table-driven.

### 5.5 `Show.tsx`

Port of `show.js` (81 LOC). Renders the show-phase breakdown. Inputs:

- `showBreakdown: CribbageView['showBreakdown']`
- `starter: Card`
- `crib: CribbageView['crib']`
- `onAcknowledge: () => void`

Tests: renders breakdown lines from a fixture; "Continue" fires `onAcknowledge`.

### 5.6 `sounds.ts`

Verbatim TS port of `sounds.js` (75 LOC). Exports `play(name)`, `playForScore(delta)`, `primeAudio()`, `isMuted()`, `toggleMuted()`. Sound asset paths stay `sounds/click.mp3` etc. — relative to `plugins/cribbage/client/`, which is where the built bundle lives. localStorage key `cribbage.muted` preserved.

No tests beyond a smoke import (audio is not exercised in jsdom).

### 5.7 `main.tsx`

Same shape as Risk's `main.tsx`:

```tsx
import { createRoot } from "react-dom/client";
import { ErrorBoundary } from "../shared/ErrorBoundary";
import { CribbageApp } from "./CribbageApp";

const root = document.getElementById("cribbage-root");
if (root) {
  createRoot(root).render(
    <ErrorBoundary>
      <CribbageApp />
    </ErrorBoundary>
  );
}
```

The `cribbage-root` element comes from the updated `index.html`.

---

## 6. Data Flow

Single source of truth is the server. Two independent SSE streams per page (the cost of §2.1):

- **Stream A** — `useGameState`'s `EventSource`. Listens to `update`, `ended`. Triggers `resync()` which re-fetches state and re-renders.
- **Stream B** — `<OpponentBanter>`'s own `EventSource`. Listens to `bot_thinking`, `banter`, `bot_stalled`, `update`, `user_chat`. Drives local banter state only.

`CribbageApp` reads `view`/`post`/`ctx` from `useGameState`, threads them to children. `<OpponentBanter>` is independent — it takes `sseUrl`/`gameId`/`userId` as props and runs its own loop.

User actions: cribbage actions POST through `useGameState.post` (resyncs on success); chat/retry/abandon POSTs are owned by `<OpponentBanter>` directly.

---

## 7. Error Handling

- **Network on action POST** — `useGameState.post` throws and sets `actionError`. `CribbageApp` renders a dismissible toast, same pattern as Risk's `RiskApp`.
- **SSE reconnect (game stream)** — `useGameState` already handles via `status: 'reconnecting'`. `<GameChrome>`'s `status` slot surfaces it.
- **SSE reconnect (banter stream)** — vanilla doesn't reconnect; port matches (relies on EventSource auto-reconnect). No UI surface.
- **Chat POST failure** — flash `(failed: ${detail})` into my-bubble. Verbatim port.
- **Retry/abandon POST failure** — `alert(...)`. Verbatim port. Yes, `alert()` — matches vanilla.
- **Component render error** — Cycle-1 `<ErrorBoundary>` wraps `<CribbageApp>` in `main.tsx`. Recovery panel with Lobby + Reload.
- **Audio play rejection** — `.catch(() => {})` swallows autoplay-blocked promise rejection. Verbatim port.

---

## 8. Testing

Server suite (`node --test`) untouched; must stay green.

New `vitest` files in `test/client/`:

| File | Asserts |
|------|---------|
| `OpponentCard.test.tsx` | renders persona/glyph fallback; returns nothing when `personaId=null` |
| `OpponentBanter.test.tsx` | mocked EventSource fires `bot_thinking`/`banter`/`bot_stalled` → bubble/dots/stall visible; chat submit POSTs to right URL; retry/abandon buttons POST to right URLs |
| `GameChrome.test.tsx` | slots render verbatim |
| `Card.test.tsx` | face-up uses `cardImageUrl`; face-down uses `backImageUrl` |
| `Hand.test.tsx` | discard ≤2 selections; pegging disables unplayable cards |
| `PegBoard.test.tsx` | peg positions correct for `[0,0]` and a mid-game fixture |
| `Pegging.test.tsx` | running total renders; `isPlayable()` table-driven |
| `Show.test.tsx` | renders breakdown lines from fixture; "Continue" fires callback |
| `cribbage-contract-drift.test.ts` | exhaustive comparison of `CribbageView` keys against `cribbagePublicView()` output from a fixture state |
| `CribbageApp.test.tsx` | minimal smoke: renders with stub `__GAME__`; transition fires `play()` (sounds mocked) on score change |

**Test setup:** `test/client/setup.ts` gains an `EventSource` mock. Implementation: a tiny stub class with `addEventListener` / `removeEventListener` / `close` and a test-only `_emit(event, data)` method registered globally so tests can grab the most-recent instance.

**`test/cribbage-client-files.test.js`** (modify if exists, create if not): asserts post-migration shape — `index.html`, `style.css`, `app.js`, `assets/`, `sounds/`; plus presence of `src/clients/cribbage/{main.tsx,CribbageApp.tsx,PegBoard.tsx}` and `src/clients/shared/{OpponentCard.tsx,OpponentBanter.tsx,GameChrome.tsx,Card.tsx}`. Mirrors `test/risk-client-files.test.js` from Cycle 1.

Type check (`npx tsc -p tsconfig.client.json --noEmit`) must remain clean.

---

## 9. Phase Plan

| Phase | Output | Key tasks |
|-------|--------|-----------|
| **0 — Infra audit** | confirmation only; no commits | verify `useGameState` lacks the AI events (it does); verify `test/cribbage-client-files.test.js` state; confirm `EventSource` mock approach |
| **1 — Shared additions** | `src/clients/shared/{OpponentCard,OpponentCard.css,OpponentBanter,GameChrome,Card,card-assets,card-assets.d}` + matching vitest | Phase-1 Task 1: add `/shared/cards/card-element.js` to `vite.config.client.js`'s `rollupOptions.external` and write `card-assets.d.ts` ambient declaration. Then TDD each component; mock EventSource in setup; lift CSS verbatim; commit per component |
| **2 — Cribbage contract** | `src/clients/shared/contracts/cribbage.ts` + `cribbage-contract-drift.test.ts` | mirror Risk Task 1.1 |
| **3 — Cribbage components** | `src/clients/cribbage/*` + vitest | Hand → PegBoard → Pegging → Show → sounds → CribbageApp → main |
| **4 — Build, swap, clean, regress** | `index.html` updated; vanilla modules deleted; built bundle; full regression + manual parity | mirror Risk Phase 5 |

No Phase-3-equivalent server work. No Amendment-A.

---

## 10. Acceptance Criteria

- `src/clients/shared/` gains: `OpponentCard.tsx`, `OpponentCard.css`, `OpponentBanter.tsx`, `GameChrome.tsx`, `Card.tsx`, `card-assets.ts`, `card-assets.d.ts`, `contracts/cribbage.ts`.
- `vite.config.client.js` gains a `rollupOptions.external` entry for `/shared/cards/card-element.js`.
- `src/clients/cribbage/main.tsx` builds to `plugins/cribbage/client/app.js` via `GAMEBOX_PLUGIN=cribbage`.
- `plugins/cribbage/client/index.html` loads `app.js` only (no other JS); preserves `style.css`, `assets/`, `sounds/`.
- Vanilla files removed from `plugins/cribbage/client/`: `hand.js`, `peg-board.js`, `pegging.js`, `show.js`, `sounds.js` (old `app.js` replaced by built bundle at same path).
- `npm test` green; no `src/server/**` or `plugins/cribbage/server/**` changes.
- `npm run test:client` green; new vitest files all green.
- `npx tsc -p tsconfig.client.json --noEmit` clean.
- Manual parity walk:
  - Deal → discard to crib → cut → pegging → show → crib show → next deal → match-end (incl. skunk path).
  - Sounds: `your-turn` on turn boundary; `playForScore` tiers on score deltas; `cheer-100`/`cheer-50` on match-end; mute toggle persists across reload.
  - Opponent banter: bubble appears on SSE `banter`; thinking dots on `bot_thinking`; stall banner with retry/abandon on `bot_stalled`.
  - Chat: typing + submit POSTs; own-message flash on SSE `user_chat`.
  - Error boundary: forcing a render throw shows recovery panel, not blank screen.
  - SSE drop and reconnect: chrome shows `reconnecting`, then `live`.

---

## 11. Risks

- **Two SSE connections per page** (Q1=A) — accepted; vanilla already pays the cost; server SSE infrastructure already supports it.
- **`<OpponentBanter>` is dual-natured** — SSE handlers + three fetch POSTs in one component. ~120 LOC. Manageable; smaller than Risk's `CombatReveal` (98 LOC) once the timer logic ports cleanly. If it grows past 200 LOC during implementation, consider splitting the chat-form sub-tree into a `<TrashTalkInput>` child.
- **CSS verbatim** depends on the React DOM tree matching vanilla DOM tree at `.opp-card__*` granularity. The `<OpponentCard><OpponentBanter /></OpponentCard>` composition is constructed to satisfy this; any deviation breaks the bundled CSS.
- **Audio in jsdom** — `Audio` constructor doesn't exist. `sounds.ts` smoke test must guard or mock. Sound effects only verified in manual parity walk.
- **Cycle 3 discovery** — buraco is the cycle that proves whether the shared decomposition is right. If R4's split is wrong, we discover it then and refactor in Cycle 3. Cycle 2's goal is "good enough for one second game," not "future-proof for six."

---

## 12. Open Questions Deferred to Implementation

None blocking. Plan author has full design context.

The two judgment calls left for the plan author:
- Exact prop names for `<OpponentBanter>` (the spec gives shape; bikeshed during TDD).
- Whether `<GameChrome>` Risk-retrofit goes in this cycle (default: no; Cycle 7).
