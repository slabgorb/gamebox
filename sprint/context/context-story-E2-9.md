---
parent: E2
---
# Story E2-9: Cards-aware AI + diagnostic re-validation (legal moves, prompt bump, board-eval)

## Business Context

E2-9 makes the AI and pilot harness cards-aware so the rerun corpus reflects carded play. With the risk cards engine (E2-8) now complete, the bot must learn to reason about its hand, trade-in options, and card-driven advantage. The GO/NO-GO diagnostic metric was built before cards existed; it measures *attack-when-available rate*, which cards directly distort — every persona is now pushed toward attacking (because attacking = card capture per turn), and persona style lives partly in the *post-card-secured decision*, a choice that did not exist on the cardless engine. E2-9 either confirms the metric is still valid or proposes a card-robust alternative.

This story is strictly AI-layer work. The human card UI (E2-10) is already done; E2-9 feeds the re-validated diagnostic and cards-aware bot into the pilot rerun (E2-1), which drives the final GO/NO-GO decision (E2-2).

## Technical Guardrails

- **2-player only.** The engine is hardcoded 2P; do not generalize to N players.
- **Legal-move enumeration for trade-ins.** `plugins/risk/server/ai/legal-moves.js` must extend trade-in enumeration to the existing legal-move list when the bot holds a tradeable set (3-same, 3-distinct, or 2+wild). Trade-in actions are only valid at reinforcement phase start, and forced if holding ≥5 cards.
- **LLM turn prompt cards-aware.** `plugins/risk/server/ai/prompts.js` must surface the bot's current hand and available trade-in options in the turn prompt block. This is a prompt-shape change → `BUILD_TURN_PROMPT_VERSION` (currently 1) must be bumped when the change merges (corpus prompt-shape change recorded).
- **Board evaluation learns card value.** `plugins/risk/server/ai/board-eval.js` must assign positive value to held cards and near-complete sets in its scoring breakdown. Cards give reinforcement bonuses and position for continent control; the evaluator must reflect that held cards are strategic assets, not neutral.
- **Diagnostic metric re-validation.** `scripts/risk-style-diag.mjs` reads game transcripts and computes per-persona metrics. The current metric is *attack-when-available rate*. Under the cards regime, this may be distorted (all personas hyper-aggressive because cards reward attacks). Either confirm attack-when-available is still a valid style differentiator OR propose an alternative metric (candidates: post-card-secured aggression, trade-in timing/discipline, card-economy decision quality). Document the decision and rationale in the code or in a finding.
- **Sonnet model.** Risk runs on claude-sonnet-4-6 per E2-11; do not change the model in E2-9 (that was a separate story already completed).
- **Follow existing patterns.** Extend legal moves and board-eval through the existing `risk-player.js` interfaces; test through `risk-full-game.test.js` (a bot-vs-bot test that exercises the full pipeline).

## Scope Boundaries

**In scope (E2-9):**
- Legal-move enumeration: add trade-in actions when the bot holds a tradeable set.
- LLM turn prompt: surface bot's hand and available trade-ins; bump `BUILD_TURN_PROMPT_VERSION`.
- Board evaluation: assign positive value to held cards and near-complete sets.
- Diagnostic metric review: confirm attack-when-available is valid under cards OR replace it with a card-robust metric and document the rationale.
- End-to-end test: `risk-full-game.test.js` must pass with at least one trade-in occurring.

**Out of scope:**
- Client card UI (completed in E2-10).
- Running the actual pilot (E2-1, depends on E2-9 completion).
- The cards engine itself (E2-8, done).
- 6-player support, map redesign, persona UI.
- The open E2-8 HIGH finding (drawCard reshuffle unimplemented → predictable draw order) is a risk to flag but NOT fix in E2-9; it is scoped to a future bug-fix story.

## AC Context

1. **Legal-move enumeration includes trade-in actions.** When the bot holds a tradeable set at reinforcement phase, `legal-moves.js` returns trade-in action(s) in addition to deploy/attack/fortify moves. Invalid sets are never returned.
2. **LLM turn prompt surfaces hand + trade-in options.** The turn prompt built by `prompts.js` includes: the bot's current card hand, the available trade-in sets (with their bonus army counts), and the board state. The prompt block clearly frames trade-ins as a phase-locked decision.
3. **BUILD_TURN_PROMPT_VERSION bumped.** When the prompt-shape change merges, `prompts.js` increments `BUILD_TURN_PROMPT_VERSION` from 1 to 2 (or higher if other changes accumulate). This records that the corpus was collected under a different prompt contract.
4. **Board-eval values held cards.** `board-eval.js`'s scoring breakdown includes a positive contribution from held cards and progression toward complete sets. The contribution must be tunable (not dominating deployment/continent decisions) but present and measurable.
5. **Diagnostic metric confirmed or revised.** `scripts/risk-style-diag.mjs` is reviewed: either attack-when-available is confirmed valid as a style metric under cards, OR the metric is replaced/supplemented with a card-robust alternative (e.g., post-card-secured aggression, trade-in discipline), and the choice is documented in code comments or a finding.
6. **End-to-end test passes with trade-in.** `risk-full-game.test.js` runs a bot-vs-bot game on the carded engine and confirms: the game completes, at least one trade-in occurs (or is forced), and state + view contracts stay consistent.
