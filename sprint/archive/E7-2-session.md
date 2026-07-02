---
story_id: "E7-2"
jira_key: "E7-2"
epic: "E7"
workflow: "tdd"
---
# Story E7-2: Bots roll their own dice (drop the human proxy-roll)

## Story Details
- **ID:** E7-2
- **Jira Key:** E7-2
- **Workflow:** tdd
- **Stack Parent:** none
- **Branch Strategy:** trunk-based (branching skipped — work happens on the default branch)

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-07-02T19:59:13Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-02T15:02:59Z | 2026-07-02T15:05:33Z | 2m 34s |
| red | 2026-07-02T15:05:33Z | 2026-07-02T15:19:44Z | 14m 11s |
| green | 2026-07-02T15:19:44Z | 2026-07-02T19:54:11Z | 4h 34m |
| review | 2026-07-02T19:54:11Z | 2026-07-02T19:59:13Z | 5m 2s |
| finish | 2026-07-02T19:59:13Z | - | - |

## Technical Approach

### Collapsed Mechanic Doctrine
This project follows an established "collapsed-mechanic" doctrine:
- Visible-animation mechanics inline client-side
- Invisible mechanics inline server-side
- Dice rolls are client-side RULES not bot decisions (same pattern as cribbage's auto-cut)

### Design CRUX: Server-Side vs. Client-Side Bot Roll Resolution
Two options under consideration:
- **(A) Server-side auto-resolve (doctrine-aligned, leading approach):** Resolve the bot roll invisibly inside the orchestrator turn. No animation, no client-side intervention. Simplest path, removes the proxy-roll button.
- **(B) Client-side with spectator DiceTray:** Auto-trigger the DiceTray on a spectator client without the manual button for a visible bot die.

**Leading recommendation (per doctrine):** Option (A) server-side auto-resolve is the doctrine-aligned + simplest choice and removes the click. Record this as the leading approach; final confirmation deferred to design/red phase.

## Acceptance Criteria
- A bot's movement roll resolves with NO human action required (no 'Roll for {bot}' click).
- The bot still drives its whole turn in one orchestrator wake-up (turn-continuation contract preserved; gated on activeUserId===bot).
- The human player's own visible dice roll behavior is unchanged.
- The 'Roll for {seat}' proxy-roll UI / values-less clue_roll_request path for bots is removed (or bypassed) so no orphan proxy button remains.

## Sm Assessment

**Routing:** Setup complete → RED phase (TEA / Deep Thought). Phased tdd workflow: setup → red → green → review → finish.

**Confirmed at setup:**
- Session + story/epic context written; ACs and the collapsed-mechanic doctrine captured verbatim.
- Merge gate clear (no open PRs). Trunk-based repo — work happens on `main`, no feature branch.
- Scope is polish/UX-plumbing, not a new deduction rule (consistent with the E7 epic charter).

**The one thing to settle before writing tests (for TEA):** the design CRUX — server-side auto-resolve (A) vs. spectator-visible client die (B). Project doctrine ([[project_dice_client_side]]: invisible mechanics inline server-side; dice are client-side *rules*, not bot decisions) points to **(A)** as doctrine-aligned and simplest. TEA should confirm (A) and write RED tests against the server-side orchestrator bot-turn path, not the client proxy path. If TEA/Dev find a reason (A) breaks spectator visibility expectations, escalate rather than silently choosing (B).

**Key seams TEA should target (from the story):**
- Bot-turn resolution in the orchestrator (must drive the whole turn in one wake-up, gated on `activeUserId===bot` per the turn-continuation contract).
- Removal/bypass of the values-less `clue_roll_request` proxy path + the 'Roll for {seat}' button in `src/clients/clue/ClueApp.tsx` (rollReq/liveRollReq ~85-146, button ~197-206).
- Human's own visible roll must remain unchanged — RED should include a guard test for that.

## TEA Assessment

**Tests Required:** Yes
**Phase:** finish — RED confirmed

**Design decision settled (the CRUX):** Option **(B) client-side auto-roll**. Rationale in Design Deviations. The bot die is a *visible* physics roll (`DiceTray.roll()` in `ClueApp.tsx`), so per the doctrine it stays client-rolled; the shipped `no-server-dice-rng.test.js` invariant forbids the server-side (A) path. (B) removes the click, keeps the invariant green, and touches only the client.

**Test File:**
- `test/client/clue-app-bot-roll.test.tsx` — 4 tests (vitest + @testing-library/react). Mocks `useGameState`, `DiceTray` (ref-handle spy), `Board`, `AiRoster`; drives `clue_roll_request` via the `__lastEventSource` SSE stub.

**Tests Written:** 4 tests covering all 4 ACs. **Status:** RED (3 failing new-behavior, 1 passing guard).

| Test | AC | Status | Why |
|------|----|--------|-----|
| auto-rolls & POSTs bot die, no click | AC1 | **failing (RED)** | today ClueApp renders "Roll for {bot}" and waits for a click — no POST fires |
| no 'Roll for {bot}' proxy button | AC1 | **failing (RED)** | proxy button still renders today |
| human's OWN roll unchanged (guard) | AC3 | passing | existing manual "Roll the die" behavior must survive the refactor |
| auto-roll fires once + prompt self-clears | AC4 / TS#6 | **failing (RED)** | no auto-roll today; also pins no re-fire loop |

**What Dev must implement (GREEN, client-only):** In `src/clients/clue/ClueApp.tsx`, on a live bot `clue_roll_request` (`liveRollReq`), auto-fire `rollAndPost()` instead of rendering the manual "Roll for {bot} 🎲" button; guard against double-fire (idempotent). Leave the human's own-turn roll (`needsRoll` path) exactly as-is. **Do NOT** touch the orchestrator/`clue_roll_request` server path or the dice-RNG invariant.

### Rule Coverage

| Rule (lang-review: typescript.md) | Test | Status |
|------|------|--------|
| #6 React/JSX — `useEffect` re-render / re-fire loop | `auto-roll fires exactly once and the prompt self-clears` | failing (RED) |
| #6 React/JSX — effect must not fire on the wrong path | `human's OWN roll is unchanged — no auto-fire` | passing (guard) |
| #4 null/undefined — `diceRef.current` guarded | covered by DiceTray ref-handle mock + `rolling` guard in `rollAndPost` | n/a |

**Rules checked:** TypeScript checklist #1–#13 reviewed; #6 (React hooks) is the one materially exercised by this change and has failing + guard coverage. Most other checks (enums, generics, input validation, build config) are not applicable to a small client-side effect change.
**Self-check:** every test asserts a meaningful value (roll payload `{type:'roll',payload:{value:4}}`, button absence, call counts) — no vacuous assertions, no `let _ =`, no `as any` in assertions.

**Cross-check — nothing broken:** `test/no-server-dice-rng.test.js`, `test/clue-orchestrator.test.js`, `test/clue-e2e-registration.test.js` all green (16/16) — option (B) is server-untouching.

**Handoff:** To Dev (Trillian) for GREEN.

## Dev Assessment

**Implementation Complete:** Yes — option (B), client-only.

**Files Changed:**
- `src/clients/clue/ClueApp.tsx` — (1) hoisted `liveRollReq` above the `!view` early return; (2) added an auto-roll `useEffect` that fires `rollAndPost()` once when a live bot `clue_roll_request` arrives (idempotent via the `rolling` guard + rollReq self-clear); (3) replaced the manual "Roll for {bot} 🎲" button with a non-interactive "{bot} is rolling… 🎲" caption; (4) refreshed the stale top-of-file proxy-pattern comment. Human's own-turn "Roll the die" button untouched.
- `plugins/clue/client/app.js` (+`.css`, `.map`) — rebuilt bundle (gitignored; not committed).

**Server:** untouched. Orchestrator still broadcasts `clue_roll_request`; `no-server-dice-rng` invariant intact.

**Tests:** GREEN.
- E7-2 suite `test/client/clue-app-bot-roll.test.tsx`: **4/4 passing**.
- Full client suite (vitest): **283/283 passing** (52 files).
- Full server suite (node --test): **1387 passing, 0 failing, 1 pre-existing skip**.
- Compile check: `npm run build:client` succeeds; auto-roll caption verified present in the built clue bundle.

**AC coverage:**
- AC1 (resolves with no human action / no proxy button) — auto-roll effect + button removed ✓
- AC2 (bot completes full turn in one wake-up after rolling) — unchanged server drive path (already covered by `clue-orchestrator.test.js` "numeric pendingRoll DRIVES") ✓
- AC3 (human's own roll unchanged) — `needsRoll` path + "Roll the die" button preserved; guard test passing ✓
- AC4 (no stale/orphan prompt) — tray self-clears on rollReq reset; idempotency test passing ✓

**Branch:** trunk-based — committing to `main`.

**Handoff:** To Reviewer (Arthur Dent) for review.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (303 tests green, 0 smells) | N/A |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — reviewer self-assessed [EDGE] |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — reviewer self-assessed [SILENT] |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings — reviewer self-assessed [TEST] |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings — reviewer self-assessed [DOC] |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings — reviewer self-assessed [TYPE] |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings — reviewer self-assessed [SEC] |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings — reviewer self-assessed [SIMPLE] |
| 9 | reviewer-rule-checker | No | Skipped | disabled | Disabled via settings — reviewer self-assessed [RULE] |

**All received:** Yes (1 enabled subagent returned; 8 disabled via `workflow.reviewer_subagents` and self-assessed by the reviewer)
**Total findings:** 0 confirmed blocking, 0 dismissed, 2 non-blocking notes (1 MEDIUM, 1 LOW pre-existing)

## Reviewer Assessment

**Verdict:** APPROVED

**Scope:** Client-only change — `src/clients/clue/ClueApp.tsx` (57 lines) + new test `test/client/clue-app-bot-roll.test.tsx`. Server untouched. Preflight: 303 tests green (E7-2 4/4, client 283/283, server invariant+clue 16/16), zero smells.

**Data flow traced:** `clue_roll_request` SSE (server) → `onReq` `setRollReq(parsed)` → `liveRollReq` computed → auto-roll `useEffect` fires `rollAndPost()` → `diceRef.roll(1)` physics → `post({type:'roll',payload:{value}})` → server `/api/games/:id/action` applies AS the bot (existing proxy-roll route, `is_bot` gate at `routes.js:277`) → `pendingRoll` set → orchestrator drives the bot's move. **Safe:** the server route still validates seat/phase/value and the `is_bot` gate means a human can never roll for another human — the client change only removes the manual click, the server contract is unchanged.

**Observations (8):**
1. `[VERIFIED]` Auto-roll idempotency — effect deps `[liveRollReq]`; `liveRollReq` is a stable ref (`rollReq` object or `null`), and `rollAndPost` self-clears `rollReq` + guards on `rolling`, so it fires exactly once per request. Evidence: `ClueApp.tsx:107-127`, `137-149`. Complies with typescript.md #6 (no re-fire loop). Confirmed by the idempotency test.
2. `[RULE][VERIFIED]` Correctly EXCLUDES `rollAndPost` from the effect deps — including it (new fn identity each render) would re-fire every render and break idempotency. The `[liveRollReq]`-only dep is the correct decision, not a missing-dep defect. typescript.md #6 compliant.
3. `[TYPE][VERIFIED]` Type-safety IMPROVED — old `name(liveRollReq!.seat)` non-null assertion replaced by `liveRollReq.seat` guarded by `liveRollReq != null &&` (`ClueApp.tsx:218-220`). No `as any`/`@ts-ignore`/`!` introduced (preflight: 0). typescript.md #1, #4 compliant.
4. `[VERIFIED]` Human's own roll untouched (AC3) — `needsRoll` renders the manual "Roll the die" button; the auto-roll effect only fires for `liveRollReq` which requires `activeUserId !== ctx.userId`, mutually exclusive with `needsRoll` (`activeUserId === ctx.userId`). Guard test passing. Evidence: `ClueApp.tsx:146,214-224`.
5. `[SEC][VERIFIED]` No new attack surface — server route + `is_bot` gate unchanged; client cannot roll for a human seat (server-enforced). `no-server-dice-rng` invariant + clue-orchestrator tests green. Doctrine-compliant.
6. `[DOC][VERIFIED]` Comments accurate — the stale top-of-file "backgammon proxy pattern" comment was updated to describe auto-resolve; the effect carries a correct single-fire rationale. No stale/misleading docs (preflight: 0 commented-out code).
7. `[EDGE][MEDIUM]` Multi-human duplicate auto-roll — in a hypothetical 3P+ game with ≥2 humans, every human client auto-rolls and races; the engine rejects late/duplicate rolls and `rollAndPost`'s `catch` swallows the rejection. Benign, and identical tolerance to the pre-existing manual-button path ("any human participant may resolve it"). Clue is 2P (one human vs bot) in practice — no real-world impact. NOT blocking.
8. `[SILENT][SIMPLE][LOW]` Pre-existing `catch {}` in `rollAndPost` (`ClueApp.tsx:143`) swallows roll/POST errors with a resync comment — unchanged by this diff; acceptable for a client dice roll (a failed POST leaves `pendingRoll` unset and a reconnect nudge re-emits `clue_roll_request`, so the auto-roll retries — same recovery profile as the old manual button). No over-engineering; the status-caption addition is justified UX parity. NOT blocking.

### Rule Compliance (typescript.md lang-review)
- **#1 type-safety escapes:** compliant — a non-null assertion was REMOVED; none added. ✓
- **#4 null/undefined:** compliant — `!= null` / `== null` used throughout, no `||`-on-nullable. ✓
- **#6 React/JSX hooks:** compliant — effect has a dep array; `[liveRollReq]` is a stable ref (not an object literal), so no infinite loop; `rollAndPost` correctly omitted to preserve single-fire; hook placed before the early return (rules-of-hooks intact). ✓
- **#8 test quality:** compliant — every test asserts a meaningful value (roll payload, button absence, call counts); no vacuous assertions (preflight: 0 `as any` in tests). ✓
- Other checks (#2 generics, #3 enums, #5 modules, #7 async, #9 build, #10 input-validation, #11 error-handling, #12 perf, #13 fix-regressions): not materially exercised by a small client effect change.

### Devil's Advocate
Suppose I try to break this. **Attack 1 — double POST:** force a re-render mid-roll. `setRolling(true)` re-renders, but `liveRollReq` keeps the same `rollReq` reference, so the effect's dep is unchanged and it does not re-run; a fresh `clue_roll_request` would change `rollReq`, but then `rollAndPost`'s `if (rolling) return` guard and the engine's duplicate-roll rejection both fire. No double application. **Attack 2 — null deref:** the effect fires but `diceRef.current` is null. Can't happen: `liveRollReq != null` ⇒ `showTray` true ⇒ `DiceTray` mounts and sets the ref during commit, before the parent's passive effect runs; and even if it threw, `rollAndPost`'s try/catch swallows it and `finally` clears `rollReq`. **Attack 3 — stuck bot:** a POST fails, `rollReq` is cleared, `pendingRoll` never set — is the bot wedged forever? No: the same failure existed for the manual button (which also cleared `rollReq` in `finally`), and recovery is by SSE re-subscribe re-emitting `clue_roll_request`. Not a regression. **Attack 4 — confused user:** a human sees the bot's dice tray animate with "{bot} is rolling…" and no button — clear, non-interactive (`role="status"`), and it self-clears when the die lands. **Attack 5 — throttled tab:** a backgrounded tab delays the effect, delaying the bot's roll — a known limitation TEA flagged (needs a live client), strictly better than the old requirement of a manual click. **Attack 6 — multi-human race:** covered in observation 7, benign. Nothing here rises to Critical/High: the server contract, the invariant, and the human path are all untouched, and the new effect is idempotent and fail-safe.

**Handoff:** To SM (Slartibartfast) for finish-story.

## Delivery Findings

No upstream findings at setup.

<!-- TEA findings below -->
### TEA (test design)
- **Conflict** (non-blocking): the story + SM assessment leaned toward option (A) server-side auto-resolve, but (A) collides with a shipped, currently-GREEN architectural invariant. Affects `test/no-server-dice-rng.test.js` (its AC7 assertions explicitly forbid `Math.floor(rng()*6)` in `src/server/ai/orchestrator.js` AND forbid the clue bot path from materialising a die value). (A) cannot be implemented without deleting/amending those assertions. Resolved for RED by choosing (B) client-side auto-roll, which keeps the invariant green and breaks no existing tests. *Found by TEA during test design.*
- **Question** (non-blocking): option (B) removes the human *click* but still needs a live human client (tab open) to physically roll the bot's die. True headless autonomy (bot rolls with NO human present) is only achievable via (A), which requires amending the dice-RNG invariant. If the user wants headless autonomy, that is a follow-up decision, not this story. Affects `src/clients/clue/ClueApp.tsx` (the auto-roll effect) — no change needed for (B), flagged for product confirmation. *Found by TEA during test design.*

### Dev (implementation)
- **Improvement** (non-blocking): this is a client `.tsx` change; the shipped bundle `plugins/clue/client/app.js` is gitignored and must be rebuilt (`npm run build:client`) + the server restarted for it to take effect on stage/prod. Rebuilt locally during GREEN. Affects deploy of `src/clients/clue/ClueApp.tsx`. *Found by Dev during implementation.*
- No other upstream findings during implementation. TEA's option-(A) conflict and the "needs a live client" nuance stand as recorded; implementation confirmed both (server untouched; auto-roll runs on the viewing client).

### Reviewer (code review)
- **Improvement** (non-blocking): in a 3P+ clue game with ≥2 humans, all human clients auto-roll and race on a bot's `clue_roll_request` (engine dedupes; benign). If seat-count ever grows past 2P for clue, consider a designated-roller rule (e.g., lowest-seat human) to avoid redundant POSTs. Affects `src/clients/clue/ClueApp.tsx` (auto-roll effect). Not needed while clue is 2P. *Found by Reviewer during code review.*
- No blocking upstream findings during code review.

## Design Deviations

### TEA (test design)
- **Chose option (B) client-side auto-roll instead of the story's leaning toward (A) server-side auto-resolve**
  - Spec source: session `## Sm Assessment` (leading approach (A)); context-story-E7-2.md ("Server-side auto-resolve is simplest")
  - Spec text: "Option (A) server-side auto-resolve is the doctrine-aligned + simplest choice… Record this as the leading approach"
  - Implementation: RED tests target the CLIENT (`src/clients/clue/ClueApp.tsx`) auto-firing the roll on `clue_roll_request`, not the server orchestrator. Server bot-turn path is left unchanged.
  - Rationale: (A) as written breaks the shipped, green `test/no-server-dice-rng.test.js` invariant (dice values never from a server rng, including the clue bot path). The precise doctrine ([[project_dice_client_side]]) is that *visible-animation* mechanics stay client-side; the clue bot die IS a visible physics roll (`DiceTray.roll()` in ClueApp), so (B) is the doctrine-aligned reading. (B) removes the click (the actual playtest complaint), keeps the invariant green, and breaks zero existing tests. Escalated to the user via AskUserQuestion (no response — away); proceeded with the reversible, lower-blast-radius choice per SM's "escalate rather than silently choose (B)" — I escalated, then chose (B) as the safe default.
  - Severity: major
  - Forward impact: Dev implements a client-only change (auto-roll effect + remove the manual "Roll for {bot}" button). Server orchestrator/`clue_roll_request` flow is untouched. If the user later wants headless autonomy, that is a separate story that must amend the dice-RNG invariant.

### Dev (implementation)
- **Replaced the bot's manual "Roll for {bot} 🎲" button with a non-interactive "{bot} is rolling… 🎲" status caption (not required by any test)**
  - Spec source: `test/client/clue-app-bot-roll.test.tsx`, AC1 test ("no 'Roll for {bot}' proxy button")
  - Spec text: the test only asserts `queryByRole("button", { name: /Roll for/i })` is null — it does not require any replacement element.
  - Implementation: while the bot's die auto-rolls the tray shows a `<span role="status">{name} is rolling… 🎲</span>` instead of a bare, unlabeled dice tray.
  - Rationale: UX parity — the removed button was the only thing giving the tray context; replacing it with a caption avoids a silent unlabeled tray. It is a `<span>`, not a `<button>`, so it satisfies the "no proxy button" assertion and adds no interactive surface.
  - Severity: minor
  - Forward impact: none — purely cosmetic; no new action, no state, no server contract change.
- **Hoisted the `liveRollReq` computation above the `if (!view) return` early return**
  - Spec source: `test/client/clue-app-bot-roll.test.tsx` (auto-roll effect must run every render)
  - Spec text: n/a (implementation mechanics)
  - Implementation: moved the existing `liveRollReq` const from below the early return to above it (adding a `view != null` guard), so the new auto-roll `useEffect` can depend on it without violating React's rules-of-hooks (all hooks before any conditional return).
  - Rationale: `useEffect` cannot run after a conditional return; keying it on `liveRollReq` requires that value to be in scope before the return. `rollAndPost` is a hoisted function declaration, so the effect can call it.
  - Severity: minor
  - Forward impact: none — same value, same JSX consumer; no behavior change to the human path.

### Reviewer (audit)
- **TEA — Chose option (B) client-side auto-roll over (A)** → ✓ ACCEPTED by Reviewer: correct call. (A) demonstrably breaks the shipped, green `no-server-dice-rng.test.js` invariant; (B) is doctrine-aligned (visible die → client), removes the click, and touches only the client. The user confirmed the direction by pushing and invoking `/pf-dev` on (B).
- **Dev — Manual button → non-interactive "{bot} is rolling…" status caption** → ✓ ACCEPTED by Reviewer: justified UX parity; a `<span role="status">`, not a button, so it satisfies the "no proxy button" assertion and adds no interactive surface. Cosmetic, zero forward impact.
- **Dev — Hoisted `liveRollReq` above the early return** → ✓ ACCEPTED by Reviewer: required by rules-of-hooks (the auto-roll `useEffect` must precede the `!view` return); the added `view != null` guard is correct and the JSX consumer is unchanged. Verified no null-view dereference.
- No undocumented deviations found — the diff matches the logged deviations exactly.