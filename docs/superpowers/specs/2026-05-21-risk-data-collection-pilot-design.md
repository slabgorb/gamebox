# Risk Data Collection Pilot — Design

**Date:** 2026-05-21
**Status:** Approved scope; ready for plan
**Author:** Brainstormed with Bossmang

## Context

This is the second project in the local-LLM Risk-bot initiative. Project 1 (the tournament harness, PR #58, `feat/risk-tourney-harness`) shipped a headless CLI that runs N Risk games between any two LLM-backed bots and writes per-turn JSONL transcripts. The harness's smoke test surfaced a defect that blocks any real data collection — both Haiku-vs-Haiku games forfeited because of a shortlist-truncation bug. This spec covers the harness fix and a pilot data-collection run that produces enough transcripts to verify Sonnet 4.6 plays the three risk-gated personas with measurably different styles.

The longer-term goal remains [[project_risk_llm_styles]]: train a local Llama on Sonnet transcripts so the existing Risk personas have distinguishable *playing styles*, not just distinguishable voices. Win-rate is a sanity floor; style fidelity is the success metric.

### Why a pilot

The downstream project — fine-tuning Llama on ~thousands of Sonnet-driven transcripts — is wall-clock-expensive on Claude Pro Max (rate-limited, not dollar-billed). It would be embarrassing to spend weeks of Pro Max quota generating a corpus and then discover at training time that the teacher doesn't actually play the personas distinguishably. A 150-game pilot answers that question for ~4 hours of wall-clock and clears the path to scaling — or sends us back to iterate on persona prompts before spending more.

## Goals

- Fix the shortlist-truncation defect (`risk-player.js` drops phase terminators when 6 attacks score higher), which currently causes all bot-vs-bot games to forfeit.
- Drop banter generation from the collection prompt; banter is a runtime concern handled by a separate subagent (decoupling moves from voice in the training signal).
- Add pause/resume to `scripts/risk-tourney.mjs` so a multi-hour run survives a Pro Max rate-limit window.
- Run a 150-game pilot covering all six ordered pairings of {vonnegut, jaune, robert} at 25 games per pairing, using Sonnet 4.6 as the teacher model.
- Build a minimal style diagnostic (`scripts/risk-style-diag.mjs`) that prints per-persona move-type distributions and emits a GO/NO-GO recommendation for scaling.

## Non-Goals

- Full corpus generation. This is the pilot only. Scale-up is a separate spec gated on a GO from the diagnostic.
- Fine-tuning the local Llama (project B, separate brainstorm).
- Mature style-fidelity eval metrics (project C, separate brainstorm — the pilot diagnostic is a stripped-down precursor).
- Multi-teacher comparison. Sonnet 4.6 only; Opus is a deferred upgrade pass on individual personas if needed.
- Parallel harness execution. Sequential is fine for 150 games; Pro Max throttles concurrency anyway.
- Risk-scoped persona overrides. The three personas have `games: [risk]` in their YAML and the harness uses their `systemPrompt` directly; no persona-gating refactor is needed for headless use ([[project_plugin_persona_gating]] is a live-game concern).
- 6-player generalization ([[project_risk_6p_followup]] remains deferred).
- Engine changes that would require live-game testing. All changes are in headless/AI paths.

## Design

### Architecture

Three concrete pieces of work:

1. **Harness fixes** — three small surgical changes to `risk-player.js`, `prompts.js`, and `risk-tourney.mjs`.
2. **Pilot wrapper** — `scripts/risk-pilot.sh` runs the six pairings sequentially and writes one JSONL file per pairing.
3. **Style diagnostic** — `scripts/risk-style-diag.mjs` reads the pilot output and prints a structured diagnostic with a GO/NO-GO recommendation.

### Component: Shortlist always includes phase terminators

**File:** `plugins/risk/server/ai/risk-player.js`

Today `shortlist = scored.slice(0, MAX_SHORTLIST)`. `end-attack` and `end-turn` get `-0.5` from `board-eval.js:51` and are pushed out by any 6 attacks/fortifies with higher scores. When the LLM then picks `end-attack` (it's a real Risk move and the model knows about it), `chooseAction` throws `InvalidLlmMove` because the picked id isn't in the shortlist — even though it's perfectly legal.

Fix: after taking the top-6, force-include the phase's terminator move if not already present. Shortlist becomes up-to-7 in attack and fortify phases; other phases unchanged.

```javascript
const TERMINATORS_BY_PHASE = { attack: 'end-attack', fortify: 'end-turn' };
const terminatorId = TERMINATORS_BY_PHASE[state.phase];
if (terminatorId && !shortlist.some(m => m.id === terminatorId)) {
  const terminator = moves.find(m => m.id === terminatorId);
  if (terminator) shortlist.push({
    ...terminator,
    score: scoreCandidate(state, botPlayerIdx, terminator.action),
  });
}
```

This is a structural fix: phase terminators are not optional moves the engine can choose to hide based on score. They're how the bot signals "I'm done with this phase," and that signal must always be available to the model.

### Component: Banter dropped from collection prompt

**Files:** `plugins/risk/server/ai/prompts.js`, `plugins/risk/server/ai/risk-player.js`

`buildTurnPrompt` gains a `mode: 'live'|'collection'` parameter. In `'collection'` mode the response footer becomes:

```
Respond with a single JSON object (and nothing else): {"moveId": "<one of the candidate ids above>"}
```

`parseLlmResponse` already tolerates missing `banter` (defaults to empty string), so no parser change is needed. `chooseAction` accepts a `mode` argument defaulted to `'live'`. The headless harness passes `'collection'`.

Live game behavior is unchanged byte-for-byte; the new mode is opt-in via the new argument. The persona system prompt is unchanged — its "respond with {moveId, banter}" instruction is overridden by the more-recent prompt-level footer, and models follow the most recent instruction.

This decouples two concerns:
- **Move selection** carries the style signal we want to train into the student.
- **Banter** is character voice that can be regenerated cheaply at runtime by any model with the persona system prompt + game context.

Stripping banter from collection saves ~30-50 output tokens per turn (small per turn, meaningful across ~7500 turns) and removes one parse-failure surface.

### Component: Pause/resume across rate-limit windows

**File:** `scripts/risk-tourney.mjs`

Two changes:

1. **Append mode + resume detection.** Open the output JSONL in `flags: 'a'` instead of `'w'`. At startup, count newlines in the existing file (if any) → set `startIndex = lineCount` → skip games `0..startIndex-1` in the loop. Every completed game is a checkpoint by virtue of being flushed to the file.
2. **Rate-limit handling.** Catch HTTP 429 / 5xx from the LLM client (Claude CLI maps these to specific error types — check existing error surface in `src/server/ai/llm-client.js` during implementation). On first occurrence: print `[paused: rate-limited, sleeping 5m]`, sleep 5 minutes, retry the same game. On second consecutive occurrence: exit code 0 with a one-line `[resume with: <same command>]` message. Two-strikes-and-exit prevents infinite retry loops; resume is just re-running the same command.

Both intra-pairing and inter-pairing resume are handled by the harness's line-count logic alone — if a pairing's output file is already at 25 lines, `startIndex = 25` means the harness loop body runs zero times and exits cleanly. The wrapper script does not need explicit existence checks; it just re-invokes the harness for every pairing on every run.

### Component: Corpus transcript shape

**File:** `src/server/ai/headless-game.js`

Two existing bugs and one new field. The current transcript writes:
```javascript
{ turn, side, phase, chosenMoveId: result.action.type, banter, stateBefore, action }
```

Bug 1: `chosenMoveId: result.action.type` saves `"attack"` or `"deploy"` — the action type — not the actual move id like `"attack:middle_east->india"`. The pairing of state → exact-move is the whole training signal; losing the move id destroys the corpus.

Fix: `chooseAction` already has `match.id` in scope. Have it return `chosenMoveId: match.id` alongside `action`. Harness writes `chosenMoveId: result.chosenMoveId`.

Bug 2: No shortlist recorded. Training needs "given these 7 candidates, the persona picked X" — without the shortlist the corpus reduces to "given this state, pick from the full legal set," a harder and lower-quality training task that doesn't match the engine's runtime conditioning.

Fix: `chooseAction` returns the `shortlist` it sent to the model. Harness writes it per-turn. Shortlist entries are `{ id, summary, score }` (action and full move payload are derivable from `state` + `id` if anyone ever needs them, but `id` and `summary` are the minimum sufficient set for training-prep).

New game-level metadata fields added to the existing per-game JSONL line:
```javascript
{
  harnessGitSha,           // captured from `git rev-parse HEAD` at run time
  buildTurnPromptVersion,  // imported from prompts.js (new exported integer constant; bump on prompt text changes)
  collectionMode: 'collection',
}
```

`buildTurnPromptVersion` is a new exported integer constant in `prompts.js` (start at `1`). Manual bump on any change to the text of `buildTurnPrompt`. Hashing `buildTurnPrompt.toString()` was considered and rejected — whitespace-only changes shouldn't invalidate a corpus.

Per-turn shape after fixes:
```javascript
{
  turn: 47,
  side: 'a',
  phase: 'attack',
  chosenMoveId: 'attack:middle_east->india',
  shortlist: [
    { id: 'attack:middle_east->india',       summary: 'attack middle_east->india with 5',  score: 2.3 },
    { id: 'attack:middle_east->afghanistan', summary: 'attack middle_east->afghanistan with 5', score: 1.8 },
    { id: 'end-attack',                      summary: 'stop attacking',                    score: -0.5 },
    // ... up to 7 entries
  ],
  stateBefore: { /* full risk state */ },
  action: { type: 'attack', payload: { from, to, force } }
  // no banter field in collection mode
}
```

Persona system prompts go in `data/risk-corpus/pilot/pilot-meta.json` rather than being repeated on every line:

```json
{
  "model": "claude-sonnet-4-6",
  "harnessGitSha": "...",
  "buildTurnPromptVersion": 1,
  "personaSystemPrompts": {
    "admiral-vonnegut": "You are Admiral Vonnegut...",
    "colonel-jaune":    "You are Colonel Jaune...",
    "major-robert":     "You are Major Robert..."
  },
  "pairings": [
    { "sideA": "admiral-vonnegut", "sideB": "admiral-vonnegut", "games": 25 },
    { "sideA": "admiral-vonnegut", "sideB": "colonel-jaune",    "games": 25 },
    { "sideA": "admiral-vonnegut", "sideB": "major-robert",     "games": 25 },
    { "sideA": "colonel-jaune",    "sideB": "colonel-jaune",    "games": 25 },
    { "sideA": "colonel-jaune",    "sideB": "major-robert",     "games": 25 },
    { "sideA": "major-robert",     "sideB": "major-robert",     "games": 25 }
  ],
  "totalGames": 150,
  "totalTurns": 0,
  "startedAt": "...",
  "completedAt": "..."
}
```

The pilot wrapper writes/updates this file as it progresses.

### Component: Pilot wrapper script

**File:** `scripts/risk-pilot.sh`

Bash script that invokes `risk-tourney.mjs` six times (one per pairing) with appropriate flags. Pseudo-code:

```bash
#!/usr/bin/env bash
set -euo pipefail
OUTDIR="data/risk-corpus/pilot"
mkdir -p "$OUTDIR"

PAIRINGS=(
  "admiral-vonnegut:admiral-vonnegut"
  "admiral-vonnegut:colonel-jaune"
  "admiral-vonnegut:major-robert"
  "colonel-jaune:colonel-jaune"
  "colonel-jaune:major-robert"
  "major-robert:major-robert"
)

for i in "${!PAIRINGS[@]}"; do
  IFS=":" read -r A B <<< "${PAIRINGS[$i]}"
  OUT="$OUTDIR/${A}-${B}.jsonl"
  SEED=$((100 * i))
  node scripts/risk-tourney.mjs \
    --a claude:claude-sonnet-4-6 \
    --b claude:claude-sonnet-4-6 \
    --persona-a "$A" \
    --persona-b "$B" \
    --games 25 \
    --seed "$SEED" \
    --max-turns 500 \
    --out "$OUT"
done

# Write/update pilot-meta.json with totals + completed timestamp.
node scripts/risk-pilot-meta.mjs "$OUTDIR"
```

`risk-tourney.mjs`'s append-and-resume behavior means re-running the wrapper picks up where it left off. The seed offset of 100 per pairing keeps each pairing's seeds disjoint and reproducible.

`scripts/risk-pilot-meta.mjs` is a tiny helper that reads the persona catalog, counts games and turns across all pairing files, and writes `pilot-meta.json`. ~30 lines.

### Component: Style diagnostic

**File:** `scripts/risk-style-diag.mjs`

Reads every `*.jsonl` in `data/risk-corpus/pilot/`, computes three metrics per persona, runs pairwise chi-square tests, and prints a GO/NO-GO recommendation.

**Metric 1: Move-type mix per persona.** For each turn attributable to a persona (filename → `personaA`/`personaB` → `side`), tally the action type. Output the percentage of turns spent in each action type. A first-pass sanity check.

**Metric 2: Attack-when-available rate.** Among the persona's `attack`-phase turns where the shortlist contained at least one attack with positive `score`, count whether the persona chose an attack or chose `end-attack`. Output as a percentage. This is the primary aggression signal — filters out "no good attacks were available" noise.

**Metric 3: Average force committed per attack.** Among the persona's attacks, mean `force / (stateBefore.territories[from].armies)`. Currently degenerate (the legal-move generator only emits `armies - 1`, so this is always 100%), but compute and report it anyway as scaffolding for when partial-commit moves are added later.

**Pairwise chi-square.** Compute chi-square test on Metric 2 (attack-when-available) for each pair of personas. Three tests total. Use the standard 2x2 contingency formula; no external library needed (~15-line helper).

**GO/NO-GO rule.** Two-prong gate:

1. All three pairwise chi-square tests on attack-when-available must reach p < 0.01.
2. The spread between most-aggressive and most-defensive persona's attack-when-available rate must be at least 15 percentage points.

Both must pass for GO. If chi-square fails → personas not separating → write a prompt-iteration spec next. If chi-square passes but spread < 15pp → personas separate weakly → iterate on prompts to amplify before committing to scale-up.

Output format (printed to stdout, no file write):

```
Risk style diagnostic — 150 games, 6 pairings, model=claude-sonnet-4-6

                       vonnegut   jaune     robert
  turns                2847       2913      2856
  attack%              18.2%      22.4%     31.1%
  attack-when-avail    54%        68%       91%
  mean-force-frac      100%       100%      100%   (degenerate — see note)

Pairwise chi-square on attack-when-avail:
  vonnegut vs robert:   chi²=42.7, p<0.001  ✓
  vonnegut vs jaune:    chi²=8.1,  p=0.004  ✓
  jaune    vs robert:   chi²=18.4, p<0.001  ✓

Spread (max - min attack-when-avail): 37pp

GO: all three pairs distinguishable at p<0.01; spread ≥ 15pp. Recommend scale-up.
```

The diagnostic is informative regardless of outcome — even a NO-GO output points at which pair is undifferentiated, which is the input to the next iteration.

### Data flow

```
                                    ┌──────────────────────────────────────┐
   scripts/risk-pilot.sh            │                                      │
        │                           │  (6 pairings × 25 games sequential)  │
        ▼                           │                                      │
   scripts/risk-tourney.mjs ────────┴───→  Claude CLI (Sonnet 4.6)
        │                                       │
        │                                       │  via ClaudeCliClient
        │                                       │
        ▼                                       ▼
   src/server/ai/headless-game.js  →   per-turn shortlist + chosenMoveId
        │                                       │
        ▼                                       ▼
   data/risk-corpus/pilot/                                            
     vonnegut-vonnegut.jsonl                                          
     vonnegut-jaune.jsonl                                             
     vonnegut-robert.jsonl                                            
     jaune-jaune.jsonl                                                
     jaune-robert.jsonl                                               
     robert-robert.jsonl                                              
     pilot-meta.json
        │
        ▼
   scripts/risk-style-diag.mjs  →  stdout report + GO/NO-GO
```

### Error handling

- **Shortlist truncation defect:** fixed by always-include phase terminator (no longer surfaces).
- **LLM rate-limit (429/5xx):** sleep 5min, retry once; second consecutive failure → exit cleanly with resume instruction. Pilot wrapper's idempotence means re-running the wrapper picks up where it left off.
- **LLM throws other errors:** existing harness behavior — log game as forfeit and continue. Forfeits show up in the corpus with `endReason: 'forfeit'`; the diagnostic skips forfeit turns (or includes them depending on the metric; flagged in implementation).
- **`maxTurns` exceeded:** existing harness behavior — record `endReason: 'timeout'`, winner `null`, count as draw.
- **Diagnostic missing pairings file:** print which file is missing, exit 1.
- **Persona system prompt not found in `pilot-meta.json`:** diagnostic prints which persona id is missing, exits 1.

### Testing

- **Unit:** `risk-player.js` shortlist now contains the phase terminator even when 6 high-scoring attacks exist.
- **Unit:** `buildTurnPrompt({ mode: 'collection' })` omits the banter clause from the footer; `'live'` mode unchanged.
- **Unit:** `headless-game.js` transcript records `chosenMoveId` as the actual move id (e.g. `attack:middle_east->india`), not the action type.
- **Unit:** `headless-game.js` transcript includes a `shortlist` array on each turn.
- **Unit:** Resume detection in `risk-tourney.mjs` correctly skips ahead when output file already has N lines (test: pre-seed a file with 3 fake lines, run with `--games 5`, assert harness ran 2 games not 5).
- **Unit:** Chi-square helper in `risk-style-diag.mjs` matches a known reference value (e.g., 2x2 contingency with known chi² of ~7.88 at p=0.005).
- **Unit:** Style diagnostic emits GO when all three pairwise tests pass and spread is 15pp+; emits NO-GO when one test fails or spread is below threshold.
- **No live integration test against Claude CLI in CI.** Pilot run itself is the integration test, executed by the user.

## What it deliberately doesn't do

- **No fine-tuning prep.** The corpus is documented as the consumer contract; project B converts JSONL → Unsloth/Axolotl format.
- **No full corpus.** Pilot only. Scale-up is gated on the diagnostic.
- **No multi-teacher comparison.** Sonnet only.
- **No automatic prompt iteration.** If the diagnostic returns NO-GO, the next spec is human-written prompt iteration, not an automated search loop.
- **No live UI for transcripts.** JSONL files are the artifact; existing transcript-replay tooling (or `jq`) is the inspection surface.
- **No retroactive smoke-test re-run.** The Haiku-vs-Haiku smoke result that motivated this work is informative as-is; we're not re-running it post-fix because the pilot is the more meaningful integration test.

## Open questions

None blocking. Resolved during brainstorming:
- Banter handling: dropped from collection prompt; subagent at runtime ✓
- Teacher model: Sonnet 4.6 only ✓
- Persona scope: three risk-gated personas (vonnegut, jaune, robert) ✓
- Game count: 25 per pairing × 6 pairings = 150 ✓
- Pairing structure: all six ordered pairings including self-play ✓
- Wrapper script vs manual commands: wrapper ✓
- Bake-in vs pull-out for downstream training: deferred to project B, but corpus format supports both ✓
- Style diagnostic scope: three metrics, chi-square on attack-when-available, 15pp spread threshold ✓

## Branch

`feat/risk-data-collection-pilot` from `main`.
