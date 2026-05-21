# Risk Bot Tournament Harness — Design

**Date:** 2026-05-21
**Status:** Approved scope; ready for plan
**Author:** Naomi Nagata (dev) with Bossmang

## Context

The longer-term goal is **local-LLM Risk bots that play with distinguishable personality styles** (aggressive, defensive, expansionist, etc.) tied to existing personas. A deterministic EV engine would beat any LLM at raw win-rate; the *point* of the LLM path is style fidelity. Win-rate is a sanity floor, not the success metric.

The Risk plugin today calls Claude Haiku via `ClaudeCliClient` for every bot action. There is no way to compare two models — local or remote — against each other without standing up a full game between two humans. We need that comparison *before* spending any effort on data collection or fine-tuning, because we can't measure progress without it.

This spec covers **only** the tournament harness — the eval rig. Fine-tuning, data collection, and local-model selection are downstream and out of scope here.

### Downstream intent (informs design, not in scope)

The expected next project is **distillation from Sonnet or Opus as the teacher model**: run thousands of Sonnet-vs-Sonnet (or Opus-vs-Opus, possibly with different personas per side) games through this harness, then fine-tune a local 7B–13B Llama on the resulting transcripts. The harness's JSONL transcripts are explicitly the input format for that pipeline — which is why transcripts are saved by default and why the backend string accepts any Claude model id (`claude:claude-sonnet-4-6`, `claude:claude-opus-4-7`), not just Haiku.

## Goals

- Run N headless Risk games between any two LLM-backed bots, one CLI command, no DB writes, no web UI.
- Pluggable LLM backend: at minimum **Claude (via existing `ClaudeCliClient`)** and **Ollama (new)**. Same `.send({prompt, sessionId, systemPrompt})` interface as today.
- Per-game JSONL output with **full transcripts** (state + chosen action per turn) so every tournament run doubles as training-data collection.
- Aggregate output: win rate with 95% Wilson confidence interval.

## Non-Goals

- Parallel game execution. Sequential is fine for tournaments of 10–50 games.
- DB integration, Pennyfarthing/Jira hooks, or web UI.
- Persona variation logic — pick one persona per side at CLI time and run it.
- Prompt engineering. Uses existing `buildTurnPrompt` unmodified.
- Style-fidelity metrics. Future work; this harness produces the data that future metrics will consume, but doesn't compute them.
- Resilience to LLM failures beyond a single retry. A flaky model means a flaky bot; that's a signal, not a bug.

## Design

### Architecture

Three new files. Nothing existing is modified.

```
scripts/risk-tourney.mjs            CLI entry — argument parsing, tournament loop, reporting
src/server/ai/ollama-client.js      OllamaClient implementing the LLM interface
src/server/ai/headless-game.js      runGame() — pure in-memory Risk game between two LLM clients
```

### Component: `OllamaClient`

Same shape as `ClaudeCliClient`. Posts to `http://localhost:11434/api/chat` with `{model, messages: [{role:'system', content: systemPrompt}, {role:'user', content: prompt}], stream: false}`. Returns `{text, sessionId}` where `sessionId` is a generated UUID on first call and round-tripped after (Ollama is stateless; we maintain the illusion to satisfy the interface). One retry on network error; otherwise throw.

Configurable via constructor:
- `model` (required, e.g. `llama3.1:8b`)
- `baseUrl` (default `http://localhost:11434`)
- `timeoutMs` (default 180_000, same as Claude client)

### Component: `runGame({llmA, llmB, personaA, personaB, seed, maxTurns})`

Pure function — no DB, no orchestrator, no AI-session table.

1. Build a fresh Risk state in memory: territories distributed randomly between two players using `seed` for determinism, standard starting armies per `plugins/risk/server/state.js` rules. Side A is `currentPlayer=0`, side B is `currentPlayer=1`.
2. Loop:
   - Pick the active player's LLM client + persona.
   - Call `chooseAction({llm, persona, sessionId, state, botPlayerIdx, userMessages: []})`.
   - Apply the returned action via the existing `applyAction` from `plugins/risk/server/actions.js`.
   - Append `{turn, side, phase, chosenMoveId, banter, stateBefore}` to the transcript.
   - If `state.winner != null`, break.
   - If `turn >= maxTurns` (default 500), break with `winner=null, endReason='timeout'`.
3. Return `{winner: 'a'|'b'|null, endReason, turnCount, durationMs, transcript}`.

Errors from `chooseAction` (`InvalidLlmResponse`, `InvalidLlmMove`) propagate; the tournament loop logs the game as a forfeit and continues.

### Component: `scripts/risk-tourney.mjs`

CLI:

```
node scripts/risk-tourney.mjs \
  --a claude:claude-haiku-4-5-20251001 \
  --b ollama:llama3.1:8b \
  --persona-a admiral-vonnegut \
  --persona-b admiral-vonnegut \
  --games 20 \
  --seed 42 \
  --out results/run-2026-05-21.jsonl
```

Backend string format: `<kind>:<model>` where kind ∈ {`claude`, `ollama`}. Persona arg looks up by id in the existing persona catalog and uses its `systemPrompt`.

Loop:
- For game `i` in `0..N-1`: alternate which configured backend plays side A (so the side-A advantage cancels out). Derive per-game seed as `seed + i`.
- Print one-line progress per game: `[3/20] A=claude:haiku B=ollama:llama3.1:8b → winner=a, turns=47, 38.2s`.
- Append one JSON line per game to `--out`: `{game: i, sideA, sideB, personaA, personaB, seed, winner, endReason, turnCount, durationMs, transcript}`.

Summary at end:
```
Tournament complete: 20 games, 12m 14s
  claude:claude-haiku-4-5-20251001  : 12 wins (60.0%, 95% CI: 38.7%–78.1%)
  ollama:llama3.1:8b                :  7 wins (35.0%, 95% CI: 18.1%–56.7%)
  draws/timeouts                    :  1
```

Win rates use Wilson score interval; one ~15-line helper, no dependencies.

### Data flow

```
CLI args ──→ parse backends + personas
              │
              ▼
        Tournament loop (N iterations)
              │
              ▼
        runGame() ──→ chooseAction (existing) ──→ LLM client (Claude CLI | Ollama HTTP)
              │
              ▼
        Append JSON line to --out
              │
              ▼
        Print aggregate summary
```

### Error handling

- LLM client throws → game logged as forfeit for the offending side, tournament continues.
- Ollama daemon down → first game fails fast with clear error; tournament aborts (no point retrying).
- `maxTurns` exceeded → game logged with `winner=null, endReason='timeout'`, counted as a draw in summary.
- Invalid `--a`/`--b` format → fail fast at startup with a usage message.

### Testing

- Unit test for `OllamaClient` with `fetch` stubbed — verifies request shape and response parsing.
- Unit test for `runGame` using two stub LLM clients that return canned responses driving a 3-turn game to a known winner. Asserts transcript shape, winner detection, deterministic replay under a fixed seed.
- Unit test for Wilson CI helper.
- No live integration test against a real LLM — those are run by the user, not CI.

## What it deliberately doesn't do

- **No DB writes.** Tournament results are JSONL files. Easy to grep, easy to throw away, easy to convert to training format later.
- **No parallelism.** Future work if game counts grow past 100.
- **No live game viewer.** JSONL → optional one-off script to replay a transcript through the existing UI later if useful.
- **No prompt-tuning surface.** Uses existing `buildTurnPrompt`. If we want to A/B prompts later, that's a separate harness arg.
- **No style-fidelity metrics.** Transcripts contain everything needed to compute them later; the harness just doesn't.

## Open questions

None blocking. Resolved during brainstorming:
- Headless: yes.
- Save full transcripts by default: yes.
- Scope: Claude + Ollama backends, no others for v1.
