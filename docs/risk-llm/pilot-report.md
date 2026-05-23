# Risk LLM Persona-Style Pilot — Report

**Story:** E2-1
**Status:** Complete
**Model:** `claude-sonnet-4-6` (`--effort low`, `--tools ""`)
**Harness commit:** `a80ac88` (post-E2-9 cards-aware build, `BUILD_TURN_PROMPT_VERSION=2`)
**Run window:** 2026-05-22 18:50 UTC → 2026-05-23 06:17 UTC (~11h 27m wall-clock)
**Corpus:** `data/risk-corpus/pilot/` — 6 pairings × 25 games = **150 games**, 23,581 turns

## Recommendation

**NO-GO.** The carded engine + current persona system prompts do not produce a measurable
style spread on the legacy `attack-when-avail` metric or on E2-9's supplement
`postCardSecuredAggression`. Both saturate at ~97% across all three personas (1pp spread).
**Iterate on prompt design — likely beyond minor copy edits — before scaling to the full
corpus or training run.**

The pilot did surface a *separate* persona signal in **harness-compliance / forfeit rate**
(`admiral-vonnegut` 8% vs `colonel-jaune` 17% vs `major-robert` 18%) — see *Persona signal
in failure mode* below.

## Diagnostic output (verbatim)

```
Risk style diagnostic — 150 games, model=claude-sonnet-4-6

                      admiral-vonnegut      colonel-jaune         major-robert
turns                 8061                  7442                  8078
attack%               60.6%                 59.5%                 61.6%
attack-when-avail     97%                   97%                   98%
post-card-aggr        97%                   96%                   97%
mean-force-frac       93.9%                 93.4%                 93.6%

Pairwise chi-square on attack-when-avail:
  admiral-vonnegut vs colonel-jaune: chi²=5.5, p=0.020  ✗
  admiral-vonnegut vs major-robert: chi²=0.6, p=0.434  ✗
  colonel-jaune vs major-robert: chi²=9.7, p=0.002  ✓

Spread (max - min attack-when-avail): 1pp

NO-GO: at least one pair not significant at p<0.01.
Iterate on prompts before scaling up.
```

## Per-pairing breakdown

| Pairing | Games | Wins | Timeouts | JSON-fail | Illegal-fail | Mean turns |
|---|---:|---:|---:|---:|---:|---:|
| `admiral-vonnegut-admiral-vonnegut` | 25 | 20 | 0 | 3 | 2 | 165 |
| `admiral-vonnegut-colonel-jaune` | 25 | 16 | 0 | 3 | 6 | 134 |
| `admiral-vonnegut-major-robert` | 25 | 21 | 1 | 0 | 3 | 184 |
| `colonel-jaune-colonel-jaune` | 25 | 17 | 0 | 1 | 7 | 155 |
| `colonel-jaune-major-robert` | 25 | 17 | 1 | 3 | 4 | 151 |
| `major-robert-major-robert` | 25 | 14 | 0 | 4 | 7 | 154 |
| **TOTAL** | **150** | **105** (70%) | **2** (1.3%) | **14** (9.3%) | **29** (19.3%) | — |

- **No game hit a deadlock in the engine sense** — the 2 timeouts hit the 500-turn cap, suggesting genuinely-long indecisive endgames rather than a stuck state.
- **43 of 150 games (28.7%) ended in a forfeit** — split into two distinct failure modes (see below).

## Why both metrics saturate

The legacy `attack-when-available` metric and the new `postCardSecuredAggression` supplement
both report ~97% for all three personas. Two reinforcing reasons:

1. **The heuristic shortlist already pre-filters to mostly-aggressive options.**
   `chooseAction` enumerates legal moves, scores them with `board-eval.js`, and hands the LLM
   the top-6 plus the phase terminator. When the model is asked "pick from these six attacks
   or `end-attack`," the probability of attacking is dominated by the shortlist's composition,
   not the persona's preference.
2. **Soft constraint + low effort + cached context.** The footer says "pick one of the candidate
   ids above," but `--effort low` caps thinking budget and `--resume` carries the full session
   history. The model's degrees of freedom inside the shortlist are small.

The result: a metric that *should* discriminate style discriminates the shortlist instead.
This is the more important finding than the GO/NO-GO bit itself: **the current chooser
architecture is structurally hostile to the style signal we want to measure.**

## Persona signal in failure mode

While action metrics saturated, **harness-compliance rates split cleanly two-tier** across personas:

| Persona | Game-slots | JSON-fail | Illegal-fail | Timeout-involved | **Fail rate (J+I)** |
|---|---:|---:|---:|---:|---:|
| admiral-vonnegut | 100 | 5 | 3 | 1 | **8.0%** |
| colonel-jaune | 100 | 3 | 14 | 1 | **17.0%** |
| major-robert | 100 | 6 | 12 | 2 | **18.0%** |

- **admiral-vonnegut** complies with the shortlist constraint at ~92%; the other two at ~82–83%.
- The dominant failure mode for jaune/robert is `InvalidLlmMove` — the model emits a moveId that
  isn't in the current shortlist, usually referencing territories from a *completely different region*
  (e.g., `attack:mongolia->china` when the shortlist is six Ontario attacks). Strong hypothesis:
  context contamination via the `--resume` session — older turns' shortlists bleed into the model's
  current decision.
- `InvalidLlmResponse` (malformed JSON — the model emits two JSON objects, parser keeps both) is
  rarer and more evenly distributed across personas.

**Interpretation:** the variance in compliance IS a style signal — the more "creative" personas
fight the soft constraint harder — but it's the wrong shape of signal for either training (the
failing turns are unrecoverable) or product (forfeited games are user-visible breakage).

## Harness gaps surfaced (follow-on candidates)

(See also `.session/E2-1-session.md` Delivery Findings → Dev.)

- **JSON parser is brittle.** `plugins/risk/server/ai/prompts.js:83` `extractJson` slices
  first-`{` to last-`}`, which captures two concatenated objects as one blob. JSON.parse then
  fails. Mitigate with balanced-brace scanning or first-object-only extraction.
- **Raw response text is discarded on parse failure.** `InvalidLlmResponse` (src/server/ai/errors.js)
  and the llm-client log only carry the parser's error message, not the offending text. Add raw-text
  capture so the parser failure mode can be diagnosed empirically rather than by inference.
- **No retry on `InvalidLlmResponse` or `InvalidLlmMove`.** Single-shot, then forfeit. A
  corrective re-prompt ("your last moveId wasn't in the candidate list — pick from: [...]") would
  likely recover most illegal-move failures.
- **Worth A/B'ing `--effort medium`** vs `low` to see whether more thinking budget moves either the
  forfeit rate or the action-metric spread. Out of scope for this story; the comparison wants
  controlled n.

## What this means for E2-2

E2-2 owns the branch decision — whether the carded engine is the right substrate to continue with,
and whether `postCardSecuredAggression` replaces `attackWhenAvailable` as the gate metric.

Two relevant inputs from E2-1:

1. **Neither metric distinguishes personas under the current chooser.** The supplement E2-9
   added doesn't rescue the gate. Replacing one ~97% metric with another ~97% metric is not the
   axis on which to deliberate.
2. **The real architectural question is the chooser, not the metric.** Until the LLM is given a
   wider action budget (raw legal set, or a richer shortlist, or no shortlist at all), persona
   style cannot show up on aggregate action-frequency metrics — there's nothing for it to choose
   against.

E2-2 may want to consider whether to (a) iterate prompts inside the current chooser, (b) widen the
chooser's action budget, or (c) re-scope the persona project around a different signal (e.g.,
banter quality on the live-mode corpus, where personas have more room).
