---
story_id: "E6-4"
jira_key: ""
epic: "E6"
workflow: "tdd"
---
# Story E6-4: Clue bots: knowledge tracker + capped shortlist + persona pick + 6 personas + auto-refute

## Story Details
- **ID:** E6-4
- **Jira Key:** (none — kanban project, no Jira integration)
- **Workflow:** tdd (phased)
- **Stack Parent:** none
- **Points:** 8
- **Priority:** p2
- **Depends On:** E6-1, E6-2, E6-3 (all completed and archived)

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-07-02T07:01:21Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-02T06:25:08Z | 2026-07-02T06:26:35Z | 1m 27s |
| red | 2026-07-02T06:26:35Z | 2026-07-02T06:44:17Z | 17m 42s |
| green | 2026-07-02T06:44:17Z | 2026-07-02T06:55:57Z | 11m 40s |
| review | 2026-07-02T06:55:57Z | 2026-07-02T07:01:21Z | 5m 24s |
| finish | 2026-07-02T07:01:21Z | - | - |

## Implementation Context
- **Plan Document:** docs/superpowers/plans/2026-07-02-clue-bots.md (Plan 3 of 4, just committed a9b63a4)
- **Design Spec:** docs/superpowers/specs/2026-07-01-clue-clone-design.md
- **Prior Sessions:** sprint/archive/E6-2-session.md, sprint/archive/E6-3-session.md
- **Branch Strategy:** trunk-based (no feature branches — work happens on main branch per g-1 repo configuration)

## Acceptance Criteria
- Knowledge tracker propagates own-hand + shown cards + public refute log to fixpoint and never marks a false certainty; reaches solved state on any fully-determined transcript.
- chooseAction returns {action,banter,sessionId} with action in the shortlist (InvalidLlmMove on bad id); accuse offered only when solved; bots auto-refute instantly with a least-information-leak card.
- Six games:[clue] suspect personas load in the catalog (id/displayName/color/glyph/systemPrompt), enabling AI opponents.

## Sm Assessment

**Readiness:** Ready for RED phase. All dependencies (E6-1, E6-2, E6-3) are done and archived; no blocking PRs; working tree was clean at setup. Merge gate clear.

**Plan gating resolved:** The story required Plan 3 to be written by PM before pickup. PM produced `docs/superpowers/plans/2026-07-02-clue-bots.md` (Plan 3 of 4, 8 tasks, test-first with file paths), committed to main as a9b63a4. All Plan-3-tagged Delivery Findings from E6-2/E6-3 are dispositioned in the plan's F1–F10 table — TEA should read that table before writing tests.

**Coordination flags for downstream agents:**
- **F8(b) from the plan (blocking for Plan 4, not this story):** `pendingRoll` semantics are inverted between backgammon ("awaiting client value") and shipped Clue ("known die value, awaiting move"). Plan 3 delivers a values-less roll-intent contract; the orchestrator's raw `if (state.pendingRoll) return` gate must NOT be reused for Clue in Plan 4 wiring. E6-5 must inherit this flag.
- **F7 (inherited from E6-3 Reviewer):** die clamp 1–6 at the `legalMoves` walk boundary lands in Task 7, since shortlist.js becomes the first non-reducer caller.
- Dice-are-client-side doctrine holds: the bot never materialises a die value (roll is an intent, not a chooseAction decision).

**Routing:** Workflow tdd (phased) → RED phase, agent tea. Jira explicitly skipped (kanban project, no Jira integration — same as E6-3).

## TEA Assessment

**Tests Required:** Yes
**Reason:** 8-point TDD story; full failing suite written for all three ACs plus doctrine pins.

**Test Files:**
- `test/_helpers/clue-fixtures.js` — shared determined deal (envelope scarlett/rope/study, consistent 6/6/6 split), miniGeo, sub-state builders, poison() corrupter
- `test/clue-knowledge.test.js` — tracker: solves determined transcript; no false certainty on partial info; poison invariance (never reads envelope/other hands); no-refute→envelope pin; clause resolution; hand saturation (3-seat, load-bearing); 4-seat 5/5/4/4 hand-size split guard; unseen* query API
- `test/clue-refute-choice.test.js` — chooseRefuteCard: held+named hard contract, deterministic over 20 calls, named defaults to state.suggestion, explicit override, own-hand-only
- `test/clue-shortlist.test.js` — all 7 sub-state fixtures: bounded/unique/never-empty; never emits enterRoom (F7); every entry validates through the REAL reducers (roll exempt by doctrine); values-less roll intent; secret-passage gating; accuse gated strictly on solved tracker with payload === tracker solution; movement ≤ MOVE_CAP and reachable-only; blocked-in fallback; poison invariance
- `test/clue-ai-player.test.js` — chooseAction contract: pick-by-id + banter + sessionId; InvalidLlmMove/InvalidLlmResponse (instances + names); resume-aware systemPrompt (persona first call, null on resume); auto-refute usedLlm:false with zero llm calls, deterministic; never a valued roll; zero-legal-moves never deadlocks (F3); buildTurnPrompt lists ids/own hand/JSON footer + poison invariance; parseLlmResponse fenced/bare/coercion/throws; greppable pins: no `state.envelope` read and no `Math.random` in any clue AI module or refute.js
- `test/clue-personas.test.js` — six games:[clue] personas: canonical colours (plan table), JSON-contract + keep-secrets systemPrompts, unique colours/glyphs, existing catalog unperturbed (≥20 total)
- `test/clue-bot-integration.test.js` — solve→accuse wins via real doAccuse/endWith (winnerSeat/endedReason, no `summary` reliance, F1); bluff suggest legal; async-pause human refuter holds activeUserId then hands back; bot refuter resumes suggester with no LLM call; fresh-deal smoke incl. reducer REJECTING the values-less roll (F8 contract pin)
- `test/clue-movement.test.js` (extended) — die clamp: 7≡6, 3.9≡3, sub-1/negative → empty
- `test/no-server-dice-rng.test.js` (extended) — clue-player.js/shortlist.js exist and carry no die-materialisation formula

**Tests Written:** 40 new tests (plus 1 fixture module) covering 3 ACs
**Status:** RED (verified by testing-runner: all new suites fail for the intended reasons — module-not-found / missing export / missing personas / missing clamp; zero pre-existing regressions across the 50+ E6-1..E6-3 tests; no unexpected passes)

### Rule Coverage

| Rule (javascript.md) | Test(s) | Status |
|------|---------|--------|
| #1 silent errors | `parseLlmResponse throws on garbage and on a missing moveId` (errors propagate, never swallowed) | failing (RED) |
| #2 async pitfalls | `assert.rejects` on InvalidLlmMove/InvalidLlmResponse; `auto-refute ... NO llm call` (no floating promise) | failing (RED) |
| #3 prototype/object safety | poison fixtures + pre-existing `secretPassageDest __proto__` pins remain green | mixed (new RED / pins green) |
| #4 equality & coercion | die clamp sub-1/fractional/negative cases pin explicit numeric handling of pendingRoll | failing (RED) |
| #8 test quality | Phase C self-check: removed 1 vacuous test (bare notEqual on a null-either-way read); no .only/.skip; no truthy-only asserts | done |
| #10 error handling | `e instanceof InvalidLlmMove && e.name === 'InvalidLlmMove'` (Error subclass + name) | failing (RED) |
| #11 input validation | `every emitted action validates through the real reducers`; engine rejects value-less roll | failing (RED) |
| determinism (project doctrine) | greppable `Math.random` ban in AI modules + refute.js; 20-call determinism loop | failing (RED) |
| never-cheats (project doctrine) | greppable `state.envelope` ban + behavioral poison invariance at tracker/shortlist/prompt layers | failing (RED) |

**Rules checked:** 7 of 13 lang-review rules applicable to test design have coverage; #5 DOM, #6 Node security, #7 regex, #9 modules, #12 deps are Dev-side checks with no new test surface.
**Self-check:** 1 vacuous test found and removed (single no-refute exclusion — unobservable without a downstream pin; replaced by load-bearing unanimous-no-refute and saturation tests).

**Handoff:** To Dev (Trillian) for implementation. Read the plan's F1–F10 table plus the three TEA findings above before Task 1; the refute module path differs from the plan.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `plugins/clue/server/ai/knowledge.js` (new) — `buildTracker`: card×location possibility matrix seeded from own hand (exhaustive), own ledger, and public-log episodes (no-refute exclusions, refute clauses); fixpoint propagation (pin / hand saturation with per-seat 18-round-robin sizes / envelope-per-category structure / clause resolution); query API (`holderOf`, `isEnvelope`, `envelopeCandidates`, `envelopeSolution`, `unseen*`). Exclusions never empty a set, so unsound inputs cannot manufacture certainty.
- `plugins/clue/server/ai/shortlist.js` (new) — `buildClueShortlist`: sub-state dispatch (top-of-turn / movement / suggest / accuse-or-pass), caps `SHORTLIST_CAP=6`/`MOVE_CAP=4`/`SUGGEST_CAP=4`, `DIFFICULTY='solved'` accuse gating with a threaded `difficulty` param, chase-ranked movement, info-max/chase/bluff/safe probes with combo dedup, values-less `roll` intent, pass fallbacks — never empty, never `enterRoom`.
- `plugins/clue/server/ai/prompts.js` (new) — `buildTurnPrompt` (own hand + tracker deduction block + public log tail + options + JSON footer, own-info-only by construction) and `parseLlmResponse` (fenced/bare JSON extraction, strict string `moveId`, banter coercion).
- `plugins/clue/server/ai/clue-player.js` (new) — `chooseAction`: refute short-circuit (`usedLlm:false`, zero LLM calls), resume-aware `systemPrompt`, single-option lenient path, `InvalidLlmResponse`/`InvalidLlmMove` re-exported (backgammon precedent).
- `plugins/clue/server/refute.js` (extended) — `chooseRefuteCard`: held+named hard contract, deterministic least-leak (suggester-prior-named preference, catalog-order tie-break), no new state fields (F6).
- `plugins/clue/server/rules/movement.js` (extended) — die clamped `min(6, max(1, floor))` at the walk boundary; `<1`/falsy → no moves (F8a fixed).
- `data/ai-personas/{miss-scarlett,colonel-mustard,mrs-white,mr-green,mrs-peacock,professor-plum}.yaml` (new) — `games:[clue]`, canonical pawn colours, unique glyphs, distinct voices, strict-JSON + keep-secrets systemPrompts.

**Tests:** 172/172 passing (GREEN) — all 40 new E6-4 tests plus every pre-existing E6-1..E6-3 test (verified by testing-runner, RUN_ID E6-4-dev-green). Persona/AI regression sweep: 45/45 across ai-persona-catalog, ai-personas-route, ai-bootstrap, orchestrator pending-roll, risk/cribbage client-ctx, cribbage routes, ai-words (RUN_ID E6-4-dev-persona-regression).
**Branch:** main (trunk-based per repos.yaml), pushed — commit `aadc62a`. Sprint context files left for SM's finish commit per E6-3 precedent.

**Self-review:** No console.log/debug code in new modules; no `Math.random` and no `state.envelope` reads on the AI path (test-pinned); library-only scope per Plan 3 (no plugin.js / registration / orchestrator wiring — Plan 4); all three ACs covered by passing tests.

**Handoff:** To next phase (verify — Deep Thought runs simplify + quality-pass).

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (172/172 tests, 0 smells, no lint configured, tree clean bar sprint-context) | N/A |
| 2 | reviewer-edge-hunter | Yes | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [EDGE] items) |
| 3 | reviewer-silent-failure-hunter | Yes | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [SILENT] items) |
| 4 | reviewer-test-analyzer | Yes | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [TEST] items) |
| 5 | reviewer-comment-analyzer | Yes | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [DOC] items) |
| 6 | reviewer-type-design | Yes | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [TYPE] items) |
| 7 | reviewer-security | Yes | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [SEC] items) |
| 8 | reviewer-simplifier | Yes | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [SIMPLE] items) |
| 9 | reviewer-rule-checker | Yes | Skipped | disabled | Disabled via settings — Reviewer ran the 13-check enumeration personally (see Rule Compliance) |

**All received:** Yes (preflight returned clean; 8 specialists disabled via workflow.reviewer_subagents, their domains assessed directly by Reviewer)
**Total findings:** 4 confirmed (all LOW, non-blocking), 0 dismissed, 0 deferred

### Rule Compliance

Rubric: `.pennyfarthing/gates/lang-review/javascript.md` (no `.claude/rules/` or SOUL.md in this repo). Enumerated against every changed `.js` file (4 new AI modules, refute.js, movement.js, 8 test files, 1 fixture helper).

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | Silent errors | PASS (1 deliberate) | Only swallow: single-option banter parse `clue-player.js:44-45` — documented forced-move fallback (sorry precedent); cannot alter the chosen action. Decision path rethrows typed errors (`:49`, `:52`). `JSON.parse` wrapped (`prompts.js:66-67`). |
| 2 | Promise/async | PASS | `llm.send` awaited (`clue-player.js:32`); no async forEach; no floating promises; `assert.rejects` used in tests. |
| 3 | Prototype/object safety | PASS | LLM id matched via `Array.find` (`clue-player.js:51`), never object indexing; tracker matrix is a `Map` keyed by catalog cards (`knowledge.js:25-27`); `exclude` guards set existence; `secretPassageDest` own-property pin pre-existing and re-tested with `__proto__`. |
| 4 | Equality/coercion | PASS | `===` throughout; `== null` used only as the intentional null/undefined idiom matching the shipped engine (`pendingRoll == null`); sub-1/fractional/NaN pendingRoll pinned by die-clamp tests. |
| 5 | DOM/browser | N/A | Server-only diff. |
| 6 | Node security | PASS | No child_process, no variable require, no env access, no Buffer misuse in diff. |
| 7 | Regex safety | PASS | One new regex (`prompts.js:59` fence extractor): fixed fences, single lazy quantifier, no user input in `new RegExp`, no backtracking blowup shape. |
| 8 | Test quality | PASS | 0 `.only`/`.skip` (preflight); TEA removed 1 vacuous test in Phase C; determinism pinned by 20-call loop; poison tests assert full structural equality, not truthiness. |
| 9 | Module/scope | PASS | `const`/`let` only; ESM with explicit `.js` extensions; import graph acyclic (player → {refute, knowledge, shortlist, prompts, geometry, errors}). |
| 10 | Error handling | PASS | `InvalidLlmResponse`/`InvalidLlmMove` are Error subclasses with `name` + contextual message (`src/server/ai/errors.js`), re-exported per backgammon precedent; no string throws. |
| 11 | Input validation | PASS | LLM output type-checked (`moveId` must be string, `prompts.js:70`), whitelist-matched against the server-built shortlist, and every emitted action re-validated by the reducers (test: "every emitted action validates through the real reducers"). |
| 12 | Dependency/config | PASS | Zero new dependencies; 0 console.log in production diff (preflight); no secrets. |
| 13 | Fix-regressions | PASS | The die-clamp fix re-scanned against #1–#12: adds a guard + clamp, no new error paths. |

## Devil's Advocate

Assume this bot is broken and I merely haven't found where. The scariest surface is the knowledge tracker: one unsound inference and the bot accuses wrongly, eliminates itself, and — worse — does it deterministically in every game with the same shape. So I attacked the inference rules individually. Saturation with the wrong hand size was my best candidate (a flat `floor(18/n)` silently over-excludes for the two remainder seats in 4P), but the implementation derives per-seat sizes (`knowledge.js:13-15`) and the 4-seat test was built specifically so a flat-floor tracker pins BOTH remaining suspects to the envelope and fails. Category elimination could over-claim if "exactly one candidate" were unsound — but the envelope must contain one card per category, so five exclusions do prove the sixth. Clause resolution could resurrect an excluded location via `pin` — but `pin` refuses a location already excluded. The exclusion guard (never empty a set) means even contradictory poisoned inputs degrade toward *ignorance*, not false certainty. What about the LLM as attacker? It can emit an id for a shortlist entry that is legal but self-destructive — an accusation. Can an unsolved bot be offered `accuse`? Only through `accuseEntry`, which requires `envelopeSolution() != null`, which requires all three categories pinned by sound inference over own-info — and the accusation payload is the tracker's solution, not LLM text. A malicious LLM can therefore at worst pick the *least good* legal option, which is exactly the designed failure mode ("imperfection is a property of the menu"). Remaining genuine weaknesses I could not convert into failures: the refute-phase fall-through for a non-active bot (unreachable under the orchestrator gate, flagged for Plan 4), banter leaking the SOLVED line if a persona ignores its STRICT rule (cosmetic in a fan-project game, and prompt-mitigated), and prompt history truncation at 8 entries (flavor only — the tracker, not the prompt, carries the deduction). None of these breaks correctness of the shipped scope.

## Reviewer Assessment

**Verdict:** APPROVED

**Data flow traced:** LLM response text → `parseLlmResponse` (fence/brace extraction → `JSON.parse` in try/catch → `moveId` type-check) → whitelist match against server-built shortlist ids (`clue-player.js:51`) → `match.action` whose payload was constructed exclusively from validated catalogs, `legalMoves` output, or the tracker's solution — never from LLM text → `applyClueAction` reducers re-validate turn, phase, reachability, card identity. Safe because the LLM selects; it never constructs.

**Pattern observed:** The words/backgammon `chooseAction` contract is mirrored faithfully — resume-aware systemPrompt (`clue-player.js:32-36`, backgammon-player.js precedent line-for-line), `{id, slot, action, summary}` shortlist shape (words), `usedLlm:false` no-decision short-circuit (sorry/cribbage). Cross-plugin consistency is what makes Plan 4's adapter wiring mechanical.

**Error handling:** Typed errors on both LLM failure modes (`InvalidLlmResponse` `clue-player.js:49`, `InvalidLlmMove` `:52`); the single swallowed parse error (`:44-45`) is scoped to banter on a forced move and cannot affect the action; `chooseRefuteCard` returns null only on a contract violation the reducers would reject anyway; the die clamp closes the last unvalidated numeric path into the walk.

**Observations (tagged):**
1. `[VERIFIED]` `[SEC]` Prompt-injection surface closed — evidence: `clue-player.js:50-53` (selection by id only), `shortlist.js` payloads built from `SUSPECTS`/`WEAPONS`/`legalMoves`/`tracker.envelopeSolution()` only. Complies with javascript.md #11.
2. `[VERIFIED]` `[EDGE]` Die clamp handles over-range/fractional/sub-1/NaN/string garbage — evidence: `movement.js:26-29`; NaN/string floor to NaN which satisfies no walk predicate and terminates empty; pinned by 4 new movement tests.
3. `[VERIFIED]` `[TYPE]` Tracker never guesses: `located()` requires a singleton set (`knowledge.js:113-116`), `envelopeSolution()` requires all three categories pinned (`:127-131`), per-seat hand sizes derived (`:13-15`). Complies with the never-misdeduce AC; no project rule contradicted.
4. `[VERIFIED]` `[TEST]` The never-cheats guarantee is behavioral (poison-invariance at tracker/shortlist/prompt layers) plus greppable (`state.envelope` and `Math.random` bans) — stronger than either alone.
5. `[VERIFIED]` `[DOC]` Comments state constraints truthfully (clamp cites the E6-3 finding; `chooseRefuteCard` documents the F6 best-effort limit; no stale claims found).
6. `[EDGE]` `[LOW]` Non-refuter bot driven during refute phase would fall through to a `pass` the reducer rejects — unreachable under the orchestrator's `activeUserId===bot` gate; recorded as a delivery finding so Plan 4 wiring asserts it.
7. `[SIMPLE]` `[LOW]` `accuseEntry`'s first null-check is redundant with the second (`shortlist.js:27-29`); the threaded `difficulty` lever currently has no observable effect (F10 scaffolding). Harmless; not worth a rework cycle.
8. `[SEC]` `[LOW]` The SOLVED line in the prompt relies on the personas' STRICT keep-secrets rule to stay out of banter — acceptable for a personal fan-project game; noted for Plan 4 if banter ever renders to spectators.
9. `[SILENT]` `[LOW]` `chooseRefuteCard` returns `null` on zero matches rather than throwing; the reducer downstream rejects the malformed refute loudly, so nothing is silently lost — verified acceptable.
10. `[RULE]` 13/13 javascript.md checks enumerated above — no violations; `[TEST]` residual gaps are the two soft-pins TEA logged as deviations (chase/bluff slot composition, single-option accounting), both accepted below.

**Handoff:** To Slartibartfast (SM) for finish-story.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)

- **Conflict** (non-blocking): Plan 3's file map targets `plugins/clue/server/rules/refute.js`, but the shipped module is `plugins/clue/server/refute.js` (`rules/` holds only `movement.js`). Tests import the real path. Affects `plugins/clue/server/refute.js` (Dev adds `chooseRefuteCard` to the existing module; do NOT create a `rules/refute.js` duplicate). *Found by TEA during test design.*
- **Improvement** (non-blocking): The plan's die-clamp fixture (`pendingRoll: 100`) would HANG the red suite — an unclamped self-avoiding walk of depth 100 on the mini board explodes combinatorially. Tests use `pendingRoll: 7` and `3.9`, which prove the same clamp and fail fast. Affects `docs/superpowers/plans/2026-07-02-clue-bots.md` (Task 7 sketch; no code change needed — noted so Dev doesn't "restore" the 100 fixture). *Found by TEA during test design.*
- **Improvement** (non-blocking): The values-less roll intent is deliberately NOT engine-applicable (`doRoll` demands an integer 1–6). The integration suite pins this rejection so nobody "fixes" it by materialising a server-side die; the orchestrator must treat a bot roll intent as a client-dice pause, per F8(b). Affects `src/server/ai/orchestrator.js` (Plan 4 wiring only). *Found by TEA during test design.*

### Dev (implementation)

- **Improvement** (non-blocking): Colonel Mustard's canonical colour `#d4a017` is identical to the shipped risk persona Colonel Jaune's. Harmless while personas are game-scoped, but any future cross-game persona picker will render two same-yellow colonels. Affects `data/ai-personas/colonel-mustard.yaml` or the picker UI (disambiguate if a mixed-game roster ever ships). *Found by Dev during implementation.*
- **Improvement** (non-blocking): The tracker ignores `accuse` log entries — a wrong public accusation excludes that exact trio, which is sound extra evidence the bot currently leaves unused. Affects `plugins/clue/server/ai/knowledge.js` (optional future inference; all "never misdeduce" tests stay valid). *Found by Dev during implementation.*

### Reviewer (code review)

- **Gap** (non-blocking): `chooseAction` driven for a bot in `phase==='refute'` that is NOT the active refuter falls through to the pass fallback, and that pass is rejected by the reducer — unreachable while the orchestrator gates on `activeUserId===bot`, but Plan 4's clue wiring should assert that gate rather than assume it. Affects `src/server/ai/orchestrator.js` (E6-5: drive clue bots strictly off `activeUserId`, per the existing turn-continuation contract). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): The `difficulty` parameter threaded through `buildClueShortlist` has no observable effect yet and `accuseEntry` carries a redundant null-check — fine as F10 scaffolding, but E6-5+ should either wire a second difficulty value or collapse the dead branch. Affects `plugins/clue/server/ai/shortlist.js:27-29`. *Found by Reviewer during code review.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Refute tests import `refute.js`, not the plan's `rules/refute.js`**
  - Spec source: docs/superpowers/plans/2026-07-02-clue-bots.md, Task 2 file map
  - Spec text: "Modify: `plugins/clue/server/rules/refute.js` (add `chooseRefuteCard`...)"
  - Implementation: `test/clue-refute-choice.test.js` imports from `plugins/clue/server/refute.js`
  - Rationale: that is where the shipped `findRefuterWalk` actually lives; the plan's path does not exist
  - Severity: minor
  - Forward impact: Dev extends the existing module; matching Delivery Finding logged
- **Die-clamp tests use pendingRoll 7 / 3.9 instead of the plan's 100**
  - Spec source: docs/superpowers/plans/2026-07-02-clue-bots.md, Task 7 Step 1
  - Spec text: "a `pendingRoll` of `100` yields the same reachable set as `pendingRoll: 6`"
  - Implementation: clamp equivalence pinned as 7≡6 and 3.9≡3, plus sub-1/negative → no moves
  - Rationale: pre-clamp, a depth-100 self-avoiding walk hangs the suite; 7 proves the clamp and fails fast in RED
  - Severity: minor
  - Forward impact: none (clamp contract identical)
- **Least-leak refute policy #1 (re-show preference) not pinned**
  - Spec source: docs/superpowers/plans/2026-07-02-clue-bots.md, Task 2 + finding F6
  - Spec text: "Prefer a card the refuter has already shown this suggester before"
  - Implementation: tests pin only held + named + deterministic + own-info-only invariants
  - Rationale: the public refute log omits the shown card by design (E6-1 privacy); the plan's own F6 note forbids inventing a show-history state field in Plan 3
  - Severity: minor
  - Forward impact: if Plan 4 adds refuter-side show history (F6), add the preference test then
- **Suggest-slot semantics pinned selectively (info-max hard, others soft)**
  - Spec source: docs/superpowers/plans/2026-07-02-clue-bots.md, Task 3 sub-state table
  - Spec text: "info-max ..., chase ..., bluff ..., safe (low-info)"
  - Implementation: tests hard-pin the info-max slot (unseen suspect + unseen weapon), ≥2 distinct slot kinds, caps, in-room legality, reducer-validity of every probe; chase/bluff/safe presence is not individually mandated
  - Rationale: ranking internals are a difficulty knob the plan expects to tune; over-pinning slot composition would make legitimate cap/rank tuning break tests without catching bugs
  - Severity: minor
  - Forward impact: none (menu quality remains covered by diversity + legality + cap pins)

### Dev (implementation)
- **`chooseRefuteCard` implemented in `refute.js`, not the plan's `rules/refute.js`**
  - Spec source: docs/superpowers/plans/2026-07-02-clue-bots.md, Task 2 file map
  - Spec text: "Modify: `plugins/clue/server/rules/refute.js`"
  - Implementation: extended the existing `plugins/clue/server/refute.js` beside `findRefuterWalk`
  - Rationale: that is where the shipped refute module lives (TEA finding); creating the plan's path would duplicate the module
  - Severity: minor
  - Forward impact: none (tests and imports all use the real path)
- **Single-option short-circuit is a menu-of-one call with lenient parse, not a banter-only prompt**
  - Spec source: docs/superpowers/plans/2026-07-02-clue-bots.md, Task 5 control flow step 4
  - Spec text: "Spend a banter-only call (no move menu) so the bot still chirps"
  - Implementation: the normal turn prompt is sent (menu of one); on parse/id failure the forced entry is played with empty banter instead of throwing
  - Rationale: no second prompt builder needed; the LLM call still happens so resume-slot accounting is unchanged, and a flubbed response can never derail a forced move (sorry precedent)
  - Severity: minor
  - Forward impact: none (contract surface identical to callers)
- **Least-leak policy #1 (re-show preference) not implemented**
  - Spec source: docs/superpowers/plans/2026-07-02-clue-bots.md, Task 2 least-leak policy
  - Spec text: "Prefer a card the refuter has already shown this suggester before"
  - Implementation: policy #2 only — prefer a card the suggester already named in their own prior suggestions, then fixed catalog-order tie-break
  - Rationale: the public log omits shown cards by design and no refuter-side show history exists (plan's own F6 forbids inventing the state field in Plan 3)
  - Severity: minor
  - Forward impact: if Plan 4 adds show history (F6), upgrade the ranking and add the pinning test

### Reviewer (audit)

- **TEA: refute tests import `refute.js`, not the plan's `rules/refute.js`** → ✓ ACCEPTED by Reviewer: tests must target the shipped module; the plan's path never existed.
- **TEA: die-clamp tests use pendingRoll 7 / 3.9 instead of the plan's 100** → ✓ ACCEPTED by Reviewer: an unclamped depth-100 self-avoiding walk hangs the RED suite; 7≡6 and 3.9≡3 prove the identical clamp contract and fail fast.
- **TEA: least-leak policy #1 (re-show preference) not pinned** → ✓ ACCEPTED by Reviewer: the plan's own F6 note forbids inventing the show-history field; held+named+deterministic is the correct hard contract.
- **TEA: suggest-slot semantics pinned selectively** → ✓ ACCEPTED by Reviewer: hard-pinning all four slot compositions would break on legitimate cap/ranking tuning without catching bugs; legality + diversity + caps are the durable invariants.
- **Dev: `chooseRefuteCard` implemented in `refute.js`, not `rules/refute.js`** → ✓ ACCEPTED by Reviewer: agrees with author reasoning; matches the TEA finding and avoids a duplicate module.
- **Dev: single-option short-circuit is a menu-of-one call with lenient parse** → ✓ ACCEPTED by Reviewer: strictly safer than the spec sketch (a forced move can never throw), same external contract, no extra prompt builder; resume-slot accounting unchanged because the call is still made.
- **Dev: least-leak policy #1 not implemented** → ✓ ACCEPTED by Reviewer: mirrors the accepted TEA deviation; policy #2 (suggester-prior-named) plus catalog tie-break is deterministic and conservative.
- **Undocumented (Reviewer-spotted): movement corridor squares are offered in walk-enumeration order, not the plan's "corridor square toward interest" ranking.** Spec: plan Task 3 sub-state table. Code: `shortlist.js` movement branch takes `squares` as enumerated. Severity: Low. Not logged by TEA/Dev. Disposition: accepted as-is — interest-ranking of corridor squares is menu-quality tuning inside the same caps; flagged so E6-5 tuning knows it is not yet implemented.