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
**Phase:** setup
**Phase Started:** 2026-05-22

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-22 | - | - |

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->
