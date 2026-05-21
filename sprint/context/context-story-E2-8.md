---
parent: E2
---
# Story E2-8: Risk cards engine mechanics (deck, award, trade-in, private hands)

## Business Context

E2-8 implements canonical Risk territory cards in the existing 2-player Risk
engine. It is the entry point of the re-sequenced critical path
E2-8 → E2-9 → E2-1 (pilot rerun).

Cards exist for the corpus, not for completeness. The E2 pilot's GO/NO-GO metric
is *attack-when-available rate*, and Risk cards directly distort it: a card is
earned by capturing ≥1 territory per turn, so every persona is pushed toward
attacking, and persona style lives partly in the *post-card-secured* decision —
whether to keep pressing after the card is locked in. Collecting a training
corpus on a cardless engine would train on a game that's about to change, so
cards must land before the pilot reruns.

This story is the engine layer only. The AI must become cards-aware (E2-9) and a
human card UI must be built (E2-10) before cards are fully usable, but neither is
part of E2-8.

## Technical Guardrails

- **2-player only.** The engine is intentionally 2P-hardcoded for async pacing;
  do not generalize to N players.
- **Canonical Risk card rules.** 44-card deck = 42 territory cards (one per
  territory in `map.js`, typed Infantry/Cavalry/Artillery in round-robin) + 2
  wild cards. A card is awarded at end of turn **only if** the player captured
  ≥1 territory that turn. Trade-in happens at reinforcement: valid sets are
  3-of-a-kind, 3-distinct, or any 2 + a wild. Bonus armies follow the escalating
  sequence 4, 6, 8, 10, 12, 15, then +5 per subsequent trade, tracked by a
  `tradeInCount` in state. A traded set also grants +2 armies placed on one owned
  territory that matches a card in the set. Holding ≥5 cards at reinforcement
  start forces a trade before any deployment.
- **Deterministic shuffle.** The deck must shuffle deterministically from the
  game seed, consistent with how `state.js` already seeds initial-state
  randomness. Tests rely on reproducibility.
- **Private hands.** Card hands are secret. `view.js` must expose the viewing
  player's full hand but only the *count* of the opponent's hand — never card
  identities. This is the engine's first private-information surface; today
  `view.js` mirrors full state, so this is a real behavioral change.
- **State contract.** New fields (deck, per-player hands, `tradeInCount`, and any
  per-turn capture flag needed to gate the award) must be added to both the
  runtime state (`state.js`) and the TypeScript contract
  (`src/clients/shared/contracts/risk.ts`).
- **Reshuffle.** When the draw deck is exhausted, reshuffle the discard pile back
  into the deck.
- **Follow existing patterns.** Exercise behavior through the plugin's
  `applyAction` contract and the `risk-*.test.js` conventions. Reinforcement
  bonus from a trade-in must flow through `reinforcementFor()` (or its result),
  not a parallel code path.

## Scope Boundaries

**In scope (E2-8):**
- Deck construction + deterministic shuffle.
- Card award on end-of-turn-with-capture.
- Trade-in action: set validation, escalating bonus, territory-match +2, forced
  trade at ≥5.
- Reinforcement integration of trade-in bonus armies.
- Private-hand redaction in `view.js`.
- State + contract field additions.

**Out of scope:**
- Cards-aware AI: legal-move enumeration for trade-ins, LLM prompt-shape change /
  `BUILD_TURN_PROMPT_VERSION` bump, board-eval card valuation → **E2-9**.
- Diagnostic metric re-validation → **E2-9**.
- Client card UI (hand tray, trade-in selector, must-trade modal) → **E2-10**.
- 6-player support, map redesign, persona UI.
- Discarding/regenerating the 46 paused pilot games → handled when **E2-1** reruns.

## AC Context

1. **44-card deck, deterministic shuffle.** 42 territory cards (one per `map.js`
   territory, types assigned round-robin Infantry/Cavalry/Artillery) + 2 wilds.
   Shuffle is seeded so the same game seed yields the same deck order.
2. **Award only on capture.** End of a turn in which the player captured ≥1
   territory → draw one card. A turn with no capture → no card. Requires tracking
   "captured this turn" through the attack phase.
3. **Trade-in set validation.** `validate.js` accepts 3-same, 3-distinct, and
   2+wild; rejects everything else (wrong size, non-matching, cards not in hand).
4. **Escalating bonus.** Successive trades across the game yield 4, 6, 8, 10, 12,
   15, +5… armies, driven by `tradeInCount` in state (global escalation, not
   per-player-reset).
5. **Territory-match +2.** If a traded card names a territory the player owns,
   +2 armies are placed on that territory (in addition to the set bonus).
6. **Forced trade at ≥5.** A player who begins reinforcement holding ≥5 cards
   must trade a set before deploying; deploy actions are rejected until they do.
7. **Private hands in view.** `view.js` returns the viewer's own hand in full and
   only `opponentCardCount` (or equivalent) — opponent identities never leak.
8. **Reinforce integration + reshuffle.** Traded bonus armies are included in the
   reinforcement pool; when the deck empties, the discard pile reshuffles into a
   fresh deck.
