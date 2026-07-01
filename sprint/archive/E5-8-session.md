---
story_id: "E5-8"
jira_key: ""
epic: "E5"
workflow: "tdd"
---
# Story E5-8: Colour picker + duplicate-colour uniqueness + seat-strip/continent-pip colour threading (E5-7 follow-up)

## Story Details
- **ID:** E5-8
- **Jira Key:** (none)
- **Workflow:** tdd
- **Stack Parent:** none

## Branch Strategy
**Strategy:** trunk-based (branching skipped — work happens on the default branch `main`)

Repo g-1 is standalone/trunk-based; no feature branch is created. Development proceeds directly on `main`, as with E5-3 and E5-7.

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-07-01T09:29:35Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-01T09:06:46Z | 2026-07-01T09:09:16Z | 2m 30s |
| red | 2026-07-01T09:09:16Z | 2026-07-01T09:19:00Z | 9m 44s |
| green | 2026-07-01T09:19:00Z | 2026-07-01T09:24:06Z | 5m 6s |
| review | 2026-07-01T09:24:06Z | 2026-07-01T09:29:35Z | 5m 29s |
| finish | 2026-07-01T09:29:35Z | - | - |

## Story Context

**This is the SANCTIONED follow-up split from E5-7.** E5-7 delivered only the result-display half (colour resolution in `themes.ts` + roll-off panel). Three items were explicitly deferred to E5-8 and are logged as **blocking Delivery Findings** in the E5-7 archive at `sprint/archive/E5-7-session.md`. TEA MUST read that archive before pickup.

### Three Acceptance Threads (from E5-7 archive + Reviewer finding)

1. **Colour Picker UI** (E5-7 context AC "4. Colour picker exists"): per-seat colour picker in pre-game/lobby that produces `participant.color` into the game's colour model (`participant.color` / seat-indexed `state.colors`).

2. **Duplicate-Colour Uniqueness** (E5-7 context AC5): duplicate colours prevented OR clearly surfaced. (Server does NOT dedupe today.)

3. **Seat-Strip + Continent-Pip Colour Threading** (E5-7 Reviewer confirmed Medium finding, dormant): make these surfaces colour-aware. Currently paint raw seat index via `--pN` CSS-class path, NOT touched by E5-7's `themes.ts` threading. Concrete sites:
   - `src/clients/risk/Header.tsx:64` (seat-strip dot `var(--p${seat}-1)`)
   - `Header.tsx:79` (`pipClass = p${currentPlayer}`)
   - `Header.tsx:80` (crest fallback, 2P-only)
   - `src/clients/risk/ContinentRail.tsx:34` (`pip p${o}`)
   
   Fix: map seat→`view.colors[seat]` slot BEFORE emitting `--p${slot}` (mirror the `paletteSlot` model from E5-7's `themes.ts`), keeping board/crest/seat-strip/dice consistent under ONE model. No regression: identity/empty `view.colors` must still reproduce today's Red/Blue/Green/Yellow palette.

### HIGHEST-UNCERTAINTY / DESIGN BLOCKER

**Flag prominently for discovery at red-phase pickup:**

The colour **PICKER** is **design-blocked**. Two colour models coexist and the picker has no located home:
- Legacy 2P: `state.colors = {a,b}` — creator-picks-colour at vanilla-JS lobby `public/lobby/lobby.js`, threaded by game-create route (see `test/games-create.test.js`).
- New seat-indexed: `state.colors = number[]` (from E5-3, risk plugin).

A per-seat N-player picker's home is undecided (vanilla-JS lobby vs. React in-game setup). E5-7's TEA/Dev/Reviewer all said this "needs UX/Architect discovery before build."

**TEA MUST locate the game-setup flow first** and raise a Delivery Finding (and possibly request a UX/Architect design pass, or a further picker-vs-threading split) if the picker is not build-ready. **The seat-strip/pip threading (thread 3) is NOT design-blocked** and can proceed regardless.

### Testable Seams (TDD Entry Points)

- Seat→slot colour resolution for Header/ContinentRail (pure, unit-testable — same pattern as `paletteSlot` in `themes.ts`).
- Duplicate-colour detection (pure predicate — unit-testable).
- Picker view-model / colour-choice emission (unit-testable once the home is located).
- Genuinely visual surfaces (crest SVG paint, WebGL dice material) are integration/manual (rebuild + observe) — TEA should call these out, not fake-assert them.

### Key Files

- `src/clients/risk/themes.ts` (paletteSlot model to mirror)
- `src/clients/risk/Header.tsx`
- `src/clients/risk/ContinentRail.tsx`
- `src/clients/risk/RiskApp.tsx`
- `public/lobby/lobby.js` (legacy picker home + game-create producer)
- Game-create route
- Server `state.colors` model

### Build/Deploy Trap (Project Memory)

`.ts/.tsx` changes are INERT until `npm run build:client` + server restart. Tests are vitest (`npm run test:client`); there is NO tsc gate (build = esbuild). Pre-existing tsc errors in `RiskApp.tsx` are known debt — out of scope.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

**From E5-7 archive (blocking for E5-8 scope discovery):**
- **Gap** (blocking for picker + AC5, non-blocking for seat-strip/pip threading): The colour **picker UI** (E5-7 context AC "4. Colour picker exists") and **duplicate-colour uniqueness** (AC5) were deferred from E5-7. Picker is design-blocked — TWO colour models coexist (legacy 2P vs. new seat-indexed) with no located home (vanilla-JS lobby vs. React in-game setup). Needs UX/Architect discovery before build. *Found by E5-7 TEA during test design.*
- **Medium** (non-blocking for result-display, dormant until picker lands): E5-7 Reviewer found AC1 "seat strip" (Header.tsx:64, ContinentRail.tsx:34) are NOT colour-aware — they paint raw seat index via `--pN` CSS, not threaded through `themes.ts`. Dormant today (identity ⇒ `--p${seat}` == `--p${slot}`), but must be threaded with the picker. *Tracked for E5-8 thread 3.*

### TEA (test design)
- **Gap** (blocking for threads 1+2 — colour picker + duplicate uniqueness): discovery CONFIRMED the picker has no build-ready home. Traced both producers/consumers: the risk server (`plugins/risk/server/state.js:51-55`) wants each `participant.color` to be an **integer palette-slot index** → `state.colors: number[]` (E5-3 seam); the only existing picker (`public/lobby/lobby.js` `showColorStep` + `PLUGIN_COLORS`, threaded by the `/api/games` route) produces a **named-colour string**, is **creator-only + 2-player** (opponent takes the "contrast"), emits the legacy `state.colors = {a,b}` model, and has **no `risk` entry** (so risk games get no picker today). A per-seat, N-player (2-4P) picker that emits slot indices has no surface, and there is **no client→server colour-mutation action** in the risk plugin (`state.colors` is seeded once at `initialState`, never mutated). Choosing the picker's home (vanilla-JS lobby vs. a new React setup-phase surface), its wire shape (named string vs. slot index), the per-seat N-player flow, and the server action is a genuine UX + architecture decision. **Recommend a follow-up story (E5-9) gated on a UX/Architect design pass before build.** Affects `public/lobby/lobby.js`, the `/api/games` create route, `plugins/risk/server/state.js`, `src/clients/risk/*`. *Found by TEA during test design.*
- **Improvement** (non-blocking, moves with the picker): duplicate-colour uniqueness (E5-7 AC5) has no trigger without the picker — `state.colors` defaults to identity (all distinct). Its dedupe-predicate signature depends on the picker's chosen wire shape (named vs. slot-index, per-side vs. per-seat), so writing it now would lock a contract before the design decision. It belongs with thread 1 in E5-9. Affects the same picker producer. *Found by TEA during test design.*
- **Improvement** (non-blocking): `themes.ts` hardcodes the 4-slot palette (`PALETTE_SIZE = 4`; `seatClass`/`seatFill`/`seatInk` guard `owner > 3`). Thread-3 consumers route through these, so they inherit the cap. If Risk 5-6P support (config-level per project memory) lands, these need to derive from `SEAT_HEX.length` rather than the literal 4. Out of scope for E5-8. Affects `src/clients/risk/themes.ts:6,33,41,49`. *Found by TEA during test design (re-confirming E5-7 Reviewer's low finding).*

### Dev (implementation)
- **Improvement** (non-blocking): the seat-strip dot now routes through `seatFill`, which returns `var(--neutral)` for a seat index > 3 (the `PALETTE_SIZE=4` cap), whereas the old raw `var(--p${seat}-1)` would emit an undefined `--p4-1`/`--p5-1` var. This is inert today (Risk seats the strip only for 2-4P, indices 0-3) and is an improvement (neutral > undefined), but it's the same 5-6P cap the TEA finding above tracks — the 5-6P follow-up must widen `themes.ts` for the strip to colour seats 4-5. Affects `src/clients/risk/themes.ts`, `src/clients/risk/Header.tsx`. *Found by Dev during implementation.*
- No blocking upstream findings during implementation — TEA's plan mapped cleanly to four `themes.ts` calls; the risk bundle rebuilds without error.

### Reviewer (code review)
- **Improvement** (non-blocking): the E5-9 picker follow-up is the LAST consumer to thread — after it lands, every seat-colour surface (board, crest, dice, seat-strip, turn-pip, continent pips) reads `view.colors` under one model. No colour surface remains on the raw-index path after this story. E5-9 should add a cross-surface visual/integration check with a non-identity `view.colors` (the unit pins only cover jsdom-observable class/attr/style, not the WebGL dice material or crest SVG paint on screen). Affects `src/clients/risk/*`. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `themes.ts` `PALETTE_SIZE`/`owner > 3` cap now gates FIVE consumers (board, crest, dice, seat-strip, pips) rather than being isolated — when Risk 5-6P (config-level per project memory) lands, widening `themes.ts` (derive from `SEAT_HEX.length`) unblocks all of them at once, but ALL five must be re-verified. Affects `src/clients/risk/themes.ts`. *Found by Reviewer during code review (re-confirming the TEA/Dev cap findings).*

## Impact Summary

**Upstream Effects:** No upstream effects noted
**Blocking:** None

### Deviation Justifications

1 deviation

- **Deferred threads 1 (colour picker UI) + 2 (duplicate-colour uniqueness) — RED covers thread 3 only (seat-strip/turn-pip/crest/continent-pip threading)**
  - Rationale: Discovery confirmed the picker is design-blocked (two incompatible colour models; no build-ready home; no client→server colour action) — see the blocking Delivery Finding. The SM assessment pre-authorised "a further picker-vs-threading split (thread 3 can ship on its own)." Faking a picker design to force a green would lock the wrong contract. Thread 3 is fully unblocked and shippable now.
  - Severity: major (2 of 3 threads deferred)
  - Forward impact: follow-up story (recommend E5-9) required, gated on a UX/Architect design pass; duplicate-uniqueness moves with the picker as its producer.

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Deferred threads 1 (colour picker UI) + 2 (duplicate-colour uniqueness) — RED covers thread 3 only (seat-strip/turn-pip/crest/continent-pip threading)**
  - Spec source: context-story-E5-7.md, ACs "4. Colour picker exists" and "5. Duplicate colours are prevented or clearly surfaced" (carried into E5-8 as threads 1+2)
  - Spec text: "A player can choose a colour pre-game; the choice flows to the server (`participant.color`) and back through `view.colors`." / "Two seats cannot silently end up the same colour."
  - Implementation: No tests written for a picker UI or duplicate-colour uniqueness. This RED phase writes 12 tests (`test/client/risk-seat-colors.test.tsx`) covering ONLY thread 3 — the seat-strip dot, turn-pip, crest fallback, and continent-pip colour threading through `view.colors`.
  - Rationale: Discovery confirmed the picker is design-blocked (two incompatible colour models; no build-ready home; no client→server colour action) — see the blocking Delivery Finding. The SM assessment pre-authorised "a further picker-vs-threading split (thread 3 can ship on its own)." Faking a picker design to force a green would lock the wrong contract. Thread 3 is fully unblocked and shippable now.
  - Severity: major (2 of 3 threads deferred)
  - Forward impact: follow-up story (recommend E5-9) required, gated on a UX/Architect design pass; duplicate-uniqueness moves with the picker as its producer.

### Dev (implementation)
- No deviations from spec. Implemented TEA's four prescribed `themes.ts` rewires exactly: seat-strip dot → `seatFill(seat, view.colors)`, turn-pip → `seatClass(view.currentPlayer, view.colors)`, crest fallback → `factionColor || seatFill(view.youAre ?? 0, view.colors)`, ContinentRail pip → `seatClass(o, view.colors)`. The pip className is built as `` cls ? `pip ${cls}` : "pip" `` — a faithful rendering of `seatClass` (which already returns `""` for null/out-of-range), producing identical class output to the old space-prefix idiom. Threads 1+2 left untouched per the sanctioned split.

### Reviewer (audit)
- **TEA — Deferred threads 1+2 (picker + duplicate uniqueness), RED covers thread 3 only** → ✓ ACCEPTED by Reviewer: independently confirmed the picker is genuinely design-blocked — two incompatible colour models (risk server wants an integer slot per `participant.color` at `plugins/risk/server/state.js:51-55`; the only picker `public/lobby/lobby.js` emits a named string, is creator-only/2P, and has no `risk` entry), and there is no client→server colour-mutation action. The split is pre-authorised by the SM assessment. Deferring is correct, not corner-cutting.
- **Dev — No deviations; implemented TEA's four rewires exactly** → ✓ ACCEPTED by Reviewer: diff-verified each of the four sites matches TEA's prescription. The ContinentRail `` cls ? `pip ${cls}` : "pip" `` renders byte-identical class output to the old space-prefix idiom for null/owned owners (seatClass returns "" for null, `p${slot}` for 0-3). No undocumented deviation.
- **No undocumented deviations found.** The shipped diff matches the ACs it targets (thread 3, AC1 "seat strip" + AC2 no-regression); deferred threads 1+2 and the dormant 5-6P seat-strip behaviour are both tracked, not silent.

## Sm Assessment

**Story:** E5-8 — Colour picker + duplicate-colour uniqueness + seat-strip/continent-pip colour threading (5pts, p2, tdd). This is the **sanctioned E5-7 follow-up split** — E5-7 shipped only the result-display half (`themes.ts` colour resolution + roll-off panel) and logged three items as **blocking Delivery Findings** for this story.

**Readiness:** Ready for red phase with one flagged blocker (below). Session Story Context + `sprint/context/context-story-E5-8.md` capture all three threads, the testable seams, key files, and the design blocker. TEA MUST read `sprint/archive/E5-7-session.md` before pickup — it is where the deferred scope, the two-colour-model discovery, and the confirmed Medium seat-strip finding are recorded in full.

**What is already DONE (do NOT rebuild):**
- Server seam from E5-3: `state.colors = number[]` (per-seat palette-slot index, identity default, out-of-range sanitised) and `RiskView.colors?: number[]` — the typed boundary. E5-7 threaded it through `themes.ts` (`paletteSlot`) into board/crest/dice/EndScreen. That model is the pattern to MIRROR, not rebuild.

**The three threads (for TEA):**
1. **Colour picker UI** (E5-7 context AC4) — the producer of a per-seat colour choice. **This is the design-blocked one.**
2. **Duplicate-colour uniqueness** (E5-7 AC5) — pure predicate; server does NOT dedupe today. Belongs with the picker (its producer), so it moves with thread 1.
3. **Seat-strip + continent-pip threading** (E5-7 Reviewer's confirmed Medium) — `Header.tsx:64/79/80`, `ContinentRail.tsx:34` paint the RAW seat index via the `--pN` CSS-class path, untouched by E5-7. Map seat→`view.colors[seat]` slot before emitting `--p${slot}`; identity/empty must reproduce today's Red/Blue/Green/Yellow. **NOT design-blocked — can proceed independently.**

**Testable seams (TDD entry points):** seat→slot resolution for Header/ContinentRail (pure, mirrors `paletteSlot`), duplicate-colour detection (pure predicate), picker view-model/emission (once the home is located). Genuinely visual surfaces (crest SVG paint, WebGL dice material) are integration/manual (rebuild + observe) — TEA should call these out, not fake-assert them, exactly as in E5-7.

**Highest-uncertainty item — flagged for discovery at pickup:** *Where does the colour picker live?* Two colour models coexist — legacy 2P `state.colors = {a,b}` (creator picks at the vanilla-JS lobby `public/lobby/lobby.js`, threaded by the game-create route) vs. the new seat-indexed `number[]` (E5-3). A per-seat N-player picker has no located home. E5-7's TEA/Dev/Reviewer all called for **UX/Architect discovery before build**. TEA: locate the game-setup flow first; if the picker is not build-ready, raise a blocking Delivery Finding and request a UX/Architect design pass or a further **picker-vs-threading split** (thread 3 can ship on its own). Do not fake-design the picker to force a green.

**Build/deploy trap (project memory):** client bundles are gitignored — `src/clients/risk/*` changes are inert until `npm run build:client` + server restart. A green `.ts` unit test does not prove the rendered UI changed; the cross-surface (seat strip, pips, crest, dice) checks are rebuild + manual/integration. No tsc gate (build = esbuild); pre-existing `RiskApp.tsx` type debt is out of scope.

## TEA Assessment

**Tests Required:** Yes (thread 3 only — threads 1+2 deferred, see Design Deviation)
**Reason:** Discovery confirmed the colour picker (thread 1) + duplicate uniqueness (thread 2) are design-blocked with no build-ready home. Thread 3 (seat-strip/turn-pip/crest/continent-pip colour threading) is fully unblocked and unit-testable — RED covers it.

**Test Files:**
- `test/client/risk-seat-colors.test.tsx` — 12 tests: Header seat-strip dot (`:64`), turn-pip (`:79`), crest fallback (`:80`), and ContinentRail pip (`:34`) must resolve seat→slot through `view.colors` (mirroring `themes.ts` `paletteSlot`), with no-regression + slot-0-safety guards.

**Tests Written:** 12 tests covering thread 3 (E5-7 AC1 "consistent across seat strip" + AC2 "no regression" for the untouched surfaces).
**Status:** RED — verified by testing-runner: **255 passed / 6 failed** across 48 files; all 6 failures are the thread-3 threading assertions in `risk-seat-colors.test.tsx`, zero collateral failures. The 6 no-regression/guard pins pass.

### Rule Coverage

| Rule (TS lang-review) | Test(s) | Status |
|------|---------|--------|
| #4 null/undefined — `?? seat` not `\|\| seat` (slot 0 is non-falsy) | `honours a seat that picks palette slot 0` (dot), `honours an owner that picks palette slot 0` (pip) | failing (RED) |
| #6 React/JSX — colour bound to a stable model, not raw index | all 6 threading pins (dot/pip/crest resolve via `view.colors`) | failing (RED) |
| #10 input validation — out-of-range slot falls back to identity | covered by `themes.ts` `paletteSlot` (green in `risk-colors.test.tsx`); thread-3 consumers inherit it | green (existing) |
| AC2 no-regression — identity palette when `colors` undefined | 3 no-regression pins (dot/pip/turn-pip) + crest identity | green (guard) |
| neutral guard — unowned pip carries no `pN` class | `leaves unowned pips without a seat-colour class` | green (guard) |

**Rules checked:** 3 of 3 applicable TS lang-review rules (#4, #6, #10) have thread-3 test coverage. #10 is enforced at the `themes.ts` seam the consumers route through.
**Self-check:** 0 vacuous tests — every test has meaningful assertions; the 6 guards would go RED if a fix broke the identity/neutral/slot-0 paths (not always-green). Throwaway jsdom var()-observability probe was written, used, and deleted.

**Handoff:** To Dev (Baldrick) for GREEN — rewire the four raw-index sites through `themes.ts`: seat-strip dot → `seatFill(seat, view.colors)` (`Header.tsx:64`), turn-pip → `seatClass(view.currentPlayer, view.colors)` (`Header.tsx:79`), crest fallback → `factionColor || seatFill(view.youAre ?? 0, view.colors)` (`Header.tsx:80`), ContinentRail pip → `seatClass(o, view.colors)` (`ContinentRail.tsx:34`, returns `""` for null owner). Import from `./themes`. Do NOT touch threads 1+2 (deferred to E5-9). Remember: `.tsx` changes are inert until `npm run build:client` + restart — the cross-surface visual check is manual, but the 12 unit pins are the contract.

**Routing:** Phased tdd → handoff to TEA (Lord Melchett) for the red phase.

## Dev Assessment

**Implementation Complete:** Yes (thread 3 — seat-strip/turn-pip/crest/continent-pip colour threading). Threads 1+2 (picker + duplicate uniqueness) intentionally NOT implemented — deferred to E5-9 per the sanctioned split (see TEA's blocking Delivery Finding + Design Deviation).

**Files Changed:**
- `src/clients/risk/Header.tsx` — import `{ seatClass, seatFill }` from `./themes`; seat-strip dot `background` → `seatFill(seat, view.colors)` (:64); `pipClass` → `seatClass(view.currentPlayer, view.colors)` (:79); crest fallback → `factionColor || seatFill(view.youAre ?? 0, view.colors)` (:80).
- `src/clients/risk/ContinentRail.tsx` — import `{ seatClass }` from `./themes`; pip class → `seatClass(o, view.colors)` rendered as `` cls ? `pip ${cls}` : "pip" `` (:34).
- (also committed the sm-setup context artifacts `sprint/context/context-story-E5-8.md`, `context-epic-E5.md` to keep the trunk clean.)

**Tests:** 12/12 thread-3 tests GREEN; full client suite **261/261 passing** across 48 files (verified by testing-runner, run E5-8-dev-green, 0 failures). No test files touched — the RED contract was met by source changes only.

**Build:** `npm run build:client` rebuilds risk (389 kB) + sorry bundles clean, no esbuild errors — the `themes.ts` rewiring compiles. (Bundles are gitignored; not committed.)

**Branch:** `main` (trunk-based, no feature branch); commits `e4109a2` (RED tests, TEA) + `fefccf4` (impl) pushed to `origin/main`.

**Manual/visual check (NOT unit-coverable, per E5-7 precedent):** the four surfaces now paint correctly only observable after a rebuild + server restart with a NON-identity `view.colors` — but there is **no producer of a non-identity colour until the E5-9 picker lands**, so today every surface renders the identity palette exactly as before (dormant-until-picker, zero user-visible change now). The unit pins are the forward contract.

**Handoff:** To Reviewer (Captain Darling) for code review. Scrutinise: (1) the `seatFill`/`seatClass` slot-0 safety carries through the new call sites; (2) the ContinentRail className construction matches the old output for null/owned owners; (3) the seat-strip 5-6P neutral-vs-undefined behaviour note (Dev finding); (4) confirm threads 1+2 deferral is acceptable.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | 0 (261/261 tests pass; Header/ContinentRail tsc-clean; 0 smells) | confirmed 0, dismissed 0, deferred 0 |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [EDGE] below) |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [SILENT] below) |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [TEST] below) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [DOC] below) |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [TYPE] below) |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [SEC] below) |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [SIMPLE] below) |
| 9 | reviewer-rule-checker | No | Skipped | disabled | Disabled via settings — domain covered by Reviewer (see [RULE] below) |

**All received:** Yes (1 enabled subagent returned clean; 8 disabled via `workflow.reviewer_subagents` and covered manually)
**Total findings:** 0 confirmed blocking, 4 LOW/non-blocking observations, 0 dismissed

## Reviewer Assessment

**Verdict:** APPROVED

A minimal, faithful thread-3 rewiring (2 source files, 4 call sites) with a strong test contract. The diff routes the last four raw-index colour surfaces through the existing E5-7 `themes.ts` model. No Critical/High. Every observation is dormant-or-equivalent for the shipped (identity) state and correct for the future (picker) state.

**Data flow traced:** `view.colors` (server E5-3 seam — `number[]`, identity default, integer-sanitised at `plugins/risk/server/state.js:52-55`) → `RiskView.colors?` → `Header`/`ContinentRail` → `seatFill(seat, view.colors)` / `seatClass(o, view.colors)` → `paletteSlot(owner, colors)` **re-validates** (`typeof pick === "number" && Number.isInteger && 0 ≤ pick < 4`, else identity — `themes.ts:13-18`) → `var(--p${slot}-1)` / `p${slot}` → CSS. Double-validated (server + client); the interpolated slot is ALWAYS an integer 0-3, so the CSS-var/class interpolation cannot be poisoned.

**Pattern observed:** Consumer-side rewire to a single shared resolver (`themes.ts`) — board/crest/dice (E5-7) and now seat-strip/turn-pip/pips all read one model. Good consolidation; no divergence.

### Observations (10)

1. `[VERIFIED]` **AC2 no-regression** — `seatFill`/`seatClass` with undefined/empty `view.colors` return the exact old values (`var(--pN-1)`/`pN`); evidence: `themes.ts:13-18` returns `owner` when `colors` unset/invalid, and the 6 no-regression pins pass.
2. `[VERIFIED]` `[SEC]` **No CSS/class injection** — every interpolated slot is integer-guarded at `themes.ts:15`; `view.colors` is `number[]` and double-validated. Even a hostile `colors:["x"]` is rejected by the `typeof === "number"` check → identity. No `dangerouslySetInnerHTML`.
3. `[VERIFIED]` `[TYPE]` **Type-clean** — `seatClass(o: number|null, view.colors: number[])` and `seatFill` assign cleanly to `(number|null|undefined, readonly number[])`; no `as any`/casts in source; preflight `tsc --noEmit` confirms Header/ContinentRail are error-free (the 7 tsc errors are pre-existing, in unrelated Sorry/AiRoster files).
4. `[VERIFIED]` `[EDGE]` **Boundary paths covered** — undefined colors, empty `[]`, out-of-range slot, slot 0, and null owner (neutral) all have passing pins; slot-0 safety (`?? owner`, not `|| owner`) carries through both call sites.
5. `[VERIFIED]` `[SILENT]` **No swallowed errors** — pure functions, no try/catch, no fallback that hides a failure; the `colors`-undefined path is an intentional, tested identity fallback.
6. `[VERIFIED]` `[DOC]` **No stale docs** — no comments changed; the "Test contract" phase comment and file headers remain accurate.
7. `[LOW]` `[RULE]` **Seat-strip dot 5-6P behaviour change** — `seatFill` returns `var(--neutral)` for seat > 3 vs the old undefined `var(--p4-1)`. Dormant: Risk is 2-4P (`SeatStrip` renders `seats.map`, capped at the game's seat count), so no seat > 3 exists today. For the ContinentRail pip the change is even visually identical (no `.p4/.p5` CSS rule exists — confirmed). Dev-flagged; tracked for the 5-6P follow-up. Non-blocking.
8. `[LOW]` `[SIMPLE]` **turn-pip trailing space** — `` `turn-pip ${pipClass}` `` yields `"turn-pip "` if `pipClass` is `""`. Only reachable if `currentPlayer` were null, but the contract types it `PlayerIdx` (non-nullable, `risk.ts:69`) and it's set once the game is built. Cosmetic, no functional impact. Non-blocking.
9. `[LOW]` `[TEST]` **`as never` fixture casts** — the new test uses `as never` for partial `RiskView` mocks; consistent with the codebase's `as any` fixture idiom (`risk-colors.test.tsx`), scoped to tests, and the 12 assertions are concrete (values/classes/counts), not vacuous — verified RED→GREEN transition proves they bind. Non-blocking.
10. `[VERIFIED]` `[SIMPLE]` **crest `||` is correct** — `factionColor || seatFill(...)` (preflight-flagged) is a STRING fallback where `""` should fall through to the palette; `||` is right here (not a rule #4 numeric case), and it preserves the old behaviour exactly. The numeric default on the same line correctly uses `?? 0`.

### Rule Compliance (TS lang-review checklist)

- **#1 type-safety escapes:** compliant — 0 `as any`/`@ts-ignore`/non-null `!` in the two source files (preflight grep + my read).
- **#4 null/undefined:** compliant — slot-0 survives via `themes.ts` `?? owner`-equivalent integer guard at the new call sites; the one `||` is a legitimate string fallback (obs #10).
- **#6 React/JSX:** compliant — stable `key={seat}`/`key={id}` (not `key={index}` on a reorderable list), no `useEffect` change, no `dangerouslySetInnerHTML`.
- **#10 input validation:** compliant — colour input validated at the `paletteSlot` seam; interpolated value is always an integer 0-3.
- **#5 module/imports:** compliant — `./themes` (no extension) matches the project convention for sibling `.ts/.tsx` (`./ExitControls`, `./MuteToggle`); `.js` extension is reserved for genuine `.js` modules (`./map-geometry.js`). Not a Node16 gate here (bundler resolution, vite/esbuild).
- Remaining checks (#2 generics, #3 enums, #7 async, #9 build-config, #11 error-handling, #12 perf) — N/A to this pure-rendering diff.

### Devil's Advocate

Let me argue this code is broken. **First**, a malicious server sends `view.colors = ["</style><script>"]` to inject through the `var(--p${slot}-1)` interpolation. *Refuted:* `paletteSlot` (`themes.ts:15`) gates every pick with `typeof pick === "number" && Number.isInteger && 0 ≤ pick < 4`; a string fails the first clause and falls back to the integer `owner`. The interpolated value is provably always an integer 0-3 — no injection surface exists. **Second**, a 6-player game paints seat 4's strip dot neutral-brown where it used to be transparent, confusing players. *Refuted:* Risk is 2-4P today; `SeatStrip` maps over `view.seats` (length = seat count), so no index 4 is ever produced. Dormant until a 5-6P story deliberately widens `themes.ts` — and that story must re-verify all five consumers (filed). **Third**, a confused user sees two seats with the same dot colour. *Refuted:* that's the duplicate-colour concern (thread 2), which has no trigger until the E5-9 picker — `state.colors` defaults to identity (all distinct) and nothing mutates it yet. **Fourth**, the turn-pip vanishes when `pipClass` is `""`. *Refuted:* `currentPlayer` is a non-nullable `PlayerIdx` set at game build; and even in the impossible null case the old code produced `pundefined` (equally class-less) — no regression, and the pip is decorative. **Fifth**, the ContinentRail className diverges from the old output and breaks CSS. *Refuted:* for null owner both produce `"pip"`; for owner 0-3 both produce `"pip pN"` — `seatClass` returns `""`/`p${slot}` and the ternary reassembles the exact class list; the 4 pip pins (including neutral + slot-0) pass. **Sixth**, empty `view.colors = []` throws or mis-renders. *Refuted:* `colors?.[owner]` is `undefined` → not a number → identity fallback (tested). Net: the diff is correct and safe for what it ships; every "break" is either impossible in the current config or an equivalent no-op, and the two dormant items are tracked for E5-9/5-6P.

**Handoff:** To SM (Edmund Blackadder) for finish-story.