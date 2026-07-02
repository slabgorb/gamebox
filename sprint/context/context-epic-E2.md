# Epic E2: Risk LLM persona-style corpus and training

## Overview

E2 validates a single hypothesis: that LLM personas play Risk in *measurably
distinguishable styles*, then — only if validated — scales to a full corpus and
a fine-tuned model that plays Risk in-character.

**Strategic frame:** this thread is about STYLE, not win-rate. Heuristic engines
already win more. The point is persona-distinguishable play. Every story serves
that gate.

The epic is gated by a pilot GO/NO-GO decision (E2-1 → E2-2). A GO opens the
corpus/training branch (E2-3…E2-7); a NO-GO opens the failure-analysis branch
(E2-3-alt, E2-4-alt). **The decision was recorded on 2026-07-02: NO-GO** — see
*Branch Decision* below.

## Background

The pilot harness, collection mode, transcript-shape fixes, rate-limit retry,
the six-pairing pilot wrapper, and the chi-square GO/NO-GO diagnostic all landed
in PRs #58 + #60 (merged to `main`, commit `066df51`).

The pilot was started, then **deliberately paused at 46/150 games on
2026-05-21** (`data/risk-corpus/pilot/`) because of a structural gap: the current
Risk engine has **no territory cards**. The pilot's GO/NO-GO metric is
*attack-when-available rate*, which is exactly the behavior Risk cards distort —
cards reward capturing ≥1 territory per turn, pushing every persona toward
attacking, and persona style lives partly in *when a player stops attacking
after securing a card*, a decision that does not exist on the cardless engine.

Decision (2026-05-21): **build cards first, then rerun the pilot on the carded
engine.** The 46 cardless games are discarded. The critical path was re-sequenced
to E2-8 (cards engine) → E2-9 (cards-aware AI + diagnostic re-validation) →
E2-1 (pilot rerun) → E2-2 (branch decision).

## Branch Decision (E2-2, 2026-07-02): NO-GO

Recorded in `sprint/epic-E2.yaml` under the epic-level `decision:` field; full
evidence in `docs/risk-llm/pilot-report.md`.

The 150-game carded pilot (6 pairings × 25, Sonnet 4.6) found:

- Both style metrics — legacy `attack-when-available` and E2-9's supplement
  `postCardSecuredAggression` — **saturate at ~97% across all three personas**
  (1pp spread). Only 1 of 3 pairwise chi-square tests met p<0.01
  (jaune vs robert, p=0.002). The pre-registered gate (all 3 pairs significant)
  fails mechanically.
- **Root cause is architectural, not prompt copy:** the shortlist-based chooser
  (`chooseAction` hands the LLM the top-6 heuristically-scored moves plus the
  phase terminator) pre-filters to mostly-aggressive options, so persona
  preference has nothing to choose against. The metric discriminates the
  shortlist, not the style.
- A *separate* persona signal appeared in harness-compliance/forfeit rate
  (admiral-vonnegut 8% vs colonel-jaune 17% / major-robert 18%), but it's
  context contamination fighting the constraint — wrong shape for training or
  product.

**Story-state consequences (applied in commit `36a5d12`):**
- GO path E2-3, E2-4, E2-5, E2-6, E2-7 → `canceled`. Do not resurrect without a
  fresh pilot decision.
- NO-GO path E2-3-alt (failure analysis) → `ready`; E2-4-alt (prompt revision +
  pilot rerun) → `ready` but **depends on E2-3-alt** — do not start it first.
- Loop: E2-3-alt → E2-4-alt → back to a new E2-2-style branch decision.

E2-3-alt should weigh the pilot report's three candidate directions:
(a) prompt iteration inside the current chooser, (b) widening the chooser's
action budget (richer shortlist / raw legal set), (c) re-scoping personas around
a different signal (e.g., banter quality on the live-mode corpus). The report
leans toward the chooser being the real blocker.

## Technical Architecture

The Risk game is a server-authoritative plugin with a thin client mirror.

**Server engine (`plugins/risk/server/`):**
- `state.js` — initial-state builder (42 territories across 6 continents, even
  2-player split, setup army pools). Card state (deck, per-player hands,
  trade-in counter) is added here.
- `actions.js` — phase state machine (setup → reinforce → attack → fortify →
  gameover) and `reinforcementFor()` (territories/3, min 3, + continent
  bonuses). Card award (end of turn, on ≥1 capture) and trade-in (at
  reinforcement) integrate here.
- `combat.js` — dice resolution (attacker ≤3 dice, defender ≤2, ties to
  defender), with client-replay validation.
- `validate.js` — input validators for deploy/attack/fortify; a trade-in set
  validator is added here.
- `view.js` — public state view. Today it mirrors full state to both players;
  private card hands require redacting opponent card identities (count only).
- `map.js` — territory graph (42 territories, adjacency, continent bonuses).

**Client (`src/clients/risk/`):** SVG board, action bar, combat reveal, etc.
State contract lives at `src/clients/shared/contracts/risk.ts`. Card UI is a
separate story (E2-10) and is out of scope for the headless pilot.

**AI / orchestrator path (`src/server/ai/`):** `orchestrator.js` drives bot
turns; `plugins/risk/server/ai/risk-player.js` enumerates legal moves and picks
from an LLM shortlist. Making the AI cards-aware (legal-move enumeration for
trade-ins, prompt-shape change with a `BUILD_TURN_PROMPT_VERSION` bump,
board-eval card valuation) is E2-9, not E2-8.

**Corpus harness:** `scripts/risk-pilot.sh` (six-pairing wrapper, append-resume),
`scripts/risk-style-diag.mjs` (chi-square GO/NO-GO diagnostic). The diagnostic
metric must be re-validated under cards in E2-9.

**Test conventions:** Node test files named `risk-*.test.js` exercise the engine
through the plugin's `applyAction` contract (e.g. `risk-state.test.js`,
`risk-actions-*.test.js`, `risk-validate.test.js`, `risk-full-game.test.js`).

## Cross-Epic Dependencies

- 6-player Risk engine, map redesign, and persona UI/portraits are explicitly
  out of scope for E2.
- E2-11 (per-game AI model seam → Risk uses Sonnet 4.6) is independent of the
  cards path but is a precursor to E2-7's live A/B integration.
