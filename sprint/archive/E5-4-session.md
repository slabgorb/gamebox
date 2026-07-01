---
story_id: "E5-4"
jira_key: ""
epic: "E5"
workflow: "trivial"
---
# Story E5-4: Bot portraits overlap on the display

## Story Details
- **ID:** E5-4
- **Jira Key:** (none)
- **Workflow:** trivial
- **Stack Parent:** none
- **Type:** bug
- **Points:** 2

## Technical Context

### Root Cause
Bot portrait cards are rendered in a flexbox layout (`.ai-roster`) but each card (`.opp-card`) uses `position: fixed` with hard-coded coordinates (`bottom: 16px; right: 12px`). When multiple opponent cards render, they all stack at the same fixed screen position, causing visual overlap.

### Source Files to Modify
- **Primary:** `/Users/slabgorb/Projects/words/src/clients/shared/OpponentCard.css`
  - `.opp-card` rule (lines 5-16) applies `position: fixed` unconditionally
  - `.ai-roster` rule (lines 249-253) defines flex layout with column direction + 8px gap
  - Solution: Override positioning for `.opp-card` when nested in `.ai-roster` to use `position: relative` + auto positioning

- **Reference:** `/Users/slabgorb/Projects/words/src/clients/shared/AiRoster.tsx`
  - Maps bot array to BotCard components (lines 206-220)
  - Renders multiple cards inside container with className="ai-roster"

### Portrait Image Loading
- Portraits load from `/shared/portraits/{personaId}.png`
- Image src set in OpponentCard.tsx line 29
- Persona metadata auto-loads (per memory: "Portraits auto-load by persona id")

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-07-01T11:56:43Z
**Round-Trip Count:** 1

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-01T11:23:10Z | 2026-07-01T11:25:02Z | 1m 52s |
| implement | 2026-07-01T11:25:02Z | 2026-07-01T11:34:39Z | 9m 37s |
| review | 2026-07-01T11:34:39Z | 2026-07-01T11:43:28Z | 8m 49s |
| implement | 2026-07-01T11:43:28Z | 2026-07-01T11:51:27Z | 7m 59s |
| review | 2026-07-01T11:51:27Z | 2026-07-01T11:56:43Z | 5m 16s |
| finish | 2026-07-01T11:56:43Z | - | - |

## Acceptance Criteria

1. **Portrait Layout:** Multiple bot portrait cards render without visual overlap in the Risk client (test with 2, 3, and 4 player games)
   - Cards arranged vertically with consistent spacing
   - No cards obscure sibling portraits or names
   - Portraits and names visible on desktop (959px+) and mobile (<720px)

2. **CSS Fix Implemented:** OpponentCard.css modified to support both fixed (single opponent) and relative (multiplayer roster) positioning contexts
   - Single opponent card stays fixed in UI corner when not in ai-roster
   - Cards in ai-roster respect flex layout (relative positioning, flex gap)

3. **Bundle Rebuild:** Client bundle rebuilt and validated
   - Run `npm run build:client` to update plugins/risk/client/app.js
   - Restart server to load rebuilt bundle
   - Verify no 404 errors for portrait images

4. **Verified with Actual Game State:** Tested in a running Risk game with bot opponents
   - Portraits display side-by-side or stacked without overlap (depending on viewport)
   - Chat bubbles and stall overlays position correctly relative to respective portraits

## Delivery Findings

No upstream findings.

### Dev (implementation)
- No upstream findings.

### Reviewer (code review)
- **Gap** (blocking): The fix was written against shared `src/clients/shared/OpponentCard.css` only and ignores `plugins/risk/client/style.css`, where Risk's real opponent-card positioning lives (`#risk-root .opp-card`, specificity 1,1,0). Affects `src/clients/shared/OpponentCard.css` + `plugins/risk/client/style.css` (the roster fix must be applied/scoped under `#risk-root` and keep cards at top-right, not bottom-right).
- **Gap** (non-blocking): `sprint/context/context-story-E5-4.md` was overwritten during setup (`pf context create` regenerated it from the sparse sprint YAML), discarding the Architect-authored Problem/Approach/Scope and the real acceptance criteria, and that clobbered version was committed in fc6cdb4. Affects `sprint/context/context-story-E5-4.md` (restore the Architect content or lift its ACs into the story before rework).
- **Improvement** (non-blocking): The E5-4 story carries no description/ACs in `sprint/epic-E5.yaml`; the real ACs only existed in the now-clobbered context doc. Affects `sprint/epic-E5.yaml` (record ACs on the story so setup can't lose them).

### Reviewer (code review — round 2)
- No new upstream findings. The round-1 doc regression was resolved (Architect `context-story-E5-4.md` restored in commit 4c48dda). The two non-blocking round-1 improvements still stand as good hygiene for later: (a) `context create` clobbering hand-authored context during setup, and (b) recording ACs on the story in `sprint/epic-E5.yaml`. Neither blocks E5-4.

## Design Deviations

No deviations recorded.

### Dev (implementation)
- ~~No deviations from spec.~~ (Round 1 — superseded; the reviewer correctly flagged this as wrong, see audit below.)
- **Round 2 (rework): roster layout is a vertical column, not "side-by-side/wrapped"**
  - Spec source: context-story-E5-4.md (restored Architect version), Technical Approach + AC-1
  - Spec text: "flex-wrap and/or per-card sizing / max-width" … "cards render side-by-side or wrapped with no visual overlap"
  - Implementation: kept the shared `.ai-roster` vertical flex column (top-right anchor), cards stack downward with 8px gap — no overlap, but not a horizontal side-by-side/wrap.
  - Rationale: the shared `AiRoster` component already declares `flex-direction: column`; vertical stacking satisfies AC-1's core requirement (no overlap) with the smallest change and no component rewrite. Side-by-side would need width management to avoid crossing the board.
  - Severity: minor
  - Forward impact: none — purely presentational; AC-1 (no overlap), AC-2 (2P unregressed), AC-3 (chat affordance) all met.
- **Round 2 (rework): fix relocated to `plugins/risk/client/style.css` under `#risk-root`**
  - Spec source: Reviewer findings (this session), Risk styling convention
  - Implementation: reverted the shared-CSS attempt; the Risk roster positioning now lives beside `#risk-root .opp-card` at matching specificity, keeping portraits top-right and preserving the <959px block-flow. This is a correction of the round-1 defect, not a spec deviation.
  - Severity: n/a (defect correction)

### Reviewer (audit)
- **Dev's "no deviations" claim** → ✗ FLAGGED by Reviewer: There IS an undocumented deviation. The Architect context (before it was clobbered during setup) prescribed a **flex-wrap / per-card `max-width` side-by-side** layout that keeps the cards where Risk already puts them; the implementation instead relocated the whole roster to a new **fixed bottom-right anchor**. Dev couldn't see the original approach (setup overwrote it first), but the net result diverges from the design intent and is incorrect in the real Risk page. Severity: High.
- **Undocumented placement deviation** → Spec/Design said opponent portraits sit **top-right** in Risk (`plugins/risk/client/style.css` `#risk-root .opp-card { top:16px; bottom:auto }`, "the bottom edge holds the action tray + chronicle"). Code moves them to **bottom-right**. Not documented. Severity: High.

**Round 2 audit (rework):**
- **Round 2 — vertical column vs side-by-side/wrap** → ✓ ACCEPTED by Reviewer: AC-1 only requires "no visual overlap"; the vertical column achieves that with the smallest change and keeps the shared component's declared direction. Side-by-side is a nicety, not a requirement. Sound.
- **Round 2 — fix relocated to `#risk-root` in style.css** → ✓ ACCEPTED by Reviewer: this is exactly the correction the round-1 REJECT called for; the earlier placement deviation is now resolved (portraits back at top-right, off the bottom controls).

## Notes for Developer

- **Client bundle reminder:** `src/clients/shared/OpponentCard.css` changes are inert until the bundle is rebuilt via `npm run build:client` and the server restarts. Without rebuild, the old CSS will still be served from the cached app.js bundle.
- **Multiplayer context:** This bug manifests when there are multiple bot opponents (2+ bots). Single-player games with one bot won't show the overlap issue.
- **Fixed positioning scope:** The `.opp-card` component is reused in shared code (not just Risk). Ensure CSS changes don't break fixed positioning for non-roster contexts (e.g., if other plugins render single opponent cards).

## Dev Assessment

### Rework (round 2) — addresses Reviewer REJECT

**What changed vs round 1:**
- **Reverted** `src/clients/shared/OpponentCard.css`: `.ai-roster` is back to neutral `display:flex; flex-direction:column; gap:8px` (removed the bottom-right fixed anchor / relative-child / 720px block). Shared CSS no longer owns Risk positioning.
- **Added the real fix in `plugins/risk/client/style.css`** (served as-is, no bundling), beside the existing `#risk-root .opp-card` block:
  - `#risk-root .ai-roster` → fixed **top-right** anchor (`top:16px; right:12px; z-index:90; align-items:flex-end; pointer-events:none`). Higher specificity (1,1,0+) than `#risk-root .opp-card`, so it wins.
  - `#risk-root .ai-roster .opp-card` → `position:relative; top/right/bottom:auto` so cards flow in the roster column instead of each pinning to the same fixed top-right coords.
  - `#risk-root .ai-roster .opp-card__abandon { pointer-events:auto }` so the click-through container doesn't disable the (otherwise unstyled) abandon button.
  - `@media (max-width:959px)` → roster `position:static; align-items:stretch; pointer-events:auto` and cards `position:static`, restoring Risk's intended block-flow (matched to the existing 959px breakpoint, not a new 720px one).

**How each Reviewer finding was resolved:**
- [HIGH] wrong corner / specificity leak → fixed under `#risk-root`; portraits now top-right (verified), no `top/right` leak.
- [HIGH] mobile conflict / breakpoint mismatch → block-flow restored at the same 959px breakpoint.
- [MEDIUM] pointer-events capture → roster is `pointer-events:none` (click-through); interactive descendants (chatbox/stall/chat already `auto`, abandon re-enabled) stay clickable.
- [MEDIUM] invalid harness → re-verified in a harness that loads BOTH `style.css` and `app.css` inside `#risk-root`.
- [LOW] duplicate 720px blocks → gone (shared block removed).
- [LOW] doc regression → restored the Architect `context-story-E5-4.md` from git.

**Re-verification (valid harness this time — `#risk-root` + style.css + app.css):**
- Desktop (1000px): 3 bot portraits stacked top-right, no overlap, name strips + banter bubble intact, clear of the bottom action-tray placeholder; chatbox pinned bottom-left.
- Mobile (420px, <959px): portraits drop into block flow (static), stacked, no overlap — not a fixed overlay.
- Tests: **271/271 passing, 49/49 files** after rework (`vitest run`).
- AC check against the restored Architect ACs: AC-1 no overlap at 3 bots ✓; AC-2 2P single-portrait unregressed (still top-right) ✓; AC-3 chat affordance intact ✓.

**Files changed (round 2):** `plugins/risk/client/style.css`, `src/clients/shared/OpponentCard.css` (revert), `sprint/context/context-story-E5-4.md` (restore).

**Handoff:** Back to review (Reviewer / Arthur Dent).

---
_Round 1 assessment below (superseded — the bottom-right approach was rejected):_

**Implementation Complete:** Yes

**Root cause:** `.opp-card` carried `position: fixed; bottom: 16px; right: 12px` unconditionally. In Risk, `<AiRoster>` renders one `.opp-card` per bot inside a `.ai-roster` flex column — but because each card was `position: fixed`, all of them left the flex flow and pinned to the same screen coords, stacking on top of each other. (Cribbage renders a single standalone `.opp-card`, which is why the bug only showed with 2+ bots in Risk.)

**Fix (CSS only):** `src/clients/shared/OpponentCard.css`
- `.ai-roster` is now the fixed bottom-right anchor (`position: fixed; bottom: 16px; right: 12px; z-index: 90; align-items: flex-end`).
- `.ai-roster .opp-card` overrides the fixed positioning to `position: relative` with `bottom/right/z-index` cleared, so the cards flow within the roster's flex column and respect its `gap: 8px`.
- Added a `@media (max-width: 720px)` override for `.ai-roster` (`bottom: 12px; right: 8px`), placed after the base rule so it wins on mobile.
- Standalone `.opp-card` (Cribbage single opponent) is **unscoped and unchanged** — still fixed bottom-right.

**Files Changed:**
- `src/clients/shared/OpponentCard.css` — scoped `.ai-roster`/`.ai-roster .opp-card` positioning to stop bot-portrait overlap.

**Verification:**
- Rebuilt bundles via `npm run build:client`; confirmed the built `plugins/risk/client/app.css` contains the fixed-anchor + relative-child rules, and the built `plugins/cribbage/client/app.css` still has standalone `.opp-card{...position:fixed;bottom:16px;right:12px}` (no regression to the single-opponent corner).
- Full client suite green: **271/271 tests, 49/49 files** (`vitest run`), including AiRoster (10), OpponentCard (3), BotCard (4), risk-app-opponent-card (4), CribbageApp (10), OpponentBanter (14).
- Visual proof against the built CSS (static harness reproducing AiRoster's exact DOM: 3 bot cards + chatbox): desktop (1000px) and mobile (400px) both show the three portraits stacked cleanly with no overlap, name strips + banter bubble in place, chatbox pinned bottom-left. Screenshots captured during implementation (scratchpad, not committed).

**AC status:**
- AC #1 (no overlap, 2–4 players, desktop + mobile): met — verified visually at 1000px and 400px.
- AC #2 (dual-context CSS: standalone fixed vs roster relative): met — scoping confirmed in both built bundles.
- AC #3 (bundle rebuilt + validated): met — `npm run build:client` run; built CSS inspected.
- AC #4 (verified with actual game state): partially met offline — verified via a faithful DOM/CSS harness rather than a live multiplayer Risk game (would need a running server + a live 2+ bot game). Recommend a quick live spot-check during review; behavior is deterministic CSS so risk is low.

**Tests:** 271/271 passing (GREEN)
**Branch:** main (trunk-based; bundles gitignored)

**Handoff:** To review phase (Reviewer / Arthur Dent).

## SM Assessment

**Setup verdict:** Ready for Dev (Trillian).

- **Scope confirmed contained:** This is a CSS/layout bug, not a rules-engine change — consistent with the E5 epic's "no net-new rules engine" charter. Root cause (`.opp-card` `position: fixed` stacking inside the `.ai-roster` flex container) is localized to `src/clients/shared/OpponentCard.css`; the `.tsx` files are reference-only.
- **Cross-plugin risk flagged:** `OpponentCard` is shared code, not Risk-only. The fix must scope the positioning override to the `.ai-roster` context so single-opponent fixed-corner usage in other plugins is not regressed. Called out in Notes for Developer.
- **Bundle rebuild is the classic trap:** Per project memory, client bundles are gitignored and a source change is inert until `npm run build:client` + server restart. AC #3 and the developer notes make this explicit so the fix is actually verified, not just written.
- **Merge gate:** Clear — no open PRs. Jira not configured; Jira steps skipped intentionally. Trunk-based repo — work proceeds on `main`, no feature branch.

**Routing:** trivial (phased) → next phase `implement` → next agent `dev`.

---
*Session file created during sm-setup phase*

## Subagent Results (Round 1 — superseded)

Only `reviewer-preflight` is enabled in this project (`workflow.reviewer_subagents`); the other 8 specialists are disabled via settings, so they are pre-filled as Skipped/disabled and do not block the gate. Their domains were self-assessed by the Reviewer (see tags in the assessment).

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | findings | 2 (context-doc regression; no auto-coverage for CSS) + tests green | confirmed 1 (context-doc), noted 1 (no coverage) |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | N/A — self-assessed (viewport/seat-count edges) |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | N/A — self-assessed (n/a: CSS) |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | N/A — self-assessed (no jsdom layout coverage possible) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | N/A — self-assessed (comment accurate but describes wrong approach) |
| 6 | reviewer-type-design | No | Skipped | disabled | N/A — self-assessed (n/a: CSS) |
| 7 | reviewer-security | No | Skipped | disabled | N/A — self-assessed (n/a: no auth/data) |
| 8 | reviewer-simplifier | No | Skipped | disabled | N/A — self-assessed (duplicate @media blocks) |
| 9 | reviewer-rule-checker | No | Skipped | disabled | N/A — no `.claude/rules`/CLAUDE.md/SOUL.md; CSS not covered by lang-review checklists |

**All received:** Yes (1 enabled subagent returned; 8 disabled via settings, self-assessed)
**Total findings:** 1 confirmed blocking (cascade/placement), 2 confirmed non-blocking (context-doc regression, missing story ACs), 1 noted (no automated coverage)

## Reviewer Assessment (Round 1 — REJECTED, superseded by round 2 below)

**Verdict:** REJECTED

The change removes the *mutual* overlap in an offline harness, but it is incorrect on the **real Risk page**, which loads `plugins/risk/client/style.css` before the bundle and mounts inside `<main id="risk-root">` (`plugins/risk/client/index.html:8-12`). The Risk-specific stylesheet already positions opponent cards, at higher specificity than the fix, and deliberately keeps them at the top.

| Severity | Issue | Location | Fix Required |
|----------|-------|----------|--------------|
| [HIGH] | Fix ignores `#risk-root .opp-card` (specificity 1,1,0) in `style.css`, which pins Risk opponent cards **top-right** (`top:16px; right:12px; bottom:auto`) because "the bottom edge holds the action tray + chronicle." The fix anchors `.ai-roster` **bottom-right**, so the un-overlapped portrait stack now lands on top of the action tray/chronicle — trading one overlap for another. The leftover `top:16px; right:12px` also leak onto the now-`relative` cards (my `right:auto` at 0,2,0 loses to the ID rule at 1,1,0). | `plugins/risk/client/style.css:833-837`, `src/clients/shared/OpponentCard.css:249-272` | Apply the roster fix under `#risk-root` (e.g. `#risk-root .ai-roster` as a fixed **top-right** anchor) and neutralize/relocate the per-card `top/right` so cards flow within it. Keep parity with the existing top-right design. |
| [HIGH] | Mobile behavior conflict. `@media (max-width:959px){#risk-root .opp-card{position:static; width:100%; …}}` (`style.css:841-849`) intentionally drops cards into block flow. The fix's `.ai-roster{position:fixed;bottom:16px}` traps those static cards in a fixed bottom-right overlay instead. The fix also introduces a **720px** breakpoint that conflicts with Risk's **959px** one. | `plugins/risk/client/style.css:841-849`, `src/clients/shared/OpponentCard.css:270-272` | Preserve the <959px block-flow behavior for the roster; align breakpoints. |
| [MEDIUM] | `.ai-roster` becomes a fixed container with default `pointer-events:auto`, so its box captures clicks over the map/controls beneath it even though the child `.opp-card` is `pointer-events:none` (was click-through before). | `src/clients/shared/OpponentCard.css:255` | Add `pointer-events:none` to the roster container (interactive descendants — chatbox/stall/chat — already set `auto`; check the unstyled `.opp-card__abandon`). |
| [MEDIUM] | Verification was invalid: the Dev harness loaded only the compiled bundle and was not wrapped in `#risk-root`, so it never exercised `style.css`. The "desktop + mobile verified, no overlap" evidence does not reflect the real page. | Dev Assessment "Verification" | Re-verify in a harness that loads BOTH `style.css` and `app.css` inside `#risk-root`, or in the live Risk game. |
| [LOW] | Duplicate `@media (max-width:720px)` blocks in `OpponentCard.css` (pre-existing `.opp-card` sizing + new `.ai-roster`). Cosmetic. | `src/clients/shared/OpponentCard.css:237,270` | Merge if touching the file anyway. |
| [LOW] | Doc regression committed alongside the fix: `context-story-E5-4.md` lost the Architect's Problem/Approach/ACs. | `sprint/context/context-story-E5-4.md` | Restore the Architect content / lift ACs into the story YAML. |

### Rule Compliance
No project rules files exist (`.claude/rules/*.md`, `CLAUDE.md`, `SOUL.md` all absent). The lang-review checklists (`typescript/javascript/...`) do not govern `.css` files, so `reviewer-rule-checker` has nothing to enumerate against this diff. The applicable *project convention* — discovered in code, not a rules file — is that **Risk-specific presentation overrides live in `plugins/risk/client/style.css` under `#risk-root`** (see the many `#risk-root .*` rules and the existing `#risk-root .opp-card` block). The diff violates that convention by attempting Risk-affecting layout purely from the shared stylesheet at lower specificity. `[RULE]` (self-assessed, rule-checker disabled): non-compliant with the `#risk-root` scoping convention.

### Observations (dispatch-tagged)
- `[HIGH]` Cascade/specificity + placement defect — `#risk-root .opp-card` beats the fix and forces top-right; roster anchored bottom-right. `plugins/risk/client/style.css:833`.
- `[HIGH]` Mobile block-flow (959px) intent broken by fixed roster; 720 vs 959 breakpoint mismatch. `style.css:841`.
- `[MEDIUM]` `[EDGE]` (edge-hunter disabled; self-assessed): with 3 bots on a short viewport the bottom-anchored stack grows upward with no `max-height`/`overflow`, and now sits over the tray. Boundary = seat count × card height vs viewport.
- `[MEDIUM]` Fixed container captures pointer events over the board/controls (was click-through). `OpponentCard.css:255`.
- `[VERIFIED]` Standalone `.opp-card` (Cribbage) is genuinely untouched — evidence: built `plugins/cribbage/client/app.css` still has `.opp-card{…position:fixed;bottom:16px;right:12px}`; no `#risk-root`/`.ai-roster` context there. Complies with the "don't regress single-opponent" concern. (Cribbage is unaffected; the defect is Risk-only.)
- `[TEST]` (test-analyzer disabled; self-assessed): 271/271 pass but none assert layout (jsdom has no layout engine) — the regression is not catchable by the existing suite; manual/live verification is required.
- `[DOC]` (comment-analyzer disabled; self-assessed): the new CSS comment is internally accurate but documents the *wrong* approach for Risk (bottom-right anchor) — will mislead once corrected.
- `[SIMPLE]` (simplifier disabled; self-assessed): duplicate 720px media blocks; also the whole shared-stylesheet approach is more convoluted than a single `#risk-root .ai-roster` rule beside the existing opponent-card block.
- `[SILENT]` (silent-failure-hunter disabled; self-assessed): n/a — no error handling/control flow in a CSS diff.
- `[TYPE]` (type-design disabled; self-assessed): n/a — no types in a CSS diff.
- `[SEC]` (security disabled; self-assessed): n/a — no auth, input, secrets, or tenant data touched.
- `[RULE]` (rule-checker disabled; self-assessed): violates the `#risk-root` scoping convention (see Rule Compliance).

### Devil's Advocate
Argue the code is fine: tests are green (271/271), the diff is tiny and self-contained, the standalone Cribbage card is provably untouched, and the specificity math for `position` genuinely favors the fix (`.ai-roster .opp-card` at 0,2,0 beats base `.opp-card` at 0,1,0), so cards really do leave the fixed stack and flow in the flex column — the *mutual* overlap the story complains about is gone. One could argue the bottom-right placement is harmless because Risk caps at 4 players (≤3 bots), the stack is short, and `pointer-events:none` on the cards keeps the portraits click-through. So why block?

Because the harness lied. A confused user on the real page won't see my green harness — they'll see the portrait stack sitting on the action tray and chronicle at the bottom, because `#risk-root .opp-card{top:16px;bottom:auto}` and the reserved bottom edge are exactly what `style.css` documents. A malicious/clumsy user on a narrow phone gets a fixed overlay where the design intended in-flow cards (959px block-flow rule), and the mismatched 720/959 breakpoints create a dead band between 720–959px where neither rule set behaves as intended. A stressed layout (short viewport, 3 bots) grows the un-clamped stack upward with no overflow handling, straight over the tray. And the fixed container — now `pointer-events:auto` and overlapping bottom controls — can eat clicks meant for the action tray. The original bug was portraits overlapping *each other*; this fix makes them overlap the *controls* instead. None of that is caught by the test suite (jsdom can't lay out), and the visual "proof" omitted the very stylesheet that governs Risk. That is enough to reject: correctness on the real page is unproven and, on analysis, wrong. The right fix is small — put a fixed **top-right** `#risk-root .ai-roster` anchor next to the existing opponent-card block and let the cards flow — but it must live where Risk's positioning actually lives.

**Data flow traced:** seat list → `RiskApp.tsx` `bots` → `<AiRoster>` renders `.ai-roster > .opp-card*` inside `#risk-root` → styled by `style.css` (`#risk-root .opp-card`, 1,1,0) + bundle (`.ai-roster .opp-card`, 0,2,0). The cascade resolves to relative cards inside a bottom-anchored fixed container with leaked top/right offsets — wrong corner.
**Handoff:** Back to Dev (Trillian) for rework — reimplement under `#risk-root` in `plugins/risk/client/style.css`, keep top-right + mobile block-flow, then re-verify with both stylesheets loaded.

---

## Subagent Results

Round 2 (rework re-review of commit 4c48dda). Only `reviewer-preflight` is enabled (`workflow.reviewer_subagents`); the other 8 are disabled and self-assessed.

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | findings | 1 (mobile width/margin asymmetry — verified non-issue) + tests green | confirmed 0, dismissed 1 (cascades through from sibling rule) |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | N/A — self-assessed |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | N/A — n/a (CSS) |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | N/A — self-assessed (no jsdom layout coverage) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | N/A — comment now accurate |
| 6 | reviewer-type-design | No | Skipped | disabled | N/A — n/a (CSS) |
| 7 | reviewer-security | No | Skipped | disabled | N/A — n/a |
| 8 | reviewer-simplifier | No | Skipped | disabled | N/A — self-assessed (duplicate 720px block removed) |
| 9 | reviewer-rule-checker | No | Skipped | disabled | N/A — fix now complies with the #risk-root convention |

**All received:** Yes (1 enabled subagent returned; 8 disabled via settings, self-assessed)
**Total findings:** 0 confirmed, 1 dismissed (preflight's mobile asymmetry — verified the width/margin cascade through from `#risk-root .opp-card`)

## Reviewer Assessment

**Verdict:** APPROVED

The rework resolves every round-1 finding and I found no new defects. Independently verified (not just trusting the author): the served Risk bundle `app.css` `.ai-roster` is neutral (`display:flex;flex-direction:column;gap:8px`, no stale `position:fixed`), `plugins/risk/client/style.css` carries the `#risk-root .ai-roster` rules, and Cribbage's bundle still has standalone `.opp-card{…position:fixed;bottom:16px;right:12px}` (no cross-plugin regression). Tests 271/271.

**Round-1 findings — resolution check:**
- [HIGH] wrong corner / specificity leak → RESOLVED. `#risk-root .ai-roster .opp-card` (1,2,0) beats `#risk-root .opp-card` (1,1,0); cards are `position:relative; top/right/bottom:auto`, roster fixed **top-right**. No leaked offsets.
- [HIGH] mobile conflict / breakpoint mismatch → RESOLVED. `@media (max-width:959px)` (matching the sibling rule) drops roster + cards to `static` block flow; the 720px block is gone.
- [MEDIUM] pointer-events capture → RESOLVED. `#risk-root .ai-roster{pointer-events:none}` (click-through); chatbox/stall/chat keep `auto`, and `.opp-card__abandon` is re-enabled. On mobile the static roster restores `auto`.
- [MEDIUM] invalid harness → RESOLVED. Re-verified in a harness loading BOTH `style.css` and `app.css` inside `#risk-root`: desktop top-right, no overlap, clear of the bottom tray; mobile block-flow.
- [LOW] duplicate 720px blocks → RESOLVED (shared block removed).
- [LOW] doc regression → RESOLVED (Architect context restored).

**Data flow traced:** seat list → `RiskApp.tsx` `bots` → `<AiRoster>` renders `.ai-roster > .opp-card*` inside `#risk-root` → cascade now resolves to a fixed **top-right** roster with relative in-flow cards (desktop) / static block-flow cards (<959px). Safe: container is click-through, so the board/controls underneath remain interactive.
**Pattern observed:** Risk-specific presentation correctly scoped under `#risk-root` in `plugins/risk/client/style.css:851-887`, beside the existing opponent-card block — matches the project convention.
**Error handling:** n/a (declarative CSS; no control flow).

### Observations (dispatch-tagged)
- `[VERIFIED]` Specificity: `#risk-root .ai-roster .opp-card` (1,2,0) > `#risk-root .opp-card` (1,1,0) — evidence: `style.css:868-873` vs `:833-837`; position/top/right/bottom resolve to the roster rule. Complies with the #risk-root scoping convention.
- `[VERIFIED]` Served assets consistent — bundle `app.css` `.ai-roster` neutral, `style.css` has the fix, Cribbage `.opp-card` still fixed (no regression).
- `[TEST]` (disabled; self-assessed): 271/271 green; still no layout assertions possible in jsdom — verification is the valid `#risk-root` harness + live game.
- `[EDGE]` (disabled; self-assessed): with 3 bots the top-right column grows downward ~435px; on a very short viewport the lowest card could approach the bottom tray, but cards are `pointer-events:none` so they can't block it — LOW residual, strictly better than round 1's on-the-tray placement.
- `[DOC]` (disabled; self-assessed): the new CSS comment accurately describes the top-right approach and the specificity rationale.
- `[SIMPLE]` (disabled; self-assessed): shared CSS is neutral again; the whole fix is one cohesive `#risk-root` block. No leftover complexity.
- `[SILENT]` / `[TYPE]` / `[SEC]` (disabled; self-assessed): n/a — CSS diff, no control flow, types, auth, or data.
- `[RULE]` (disabled; self-assessed): now compliant — Risk presentation lives in `style.css` under `#risk-root`.
- Preflight's mobile width/margin asymmetry: `[VERIFIED]` non-issue — the new `#risk-root .ai-roster .opp-card` (<959px) sets only `position`, so `width:100%; max-width:280px; margin:0.5rem auto` cascade in from `#risk-root .opp-card` (`style.css:842-848`); confirmed visually (centered, capped, no overlap).

### Devil's Advocate
Argue it is still broken: the round-1 harness lied once — why trust the round-2 one? Because this time it loaded the exact two stylesheets the real page loads (`style.css` then `app.css`) inside `<main id="risk-root">`, i.e. the same cascade the browser builds, and the specificity math is independently checkable (1,2,0 > 1,1,0) rather than eyeballed. Could a malicious/clumsy user break it? The container is now `pointer-events:none`, so a fat-fingered click over a portrait falls through to the board as before; the only clickable bits are the intended ones (chat, retry, abandon). Could a stressed layout misbehave? On a tiny viewport three stacked portraits grow toward the bottom, but they're click-through and the mobile breakpoint (<959px) removes the fixed overlay entirely, dropping cards into document flow — the worst case is cosmetic, not functional. Could the 2P path regress? No — a single bot yields one relative card in a top-right roster, visually identical to the prior single fixed card, and Cribbage's standalone card is provably untouched. The one asymmetry preflight raised (missing width reset on the mobile roster-card rule) resolves in the browser via the cascade and was confirmed on screen. I cannot construct a failing scenario that the fix doesn't already handle. Approving.

**Handoff:** To SM (Slartibartfast) for finish-story.