---
story_id: "E4-4"
jira_key: ""
epic: "E4"
workflow: "tdd"
---
# Story E4-4: Persona overlay picks arbitrary session in multi-bot game

## Story Details
- **ID:** E4-4
- **Jira Key:** (none)
- **Workflow:** tdd
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-06-21T15:39:12Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-06-21T15:20:44.911826Z | 2026-06-21T15:22:29Z | 1m 44s |
| red | 2026-06-21T15:22:29Z | 2026-06-21T15:32:42Z | 10m 13s |
| green | 2026-06-21T15:32:42Z | 2026-06-21T15:35:10Z | 2m 28s |
| review | 2026-06-21T15:35:10Z | 2026-06-21T15:39:12Z | 4m 2s |
| finish | 2026-06-21T15:39:12Z | - | - |

## Sm Assessment

**Story:** E4-4 — Persona overlay picks arbitrary session in multi-bot game (bug, 2pt, tdd, repo g-1, trunk-based on `main`, no Jira).

**Why now:** Unblocked by E4-2 (reconciled to done, PR #79). A latent 2P-shaped assumption in the now-N-bot world — currently harmless (only consumed behind the `d === 2` Risk overlay gate) but a correctness landmine as multi-bot UI surfaces grow.

**The defect (per story context):** `src/server/plugin-clients.js:59` runs `SELECT persona_id FROM ai_sessions WHERE game_id = ?` with a bare `.get()`, so in a multi-bot game it returns whichever row sqlite hands back first. The persona lookup must be seat/bot-scoped — resolve the persona for the specific opponent seat being rendered.

**Acceptance criteria:**
- The persona overlay resolves the persona for the specific opponent seat, not an arbitrary session.
- A test with two bot sessions in one game asserts the correct persona is returned per seat.

**Routing:** TDD/phased → handing to TEA (Amos Burton) for RED. Write a failing test that stands up two bot sessions in one game and asserts the per-seat persona resolution before any implementation. Implementation approach is TEA/Dev's call — I'm not prescribing the query shape.

**No upstream blockers.** Branch not required (trunk-based config).

## TEA Assessment

**Tests Required:** Yes
**Reason:** Behavioral bug with an observable contract — the injected `window.__GAME__` overlay fields. A regression test is the only durable way to lock seat-scoped resolution.

**Test Files:**
- `test/risk-multibot-client-ctx.test.js` — added test `legacy opponent overlay resolves the rendered opponent seat, not an arbitrary session`

**Tests Written:** 1 test covering both ACs (overlay resolves the specific opponent seat; two bot sessions in one game, correct persona per seat).
**Status:** RED (failing — ready for Dev)

**RED evidence:** `node --test test/risk-multibot-client-ctx.test.js` → 1 pass, 1 fail. The new test fails with `'alpha' !== 'bravo'`: `ctx.opponentPersonaId` resolves to the decoy session (`alpha`) the DB returns first, not the rendered opponent seat (`bravo`). The pre-existing roster test still passes (no regression).

**Why the construction is deliberate:** Through the `/api/games` route, `ai_sessions` insert order == seat order == the lowest row a bare `.get()` returns, so the bug is *dormant* for a normal human-creator view — the arbitrary pick coincidentally equals the real opponent. The test re-seeds `ai_sessions` so the decoy bot owns both the lowest rowid AND the lowest `bot_user_id`, defeating either index plan the SQLite planner might choose. That is the genuine "arbitrary session" condition the story describes.

### Rule Coverage

| Rule | Test(s) | Status |
|------|---------|--------|
| #8 test-quality (meaningful, non-vacuous assertions) | exact-value `assert.equal`/`assert.notEqual` on `opponentPersonaId` & `opponentFriendlyName`; no `.only`/`.skip`; no truthy-only checks | self-checked, passing intent |

**Rules checked:** Of the 13 JS lang-review checks, #8 (test quality) is the one that governs TEA's own output. Checks #1–#7, #9–#13 target Dev's implementation diff and apply at the green/verify gate.
**Self-check:** 0 vacuous assertions — every assertion verifies a concrete expected value.

**The defect:** `src/server/plugin-clients.js:67` — `SELECT persona_id FROM ai_sessions WHERE game_id = ?`.get() drives the legacy `opponent*` overlay fields off an arbitrary row. The `opponent` already carries the correct seat-scoped `personaId` from the `sessionPersona` map (line 59); the overlay should resolve from the rendered opponent's seat/bot identity. Implementation approach is Dev's call.

**Handoff:** To Dev (Naomi Nagata) for GREEN.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `src/server/plugin-clients.js` — the legacy single-opponent overlay now resolves from the rendered opponent's seat-scoped `opponent.personaId` (already built from the `sessionPersona` map) instead of a bare `SELECT … ai_sessions … .get()`. The arbitrary-row query is removed entirely.

**Approach:** Minimal fix. `opponent.personaId` is already correct per seat (line 59), so the overlay reuses it and drops the redundant DB read. Added an `opponent.personaId` guard so a bot seat with no session yields a null overlay rather than a lookup on `undefined`.

**Tests:** GREEN — `node --test test/risk-multibot-client-ctx.test.js test/cribbage-ai-client-ctx.test.js test/client-serving.test.js` → 8/8 pass. The new seat-resolution test passes; the 2P overlay test (`bot opponent ctx uses persona displayName/color/glyph`) still passes — no regression on the shipped 2P path.

**Branch:** main (trunk-based; pushed)

**Handoff:** To Reviewer (Chrisjen Avasarala) for code review.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A — 8/8 tests green, no linter configured, 0 smells, tree clean |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings — domain self-assessed |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings — domain self-assessed |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings — domain self-assessed |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings — domain self-assessed |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings — domain self-assessed |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings — domain self-assessed |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings — domain self-assessed |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings — domain self-assessed |

**All received:** Yes (1 enabled returned; 8 disabled via `workflow.reviewer_subagents` and pre-filled)
**Total findings:** 0 confirmed, 0 dismissed, 0 deferred

## Reviewer Assessment

**Verdict:** APPROVED

A 4-line logic change plus a regression test. I went looking for the flaw and found a clean, *narrowing* fix that removes a query rather than adding one. Preflight green (8/8), no linter configured, zero smells, tree clean. The other 8 specialists are disabled via `workflow.reviewer_subagents`; I assessed each domain myself and tagged the observations below.

**Data flow traced:** `req.game.id` + `req.user.id` → `players[]` (each bot seat's `personaId` resolved from the `sessionPersona` map built via `.all()` over the game's `ai_sessions`, lines 46–59) → `opponent` = first non-viewer player (line 63) → `personaOverlay = ai.personas.get(opponent.personaId)` (line 70) → `ctx.opponent*` fields (lines 82–85) → injected into `window.__GAME__`. The overlay is now keyed off the specific opponent seat's already-resolved persona, not a bare row scan. Safe: `opponent.personaId` is server-derived from the game's own sessions; no client input reaches the Map lookup.

**Observations (≥5):**
- [VERIFIED] Fix resolves the overlay from `opponent.personaId` (seat-scoped, line 59) instead of `SELECT … ai_sessions … .get()`. Evidence: `src/server/plugin-clients.js:68-71`. Behaviorally identical on the 2P path (single session ⇒ `.get()` == that bot's persona), confirmed by the still-passing `bot opponent ctx uses persona displayName/color/glyph` test.
- [EDGE] (self-assessed; specialist disabled) [VERIFIED] All branches guarded: `ai` null, `opponent` null, non-bot opponent, and bot-with-no-session (`opponent.personaId === null`) all fall through to `personaOverlay = null`. The added `&& opponent.personaId` guard is correct — `persona_id` is `TEXT NOT NULL` (db.js:54), so `opponent.personaId` is a non-empty string or null; no empty-string trap.
- [SIMPLE] (self-assessed; specialist disabled) [VERIFIED] Net simplification — one DB round-trip removed, computed data reused; `db` still used at lines 44/47, no dead code. The simpler alternative, not over-engineering.
- [SEC] (self-assessed; specialist disabled) [VERIFIED] Removing the query reduces surface; the removed query was already parameterized. Access control unchanged — the per-plugin membership middleware (lines 12–23) still gates `/play/:gameId`. No injection, no secret leakage; `personaId` is server-side.
- [TEST] (self-assessed; specialist disabled) [VERIFIED] The new test asserts on observable ctx fields (behavioral, not implementation-coupled), with exact-value assertions and an explicit anti-decoy `notEqual`. Genuine regression guard: passes under the fix regardless of row order, fails under the bug. No `.only`/`.skip`, no vacuous truthy checks (JS rule #8 satisfied).
- [TYPE] (self-assessed; specialist disabled) [VERIFIED] `opponent.personaId` is `string|null`, consistent with the `players[]` shape (line 59). No new stringly-typed surface; `ai.personas` is a Map accessed via `.get`.
- [DOC] (self-assessed; specialist disabled) [VERIFIED] Added comment (lines 65–67) accurately states intent; the pre-existing "Legacy single-opponent fields for 2P clients" comment remains accurate. No stale/misleading docs.
- [SILENT] (self-assessed; specialist disabled) [VERIFIED] `ai.personas?.get(...) ?? null` is a deliberate "no persona ⇒ plain name" fallback (display degrades to `opponent.friendlyName ?? 'Opponent'` at line 82), not a swallowed error. No empty catches introduced.
- [RULE] (self-assessed; specialist disabled) [VERIFIED] JS lang-review checks #1–#13 scanned against the hunk: no silent errors, no async pitfalls, no prototype pollution (Map.get on a server-derived key), strict guards, no SQL added, test quality satisfied (#8). Only borderline is #4 (truthy check on a string) — safe here per the NOT NULL constraint.

**Pattern observed:** Reuse already-computed state instead of re-querying — the module builds `sessionPersona`/`players` once per request; the fix aligns the overlay with that single source of truth (`src/server/plugin-clients.js:46-59`).

**Error handling:** Failure modes degrade gracefully — missing ai subsystem, missing persona, or sessionless bot all yield `personaOverlay = null`, and ctx falls back to the plain opponent name/glyph/color. No throw paths added.

### Devil's Advocate

Suppose I'm a malicious or confused user — can I make the overlay lie or crash? The overlay key, `opponent.personaId`, is derived entirely server-side from `ai_sessions` rows the server itself wrote at game creation; a client cannot inject a persona id into this path, so Map-key prototype pollution (`__proto__`, `constructor`) is off the table — and `Map.prototype.get` is immune regardless. Could I force `opponent` to be a human while still triggering the overlay? No: the `opponent.isBot` guard short-circuits before `personaId` is read. Could `opponent.personaId` be falsy-but-valid (`0`, `""`)? The `persona_id` column is `TEXT NOT NULL`, and `sessionPersona.get()` returns either that string or `undefined`→`null`; there is no `0`/`""` case, so `&& opponent.personaId` cannot wrongly suppress a real persona. What about a stressed/odd DB state — two bots, one session deleted mid-game? The old code would grab whichever surviving session `.get()` returned (possibly the wrong bot); the new code returns null for a sessionless opponent, which is safer, not worse. A persona file deleted at runtime so `ai.personas.get(id)` misses? `?? null` handles it and display falls back to the bot's friendly name. Race conditions: this is a synchronous read inside one request handler; no shared mutable state is touched. Huge inputs: N players only lengthen the `players` array; `find` is O(n) bounded by seat count. The one thing a confused *developer* might misread is that this overlay is still gated to the 2P client (`d === 2`) downstream — so in today's shipped UI the change is invisible; that is a latent-correctness fix, not a user-visible one, already recorded in the session findings. I could not find a break.

**Behavioral note (edge case):** For a bot opponent with no `ai_sessions` row, the old code could surface *some other* bot's persona (or null); the new code yields null — strictly more aligned with the AC. Logged in the deviation audit as an accepted, previously-undocumented refinement.

**Handoff:** To SM (Camina Drummer) for finish-story.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

No upstream findings

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Gap** (non-blocking): the legacy `opponent*` overlay is currently consumed only behind the Risk `d === 2` client gate, so this fix is forward-looking hardening — it becomes user-visible only if/when the overlay is surfaced in N>2 client paths. Affects `src/server/plugin-clients.js` and `plugins/risk/client/` (no client change required for this story). *Found by TEA during test design.*
- **Improvement** (non-blocking): the full suite shows ~19 pre-existing failures in unrelated files (EventSource, backgammon-render-dice, card-rules, combat-rules) on `main`, independent of E4-4. Affects those test files (need separate triage). *Found by TEA during test design.*

### Dev (implementation)
- No upstream findings during implementation.

### Reviewer (code review)
- No upstream findings during code review. I concur with TEA's two recorded non-blocking findings (overlay still `d === 2`-gated; ~19 unrelated pre-existing suite failures) and add nothing new.

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- No deviations from spec. The test covers both ACs faithfully (overlay resolves the specific opponent seat; two bot sessions in one game). The deterministic re-seed of `ai_sessions` is the setup required to expose an otherwise-dormant bug, not a departure from the specified behavior.

### Dev (implementation)
- No deviations from spec. Implemented seat-scoped overlay resolution exactly as the ACs and TEA's test require; no data-structure or algorithm changes.

### Reviewer (audit)
- TEA "No deviations from spec." → ✓ ACCEPTED by Reviewer: the `ai_sessions` re-seed is test setup to expose a dormant bug, not a spec departure; both ACs are covered faithfully.
- Dev "No deviations from spec." → ✓ ACCEPTED by Reviewer: implementation matches the AC and TEA's test; no structural or algorithmic divergence.
- **Sessionless-bot overlay now yields null:** Spec said resolve the persona "not [from] an arbitrary session"; the code additionally returns null when the specific opponent bot has no session (the old code could surface an unrelated bot's persona). Not logged by Dev. Severity: Low — strictly more spec-aligned; ACCEPTED, no action required.