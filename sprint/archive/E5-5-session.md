---
story_id: "E5-5"
jira_key: ""
epic: "E5"
workflow: "trivial"
---
# Story E5-5: Talk-smack discoverability + chat presentation

## Story Details
- **ID:** E5-5
- **Jira Key:** (none — kanban project)
- **Workflow:** trivial
- **Stack Parent:** none
- **Repos:** g-1 (standalone)
- **Base Branch:** main

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-07-01T10:54:15Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-01T10:37:26Z | 2026-07-01T10:38:58Z | 1m 32s |
| implement | 2026-07-01T10:38:58Z | 2026-07-01T10:49:29Z | 10m 31s |
| review | 2026-07-01T10:49:29Z | 2026-07-01T10:54:15Z | 4m 46s |
| finish | 2026-07-01T10:54:15Z | - | - |

## Story Summary
Client-only, contained to `src/clients/shared/AiRoster.tsx` + `src/clients/shared/OpponentCard.css`. Make the smack-talk chat input discoverable (visible label/button, not just placeholder) and make the exchange more legible (persistent recent-message log instead of 4-5s auto-hide bubbles). No SSE/server changes. Build with `npm run build:client` + restart before "done".

## Branch Strategy
**Trunk-based workflow** — repo g-1 uses trunk-based development. Feature branch creation is skipped; work happens directly on the default branch `main`.

## Sm Assessment

**Setup phase complete. Routing to Dev (Trillian) for the implement phase.**

- **Story:** E5-5 — Talk-smack discoverability + chat presentation. 2pt, p3, `trivial` (phased) workflow.
- **Context:** Already authored by Architect (Naomi Nagata, design mode) 2026-06-30 at `sprint/context/context-story-E5-5.md` — thorough, with a clear technical approach and three acceptance criteria. Reused, not regenerated.
- **Scope:** Client-only, contained to `src/clients/shared/AiRoster.tsx` + `src/clients/shared/OpponentCard.css`. No SSE-protocol or server changes. Two goals: (1) make the smack-talk chat input discoverable (visible label/button, not just a placeholder), (2) make the exchange legible past the current 4–5s auto-hide (persistent recent-message log / longer-lived bubbles).
- **Out of scope:** SSE event protocol, `/chat` endpoint, bot banter generation, server-side chat persistence, and the E5-4 portrait-overlap fix (same component — coordinate if co-scheduled).
- **Merge gate:** Clear — no open PRs.
- **Branch:** Trunk-based (repo g-1); work proceeds on `main`, no feature branch.
- **Jira:** Not configured (kanban project); claim step correctly skipped.
- **Reminder for Dev:** client bundles are gitignored — a `.tsx` change is inert until `npm run build:client` + server restart. Don't mark done without rebuilding.

## Dev Assessment

**Implementation Complete:** Yes

**Files Changed:**
- `src/clients/shared/AiRoster.tsx` — persistent chat log state (`log`/`pushLog`, capped at 8, autoscrolled); `onBanter` and `onUserChat` now mirror into the log; render a labelled fixed `.opp-card__chatbox` (heading + log + input + visible **Send** button); `myFlash` repurposed to the send-failure status line.
- `src/clients/shared/OpponentCard.css` — new `.opp-card__chatbox` / `.opp-card__chat-title` / `.opp-card__log*` / `.opp-card__chat-send` / `.opp-card__chat-status` styles; `.opp-card__chat` is now a flex row; removed the dead `.opp-card__my-bubble` rules.
- `test/client/AiRoster.test.tsx` — 3 new tests: visible Send button (AC-1), banter mirrored into a persistent log distinct from the auto-hiding bubble (AC-2), player's echoed message logged (AC-2).

**Acceptance Criteria:**
1. **Discoverable input** — ✅ labelled fixed panel + visible Send button (was placeholder-only + hidden submit).
2. **Legible exchange** — ✅ persistent last-8 scrollback outlives the 4–5s auto-hide; mirrors both player and bot.
3. **No protocol regression** — ✅ still POSTs per-bot to `/api/games/:id/chat`; `banter`/`user_chat` SSE still render; existing chat/bubble tests green.

**Tests:** 271/271 client tests passing (GREEN), incl. 3 new. `npm run build:client` succeeds for all three plugins (risk bundle includes AiRoster).

**Branch:** trunk-based on `main`; committed as `7a5e467` (not yet pushed — held for review/finish).

**Build/Deploy note:** client bundles are gitignored and rebuilt; the change is live locally after `build:client`, but a **prod restart** (`launchctl kickstart -k …`) is still required to serve it on words.slabgorb.com — deferred to the deploy/finish step, not done in the implement phase.

**Handoff:** To review (Reviewer — Arthur Dent).

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (271/271 green, build clean, 0 smells) | N/A |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings — edge analysis done by Reviewer |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings — silent-failure analysis done by Reviewer |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings — test analysis done by Reviewer |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings — comment analysis done by Reviewer |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings — type analysis done by Reviewer |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings — security analysis done by Reviewer |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings — simplicity analysis done by Reviewer |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings — TS lang-review enumerated by Reviewer |

**All received:** Yes (1 enabled subagent returned; 8 disabled via `workflow.reviewer_subagents` and assessed directly by Reviewer)
**Total findings:** 0 confirmed blocking; 4 low-severity observations (all non-blocking); 0 dismissed; 0 deferred

## Reviewer Assessment

**Verdict:** APPROVED

Client-only React/CSS polish (E5-5). Small, contained, well-tested diff. No Critical/High issues. Preflight GREEN (271/271 tests, all three client bundles build). The 8 thematic subagents are disabled via settings, so I performed each of their domains myself; findings tagged by domain below.

**Data flow traced:** player types in `.opp-card__chat input` → `onChatSubmit` → per-bot `POST /api/games/:id/chat` (unchanged) → server echoes SSE `user_chat` → `onUserChat` → `pushLog({author:"You"})`; bot `banter` SSE → `onBanter` → per-card bubble + `pushLog({kind:"bot"})` → `.opp-card__log` renders, `useEffect([log])` pins scroll to bottom. Safe because no new endpoints, no new sinks; text flows through React children (auto-escaped) — evidence: `AiRoster.tsx:237` renders `{e.author}: {e.text}` as escaped children.

**Pattern observed:** the log line renders author+text as a *single combined text node* (`{e.author}: {e.text}`) rather than isolating the message in its own element — `AiRoster.tsx:237`. This is a deliberate, correct choice that keeps `getByText("boom")` uniquely matching the live bubble and preserves `.opp-card__bubble` count invariants in the existing banter tests (`AiRoster.test.tsx:34-40, 81-90`). The new test at `AiRoster.test.tsx:113` explicitly guards it.

**Error handling:** the send-failure path is preserved — `onChatSubmit` still sets `myFlash` on a failed broadcast, now surfaced via `.opp-card__chat-status` (`AiRoster.tsx:242`). `myFlash`/`flashTimer` are NOT dead code (preflight confirmed) — still wired to the failure branch. The autoscroll effect no-ops safely when the ref is null.

### Domain analysis (subagents disabled — performed by Reviewer)

- `[EDGE]` **LOW** — `pushLog` in `onBanter` (`AiRoster.tsx:78`) does not gate on `knownPersonas` the way `patch` does (`AiRoster.tsx:37`). A `banter` event for a persona not in `bots` would add a log line with no matching bubble. Negligible in practice: banter is server-emitted only for seated bots. Non-blocking.
- `[EDGE]` `[VERIFIED]` empty/oversized input handled — `onChatSubmit` trims and early-returns on empty (unchanged `AiRoster.tsx`), input `maxLength={200}`, and `pushLog` bounds the log via `.slice(-MAX_LOG)` (`AiRoster.tsx:64`). No unbounded growth.
- `[SILENT]` `[VERIFIED]` no swallowed errors introduced — the only new control flow is `pushLog` (pure state append) and an autoscroll effect; the deliberate `if (el) …` no-op on a null ref is intended, not a silenced failure. Send failures still surface to the user.
- `[TEST]` **LOW** — 3 new tests cover AC-1 (visible Send button) and AC-2 (bot banter mirrored into a persistent log distinct from the bubble; player echo logged) — `AiRoster.test.tsx:102-127`. Gap: no test asserting the log *outlives* the 5s bubble timer; persistence is structural (the log has no hide timer) so this is acceptable for a trivial story. Non-blocking.
- `[DOC]` `[VERIFIED]` the three added comments (`AiRoster.tsx:30, 63, 79`) accurately describe intent (per-render meta map, persistent scrollback, scroll-pinning). No stale/misleading docs.
- `[TYPE]` `[VERIFIED]` `LogEntry` is fully typed; `botMeta` is `Record<string, {name; color?}>` (not `any`); null-coalescing uses `??` correctly (`meta?.name ?? d.displayName ?? "AI"`, `meta?.color ?? null`) — no `||`-on-falsy bug. No `as any`, no `@ts-ignore`, no unsafe non-null assertions in the diff.
- `[SEC]` `[VERIFIED]` no XSS surface — no `dangerouslySetInnerHTML`; message text is escaped React children; the only server-derived style value is `borderLeftColor: e.color` applied via CSSOM (`AiRoster.tsx:233`), which cannot break out to other properties or execute script — an invalid color is silently ignored. `e.color` originates from server-set `BotSeat.color`.
- `[SIMPLE]` `[VERIFIED]` proportionate change; dead `.opp-card__my-bubble` CSS removed with its last usage (`OpponentCard.css`). No over-engineering — a plain `useState<LogEntry[]>` capped at 8, no external chat subsystem (matches scope).
- `[RULE]` `[VERIFIED]` TS lang-review checklist enumerated (see below).

### Rule Compliance (`.pennyfarthing/gates/lang-review/typescript.md`)

- **#1 Type-safety escapes** — compliant: diff introduces no `as any`, `as unknown as T`, `@ts-ignore`, or risky `!`. Pre-existing `(ev as MessageEvent)` casts unchanged.
- **#4 Null/undefined** — compliant: `??` used for all defaulting (`AiRoster.tsx:80-82, 84`); no `||`-on-falsy. `style={e.color ? … : undefined}` guards optional color.
- **#6 React/JSX** — compliant: new `useEffect` has a correct `[log]` dependency (not an object literal); `key={e.id}` uses a stable monotonic id, **not** `key={index}` (the check the rule flags); no `dangerouslySetInnerHTML`; SSE listeners are cleaned up on unmount so no post-unmount setState. One LOW note: `logSeq.current++` mutates a ref *inside* the `setLog` updater — harmless for uniqueness, but impure (StrictMode double-invoke could skip ids). Not a checklist violation.
- **#8 Test quality** — compliant: new tests assert real DOM/behavior, no `as any`, no vacuous assertions, no `.only`/`.skip`.
- **#10 Security type-validation** — unchanged: chat input remains a plain `string` POSTed as JSON (pre-existing pattern); no new validated-type requirement introduced by this diff.
- **#3/#5/#7/#9/#11/#12** — not materially touched by this diff.

### Devil's Advocate

Suppose this code is broken. The most plausible attack on it is the always-on fixed panel: `.opp-card__chatbox` is `position: fixed; bottom-left; z-index: 90`, permanently occupying the lower-left corner regardless of game phase. A confused player mid-battle could find it covers board affordances — but I verified nothing else in the client CSS is fixed to bottom-left (only `.opp-card` is fixed, and it's bottom-right), so there is no *stacking* collision on desktop; the risk is screen real-estate, not a functional break. On very narrow viewports (<~330px) the `min(240px, calc(100vw-24px))` width plus the bottom-right 76px portraits can overlap — preflight independently flagged this. It's cosmetic, degrades gracefully (both are readable, chat has `pointer-events:auto`), and the playgroup is desktop/tablet in-person; the pre-existing E5-4 portrait overlap is the larger mobile defect. Could a malicious server payload hurt us? A `banter` with a 10k-char `text` would wrap (`word-break: break-word`) inside a `max-height:156px; overflow-y:auto` box — contained, no layout blowout. A malformed `color` string can't inject CSS because React sets it via the CSSOM `style` property, not string concatenation. Could a rapid banter storm leak memory? No — `.slice(-MAX_LOG)` caps the array at 8. Could StrictMode double-render duplicate entries? No — `pushLog` fires from SSE event handlers, not render, so double-render doesn't double-append; only the id counter may skip. Would a stressed reader miss messages? Possibly — the `<ul>` is labelled but not `aria-live`, so new lines aren't announced to screen readers; that's an accessibility nicety beyond this story's ACs, logged as an observation, not a blocker. Nothing here rises to Critical/High.

**Verdict:** APPROVED — 4 low-severity, non-blocking observations; all three ACs met; tests and build green.

**Handoff:** To SM (Slartibartfast) for finish-story.

## Delivery Findings

No upstream findings.

### Dev (implementation)
- **Improvement** (non-blocking): the `.opp-card` portrait cards are each `position: fixed; bottom: 16px; right: 12px`, so all bot portraits stack on the identical coordinates — this is the E5-4 "bot portraits overlap" bug, confirmed in the same component. Affects `src/clients/shared/OpponentCard.css` (portrait cards need per-seat offset/stacking). *Found by Dev during implementation — already tracked as E5-4; not touched here to keep E5-5 scoped.*

### Reviewer (code review)
- **Improvement** (non-blocking): the trash-talk `<ul className="opp-card__log">` is labelled but not `aria-live`, so newly-arrived messages are not announced to screen readers. Affects `src/clients/shared/AiRoster.tsx` (add `aria-live="polite"` if chat a11y is prioritised). *Found by Reviewer during code review — beyond E5-5 ACs; captured for a future a11y pass.*

## Design Deviations

None at setup.

### Dev (implementation)
- **Replaced the transient self-echo bubble with the persistent log**
  - Spec source: context-story-E5-5.md, AC-2 / Technical Approach
  - Spec text: "a small persistent recent-message log (last N lines) in addition to or instead of the auto-hiding bubbles, or longer-lived / better-placed bubbles"
  - Implementation: `onUserChat` now appends the player's echoed message to the persistent log (as a "You:" line) instead of flashing it as a 4s `.opp-card__my-bubble`. The former `myFlash` state is retained but now drives only the send-failure notice (`.opp-card__chat-status`).
  - Rationale: the new log already gives a durable, legible echo of the player's own messages; a separate 4s transient bubble for the same text was redundant. AC-2 explicitly permits "instead of the auto-hiding bubbles".
  - Severity: minor
  - Forward impact: none — self-contained to `AiRoster.tsx`/`OpponentCard.css`; SSE event contract and the `/chat` endpoint are unchanged.
- **Chat panel repositioned to a fixed bottom-left affordance**
  - Spec source: context-story-E5-5.md, AC-1 / Technical Approach
  - Spec text: "give the chat a visible affordance — a label or a visible send button/icon, and/or a clearer position"
  - Implementation: the chat (log + input + Send) is now a labelled, always-visible fixed panel (`.opp-card__chatbox`) anchored bottom-left, clearing the fixed portrait cards (bottom-right). Was an in-flow unlabelled input with a `hidden` submit.
  - Rationale: an in-flow input was the exact thing playtesters couldn't find; a fixed, labelled corner panel is discoverable regardless of surrounding layout, and the free bottom-left corner avoids the portraits.
  - Severity: minor
  - Forward impact: none — bottom-left placement does not interact with the E5-4 portrait-overlap fix (bottom-right).

### Reviewer (audit)
- **Replaced the transient self-echo bubble with the persistent log** → ✓ ACCEPTED by Reviewer: within spec — AC-2 explicitly offers a persistent log "instead of the auto-hiding bubbles"; the player's echo is now durably visible in `.opp-card__log-line--me` and the failure notice is preserved via `.opp-card__chat-status`. No protocol change.
- **Chat panel repositioned to a fixed bottom-left affordance** → ✓ ACCEPTED by Reviewer: within spec — AC-1's Technical Approach explicitly permits "a clearer position"; bottom-left is the only free fixed corner (portraits are fixed bottom-right) and directly addresses the "playtesters couldn't find it" problem. Verified no other client element is fixed bottom-left, so no stacking collision on desktop.