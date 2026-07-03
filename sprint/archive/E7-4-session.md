---
story_id: "E7-4"
jira_key: ""
epic: "E7"
workflow: "trivial"
---
# Story E7-4: 'The Tortoise' AI portrait falls back to emoji (persona id != portrait filename)

## Story Details
- **ID:** E7-4
- **Jira Key:** (no Jira)
- **Workflow:** trivial (phases: setup → implement → review → finish)
- **Stack Parent:** none
- **Type:** bug
- **Points:** 1
- **Priority:** p2
- **Repo:** g-1
- **Branch Strategy:** trunk-based (branching skipped — work happens on the default branch)

## Problem Statement

The 'The Tortoise' AI opponent shows the fallback turtle emoji instead of its portrait. Root cause CONFIRMED: portraits auto-load by persona id (OpponentCard src=/shared/portraits/<personaId>.png); the persona id is 'the-tortoise' (data/ai-personas/the-tortoise.yaml, filename==id, loader-enforced) but the portrait file is public/shared/portraits/the-turtle.png — so /shared/portraits/the-tortoise.png 404s and the glyph shows. Same class as the earlier lady-peacock/professor-plum rename.

## Technical Approach

1. **Asset Rename:** `git mv public/shared/portraits/the-turtle.png → the-tortoise.png` to match the persona id.
2. **Grep for Stale References:** Search codebase for remaining `the-turtle` references (portrait filename) and update to `the-tortoise`.
3. **Verification:** The Tortoise opponent renders its portrait, not the emoji fallback.

**Trivial:** no code change, no rebuild (static asset only).

## Acceptance Criteria
- `public/shared/portraits/the-tortoise.png` exists (renamed from the-turtle.png) so `/shared/portraits/the-tortoise.png` resolves.
- No remaining stale references to `the-turtle` portrait filename in the codebase (grep-verified).
- The Tortoise opponent renders its portrait, not the emoji fallback.

## Sm Assessment

**Confidence:** High. Root cause is confirmed and the fix is a one-file asset rename with a documented precedent (lady-peacock / professor-plum renames).

**Scope for Dev (Trillian):**
- `git mv public/shared/portraits/the-turtle.png public/shared/portraits/the-tortoise.png` (preserve git history — use `git mv`, not add+delete).
- Grep the whole repo for `the-turtle` FIRST. Two id-spaces may collide: the persona id is `the-tortoise`, but there may be legitimate unrelated `turtle` references. Only rewrite references that point at the **portrait filename** (`the-turtle.png` / `/shared/portraits/the-turtle`). Do NOT blanket-rename every `turtle` string.
- No code change to the OpponentCard loader is expected — it already derives the src from persona id. If grep shows the loader hardcodes `the-turtle`, that changes the fix; flag it as a Delivery Finding rather than silently patching.

**Verification for Dev:** confirm `public/shared/portraits/the-tortoise.png` exists, `the-turtle.png` is gone, and no stale `the-turtle` portrait refs remain (grep clean). Static asset — no rebuild, no server restart needed. Optional real-app check: load a game with The Tortoise and confirm the portrait renders instead of the emoji.

**Risks / watch-items:** none blocking. Only trap is over-eager find-replace on the `turtle` substring — the AC #2 grep gate covers that.

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-07-03T15:19:48Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-03T15:08:56Z | 2026-07-03T15:11:20Z | 2m 24s |
| implement | 2026-07-03T15:11:20Z | 2026-07-03T15:14:43Z | 3m 23s |
| review | 2026-07-03T15:14:43Z | 2026-07-03T15:19:48Z | 5m 5s |
| finish | 2026-07-03T15:19:48Z | - | - |
| implement | - | 2026-07-03T15:14:43Z | unknown |
| review | 2026-07-03T15:14:43Z | 2026-07-03T15:19:48Z | 5m 5s |
| finish | 2026-07-03T15:19:48Z | - | - |
| review | - | 2026-07-03T15:19:48Z | unknown |
| finish | 2026-07-03T15:19:48Z | - | - |
| finish | - | - | - |

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- No upstream findings. Root cause was exactly as SM scoped: loader (`src/clients/shared/OpponentCard.tsx:29`, `public/shared/opponent-card.js:38`) builds `src=/shared/portraits/${personaId}.png`; no code hardcodes the filename. Repo-wide grep for `the-turtle` returned zero code hits (only the E7 story/epic docs).

### Reviewer (code review)
- **Improvement** (non-blocking): Portrait filename must equal persona id, but nothing enforces this invariant — this is the third instance of the same drift (lady-peacock, professor-plum, now the-tortoise). Affects `data/ai-personas/*` + `public/shared/portraits/*` (a drift-guard test asserting every persona id has a matching `<id>.png` would catch the next one at CI instead of playtest). Deferred, not blocking E7-4. *Found by Reviewer during code review.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- No deviations from spec. Executed the exact fix SM scoped: `git mv` rename, no code change, no rebuild.

### Reviewer (audit)
- **Dev "No deviations from spec"** → ✓ ACCEPTED by Reviewer: confirmed against the diff — `git show HEAD` is a single 100%-similarity binary rename, exactly matching the SM-scoped fix. No undocumented deviations found; there is no code surface in which one could hide.

## Dev Assessment

**Implementation Complete:** Yes
**Files Changed:**
- `public/shared/portraits/the-turtle.png` → `public/shared/portraits/the-tortoise.png` — static-asset rename (git-tracked rename, 100% similarity, history preserved) so `/shared/portraits/the-tortoise.png` resolves for persona id `the-tortoise`.

**Tests:** N/A — trivial workflow, no TEA/RED phase; static-asset rename with no runtime code change. Repo-wide grep for `the-turtle` is clean (only E7 story docs reference the string), so no test hardcodes the old name; a 1.8 MB binary rename has no test surface to break.

**Acceptance Criteria:**
- AC1 ✓ `public/shared/portraits/the-tortoise.png` exists (renamed from the-turtle.png).
- AC2 ✓ No stale `the-turtle` portrait references in code (grep-verified).
- AC3 ✓ Loader-built src `/shared/portraits/the-tortoise.png` now resolves → portrait renders instead of emoji fallback.

**Commit:** `67ed394` on `main` (trunk-based, g-1). **Not yet pushed** to `origin` — flagged to Hoopy Frood because pushing to `main` on the shared GitHub remote is outward-facing; awaiting go-ahead.

**Handoff:** To review phase (Reviewer / Arthur Dent).

## Subagent Results

Per `pf settings get workflow.reviewer_subagents`, only `preflight` is enabled for this project; the other 8 specialists are disabled via settings and pre-filled as Skipped/disabled per the reviewer definition. For a binary-asset rename with zero source-diff lines, the disabled specialists (edge/silent/type/security/simplifier/etc.) have no code surface to analyze — I assessed each domain directly (see Reviewer Assessment tags).

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (1719 tests pass, 0 fail, 1 pre-existing unrelated skip) | confirmed 0, dismissed 0, deferred 0 |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings |

**All received:** Yes (1 enabled subagent returned; 8 disabled via settings)
**Total findings:** 0 confirmed blocking, 0 dismissed, 1 deferred (non-blocking drift-guard improvement, logged in Delivery Findings)

## Reviewer Assessment

**Verdict:** APPROVED

**Change under review:** A single git-tracked binary rename, `public/shared/portraits/the-turtle.png` → `the-tortoise.png` (commit `67ed394`, tip of `main`, 100% similarity, 0 source lines). No code, no config, no test changed.

**Data flow traced:** persona id `the-tortoise` (`data/ai-personas/the-tortoise.yaml:1`) → `OpponentCard` builds `src=/shared/portraits/${personaId}.png` (`src/clients/shared/OpponentCard.tsx:29`, mirrored in `public/shared/opponent-card.js:38`) → request `/shared/portraits/the-tortoise.png` → now resolves to the on-disk asset (previously 404 → emoji fallback). Safe because the filename now equals the loader-derived id; no other id maps to this file.

**Observations (all VERIFIED — no blocking issues):**
- `[VERIFIED]` Asset exists at the new path and is a valid image — `file` reports `PNG image data, 1024 x 1024, 8-bit/color RGB, non-interlaced`, 1.79 MB; the `git mv` did not corrupt or truncate it.
- `[VERIFIED]` Filename now matches persona id — `data/ai-personas/the-tortoise.yaml:1` is `id: the-tortoise`, file is `the-tortoise.png`; loader `${personaId}.png` resolves exactly.
- `[VERIFIED]` No stale references to the old filename — repo-wide grep for `the-turtle` across code/config/test returns zero hits; remaining `the-turtle`/`the-tortoise` string matches are persona-id assertions (`test/sorry/ai-registration.test.js`), the persona yaml, and the E7 story docs (historical bug description) — none reference the asset filename.
- `[VERIFIED]` No regression — full suite green: `npm test` 1414 pass / 0 fail + `npm run test:client` 305 pass / 0 fail (1 pre-existing unrelated `LIVE: claude CLI` skip). `OpponentCard.test.tsx` uses a synthetic `amos.png` fixture, so the rename cannot break it either way.
- `[VERIFIED]` Old path fully removed — `the-turtle.png` no longer exists on disk and git records the change as a rename (not add+delete), preserving history.
- `[VERIFIED]` No orphaned asset introduced — the previously-orphaned `the-turtle.png` (matched no persona id) is gone; the new file is referenced by exactly one persona.

**Subagent dispatch tags** (8 specialists disabled via `workflow.reviewer_subagents`; domains assessed directly against a zero-code-line binary rename):
- `[EDGE]` — no code paths/branches in the diff; no boundary conditions to enumerate. Clean.
- `[SILENT]` — no error handling, catches, or fallbacks introduced. Clean.
- `[TEST]` — no tests changed; preflight confirms existing suite green and independent of the filename. Clean.
- `[DOC]` — no comments/docs in the diff; commit message accurately describes the change. Clean.
- `[TYPE]` — no types/signatures touched; `personaId` remains a string, unchanged. Clean.
- `[SEC]` — no auth/input/injection surface; a public static image asset served by filename, no user input flows into the rename. Clean.
- `[SIMPLE]` — the fix is already the minimal one (a rename); no over-engineering or dead code. Clean.
- `[RULE]` — no language rules apply to a binary asset; no `.claude/rules/*` or SOUL.md constraint governs image filenames beyond the id==filename convention this change restores. Clean.

### Rule Compliance
No numbered lang-review rule governs a binary PNG rename (the diff contains no TypeScript/JS/YAML source). The one project convention in play — "portrait filename must equal persona id" (established by the lady-peacock / professor-plum precedent and enforced-in-spirit by the loader) — is now **satisfied**: `the-tortoise.png` == persona id `the-tortoise`. This change moves the repo from violation → compliance for that convention. No other rule (private fields, validated constructors, error types, tenant isolation) has any surface here.

### Devil's Advocate
Let me argue this change is broken. First: what if the rename silently corrupted the binary, so the URL now resolves to a truncated or zero-byte file — a "successful 200" that renders a broken-image icon, arguably worse than the honest emoji fallback? Checked: `file` confirms a well-formed 1024×1024 PNG at 1.79 MB, byte-identical size to the original (git reports 100% similarity), so the pixels survived the move. Second: what if another persona, or a Clue/Sorry/Risk card-art config, pointed at `the-turtle.png` by name and now 404s where it used to work — trading one broken portrait for another? Checked: grep for `the-turtle` across all code and config is empty; the only consumer is the id-derived loader, and no card-art `file` field references the old basename. Third: what if a test fixture or snapshot asserted the old filename and CI is now red? Checked: preflight ran the full 1719-test suite green, and the one portrait test uses an unrelated synthetic fixture. Fourth: what if the asset is served from a build output or CDN copy that still carries the old name, so prod stays broken even after this commit? The story explicitly notes this is a static asset with no rebuild step, and the file lives under `public/` which is served directly; there is no bundling of portraits by name (loader composes the URL at runtime). Fifth: a confused user? There is no user-facing input here — the change is invisible except that the correct face now appears. The only residual risk is deployment: the commit is local and unpushed, so prod will not reflect the fix until `main` is pushed and the static file is deployed. That is an operational step, not a code defect, and it is flagged for the user. No devil's-advocate angle surfaces a blocking issue.

**Deferred (non-blocking):** No drift-guard prevents the next id/filename mismatch (third occurrence of this class). Logged as an Improvement in Delivery Findings for a future story — not a blocker for E7-4.

**Handoff:** To SM (Slartibartfast) for finish-story.