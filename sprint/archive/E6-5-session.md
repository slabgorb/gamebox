---
story_id: "E6-5"
jira_key: ""
epic: "E6"
workflow: "tdd"
---
# Story E6-5: Clue client + plugin.js manifest + registration + end-to-end wiring

## Story Details
- **ID:** E6-5
- **Jira Key:** (Jira skipped — kanban project)
- **Workflow:** tdd
- **Stack Parent:** none (all dependencies E6-1..E6-4 completed and archived)

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-07-02T08:35:56Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-02T07:46:42Z | 2026-07-02T08:01:11Z | 14m 29s |
| red | 2026-07-02T08:01:11Z | 2026-07-02T08:18:02Z | 16m 51s |
| green | 2026-07-02T08:18:02Z | 2026-07-02T08:29:26Z | 11m 24s |
| review | 2026-07-02T08:29:26Z | 2026-07-02T08:35:56Z | 6m 30s |
| finish | 2026-07-02T08:35:56Z | - | - |

## Branch Strategy
**Branch Strategy:** trunk-based (branching skipped — work happens on the default branch)

## Sm Assessment

**Setup complete; ready for RED.** Session file and story context (`sprint/context/context-story-E6-5.md`) created by sm-setup. Jira explicitly skipped (kanban project, no Jira integration — same precedent as E6-3/E6-4). Repo g-1 is trunk-based, so no feature branch; work proceeds on main. Merge gate clear (no open PRs), working tree was clean at setup, all dependencies E6-1..E6-4 done and archived.

**Plan gating resolved:** The story required Plan 4 to be written by PM before pickup. PM produced `docs/superpowers/plans/2026-07-02-clue-client.md` (Plan 4 of 4, 7 test-first tasks with file paths), committed to main as `4e5cd0b`. Both inherited E6-4 findings are dispositioned in the plan: F8(b) (blocking — orchestrator `pendingRoll` gate must not be reused for Clue) is fixed in Task 4 via an adapter-aware pause predicate + roll-intent intercept; Finding #6 (non-refuter bot fall-through) is pinned via the `activeUserId===bot` gate assertion. TEA must read the plan's findings-disposition table before writing tests.

**Routing:** Workflow tdd (phased) → RED phase, agent tea.

## TEA Assessment

**Tests Required:** Yes
**Reason:** 8-point feature story; Plan 4 defines seven test-first tasks across plugin, AI wiring, and client surfaces.

**Test Files:**
- `test/clue-board-drift.test.js` — Task 1 drift guard: client mirror pinned to `plugins/clue/server/geometry.js` (grid, room polys+labels, doors, cellar, passages, start squares) plus a pawn-colour ↔ E6-4 persona-colour pin via the real catalog.
- `test/clue-plugin.test.js` — Task 2: `validatePlugin` manifest (3–4 players), registry membership, 3/4-seat builds + engine bound agreement, leak guard (envelope/hands/ledgers never in any view), client-side dice round-trip (`roll{value}` validation incl. double-roll), movement from disclosed `view.movement.squares`, room entry → suggest, hostile input (non-participant, unknown action, `__proto__` room).
- `test/clue-ai-adapter.test.js` — Task 3: `bootAiSubsystem` gains `llmByGameType.clue`; five existing adapters unperturbed; six clue personas load as bot users (regression pin — passes at RED by design).
- `test/clue-orchestrator.test.js` — Task 4 (F8b + Finding #6): numeric `pendingRoll` DRIVES the bot through a full turn in one wake-up; values-less roll intent → `clue_roll_request` broadcast, engine untouched, no stall; non-refuter bot not driven (regression pin — passes at RED by design); active bot refuter driven deterministically with 0 LLM calls.
- `test/clue-refute-prompt.test.js` — Task 6: `refuteChoices` (held ∩ suggested, s/w/r order, malformed-view degradation) and `isMyRefute` (per-viewer engine-consistent fixtures).
- `test/clue-e2e-registration.test.js` — Task 7: registry create at 3/4 seats + leak guard, roll→resolve→move, suggest→human-refute pause→resume with shown-card disclosure, both accusation endings, orchestrator bot-turn across the dice pause, and THREE route-level proxy-roll contract tests (see blocking Gap finding).
- `test/_helpers/clue-orchestrator-harness.js` — shared boot harness (real AI subsystem, temp DB, FakeLlm, recording SSE; seats human/bot/human).

**Tests Written:** 36 tests across 6 files covering both ACs
**Status:** RED (verified by testing-runner, RUN_ID E6-5-tea-red: 8 failures all in new files; 4 files fail to load on the missing modules; orchestrator fails on the F8b pause bug reproduced live — bot pawn frozen at `[0,17]`; full suite otherwise 1348 pass / 0 regressions)

**Two deliberate RED-green pins:** the persona-loading test (E6-4 shipped surface) and the non-refuter-not-driven test pass at RED; they exist to survive Dev's adapter/gate changes, not to fail now.

### Rule Coverage

| Rule (javascript.md) | Test(s) | Status |
|------|---------|--------|
| #1 silent errors | `refuteChoices degrades to []` (no throw on malformed views); engine errors surfaced as specific strings (`/die value/`, `/not reachable/`, `/already rolled/`) | failing (module missing) |
| #2 async pitfalls | orchestrator tests `await runTurn` and assert post-await state; stall-free asserts catch floating-promise regressions | failing |
| #3 prototype safety | `__proto__` room id rejected through the registered surface (Object.hasOwn pin) | failing |
| #4 equality/coercion | F8b IS the truthiness-bug class: numeric `pendingRoll` vs backgammon's object pinned explicitly (`pendingRoll === null` / `=== 4`, never truthy checks) | failing |
| #8 test quality | Phase C self-check below; no `.only`/`.skip`, no truthy-only asserts, every test asserts specific values | n/a (self) |
| #10 error handling | engine `{error}` strings matched by content, not presence | failing |
| #11 input validation | die value bounds (0/7/missing) at plugin AND route proxy seam; non-participant 403-class rejection; unreachable-square rejection | failing |

**Rules checked:** 7 of 13 applicable lang-review rules have direct test coverage (the rest — DOM security, Node exec, regex, deps — have no surface in this diff; the client TSX has no node-test surface by repo convention and is covered by build + drift guard + browser checklist).
**Self-check:** 0 vacuous tests; every assertion pins a concrete value or exact error text; the two RED-passing tests are documented regression pins, not vacuous passes.

**Handoff:** To Trillian (Dev) for GREEN. Read the plan's Task 4 carefully, then the **blocking Gap finding** below FIRST: the route-level proxy-roll contract is not in the plan's code sketches and needs a mechanism decision (route bot-turn exemption / engine proxy rule / intercept-time state marker). Also honour the two contract corrections (move payload `square`/`room`, movement `needsRoll` shape) when writing `contracts/clue.ts` and the TSX.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/clients/clue/board-geometry.js` — presentation mirror of the server geometry (drift-guarded); `PAWN_COLORS` = the six E6-4 persona colours
- `plugins/clue/plugin.js` — manifest `{min:3, max:4}`, thin re-export of the shipped engine
- `src/plugins/index.js` — `clue` registered in the shared registry
- `src/server/ai/index.js` — `clue` adapter (`cluePlugin` + `clue-player.chooseAction`) in `bootAiSubsystem`
- `src/server/ai/orchestrator.js` — `CLIENT_RESOLUTION_GAMES` + `awaitingClientResolution(gameType, state)` replaces the raw `pendingRoll` pause in BOTH `botEligible` and `_runBot` (F8b); values-less clue roll intent → `clue_roll_request` broadcast, engine untouched
- `src/server/routes.js` — bot roll proxy: a participant's `roll` POST while a BOT holds `activeUserId` is applied AS the bot (`is_bot` gate); actor threading + turn attribution follow the effective actor
- `src/clients/shared/contracts/clue.ts` — TS mirror with the CORRECTED shipped shapes (`move.payload.square|room`; `movement` as a `needsRoll` union)
- `src/clients/clue/{main,ClueApp,Board,RefutePrompt}.tsx` + `refute-prompt.js` — board from the mirror, DiceTray client-side d6 (own roll + bot proxy roll), suggest/accuse/pass affordances, async-refute card prompt, AiRoster banter, log feed, end banner
- `plugins/clue/client/{index.html, style.css}` — checked-in shell (loads `/shared/dice.js` like risk); bundle outputs gitignored
- `.gitignore` — clue bundle outputs added alongside risk/cribbage/sorry

**Tests:** 36/36 E6-5 tests passing; full suite 1382 pass / 0 fail / 1 skip (testing-runner RUN_ID E6-5-dev-green). `npm run build:client` produces `plugins/clue/client/app.js` (24 modules).
**Branch:** main (trunk-based; pushed as `24402d0`)

**Self-review:** no debug code in new modules; no server-side dice RNG anywhere on the bot path (`no-server-dice-rng` suite still green); client never emits `enterRoom` (F7 — room entry is a reachable-room `move`); all engine writes stay behind reducers; both ACs exercised by tests (AC1 registry→route→orchestrator loop, AC2 drift guard + refute pause round-trip).

**Browser checklist (Task 7 step 5):** NOT yet run — needs a live server session. Reviewer/finish should play one 3-seat mixed game: create → roll → move → suggest → refute prompt → accuse, and confirm the "Roll for {bot} 🎲" button resolves the bot's die. A prod deploy additionally needs the standing ritual: server restart after bundle rebuild.

**Handoff:** To next phase (verify — Deep Thought runs simplify + quality-pass).

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (1382/0/1 tests, 0 smells, build exit 0, no lint configured) | N/A |
| 2 | reviewer-edge-hunter | Yes | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [EDGE] items) |
| 3 | reviewer-silent-failure-hunter | Yes | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [SILENT] item) |
| 4 | reviewer-test-analyzer | Yes | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [TEST] item) |
| 5 | reviewer-comment-analyzer | Yes | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [DOC] item) |
| 6 | reviewer-type-design | Yes | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [TYPE] item) |
| 7 | reviewer-security | Yes | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [SEC] items) |
| 8 | reviewer-simplifier | Yes | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [SIMPLE] item) |
| 9 | reviewer-rule-checker | Yes | Skipped | disabled | Disabled via settings — Reviewer ran the full 13-check javascript.md rubric himself (see Rule Compliance) |

**All received:** Yes (1 returned clean, 8 disabled via settings and assessed by Reviewer directly)
**Total findings:** 3 confirmed, 0 dismissed, 0 deferred

## Reviewer Assessment

**Verdict:** APPROVED

**Data flow traced (two hostile inputs, end to end):**
1. *Refute card click* → `RefutePrompt` button (choices = `view.hand ∩ suggestion` via `refuteChoices`) → `post {type:'refute', payload:{card}}` → participant middleware (403 outsiders) → ownership gate (refuter IS `activeUserId`) → `doRefute` re-validates phase, `refuterSeat`, card ∈ named three, card ∈ `hands[seat]` (`plugins/clue/server/actions.js:131-137`) → ledger write → `shownCard` disclosed ONLY to the suggester (`view.js:21`). Safe because the client's card string is validated against both the suggestion and the actual hand server-side; a forged card yields a 422 string, no state change.
2. *Proxied bot die* → human POSTs `roll {value}` → `routes.js` ownership gate: proxy branch fires ONLY for `action.type === 'roll'` AND `users.is_bot === 1` on the active user (parameterized query) → applied with `actorId = activeUserId` (the bot) → `doRoll` re-validates `currentSeat`, phase `move`, `pendingRoll == null`, integer 1–6 (`actions.js:30-36`) → route's existing bot-nudge (`routes.js` post-txn block) schedules the orchestrator, whose game-aware gate now DRIVES on the numeric die (F8b). Human-for-human stays 422 (pinned by test).

**Observations (severity-tagged):**
- `[MEDIUM]` The roll proxy in `src/server/routes.js` is game-agnostic; backgammon also has a `'roll'` action and numeric `activeUserId`, so a participant can now *front-run* a backgammon bot's pre-roll intent with chosen `value`+`throwParams` (previously 422). NOT new authority — during the pause path clients already supply the bot's dice values by doctrine (backgammon `deriveActiveUserId` flips to the human, `actions.js:44-47`, and the resolve path applies client values to `pendingRoll.player`) — but the exposure window widens. Recommend scoping the proxy with `req.game.gameType === 'clue'` (one-line hardening). Non-blocking under the trusted-participants fan-project threat model; recorded as a delivery finding.
- `[LOW]` Two of six bot portraits 404: `public/shared/portraits/lady-peacock.png` and `professor plum.png` don't match persona ids `mrs-peacock` / `professor-plum` (portraits auto-load by persona id). Committed pre-story in `ce76bc4`; surfaces now that clue is playable. Asset rename, recorded as a delivery finding.
- `[EDGE][LOW]` In a bot-suggests → bot-refutes chain, the suggester bot's `accuse-or-pass` continuation waits for the NEXT external wake-up: `_runOnce`'s `attempted` set (pre-existing semantics, documented at `orchestrator.js:499-505`) won't re-drive it in the same scan, and a bot refute generates no route nudge. Any human action or SSE (re)connect nudges it (`routes.js:246-250`). Pre-existing orchestrator behavior, not introduced by this diff; latency hiccup only, no deadlock. Recorded as a delivery finding for browser-check awareness.
- `[VERIFIED]` F8b fix preserves every other game's pause semantics — `CLIENT_RESOLUTION_GAMES = {backgammon, risk}` and `awaitingClientResolution` reproduces the old truthy check exactly for those two (`orchestrator.js`, both `botEligible` and `_runBot` call it); cribbage/words/sorry never set `pendingRoll`/`pendingCombat`; `ai-orchestrator-pending-roll` AC6 and the risk pending-combat suites are green in preflight. Complies with javascript.md #4 (explicit game-key check, no truthiness on foreign shapes).
- `[VERIFIED]` The client never emits `enterRoom` (F7 mitigation): the only occurrence under `src/clients/clue/` is the doctrine comment (`ClueApp.tsx:5`); `Board.tsx` posts `move {square}` / `move {room}` exclusively — grep count 1 (comment).
- `[VERIFIED]` No secret leakage: `cluePublicView` structurally omits `envelope`/`hands`/`ledgers` (`view.js:56` comment and return shape); pinned by leak-guard tests at plugin AND e2e level; the client renders only view fields (React text nodes, no `innerHTML` — javascript.md #5 compliant).
- `[SILENT]` Client `post(...).catch(() => {})` matches the javascript.md #1 "swallowed promise" pattern — CONFIRMED as rule-matching, downgraded to LOW with evidence, not dismissed: `useGameState.post` sets `actionError` BEFORE throwing (`useGameState.ts:82-86`) and `ClueApp` renders it (`role="alert"` error banner), so every failure IS surfaced to the user; the catch only suppresses the redundant unhandled-rejection. The SSE `onReq` catch ignores malformed frames with a comment explaining recovery (subscribe-nudge re-request).
- `[TEST]` The two RED-passing regression pins (adapter personas, non-refuter gate) are documented as pins in the TEA assessment — not vacuous passes; every other assertion pins concrete values or exact error strings. No `.only`/`.skip` (preflight).
- `[DOC]` Comments verified against behavior: the orchestrator F8b comment states the inversion precisely; the routes proxy comment matches the implemented gate; `board-geometry.js` header names the drift guard that enforces it. No stale comments found in the diff.
- `[TYPE]` `contracts/clue.ts` mirrors the SHIPPED shapes, not the plan's sketch: `move.payload` is `{square}|{room}` (matches `doMove` reads at `actions.js:49-55`) and `movement` is a `needsRoll`-discriminated union (matches `view.js:32-35`). The union makes the illegal "squares while needsRoll" state unrepresentable client-side.
- `[SEC]` New DB reads are parameterized (`SELECT is_bot FROM users WHERE id = ?`); participant middleware precedes the proxy branch (non-participants still 403); no secrets logged; no `eval`/`innerHTML`/variable `require` in the diff. CF Access remains the outer wall.
- `[SIMPLE]` No over-engineering: `plugin.js` is a thin re-export (sorry pattern, 14 lines); the pause predicate is a Set + 4-line function; the client reuses shipped shared components (DiceTray, AiRoster, ErrorBoundary, useGameState) instead of inventing parallel systems.
- `[RULE]` Full 13-check javascript.md rubric run by Reviewer (rule-checker disabled) — see Rule Compliance; 1 rule-matching finding (#1, the `.catch(() => {})` above), 12 checks clean.

### Rule Compliance

| # | javascript.md check | Instances examined | Verdict |
|---|---------------------|--------------------|---------|
| 1 | Silent error swallowing | `ClueApp` post catches ×7, SSE parse catch, `rollAndPost` catch | LOW finding (see [SILENT]) — errors surfaced via `actionError` banner before the catch; not dismissed |
| 2 | Promise/async pitfalls | `rollAndPost` (awaits roll+post), SSE `useEffect` (sync, cleanup closes), orchestrator intercept (returns before tx, no floating promise), route txn (sync better-sqlite3) | compliant |
| 3 | Prototype pollution | `enterRoom` `Object.hasOwn` guard (pre-existing, `actions.js:88`), pinned by `__proto__` test; no user-keyed bracket writes in diff | compliant |
| 4 | Equality/coercion | `value == null` / `pendingRoll == null` are the repo's intentional null-or-undefined idiom (matches engine style); `is_bot === 1` strict; F8b uses game-key membership, not truthiness | compliant |
| 5 | DOM/browser security | No `innerHTML`, `document.write`, `eval`; React text interpolation throughout; SVG attrs from numbers | compliant |
| 6 | Node security | Parameterized SQL only; no exec/spawn/variable require in diff | compliant |
| 7 | Regex safety | No regex added in production code | compliant (N/A) |
| 8 | Test quality | 36 tests: no `.only`/`.skip` (preflight), no truthy-only asserts, exact error-string matches, two documented pins | compliant |
| 9 | Module/scope | `const`/`let` only; no circular imports added (client → shared one-way; plugin.js → engine one-way) | compliant |
| 10 | Error handling | Engine `{error: string}` convention preserved; route maps to 422 JSON; no thrown strings added | compliant |
| 11 | Input validation | Proxied roll re-validated by engine (seat/phase/range/double-roll); route validates `is_bot`; participant gate upstream; unreachable-square and unknown-action rejections pinned | compliant |
| 12 | Dependency/config hygiene | 0 `console.log` in prod diff (preflight); no new deps; bundle outputs gitignored | compliant |
| 13 | Fix-introduced regressions | No fix commits in this diff | N/A |

### Devil's Advocate

Assume this ship leaks. The widest new hole is the route proxy: I attacked it as a griefer — POST `roll {value: 1}` for the clue bot every turn, feeding it minimal movement. It works (that's the designed authority: SOME client must supply the bot's die), but the same griefer could equally post the die the bot asked for honestly; the die value was always client-authored in this doctrine, and participants are the user's own household. I then attacked backgammon through the widened gate: front-running the bot's pre-roll intent with `{value: 6, throwParams: []}` — accepted where it used to 422. That IS a behavioral change, and I've flagged it MEDIUM with a one-line scoping fix, but the authority granted (client chooses the bot's dice) is identical to what the resolve path already grants by design. Race two humans on "Roll for the bot": better-sqlite3 serializes, the loser gets `already rolled this turn`, the client swallows it and resyncs — benign. Can a stale `clue_roll_request` make a client roll at the wrong moment? The prompt self-invalidates on any view where the die landed or the seat moved on, and a truly stale POST hits the engine's phase/double-roll rejections. Can the bot be robbed of its accuse by a premature proxy roll? Yes in principle — rolling before the bot's wake-up removes `accuse` from its post-roll shortlist — but the UI only arms the button on an explicit `clue_roll_request`, which the orchestrator emits only when the bot already chose `roll` over `accuse`. The residual paths (hand-crafted curl by a trusted participant) are the fan-project threat model, not this diff's regression. Finally I hunted the multi-bot chain and found the `attempted`-set latency hiccup ([EDGE] above) — real, pre-existing, self-healing on any nudge. Nothing here breaks correctness; two findings are recorded for follow-up.

**Pattern observed:** collapsed-mechanic discipline held end-to-end — values-less intent (`shortlist.js:55`) → orchestrator intercept broadcast (`orchestrator.js` intercept block) → client 3D tray roll (`ClueApp.rollAndPost`) → route proxy → engine validation. Each layer re-validates; no layer trusts the previous one's shape.
**Error handling:** engine rejections surface as exact 422 strings; client failures render in the `actionError` banner; bot stalls broadcast `bot_stalled` and surface in `AiRoster` (shipped pattern).
**Wiring:** registry → lobby picker (registry-driven, `plugins-host`/`games-create` suites green), `clientDir` serving convention matches risk/sorry, bundle built (preflight), SSE named events match `sse.js:30`.

**Browser checklist:** deferred to finish (needs a live server); Dev's assessment lists the exact steps. The two portrait renames should ride along with it.

**Handoff:** To Slartibartfast (SM) for finish-story.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

### Setup Phase
- **Type:** Gap, **Urgency:** blocking — RESOLVED: Plan 4 written by PM and committed as `4e5cd0b` → `docs/superpowers/plans/2026-07-02-clue-client.md` (7 test-first tasks). F8(b) is dispositioned in Task 4 (adapter-aware pause predicate replaces the raw `pendingRoll` gate; roll intent intercepted into a `clue_roll_request` broadcast); Finding #6 asserted via the `activeUserId` gate. TEA should read the plan's findings-disposition table before writing tests.
- **Type:** Question, **Urgency:** non-blocking — PM flagged two verify-against-source hooks in the plan: the exact `move.payload` shape from the shipped `doMove`, and the `useGameState` ctx/SSE frame format (PM could not fully pin `src/server/sse.js` frame shape). Implementer must verify against source, not assume the plan's sketch.

### Dev (implementation)
- **Question** (non-blocking): seven untracked room-portrait PNGs sit in `public/shared/portraits/` (ballroom, billiard_room, conservatory, dining-room, library, parlor, study) — not created by this story, naming doesn't match the engine's room ids (`dining-room` vs `diningroom`; `parlor` isn't a catalog room), and portraits are persona-keyed (auto-load by persona id), not room-keyed. Affects `public/shared/portraits/` (user to confirm origin/intent; left untracked and untouched). *Found by Dev during implementation.*
- **Improvement** (non-blocking): `.gitignore` lists client bundles per-plugin rather than as a glob — the clue bundle was silently committable until three more lines were added. A `plugins/*/client/app.{js,css,js.map}` glob would end the per-plugin ritual. Affects `.gitignore` (three-line addition shipped in this story; glob consolidation left for a chore). *Found by Dev during implementation.*
- **Improvement** (non-blocking): banter display uses the shared `AiRoster` (risk precedent) — bot bubbles, stall banners, and user trash-talk work — but `RefutePrompt` seat labels are plain "Seat N+1" while the roster shows persona names; a shared seat-name helper would unify. Affects `src/clients/clue/RefutePrompt.tsx` (cosmetic). *Found by Dev during implementation.*

### Reviewer (code review)
- **Improvement** (non-blocking): the roll proxy is game-agnostic and also widens backgammon's pre-roll window — a participant can front-run the bot's roll intent with chosen dice where the route previously 422'd (same client-dice authority as the shipped resolve path, so trust model unchanged). Affects `src/server/routes.js` (add `req.game.gameType === 'clue'` to the proxy condition, plus a pinning test). *Found by Reviewer during code review.*
- **Gap** (non-blocking): two bot portraits 404 because filenames don't match persona ids — portraits auto-load by persona id. Affects `public/shared/portraits/` (rename `lady-peacock.png` → `mrs-peacock.png` and `professor plum.png` → `professor-plum.png`; committed pre-story in `ce76bc4`, surfaces now that clue is playable). *Found by Reviewer during code review.*
- **Question** (non-blocking): in a bot-suggests → bot-refutes chain the suggester's `accuse-or-pass` continuation waits for the next external wake-up (`_runOnce` `attempted`-set semantics, pre-existing; any human action or SSE reconnect nudges it). Worth observing during the browser checklist in a 1-human/2-bot game. Affects `src/server/ai/orchestrator.js` (only if observed as a real annoyance — e.g. un-mark a bot whose turn RESUMED after another bot's refute, mirroring the combat-resume un-mark). *Found by Reviewer during code review.*
- **Type:** Question, **Urgency:** non-blocking — INHERITED from E6-4 (F8(b)): `pendingRoll` semantics are inverted between backgammon ("awaiting client value") and shipped Clue ("known die value, awaiting move"). Plan 3 delivered a values-less roll-intent contract; the orchestrator's raw `if (state.pendingRoll) return` gate must NOT be reused for Clue in Plan 4 wiring.
- **Type:** Improvement, **Urgency:** non-blocking — INHERITED E6-4 delivery finding #6 [EDGE][LOW]: a non-refuter bot driven during the refute phase would fall through to a `pass` the reducer rejects — unreachable under the orchestrator's `activeUserId===bot` gate; Plan 4 wiring must assert that gate.

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Gap** (blocking): the route's turn-ownership check rejects the human's proxy roll for a bot. `routes.js:268` returns 422 for any action when `activeUserId !== req.user.id`; during the clue dice pause `activeUserId` stays on the BOT (the Task 4 intercept applies nothing to state), so the Plan 4 client contract — a human POSTing `roll {value}` on `clue_roll_request` — cannot reach the engine. Backgammon solved this with an engine-level proxy (`plugins/backgammon/server/actions.js:44` accepts the opponent actor while `state.pendingRoll` is set), but clue has no state marker to key off. Affects `src/server/routes.js` and/or `src/server/ai/orchestrator.js`/`plugins/clue/plugin.js` (Dev must pick a mechanism: route-level bot-turn exemption via `users.is_bot`, an engine proxy rule, or a state marker written at intercept time). Pinned mechanism-agnostically by the three route tests in `test/clue-e2e-registration.test.js` — a human CAN resolve a bot's die, the value is still validated, and a human still CANNOT roll for another human. *Found by TEA during test design.*
- **Improvement** (non-blocking): the plan's `ClueAction` TS sketch uses `move.payload.to`; the shipped `doMove` reads `payload.square` / `payload.room` (`plugins/clue/server/actions.js:49-55`). The contract mirror `src/clients/shared/contracts/clue.ts` and both `.tsx` board callbacks must use the real field names (tests pin the real shape). Affects `src/clients/shared/contracts/clue.ts` (mirror the shipped payload). *Found by TEA during test design.*
- **Improvement** (non-blocking): the plan's client-view contract describes `movement` as `{squares, rooms}`; the shipped `cluePublicView` emits `{needsRoll:true, secretPassage}` pre-roll and `{needsRoll:false, pendingRoll, squares, rooms}` post-roll, and `movement` is `null` (not absent) for non-active viewers. The client's Roll-button condition can use `movement.needsRoll` directly. Affects `src/clients/shared/contracts/clue.ts` and `ClueApp.tsx`. *Found by TEA during test design.*
- **Question** (non-blocking): the plan models the orchestrator harness on `test/orchestrator-pending-roll.test.js` — the actual file is `test/ai-orchestrator-pending-roll.test.js`; the new shared harness `test/_helpers/clue-orchestrator-harness.js` follows it (temp-file `openDb`, real persona catalog, `FakeLlmClient`, recording SSE). No action needed beyond using the harness. *Found by TEA during test design.*

## Impact Summary

**Blocking Issues Resolved:** 2 of 2
- Plan 4 gating (Setup) resolved by PM; Plan 4 shipped as `docs/superpowers/plans/2026-07-02-clue-client.md` with findings disposition
- Route proxy-roll blocking gap (TEA) resolved by Dev via route-level `is_bot` exemption in `routes.js:268`

**Findings by Urgency:**

### Non-Blocking Findings: 11 total
- **Security/Behavioral (4):** Roll proxy game-agnostic exposure widens backgammon pre-roll window (recommend `gameType === 'clue'` scoping in follow-up); bot portrait filenames 404 (two renames: `lady-peacock` → `mrs-peacock`, `professor plum` → `professor-plum`); bot-suggests→bot-refutes latency hiccup (pre-existing, self-healing on next nudge); inherited E6-4 F8(b) pendingRoll inversion and non-refuter fall-through (both mitigated by Task 4 wiring: adapter-aware pause predicate + `activeUserId===bot` gate assertion)
- **Process/UX Improvements (3):** Room-portrait PNG origin/intent unclear (7 untracked files; user to confirm); .gitignore per-plugin ritual inefficient (three-line addition shipped; glob consolidation deferred); RefutePrompt seat labels cosmetic gap (shared `AiRoster` shows personas while prompt shows "Seat N+1"; unify via shared helper)
- **Verify-Against-Source (3, all resolved):** Move payload field names (TEA flagged; Dev corrected to `payload.square`/`payload.room` per shipped `doMove`); movement contract shape (TEA flagged; Dev corrected `movement.needsRoll` union); SSE event type (TEA flagged; Dev corrected to named `clue_roll_request` event per `sse.js:30`)
- **Questions (1):** Orchestrator harness file location (TEA; verified — `test/ai-orchestrator-pending-roll.test.js` not `test/orchestrator-pending-roll.test.js`)

**Acceptance Criteria Coverage:** Both ACs exercised end-to-end
- AC1 (registry → playable end-to-end): registry create at 3/4 seats, roll→move→suggest→refute, human accuse path, bot accuse path, orchestrator wiring across dice pause (36/36 tests green; browser checklist deferred to finish)
- AC2 (drift guard + client mirrors): board geometry pinned to server `plugins/clue/server/geometry.js`; pawn colors pinned to E6-4 personas; client never emits `enterRoom` (F7 mitigation verified)

**Release Readiness:** Production-ready with one follow-up
- Deploy: bundle built, tree clean, test suite 1382 pass / 0 fail / 1 skip (LIVE CLI test skipped)
- Browser checklist: deferred to finish (needs live server session with 3-seat mixed game: create → roll → move → suggest → refute prompt → accuse; confirm "Roll for {bot} 🎲" button resolves die)
- Follow-up scoping: add `req.game.gameType === 'clue'` to route proxy condition to harden against backgammon front-running


## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Rewrote the plan's Task 6 refute-prompt fixtures per-viewer**
  - Spec source: docs/superpowers/plans/2026-07-02-clue-client.md, Task 6 Step 1
  - Spec text: test case `isMyRefute(view({ activeUserId: 7 }), 7)` expected `false` ("not the refuter seat") on a fixture that keeps `youAreSeat: 2`
  - Implementation: `test/clue-refute-prompt.test.js` builds engine-consistent per-viewer views (`refuterView`/`suggesterView`); the negative case is the suggester's own view (`youAreSeat: 0`, `activeUserId: 9`, `myUserId: 7`)
  - Rationale: the plan's fixture is engine-impossible (the engine always sets `activeUserId = seats[refuterSeat]`) and, under the plan's own implementation, would have returned `true` — the test as written in the plan fails against its own Step 3 code
  - Severity: minor
  - Forward impact: Dev implements the plan's Step 3 `isMyRefute`/`refuteChoices` unchanged; the corrected tests pass against it
  - → ✓ ACCEPTED by Reviewer: the plan's fixture was engine-impossible and self-contradictory; the corrected per-viewer fixtures test the plan's own implementation honestly
- **Pinned the shipped `move` payload shape instead of the plan's sketch**
  - Spec source: docs/superpowers/plans/2026-07-02-clue-client.md, Task 5 contract sketch
  - Spec text: `{ type: 'move'; payload: { to: [number, number] | { room: RoomId } } }` (flagged in-plan as a verify-against-source hook)
  - Implementation: tests use `payload.square` / `payload.room` per shipped `doMove`
  - Rationale: the plan itself instructs mirroring the shipped reducer; `doMove` reads `payload.square`/`payload.room`
  - Severity: minor
  - Forward impact: Dev must write `contracts/clue.ts` and the board callbacks with the real field names
  - → ✓ ACCEPTED by Reviewer: the plan explicitly marked this a verify-against-source hook; `doMove` reads `payload.square`/`payload.room` (`actions.js:49-55`) and the shipped contract mirrors it
- **Added route-level proxy-roll contract tests beyond the plan's Task 7 scenarios**
  - Spec source: docs/superpowers/plans/2026-07-02-clue-client.md, Task 7 (scenarios drive registry + orchestrator only)
  - Spec text: Task 7 scenarios stop at the orchestrator/engine surface
  - Implementation: three additional tests in `test/clue-e2e-registration.test.js` drive `POST /api/games/:id/action` through `mountRoutes`
  - Rationale: AC1 says "playable in the browser"; the discovered `routes.js:268` ownership-check gap breaks the browser flow while all plan-level scenarios pass — a suite without these tests would go green with an unplayable game
  - Severity: minor
  - Forward impact: Dev must make the proxy-roll path work at the route level (mechanism of their choice) or the suite stays red
  - → ✓ ACCEPTED by Reviewer: without these tests the suite goes green on an unplayable browser game — the mechanism-agnostic outcome pair (bot proxy works, human-for-human stays rejected) is exactly the right contract level

### Dev (implementation)
- **Proxy-roll mechanism: route-level is_bot gate (not an engine proxy or state marker)**
  - Spec source: .session/E6-5-session.md, TEA blocking Gap finding + docs/superpowers/plans/2026-07-02-clue-client.md Task 4
  - Spec text: "Dev must pick a mechanism: route-level bot-turn exemption via `users.is_bot`, an engine proxy rule, or a state marker written at intercept time"
  - Implementation: `routes.js` turn-ownership check now lets a `roll` through when the ACTIVE user is a bot, and applies it with `actorId = activeUserId` (the bot); all other actions keep the 422
  - Rationale: backgammon/risk flip `activeUserId` to a specific human during their pauses — unambiguous in 2P, ambiguous in 3-4P clue (which human?); an engine proxy rule can't see `is_bot`; a state marker written outside a reducer breaks the reducer-only state discipline. The route has the DB and the engine still re-validates seat/phase/value
  - Severity: minor
  - Forward impact: any future N-player game with client-side dice for bots gets this path for free; the proxy is `roll`-only by design
  - → ✓ ACCEPTED by Reviewer: the strongest of the three mechanisms (route sees `is_bot`; engine keeps re-validating; no reducer-bypass state writes) — with one [MEDIUM] caveat: it also widens backgammon's pre-roll window (see Reviewer Assessment); scope to `gameType === 'clue'` as a follow-up
- **Roll intercept placed after LLM bookkeeping, inside the retry loop**
  - Spec source: docs/superpowers/plans/2026-07-02-clue-client.md, Task 4 step 3(c)
  - Spec text: "immediately AFTER chooseAction resolves and BEFORE the returned action is applied"
  - Implementation: as specified; the sessionId/resume accounting above it still runs (the decision DID consume an LLM call), then the intercept broadcasts and returns before the write transaction
  - Rationale: keeps resume-slot accounting truthful and the intercept ahead of any engine write
  - Severity: minor
  - Forward impact: none
  - → ✓ ACCEPTED by Reviewer: agrees with author reasoning; the decision consumed a real LLM call, so skipping the bookkeeping would drift resume counts
- **Client listens for `clue_roll_request` as a NAMED SSE event**
  - Spec source: docs/superpowers/plans/2026-07-02-clue-client.md, Task 5 ClueApp sketch
  - Spec text: sketch subscribed to generic `message` frames and JSON-matched `msg.type`
  - Implementation: `es.addEventListener('clue_roll_request', …)` — `src/server/sse.js` emits `event: <type>` named frames, so generic `message` listeners never fire
  - Rationale: the plan itself flagged the SSE frame shape as verify-against-source; verified against `sse.js:30`
  - Severity: minor
  - Forward impact: none
  - → ✓ ACCEPTED by Reviewer: `sse.js:30` emits `event: <type>` named frames — the plan's generic `message` listener would never have fired; this correction is load-bearing for AC1
- **Roll prompt is a button on the shared DiceTray, not an auto-fired POST**
  - Spec source: docs/superpowers/plans/2026-07-02-clue-client.md, Task 5 ("on `clue_roll_request` SSE … the client rolls and POSTs on the bot's behalf")
  - Spec text: implied automatic resolution on event receipt
  - Implementation: the event arms a "Roll for {bot} 🎲" button over the shared 3D DiceTray; whoever taps first resolves it (duplicates are engine-rejected and silently resynced); the prompt self-invalidates when the view shows the die landed
  - Rationale: dice are a VISIBLE-animation mechanic (project doctrine) — the tray is the shipped pattern (risk/backgammon); auto-posting from N connected clients multiplies duplicate 422s and denies the human the dice moment
  - Severity: minor
  - Forward impact: none — a missed event is re-broadcast by the SSE-subscribe orchestrator nudge (`routes.js:246`)
  - → ✓ ACCEPTED by Reviewer: the armed button also prevents the premature-roll edge (a proxy roll before the bot chose would strip `accuse` from its post-roll menu); auto-fire would make that race reachable