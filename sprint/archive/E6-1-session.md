---
story_id: "E6-1"
jira_key: ""
epic: ""
workflow: "tdd"
---
# Story E6-1: Clue core: card model, deal, buildInitialState, cluePublicView seam

## Story Details
- **ID:** E6-1
- **Points:** 5
- **Workflow:** tdd
- **Priority:** p1
- **Implementation Plan:** docs/superpowers/plans/2026-07-01-clue-core-engine.md (Tasks 1–3 only)
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-07-01T21:10:26Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-01T20:56:24Z | - | - |
| red | - | 2026-07-01T21:01:53Z | unknown |
| green | 2026-07-01T21:01:53Z | 2026-07-01T21:05:44Z | 3m 51s |
| review | 2026-07-01T21:05:44Z | 2026-07-01T21:10:26Z | 4m 42s |
| finish | 2026-07-01T21:10:26Z | - | - |

## Technical Approach

This story implements the headless Clue deduction engine core (Tasks 1–3 of the implementation plan). The engine is pure ES-module functions under `plugins/clue/server/`, fully deterministic and testable via `node --test`.

**Architecture:**
- Seat-indexed N-player state (3–4 players), centralized in `buildInitialState`
- Card catalog: 6 suspects, 6 weapons, 9 rooms (21 total)
- Deal: one card per category into hidden envelope, remaining 18 shuffled and dealt round-robin
- State shape: seats (roster), phase (move/suggest/refute/accuse-or-pass), pawns (all 6 suspects, public), weapons (public), hands (hidden), ledgers (private per seat), envelope (hidden), suggestion tracking
- Information disclosure via `cluePublicView` seam: exposes public board state + viewer's own hand/ledger; hides envelope, other hands, other ledgers, and shownCard (visible only to suggester)

**Tech Stack:**
- Node ≥20, ESM, `.js` extensions explicit
- Tests: `node --test` with `node:test` + `node:assert/strict`
- Reuses `shuffle(arr, rng)` from `src/shared/cards/deck.js`

**Rooms modeled as abstract locations:** no grid geometry, no movement (deferred to Plan 2 E6-3). An `enterRoom` action places the seat's pawn in a location; no spatial constraints or reachability rules.

## Acceptance Criteria

### Task 1: Card Catalog & Deal
- [ ] Module `plugins/clue/server/cards.js` exports:
  - `SUSPECTS`, `WEAPONS`, `ROOMS`, `ALL_CARDS` (correct lengths: 6, 6, 9, 21)
  - `categoryOf(card)` returns `'suspect'|'weapon'|'room'|null`
  - `dealCards(rng, seatCount)` returns `{ envelope: {suspect, weapon, room}, hands: [[...], ...] }`
- [ ] All 21 cards are unique and accounted for: 1 per category in envelope, 18 dealt, 0 overlap
- [ ] Deal is fair: hand sizes differ by at most 1 (round-robin)
- [ ] Deterministic with seeded RNG (reproducible deals)
- [ ] Test file: `test/clue-cards.test.js` covers catalog + deal logic (3+ tests)

### Task 2: `buildInitialState`
- [ ] Module `plugins/clue/server/state.js` exports:
  - `buildInitialState({ participants, rng }) → state`
  - Throws on 2P or 5P+ (3–4 only)
  - Participants ordered by seat field (canonical, not array order)
  - Each seat controls distinct suspect, all 6 pawns exist off-board (room: null)
  - All 6 weapons placed in distinct rooms (random)
  - Seats, turn tracking (currentSeat, activeUserId), phase, envelope, hands consistent with deal
- [ ] Full state shape: seats, phase, currentSeat, activeUserId, envelope, hands, pawns, weapons, seatSuspect, eliminated, ledgers, suggestion, log, winnerSeat (undefined until end)
- [ ] Test file: `test/clue-state.test.js` covers initialization, seat ordering, suspect/weapon distribution, and rejects invalid player counts (6+ tests)

### Task 3: `cluePublicView` Disclosure Seam
- [ ] Module `plugins/clue/server/view.js` exports:
  - `cluePublicView({ state, viewerId }) → view`
  - Viewer sees their own seat (`youAreSeat`), hand, and ledger
  - Non-participant is spectator (`youAreSeat: null`, empty hand/ledger)
  - Public fields exposed to all: seats, phase, turn tracking, pawns, weapons, seatSuspect, eliminated, log, suggestion metadata
  - **LEAK GUARDS:** No envelope, no aggregate hands, no aggregate ledgers
  - `suggestion.shownCard` visible ONLY to the suggester (null for others)
- [ ] Test file: `test/clue-view.test.js` includes explicit leak-guard tests: no envelope/hands/ledgers keys, correct per-viewer hand/ledger, shownCard isolation (5+ tests)

## Delivery Findings

<!-- Append-only. Each agent writes under its own subheading. -->

### TEA (test design)
- **Improvement** (non-blocking): The plan's example test for Task 2 asserts only that each weapon sits in a *valid* room (`ROOMS.includes(...)`), not that the six rooms are *distinct* — it would pass even if all six weapons shared one room, which the context AC forbids ("6 weapons in distinct rooms"). Affects `test/clue-state.test.js` (added a distinctness test) and `plugins/clue/server/state.js` (impl must place weapons in 6 distinct rooms; the planned `shuffledRooms[i]` implementation already satisfies this). *Found by TEA during test design.*
- **Improvement** (non-blocking): The plan's example tests for Task 1 never assert deal reproducibility, though the context AC requires "Deterministic with seeded RNG (reproducible deals)"; a global-RNG deal would have passed them. Affects `test/clue-cards.test.js` (added a same-seed determinism test); `plugins/clue/server/cards.js` must derive all randomness from the passed `rng`. *Found by TEA during test design.*

### Dev (implementation)
- No upstream findings during implementation. The plan's Tasks 1–3 were fully specified and internally consistent; the shared `shuffle(arr, rng)` seam behaved exactly as documented (mutates in place, returns `arr`). The two TEA improvement findings above are already satisfied by the planned implementation and are closed by the passing tests — no further action needed. *Found by Dev during implementation.*

### Reviewer (code review)
- **Improvement** (non-blocking): The existing `plugins/risk/server/view.js` disclosure seam uses a *denylist* projection (`const { hands, deck, discard, ... } = state; return { ...rest }`) — any future private state field leaks by default unless someone remembers to add it to the exclusion list. The new `clue/server/view.js` uses the safer *allowlist* pattern. Affects `plugins/risk/server/view.js` (consider migrating risk to the allowlist pattern to harden it against future field additions). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): When Plan 1 Task 7 (`accuse`) lands `endedReason`/`winnerSeat`, `cluePublicView` will need to surface `endedReason` (it currently omits it; `winnerSeat` is already exposed). Affects `plugins/clue/server/view.js` (add `endedReason` to the projection in the Task 7 story, E6-2). *Found by Reviewer during code review.*

## Design Deviations

### TEA (test design)
- No deviations from spec. All of the plan's enumerated example tests for Tasks 1–3 are reproduced verbatim; four additional AC-driven cases were *added* (determinism, no-catalog-mutation, weapon-room distinctness, null-suggestion passthrough). This strictly increases AC coverage — no test was omitted, weakened, or restrategized.

### Dev (implementation)
- No deviations from spec. Implemented `plugins/clue/server/{cards,state,view}.js` exactly per the plan's Task 1–3 Step-3 code. All 18 TEA tests (14 plan cases + 4 added) pass unchanged; the planned implementation already satisfies the 4 added guards (rng-only randomness, `.slice()` copies, `shuffledRooms[i]` distinct placement, `state.suggestion` null branch), so no code beyond the plan was required.

### Reviewer (audit)
- **TEA "No deviations" (augmented tests)** → ✓ ACCEPTED by Reviewer: the 4 added cases strictly increase AC coverage (determinism, no-mutation, weapon distinctness, null-suggestion); no test was weakened or omitted. Sound.
- **Dev "No deviations" (implemented per plan)** → ✓ ACCEPTED by Reviewer: the committed code is byte-faithful to the plan's Step-3 listings; verified against the diff. No undocumented divergence.
- No undocumented deviations found. Checked the two places a silent simplification could hide: (a) deterministic `seatSuspect[i] = SUSPECTS[i]` — the context AC requires only "distinct suspect," not randomized assignment, so this is compliant, not a deviation; (b) `buildInitialState` omits `winnerSeat`/`endedReason` keys — the AC explicitly says "winnerSeat (undefined until end)," so leaving them unset is correct.

**Branch Strategy:** trunk-based (branching skipped — work happens on the default branch `main`)
**Repo:** g-1 (path .)
**Base Branch:** main

## TEA Assessment

### Red Phase (test writing)

**Tests Required:** Yes
**Reason:** 5-pt feature story (headless deduction engine core); pure functions with a security-critical information-disclosure seam — exactly the kind of code that must be pinned by tests before implementation.

**Test Files:**
- `test/clue-cards.test.js` — Task 1: catalog (6/6/9=21 distinct), `categoryOf`, deal (envelope one-per-category, 18 dealt, disjoint, round-robin fairness), **+ determinism (reproducible deals), + no-mutation of exported catalog arrays**. (5 tests)
- `test/clue-state.test.js` — Task 2: seat/turn/phase wiring, seat-field ordering, distinct suspects + 6 off-board pawns, weapons in valid rooms, **+ weapons in 6 distinct rooms**, envelope/hand consistency, 3–4 player-count guard. (7 tests)
- `test/clue-view.test.js` — Task 3: own-seat hand/ledger, spectator, structural leak guards (no `envelope`/`hands`/`ledgers`; own hand/ledger only), `shownCard`-to-suggester-only, public board exposure, **+ null-suggestion passthrough**. (6 tests)

**Tests Written:** 18 tests covering the 3 ACs (Tasks 1–3). All 14 plan-enumerated cases reproduced verbatim; 4 added for gaps in the plan's example coverage (bolded above).
**Status:** RED — verified by testing-runner (RUN_ID `E6-1-tea-red`): 0 pass / 3 fail. All three files fail at import time with `ERR_MODULE_NOT_FOUND` for the not-yet-created modules (`cards.js`, `state.js`, `view.js`) — module resolution, not test syntax. Correct TDD starting condition.

### Rule Coverage

The JS lang-review checklist (`gates/lang-review/javascript.md`) is a Dev self-review gate; most of its 13 checks target implementation code (DOM/XSS, child_process, SQL, prototype pollution, async) that is **not applicable** to this pure, side-effect-free, input-less card engine. The applicable check is #8 (test quality), which governs my own tests:

| Rule | Test(s) / Enforcement | Status |
|------|-----------------------|--------|
| #8 test-quality — no vacuous assertions | Self-check below; every test asserts a concrete value (`deepEqual`/`equal`/`throws`/`Set.size`), none use `let _ =`, `assert(true)`, or `is*` on always-true values | passing (as RED) |
| #4 equality/coercion (impl advisory) | Leak-guard test asserts `v.envelope === undefined` (strict), not truthiness | failing (RED) |
| #10 error-handling (impl advisory) | `state.js` guard asserted via `assert.throws(..., /3-4/)` — requires a real `Error` with a message | failing (RED) |

**Rules checked:** 1 of 13 lang-review checks is directly applicable to test design (#8); it is satisfied. Checks #1–#7, #9, #11–#13 are Dev-side impl concerns flagged for the GREEN self-review, N/A to these tests.
**Self-check:** 0 vacuous tests found. Every assertion pins a concrete expected value; the leak-guard test deliberately avoids an unsound substring scan (card ids double as public seatSuspect/pawn/weapon identifiers) in favor of structural key-absence + own-container checks.

**Handoff:** To Dev (Trillian) for GREEN — implement `plugins/clue/server/{cards,state,view}.js` per plan Tasks 1–3, Steps 3. Refute/actions modules (Tasks 4–8) are out of scope for E6-1.

## Dev Assessment

**Implementation Complete:** Yes

**Files Changed:**
- `plugins/clue/server/cards.js` (new) — canonical 21-card catalog (`SUSPECTS`/`WEAPONS`/`ROOMS`/`ALL_CARDS` = 6/6/9/21), `categoryOf`, `dealCards(rng, seatCount)` (one-per-category envelope + round-robin deal of the remaining 18; all randomness from the passed `rng`; catalog arrays copied with `.slice()` so they're never mutated).
- `plugins/clue/server/state.js` (new) — `buildInitialState({participants, rng})`: seat-field ordering, deal, 6 weapons placed in 6 distinct rooms (`shuffledRooms[i]`), 6 off-board pawns (`room: null`), `phase:'move'`, `activeUserId:seats[0]`, throws `Error('clue takes 3-4 players; got N')` for counts outside 3–4.
- `plugins/clue/server/view.js` (new) — `cluePublicView({state, viewerId})`: exposes public board + the viewer's OWN `hand`/`ledger`; `envelope`, aggregate `hands`, aggregate `ledgers` structurally absent; `suggestion.shownCard` visible only to the suggester; `null` suggestion passes through as `null`.

**Tests:** 18/18 clue tests passing (GREEN) — verified by testing-runner RUN_ID `E6-1-dev-green`. Full suite: **1195 pass / 0 fail**, 1 pre-existing skip (LIVE claude-CLI test, unrelated). Zero regressions.

**Scope:** Tasks 1–3 only. Tasks 4–8 (refute walk, action reducers) and Plans 2–4 (geometry, bots, client + `plugin.js` registration) are deliberately NOT implemented — no `plugin.js`, no entry in `src/plugins/index.js`; this is a tested engine library, exactly like the `risk` server modules. The game is intentionally not yet playable.

**Self-review (judgment checks):**
- *Wired up:* N/A for this slice by design — a pure engine library with no client/registration yet (Plan 4). Consumed only by its tests, matching the `risk` server-module pattern.
- *Project patterns:* Followed — flat `test/clue-*.test.js` mirroring `test/risk-*.test.js`; ESM with explicit `.js`; reuses the shared `shuffle` seam; seat-indexed N-player state consistent with the existing plugin contract.
- *ACs met:* All three ACs (Tasks 1–3) covered by passing tests, including the two under-covered ACs TEA flagged (weapon-room distinctness, deal determinism).
- *Error handling:* The one input guard the spec requires (player-count 3–4) throws a descriptive `Error`. No other user-input surface exists in this pure slice.

**JS lang-review self-check (impl):** N/A for checks #1 (no try/catch — pure functions), #3/#5/#6/#11 (no user-keyed lookups, no DOM, no Node child_process/fs, no external input beyond the validated participant list), #7 (no regex), #12 (no console.log/secrets). #4 equality: strict `===`/`!==` throughout (`c !== suspect`, `idx === -1`). #9 module-scope: `const`/`let` only, no circular deps (`state.js`→`cards.js` is acyclic), no side-effect-on-import beyond pure `const` exports. #10 error-handling: `buildInitialState` throws a real `Error` with a message.

**Branch:** trunk-based on `main` (no feature branch per repos.yaml topology); 2 commits (`test: …` RED, `feat(clue): …` GREEN) committed locally, held unpushed pending review.

**Handoff:** To Reviewer (Arthur Dent) for code review.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A — 18/18 clue + 1195/0 full suite, no lint configured, 0 smells |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — edge domain covered by Reviewer directly (seatOrder collision, dealCards(0), player-count bounds) |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — no try/catch or promises in the diff; covered directly |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings — test quality assessed directly (structural leak-guard, no vacuous assertions) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings — comments verified accurate directly |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings — type/shape assessed directly (stringly-typed card ids consistent with risk) |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings — **disclosure seam audited directly** (the security-critical file); allowlist projection, shownCard gating |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings — minimal, no over-engineering; covered directly |
| 9 | reviewer-rule-checker | No | Skipped | disabled | Disabled via settings — full JS lang-review checklist enumerated directly (see Rule Compliance) |

**All received:** Yes (1 enabled subagent returned; 8 disabled via `workflow.reviewer_subagents`, pre-filled as Skipped and covered directly by Reviewer since coverage cannot be claimed from a subagent that did not run)
**Total findings:** 0 confirmed blocking, 0 dismissed, 2 non-blocking Improvements deferred (logged in Delivery Findings)

## Rule Compliance

JS lang-review checklist (`gates/lang-review/javascript.md`), every check enumerated against the 3 impl files:

| # | Check | Applicable? | Verdict |
|---|-------|-------------|---------|
| 1 | Silent error swallowing | No try/catch, no promises in diff | ✓ pass (N/A) |
| 2 | Promise/async pitfalls | No `async`/`await`/`.then` anywhere | ✓ pass (N/A) |
| 3 | Prototype pollution | `weapons[w]`/`pawns[s]`/`hands[i%n]` keys are internal constants/integer indices, NOT user input; `indexOf(viewerId)` is a lookup, not a key-write | ✓ pass |
| 4 | Equality/coercion | Strict `===`/`!==` throughout (`c !== suspect`, `idx === -1`, `seat === bySeat`); `if (state.suggestion)` truthy is object-or-null (only null is falsy); `?? null`/`?? []` nullish | ✓ pass |
| 5 | DOM/browser security | Server-side pure functions, no DOM | ✓ pass (N/A) |
| 6 | Node.js specific | No `child_process`/`fs`/variable `require`/env leakage | ✓ pass |
| 7 | Regex safety | No `RegExp` construction in impl (the `/3-4/` is in test code, matching an error message) | ✓ pass |
| 8 | Test quality | `node:assert/strict`; no `.only`/`.skip`; no vacuous truthy; leak-guard uses structural key-absence not substring scan | ✓ pass |
| 9 | Module/scope | `const`/`let` only, no `var`; `state.js`→`cards.js` acyclic; pure `const`/function exports, no import side effects | ✓ pass |
| 10 | Error handling | `buildInitialState` throws a real `Error` with an interpolated message (not a string) | ✓ pass |
| 11 | Input validation | Player-count validated (3–4 guard); `viewerId`/`participants` are server-constructed and used structurally, no trust boundary bypassed | ✓ pass |
| 12 | Dependency/config hygiene | No `console.log`, no secrets, no dep changes | ✓ pass |
| 13 | Fix-introduced regressions | No fixes applied (first implementation) | ✓ pass (N/A) |

**All 13 checks pass** (7 directly applicable, 6 N/A for a pure server-side card engine).

## Devil's Advocate

Let me try to break this. It's a hidden-information game, so the highest-value attack is *making a player see a card they shouldn't* — the envelope, another player's hand, another player's ledger, or a `shownCard` shown to someone else. Can I? The view is built as an object literal that names only public keys; `envelope`, `hands`, and `ledgers` are never written into it, and there is no `...state` spread that could smuggle them in — so a client cannot walk from the returned view to any hidden container. Could I reach another seat's hand through `hand`? No — `hand` is `state.hands[seat]` for my *own* seat only, and the aggregate `state.hands` is not exposed, so there is no path from my hand to yours. Could a spectator (`viewerId` not in `seats`) impersonate the suggester and read `shownCard`? No — `seat` is `null` for a spectator, and `isSuggester` requires `seat !== null` *before* comparing to `bySeat`, so `null === null` can never sneak through; the spectator gets `shownCard: null`. Could I confuse it with a malformed `viewerId` — `undefined`, an object, a duplicate userId? `indexOf` returns `-1` → spectator; duplicate userIds would resolve to the first seat, but seats are server-assigned unique userIds, so that is not a reachable state. What about a *stressed* input to `buildInitialState`: zero participants → `n=0` → throws `/3-4/`; two → throws; five → throws; participants with missing `seat` fields → the index fallback could collide with an explicit `seat`, producing a scrambled roster — but the framework always supplies seats, so this is a latent robustness gap, not a live bug (logged LOW). Could `dealCards` be called with `seatCount=0` and crash on `hands[NaN].push`? Only if called directly bypassing the guard; the sole caller runs the 3–4 guard first. Could a confused *maintainer* break it later? Yes — the real fragility is downstream: the view returns shallow references to `state.pawns`/`weapons`/`log`, so a future server-side consumer that mutates the view would corrupt authoritative state. Today the view is JSON-serialized to clients (a copy), so it is harmless, and it matches the existing `risk` seam's aliasing — but it is the thing most likely to bite in Plans 2–4. None of these rise to blocking: the disclosure seam, the only truly dangerous surface, is correct and uses the safer allowlist pattern.

## Reviewer Assessment

**Verdict:** APPROVED

**Observations (9, mixed findings + verified):**
- `[VERIFIED][SEC]` Disclosure seam is airtight — `view.js:20-38` builds an allowlist object literal (explicit public keys only) and reconstructs `suggestion` field-by-field; `envelope`/`hands`/`ledgers` are structurally unreachable. Safer than `risk/server/view.js:10`'s denylist `...rest`. Verified against the plan's leak-guard test (all 4 viewer perspectives).
- `[VERIFIED][SEC]` `shownCard` gating correct — `view.js:11` `seat !== null && seat === state.suggestion.bySeat` prevents a spectator's `null` from matching a `null` `bySeat`; spectators and non-suggesters get `shownCard: null`. Tested for viewers 7/8/9/999.
- `[SEC][LOW]` Shallow projection aliases `state.pawns`/`weapons`/`log`/`hand`/`ledger` by reference (`view.js:26-35`). No info leak (aggregates unreachable); consistent with the existing `risk` seam; harmless under JSON serialization. Non-blocking — flagged for Plans 2–4 awareness.
- `[EDGE][LOW]` `state.js:6-11` `seatOrder` mixes explicit `seat` with an index fallback — mixed present/absent seats could collide. Unreachable with framework-supplied participants (always seated). Non-blocking hardening note.
- `[EDGE][LOW]` `cards.js` `dealCards(rng, 0)` would throw via `hands[NaN].push` (`i % 0 = NaN`); unreachable because `buildInitialState`'s 3–4 guard precedes the only call site. Non-blocking.
- `[VERIFIED][EDGE]` Player-count guard — `state.js:14` `n < 3 || n > 4` throws `/3-4/` for 0/2/5; tested.
- `[VERIFIED][TEST]` Leak-guard test (`test/clue-view.test.js`) correctly uses structural key-absence + own-container equality rather than an unsound substring scan (card ids double as public `seatSuspect`/`pawn`/`weapon` identifiers). Strong, non-vacuous assertions across all files.
- `[VERIFIED][TYPE]` Card ids are lowercase strings (no newtype) — consistent with the `risk` module convention and the plan's stated contract; acceptable for this domain. `[SILENT]` No swallowed errors — no try/catch or promises exist to swallow. `[DOC]` The `view.js` header comment and the "intentionally NOT copied out" note accurately describe the code.
- `[SIMPLE][VERIFIED]` Minimal and on-spec — `[RULE]` all 13 JS lang-review checks pass (see Rule Compliance); no over-engineering, dead code, or scope creep (no `plugin.js`/registration, matching the `risk` server-library pattern; game intentionally inert).

**Data flow traced:** hidden `envelope`/other-seat `hands` → `cluePublicView({state, viewerId})` → returned view. Safe because the view is an allowlist literal that never includes any hidden container and exposes only the viewer's own `hand`/`ledger` (by own-seat index); the only conditional secret, `suggestion.shownCard`, is gated to `bySeat`. Verified: no reachable reference path from the returned object to another seat's private data or the envelope.

**Pattern observed:** allowlist disclosure projection at `plugins/clue/server/view.js:20-38` — a security-positive divergence from the `risk` denylist seam.

**Error handling:** the sole required guard (player count) throws a descriptive `Error` at `plugins/clue/server/state.js:14`; no other untrusted-input surface exists in this pure slice.

**Preflight:** GREEN — 18/18 clue tests, full suite 1195 pass / 0 fail / 1 pre-existing unrelated skip; no lint configured; 0 code smells.

**Handoff:** To SM (Slartibartfast) for finish-story.