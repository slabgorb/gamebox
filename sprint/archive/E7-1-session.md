---
story_id: "E7-1"
jira_key: "E7-1"
epic: "E7"
workflow: "trivial"
---
# Story E7-1: Board room-image backgrounds (spike: photoreal images vs top-down view)

## Story Details
- **ID:** E7-1
- **Jira Key:** E7-1
- **Workflow:** trivial
- **Points:** 3
- **Type:** spike
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** trivial
**Phase:** finish
**Phase Started:** 2026-07-02T13:15:14Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-02T12:27:35Z | 2026-07-02T12:29:18Z | 1m 43s |
| implement | 2026-07-02T12:29:18Z | 2026-07-02T13:06:56Z | 37m 38s |
| review | 2026-07-02T13:06:56Z | 2026-07-02T13:15:14Z | 8m 18s |
| finish | 2026-07-02T13:15:14Z | - | - |

## Branch Strategy
**Branch Strategy:** trunk-based (branching skipped — work happens on the default branch)

## Context & Observations

**Spike Goal:**
Fill each Clue board room polygon with its room portrait (public/shared/portraits/<roomId>.png) as a clipped, dimmed background. Test whether photoreal room images work at board scale, or if a purpose-drawn top-down view is needed instead.

**Assets Ready:**
- 9 room portraits exist: kitchen, ballroom, conservatory, diningroom, billiardroom, library, lounge, hall, study

**Board Architecture:**
- Room polygons render in src/clients/clue/Board.tsx (ROOMS_GEO)
- Room fill styled by `#clue-root .clue-room` in plugins/clue/client/style.css

**Likely Approach:**
SVG `<pattern>/<image>` clipped per polygon, dimmed with a scrim so labels/tokens stay legible.

**Open Question (spike outcome):**
Do photoreal room backgrounds work at board scale, or does the board want a purpose-drawn illustrated top-down view instead?

**Implementation Trap (from project memory):**
- `#clue-root style.css` is checked-in with high specificity; the built app.css loses the cascade
- Client bundles are gitignored and must be rebuilt (`npm run build:client`) + server restarted before a .tsx change is live

## Sm Assessment

**Routing:** trivial (phased) → next phase `implement`, owner `dev` (Trillian). Merge gate clear (no open PRs). Trunk-based: work on `main`, no feature branch. 3-pt visual spike, no test-first phase.

**Technical approach (for Dev):** Render each room polygon's fill as its portrait via SVG `<pattern>`/`<image>` (or an SVG `clipPath` scoped to `ROOMS_GEO`) in `src/clients/clue/Board.tsx`, dimmed with a scrim overlay so the room label and pawn/weapon tokens stay legible on top. Style hook is `#clue-root .clue-room` in `plugins/clue/client/style.css` — mind the two-stylesheet cascade trap (checked-in `#clue-root` style.css is high-specificity; the built `app.css` loses the cascade). Rebuild the client bundle (`npm run build:client`) and restart the server before judging results — `.tsx` edits are inert until then.

**Acceptance criteria:**
1. Each of the 9 rooms shows its `public/shared/portraits/<roomId>.png` as a clipped background inside its polygon.
2. Room labels and pawn/weapon tokens remain legible over the imagery (scrim/dim applied).
3. Board is screenshotted with images in place (spike deliverable).
4. A recommendation is recorded in Delivery Findings: **keep / revert / go-top-down**, with reasoning — this is the spike's actual output. Reverting to the plain board is a valid, expected result; the decision matters more than the pixels.

**Why this routing:** Spike with a clear build-and-evaluate loop and no new deduction rules — trivial is correct. No brainstorming gate needed; the story already frames approach and the open question.

## Dev Assessment

**Implementation Complete:** Yes — spike resolved to **KEEP (with polish)**; now a real feature, not throwaway.

**Files Changed:**
- `src/clients/clue/Board.tsx` — per-room `<clipPath>` + `<image>` portrait backgrounds behind a scrim polygon; weapon tokens changed from emoji `<text>` glyphs to framed portrait `<image>` tiles in each room's lower-left corner (own slot counter). Removed the now-unused `WEAPON_GLYPHS` map.
- `plugins/clue/client/style.css` — `.clue-room` fill → translucent scrim `rgba(24,14,9,0.36)`; `.is-reachable` → translucent gold; `.clue-room-label` given a parchment stroke-halo (`paint-order`) for legibility over photos; added `.clue-room-img` / `.clue-weapon-img` / `.clue-weapon-frame` rules.
- `public/shared/portraits/{9 rooms + 6 weapons}.png` — downscaled 1024²→640² (~62% each; portraits dir 64.8MB→48MB; board image load ~27MB→~9MB). 1024px originals recoverable via git history.
- (rebuilt, gitignored) `plugins/clue/client/app.js` + `app.css` via `npm run build:client`.

**Verification:** Offline render harness (SVG generated from `board-geometry.js` + the real `style.css`, served so `/shared/portraits` resolve) screenshotted in Chromium — all 9 rooms + 6 weapon tiles render, labels/tokens legible, 640px crisp at board scale. Only console error is `favicon.ico` 404 (harmless).

**Tests:** 209/209 Clue tests passing (GREEN), incl. board-geometry drift guard + portrait-existence assertion.

**Branch:** trunk-based (`main`).

**Handoff:** To review (Arthur Dent). L&F iteration (scrim strength, weapon-tile corner vs. lower labels) deferred to a later pass per user.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- **Improvement** (non-blocking): The 21 suspect/character portraits remain 1024² PNGs (~1.7MB each) shown only at ≤88px card size. Affects `public/shared/portraits/*.png` (downscale the remaining character portraits to ~640² for a further ~30MB dir reduction — same `magick … -resize 640x640` one-liner). Deferred to keep this change scoped to the board. *Found by Dev during implementation.*
- **Improvement** (non-blocking): Weapon tiles anchor to each room's lower-LEFT corner, but the lounge/hall/study room labels also sit low, so a weapon there can crowd its label. Affects `src/clients/clue/Board.tsx` (`weaponTiles` x/y anchor — consider lower-right or collision-aware placement). Flagged for the deferred L&F pass. *Found by Dev during implementation.*
- **Improvement** (non-blocking): Board portraits are lossless PNG for photographic content; a WebP conversion would cut another ~70% but requires changing `.png` refs in `ClueCard.tsx` / `card-art.js` / `Board.tsx` plus the onError glyph fallback. Affects the clue client image refs. Out of scope here, non-trivial. *Found by Dev during implementation.*

### Reviewer (code review)
- **Gap** (non-blocking): Pre-existing `tsc` type error at `src/clients/clue/Board.tsx:47-48` — `view.movement!.rooms` / `.squares` not declared on the `ClueMovement` type. Preflight confirmed these are unchanged context lines (pre-date E7-1). Affects `src/clients/clue/Board.tsx` + the `ClueView`/`ClueMovement` contract (align the type or the access). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): Weapon tiles step rightward from each room's lower-left; if many weapons pile into the smallest room (e.g. all 6), the row can overflow the room's right edge / crowd the label. Affects `src/clients/clue/Board.tsx` (`weaponTiles` — clamp or wrap). Fold into the deferred L&F pass. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): Stale "pattern" wording in two comments (`Board.tsx` bbox comment; `style.css` "fill set inline via SVG pattern") — the shipped impl is `clipPath`+`<image>`, no `<pattern>`. Affects `src/clients/clue/Board.tsx` + `plugins/clue/client/style.css` (reword). *Found by Reviewer during code review.*

## Impact Summary

**Upstream Effects:** No upstream effects noted
**Blocking:** None

### Deviation Justifications

3 deviations

- **Weapon tokens changed from emoji glyphs to weapon-photo tiles**
  - Rationale: Explicit user directive during implementation ("use the weapon photos in the lower corner instead of emoji")
  - Severity: minor
  - Forward impact: none for rules/state (purely presentational); token layout owned by `Board.tsx`
- **Downscaled shared portrait assets (board images) 1024²→640²**
  - Rationale: Board loaded ~27MB of 1024² PNGs displayed at ≤~250px; 640² is ample for board + 88px cards
  - Severity: minor
  - Forward impact: these files are ALSO the room/weapon CARD art (ClueCard renders them at 88px) — 640² is still more than enough there, so cards are unaffected. Suspect portraits left at 1024² (see Delivery Findings).
- **Room fill via `clipPath`+`<image>` rather than `<pattern>`**
  - Rationale: `<pattern patternUnits="userSpaceOnUse">` with an offset tile only aligned the origin room (8/9 rendered blank in the first build); clipPath keeps each image in absolute user space
  - Severity: trivial (spec explicitly offered both options)

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### Dev (implementation)
- **Weapon tokens changed from emoji glyphs to weapon-photo tiles**
  - Spec source: .session/E7-1-session.md, story scope + AC-2
  - Spec text: "fill each Clue board room polygon with its room portrait … behind the room label and pawn/weapon tokens" (weapons were assumed to stay emoji glyphs)
  - Implementation: Replaced the `WEAPON_GLYPHS` emoji `<text>` with framed `<image>` weapon portraits (`/shared/portraits/<weapon>.png`) clipped to a rounded rect in each room's lower-left corner
  - Rationale: Explicit user directive during implementation ("use the weapon photos in the lower corner instead of emoji")
  - Severity: minor
  - Forward impact: none for rules/state (purely presentational); token layout owned by `Board.tsx`
- **Downscaled shared portrait assets (board images) 1024²→640²**
  - Spec source: E7-1 "keep with polish" decision + user directive
  - Spec text: "yes we should downscale we have some tools for that"
  - Implementation: `magick -resize 640x640 -strip` in place over the 9 room + 6 weapon PNGs (git-tracked; 1024² originals recoverable via history)
  - Rationale: Board loaded ~27MB of 1024² PNGs displayed at ≤~250px; 640² is ample for board + 88px cards
  - Severity: minor
  - Forward impact: these files are ALSO the room/weapon CARD art (ClueCard renders them at 88px) — 640² is still more than enough there, so cards are unaffected. Suspect portraits left at 1024² (see Delivery Findings).
- **Room fill via `clipPath`+`<image>` rather than `<pattern>`**
  - Spec source: Sm Assessment technical approach
  - Spec text: "via SVG `<pattern>`/`<image>` (or an SVG `clipPath` scoped to `ROOMS_GEO`)"
  - Implementation: Chose the clipPath option (per-room `<clipPath>` + absolute-positioned `<image>`)
  - Rationale: `<pattern patternUnits="userSpaceOnUse">` with an offset tile only aligned the origin room (8/9 rendered blank in the first build); clipPath keeps each image in absolute user space
  - Severity: trivial (spec explicitly offered both options)
  - Forward impact: none

### Reviewer (audit)
- **Weapon tokens emoji → photo tiles** → ✓ ACCEPTED by Reviewer: explicit user directive; purely presentational, no rules/state impact; layout owned by `Board.tsx`.
- **Downscaled board images 1024²→640²** → ✓ ACCEPTED by Reviewer: user-directed; 640² is ample for the board (≤~250px) and 88px cards; originals git-recoverable; `clue-card-art-drift` + portrait-existence tests still GREEN.
- **`clipPath`+`<image>` instead of `<pattern>`** → ✓ ACCEPTED by Reviewer: correct call — `<pattern patternUnits="userSpaceOnUse">` mis-aligned 8/9 rooms; clipPath is the right primitive and renders correctly under React 19 (`clipPath` prop → `clip-path` attribute).

No undocumented deviations found.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 0 smells; 209/209 tests GREEN; build OK | N/A (confirmed GREEN) |
| 2 | reviewer-edge-hunter | Skipped | disabled | N/A | Disabled via settings — edge cases assessed by Reviewer |
| 3 | reviewer-silent-failure-hunter | Skipped | disabled | N/A | Disabled via settings — assessed by Reviewer |
| 4 | reviewer-test-analyzer | Skipped | disabled | N/A | Disabled via settings — assessed by Reviewer |
| 5 | reviewer-comment-analyzer | Skipped | disabled | N/A | Disabled via settings — assessed by Reviewer |
| 6 | reviewer-type-design | Skipped | disabled | N/A | Disabled via settings — assessed by Reviewer |
| 7 | reviewer-security | Skipped | disabled | N/A | Disabled via settings — assessed by Reviewer |
| 8 | reviewer-simplifier | Skipped | disabled | N/A | Disabled via settings — assessed by Reviewer |
| 9 | reviewer-rule-checker | Skipped | disabled | N/A | Disabled via settings — TS rules checked by Reviewer |

**All received:** Yes (1 enabled subagent returned; 8 disabled via `workflow.reviewer_subagents`, assessed manually)
**Total findings:** 0 confirmed blocking, 3 LOW non-blocking (in Delivery Findings), 0 dismissed

## Reviewer Assessment

**Verdict:** APPROVED

**Scope:** Presentational Clue-board change (React 19 SVG in `Board.tsx` + `style.css`) plus 15 downscaled PNG assets. No rules engine, auth, tenant data, deserialization, or network paths touched — so `[SEC]`, `[SILENT]`, `[TYPE]` risk surfaces are minimal and were assessed directly (their subagents are disabled project-wide).

**Observations:**
- [VERIFIED] React 19 renders the `clipPath` prop as the `clip-path` DOM attribute — evidence: `package.json` `react ^19.2.4` + `@vitejs/plugin-react`; the offline harness used raw `clip-path` and rendered identically. The camelCase prop is correct, not a silent no-op.
- [VERIFIED] No dead code from the weapon refactor — `roomCenter` (`Board.tsx:210`) and `nextSlot` (`Board.tsx:211`) still serve pawn clustering; `WeaponId` still used (`Board.tsx:62`); `WEAPON_GLYPHS` fully removed. Evidence: grep, zero leftover refs.
- [TYPE][RULE] Null-safety correct — `weaponSlot.get(room) ?? 0` (`Board.tsx:63`) uses `??` not `||` (TS rule #4), so a valid `0` slot isn't clobbered. List keys are stable (`key={id}`/`key={w}`, not index) per TS rule #6. No `as any`, no `dangerouslySetInnerHTML` (preflight: 0).
- [DOC][LOW] Stale "pattern" comments in `Board.tsx` (bbox) and `style.css` — impl is `clipPath`+`<image>`, no `<pattern>`/inline fill. Non-blocking (logged as a Delivery Finding).
- [SIMPLE][LOW] `bbox(g.poly)` called 4× per room inline (`Board.tsx:129-132`); hoisting `const b` computes once. Negligible (9 rooms), cosmetic.
- [EDGE][LOW] Weapon-tile row can overflow the smallest room if many weapons pile there; `<image>` is `pointer-events:none` so it never breaks clicks — cosmetic only (logged as a Delivery Finding).
- [SILENT][LOW] Board `<image>` has no onError glyph fallback (ClueCard has one); a missing portrait renders blank, but `clue-card-art-drift` ("every referenced portrait PNG exists on disk") is GREEN, guarding it.
- [SEC] No security surface — hrefs are built from a fixed `WeaponId`/`RoomId` enum (server view), never free-form input; no injection/XSS/info-leak vector.
- [TEST] No test changes; 209/209 Clue tests remain GREEN incl. board-geometry drift + portrait-existence. Adequate for a presentational change.

**Data flow traced:** `view.weapons` (server view: weapon→room, a fixed enum) → `weaponTiles` layout → `<image href="/shared/portraits/${w}.png">`. `w` is a `WeaponId` union, never free-form, so the href is not injectable. Safe.

**Pattern observed:** two-layer render — portrait `<image>` behind a translucent `.clue-room` scrim polygon, labels haloed via `paint-order: stroke` — mirrors the existing token-over-board layering; consistent with the file idiom (`Board.tsx:120-133`).

**Error handling:** both `Map.get` sites guarded with `?? 0`; missing-portrait degrades to blank, guarded by the drift test.

### Rule Compliance (TypeScript lang-review)
- #1 Type escapes: no `as any` / `@ts-ignore` / double-cast in added code. Pre-existing `!` on `view.movement!` (`Board.tsx:47-48`) is unchanged context — logged as a Gap. ✓ (added code)
- #4 Null/undefined: `?? 0` on both `Map.get` sites — correct (`0` is valid). ✓
- #5 Modules: `.js` extension on the relative import; `import type` for type-only symbols. ✓
- #6 React/JSX: stable keys (not index); pure render (no `useEffect`/`useMemo` pitfalls); no `dangerouslySetInnerHTML`. ✓
- #2/#3/#7/#8: no generics / enums / async / test changes in this diff. N/A

### Devil's Advocate
Suppose this board is broken. The most plausible failure is the weapon-tile layout: tiles anchor at each room's lower-left and step right by `WEAPON_SIZE * 0.62` per additional weapon in the same room. Clue's engine can legally pile several weapons into one room, and the smallest rooms (conservatory, library, billiard room — 6×4/6×5 cells) are only ~130–156px wide. Six tiles at 39px stepping 24px reach ~159px from the left wall — the last tile's edge would poke past a narrow room's right boundary and can sit under the room label. A confused player might read a half-clipped weapon as a rendering bug. However: `.clue-weapon-img` is `pointer-events:none`, so even an overflowing tile never intercepts a room click; the room polygon underneath still drives `onPickRoom`. So it is cosmetic, not functional. A second angle: the `<image href>` is built by string-interpolating a room/weapon id — could a malicious `view` inject a path? No: `RoomId`/`WeaponId` are fixed unions produced by the server engine, never user text, so path traversal/XSS is impossible here. A third: what if a portrait 404s? Unlike the card path there is no onError glyph fallback, so the room/weapon would render blank — but the `clue-card-art-drift` test asserts every referenced portrait exists on disk and is GREEN, so a missing file fails CI before it ships. A fourth: the downscale — could 640px look mushy on a 3× phone where the widest room paints ~756 device px? Slightly, but the 0.36 scrim sits on top and hides softening; acceptable for a board background. A fifth: `bbox` uses `Math.min/max(...spread)` over polygon points — fine for the 4-point rectangles here; a pathological huge polygon could blow the call stack, but board rooms are fixed 4-vertex rects from a pinned geometry mirror. None of these rise to High. The edge-overflow and missing-fallback are worth a follow-up but do not block.

**Handoff:** To SM (Slartibartfast) for finish-story.