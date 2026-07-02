---
story_id: "E2-2"
jira_key: "none"
epic: "E2"
workflow: "trivial"
---
# Story E2-2: Branch decision (review pilot report, declare path)

## Story Details
- **ID:** E2-2
- **Jira Key:** none (kanban-only)
- **Workflow:** trivial
- **Type:** chore
- **Points:** 1
- **Priority:** p1
- **Stack Parent:** E2-1 (pilot complete)

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-07-02T23:25:33Z
**Round-Trip Count:** 1

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-02T23:10:38Z | 2026-07-02T23:12:23Z | 1m 45s |
| implement | 2026-07-02T23:12:23Z | 2026-07-02T23:17:07Z | 4m 44s |
| review | 2026-07-02T23:17:07Z | 2026-07-02T23:21:18Z | 4m 11s |
| implement | 2026-07-02T23:21:18Z | 2026-07-02T23:23:26Z | 2m 8s |
| review | 2026-07-02T23:23:26Z | 2026-07-02T23:25:33Z | 2m 7s |
| finish | 2026-07-02T23:25:33Z | - | - |

## Story Context

### Acceptance Criteria
- Read the pilot report (`docs/risk-llm/pilot-report.md`) from E2-1 and understand the GO/NO-GO diagnostic output
- Analyze persona-style differentiation results (attack metrics, compliance rates, chi-square significance)
- Make a clear GO or NO-GO decision based on statistical significance and architectural findings
- Record the decision in `sprint/epic-E2.yaml` under a new `decision` field
- If GO: mark stories E2-3..E2-7 as ready for promotion and cancel E2-3-alt/E2-4-alt
- If NO-GO: mark stories E2-3-alt/E2-4-alt as ready for promotion and cancel E2-3..E2-7

### Key Findings from E2-1 (pilot report)
**Pilot Result: NO-GO**

The 150-game pilot (6 pairings × 25 games on the carded engine with Sonnet 4.6) found:
- Both `attack-when-available` and `postCardSecuredAggression` metrics saturate at ~97% across all three personas (1pp spread)
- Only one pairwise chi-square test met p<0.01 significance threshold (jaune vs robert at p=0.002)
- The shortlist-based chooser architecture pre-filters to mostly-aggressive options, dominating persona preference over scoring
- A secondary signal emerged: harness-compliance rates split by persona (admiral-vonnegut 8% fail vs jaune/robert 17-18%), but this reflects context contamination and LLM constraint-fight, not recoverable style
- Recommendation: **Iterate on prompt design (likely beyond minor copy edits) before scaling to full corpus or training**

### Branch Decision
**Recommended Path:** NO-GO  
**Rationale:** Current persona prompts + legacy chooser architecture do not produce statistically significant action-frequency spread. The architectural question (shortlist width limiting persona choice budget) is more fundamental than the metric choice. Before scaling to full corpus, iterate on either:
1. Prompt iteration within current chooser constraints, OR
2. Widen action budget (richer shortlist / raw legal set), OR
3. Re-scope personas around a different signal (e.g., banter quality on live-mode corpus)

### Branch Strategy
**Repository:** g-1 (current directory `.`)
**Branch Strategy:** trunk-based (branching skipped — work happens on the default branch)
**Note:** This repository uses a trunk-based development model with no feature branches. All work commits directly to the main branch. No `feat/` branch is created for this story.

## Sm Assessment

**Setup complete — routing to dev (implement phase).**

- Session file created with full story context; acceptance criteria sourced from sprint YAML.
- Jira: skipped — kanban-only story, no Jira key exists.
- Branch: none by design — repo g-1 is trunk-based, work lands on `main` directly.
- Story is a 1pt decision gate, workflow `trivial` (setup → implement → review → finish). The pilot report at `docs/risk-llm/pilot-report.md` is complete and decision-ready; the implement phase records the GO/NO-GO decision in `sprint/epic-E2.yaml` and marks the corresponding story path ready/cancelled per the ACs.
- Downstream impact: this decision unblocks 7 stories (E2-3..E2-7 on GO, E2-3-alt/E2-4-alt on NO-GO). No other stories depend on this one's code — it is a sprint-metadata change only.

## Delivery Findings

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

**No upstream findings at setup time** — pilot report (E2-1) is complete and decision-ready.

### Dev (implementation)

- **Question** (non-blocking): Marking both alt stories `ready` per AC makes E2-4-alt appear in the available backlog even though its `depends_on` (E2-3-alt) is not done — SM research could recommend it prematurely. Affects `sprint/epic-E2.yaml` (either E2-4-alt stays `backlog` until E2-3-alt completes, or backlog display should respect `depends_on` for ready stories). *Found by Dev during implementation.*

### Reviewer (code review)

- **Gap** (blocking): `pf context create epic E2`, run by the setup gate-recovery pipeline, silently OVERWROTE the existing curated epic context (git blob `80f3c17`: cards-first decision history, 46/150-game pause rationale, full `plugins/risk/server/` architecture map) with a thin template extracted from the YAML description. Affects `sprint/context/context-epic-E2.md` (restore curated content from `99fc8e6:sprint/context/context-epic-E2.md` and merge in the NO-GO decision). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `pf context create` should refuse to overwrite a non-template context file (or take a `--force` flag) — a recovery path intended to create MISSING context should never destroy existing curated context. Affects pennyfarthing `pf context create` command (add overwrite guard). *Found by Reviewer during code review.*

## Design Deviations

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

None at setup time.

### Dev (implementation)
- No deviations from spec. Status changes made via `pf sprint story update` CLI (not hand-edited); the `decision` field structure (story/date/call/source/rationale) was unconstrained by the AC and chosen to be self-documenting. → ✓ ACCEPTED by Reviewer: verified against the diff — all 7 status transitions match the NO-GO branch of the AC exactly, and the decision field content is faithful to `docs/risk-llm/pilot-report.md` (97% saturation, 1pp spread, 1/3 chi² pairs at p<0.01 all check out against the report verbatim).

### Reviewer (audit)
- **Curated epic context replaced by generated template:** Dev's assessment disclosed that `context-epic-E2.md` was "regenerated by setup recovery pipeline" but did not assess that the regeneration was destructive — the prior file was curated content (architecture map, cards-first history, promotion guardrails), not a stale template, and the replacement loses all of it. Not logged as a deviation by SM/Dev. Severity: H.

## Dev Assessment

**Implementation Complete:** Yes

**Decision declared: NO-GO** — per `docs/risk-llm/pilot-report.md`. Both style metrics saturate at ~97% across all three personas (1pp spread); only 1 of 3 pairwise chi-square tests met p<0.01. Root cause is the shortlist chooser architecture, not the metric.

**Files Changed:**
- `sprint/epic-E2.yaml` — added epic-level `decision` field (NO-GO, dated, with rationale and source); E2-3..E2-7 → `canceled`; E2-3-alt/E2-4-alt → `ready`
- `sprint/context/context-epic-E2.md` — regenerated by setup recovery pipeline (`pf context create epic E2`)
- `sprint/context/context-story-E2-2.md` — created by setup recovery pipeline

**Tests:** 1398/1398 passing, 1 expected skip (GREEN — metadata-only change, no code touched)
**Branch:** main (trunk-based, no feature branch)
**YAML validation:** `pf sprint validate sprint/epic-E2.yaml` passes; backlog reflects the new story states

**Handoff:** To review phase (Arthur Dent)

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings |

**All received:** Yes (1 enabled subagent returned clean; 8 disabled via `workflow.reviewer_subagents` settings)
**Total findings:** 1 confirmed (Reviewer's own), 0 dismissed, 0 deferred

### Rule Compliance

Lang-review checklists exist for golang/javascript/python/rust/typescript only; the diff touches YAML and generated markdown exclusively — no numbered lang-review rule governs any hunk. No `SOUL.md` exists. Diff-applicable process rules checked instead:
- "Never manually edit sprint YAML to add stories" — compliant: no stories added; status flips made via `pf sprint story update` CLI; the `decision:` field addition is the story's own explicit AC.
- "Use `/pf-sprint story add` to create stories" — N/A, no stories created.
- Schema validity — compliant: `pf sprint validate sprint/epic-E2.yaml` passes with the new `decision:` mapping.

### Devil's Advocate

Argue this commit is broken. First: the decision itself. Could NO-GO be wrong? The gate criterion was pre-registered (all 3 chi² pairs at p<0.01 AND spread ≥ 15pp); the run produced 1/3 pairs significant and a 1pp spread. Even a motivated reader can't squint GO out of that — the call is mechanical. But second: what did the commit break *around* the decision? The regenerated epic context. A future agent picking up E2-3-alt opens `context-epic-E2.md` expecting the epic's accumulated wisdom and finds a template stub with `## Background: _to be filled in_`. The architecture map it replaced — `chooseAction` shortlist flow, `board-eval.js` scoring, `view.js` redaction — is the exact subject matter of E2-3-alt's failure analysis. The agent won't know the richer version ever existed; git history preserves the bytes but not the pointer. Third: E2-4-alt now shows `ready` in the backlog while its dependency E2-3-alt is untouched — an SM in a hurry could set up the rerun before the analysis it depends on exists. Dev flagged it, but flagging isn't preventing. Fourth: nothing consumes `decision:` programmatically — if a future `pf sprint promote` ignores it, the canceled stories could be resurrected by accident. The first concern dissolves under evidence; the second is real damage introduced by this commit and is what my verdict turns on.

## Reviewer Assessment

**Verdict:** REJECTED

| Severity | Issue | Location | Fix Required |
|----------|-------|----------|--------------|
| [HIGH] | Setup's gate-recovery `pf context create epic E2` destructively replaced the curated epic context (architecture map of the chooser pipeline, cards-first decision history, promotion guardrails — git blob `80f3c17`) with a 35-line generated template; E2-3-alt, made `ready` by this very commit, needs exactly that architecture content for its failure analysis | `sprint/context/context-epic-E2.md` | Restore the curated content from `99fc8e6:sprint/context/context-epic-E2.md`, update it with the NO-GO decision + new story states, commit |

**Observations (5+):**
1. [HIGH] Curated epic context lost to template regeneration at `sprint/context/context-epic-E2.md:1-35` (see table).
2. [VERIFIED] Decision field content is faithful to the source report — `sprint/epic-E2.yaml:25-39` states 97% saturation / 1pp spread / 1-of-3 chi² pairs at p<0.01, matching `docs/risk-llm/pilot-report.md:24-42` verbatim diagnostic output. No applicable lang rule governs YAML; schema validation passes.
3. [VERIFIED] All six ACs met in the YAML: decision recorded (epic level, dated, sourced); exactly five GO-path stories → `canceled` (E2-3,4,5,6,7); exactly two alt stories → `ready` — every hunk in `git show 36a5d12 -- sprint/epic-E2.yaml` accounted for, no stray edits.
4. [VERIFIED] Status enum spelling `canceled` matches the pf CLI enum (`--status [backlog|ready|...|canceled]`) and consumers handle it: `pf sprint backlog` output no longer lists E2-3..E2-7 and shows both alts as `ready`.
5. [VERIFIED] Epic `status: in_progress` correctly retained at `sprint/epic-E2.yaml:23` — the NO-GO path keeps the epic live; canceling the epic itself would have been wrong.
6. [MEDIUM] `context-story-E2-2.md:30` claims "No acceptance criteria recorded in the sprint YAML" while the session file carries six ACs — the generated story context is misleading for anyone auditing the archive. Fix rides along with the HIGH fix or is accepted as generator limitation.
7. [LOW] E2-4-alt is `ready` while `depends_on: E2-3-alt` is unstarted — compliant with the AC's explicit instruction, risk already logged by Dev as a delivery finding.

**Data flow traced:** pilot report recommendation → `decision:` field (`sprint/epic-E2.yaml:25`) → story `status` fields → `pf sprint data`/`pf sprint backlog` rendering (verified: canceled stories excluded, alts listed as ready). Safe because the sprint tooling validates the schema and the backlog view reflects the intended states.
**Pattern observed:** good — status mutations done through `pf sprint story update` CLI rather than hand-edits at `sprint/epic-E2.yaml:77` etc., keeping schema validation in the loop.
**Error handling:** N/A for YAML metadata; schema validation (`pf sprint validate`) is the guard and passes.
**Security analysis:** no secrets, no auth surface, no user input in the diff; commit touches sprint metadata only.
**Dispatch tags:** [EDGE] [SILENT] [TEST] [DOC] [TYPE] [SEC] [SIMPLE] [RULE] — all eight specialists disabled via settings; their domains were assessed directly by the Reviewer above (edge: status enum/consumer behavior; silent failures: destructive context overwrite — found; tests: N/A metadata; docs: stale story-context AC claim — found; types: schema validity; security: clean; simplification: none needed; rules: no applicable lang rules).

**Handoff:** Back to Dev (Trillian) for the context restoration fix — docs-only rework, no test cycle needed.

## Dev Assessment — Rework Round 1

**Implementation Complete:** Yes (commit `5c630a4`, pushed to main)

**Fixes applied per Reviewer Assessment:**
- [HIGH] `sprint/context/context-epic-E2.md` — curated content restored verbatim from `99fc8e6` (overview, cards-first background, full technical architecture, cross-epic dependencies) with two story-accurate updates: the gating paragraph now records that the decision landed, and a new `## Branch Decision (E2-2, 2026-07-02): NO-GO` section captures the pilot numbers, the chooser root-cause, the story-state consequences (including the E2-4-alt depends-on warning), and the three candidate directions for E2-3-alt.
- [MEDIUM] `sprint/context/context-story-E2-2.md` — false "No acceptance criteria recorded" claim replaced with the six real ACs; template stubs in Technical Approach/Scope filled with the actual approach.
- Also committed: `sprint/epic-E2.yaml` review_verdict/review_findings fields written by the Reviewer's own `pf sprint story update` call (were sitting uncommitted in the tree).

**Tests:** No code touched this round (markdown + YAML only); suite was GREEN at 1398/1398 this session.
**Branch:** main (trunk-based), pushed.

**Handoff:** Back to review (Arthur Dent) for re-verdict.

### Dev (rework round 1) — deviations
- No deviations: the fix follows the Reviewer's prescribed remedy exactly (restore from `99fc8e6`, merge in decision + story states). → ✓ ACCEPTED by Reviewer: `git diff 99fc8e6:sprint/context/context-epic-E2.md HEAD:...` shows the restored file is byte-identical to the curated original except the two intended changes (gating paragraph updated, Branch Decision section inserted).

## Subagent Results — Round 2 (rework re-review)

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings |

**All received:** Yes (1 enabled subagent returned clean; 8 disabled via `workflow.reviewer_subagents` settings)
**Total findings:** 0 confirmed, 0 dismissed, 0 deferred — round 1's HIGH and MEDIUM both verified fixed

## Reviewer Assessment — Round 2

**Verdict:** APPROVED

**Round-1 findings resolution:**
1. [HIGH → RESOLVED] Curated epic context restored: `git diff 99fc8e6:sprint/context/context-epic-E2.md HEAD:sprint/context/context-epic-E2.md` shows Background, Technical Architecture, and Cross-Epic Dependencies byte-identical to the curated original; only two intended deltas exist — the gating paragraph now records the decision (`context-epic-E2.md:15-16`) and a new `## Branch Decision (E2-2, 2026-07-02): NO-GO` section (`context-epic-E2.md:37-71`) whose figures all verify against `docs/risk-llm/pilot-report.md` (97% saturation, 1pp spread, jaune-vs-robert p=0.002, compliance 8/17/18, top-6 shortlist).
2. [MEDIUM → RESOLVED] `context-story-E2-2.md:30-36` now carries the six real ACs matching the session file verbatim; Technical Approach and Scope stubs replaced with accurate content.
3. [VERIFIED] Rework commit `5c630a4` touches exactly the three expected files (132+/44-), no source code; suite GREEN 1398/1398, 1 pre-existing skip; `pf sprint validate` passes; working tree clean of story artifacts.
4. [VERIFIED] The Branch Decision section explicitly warns E2-4-alt depends on E2-3-alt (`context-epic-E2.md:64-65`) — mitigates Dev's round-1 delivery finding about premature pickup.
5. [VERIFIED] `sprint/epic-E2.yaml` round-1 review-verdict fields committed; internally consistent with the NO-GO record.

**Data flow traced:** pilot report → epic YAML `decision:` → epic context Branch Decision section → next agent (E2-3-alt) reads restored architecture + decision in one place. Safe: all three artifacts now agree.
**Pattern observed:** good — restoration sourced from git history rather than rewritten from memory, keeping the curated text authoritative.
**Error handling:** N/A (docs/metadata); schema validation passes.
**Security:** no secrets, no auth surface, docs/YAML only.
**Dispatch tags:** [EDGE] [SILENT] [TEST] [DOC] [TYPE] [SEC] [SIMPLE] [RULE] — specialists disabled via settings; domains covered directly (docs accuracy re-verified line-by-line against the pilot report; no code paths to edge-check; nothing silent, nothing to simplify; no applicable lang rules).

### Devil's Advocate — Round 2

Argue the rework is broken. Could the restoration have resurrected stale claims? The restored gating paragraph originally said "stories must not be promoted until E2-2 records a decision" — now updated, so no contradiction survives. Could the new decision section drift from the YAML record? Cross-checked: same call, same date, same numbers, same path forward — three artifacts (report, YAML, context) agree. Could the commit have swept in unrelated changes? The stat shows exactly three files; the untracked tmux/runtime files remain untouched. Could E2-4-alt still be picked up early? Yes — the `ready` status stands per the AC, but the risk is now documented in both the delivery findings and the context file the SM will read; residual risk is process, not artifact. The one thing I cannot fix here: `pf context create` will happily destroy this restored file again on the next gate recovery — that lives upstream in pennyfarthing and is logged as a non-blocking Improvement finding. Nothing here blocks approval.

### Reviewer (code review — round 2, delivery findings)
- No new upstream findings during re-review; round-1 Improvement re `pf context create` overwrite guard stands.

**Handoff:** To Slartibartfast (SM) for finish-story.