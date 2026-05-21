---
story_id: "E2-11"
jira_key: null
epic: "E2"
workflow: "trivial"
---
# Story E2-11: Per-game-type AI model seam (Risk -> Sonnet 4.6, others stay Haiku)

## Story Details
- **ID:** E2-11
- **Jira Key:** null
- **Epic:** E2 (Risk LLM persona-style corpus and training)
- **Workflow:** trivial
- **Points:** 2
- **Type:** chore
- **Priority:** p1
- **Stack Parent:** none

## Description

Add a per-game-type model map so each AI adapter selects its own LLM model, defaulting to DEFAULT_MODEL (Haiku) with Risk overridden to Sonnet (claude-sonnet-4-6). Today src/server/ai/index.js constructs a single shared ClaudeCliClient for all games; thread a per-game model through bootAiSubsystem -> orchestrator -> adapter so cribbage/backgammon/words stay on Haiku. This seam is also the precursor E2-7 needs to A/B a fine-tuned model against Sonnet in live Risk.

## Acceptance Criteria
- A per-game-type model map exists; the orchestrator resolves the correct model per game_type
- Risk AI turns use claude-sonnet-4-6; cribbage/backgammon/words remain on the Haiku default
- Game types with no override fall back to DEFAULT_MODEL
- Existing AI tests pass; a test asserts Risk resolves to the Sonnet model and a non-Risk game resolves to Haiku

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-05-21T18:12:15Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-21T17:59:20Z | 2026-05-21T18:00:29Z | 1m 9s |
| implement | 2026-05-21T18:00:29Z | 2026-05-21T18:05:07Z | 4m 38s |
| review | 2026-05-21T18:05:07Z | 2026-05-21T18:12:15Z | 7m 8s |
| finish | 2026-05-21T18:12:15Z | - | - |

## Sm Assessment

**Setup Complete:** Yes
**Story:** E2-11 — Per-game-type AI model seam (Risk → Sonnet 4.6, others stay Haiku)
**Workflow:** trivial (phased) — setup → implement → review → finish
**Repos:** g-1 (standalone)
**Branch:** feat/E2-11-ai-model-seam (created)
**Session File:** .session/E2-11-session.md (created)

**Scope:** Thread a per-game-type model map through bootAiSubsystem → orchestrator → adapter so Risk uses claude-sonnet-4-6 while cribbage/backgammon/words stay on the Haiku DEFAULT_MODEL. Precursor seam for E2-7's fine-tuned-model A/B.

**Handoff:** To Puck (Dev) for the implement phase. ACs are concrete and testable; existing AI tests must stay green plus new assertions for Risk→Sonnet and non-Risk→Haiku resolution.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/server/ai/llm-client.js` - export DEFAULT_MODEL; add MODEL_BY_GAME_TYPE + modelForGameType(); add `model` getter to ClaudeCliClient
- `src/server/ai/index.js` - bootAiSubsystem builds llmByGameType map (injected llm reused for all in tests; per-type ClaudeCliClient at resolved model otherwise); returns it
- `src/server/ai/orchestrator.js` - accept llmByGameType; resolve gameLlm by game_type with shared llm fallback; use gameLlm in chooseAction + chooseBanter
- `test/ai-llm-client.test.js` - modelForGameType + model getter / --model arg tests
- `test/ai-bootstrap.test.js` - boot test asserts risk→sonnet, others→Haiku default

**Tests:** 935/935 passing (1 skipped = live-CLI test). AI-subsystem subset 36/36 GREEN.
**Branch:** feat/E2-11-ai-model-seam (pushed)

**AC coverage:**
- Per-game-type model map exists; orchestrator resolves model per game_type — yes (llmByGameType + gameLlm resolution)
- Risk → claude-sonnet-4-6; cribbage/backgammon/words → Haiku default — yes
- Unmapped game types fall back to DEFAULT_MODEL — yes (modelForGameType)
- Existing AI tests pass + new Risk-Sonnet / non-Risk-Haiku assertions — yes

**Handoff:** To Portia (Reviewer) for the review phase.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 935/935 pass, 1 expected skip, 0 smells | N/A (GREEN) |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings — reviewer assessed boundaries manually |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings — reviewer assessed error paths manually |
| 4 | reviewer-test-analyzer | Yes | findings | 5 (1 high in-scope, 2 high pre-existing, 2 low/med) | confirmed 1, deferred 4 |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings — reviewer reviewed comments manually |
| 6 | reviewer-type-design | Yes | findings | 4 (all low) | confirmed 1, deferred 3 |
| 7 | reviewer-security | Yes | findings | 1 (low/medium) | confirmed 1 (non-blocking) |
| 8 | reviewer-simplifier | Yes | findings | 2 (both low) | confirmed 2 (non-blocking) |
| 9 | reviewer-rule-checker | Yes | findings | 4 violations (3 pre-existing, 1 in-scope low) | confirmed 1, deferred 3 |

**All received:** Yes (6 enabled returned, 3 disabled pre-filled)
**Total findings:** 2 confirmed in-scope (Low/Medium, non-blocking), 5 deferred (pre-existing, out of scope for this chore)

### In-scope confirmed findings

- **[TYPE][SEC][RULE] LOW — new `modelForGameType`/`MODEL_BY_GAME_TYPE` uses a plain object + `??`** (`src/server/ai/llm-client.js:13-19`). A proto-key (`__proto__`, `constructor`) read returns a truthy inherited value, so `??` doesn't fall through; the value would coerce to a garbage `--model` string. Matches JS checklist rule #3; corroborated by three specialists. **Reachability: none today** — the only caller keys it with `Object.keys(adapters)` (static), and `game_type` is allowlist-validated at INSERT (routes.js:93). Worst case is a safe bot-stall (no shell injection: spawn uses array args, no `shell:true`). Confirmed at LOW, **non-blocking** per severity rubric. Hardening (`Object.create(null)` + `Object.hasOwn`) recommended as fast-follow since this is the foundational seam for E2-7.
- **[TEST] MEDIUM — orchestrator's per-game-type selection has no direct test** (`src/server/ai/orchestrator.js:136`). All orchestrator tests omit `llmByGameType`, so the `gameLlm = llmByGameType?.[game_type] ?? llm` branch always exercises the fallback. The AC's core wiring is covered indirectly (boot-map test + `modelForGameType` unit test + the line executing on every turn), but no test asserts a game-type-specific client is forwarded to `chooseAction`. Confirmed at MEDIUM, **non-blocking**. Recommend an orchestrator test with an explicit `llmByGameType` spy as fast-follow.

### Deferred (pre-existing, not introduced by this diff)

- **[SILENT] llm-client.js `catch {}` on instrumentation JSON.parse** — pre-existing (predates branch); diff did not touch it.
- **[RULE] llm-client.js unconditional `console.log` instrumentation (×2)** — pre-existing `TEMP DIAGNOSTIC` lines; preflight reported 0 console.log in changed lines.
- **[TEST] vacuous `doesNotThrow(scheduleTurn)` adapter tests (×2)** — pre-existing backgammon/words tests; line numbers shifted by the new test insertion but the assertions are unchanged.
- **[TYPE][RULE] `adapters[game_type]` / `autoActions[game_type]` plain-object bracket access** — pre-existing orchestrator convention; the new line 136 follows the same established pattern and is guarded by the existing adapter-miss check above it.

### Rule Compliance (JS lang-review checklist, new code only)

1. Silent errors — no new empty catches. PASS (the flagged catch{} is pre-existing).
2. Async pitfalls — `for...of` over `Object.keys(adapters)` is synchronous; `gameLlm` change preserves the existing awaited/floating-banter patterns. PASS.
3. Prototype pollution — `MODEL_BY_GAME_TYPE[gameType]` keyed by static adapter keys (compliant); `llmByGameType?.[game_type]` is the one new DB-keyed read, guarded by the adapter-miss check. Confirmed LOW finding above. PASS-with-note.
4. Equality/coercion — no new `==`; `?? `/`?.` used correctly. PASS.
5. DOM security — N/A (server-side). PASS.
6. Node.js — `spawn` with array args, no `shell:true`, no variable `require`, no leaked secrets. PASS.
7. Regex — none introduced. PASS.
8. Test quality — new tests use exact `assert.equal`/`deepEqual`, non-vacuous; spawn spy proven called via `captured`. PASS (flagged doesNotThrow tests are pre-existing).
9. Module/scope — all `const`/`let`, named exports, no circular deps. PASS.
10. Error handling — no new throws/catches. PASS.
11. Input validation — parameterized DB query unchanged; model strings are config constants. PASS.
12. Dependency hygiene — model ID is config, not a secret; no new console.log in changed lines. PASS.
13. Fix regressions — return shape additively extended (`+ llmByGameType`); optional orchestrator param via `?.`; backward compatible. PASS.

### Devil's Advocate

Suppose this code is broken. The most dangerous claim is "Risk now runs on Sonnet" — what if it silently doesn't? If a future refactor renamed the adapter key from `risk` to `risk-game`, `MODEL_BY_GAME_TYPE` would no longer match and Risk would silently fall to Haiku with no error — a quality regression invisible to every existing test, because no orchestrator test asserts the resolved model reaches `chooseAction`. That is exactly finding #2, and it is the strongest argument for adding the selection test. Next: a malicious or corrupt DB row with `game_type='constructor'`. Walking it through — the orchestrator's adapter-miss guard (line 114) fires first: `adapters['constructor']` returns the inherited `Object` constructor (truthy!), so the guard does NOT stall as intended, and execution proceeds to line 136 where `llmByGameType['constructor']` likewise returns a function, assigned to `gameLlm`; then `gameLlm.chooseAction` / `.send` is undefined → throws → caught by the attempt loop → bot stalls with `subprocess_error`. So even the adversarial path terminates safely in a stall, not corruption or RCE — but it confirms the rule-3 finding is real, just low-impact. A confused operator reading production logs sees the pre-existing `[llm]` instrumentation on every turn including Sonnet calls — noisy but not wrong. A stressed filesystem: `bootAiSubsystem` constructs `ClaudeCliClient` objects but launches no subprocess until `send`, so boot is unaffected. Config with unexpected fields: `MODEL_BY_GAME_TYPE` is a closed literal; extra game types simply resolve to Haiku, which is the documented intent. Conclusion: no new defect that breaks the happy path; the two confirmed findings are real but Low/Medium and non-blocking.

## Reviewer Assessment

**Verdict:** APPROVED

**Data flow traced:** `game_type` (games DB row, allowlist-validated at INSERT via routes.js:93) → orchestrator `_runOnce` → adapter-miss guard → `gameLlm = llmByGameType?.[game_type] ?? llm` → `adapter.chooseAction({ llm: gameLlm })` → `ClaudeCliClient.send` → `spawn('claude', ['--model', model, ...])`. Safe: model string is a config constant; spawn uses array args (no shell); unknown game_type terminates in a safe stall.

**Pattern observed:** New per-game-type client map built in `bootAiSubsystem` (`src/server/ai/index.js:51-54`) keyed by `Object.keys(adapters)`; resolved per turn in the orchestrator (`src/server/ai/orchestrator.js:136`). Follows the existing `adapters[game_type]` lookup convention. Injected test fakes are reused for all game types, preserving every existing test.

**Error handling:** Unknown/garbage game_type → adapter guard stall or `gameLlm.send` undefined → caught by the retry loop → `markStalled` (`src/server/ai/orchestrator.js:387-392`). No new unguarded failure path.

**Subagent dispatch tags present:** [EDGE] (disabled — manual boundary check, see Devil's Advocate), [SILENT] (disabled — manual: no new swallowed errors), [TEST] (1 confirmed Medium), [DOC] (disabled — manual: new comments accurate, no stale docs), [TYPE] (1 confirmed Low), [SEC] (1 confirmed Low, no shell injection), [SIMPLE] (2 confirmed Low, non-blocking), [RULE] (1 confirmed Low in-scope; 3 deferred pre-existing).

**Why APPROVED:** No Critical or High findings. All confirmed findings are Low/Medium and non-blocking per the severity rubric. Tests are GREEN (935/935). The two in-scope findings (rule-3 hardening of the new utility; orchestrator selection test) are recorded as non-blocking improvements for fast-follow.

**Handoff:** To Prospero (SM) for finish-story.

## Delivery Findings

### Dev (implementation)
- No upstream findings during implementation.

### Reviewer (code review)
- **Improvement** (non-blocking): Harden the new `modelForGameType` seam against proto-key reads. Affects `src/server/ai/llm-client.js` (make `MODEL_BY_GAME_TYPE` an `Object.create(null)` map and add an `Object.hasOwn` guard in `modelForGameType`). *Found by Reviewer during code review.*
- **Gap** (non-blocking): No orchestrator-level test exercises the per-game-type `gameLlm` selection branch. Affects `test/ai-orchestrator-risk-turn.test.js` (construct `createOrchestrator` with an explicit `llmByGameType` spy and assert the game-type client is forwarded to `chooseAction`). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): Pre-existing `[llm]` instrumentation `console.log` (×2) and `catch {}` in `src/server/ai/llm-client.js` are unguarded; consider gating behind a debug flag in a separate cleanup. *Found by Reviewer during code review.*

## Design Deviations

### Dev (implementation)
- No deviations from spec.

### Reviewer (audit)
- Dev logged no deviations. Confirmed: implementation matches all four ACs (per-game-type map exists; orchestrator resolves per game_type; Risk→Sonnet, others→Haiku; unmapped→DEFAULT_MODEL; tests added). ✓ ACCEPTED — no undocumented spec deviations found.