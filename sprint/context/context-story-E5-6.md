# Story E5-6 Context

## Title
Reinforcement provenance: itemize the muster (base + continent + trade-in)

## Metadata
- **Story ID:** E5-6
- **Type:** feature
- **Points:** 3
- **Priority:** p2
- **Workflow:** tdd
- **Repo:** g-1
- **Epic:** Risk Playtest Follow-up

## Problem
`reinforcePool` is a bare number. When the game says "16 armies," the player can't tell
**where they came from** — base territories, a continent they hold, a card set they traded,
or the territory trade-in bonus. The playtest takeaway: *"instead of '8 armies' say
'5 base, +3 for South America'..."*

The mechanics already exist and are correct; they're just opaque. In
`plugins/risk/server/actions.js`:
- **Base:** `Math.max(3, Math.floor(owned / 3))` (owned = territory count).
- **Continent bonuses:** `+continentBonus(key)` for each fully-owned continent.
- **Trade-in set bonus:** escalating `tradeBonus(tradeInCount)` (`TRADE_BONUSES`), added to
  the pool on trade-in.
- **Territory trade-in +2:** placed directly on a matched owned territory (recorded by
  **E5-2** in the `trade-in` log entry).

This story makes the muster legible. **Presentation over existing data; no rules change.**

## Technical Approach
- **Server view (`plugins/risk/server/view.js`):** expose an itemized breakdown rather than
  only the total — e.g.
  `reinforceBreakdown: { base: number, continents: [{ name, armies }], tradeIn?: number,
  territoryBonus?: { territory, armies } }`, computed from state at the reinforce phase.
  Base and continent figures are derived from territory ownership; the trade-in set figure
  and the territory `+2` come from the trade just applied (the latter via E5-2's enriched
  log entry).
- **Contract (`src/clients/shared/contracts/risk.ts`):** add the `reinforceBreakdown`
  shape to `RiskView`.
- **Client (`src/clients/risk/CardTray.tsx` / the reinforce UI):** render the itemized
  list — `"5 base · +3 South America · +6 trade-in set · +2 on Brazil"` — alongside or in
  place of the bare total. `CardTray` already surfaces `nextTradeBonus` (the
  `next-trade-bonus` testid), so it's the natural home for muster details.
- **Tests:** unit-test the breakdown computation (base math, continent detection, sum
  equals the pool) in the server test suite.

### Dependency
The **territory-bonus line** depends on **E5-2** recording `bonusTerritory`/`bonusArmies`
in the `trade-in` log entry. Land E5-2 first. The base/continent/trade-set lines have no
such dependency and could ship independently if E5-2 slips.

## Scope
- **In scope:** server-side breakdown computation + view exposure; the `RiskView` contract
  field; client itemized display; tests for the breakdown math.
- **Out of scope:** changing any reinforcement *amount* or rule; the trade-in territory
  rule itself (E5-2); a full turn-by-turn economy history (this is the current muster, not
  an all-game ledger).

## Acceptance Criteria
1. **Itemized breakdown exists.** The view exposes the reinforcement total broken into
   base, per-continent bonuses, trade-in set bonus (when one was traded this phase), and
   the territory `+2` (when one fired).
2. **It sums correctly.** The breakdown's pool components add up to the armies granted to
   the pool (the on-territory `+2` is shown separately as a placement), proven by a test.
3. **Continent bonuses are named.** A held continent shows as a named line (e.g.
   "+3 South America"), not folded into the base.
4. **It's displayed.** The reinforce UI shows the itemized muster to the player instead of
   only a bare number.
5. **Territory line reads E5-2's data.** When a trade-in placed +2 on an owned territory,
   that placement is shown (named territory), sourced from the enriched `trade-in` log
   entry; absent cleanly when no match fired.

---
_Authored by Architect (Naomi Nagata, design mode), 2026-06-30. Your ask: explain where reinforcements come from. Depends on E5-2._
