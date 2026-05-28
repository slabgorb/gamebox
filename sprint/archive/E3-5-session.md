---
story_id: "E3-5"
jira_key: null
epic: "E3"
workflow: "tdd"
---

# Story E3-5: AI adapter + prompts + two personas + adapter/persona registration

## Story Details

- **ID:** E3-5
- **Jira Key:** (local-only; no Jira sync)
- **Workflow:** tdd
- **Stack Parent:** E3-4 (already merged to main)

## Context Summary

E3-5 makes Sorry! playable against AI opponents by delivering the full AI stack in one slice:

1. **`chooseAction` adapter** (`plugins/sorry/server/ai/sorry-player.js`) — drives the bot's turn with legal-move enumeration, LLM call, response parse, and defensive random fallback
2. **Prompt builder** (`plugins/sorry/server/ai/prompts.js`) — translates board state into LLM input with full game context and legal-move descriptions
3. **JSON-response parser** — extracts `{moveId, banter}` from raw LLM output with fallback on unparseable text
4. **Two contrasting personas** — `the-bully.yaml` (aggressive, loves bumps/Sorry!/slides) and `the-tortoise.yaml` (patient, steady progress, safety-focused)
5. **Adapter registration** — wiring in `src/server/ai/index.js` to the existing adapters map alongside backgammon, cribbage, words, and risk

## Technical Guardrails

- **Mirror backgammon-player.js exactly** — `sorry-player.js` follows the same `chooseAction({ llm, persona, sessionId, state, botPlayerIdx, userMessages })` signature.
- **Defensive in-adapter fallback is mandatory** — on any unparseable or invalid LLM output, fallback to `moves[Math.floor(Math.random() * moves.length)]` before returning. Solo game must never deadlock.
- **Bot emits only `move` actions** — card draw is a server-authoritative rule step; bot never emits a `draw` action.
- **2P only** — `botPlayerIdx` is 0 (side `a`) or 1 (side `b`).
- **Persona schema validation** — `src/server/ai/persona-catalog.js` validates every YAML on load; required fields: `id`, `displayName`, `color`, `glyph`, `systemPrompt` (non-empty strings), optional `games` and `voiceExamples`.
- **Portraits auto-load by persona id** — no separate wiring needed.
- **AI adapter registration follows existing pattern** — add `sorry` entry to the `adapters` map inside `bootAiSubsystem` in `src/server/ai/index.js`.

## Scope Boundaries

**In scope (E3-5):**
- `plugins/sorry/server/ai/prompts.js` — `buildTurnPrompt`, `parseLlmResponse`, `extractJson`
- `plugins/sorry/server/ai/sorry-player.js` — `chooseAction` with legal-move enumeration, LLM call, response parse, and random-legal-move fallback
- `data/ai-personas/the-bully.yaml` — aggressive persona, scoped to `games: [sorry]`
- `data/ai-personas/the-tortoise.yaml` — patient persona, scoped to `games: [sorry]`
- `src/server/ai/index.js` — add `sorry` entry to the `adapters` map inside `bootAiSubsystem`
- Tests: `test/sorry/sorry-player.test.js` and `test/sorry/ai-registration.test.js`

**Out of scope:**
- Client UI (E3-6)
- Additional personas beyond the two
- Turn engine or legal-move enumeration (E3-4 and earlier)
- Per-game model routing
- Orchestrator integration test (E3-6)

## Key Acceptance Criteria

1. **`buildTurnPrompt` surfaces all context** — given `{ state, legalMoves, botPlayerIdx, userMessages }`, it emits: the bot's side, its own pawn positions, opponent pawn positions, drawn card, optional opponent-banter reaction block, full legal-move list with human-readable descriptions keyed by move id, and strict JSON response instruction.

2. **`parseLlmResponse` and `extractJson` are copied helpers** — not cross-plugin imports. `extractJson` strips a fenced code block or slices `{...}` from raw text. `parseLlmResponse` calls `JSON.parse(extractJson(text))` and throws if `moveId` is not a string.

3. **`chooseAction` validates parsed moveId against live legal-move set** — after calling `parseLlmResponse`, it calls `legalMoves(state)` and does `moves.find(m => m.id === parsed.moveId)`. If find returns `undefined`, falls through to random fallback. If `parseLlmResponse` throws (bad JSON), the catch block also falls through to random fallback.

4. **Random fallback guarantees forward progress** — when fallback fires, `chosen` is selected as `moves[Math.floor(Math.random() * moves.length)]`. Because `chooseAction` only runs when `activeUserId === botId` (orchestrator gate), and `legalMoves` was non-empty before the bot was woken, the fallback always picks a valid move. Returned `banter` is the empty string `''` when the fallback fires.

5. **`the-bully.yaml` persona** — Required YAML fields: `id: the-bully`, `displayName: The Bully`, `games: [sorry]`, `color`, `glyph`, `systemPrompt`. System prompt establishes aggressive archetype (loves bumps, Sorry! card, slides that knock opponents back). `voiceExamples` contains at least two short needling lines.

6. **`the-tortoise.yaml` persona** — Required YAML fields: `id: the-tortoise`, `displayName: The Tortoise`, `games: [sorry]`, `color`, `glyph`, `systemPrompt`. System prompt establishes patient archetype (avoids exposure, hugs safety zones, steady forward progress). `voiceExamples` contains at least two calm, slow-and-steady lines.

7. **Adapter registration wires `chooseAction` into the `adapters` map** — in `src/server/ai/index.js`, add: import `sorryPlugin` from `plugins/sorry/plugin.js`; import `chooseAction as sorryChoose` from `plugins/sorry/server/ai/sorry-player.js`; add `sorry: { plugin: sorryPlugin, chooseAction: sorryChoose }` to the `adapters` object inside `bootAiSubsystem`. The `llmByGameType` loop automatically creates a client entry for `'sorry'`.

8. **`test/sorry/sorry-player.test.js` covers LLM-chosen move and fallback** — Test 1: stub `llm.send` returns valid JSON with legal `moveId`; assert `r.action` equals `{ type: 'move', payload: { moveId: 'out:0' } }` and `r.banter` matches. Test 2: stub returns unparseable text; assert `r.action.type === 'move'` and `r.action.payload.moveId` matches a legal move id pattern.

9. **`test/sorry/ai-registration.test.js` verifies both personas load and are scoped to sorry** — The test imports `loadPersonaCatalog` from `src/server/ai/persona-catalog.js` and calls it with the personas directory path. Assert `sorryPersonas.length >= 2` and that `the-bully` and `the-tortoise` ids are present.

## Sm Assessment

**Story setup complete and ready for RED phase.**

- **Workflow:** tdd (phased) — 3pt feature, correct fit for the default TDD path.
- **Dependency:** E3-4 (turn engine `applySorryAction`) merged to `main` via PR #71. No blocking PRs; merge gate clear.
- **Repo:** g-1 (standalone, path `.`, targets `main`). Branch `feat/E3-5-ai-adapter-prompts-personas` created off `main`.
- **Context completeness:** Pre-written story context (sprint/context/context-story-E3-5.md) folded in. All nine ACs captured with concrete file targets, signatures, and assertions. Guardrails emphasize the mandatory in-adapter random fallback (solo game must never deadlock) and the mirror-backgammon-player.js pattern.
- **Scope is well-bounded:** AI stack only (adapter + prompts + 2 personas + registration). Client UI deferred to E3-6.

**Note for downstream agents:** Persona schema lives in `src/server/ai/persona-catalog.js`; both YAMLs must scope `games: [sorry]` or no AI opponent will appear (per project gating rule — a registered plugin without a game-scoped persona is unplayable vs AI). Hamlet (tea) should drive the two test files in AC 8 and AC 9 first.

## TEA Assessment

**Tests Required:** Yes
**Status:** RED (failing — ready for Dev/Puck)

**Test Files:**
- `test/sorry/prompts.test.js` — 13 tests: `buildTurnPrompt` content (AC 1) + `parseLlmResponse`/`extractJson` helpers (AC 2)
- `test/sorry/sorry-player.test.js` — 6 tests: `chooseAction` legal-move application, both fallback paths (bad JSON + illegal id), sessionId threading, move-only guardrail (AC 3, 4, 8)
- `test/sorry/ai-registration.test.js` — 4 tests: two sorry-scoped personas with required fields + voice examples, sorry adapter registration (AC 5, 6, 7, 9)

**Tests Written:** 23 tests covering all 9 ACs
**RED verification (Horatio / testing-runner, RUN_ID E3-5-tea-red):** 0 passed.
- `prompts.test.js` → ERR_MODULE_NOT_FOUND (`plugins/sorry/server/ai/prompts.js` absent)
- `sorry-player.test.js` → ERR_MODULE_NOT_FOUND (`plugins/sorry/server/ai/sorry-player.js` absent)
- `ai-registration.test.js` → 4 assertion failures (personas + adapter registration absent)
- **No unexpected passes** — confirms no vacuous tests.

### AC Coverage Map

| AC | Test(s) | File |
|----|---------|------|
| 1 buildTurnPrompt context | move-id coverage, JSON instruction, pawn positions, card-differential, banter block conditional | prompts.test.js |
| 2 parse/extract helpers | fenced/bare extract, throw-on-no-json, valid parse, throw on missing/non-string moveId, banter default, malformed JSON | prompts.test.js |
| 3 validate moveId + threading | LLM-chosen verbatim, illegal-id fallback, sessionId from response | sorry-player.test.js |
| 4 random fallback / forward progress | unparseable→legal fallback, banter `''` (strict), 12× legality loop | sorry-player.test.js |
| 5 the-bully | displayName, sorry scope, non-empty fields, ≥2 voice examples | ai-registration.test.js |
| 6 the-tortoise | displayName, sorry scope, non-empty fields, ≥2 voice examples | ai-registration.test.js |
| 7 adapter registration | `llmByGameType.sorry` truthy + backgammon regression guard | ai-registration.test.js |
| 8 chooseAction tests | exact `{type:'move',payload:{moveId}}`, fallback move-id pattern | sorry-player.test.js |
| 9 personas load (Map) | `[...catalog.values()].filter`, ≥2, ids present | ai-registration.test.js |

### Rule Coverage (JS lang-review checklist)

| Rule | Test(s) | Status |
|------|---------|--------|
| #1 JSON.parse without guard / silent swallowing | fallback on unparseable output (no throw, no deadlock) | failing |
| #4 falsy-value trap (empty string) | `assert.equal(r.banter, '')` strict on fallback | failing |
| #8 test quality (no vacuous assertions) | AC 7 asserts `llmByGameType.sorry`, NOT `doesNotThrow(scheduleTurn)` | failing |
| #10 proper Error from parse | `parseLlmResponse`/`extractJson` throw on malformed/missing moveId | failing |

**Rules checked:** 4 of 13 lang-review rules are applicable to this story's surface area and have test coverage. (#3/#5/#6/#7/#11/#12 concern DOM/SQL/shell/regex/secrets not present here; #2/#9/#13 are dev-time self-checks.)
**Self-check:** 0 vacuous tests. Notably avoided the vacuous `doesNotThrow(scheduleTurn)` pattern that the pre-existing backgammon/words registration tests use (see Delivery Findings).

### Notes for Puck (Dev)
- **Do NOT copy backgammon-player.js's throw-on-bad-output behavior.** Sorry mandates a defensive in-adapter random fallback (AC 3, 4): bad JSON → catch → random legal move; valid JSON with illegal id → random legal move; banter `''` on fallback. The bot must never throw.
- `legalMoves(state)` (from `plugins/sorry/server/rules/legal-moves.js`) keys off `state.currentPlayer` and `state.drawnCard` — it takes `state` only, no `botPlayerIdx`. Move objects carry `id` but no `summary` field (unlike backgammon), so prompts.js must build its own human-readable descriptions.
- `chooseAction` must return `{ action: { type: 'move', payload: { moveId } }, banter, sessionId: r.sessionId }`.
- Persona YAML filenames must equal the `id` field (`persona-catalog.js` enforces it): `the-bully.yaml`/`the-tortoise.yaml`, both `games: [sorry]`.

**Handoff:** To Puck (Dev) for GREEN implementation.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `plugins/sorry/server/ai/prompts.js` (new) — `buildTurnPrompt` (side/card/own+opponent pawn positions/optional reaction block/legal-move descriptions keyed by id/strict JSON footer) + copied `parseLlmResponse`/`extractJson` helpers (AC 1, 2)
- `plugins/sorry/server/ai/sorry-player.js` (new) — `chooseAction` enumerates legal moves, builds the prompt, calls the LLM, validates the parsed moveId against the live legal set, and falls back to a random legal move (banter `''`) on bad JSON or an illegal id; returns `sessionId` from the LLM response; emits only `move` actions (AC 3, 4, 8)
- `data/ai-personas/the-bully.yaml` (new) — aggressive persona, `games: [sorry]`, 3 voice examples (AC 5)
- `data/ai-personas/the-tortoise.yaml` (new) — patient persona, `games: [sorry]`, 3 voice examples (AC 6)
- `src/server/ai/index.js` — import `sorryPlugin` + `sorryChoose`; add `sorry` to the `adapters` map (AC 7)

**Tests:** 23/23 E3-5 tests passing (GREEN). Full suite: 1062 pass / 0 fail / 1 skip (pre-existing) — no regressions. (Cobweb / testing-runner, RUN_ID E3-5-dev-green.)
**Branch:** `feat/E3-5-ai-adapter-prompts-personas` (pushed to origin)

**Implementation notes:**
- Followed TEA's guidance: fallback (not throw) on bad output; `legalMoves(state)` takes only `state`; built per-move human-readable descriptions in prompts.js (Sorry! moves carry no `summary` field).
- No lint script exists in the project; verification is via the test suite.

**Handoff:** To Oberon (Architect) for spec-check.

## Architect Assessment (spec-check)

**Spec Alignment:** Aligned
**Mismatches Found:** None

Structural gate (`gates/spec-check`) passed: all 9 ACs map to Dev Assessment entries, implementation marked complete, TEA + Dev deviation subsections well-formed.

Substantive trace (story context AC ↔ code):
- **AC 1** — `buildTurnPrompt` (prompts.js:57) emits side label, drawn card (`cardLabel`), own + opponent pawn positions with zone+index (`pawnLocation`), conditional reaction block (only when `userMessages.length > 0`), legal-move list keyed by id with human-readable descriptions, and a fence-free strict-JSON footer. Matches spec exactly, including "no markdown fences in the instruction block."
- **AC 2** — `extractJson`/`parseLlmResponse` (prompts.js:75-97) are verbatim copies of the backgammon helpers (header note documents the intentional copy, not import); throws on non-string `moveId`; banter defaults to `''`.
- **AC 3** — `chooseAction` (sorry-player.js:26) validates the parsed `moveId` via `moves.find`; both failure paths (parse throw → catch; illegal id → `match === null`) converge on the fallback; `sessionId: r.sessionId` preserves threading.
- **AC 4** — fallback is `moves[Math.floor(Math.random()*moves.length)]` with `banter = ''` (sorry-player.js:35-36).
- **AC 5/6** — `the-bully.yaml` / `the-tortoise.yaml` carry all required fields, `games: [sorry]`, 3 voice examples each.
- **AC 7** — `src/server/ai/index.js` imports `sorryPlugin`/`sorryChoose` and adds the `sorry` adapters entry; `llmByGameType` loop picks it up.

Note (not a mismatch): `describeMove` handles split/swap/sorry move kinds that the tests do not exercise. This is required AC 1 completeness — the live game draws every card type — not scope creep.

The fallback-instead-of-throw choice (vs the "mirror backgammon-player.js" guardrail) is correctly reconciled: story context AC 3/4 mandate the defensive fallback, which outranks the guardrail's structural "mirror" intent. Already logged by both TEA and Dev. No new deviation.

**Decision:** Proceed to review (TEA verify).

## TEA Assessment (verify)

**Phase:** finish
**Status:** GREEN confirmed (1062 pass / 0 fail / 1 skip pre-existing LIVE test)

### Simplify Report

**Teammates:** reuse, quality, efficiency
**Files Analyzed:** 6 (3 source + 3 test JS files)

| Teammate | Status | Findings |
|----------|--------|----------|
| simplify-reuse | 2 high + 2 low/med | Duplicated `mkStartPawns`/`baseState` test helpers across 3 Sorry! test files (high); fallback-vs-throw policy diff (med, intentional); adapters-map pattern (low) |
| simplify-quality | clean | No naming/dead-code/readability issues |
| simplify-efficiency | 1 medium | `index.js` dual-client setup confusing (pre-existing, out of scope) |

**Applied:** 1 high-confidence fix — extracted shared `mkStartPawns`/`baseState` into `test/_helpers/sorry-fixtures.js` (matching the existing `backgammon-fixtures.js` convention) and refactored `test/sorry/{prompts,sorry-player,legal-moves}.test.js` to import them. Verified the `backgammon-fixtures.js` pattern actually exists before applying.
**Flagged for Review:** 1 medium — `index.js` dual-client clarity (pre-existing; logged as a non-blocking Delivery Finding, deliberately not touched to keep the diff scoped to E3-5).
**Noted:** fallback-vs-throw (med) and adapters-map (low) are intentional, spec-mandated designs — dismissed. The intentional per-plugin copy of `parseLlmResponse`/`extractJson` (AC 2) was correctly respected by simplify-reuse — no cross-plugin consolidation.
**Reverted:** 0 — full suite green after the refactor (Horatio, RUN_ID E3-5-tea-verify).

**Overall:** simplify: applied 1 fix

**Quality Checks:** All passing (no lint script in project; full `npm test` suite is the gate — 1062/1062 non-skipped green).
**Handoff:** To Portia (Reviewer) for code review.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 0 smells, tests GREEN (1062/0/1) | N/A |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings |
| 6 | reviewer-type-design | Yes | findings | 3 (2 med, 1 low) | confirmed 1 (low), dismissed 1, deferred 1 |
| 7 | reviewer-security | Yes | findings | 2 (2 med) | confirmed 2 (low/med, non-blocking) |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings |
| 9 | reviewer-rule-checker | Yes | findings | 13 rules / 3 violations | confirmed 2 (low), 1 reclassified compliant |

**All received:** Yes (4 enabled returned; 5 disabled via `workflow.reviewer_subagents`)
**Total findings:** 4 confirmed (all Low / non-blocking), 2 dismissed (with rationale), 1 deferred

## Reviewer Assessment

**Verdict:** APPROVED

No Critical or High findings. Every confirmed finding is Low/Medium and non-blocking; most are faithful, spec-mandated copies of the backgammon adapter lineage, contained by the caller, or guaranteed not to occur by the orchestrator gate. Tests GREEN (1062 pass / 0 fail / 1 pre-existing skip), zero code smells.

**Data flow traced:** Untrusted LLM text → `parseLlmResponse` (JSON.parse guarded; `moveId` validated `typeof === 'string'`) → `moves.find(m => m.id === parsed.moveId)` (validated against the live legal-move set) → on any failure, `moves[random]` fallback → `{action:{type:'move',payload:{moveId}}}`. A bad/hostile LLM response cannot produce an illegal move or crash the turn — it degrades to a random legal move. Opponent chat (`userMessages`) flows only into prompt *text* sent to the LLM (no eval/SQL/HTML/shell sink).

**Wiring:** `src/server/ai/index.js` imports `sorryPlugin`/`sorryChoose` and adds `sorry` to the `adapters` map; the `llmByGameType` loop auto-creates the `sorry` client. Verified by `ai-registration.test.js` (boot → `llmByGameType.sorry` truthy) and confirmed against the existing backgammon/words/risk entries. Bot turn is reachable via the orchestrator's `adapters[gameRow.game_type]` lookup (orchestrator.js:114).

### Observations

- `[VERIFIED]` Move validation is two-layer — `parseLlmResponse` checks `typeof moveId === 'string'` (prompts.js:92) AND `chooseAction` checks membership in `legalMoves(state)` (sorry-player.js:26). An LLM-invented id (`out:99`) is rejected and falls back. Evidence: `sorry-player.test.js` "falls back when the LLM picks a moveId not in the legal set" passes.
- `[VERIFIED]` Fallback never throws and always yields a legal move under the orchestrator's non-empty-moves guarantee — `sorry-player.test.js` runs the fallback 12× and asserts legality each time. Banter is strict `''` on fallback (AC 4), evidence sorry-player.js:36.
- `[VERIFIED]` Error objects (not strings) with messages throughout prompts.js (lines 81, 90, 92). `[RULE]` rule-checker #10: compliant.
- `[VERIFIED]` No prototype-pollution surface — `parseLlmResponse` extracts only the two known keys into a fresh object; no spread/merge of LLM output into a target. `[SEC]`/`[RULE]` #3: compliant.
- `[VERIFIED]` `extractJson` regex `/```(?:json)?\s*([\s\S]*?)```/` is ReDoS-safe (lazy, single bounded group, linear on non-match). `[SEC]`/`[RULE]` #7: compliant.
- `[LOW] [RULE][TYPE]` **`sessionId ? null : persona.systemPrompt` (sorry-player.js:15)** treats a falsy empty-string `sessionId` like `null`. Confirmed it matches rule #4, but downgraded to Low: this is a **verbatim mirror of `backgammon-player.js:38`** (the "mirror backgammon-player.js exactly" guardrail), and `sessionId` is supplied by the orchestrator as either `null` (new session) or a real CLI session-id string — never `''`. Fixing only sorry would diverge from the mandated mirror; if changed, change both adapters. Non-blocking → Delivery Finding.
- `[MEDIUM→LOW] [TYPE]` **Empty `legalMoves` fallback (sorry-player.js:35)** — `moves[random]` is `undefined` if `legalMoves(state)` is empty, then `chosen.id` throws TypeError. AC 4 explicitly states this cannot occur ("`legalMoves` was non-empty before the bot was woken"), and TEA pre-logged it as a Question. Notably backgammon-player.js:12 *guards* this (by throwing) — sorry omits the guard because throwing would deadlock the solo game (contra AC 4). Recommend a defensive early guard that does not deadlock. Non-blocking → Delivery Finding.
- `[MEDIUM→LOW] [SEC]` **`parseLlmResponse` reads `parsed.moveId` outside the JSON.parse `try` (prompts.js:157)** — a valid-JSON `null`/array/scalar throws an uncaught TypeError *from* `parseLlmResponse`. Contained: the only caller (`chooseAction`) wraps it in try/catch → fallback. This is the verbatim spec-mandated copy of backgammon's helper (AC 2). Non-blocking → Delivery Finding (applies to backgammon lineage too).
- `[MEDIUM→LOW] [SEC]` **Prompt injection via `userMessages` (prompts.js:113)** — only `"` is escaped, not newlines/backticks, so a player could restructure the prompt block. Real impact is Low: it is self-affecting (a 2P game; you can only nudge your own AI opponent), 200-char capped, and a faithful copy of backgammon's `trashTalkBlock`. Matches rule #11 (partial), so confirmed not dismissed → Delivery Finding recommending a shared prompt-sanitization utility across all plugins.
- `[LOW] [RULE]` **`assert.ok(llmByGameType.sorry)` (ai-registration.test.js:81-82)** is a truthy check (rule #8). Functionally correct here (the injected stub makes the key strictly equal `llm` when registered, `undefined` when not), but `assert.strictEqual(llmByGameType.sorry, llm, ...)` would be stronger. Non-blocking → Delivery Finding.

### Rule Compliance (JS lang-review checklist)

Exhaustive enumeration via reviewer-rule-checker (13 rules, 47 instances) cross-checked against my own read:
- **#1 silent errors** — compliant. The `catch {}` in sorry-player.js:21 is a *documented, exercised* fallback (sets `parsed=null`, random-move branch is the observable consequence), not a swallow. `parseLlmResponse` re-throws as Error.
- **#2 async** — compliant. `chooseAction` awaits `llm.send`; no floating promises / async forEach.
- **#3 prototype pollution** — compliant (see observations).
- **#4 equality/coercion** — 1 instance flagged (sessionId truthy guard, line 15) → Low, mirror-mandated; all other comparisons strict.
- **#5 DOM** — N/A (server/test code).
- **#6 Node** — compliant (static import paths, no exec/env/Buffer misuse).
- **#7 regex** — compliant (ReDoS-safe).
- **#8 test quality** — 2 instances flagged (truthy `assert.ok` on llmByGameType) → Low. No `.only`/`.skip`, no vacuous `doesNotThrow` (deliberately avoided per TEA).
- **#9 module/scope** — compliant (const/let, no var, no circular deps: sorry-player→prompts→(none); index→sorry-player one-directional).
- **#10 error handling** — compliant (Error objects with messages).
- **#11 input validation** — LLM output two-layer validated; userMessages partial (newline/backtick) → Low, see prompt-injection finding.
- **#12 dependency hygiene** — compliant (no console.log, no secrets; YAML colors are UI values).
- **#13 fix-regressions** — compliant (no empty catches introduced).

### Devil's Advocate

Assume this code is broken. The most dangerous input is the LLM response, since it is the least controlled. What if the model returns `null` as valid JSON? `JSON.parse("null")` succeeds, `parsed.moveId` throws TypeError — but `chooseAction`'s catch swallows it into the random fallback, so the game survives (confirmed by the security Nerissa and by the contained-caller analysis). What if it returns `{"moveId":"out:0 "}` with control chars? The `find` simply won't match → fallback. What if the model floods banter with 10KB of text? It is passed through to SSE unbounded — but that is the pre-existing orchestrator/backgammon pathway, not introduced here, and the persona prompt caps banter at ~12 words by instruction (not enforcement). What would a malicious *human* do? Send a chat message `"\n\`\`\`json\n{\"moveId\":\"...\"}\n\`\`\`"` to inject a fake response section into the prompt — but they can only influence their own AI opponent in their own 2P game, and the move is still validated against the legal set, so the worst case is nudging the AI's banter or move within legal options. What if `legalMoves` is empty when the bot is woken? `chosen.id` throws — the one genuine crash path — but the orchestrator gate and turn engine prevent the bot from being woken with zero moves (AC 4), and no test or trace shows it occurring. What if `state.pawns[oppSide]` is undefined? `buildTurnPrompt` would throw, but `state` is always a fully-formed engine state with both sides. None of these rise to Critical/High: the validated-move + random-fallback design is genuinely robust against hostile LLM output, and the human-facing injection surface is self-contained. The empty-`legalMoves` TypeError is the only real latent crash, and it is gated out by design — recorded as a non-blocking finding.

**Handoff:** To Prospero (SM) for finish-story.

## Workflow Tracking

**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-05-28T12:17:24Z

### Phase History

| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-28T10:00:00Z | 2026-05-28T11:48:07Z | 1h 48m |
| red | 2026-05-28T11:48:07Z | 2026-05-28T11:57:46Z | 9m 39s |
| green | 2026-05-28T11:57:46Z | 2026-05-28T12:02:15Z | 4m 29s |
| spec-check | 2026-05-28T12:02:15Z | 2026-05-28T12:03:19Z | 1m 4s |
| verify | 2026-05-28T12:03:19Z | 2026-05-28T12:09:01Z | 5m 42s |
| review | 2026-05-28T12:09:01Z | 2026-05-28T12:16:15Z | 7m 14s |
| spec-reconcile | 2026-05-28T12:16:15Z | 2026-05-28T12:17:24Z | 1m 9s |
| finish | 2026-05-28T12:17:24Z | - | - |

## Delivery Findings

No upstream findings at story start.

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test verification)
- **Improvement** (non-blocking): `src/server/ai/index.js` dual-client setup (a generic `ClaudeCliClient` at line 43 for the orchestrator vs per-game-type clients at lines 54-57) is subtly confusing about which client is used where. Affects `src/server/ai/index.js` (clarify with a comment or store the orchestrator client in `llmByGameType`). Pre-existing code, NOT introduced by E3-5 (this story only added the `sorry` adapters entry) — flagged for a future cleanup, deliberately not touched here to keep the diff scoped. *Found by TEA during test verification (simplify-efficiency).*

### Dev (implementation)
- No upstream findings during implementation. All five deliverables (prompts.js, sorry-player.js, the-bully.yaml, the-tortoise.yaml, index.js registration) implemented as specified; tests, persona schema, and the adapters map all aligned with the story context as written.

### TEA (test design)
- **Improvement** (non-blocking): Pre-existing adapter-registration tests are vacuous. `test/ai-bootstrap.test.js` ("registers backgammon adapter", "registers words adapter") assert `assert.doesNotThrow(() => orchestrator.scheduleTurn(...))`, but the orchestrator does NOT throw on a missing adapter — it logs, calls `markStalled`, broadcasts `bot_stalled`, and returns (`src/server/ai/orchestrator.js:115-131`). Those assertions pass regardless of registration. Affects `test/ai-bootstrap.test.js` (rewrite to assert on `llmByGameType.<game>` or on the absence of a `bot_stalled` broadcast). Left untouched here — out of E3-5 scope. E3-5's own AC 7 test deliberately avoids the trap by asserting `llmByGameType.sorry` is truthy. *Found by TEA during test design.*
- **Question** (non-blocking): AC 4 guarantees the random fallback always finds a legal move because the orchestrator only wakes the bot when `legalMoves` is non-empty. `chooseAction`'s behavior when `legalMoves(state)` is empty is unspecified (backgammon throws). No test enforces the empty case, since it is outside the orchestrator's contract. Affects `plugins/sorry/server/ai/sorry-player.js` (Dev should decide: throw vs no-op — but it cannot occur under the live gate). *Found by TEA during test design.*

### Reviewer (code review)
- **Improvement** (non-blocking): Empty-`legalMoves` fallback would throw a TypeError (`moves[random]` → `undefined.id`). AC 4 guarantees this cannot occur via the orchestrator gate, but a one-line defensive guard would add clarity and parity with backgammon-player.js:12 (without backgammon's deadlock-causing throw). Affects `plugins/sorry/server/ai/sorry-player.js` (add an early `if (moves.length === 0)` guard). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): Prompt injection via `userMessages` — `reactionBlock` escapes only `"`, not newlines/backticks, so a player can restructure the prompt block. Self-affecting in a 2P game and a faithful copy of backgammon's `trashTalkBlock`, so low impact, but worth a shared sanitize-for-prompt helper. Affects `plugins/sorry/server/ai/prompts.js` and `plugins/backgammon/server/ai/prompts.js` (centralize newline/backtick/quote stripping). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `parseLlmResponse` reads `parsed.moveId` outside the `JSON.parse` try block; a valid-JSON `null`/array throws a TypeError rather than the clean `Error`. Contained by `chooseAction`'s catch, and a verbatim copy of the backgammon helper (AC 2). Affects `plugins/sorry/server/ai/prompts.js` (and the backgammon original) — guard `typeof parsed === 'object' && parsed !== null` after parse. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `sessionId ? null : persona.systemPrompt` (sorry-player.js:15) treats a falsy `''` sessionId like null; mirrors backgammon-player.js:38, and `sessionId` is never `''` in practice. If tightened, tighten both adapters to `sessionId != null`. Affects `plugins/sorry/server/ai/sorry-player.js`. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `assert.ok(llmByGameType.sorry)` / `.backgammon` (ai-registration.test.js:81-82) are truthy checks; `assert.strictEqual(..., llm)` would be stronger since the injected stub is shared across game types. Affects `test/sorry/ai-registration.test.js`. *Found by Reviewer during code review.*

## Design Deviations

No deviations from spec at story start.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- No deviations from spec. The story context (highest authority) reconciles the "mirror backgammon-player.js" guardrail (signature/structure) with the "defensive in-adapter fallback is mandatory" guardrail (AC 3, 4); `sorry-player.js` mirrors the signature but uses a random-legal-move fallback instead of throwing, exactly as the ACs require.

### TEA (test design)
- **Added a third test file beyond the two named in scope**
  - Spec source: context-story-E3-5.md, "Scope Boundaries → Tests"
  - Spec text: "Tests: `test/sorry/sorry-player.test.js` and `test/sorry/ai-registration.test.js`."
  - Implementation: Added `test/sorry/prompts.test.js` for AC 1 (buildTurnPrompt content) and AC 2 (parseLlmResponse/extractJson), which are prompts.js units. `sorry-player.test.js` exercises those helpers only indirectly through `chooseAction` and asserts nothing about prompt content.
  - Rationale: AC 1 ("surfaces all context the LLM needs") and AC 2 require direct, content-level assertions; folding them into sorry-player.test.js would have left them untested. prompts.js is already an in-scope deliverable.
  - Severity: minor
  - Forward impact: Dev must create `plugins/sorry/server/ai/prompts.js` (already in scope) to satisfy these tests.
- **AC 7 asserts on `llmByGameType`, not `scheduleTurn` doesNotThrow**
  - Spec source: context-story-E3-5.md, AC 7 / SM note re: existing pattern
  - Spec text: "The `llmByGameType` loop ... creates a client entry for `'sorry'` automatically."
  - Implementation: The AC 7 test asserts `bootAiSubsystem(...).llmByGameType.sorry` is truthy rather than copying the `assert.doesNotThrow(scheduleTurn)` pattern used by the backgammon/words registration tests.
  - Rationale: A missing adapter does not throw (orchestrator marks the game stalled and returns), so doesNotThrow would be a vacuous assertion. Asserting on `llmByGameType.sorry` directly tests AC 7's stated mechanism. See the matching Delivery Finding.
  - Severity: minor
  - Forward impact: none — strictly stronger coverage.
- **prompt-content assertions avoid coupling to exact wording**
  - Spec source: context-story-E3-5.md, AC 1
  - Spec text: "emits ... the drawn card, ... the full legal-move list with human-readable descriptions keyed by move id ..."
  - Implementation: Tests assert load-bearing invariants (every legal move id appears; `moveId`/`banter` appear in the JSON instruction; distinct cards yield distinct prompts; pawn track indices 47/53 appear; opponent message appears when present) rather than exact phrasing. The card requirement is enforced via a differential check (card 5 vs 8 → different prompt) instead of a brittle literal.
  - Rationale: Pins behavior without over-constraining the Dev's rendering format.
  - Severity: minor
  - Forward impact: none.

### Reviewer (audit)
- **Dev: "No deviations from spec" (fallback mirrors signature, not throw-behavior)** → ✓ ACCEPTED by Reviewer: confirmed against backgammon-player.js:38 (identical `sessionId ? null` line) and lines 12-14 (backgammon's throw guard, correctly omitted for Sorry! per AC 4's "never deadlock"). Sound.
- **TEA: "Added a third test file beyond the two named in scope" (prompts.test.js)** → ✓ ACCEPTED by Reviewer: AC 1/AC 2 are prompts.js units and need direct coverage; additive, prompts.js is in-scope. Agrees with author reasoning.
- **TEA: "AC 7 asserts on llmByGameType, not scheduleTurn doesNotThrow"** → ✓ ACCEPTED by Reviewer: independently verified the orchestrator does not throw on a missing adapter (orchestrator.js:115-131), so the chosen assertion is the correct, non-vacuous one. (Form could be `strictEqual` — see code-review Delivery Finding — but the deviation rationale is sound.)
- **TEA: "prompt-content assertions avoid coupling to exact wording"** → ✓ ACCEPTED by Reviewer: differential card-check and id-coverage are robust, non-brittle invariants. Sound.
- **No undocumented spec deviations found.** Every divergence from the literal spec (extra test file, assertion form, fallback-vs-throw) was logged by TEA/Dev and is accepted above.

### Architect (reconcile)

Verified all TEA/Dev deviation entries against the real spec sources: `sprint/context/context-story-E3-5.md` exists; the TEA "Tests:" quote matches line 32 verbatim; the AC 7 `llmByGameType` quote matches line 55 verbatim; the AC 1 prompt-content quote matches the AC 1 text. All 6 fields present and substantive in each entry. Reviewer audit stamped all entries ACCEPTED. One divergence was captured only in the Simplify Report, not as a formal deviation — adding it here for the manifest:

- **Verify-phase simplify added a shared fixture file and refactored a pre-existing sibling test, beyond the two named test files**
  - Spec source: context-story-E3-5.md, "Scope Boundaries → Tests" (line 32)
  - Spec text: "Tests: `test/sorry/sorry-player.test.js` and `test/sorry/ai-registration.test.js`."
  - Implementation: The verify phase extracted `mkStartPawns`/`baseState` into a new `test/_helpers/sorry-fixtures.js` and refactored `test/sorry/prompts.test.js`, `test/sorry/sorry-player.test.js`, AND the pre-existing `test/sorry/legal-moves.test.js` (an E3-1 deliverable) to import them — applying one high-confidence simplify-reuse finding.
  - Rationale: Consolidates triplicated test helpers, matching the established `test/_helpers/backgammon-fixtures.js` convention; sanctioned by the verify-phase simplify workflow and verified green (1062/1062 non-skipped). Touching the pre-existing `legal-moves.test.js` was necessary to avoid leaving a half-consolidated helper.
  - Severity: trivial
  - Forward impact: none — `test/_helpers/sorry-fixtures.js` is now the canonical Sorry! fixture for future E3 stories (E3-6 can reuse it).

- No additional deviations found beyond the above.

**AC deferrals:** None — all 9 ACs DONE (no ac-completion accountability table / no deferred or descoped ACs to reconcile).