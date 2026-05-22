---
story_id: E2-9
jira_key: E2-9
epic: E2
workflow: tdd
---
# Story E2-9: Cards-aware AI + diagnostic re-validation (legal moves, prompt bump, board-eval)

## Story Details
- **ID:** E2-9
- **Jira Key:** E2-9
- **Workflow:** tdd
- **Stack Parent:** E2-8 (cards engine mechanics)

## Description
Make the AI and pilot harness cards-aware so the rerun corpus reflects carded play. Extend legal-move enumeration to include trade-in options; update the LLM turn prompt to surface the bot's hand + trade-in choices and bump BUILD_TURN_PROMPT_VERSION; teach board-eval to value held cards / near-complete sets. Re-validate the GO/NO-GO diagnostic: attack-when-available is now distorted by the card-per-turn incentive, so confirm or revise the metric (candidates: post-card-secured aggression, trade-in timing) in scripts/risk-style-diag.mjs.

## Acceptance Criteria
1. Legal-move enumeration includes valid trade-in actions when the bot holds a tradeable set
2. LLM turn prompt includes the bot's current hand and available trade-in options
3. BUILD_TURN_PROMPT_VERSION bumped (corpus prompt-shape change recorded)
4. board-eval assigns positive value to held cards and near-complete sets
5. risk-style-diag.mjs reviewed: attack-when-available confirmed valid under cards OR replaced/supplemented with a card-robust style metric, rationale documented
6. risk-full-game bot-vs-bot test passes end-to-end on the carded engine with at least one trade-in occurring

## Workflow Tracking
**Workflow:** tdd
**Phase:** red
**Phase Started:** 2026-05-22T09:48:43Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-22 | 2026-05-22T09:48:43Z | 9h 48m |
| red | 2026-05-22T09:48:43Z | - | - |

## Sm Assessment

E2-9 makes the AI and pilot harness cards-aware so the rerun corpus reflects carded play. It is the critical-path blocker for E2-1 (pilot rerun) and therefore for the whole GO/NO-GO decision at E2-2.

Four work fronts, all in `plugins/risk/server/ai/` plus the diagnostic script:
1. **Legal moves** (`legal-moves.js`) — enumerate trade-in actions when the bot holds a tradeable set.
2. **Prompt** (`prompts.js`) — surface the bot's hand + available trade-in options; bump `BUILD_TURN_PROMPT_VERSION` (corpus prompt-shape change must be recorded).
3. **Board-eval** (`board-eval.js`) — assign positive value to held cards and near-complete sets.
4. **Diagnostic** (`scripts/risk-style-diag.mjs`) — re-validate the GO/NO-GO metric. "Attack-when-available" is distorted by the card-per-turn capture incentive; confirm it still holds OR replace/supplement with a card-robust metric (candidates: post-card-secured aggression, trade-in timing), with rationale documented.

Constraints: 2-player only; Risk runs on Sonnet (claude-sonnet-4-6) per the E2-11 seam. The end-to-end AC needs a `risk-full-game` bot-vs-bot test exercising at least one trade-in.

**Flag (not in scope to fix here):** E2-8 left an open HIGH finding — `drawCard` reshuffle is unimplemented, so deck draw order is predictable. Could subtly bias the pilot corpus; raise as a Delivery Finding rather than fixing inside E2-9.

Context file complete, context gate passes. Routing to TEA for the red phase.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

- **[TEA, red] Gap, non-blocking:** AC-1 (trade-in legal moves) and AC-6 (full-game trade-in) are *already satisfied* on the carded engine — their tests pass as written. Trade-in enumeration landed in E2-8 (PR #61), and a seeded bot-vs-bot game (seed 12345) already produces a trade-in. Net new work is AC-2 (prompt hand/trade-in block), AC-3 (version bump), AC-4 (board-eval card term), AC-5 (card-robust diagnostic metric). 8 failing tests cover these.
- **[TEA, red] Question, non-blocking:** AC-5 was implemented as a *supplementary* `postCardSecuredAggression` metric requiring the harness (`src/server/ai/headless-game.js`) to emit a `cardSecuredThisTurn` flag per transcript turn. The diag tests use synthetic transcripts carrying that flag — Dev must also wire the harness to record it, or the metric will be all-zero on the real corpus. If Architect prefers a different card-robust metric (trade-in discipline, card-economy), the diag tests should be revised in lockstep; AC-5 explicitly permits that judgment call.
- **[TEA, red] Conflict, non-blocking (carry-over from E2-8):** open HIGH finding — `drawCard` reshuffle is unimplemented (re-stacks discard without shuffling → predictable draw order). NOT in E2-9 scope to fix, but a deterministic deck could bias the E2-1 pilot corpus. Recommend a separate bug-fix story before E2-1 runs.

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->