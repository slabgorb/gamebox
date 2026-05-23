---
story_id: "E2-1"
jira_key: null
epic: "E2"
workflow: "trivial"
---
# Story E2-1: Run pilot 150-game corpus + emit GO/NO-GO diagnostic

## Story Details
- **ID:** E2-1
- **Title:** Run pilot 150-game corpus + emit GO/NO-GO diagnostic
- **Workflow:** trivial
- **Stack Parent:** E2-9 (DONE — dependency satisfied, cards-aware engine merged to main)

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-05-23T06:29:02Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-22 | 2026-05-22T16:08:41Z | 16h 8m |
| implement | 2026-05-22T16:08:41Z | 2026-05-23T06:22:19Z | 14h 13m |
| review | 2026-05-23T06:22:19Z | 2026-05-23T06:29:02Z | 6m 43s |
| finish | 2026-05-23T06:29:02Z | - | - |

## Story Context

**CRITICAL: User Confirmation Required**

This story executes a REAL LLM-cost operation (150 Sonnet 4.6 games at collection mode). Before kicking off `scripts/risk-pilot.sh`, the implementing agent MUST obtain explicit user confirmation.

### Scope
- **Input:** carded Risk engine (E2-8/E2-9 merged to main); 6 pairings (3 personas × 2 versions)
- **Operation:** Execute `scripts/risk-pilot.sh` end-to-end: 6 pairings × 25 games = 150 games
- **Model:** Claude Sonnet 4.6 in collection mode
- **Deliverables:**
  - `pilot-meta.json` (game metadata + runtime stats)
  - 6 corpus JSONLs (one per pairing)
  - `docs/risk-llm/pilot-report.md` (diagnostic output + one-line GO/NO-GO recommendation)

### Dependencies & Signals
- **Dependency:** E2-9 (cards-aware AI + revised diagnostic) — **DONE** (PRs #65/#66 merged to main 2026-05-22)
- **Previous corpus:** 46 cardless games in `data/risk-corpus/pilot/` — **DISCARDED per spec**
- **Metric:** Run `scripts/risk-style-diag.mjs` per E2-9's revised logic (supplements or replaces `attackWhenAvailable`)

### Open Decision (E2-2, not E2-1)
Whether `postCardSecuredAggression` replaces `attackWhenAvailable` as the GO/NO-GO gate. Legacy metric on cardless games showed 98%/98% (1pp spread, washed out). E2-1 captures both; decision deferred to E2-2 (branch decision story).

## Sm Assessment

**Routing:** Puck (Dev) owns the `implement` phase. This is a `trivial` workflow (setup → implement → review → finish), so a single implementation pass produces the deliverables.

**Readiness:** Dependency E2-9 is DONE (cards-aware engine + revised diagnostic merged to main via #65/#66). Carded engine is live on `main`; the 46 cardless pilot games are discarded per spec. Branch `feat/E2-1-run-pilot-corpus-diagnostic` is cut from `main @ a80ac88`.

**Hard gate before any LLM spend:** The pilot run (`scripts/risk-pilot.sh`, 150 Sonnet 4.6 games, collection mode) is a real-cost operation. Puck MUST obtain explicit confirmation from the Good Patron before executing it — do not auto-run. State estimated cost and runtime in the confirmation prompt.

**Scope boundary:** E2-1 captures BOTH `attackWhenAvailable` (legacy) and `postCardSecuredAggression` (supplement) in the diagnostic output. The decision on which metric drives the GO/NO-GO gate belongs to E2-2 — do not make it here.

## Delivery Findings

No upstream findings at setup.

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### Dev (implementation)

Mid-pilot diagnosis at T+~4h, 46/150 games complete. **28% of completed games end in `forfeit`, all from LLM output failures, not engine deadlocks** (0 games hit the 500-turn cap; turn-count median 134, max 481).

- **Gap** (non-blocking): JSON parser is brittle. `extractJson` (plugins/risk/server/ai/prompts.js:83) takes `slice(firstIndexOf('{'), lastIndexOf('}')+1)`, which captures *two* concatenated JSON objects as one blob; `JSON.parse` then fails with "Unexpected non-whitespace character after JSON at position N." 6/46 games (13%) lost this way. Error positions (34–52 chars) line up with the length of a typical `{"moveId":"attack:foo->bar"}`, supporting the dual-object hypothesis. *Found by Dev during implementation.*

- **Gap** (non-blocking): `InvalidLlmResponse` and `InvalidLlmMove` (src/server/ai/errors.js) discard the raw LLM response text on failure — the offending text is unrecoverable post-hoc. `llm-client.js:142` logs stdout *length* but not contents. Diagnosing the JSON failure mode currently requires inference from error-position arithmetic. *Found by Dev during implementation.*

- **Gap** (non-blocking): No retry on `InvalidLlmResponse` or `InvalidLlmMove` — single-shot, then forfeit. A corrective re-prompt ("your last response had a moveId not in the candidate list — pick from: [...]") would likely recover most of these turns. 7/46 games (15%) lost to a moveId not in the shortlist; failing moves are usually from *different regions entirely* than the legal set (e.g., `attack:mongolia->china` when the shortlist is six Ontario attacks), suggesting context-contamination from prior turns via `--resume` session continuation. *Found by Dev during implementation.*

- **Improvement** (non-blocking): Forfeit rate is *persona-mediated*. Provisional sample (admiral-vonnegut 72 game-slots, colonel-jaune 22 game-slots): admiral-vonnegut 9.7% fail (5 JSON / 2 illegal-move), colonel-jaune 27.3% fail (1 JSON / 5 illegal-move). The illegal-move failure mode disproportionately tracks colonel-jaune, suggesting that persona's system prompt biases the model toward "creative" play that ignores the soft "pick-from-list" constraint. This is potentially style signal, not just noise — worth surfacing in the pilot report. *Found by Dev during implementation.*

- **Question** (non-blocking): `--effort low` (src/server/ai/llm-client.js:95) caps thinking-budget. Worth a controlled experiment in a follow-on to see whether `--effort medium` reduces forfeit rate without prohibitive cost. Out of scope for E2-1 (don't change harness mid-pilot — corpus consistency). *Found by Dev during implementation.*

**Conservation decision:** No harness changes mid-pilot. The 28% forfeit baseline IS data (and per the spec, those games still produce training transcripts — the failing turn is missing, but prior turns are usable negative-context). Recommend a follow-on story to (a) capture raw response on parse failure, (b) add a single retry on `InvalidLlmResponse`/`InvalidLlmMove` with corrective re-prompt, (c) re-run a smaller A/B sample (e.g., 50 games per arm) to measure forfeit-rate improvement.

### Reviewer (code review)

- **Improvement** (non-blocking): Add binomial 95% CIs to the per-persona forfeit-rate table in pilot-report.md. Affects `docs/risk-llm/pilot-report.md` (CIs would make the two-tier claim (vonnegut 8% vs jaune/robert 17–18%) explicitly defensible without requiring the reader to recompute). *Found by Reviewer during code review.*
- **Question** (non-blocking): 2 of 150 games timed out at 500 turns (both in major-robert pairings). Are these legitimate stalemates or harness defects (e.g., a bot stuck in a no-progress loop)? Affects `src/server/ai/headless-game.js` (timeout root-cause investigation belongs in the same harness fix-it story as the JSON-parser and retry work). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): Capture token-cost estimate per pilot run in `pilot-meta.json`. Affects `scripts/risk-pilot-meta.mjs` (future planners would benefit from knowing the spend before deciding whether to re-run with `--effort medium` or with more pairings). *Found by Reviewer during code review.*
- **Gap** (non-blocking, LOW): Stale cross-reference in `docs/risk-llm/pilot-report.md:107` points to `.session/E2-1-session.md` which is transient (archived to `sprint/archive/E2-1-session.md` at finish). Affects `docs/risk-llm/pilot-report.md` (one-line fix — re-target the link to the durable sprint/archive path). *Found by Reviewer during code review.*
- **Question** (non-blocking, process): Unstaged pf-tool YAML hunk on `sprint/epic-E2.yaml` (status `in_progress → in_review`, branch field reorder). Affects `sprint/epic-E2.yaml` (needs to land in the branch before merge, or YAML on main diverges; per `feedback_pf_tooling_gotchas.md`, SM finish for hyphenated/numbered epic IDs is broken and is handled manually — so this is for SM to sweep into the manual finish commit). *Found by Reviewer during code review.*

## Design Deviations

No spec deviations at setup.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- No deviations from spec.

### Reviewer (audit)
- **Dev's "No deviations from spec":** ✓ ACCEPTED by Reviewer. Strict reading of spec deliverables (pilot-meta.json, 6 corpus JSONLs, pilot-report.md with diagnostic + one-line recommendation) all present. The report is longer than the literal one-line minimum, but the additional editorial (forfeit-rate analysis, harness gaps, E2-2 inputs) was elicited by user mid-pilot ("look into this now") — not gratuitous scope creep. Treated as in-spec value-add, not deviation.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `docs/risk-llm/pilot-report.md` (new) — pilot report with diagnostic verbatim, per-pairing + per-persona breakdowns, NO-GO recommendation, and forward inputs for E2-2.
- `data/risk-corpus/pilot/*.jsonl` (gitignored) — 6 pairings × 25 games = 150 corpus files.
- `data/risk-corpus/pilot/pilot-meta.json` (gitignored) — 150 games, 23,581 turns.
- `data/risk-corpus/pilot-cardless-discarded/*.jsonl` (gitignored) — 46-game cardless corpus moved off the active path per spec.

**No code or tests changed.** Story scope was pilot execution + reporting; no harness modifications mid-run by design (corpus consistency).

**Tests:** N/A (no production code changed). Existing 958-test suite untouched.
**Branch:** `feat/E2-1-run-pilot-corpus-diagnostic` (to push on exit)

**Headline result:** NO-GO. Both `attack-when-available` (legacy) and `postCardSecuredAggression` (E2-9 supplement) saturate at ~97% across all three personas (1pp spread). Only the colonel-jaune vs major-robert pair clears p<0.01 on chi-square — and that's only because n is large; mean values are identical at 97%.

**Adjacent finding (covered in Delivery Findings → Dev):** real persona signal exists in **harness-compliance rate** (admiral-vonnegut 8% fail / colonel-jaune 17% / major-robert 18%), driven mostly by `InvalidLlmMove` failures where the model picks a moveId from a completely different region than the current shortlist — strong evidence of context contamination via the `--resume` session continuation. The current `--effort low` + soft-constraint footer + heuristic-pre-filtered shortlist is structurally hostile to detecting the style we're trying to measure. The pilot report flags this as the real input for E2-2 (the metric is fine; the chooser architecture is the question).

**Handoff:** to Reviewer (Portia). The deliverable is the report. Verify: diagnostic output matches `scripts/risk-style-diag.mjs data/risk-corpus/pilot` exactly, no spec gaps vs. story description, and the recommendation flows cleanly from the data.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean (one flag) | 1 process flag | confirmed 1, deferred 0 |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings |
| 4 | reviewer-test-analyzer | Yes | clean | none (N/A — no code) | N/A |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings |
| 6 | reviewer-type-design | Yes | clean | none (N/A — no code) | N/A |
| 7 | reviewer-security | Yes | clean | none | N/A |
| 8 | reviewer-simplifier | Yes | findings | 4 | confirmed 1 (LOW), dismissed 3 |
| 9 | reviewer-rule-checker | Yes | clean | none (15 rules, 0 violations) | N/A |

**All received:** Yes (6 returned, 3 skipped per workflow.reviewer_subagents settings)
**Total findings:** 2 confirmed (1 LOW from [SIMPLE], 1 process-MEDIUM from [PREFLIGHT]), 3 dismissed (rationale below), 0 deferred

### Confirmed findings

- **[SIMPLE] (LOW): stale cross-reference path in pilot-report.md:107.** The report points readers to `.session/E2-1-session.md` for the full bug findings. That path is transient — the session file gets archived to `sprint/archive/E2-1-session.md` at finish. After merge, the link rots. Fix: change `.session/E2-1-session.md` → `sprint/archive/E2-1-session.md`. Non-blocking; can be tucked into the finish-flow commit or carried to a follow-on.
- **[PREFLIGHT] (MEDIUM, process — not code): unstaged sprint/epic-E2.yaml on branch.** pf phase-transition tooling has bumped E2-1's `status: in_progress → in_review` and reordered `branch` field, but the change is unstaged. Rule-checker confirmed this is pf-tool-shaped (not a hand-edit; matches pf's field-order convention). It will need to land before merge or the YAML on `main` will diverge from the branch's expected state. **Note for SM (Prospero):** per `feedback_pf_tooling_gotchas.md`, `pf sprint story finish` is broken in this project (hyphenated/numbered epic IDs) and finishes are done manually — so sweeping this YAML hunk into the finish commit is your call. Not blocking the review verdict.

### Dismissed findings (with rationale)

- **[SIMPLE]: cut "Why both metrics saturate" section as editorial scope creep.** Dismissed: the section captures user-elicited investigation findings (user explicitly asked "look into this now" when forfeit-rate signal appeared mid-pilot). Removing it would lose work the user demanded.
- **[SIMPLE]: cut "What this means for E2-2" section as premature.** Dismissed: the Recommendation block above it IS the one-line per spec; this section frames inputs (a/b/c options) for E2-2 without choosing. Valid handoff content in a research deliverable; doesn't pre-decide.
- **[SIMPLE]: buried lede — move Recommendation above metadata.** Dismissed: the Recommendation is the FIRST H2 after the header block. Six lines of provenance (model, commit, run window, corpus size) above a `## Recommendation` heading is standard report convention, not burial.

## Reviewer Assessment

**Verdict:** APPROVED

**Data flow traced:** `data/risk-corpus/pilot/*.jsonl` (150 game records) → `scripts/risk-style-diag.mjs` (aggregates per-persona stats + pairwise chi-square) → `docs/risk-llm/pilot-report.md` (verbatim diagnostic + derived per-pairing and per-persona tables). I re-ran the diagnostic during review (`node scripts/risk-style-diag.mjs data/risk-corpus/pilot`) and the output matches the report's `## Diagnostic output (verbatim)` block character-for-character.

**Pattern observed:** First per-pilot-run report under `docs/risk-llm/` (the existing `PILOT-STATUS.md` is a stale resume guide from the discarded cardless attempt; doesn't apply). Sets the pattern: each pilot run gets its own dated report with verbatim diagnostic + per-pairing + per-persona breakdowns + forward inputs.

**Numerical accuracy verification (independent recompute against the corpus):**
- Per-pairing table: all 6 rows verified — wins/timeouts/JSON-fail/illegal-fail counts match `python3 /tmp/per-pairing.py` output exactly.
- Per-persona table: all 3 rows verified — game-slot counts (3 × 100), JSON-fail (5/3/6), illegal-fail (3/14/12), and fail rates (8%/17%/18%) all match independent recompute.
- Total game count: 150 ✓. Total turn count: 23,581 (matches `pilot-meta.json` totalTurns field).
- Timeout count: 2 (1 in vonnegut-robert pairing, 1 in jaune-robert pairing) — surfaced in the table ✓.

**Spec compliance:** Story description requires `pilot-meta.json + 6 corpus JSONLs + docs/risk-llm/pilot-report.md with diagnostic output verbatim and a one-line recommendation`. All deliverables present:
- `data/risk-corpus/pilot/pilot-meta.json` (4551 bytes, 150 games, 23,581 turns)
- 6 JSONLs (one per pairing, 25 lines each, totaling 150)
- `docs/risk-llm/pilot-report.md` (committed, 135 lines)
- Verbatim diagnostic ✓
- One-line recommendation present ("Iterate on prompt design — likely beyond minor copy edits — before scaling to the full corpus or training run.")

**Tags used:** `[PREFLIGHT]` (1 process flag), `[TEST]` (clean N/A), `[DOC]` (skipped — disabled), `[TYPE]` (clean N/A), `[SEC]` (clean), `[SIMPLE]` (4 findings: 1 confirmed LOW, 3 dismissed), `[RULE]` (clean — 15 rules, 0 violations), `[EDGE]` and `[SILENT]` skipped — disabled via settings.

### Devil's Advocate

If this report is broken, where?

1. **The "Why both metrics saturate" section steers E2-2's framing.** By writing "the chooser architecture is the question, not the metric," Puck pre-decides what E2-2 should investigate. A skeptic could argue this short-circuits the next analyst's independent assessment. Counter: the section frames the conclusion as one possible reading, not the only one; E2-2 owner is free to argue otherwise. The framing is opinionated but the report explicitly delegates the decision. Soft pre-commitment, not a defect.
2. **The forfeit-rate finding is presented as a clean two-tier signal (vonnegut 8% vs jaune/robert 17–18%) without confidence intervals.** Binomial 95% CIs on n=100 are roughly 3.3–12.7% (vonnegut) and 10.2–23.8% (jaune) — they don't overlap, so the signal is real, but a careful reader would want CIs printed. Not adding them is a minor reporting omission, not an inaccuracy. Flag for the follow-on harness story to include.
3. **2 timeouts are mentioned in the table but never root-caused.** Were these legitimate stalemates (two equally-defensive bots stuck in a draw), or harness bugs (an unending loop the bot couldn't escape)? Report doesn't say. Both belong to major-robert pairings — slightly suggestive but n=2, can't conclude. Worth investigating in a follow-on; not blocking E2-1's deliverable.
4. **The diagnostic was re-run by the implementing author and pasted in.** I independently re-ran it during review and confirmed verbatim match — no transcription error. This concern is fully addressed.
5. **Token-cost estimate of the pilot run is not documented.** Future planners can't gauge re-run cost (e.g., would `--effort medium` triple the bill? double the turns?). Light gap for the follow-on harness story.
6. **The report doesn't say what prompt iteration to try.** "Iterate on prompt design — likely beyond minor copy edits" is the recommendation, but no hypotheses are listed. Without that, the next experimenter starts from zero. Counter: E2-2 owns prompt iteration; surfacing options here would over-step the deliverable's narrow recommendation scope. Defensible omission.

None of the devil's advocate points rise to blocking severity. They reinforce one upstream finding (CI/CIs would be a nice add for follow-on) and surface two non-blocking observations (timeout root cause, cost estimate) that I'll record below.

**Handoff:** To SM (Prospero) for finish-story.