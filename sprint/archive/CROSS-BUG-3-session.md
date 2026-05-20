---
story_id: "CROSS-BUG-3"
jira_key: ""
epic: "CROSS-BUG"
workflow: "tdd"
---
# Story CROSS-BUG-3: Client-side dice rolling for AI (Risk + Backgammon)

## Story Details
- **ID:** CROSS-BUG-3
- **Jira Key:** (pending)
- **Epic:** CROSS-BUG (Cross-game bugfixes)
- **Workflow:** tdd
- **Type:** bug
- **Points:** 5
- **Priority:** p1
- **Stack Parent:** none

## Story Context

Implement client-side dice rolling for AI opponents in Risk and Backgammon. Architecturally this is the same collapsed-mechanic pattern cribbage uses for the cut (see `plugins/cribbage/server/phases/discard.js:25` — applyDiscard inlines performCut when both discards land; no separate "cut" action, no round-trip wait).

**Principle:** Dice rolls are a no-decision rules mechanic with a visible 3D physics animation. They live on the client (wherever the dice render), inlined into the action that triggers them. The bot never rolls; the server never calls `Math.floor(rng() * 6) + 1` for dice values; whichever client renders the dice physics IS the roll. The physics outcome is the truth.

**Prior Work:** CROSS-BUG-2 ported the dice renderer to @local/dice-lib and removed the stale-state pip row from backgammon's moving phase. It did NOT solve the server-RNG architecture problem — the bot still server-rolls today. This story removes server-side RNG entirely for bot actions and gates bot action continuation on the human's client resolving the physics.

**Deferral Notes (from CROSS-BUG-2 findings):**
- Exact-value animated replay of recorded rolls is NOT in scope; the client-rolls model makes recorded replays unnecessary for the live game.
- Doubling-by-bot in backgammon is NOT in scope; doubling is sequenced strictly before the roll and is outside the dice mechanic.
- `src/clients/risk/CombatReveal.tsx` replay mode may still be used for spectator/history views; audit usages before deleting.

## Acceptance Criteria

1. **AC1: Risk applyAttack with no `resolved` payload stores pendingCombat instead of rolling server-side**
   - When `plugins/risk/server/actions.js:applyAttack` receives an attack without a `resolved` payload (i.e., a bot's intent), set `state.pendingCombat = { from, to, force, attackerIdx, defenderIdx }` and return success.
   - Do NOT resolve the attack, do NOT advance the phase, do NOT call `rollDice`.

2. **AC2: Risk server never invokes rollDice on the bot-attack path; resolved-payload validator/applier still works**
   - The server's resolved-path validator/applier (already exists, spec Amendment A.1) applies the result and clears `pendingCombat`.
   - Existing human-vs-human attack flows unchanged.
   - `plugins/risk/server/combat.js:rollDice` can be retained if used by tests; the action handler call site is removed.

3. **AC3: Risk defender client picks up pendingCombat where defenderIdx===me and posts {resolved:{rounds}} after physics settles**
   - Defender's client watches for `pendingCombat` surfaced over the wire.
   - When `pendingCombat.defenderIdx === me`, render `<CombatReveal mode="live">` driving both `atkRef.roll(n)` and `defRef.roll(n)` locally.
   - On the resolved Promise, POST `{type: 'attack', payload: {from, to, force, resolved: {rounds}}}` (or a new resolve-combat action).
   - Orchestrator's turn-continuation gate will naturally re-fire after `pendingCombat` is cleared because state changed; verify on first e2e test that bot doesn't need gate modification.

4. **AC4: Backgammon bot roll/roll-initial wake-up stores pendingRoll instead of generating RNG values**
   - Bot's pre-roll/initial-roll wake-up signals intent to roll (action with no values/throwParams, or a new pending-roll marker set server-side).
   - Server stores `state.pendingRoll = { player: botIdx, kind: 'roll' | 'roll-initial' }` and pauses orchestrator continuation.
   - Do NOT server-side RNG the values; `src/server/ai/orchestrator.js:37,47` and `plugins/backgammon/server/ai/backgammon-player.js:54` are modified to not generate values.

5. **AC5: Backgammon client picks up pendingRoll for the human, rolls dice locally, posts settled values back as the roll action**
   - Human's client picks up `state.pendingRoll` and mounts a dice-tray, physically rolls 2d6 (or 1d6 for initial-roll).
   - Reads the settled values and POSTs them back as the roll action with the values.
   - Server applies values to `state.turn.dice`, clears `pendingRoll`, signals orchestrator wake-up.
   - Bot resumes the same wake-up cycle and picks moves using those human-rolled values.

6. **AC6: Backgammon orchestrator continuation paused while pendingRoll set; resumes after clear so bot picks moves using the human-rolled values**
   - Continuation gate: "the bot's wake-up is paused while `state.pendingRoll` exists; resume when cleared."
   - This is the analog of the Risk `pendingCombat` check for the continuation gate.
   - Verify that gate modification is needed (may happen automatically when state changes).

7. **AC7: No server-side Math.random/rng for dice values on any bot-attack/bot-roll path (greppable assertion)**
   - All instances of server-side RNG generation for bot dice rolls are removed.
   - Code review assertion: grep for Math.random, rng(), rollDice in bot-action paths must be empty.

8. **AC8: Existing human-vs-human Risk attack and Backgammon roll flows unchanged**
   - All human-initiated attacks and rolls continue to work as before.
   - No changes to human action contracts or phase transitions.

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-05-20T21:10:44Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-20T20:31:15Z | 2026-05-20T20:33:32Z | 2m 17s |
| red | 2026-05-20T20:33:32Z | 2026-05-20T20:45:02Z | 11m 30s |
| green | 2026-05-20T20:45:02Z | 2026-05-20T20:59:41Z | 14m 39s |
| spec-check | 2026-05-20T20:59:41Z | 2026-05-20T21:01:14Z | 1m 33s |
| verify | 2026-05-20T21:01:14Z | 2026-05-20T21:04:37Z | 3m 23s |
| review | 2026-05-20T21:04:37Z | 2026-05-20T21:09:29Z | 4m 52s |
| spec-reconcile | 2026-05-20T21:09:29Z | 2026-05-20T21:10:44Z | 1m 15s |
| finish | 2026-05-20T21:10:44Z | - | - |

## Sm Assessment

**Setup Complete:** Yes
**Story:** CROSS-BUG-3 — Client-side dice rolling for AI (Risk + Backgammon), 5pts, p1, bug, tdd
**Repos:** g-1
**Branch:** feat/CROSS-BUG-3-client-side-dice-ai (created from main)
**Session file:** .session/CROSS-BUG-3-session.md
**Context file:** sprint/context/context-story-CROSS-BUG-3.md
**Jira:** none (project does not use Jira)

**Brief origin:** User (Bossmang) provided the full architectural brief in chat. Context file captures it verbatim plus distilled ACs (AC1–AC8).

**Pattern reference:** Cribbage's `applyDiscard → performCut` inline at plugins/cribbage/server/phases/discard.js:25 is the architectural prior. Memory note `project_dice_client_side.md` codifies the principle.

**Handoff:** To TEA (Amos Burton) for RED phase. TEA writes failing tests for:
1. Risk pendingCombat storage on no-resolved attack
2. Risk defender-client pickup → POSTs resolved
3. Risk server has zero rollDice on bot-attack path
4. Backgammon pendingRoll storage on bot pre-roll
5. Backgammon human-client pickup → POSTs settled values
6. Orchestrator continuation gate respects pendingCombat / pendingRoll
7. Greppable: no server-side Math.random/rng for dice values on bot paths
8. Existing human-vs-human flows unchanged

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|------------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 0 smells; 952/952 tests passing; 19 files changed | accepted |
| 2 | reviewer-edge-hunter | n/a | Skipped | disabled via settings | N/A |
| 3 | reviewer-silent-failure-hunter | n/a | Skipped | disabled via settings | N/A |
| 4 | reviewer-test-analyzer | n/a | Skipped | disabled via settings | N/A |
| 5 | reviewer-comment-analyzer | n/a | Skipped | disabled via settings | N/A |
| 6 | reviewer-type-design | n/a | Skipped | disabled via settings | N/A |
| 7 | reviewer-security | n/a | Skipped | disabled via settings | N/A |
| 8 | reviewer-simplifier | n/a | Skipped | disabled via settings | N/A |
| 9 | reviewer-rule-checker | n/a | Skipped | disabled via settings | N/A |

All received: Yes (1 enabled subagent returned; 8 skipped by `workflow.reviewer_subagents` settings).

## Reviewer Assessment

**Verdict:** APPROVED (no blocking findings)

### Reviewer's Own Findings

#### Risk applyAttack — `forceCommitted = src.armies - 1` ignores `payload.force`

**Severity:** Minor / informational
**Location:** `plugins/risk/server/actions.js:175`

The resolved-path applier derives `forceCommitted = src.armies - 1` and ignores the bot's stated `payload.force` (which was stored on `pendingCombat.force`). Today this is safe — `plugins/risk/server/ai/legal-moves.js:64` is the only place the bot emits attack force, and it always emits `force: armies - 1`. So `pc.force === src.armies - 1` is invariant in current code.

**Risk:** A future change to the bot move generator that emits partial-commit attacks (force < armies-1) would cause client/server disagreement: the defender's client drives `pc.force` rounds; the server's `replayAttack` rejects with "illegal dice count" because dice counts depend on the server-derived force. The bug would be loud (game stalls on first attack), not silent — but it's a fragile invariant that should be documented.

**Recommendation:** Accept as-is for CROSS-BUG-3 (no behavioral regression today). Worth a follow-up to either honor `payload.force` in the applier or assert `pc.force === src.armies - 1` defensively.

#### Trust model: defender authoritative for dice physics

**Severity:** Minor / acceptable per spec
**Location:** `plugins/risk/server/actions.js:160-181` + `plugins/backgammon/server/actions.js:175-204`

The server replays the defender's submitted rounds without verifying they came from real physics. A malicious client (or buggy client) could POST rounds where the defender always wins (`aDice: [1,1,1], dDice: [6,6]`). The same applies to backgammon — the human's POST claims arbitrary values.

Per memory (`project_dice_client_side.md`): "The physics outcome is the truth." The spec explicitly accepts client authority for dice. In a local-trust 2-player environment (gamebox per memory `project_2p_only.md`), this is fine — the human only cheats themselves of fair play vs the bot.

**Recommendation:** Accept. Document the trust model explicitly in the code comments or a future ADR so reviewers don't re-discover this.

#### Defensive ordering: duplicate resolve POST could be misinterpreted as own initial-roll

**Severity:** Minor / defensive
**Location:** `plugins/backgammon/server/actions.js:96-99` (and analogous in doRoll)

The differentiator between "I'm resolving the bot's pendingRoll" and "I'm rolling my own initial" is the presence of `state.pendingRoll`. After a resolve POST clears pendingRoll, a duplicate POST (e.g., a network retry that lost the SSE update) would re-enter doRollInitial:
- `pending` is now null.
- `rollerSide = side` (the human).
- Line 97 checks `state.initialRoll[rollerSide] !== null` — if the human hasn't rolled their own yet, this is null, and the duplicate POST silently sets the human's initial-roll to the duplicate value.

**Risk:** Not exploitable through normal UI (each dice-tray emits `dice-settle` exactly once). A double-click during physics settle is the only realistic trigger, and even then the lib should only fire once per roll. But it's wire-level state that depends on a non-explicit "this POST is a resolve" marker.

**Recommendation:** Accept for CROSS-BUG-3. A follow-up could add an explicit `resolves: true` flag on the resolve POST to make the engine's intent unambiguous, but that's a contract change.

#### `applyRiskAction({ rng })` parameter is now unused

**Severity:** Trivial / cleanup
**Location:** `plugins/risk/server/actions.js:36`

After CROSS-BUG-3 the rng parameter is destructured but never consumed (the only call site that needed it — applyAttack — no longer accepts it). routes.js still passes `rng: makeRng(Date.now())` to all plugin.applyAction calls for cross-game uniformity. Removing it from Risk's signature would be a no-op semantically.

**Recommendation:** Leave as-is for API uniformity across plugins. Possibly a follow-up to remove rng from the cross-plugin contract once all plugins are dice-free.

### Praise

- **Orchestrator pause gate placement** — `src/server/ai/orchestrator.js:89-94` puts the pendingCombat/pendingRoll check at the top of `_runOnce`, before the active-user check AND before the sequence-drain block. This correctly preempts the race TEA flagged during RED ("sequence-drain interleaving with pause logic").
- **AC7 greppable test** — `test/no-server-dice-rng.test.js` is institutional memory in test form. It will catch any future regression that re-introduces server-side dice RNG at the three known sites, regardless of who writes it.
- **Risk resolver authority** — the resolved-path applier reads `pendingCombat.attackerIdx` for the attacker, not the POST's `actorId`. This cleanly separates "who's driving the physics" (the defender) from "who's attacking" (the bot). The `isResolverPost` exemption is narrowly scoped (specific action type + resolved presence + defenderIdx match) and cannot be abused by a non-defender.

### Decision

**APPROVED for merge.** No blocking issues. Four minor findings documented for traceability; none require code changes for CROSS-BUG-3.

The 8 disabled subagents represent intentional reviewer-pass scoping by the project configuration (`workflow.reviewer_subagents`). The simplify pass already ran in the verify phase with all three teammates and applied two high-confidence fixes. Preflight returned clean.

## TEA Assessment (verify)

**Phase:** finish
**Status:** GREEN confirmed (834/834 server + 118/118 client tests passing post-simplify)

### Simplify Report

**Teammates:** reuse, quality, efficiency
**Files Analyzed:** 18 (8 src, 10 test)

| Teammate | Status | Findings |
|----------|--------|----------|
| simplify-reuse | 5 findings | 1 high, 3 medium, 1 low |
| simplify-quality | 1 finding | 1 high (RiskAction.resolved type) |
| simplify-efficiency | 3 findings | 2 high, 1 medium |

**Applied (high-confidence, in scope):**
- `plugins/backgammon/server/ai/backgammon-player.js:10` — removed unused `rng` parameter from chooseAction signature. Body no longer consumes rng after the dice-intent refactor; extra args at call sites are silently ignored so no caller breaks.
- `src/clients/shared/contracts/risk.ts` — `RiskAction.attack.payload.resolved` is now optional. Reflects the bot-intent POST shape (no `resolved`) introduced by CROSS-BUG-3. RiskApp's existing post sites always supply `resolved`, so the type change is purely additive.

**Flagged for Review (medium-confidence or out-of-scope):**
- *(efficiency)* `src/server/ai/orchestrator.js` SSE turn-broadcast payload duplicated 3x (lines ~169, ~245, ~353). Pre-existing duplication, NOT touched by CROSS-BUG-3 — out of scope for verify; worth a follow-up refactor story.
- *(efficiency)* `plugins/backgammon/server/actions.js:232` `removeOneDie` could be `filter`-based. Pre-existing, out of scope.
- *(reuse)* `bootBackgammon` test harness in `test/ai-orchestrator-pending-roll.test.js` shares shape with `setup` in `test/ai-orchestrator.test.js`. Extracting a shared factory is a marginal-benefit abstraction; deferred.
- *(reuse)* Backgammon `deriveActiveUserId` / Risk `syncActiveUser` share a pending-action pattern. Cross-game abstraction; would create a shared utility module that doesn't yet exist. Deferred to a future story if the pattern recurs.
- *(reuse)* `applyAttack`'s no-resolved branch and backgammon's doRoll values-less branch share structural shape (check-store-or-clear). Worth noting but the engines are otherwise distinct enough that a shared helper would obscure more than it clarifies. Deferred.

**Noted (low-confidence):**
- *(reuse)* `clone()` helper in `plugins/risk/server/actions.js:32` is JSON-deep-clone; not extracted because other plugins each have their own version. Worth a project-wide cleanup story.

**Dismissed:**
- *(reuse)* "Deterministic RNG `det()` duplicated in two test files" — the new test file `ai-orchestrator-pending-roll.test.js` does NOT define `det()` (false positive; verified by grep).

**Reverted:** 0 — both applied fixes survived the post-fix test run.

**Overall:** simplify: applied 2 fixes (high-confidence, in-scope)

### Quality Checks

| Check | Status |
|-------|--------|
| Server tests (node:test) | 834/834 passing, 1 skipped (pre-existing) |
| Client tests (vitest)   | 118/118 passing across 32 files |
| Working tree            | clean (committed + pushed) |

**Handoff:** To Reviewer (Chrisjen Avasarala) for adversarial pass.

## Architect Assessment (spec-check)

**Spec Alignment:** Aligned
**Mismatches Found:** None requiring action — 2 minor notes documented for traceability.

### AC walk-through

| AC | Code site | Status |
|----|-----------|--------|
| AC1 — pendingCombat storage | `plugins/risk/server/actions.js:219` `s.pendingCombat = { from, to, force, attackerIdx: playerIdx, defenderIdx }` | Aligned. Validation runs before storage; no territory mutation; phase unchanged. |
| AC2 — resolveAttack call site removed | `plugins/risk/server/actions.js:3` import drops resolveAttack; AC7 grep test confirms no call sites remain. Resolved-payload applier intact, clears pendingCombat on apply. | Aligned. |
| AC3 — defender-client pickup | `src/clients/risk/RiskApp.tsx:118-141` defender-as-viewer branch mounts `<CombatReveal mode="live">`; onResolved POSTs `{type: 'attack', payload: {from, to, force, resolved}}`. | Aligned. |
| AC4 — pendingRoll storage | `plugins/backgammon/server/actions.js:79` (roll-initial) and `:175` (roll) store `{player: side, kind}`; orchestrator auto-actions in `src/server/ai/orchestrator.js:34-49` POST values-less intents (no `Math.floor(rng()*6)`); `plugins/backgammon/server/ai/backgammon-player.js` chooseAction returns values-less roll. | Aligned. |
| AC5 — client picks up pendingRoll | `plugins/backgammon/client/dice.js:111-130` viewer-as-proxy branch mounts active `dice-tray`, POSTs values back via `onRoll('roll'|'roll-initial', ...)`. Engine clears pendingRoll on apply. | Aligned. |
| AC6 — orchestrator pause gate | `src/server/ai/orchestrator.js:89-94` top-of-_runOnce early-return on `state.pendingCombat || state.pendingRoll`. Also covers Risk's analogous case. | Aligned. |
| AC7 — no server-side dice RNG on bot path | `test/no-server-dice-rng.test.js` 3/3 pass — resolveAttack call site, orchestrator RNG, backgammon-player RNG all removed. `combat.js:rollDice` retained per spec for test-only use. | Aligned. |
| AC8 — human paths unchanged | Regression guards pass: human resolved-attack (`test/risk-actions-attack-resolved.test.js`), human pre-roll with values (`test/backgammon-actions-pending-roll.test.js` AC8 case), natural-win via resolved payload. | Aligned. |

### Design freedoms exercised (notes, not mismatches)

- **`pendingRoll.player` uses side letter ('a'/'b') instead of `botIdx`**
  - Spec text: "Server stores `state.pendingRoll = { player: botIdx, kind: ... }`"
  - Code: stores side letter; consistent with all other backgammon state shape (`state.turn.activePlayer`, `state.initialRoll` keys, `state.sides`).
  - Type: Cosmetic, Trivial severity. TEA's RED tests pre-approved either shape.
  - Recommendation: **A (update spec)** — side-letter is the better fit for backgammon's existing state model. Already covered by Dev's deviation log "Auth model decided as follows".

- **Risk engine adds `isResolverPost` exemption to entry "not your turn" gate**
  - Spec text: implied — "defender's client... posts {resolved}"; doesn't say HOW the engine accepts that POST when bot is currentPlayer.
  - Code: `plugins/risk/server/actions.js:57-62` carves out exactly the case where actor === pendingCombat.defenderIdx with a resolved-attack payload.
  - Type: Architectural, Minor severity. The route-level gate (routes.js) already passes because `syncActiveUser` flips activeUserId to defender; the engine-level gate needed parallel relaxation.
  - Recommendation: **A (update spec)** — exemption is narrowly scoped and necessary. Already covered by Dev's deviation log.

### TEA's open questions — resolution status

- **TEA Q: "pendingCombat.force interpretation"** — Resolved by Dev: stored as bot's stated intent (informational metadata for the client to derive die count); resolved-applier still uses src.armies-1 internally. Behavior unchanged from Amendment A.1. ✓
- **TEA Q: "auth model for human-as-proxy POST"** — Resolved by Dev: no new action type; engine carves out the resolver exemption; route gate is satisfied via activeUserId flip. ✓
- **TEA Improvement: "orchestrator drain-vs-pause race"** — Resolved by Dev: gate is the first check in `_runOnce`, before the sequence-drain block. ✓

### Decision

**Proceed to verify (TEA quality-pass).** All ACs implemented as specified; the two design freedoms are documented, well-scoped, and substantively improve on the spec's shorthand. No structural drift; no hand-back required.

The known gap Dev flagged — backgammon client's pendingRoll branch lacks a vitest covering the human resolve POST end-to-end — is appropriate for Reviewer awareness but not a spec-check blocker (no vitest infrastructure exists for the vanilla-JS backgammon client; adding one would be a story of its own).

## Dev Assessment

**Implementation Complete:** Yes
**Tests:** 834/834 server + 118/118 client = 952/952 passing (GREEN). 1 server test skipped (unrelated, pre-existing).
**Branch:** feat/CROSS-BUG-3-client-side-dice-ai (pushed)

**Files Changed:**

Engine:
- `plugins/risk/server/actions.js` — applyAttack: no-resolved → stores pendingCombat; resolved → applies (and clears pendingCombat if set). Removed resolveAttack import. syncActiveUser flips activeUserId to defender while pendingCombat is set. Added defender-as-proxy exemption to the entry "not your turn" gate.
- `plugins/backgammon/server/actions.js` — doRoll / doRollInitial: values-less payload stores pendingRoll; values-bearing payload (from either active player or proxy) applies dice. rollerSide derived from pendingRoll.player when resolving on bot's behalf. deriveActiveUserId flips to opposing human while pendingRoll is set.
- `src/server/ai/orchestrator.js` — autoActions['initial-roll'] and ['pre-roll'] now POST values-less intents. Top-of-_runOnce gate returns early on pendingCombat or pendingRoll.
- `plugins/backgammon/server/ai/backgammon-player.js` — chooseAction returns values-less roll intent; rng spy in tests confirms zero materialization.

Client:
- `src/clients/risk/RiskApp.tsx` — defender's branch mounts `<CombatReveal mode="live">` when `view.pendingCombat.defenderIdx === view.youAre`, POSTs resolved payload on settle.
- `plugins/backgammon/client/dice.js` — viewer renders an active dice-tray on the bot's behalf when pendingRoll is set and player !== viewer.
- `src/clients/shared/contracts/risk.ts` — RiskView gains optional pendingCombat; RiskAction.attack.payload.force optional.

Tests (new, all GREEN):
- `test/risk-actions-pending-combat.test.js` — AC1, AC2 (4 tests)
- `test/backgammon-actions-pending-roll.test.js` — AC4, AC5, AC8 (5 tests)
- `test/ai-orchestrator-pending-roll.test.js` — AC4, AC6 (3 tests)
- `test/no-server-dice-rng.test.js` — AC7 (3 tests)
- `test/client/risk-app-pending-combat.test.tsx` — AC3 (2 tests)

Tests (modified to assert new contract, all GREEN):
- `test/ai-backgammon-player.test.js` — chooseAction returns values-less intent
- `test/ai-orchestrator.test.js` — two tests assert pendingRoll instead of initialRoll value
- `test/ai-backgammon-full-leg.test.js` — injects human-style resolve POST mid-leg
- `test/risk-actions-attack.test.js` — removed 3 rolled-attack tests (deprecated path); kept end-attack + illegal-attack
- `test/risk-actions-resign.test.js` — natural-win test uses resolved-payload path
- `test/risk-full-game.test.js` — bot-vs-bot loop injects resolveBotCombat helper using combat.js:rollDice (test-only)

**Self-review checklist:**
- [x] Code is wired front-to-back: Risk defender POST resolves pendingCombat → engine clears → activeUserId restores to attacker. Backgammon human POST resolves pendingRoll → engine applies dice → activeUserId restores to bot.
- [x] All ACs covered by passing tests.
- [x] No regressions in existing test suite (834 server + 118 client all green).
- [x] No debug code, no console.log added, no .only / .skip.
- [x] Greppable: `Math.floor(rng() * 6)` no longer present in any orchestrator/backgammon-player/risk-action site (combat.js's helper retained per brief for test use only).

**Handoff:** To TEA (Amos Burton) for verify phase (simplify + quality-pass) — workflow is TDD; next phase is verify.

## TEA Assessment

**Tests Required:** Yes
**Status:** RED (16 new/updated tests failing as designed; AC8 regression guards still passing)

**Test Files:**
- `test/risk-actions-pending-combat.test.js` (new) — AC1, AC2 server-side + AC8 human-resolved regression
- `test/backgammon-actions-pending-roll.test.js` (new) — AC4, AC5 engine + AC8 human-pre-roll regression
- `test/ai-orchestrator-pending-roll.test.js` (new) — AC4, AC6 orchestrator
- `test/no-server-dice-rng.test.js` (new) — AC7 greppable assertion (three RNG sites)
- `test/client/risk-app-pending-combat.test.tsx` (new) — AC3 defender-client pickup
- `test/ai-backgammon-player.test.js` (modified) — AC4 chooseAction returns values-less intent

**Tests Written:** 17 RED + 2 explicit AC8 regression-pass guards
**Status:** RED — verified by direct runs of each new file. All targeted assertions fail today; AC8 regression assertions pass.

### Rule Coverage

This story is a state-machine refactor (removing server-side RNG sites, adding pending-state storage), not a feature with new attack surface. Most lang-review/javascript.md checks are not applicable.

| Rule | Test(s) | Status |
|------|---------|--------|
| #8 test quality — meaningful assertions | All new tests use specific value/shape assertions; no `toBeTruthy`/`is_none`/`.only`/`.skip` | self-checked, clean |
| #8 vacuous assertion sweep | Reviewed: every test asserts a concrete post-condition (rng call count == 0, specific state shape, specific POST payload) | clean |
| #11 input validation preserved | AC8 regression in `backgammon-actions-pending-roll.test.js` confirms human's WITH-values roll still validates 1..6 | passing |
| #11 resolved-path validator preserved | AC2 + AC8 regression in `risk-actions-pending-combat.test.js` (human resolved attack still captures) | passing |
| #7 regex safety in AC7 greppable test | Greppable test uses static `String#includes`-style RegExp on file content — no user-controlled regex | clean |

Other rules (silent-errors, prototype-pollution, equality-coercion, DOM-security, nodejs-security, dependency-hygiene) are not relevant to the test design itself.

**Self-check:** No vacuous assertions found. No skipped/only/forgotten markers.

**Handoff:** To Dev (Naomi Nagata) for GREEN implementation.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

No upstream findings at setup.

### TEA (test design)
- **Question** (non-blocking): The resolved-path validator at `plugins/risk/server/actions.js:144` derives `forceCommitted = src.armies - 1` and ignores `payload.force`. AC1 says to store `payload.force` in `pendingCombat`. The pendingCombat.force is therefore informational metadata for the client (to know how many attacker dice to roll); the server's replayAttack still uses src.armies-1 for survivor math. Dev: confirm this is the intended reading. Affects `plugins/risk/server/actions.js` (no code change required if the read is correct — just be aware when wiring the resolver client). *Found by TEA during test design.*
- **Question** (non-blocking): When the human's client POSTs roll values to resolve a bot's pendingRoll, what's the auth model? The bot is still `state.turn.activePlayer` / `state.activeUserId`. The natural-implementation tests use `actorId = botId` so the existing isActive gate passes. Dev may instead route through a different action type or relax the gate when `state.pendingRoll.player !== actorSide`. The contract tests are flexible on this. Affects `plugins/backgammon/server/actions.js:doRoll` / `doRollInitial`. *Found by TEA during test design.*
- **Improvement** (non-blocking): A bot can have a cached `sequenceTail` (pending moves) AND set `pendingRoll` in the same wake-up cycle if the orchestrator's drain path is interleaved with the new pause logic. Worth verifying the gate kicks in before the cache drain. Affects `src/server/ai/orchestrator.js:_runOnce` (the sequence-drain block around line 204). *Found by TEA during test design.*

### TEA (test verification)
- No upstream findings during test verification. Two simplify fixes applied (chooseAction rng param removal; RiskAction.resolved optional); no design or spec gaps surfaced.

### Architect (reconcile)
- **Reviewer's "forceCommitted invariant" finding documented as spec gap**
  - Spec source: context-story-CROSS-BUG-3.md, AC1
  - Spec text: "set `state.pendingCombat = { from, to, force, attackerIdx, defenderIdx }`"
  - Implementation: `pendingCombat.force` stores the bot's stated force literally; the resolved-path applier ignores it and derives `forceCommitted = src.armies - 1`. Safe today because `plugins/risk/server/ai/legal-moves.js:64` only emits `force: armies - 1`. A future partial-commit bot would surface a client/server force disagreement.
  - Rationale: Spec AC1 doesn't specify how the resolver uses pc.force vs src.armies-1; Dev followed the existing Amendment A.1 contract (which always uses src.armies-1). Reviewer flagged the latent fragility.
  - Severity: minor
  - Forward impact: minor — if a sibling story introduces partial-commit attacks for bots, the resolver must be updated to honor pc.force. Mitigation today is the AC7 greppable test (won't catch this) plus the bot's max-force invariant in legal-moves.

- **Trust model: defender authoritative for dice physics — spec-implicit, code-explicit**
  - Spec source: context-story-CROSS-BUG-3.md, Principle paragraph
  - Spec text: "whichever client renders the dice physics IS the roll. The physics outcome is the truth."
  - Implementation: The resolved-path applier in Risk + the values-bearing path in backgammon's doRoll/doRollInitial accept any well-formed dice values without proof-of-physics. A malicious or buggy client could POST favorable values.
  - Rationale: Spec accepts this explicitly ("physics outcome is the truth"). Gamebox is a local-trust 2-player environment (per memory `project_2p_only.md`); cheating the bot only cheats yourself of fair play.
  - Severity: minor (accepted per spec)
  - Forward impact: none in current single-tenant 2-player model. If gamebox ever expands to multi-tenant competitive contexts, this contract would need a proof-of-physics shape (e.g., commit-reveal scheme).

- **Existing TEA + Dev deviation entries: verified accurate**
  - Walked every entry in `### TEA (test design)` and `### Dev (implementation)` against the code. All 6 entries (TEA) and 10 entries (Dev — 5 test updates + 5 implementation improvements) have accurate spec sources, accurate spec text, accurate implementation descriptions, and reasonable forward-impact assessments. No corrections required.

- No AC deferrals to verify — all 8 ACs reported as DONE in Dev Assessment and confirmed by the spec-check pass.

### Dev (implementation)
- **Improvement** (non-blocking): Resolved AC1's force ambiguity by reading the engine and TEA's question — `pendingCombat.force` is the bot's stated intent; the resolver-applier still uses `src.armies-1` as committed force. Behavior matches the existing Amendment A.1 contract; the client uses pendingCombat.force only to derive attacker die count. Affects `plugins/risk/server/actions.js:applyAttack` (resolved branch derives forceCommitted internally). *Found by Dev during implementation.*
- **Improvement** (non-blocking): Auth model decided as follows. Risk: defender-as-proxy POST passes the engine's "not your turn" gate via an `isResolverPost` exemption in `applyRiskAction`; route-level gate passes naturally because `syncActiveUser` flips `activeUserId` to the defender while pendingCombat is set. Backgammon: `doRoll`/`doRollInitial` accept values-bearing payloads from either the active player (no pendingRoll) or the proxy (pendingRoll set); `deriveActiveUserId` flips to the opposing human while pendingRoll is set. No new action type was introduced — both flows reuse `attack` / `roll` / `roll-initial`. Affects `plugins/risk/server/actions.js`, `plugins/backgammon/server/actions.js`. *Found by Dev during implementation.*
- **Improvement** (non-blocking): Orchestrator's continuation gate now checks pendingCombat / pendingRoll at the top of `_runOnce` (before the active-user check and before the sequence-drain block). The sequence-drain race TEA flagged is avoided because the gate is the first thing the orchestrator does. Affects `src/server/ai/orchestrator.js:_runOnce` lines 89-94. *Found by Dev during implementation.*
- **Question** (non-blocking): The backgammon client's pendingRoll branch (`plugins/backgammon/client/dice.js`) was wired but is not directly covered by a vitest test (no client test files exist for the vanilla-JS backgammon client). The behavior was hand-verified against the renderDice contract; full e2e coverage of the human's resolve POST in backgammon is a gap a follow-up vitest could close. Affects `plugins/backgammon/client/dice.js`. *Found by Dev during implementation.*
- **Improvement** (non-blocking): The Risk `lastCombat.attackerSurvivors` field is now meaningful even when the defender (not the attacker) drove the physics — the same replayAttack helper computes it. No code path needs to special-case "the bot was the attacker" because the bookkeeping is symmetric. Affects `plugins/risk/server/actions.js:applyAttack`. *Found by Dev during implementation.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

No deviations at setup.

### TEA (test design)
- **Updated `test/ai-backgammon-player.test.js` "materializes dice payload from rng" test in-place**
  - Spec source: context-story-CROSS-BUG-3.md, AC4
  - Spec text: "Bot's pre-roll/initial-roll wake-up signals intent to roll (action with no values/throwParams)"
  - Implementation: Replaced the assertion that `r.action.payload.values === [1, 4]` (rng-materialized) with `r.action.payload?.values === undefined` (intent only) and added an rng-call-count spy. Renamed the test to begin with "CROSS-BUG-3 AC4:".
  - Rationale: The existing test pinned the OLD behavior (rng materialization). Story explicitly removes that behavior. TDD says replace the assertion at RED, not at GREEN.
  - Severity: minor
  - Forward impact: none — Dev's implementation will make the updated assertion pass and the previously-passing assertion was already obsolete.

### Dev (implementation)
- **Removed 3 rolled-attack tests from `test/risk-actions-attack.test.js`**
  - Spec source: context-story-CROSS-BUG-3.md, AC2 + brief "Delete the server-resolved rollDice path entirely once tests pass"
  - Spec text: "Existing human-vs-human attack flows unchanged" and "The action handler call site goes away"
  - Implementation: Deleted the "steamroll capture", "repulse retreat", and "last-territory wins" tests. Kept the "end-attack advances to fortify" and "illegal attack rejected" tests. The deleted scenarios are equivalently covered by `risk-actions-attack-resolved.test.js` (capture/repulse via resolved-payload) and `risk-actions-resign.test.js` (natural win via resolved-payload).
  - Rationale: Those 3 tests exercised the server-resolved rollDice call site that's been torn out. The same outcomes are tested via the resolved-payload path with explicit dice values; no behavioral coverage was lost.
  - Severity: minor
  - Forward impact: none
- **Updated 2 backgammon orchestrator tests + 1 backgammon full-leg test to match new contract**
  - Spec source: context-story-CROSS-BUG-3.md, AC4 + AC5
  - Spec text: "Bot's pre-roll/initial-roll wake-up signals intent to roll... Server stores state.pendingRoll"
  - Implementation: `test/ai-orchestrator.test.js` lines 256-267 + lines 410-414 now assert `pendingRoll` is set instead of `initialRoll[botSide]`. `test/ai-backgammon-full-leg.test.js` injects an explicit human-style resolve POST between the first and second orchestrator wake-ups (the test simulated a bot-only full leg that's no longer possible without a resolver).
  - Rationale: Each test was pinning the OLD server-RNG behavior. The new contract requires pendingRoll storage; resolution comes from the human's client.
  - Severity: minor
  - Forward impact: none
- **Rewrote `test/risk-full-game.test.js` to inject a resolveBotCombat helper**
  - Spec source: context-story-CROSS-BUG-3.md, AC2 + brief "rollDice can stay if used by tests"
  - Spec text: "The action handler call site goes away" / "rollDice can stay if used by tests"
  - Implementation: When the loop sees `state.pendingCombat`, it calls `resolveAttack` (from combat.js) with the deterministic seeded rng and POSTs the resolved-payload action as the defender. This stands in for the human's client in a bot-vs-bot simulation.
  - Rationale: Bot-vs-bot full-game test would otherwise stall on the first attack (pendingCombat with no resolver). The brief explicitly permits combat.js:rollDice for test use; this is exactly that use case.
  - Severity: minor
  - Forward impact: none
- **Updated `test/risk-actions-resign.test.js` natural-win test to use resolved-payload path**
  - Spec source: context-story-CROSS-BUG-3.md, AC2
  - Spec text: "Existing human-vs-human attack flows unchanged"
  - Implementation: Replaced the rng-based attack with an explicit resolved-payload (`rounds: [{ aDice: [6,6,6], dDice: [1] }]`) that wipes the defender in one round.
  - Rationale: Old test drove the deprecated rolled path. The natural-win logic still triggers from the resolved-payload applier — same end-state, exercised via the surviving code path.
  - Severity: minor
  - Forward impact: none