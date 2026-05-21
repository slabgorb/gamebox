# Risk LLM Pilot — Status & Resume Guide

**Story:** E2-1 (Run pilot 150-game corpus + emit GO/NO-GO diagnostic)
**Status:** `in_progress` — pilot paused mid-run on 2026-05-21
**Owner:** slabgorb

This doc captures exactly where the pilot stands and how to resume it, so the
task can be picked up cold without re-deriving context.

---

## What the pilot is

A 150-game data-collection run (6 persona pairings × 25 games) of Sonnet 4.6
playing headless Risk against itself in **collection mode** (banter stripped).
The goal is a GO/NO-GO decision on whether three personas play in
*measurably distinguishable styles* — the gate for the whole E2 epic.

GO/NO-GO rule (from `scripts/risk-style-diag.mjs`):
1. All 3 pairwise chi-square tests on **attack-when-available** rate at p < 0.01, AND
2. Spread between min and max attack-when-available rate ≥ 15 percentage points.

The harness, collection mode, transcript-shape fixes, retry, append-resume,
pilot wrapper, and diagnostic all shipped in PRs #58 + #60 (merged to `main`,
commit `066df51`).

---

## Current state (paused 2026-05-21 ~11:08 EDT)

**46 of 150 games captured**, all valid JSONL, on disk at `data/risk-corpus/pilot/`:

| Pairing | File | Games | Status |
|---|---|---|---|
| admiral-vonnegut × admiral-vonnegut | `admiral-vonnegut-admiral-vonnegut.jsonl` | 25/25 | ✅ complete |
| admiral-vonnegut × colonel-jaune | `admiral-vonnegut-colonel-jaune.jsonl` | 21/25 | ⏸ partial |
| admiral-vonnegut × major-robert | (not started) | 0/25 | — |
| colonel-jaune × colonel-jaune | (not started) | 0/25 | — |
| colonel-jaune × major-robert | (not started) | 0/25 | — |
| major-robert × major-robert | (not started) | 0/25 | — |

The run was stopped deliberately (user wanted to address something before
training). No corruption — the harness writes whole JSONL lines only, so the
interrupted game 22 of pairing 2 simply wasn't written.

---

## How to resume

```bash
./scripts/risk-pilot.sh
```

That's it. The wrapper + harness handle resume automatically:
- Pairing 1 is skipped entirely (`25 >= 25` → "all complete, nothing to do").
- Pairing 2 resumes at game 22 (line-count resume on the append-mode `.jsonl`).
- Pairings 3–6 run fresh.
- On completion the wrapper auto-runs `risk-pilot-meta.mjs` to write `pilot-meta.json`.

If a Pro Max rate-limit window is hit, the harness sleeps once and retries; a
second consecutive rate-limit checkpoints and exits 0 with a resume message —
just re-run the same command.

**Timing:** ~290–330s/game wall-clock observed. 104 games remain → roughly
**8.5–10 hours** unattended (plus any rate-limit pauses). Run it backgrounded.

---

## ⚠️ Headline finding — investigate before the full run / before training

**Forfeit rate is ~35% (16 / 46 games), and almost all are `InvalidLlmMove`,
NOT latency timeouts.**

Breakdown of the 16 forfeits:
- **13× `InvalidLlmMove`** — the model picked a moveId that wasn't in the
  offered shortlist. Almost all are `fortify:X->Y` (and a few `attack:X->Y`)
  where X→Y is a *real* Risk adjacency but the move wasn't in the pre-scored
  top-6 shortlist the prompt offered. Example:
  `LLM picked 'fortify:peru->argentina' not in legal set [fortify:mongolia->kamchatka, ...]`
- **3× invalid JSON** — `response is not valid JSON: Unexpected non-whitespace
  character after JSON` (model emitted extra prose after the JSON object).
- **0× CLI timeout** in these 46 games. (The one timeout we saw was an isolated
  smoke-test game, not part of the corpus.)

### Why this matters
- 35% of games end early, shrinking the corpus and the diagnostic's sample.
- More importantly it reveals the model **wants moves the shortlist doesn't
  offer.** `MAX_SHORTLIST = 6` (+ forced terminator) may be too small for the
  fortify/attack phases — the model has a strong opinion about a 7th move and
  picks it, triggering the forfeit. Task 1's fix only guaranteed the *phase
  terminator* is present; it did not widen the shortlist or constrain the model
  to it more firmly.

### Hypotheses to test (E2-3-alt territory if this is the NO-GO cause)
1. **Shortlist too narrow.** Raise `MAX_SHORTLIST` for fortify/attack so the
   model's preferred move is more often on offer. Cheap to try.
2. **Prompt not constraining hard enough.** The collection footer says "pick
   one of the candidate ids above" but the model free-associates real Risk
   moves. Consider echoing the legal-set constraint more forcefully, or
   rejecting+reprompting once on `InvalidLlmMove` instead of forfeiting.
3. **Invalid JSON (3×).** `parseLlmResponse` already strips code fences and
   extracts the first `{...}`; the failures are "extra non-whitespace after
   JSON." A more lenient extractor (take first balanced object, ignore trailing
   prose) would recover these.

### Decision
Whether to fix forfeits before completing the pilot is a **judgment call for
the user**. Two framings:
- **Fix-first:** a 35% forfeit rate may be confounding the style signal (an
  aggressive persona that forfeits early looks less aggressive than it is).
  Worth a shortlist-width + retry-on-invalid-move fix, then restart the pilot
  fresh (new corpus, since prompt/harness behavior changed).
- **Ship-as-is:** forfeits are roughly persona-independent (latency/JSON/move
  errors aren't tied to aggression), so the attack-when-available *rate* over
  completed turns may still be a clean comparison. Finish the run and let the
  diagnostic speak.

If we change harness/prompt behavior, **discard the current 46 games and start
a fresh corpus** — mixing prompt versions pollutes the signal. The per-game
records carry `buildTurnPromptVersion` so mixed corpora are detectable, but the
diagnostic doesn't currently segment by it.

---

## File map

| Path | Role |
|---|---|
| `scripts/risk-pilot.sh` | 6-pairing wrapper; resumable; auto-runs meta builder at end |
| `scripts/risk-tourney.mjs` | Per-pairing harness; `--mode collection`, append+resume, retry |
| `scripts/risk-pilot-meta.mjs` | Writes `pilot-meta.json` (counts, persona prompts, timestamps) |
| `scripts/risk-style-diag.mjs` | Reads corpus, computes metrics, prints GO/NO-GO |
| `src/server/ai/headless-game.js` | `runGame` — drives a full 2-bot game, builds transcript |
| `src/server/ai/retry.js` | `runWithRateLimitRetry` / `isRateLimitError` |
| `src/server/ai/diagnostics/chi-square.js` | `chiSquare2x2`, `chiSquarePValue` |
| `plugins/risk/server/ai/prompts.js` | `buildTurnPrompt` (live/collection footer), `BUILD_TURN_PROMPT_VERSION` |
| `plugins/risk/server/ai/risk-player.js` | `chooseAction` — scores moves, builds shortlist, calls LLM |
| `data/ai-personas/{admiral-vonnegut,colonel-jaune,major-robert}.yaml` | The 3 pilot personas |
| `data/risk-corpus/pilot/*.jsonl` | The corpus (one file per pairing) |
| `data/risk-corpus/pilot/pilot-meta.json` | Written only after a full run completes |
| `docs/superpowers/plans/2026-05-21-risk-data-collection-pilot.md` | The implementation plan |
| `docs/superpowers/specs/2026-05-21-risk-data-collection-pilot-design.md` | The design spec |

## Inspecting the corpus

```bash
# games per pairing
for f in data/risk-corpus/pilot/*.jsonl; do
  printf "%2d  %s\n" "$(grep -c . "$f")" "$(basename "$f")"
done

# forfeit reasons (digits masked for grouping)
cat data/risk-corpus/pilot/*.jsonl | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{const ls=d.trim().split("\n").filter(x=>x);const r={};for(const l of ls){const g=JSON.parse(l);if(g.endReason==="forfeit")r[(g.forfeitReason||"").replace(/[0-9]+/g,"N")]=(r[(g.forfeitReason||"").replace(/[0-9]+/g,"N")]||0)+1;}console.log(r);})'

# run the diagnostic on whatever is captured so far (needs >= 2 personas present)
node scripts/risk-style-diag.mjs data/risk-corpus/pilot/
```

---

## Next steps (E2-1 → E2-2)

1. **Decide on the forfeit issue** (fix-first vs ship-as-is) — see Decision above.
2. Complete the 150-game run (resume command above).
3. Run `risk-style-diag.mjs`, capture output into `docs/risk-llm/pilot-report.md`.
4. That report + the GO/NO-GO is the E2-1 deliverable; E2-2 is the branch decision.

GO → E2-3..E2-7 (scope corpus, collect, prep, fine-tune, integrate).
NO-GO → E2-3-alt (failure analysis — the forfeit finding above is a head start),
E2-4-alt (revised prompts + rerun).
