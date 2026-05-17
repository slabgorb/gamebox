# Risk plugin (compact 2-player conquest with AI opponent)

**Status:** Design (pending implementation plan)
**Date:** 2026-05-17
**Decision driver:** First territory-control / area-conquest game in Gamebox. The challenge is Risk's brutal branching factor — a naive legal-move list is enormous, so the AI needs a heuristic prefilter (the backgammon board-eval pattern) before the LLM ever sees a choice. A compact hand-designed map keeps both play time and AI reasoning tractable.

---

## 1. Goals & non-goals

### Goals
- Add a Risk plugin that plays a **full game end-to-end**: setup deployment → repeated turns of reinforce → attack → fortify → win by elimination.
- Follow the existing plugin contract (`initialState`, `applyAction`, `publicView`, optional `legalActions`).
- Compact hand-designed map (13 territories, 4 continents) with single-territory chokepoints so continent bonuses are meaningful and defensible.
- Map data isolated in one `server/map.js` module so a future 42-territory classic map is a pure data change, zero engine change.
- AI opponent uses the **heuristic-shortlist + LLM-pick** pattern (like backgammon): enumerate legal actions → score by board eval → hand the top few to the LLM with persona for the final pick + banter.
- Deterministic combat under the orchestrator's seeded RNG (same mechanism backgammon uses to materialize dice), so games replay identically in tests.

### Non-goals (v1)
- Risk cards / set trade-ins (escalating bonus, must-trade-at-5) — deferred; significant extra state + AI decisions, can be a follow-up slice
- The official 2-player "neutral army" variant — unnecessary, the AI *is* opponent #2
- 42-territory classic world map — engine supports it via data, but v1 ships the compact map only
- 3–6 player Risk (host enforces `players: 2`)
- Capitals / Secret Mission / other variants
- Round-by-round manual combat (attacks resolve to conclusion in one action — see §4; async pacing makes die-by-die UX a non-starter)
- Connected-path fortify (v1 fortify is adjacent-only, see §4)

---

## 2. Plugin manifest

```js
// plugins/risk/plugin.js
export default {
  id: 'risk',
  displayName: 'Risk',
  players: 2,
  clientDir: 'plugins/risk/client',
  initialState: buildInitialState,
  applyAction: applyRiskAction,
  publicView: riskPublicView,
  legalActions, // optional, computed from phase
};
```

Registered in `src/plugins/index.js` (added to the import list and the exported `plugins` map).

---

## 3. Module layout

```
plugins/risk/
  plugin.js                 # manifest + lifecycle wiring
  server/
    map.js                  # territory/continent/adjacency data + helpers (neighborsOf, continentOf, ownedContinents)
    state.js                # buildInitialState — random even split, 1 army each, setup-deploy pools
    actions.js              # applyAction — switch on (phase, action.type)
    combat.js               # resolveAttack(force, defenders, rng) -> rounds + outcome
    validate.js             # legal-action guards (own source, adjacency, force minimums)
    view.js                 # publicView — full board (Risk has no hidden state)
    ai/
      legal-moves.js        # enumerate legal actions for the current phase
      board-eval.js         # heuristic score for a side
      risk-player.js        # chooseAction: shortlist by eval delta -> LLM pick
      prompts.js            # buildTurnPrompt / parseLlmResponse
  client/
    index.html
    app.js                  # state fetch, render loop, action dispatch
    board.js                # SVG map render: territories, ownership color, army counts
    action-bar.js           # phase-aware controls (deploy / attack / fortify / end)
    themes.js               # color palettes
    history.js              # move log
    end-screen.js           # win/lose
    style.css
```

---

## 4. Game model

### Map (`server/map.js`)

| Continent | Bonus | Territories |
|-----------|-------|-------------|
| Norland   | +2    | N1, N2, N3  |
| Ostmark   | +3    | E1, E2, E3, E4 |
| Sudreach  | +2    | S1, S2, S3  |
| Westfen   | +2    | W1, W2, W3  |

Internal adjacency:
- Norland: N1–N2, N2–N3, N1–N3 (triangle)
- Ostmark: E1–E2, E2–E3, E3–E4, E1–E4 (ring)
- Sudreach: S1–S2, S2–S3 (line)
- Westfen: W1–W2, W2–W3, W1–W3 (triangle)

Inter-continent chokepoints (the only cross-continent edges):
`N3–E1`, `E4–S1`, `S3–W1`, `W3–N1`, plus center cross `E2–W2`.

13 territories, 4 continents. Each continent has 1–2 borders, so a held continent is defensible — that is what makes continent bonuses worth the AI optimizing for.

`map.js` exports the data plus pure helpers: `neighborsOf(id)`, `continentOf(id)`, `continentBonus(cont)`, `continentTerritories(cont)`, `allTerritories()`.

### State shape

```
{
  phase: 'setup' | 'reinforce' | 'attack' | 'fortify' | 'gameover',
  currentPlayer: 0 | 1,
  territories: { [id]: { owner: 0|1|null, armies: int } },
  reinforcePool: int,            // armies left to place this reinforce phase
  setupPools: [int, int],        // armies left to place during setup (per player)
  fortifyUsed: bool,             // one fortify move per turn
  lastCombat: { from, to, attackerRolls, defenderRolls, losses, captured } | null,
  winner: 0 | 1 | null,
  log: [ ...entries ]
}
```

### Setup (`phase: 'setup'`)

- Territories randomly split as evenly as possible between the two players under the seeded RNG (13 → 7/6), 1 army auto-placed on each.
- Each player gets a starting pool (`setupPools`); standard scaling for a 13-territory 2-player game ≈ **20 armies each** (tunable constant `SETUP_ARMIES`).
- Setup proceeds as alternating batched `setup-deploy` actions: the active player submits a `{ [territoryId]: count }` placement spending exactly their remaining pool (or a capped chunk — v1: place entire pool in one action for async friendliness), then control passes. When both pools are exhausted, `phase → 'reinforce'`, `currentPlayer → 0`.

### Turn loop

**reinforce:** `reinforcePool = max(3, floor(ownedCount / 3)) + Σ bonus(fully-owned continents)`. Action `deploy { placements: {id: n} }` spends the whole pool onto owned territories. `phase → 'attack'`.

**attack:** repeatable. Action `attack { from, to, force }` where `from` is owned with `armies > force ≥ 1`, `to` is an enemy neighbor. Resolves **to conclusion in one action** (auto-blitz): repeated combat rounds until `to` is captured or the committed attacking force is reduced to 1.
- Each round: attacker rolls `min(3, attackingForce - 1)` dice, defender rolls `min(2, defenders)`; sort each desc; compare highest-vs-highest and second-vs-second; each comparison the loser removes 1 army, ties → defender.
- On capture: defender armies → 0, `to.owner = attacker`. The **entire surviving committed force** moves into `to`; the source keeps its non-committed armies, which is always ≥ 1 because the action requires `force < from.armies`. (No partial move-in choice in v1 — deferred tunable.) Capture of opponent's last territory → `phase → 'gameover'`, `winner` set.
- Action `end-attack` advances `phase → 'fortify'`.

**fortify:** one optional action `fortify { from, to, count }` where both owned and **adjacent**, `count < from.armies` (leave ≥1). `fortifyUsed = true`. Action `end-turn` (or fortify auto-advances): clear per-turn state, swap `currentPlayer`, `phase → 'reinforce'`.

**gameover:** terminal. `publicView` exposes `winner`; client shows end screen.

### Combat (`server/combat.js`)

`resolveAttack({ force, defenders }, rng)` returns `{ rounds: [{aRolls, dRolls, aLoss, dLoss}], attackerSurvivors, defenderSurvivors, captured }`. Pure function of inputs + injected `rng` (the orchestrator passes the same seeded `rng` it uses for backgammon dice), so combat replays deterministically in tests.

---

## 5. AI opponent

Conforms to the existing contract:
`chooseAction({ llm, persona, sessionId, state, botPlayerIdx, rng, userMessages }) -> { action, banter, sessionId, sequenceTail }`, throwing `InvalidLlmResponse` / `InvalidLlmMove` from `src/server/ai/errors.js`.

- `legal-moves.js` enumerates the legal actions for `state.phase`:
  - reinforce → a small set of candidate deployment distributions (concentrate-on-frontier, reinforce-weakest-border, defend-continent), not the full combinatorial space
  - attack → every legal `(from, to)` with a sensible committed force, **plus** the `end-attack` option
  - fortify → candidate `(from, to, count)` shifts toward the front, plus `end-turn`
- `board-eval.js` scores a side: `+ territoriesOwned`, `+ Σ owned-continent bonuses`, `+ partial-continent progress`, `+ frontier force ratio (own vs adjacent enemy)`, `− exposed border count`. Returns `{ total, breakdown }` for prompt context.
- `risk-player.js`: when the phase fans out wide (attack, reinforce), score each candidate by post-action eval delta, keep top `MAX_SHORTLIST` (≈ 4–6), and hand that shortlist to the LLM with persona for the final pick + banter. Low-fan-out decisions (fortify skip, end-attack when no good attacks) can go straight to the model.
- `prompts.js`: `buildTurnPrompt({ state, shortlist, botPlayerIdx, userMessages })` renders the board, continent standings, the shortlisted options with their eval breakdown, and the persona's banter hook; `parseLlmResponse(text)` extracts `{ moveId, banter }`.

---

## 6. Client

- `board.js`: hand-authored SVG of the 13 territories laid out as the 4-continent ring with chokepoint edges drawn; each territory shows owner color and army count; tappable for source/target selection.
- `action-bar.js`: phase-aware. Setup → deploy chips onto owned territories until pool spent. Reinforce → same deploy UI on the per-turn pool. Attack → pick own territory, pick adjacent enemy, choose committed force, confirm (resolves fully, animates the combat summary from `lastCombat`); "Done attacking" button. Fortify → pick from/to/count or skip.
- `history.js`: renders `state.log` (deployments, attacks with dice + losses, captures, fortifies).
- `end-screen.js`: win/lose from `winner`.
- `themes.js`: per-plugin color palettes (consistent with other plugins).

---

## 7. Testing (TDD per plugin convention)

Unit tests, all under a seeded RNG:
- `map.js`: adjacency symmetry (every edge bidirectional), continent membership, no orphan territories, chokepoints are the only cross-continent edges.
- reinforcement formula: `max(3, floor(n/3))` + continent bonuses, including the all-of-a-continent boundary.
- `combat.js`: dice counts (`min(3, force-1)` / `min(2, defenders)`), tie → defender, capture vs. repulse, full blitz-to-conclusion, deterministic under fixed rng seed.
- `validate.js`: rejects attack from unowned / non-adjacent / `force ≥ armies`; rejects fortify between non-adjacent; rejects deploy onto unowned or over-pool.
- win detection: capturing the opponent's last territory sets `phase=gameover` + `winner`.
- `legal-moves.js`: enumerates only legal actions for each phase; always includes the phase-advancing option (`end-attack`, `end-turn`).
- `risk-player.js`: with a stub `llm`, returns a shortlisted action and surfaces `InvalidLlmMove` when the model picks an id outside the shortlist.

---

## 8. Open tunables (safe defaults, adjustable without redesign)

- `SETUP_ARMIES` (≈ 20) — starting deployment pool per player.
- `MAX_SHORTLIST` (≈ 4–6) — AI candidate cap handed to the LLM.
- Whether setup deployment is one batched action or chunked over several alternating actions (v1: one batched action per player).
