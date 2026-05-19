# Risk persona treatment — design (Cycle A)

**Status:** Approved — ready for implementation plan
**Date:** 2026-05-19
**Predecessors:** [`2026-05-18-react-frontend-migration-design.md`](2026-05-18-react-frontend-migration-design.md) (Cycle 1 Risk React port, Cycle 2 cribbage React port that introduced the shared `OpponentCard` + `OpponentBanter`)
**Successor:** Cycle B — multi-AI plumbing in Risk (1 human + 2–5 AI). Separate spec; see "Out of scope" below.

## Motivation

Risk's React shell is missing the persona treatment that cribbage gained in Cycle 2. There is no opponent portrait, no banter bubble, no trash-talk input, and no stalled-bot recovery UI. The server already broadcasts every SSE event needed (`banter`, `bot_thinking`, `bot_stalled`, `user_chat`) for Risk bots — the orchestrator calls `chooseAction` which returns a `banter:` string and the orchestrator broadcasts it (see `src/server/ai/orchestrator.js:335-340`). Risk's client just isn't listening.

This cycle closes that gap with the smallest possible change: drop the existing shared components into Risk's layout, position them, and stop.

## Scope

**In scope (Cycle A):**

- Mount `OpponentCard` + `OpponentBanter` (from `src/clients/shared/`) in `RiskApp.tsx`.
- Position the card as a pinned overlay in the top-right of the Risk map frame.
- Responsive fallback: stack below the continent rail on narrow viewports.
- One smoke test confirming the card mounts when `ctx.opponentPersonaId` is set.

**Out of scope (deferred to Cycle B):**

- Multi-AI plumbing. Risk plugin internal state is still 2P (`sides: { a, b }`, `setupPools: [N, N]`, `territories[id].owner ∈ {0,1}`). Cycle B will refactor to N-player, extend the `games` schema beyond `player_a_id`/`player_b_id`, allow multiple `ai_sessions` rows per game, and add lobby flow for N-bot game creation.
- Stranded-game migration. Cycle A introduces no state-shape change, so no in-flight Risk games are at risk.
- Risk-specific chrome (theme picker, mute toggle). Risk has no sounds and no map themes today — adding them is unrelated to persona work.
- Per-turn banter de-duping or pacing changes. The existing queue in `OpponentBanter` already serializes bursts.

## Architecture

Purely client-side. No server, schema, contract, or build-config changes. The only files touched are inside `src/clients/risk/` and `plugins/risk/client/style.css`.

Component import chain:

```
RiskApp.tsx
  ├── ../shared/OpponentCard           (re-exports CSS via side-effect import)
  └── ../shared/OpponentBanter         (subscribes to ctx.sseUrl on its own EventSource)
```

`OpponentCard.tsx` does `import "./OpponentCard.css"` as a side effect, so no additional CSS wiring is required.

## Component wiring

Place the persona block between `<ContinentRail/>` and `<Board/>` in `RiskApp.tsx`:

```tsx
<aside className="risk-opp-overlay" aria-label="Opponent">
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
</aside>
```

The `ctx.opponent*` fields are already populated by `src/server/plugin-clients.js:serveIndex` for every plugin, including Risk, so no server change is needed to supply them.

## Layout & responsive behavior

Risk's existing layout flows top-to-bottom: banner → continent rail → board → combat reveal → action bar → history. The overlay is added without disturbing that flow.

**Desktop (≥960 px viewport):**

- `.risk-opp-overlay` is absolutely positioned within the Risk root container, anchored to the top-right of the map frame.
- Width ~280 px, max-height ~360 px.
- Translucent parchment-tinted backing (`background: rgba(74, 56, 38, 0.78)` or equivalent — tune in CSS) so the territory pins underneath remain legible.
- `z-index: 5` — above the SVG map, below `<CombatReveal/>` (which uses a higher z-index for its modal-style overlay).
- Banter bubble (`.opp-card__bubble`) flows downward from the portrait, anchored within the overlay.

**Narrow (<960 px viewport):**

- `@media (max-width: 959px)` switches `.risk-opp-overlay` to `position: static; width: auto; margin: 0.5rem 0;`, dropping the card into normal block flow between the continent rail and the board. Asia and Australia continent pins remain unobstructed on mobile.

**Continent rail collision:**

- The continent rail sits above the map; on desktop the overlay starts ~8 px below the rail's bottom edge to avoid overlap.

## Data flow

```
ctx (window.__GAME__, injected by serveIndex)
  → ctx.opponentPersonaId / opponentFriendlyName / opponentColor / opponentGlyph
  → OpponentCard props (purely presentational)

SSE (ctx.sseUrl)
  → OpponentBanter EventSource (its own connection, mirrors cribbage Q1=A decision)
  → handles: banter, bot_thinking, bot_stalled, update, user_chat
```

`OpponentBanter` opens its own `EventSource(sseUrl)` — this is the same two-SSE-connections-per-page tradeoff accepted in the cribbage React port (one connection for game state via `useGameState`, one for banter). The decision stands for Risk.

## Files changed

| File | Change |
|------|--------|
| `src/clients/risk/RiskApp.tsx` | Add 2 imports, insert `<aside className="risk-opp-overlay">` block in JSX between continent rail and board |
| `plugins/risk/client/style.css` | New `.risk-opp-overlay` rules + `@media (max-width: 959px)` fallback |
| `src/clients/risk/__tests__/RiskApp.opponent-card.test.tsx` *(new)* | Smoke test: render `<RiskApp/>` with a fixture `ctx` containing `opponentPersonaId`, assert the persona name appears |

No file is removed. No contract under `src/clients/shared/contracts/` changes.

## Testing

**Smoke test (new):**

`RiskApp.opponent-card.test.tsx` renders `<RiskApp/>` with a stub `useGameState` providing a minimal `RiskView` (setup phase, two sides) and a `ctx` with `opponentPersonaId: "professor-doofi"`, `opponentFriendlyName: "Professor Doofi"`, `opponentColor: "#8b5cf6"`, `opponentGlyph: "✦"`. Asserts that the rendered output contains the friendly name (proving the card mounted) and a `.risk-opp-overlay` element (proving placement).

**Manual verification:**

1. Open Risk vs `professor-doofi` (game 59 or a fresh one).
2. On bot turn: portrait appears top-right; "Professor Doofi is thinking" with animated dots while LLM call is in-flight.
3. When the bot returns a `banter:` string, a bubble shows under the portrait for ~5s, then fades.
4. On bot stall (kill the `claude` subprocess mid-turn to simulate): stalled UI with Retry / Abandon buttons replaces the bubble.
5. Type into the trash-talk input and submit: own bubble flashes briefly; on the bot's next turn, the user message is in its prompt context.
6. Resize browser below 960 px: card drops below continent rail; map remains fully visible.

**Existing tests:**

`RiskApp` smoke / combat tests must continue to pass without modification (no behavior change to existing flows).

## Risks & mitigations

1. **Overlay obscures Asia/Australia at borderline viewport widths.** Mitigation: translucent backing tuned so pins remain readable; responsive stack-below kicks in at 960 px. Open follow-up: if real-world play shows the overlay still crowds the map at common laptop widths (e.g., 1280 px), move the overlay to a right gutter outside the map frame. Deferred — measure first.
2. **Banter chattiness on multi-action Risk turns.** A bot turn is deploy → attack* → fortify (potentially 5+ actions), each capable of returning banter. `OpponentBanter`'s queue serializes them at 5 s + 400 ms gap, so a long turn could keep the bubble busy for ~30 s. Acceptable for Cycle A. If it grates, Cycle B can add de-duping or a "only one banter per turn" gate in the orchestrator.
3. **No `useGameState` test harness for Risk yet.** The new smoke test will need to mock `useGameState`. Pattern already exists in cribbage tests — borrow it.

## Open questions

None. Layout placement (top-right pinned), scope split (Cycle A vs B), and player count (1 human + 2–5 AI deferred to Cycle B) were resolved in brainstorming on 2026-05-19.

## References

- Cycle 2 cribbage React port (introduced shared components): commit `ce6347c`
- `src/clients/shared/OpponentCard.tsx`, `src/clients/shared/OpponentBanter.tsx`, `src/clients/shared/OpponentCard.css`
- `src/server/ai/orchestrator.js:335-340` — `banter` SSE broadcast (already wired for Risk)
- `src/server/plugin-clients.js:38-87` — `serveIndex` injects `ctx.opponent*` for all plugins
- `plugins/risk/server/ai/risk-player.js:38` — `chooseAction` returns `banter: parsed.banter`
