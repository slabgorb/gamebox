# Story E5-2 Context

## Title
Territory trade-in bonus: verify it forces placement + record in log

## Metadata
- **Story ID:** E5-2
- **Type:** feature
- **Points:** 2
- **Priority:** p2
- **Workflow:** tdd
- **Repo:** g-1
- **Epic:** Risk Playtest Follow-up

## Problem
**The rule is already implemented** — this is NOT a from-scratch build. In
`plugins/risk/server/actions.js` (`applyTradeIn`, ~line 144):

```js
// Territory-match: +2 armies on one owned territory named by a traded card.
for (const c of cards) {
  if (c.territory !== null && s.territories[c.territory]?.owner === playerIdx) {
    s.territories[c.territory].armies += 2;
    break; // once per trade
  }
}
```

It **does** force +2 onto the (first) matched owned territory, automatically, once per
trade — matching the classic Risk rule. Two real gaps surfaced in the playtest:

- **It's silent.** The log entry is bare — `s.log.push({ kind: 'trade-in', player })` —
  carrying no record of which territory got the bonus or how much. Nothing downstream
  (Chronicle, view) can show the player it happened, so it *felt* absent.
- **It's untested.** There is no test pinning the +2 placement, the once-per-trade
  `break`, or the "must own the territory" guard.

This story locks the behavior and **records** the bonus so E5-6 can surface it. The
visible breakdown UI is E5-6, not here.

## Technical Approach
- **Test (`test/risk-cards-trade-in.test.js`):** add cases asserting (a) trading a set
  where the player owns a card's territory adds exactly +2 armies to *that* territory;
  (b) only one +2 is applied even when multiple traded cards match owned territories
  (the `break`); (c) no bonus when the matched territory is unowned or the card is wild
  (`territory === null`); (d) the +2 is *in addition to* the pool `tradeBonus`.
- **Log/contract enrichment:** extend the `trade-in` log entry to carry the bonus, e.g.
  `{ kind: 'trade-in', player, bonusTerritory?: string, bonusArmies?: number }`, and add
  those optional fields to `RiskLogEntry` in `src/clients/shared/contracts/risk.ts`.
  Set them when (and only when) a territory match fired. This is the data E5-6 reads.
- **Behavior is otherwise frozen.** Do not change *which* territory is chosen, the
  amount, or the once-per-trade rule.

### Decision to confirm at pickup
Classic Risk awards +2 on one matched territory with no player choice among multiple
matches; the code picks the first matching *card's* territory (`break`). That's the
accepted simplification (the "collapsed mechanic" precedent from Sorry!/cribbage). Flag
only if the playgroup wants the player to *choose* which matched territory — that would be
a behavior change beyond this story.

## Scope
- **In scope:** tests pinning the existing +2 placement behavior; enriching the
  `trade-in` log entry + `RiskLogEntry` contract with `bonusTerritory`/`bonusArmies`.
- **Out of scope:** any UI / breakdown display (E5-6); changing the placement rule or
  letting the player choose the territory; the pool-bonus escalation (already correct).

## Acceptance Criteria
1. **Forcing is pinned by test.** A test proves trading a set including an owned-territory
   card adds exactly +2 to that territory's `armies`, automatically.
2. **Once per trade.** A test proves at most one +2 is applied per trade-in even when
   multiple traded cards match owned territories.
3. **Ownership guard.** A test proves no bonus is applied when the matched territory is
   not owned by the trader, and wild cards (`territory === null`) never trigger a bonus.
4. **Bonus is recorded.** The `trade-in` log entry includes `bonusTerritory` and
   `bonusArmies` when a match fired, and omits them (or leaves them null) otherwise; the
   `RiskLogEntry` contract reflects the new optional fields.
5. **No behavior regression.** Pool `tradeBonus` escalation and all existing trade-in
   tests remain green.

---
_Authored by Architect (Naomi Nagata, design mode), 2026-06-30. Reframed after reading `actions.js` — the rule exists; this is verify + record._
