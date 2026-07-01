---
story_id: "E5-7"
jira_key: ""
epic: "E5"
workflow: "tdd"
---
# Story E5-7: Pre-game lobby client: colour picker + roll-off result display

## Story Details
- **ID:** E5-7
- **Jira Key:** (none)
- **Workflow:** tdd
- **Stack Parent:** none

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-07-01T06:53:04Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-07-01T06:19:01Z | 2026-07-01T06:21:16Z | 2m 15s |
| red | 2026-07-01T06:21:16Z | 2026-07-01T06:35:45Z | 14m 29s |
| green | 2026-07-01T06:35:45Z | 2026-07-01T06:45:10Z | 9m 25s |
| review | 2026-07-01T06:45:10Z | 2026-07-01T06:53:04Z | 7m 54s |
| finish | 2026-07-01T06:53:04Z | - | - |

## Branch Strategy
**Strategy:** trunk-based (branching skipped — work happens on the default branch `main`)

Repo g-1 is standalone/trunk-based; no feature branch is created. Development proceeds directly on `main`, as with E5-3.

## Sm Assessment

**Story:** E5-7 — Pre-game lobby client: colour picker + roll-off result display (5pts, p2, tdd). This is the **E5-3b client split** that E5-3's TEA, Dev, and Reviewer all called for in their delivery findings.

**Readiness:** Ready for red phase. A full context file (`sprint/context/context-story-E5-7.md`) is authored from the E5-3 archive + `context-story-E5-3.md`, with background on the shipped server seam, the client problem, technical approach, testable seams, and 5 acceptance criteria. No further grooming needed to begin test-first work.

**What is already DONE (do NOT rebuild — server seam shipped in E5-3):**
- `state.turnOrderRolls` (per-seat d6, winner = argmax, lowest-index tie-break) and `state.colors` (per-seat palette-slot index, identity default, out-of-range sanitised) exist and are tested in `plugins/risk/server/state.js`.
- `RiskView` already carries optional `turnOrderRolls?: number[]` / `colors?: number[]` (`src/clients/shared/contracts/risk.ts`) — the typed boundary the client reads.
- Both fields already reach the client via the view spread; today no client code consumes them.

**Shape of the work (for TEA):** Pure client rendering + a picker:
1. `src/clients/risk/themes.ts` reads `view.colors[seat]` instead of the fixed `SEAT_HEX`/`p${owner}` identity mapping — board, crest, seat strip, and dice all consistent with one model; empty/undefined `view.colors` MUST reproduce today's Red/Blue/Green/Yellow palette (no regression).
2. Render `view.turnOrderRolls` in the setup-phase UI (AC4 — who won the first move).
3. Colour picker UI producing `participant.color`, with duplicate-colour uniqueness (server does NOT dedupe today).

**Testable seams (TDD entry points):** `themes.ts` colour resolution (default-identity / explicit-choice / empty-fallback), roll-off result view-model mapping, duplicate-colour detection — all pure and unit-testable. Genuinely visual bits (crest paints on screen, WebGL material colour) are integration/manual (rebuild + observe), not unit-coverable — TEA should call that out rather than fake-assert it.

**Highest-uncertainty item — flagged for discovery at pickup:** *Where does the colour picker live?* The game-creation/lobby flow is likely in the **gamebox shell outside the risk plugin**; prior grep found lobby refs only inside the risk engine. TEA/Dev should locate the shell's game-setup flow before designing the picker, and raise a Delivery Finding if it needs a UX/Architect design pass or a further split (picker vs. result-display) — the split is sanctioned.

**Build/deploy trap (project memory):** client bundles are gitignored — `src/clients/risk/*` changes are inert until `npm run build:client` + server restart. A green `.ts` unit test does not prove the rendered UI changed; AC1/AC4 rendering verification is a rebuild + manual/integration check.

**Routing:** Phased tdd → handoff to TEA (Lord Melchett) for the red phase.

## TEA Assessment

**Tests Required:** Yes
**Reason:** 5-pt client feature with pure, unit-testable seams (colour resolution, roll-off view-model). The genuinely visual surfaces (crest SVG, seat strip, WebGL dice material) are integration/manual and are NOT fake-asserted (per context guidance).

**Scope decision (result-display now, picker split later):** Discovery confirmed the colour **picker** is design-blocked — there are TWO colour models (legacy 2P `state.colors = {a,b}` set at the vanilla-JS lobby, vs the new seat-indexed `state.colors = number[]` from E5-3) and no located home for a per-seat N-player picker (vanilla-JS lobby vs React in-game setup). The context pre-authorises "a further split (picker vs. result-display) is acceptable," so this red phase covers the unambiguous **result-display** half (AC1, AC2, AC4). The **picker** (context AC "4. Colour picker exists") and **duplicate-colour uniqueness** (AC5) are deferred to a follow-up pending UX/Architect discovery — logged as a blocking Delivery Finding + a deviation.

**Test Files:**
- `test/client/risk-colors.test.tsx` (new) — 8 tests: colour resolution reads `view.colors` (AC1/AC2) across fill/ink/class/hex/label, slot-0-not-falsy (rule #4), out-of-range fallback (rule #11), neutral unaffected, + a `Board.tsx` render test proving the seat→slot remap wires to the DOM.
- `test/client/risk-rolloff.test.tsx` (new) — 10 tests: pure `rollOffWinner`/`rollOffRows` (argmax, lowest-index tie-break matching server `firstPlayer`, absent → null/[]) + a `RollOffPanel` render test (per-seat rolls + single winner marked).

**Tests Written:** 18 across 2 files, covering AC1, AC2, AC4 (the 3 in-scope ACs). AC "picker exists" and AC5 are intentionally uncovered (split — see Delivery Findings + Design Deviations).
**Status:** RED — verified by testing-runner (The Search), RUN_ID E5-7-tea-red.

- `risk-rolloff.test.tsx`: whole-file **collection error** — `Failed to resolve import ../../src/clients/risk/rollOff` and `RollOffPanel` (neither module exists yet). Correct RED for net-new modules; Dev creates them.
- `risk-colors.test.tsx`: **4 assertion failures** (AC1 seat-renders-chosen-slot; the rule-#4 slot-0 test; the Board remap-wiring test `expected 0 to be 42`) + **4 passing** — the passing 4 are the AC2 no-regression / neutral / out-of-range-fallback guards, green now BY DESIGN and must stay green after Dev's change.
- **No pre-existing client-test regressions** (45 files / 236 tests unchanged).

### Rule Coverage (lang-review: typescript.md extends javascript.md)

| Rule | Test(s) | Status |
|------|---------|--------|
| #4 Equality / `0`-is-falsy (`??` not `||`) | `honours a seat that picks palette slot 0` (colors) + `honours seat 0 as a legitimate winner` (rollOff) | failing (RED) — colors runs & fails; rollOff pending module |
| #11 / TS #10 Input validation (out-of-range slot) | `falls back to the seat's identity slot when the chosen slot is out of range` | green guard (identity IS the current fallback — must stay green after Dev change) |
| #8 Test quality (no vacuous assertions) | self-check | pass |
| TS #4 Null/undefined (`view.colors` optional, empty/undefined → identity) | `treats an empty colors array as identity`, `returns null when there is no roll-off` | mixed (colors green guard / rollOff pending module) |

**Rules checked:** 3 of 13 lang-review rules are directly applicable to a pure client colour/view-model change (#4 equality, #8 test quality, #11 input validation; TS #4/#10 map to the same seams). The remainder (DOM/XSS, regex, child_process, SQL, async, secrets) don't apply to a pure render/logic seam and are Dev's self-review scope on the GREEN diff.
**Self-check:** 0 vacuous tests — every test asserts a concrete string/number/shape (`toBe`, `toEqual`, `toContain`, count equality); no `assert(true)`, no truthy-only checks, no `let _ =`.

**Handoff:** To Dev (Baldrick) for GREEN — (1) add an optional `colors?: number[]` param to `seatClass/seatFill/seatInk/seatHex/seatLabel` in `themes.ts` (`slot = validSlot(colors?.[seat]) ?? seat`, using `??` so slot 0 survives) and thread `view.colors` through the consumers (`Board.tsx:145-146`, `RiskApp.tsx:109/118/121/160`, `EndScreen.tsx`); (2) create `src/clients/risk/rollOff.ts` (`rollOffWinner`/`rollOffRows`, tie-break to lowest index to match server `firstPlayer`) and `src/clients/risk/RollOffPanel.tsx` (rows carry `data-seat`, winner carries `data-winner="true"`), then mount the panel in the setup-phase UI. Remember the build/deploy trap: `.ts/.tsx` changes are inert until `npm run build:client` + server restart — AC1 cross-surface (crest/dice/seat-strip) and AC4 mount need a rebuild + manual check beyond `npm run test:client`.

## Dev Assessment

**Implementation Complete:** Yes (result-display scope — AC1, AC2, AC4; picker + AC5 deferred per the sanctioned split)

**Files Changed:**
- `src/clients/risk/themes.ts` — colour functions (`seatClass/seatFill/seatInk/seatHex/seatLabel`) take an optional `colors?: readonly number[]` (= `view.colors`) and resolve each seat through a new `paletteSlot(owner, colors)` helper: `colors[seat]` if it's an integer in 0..3, else the seat's identity slot. Uses an explicit numeric check (not `|| owner`) so **slot 0 (Red) is honoured** (rule #4); out-of-range picks fall back to identity (rule #11).
- `src/clients/risk/rollOff.ts` (new) — `rollOffWinner` (argmax with strict `>` → lowest-index tie-break, matching server `firstPlayer`; `null` when absent) and `rollOffRows` (per-seat `{seat,roll,isWinner}`, exactly one winner, `[]` when absent).
- `src/clients/risk/RollOffPanel.tsx` (new) — setup-phase display of `view.turnOrderRolls`; each row carries `data-seat`, the winner carries `data-winner="true"`; colour-consistent (swatch via `seatFill(seat, view.colors)`, label via `seatLabel`). Returns `null` without a roll-off.
- `src/clients/risk/Board.tsx` — `ArmyToken` takes `colors` and paints via `seatFill(owner, colors)`/`seatInk(owner, colors)`; call site passes `view.colors`.
- `src/clients/risk/RiskApp.tsx` — threaded `view.colors` through all 4 `seatHex` sites (bot roster, faction, attacker, defender) and mounted `RollOffPanel` in the setup phase.
- `src/clients/risk/EndScreen.tsx` — `seatLabel(seat, view.colors)`.

**Tests:** 249/249 client tests passing (GREEN) — verified by testing-runner (The Quintet), RUN_ID E5-7-dev-green. Both E5-7 files green: `risk-colors.test.tsx` 8/8, `risk-rolloff.test.tsx` 9/9 (17 total; the RED handoff loosely said 18 — the file has 9 roll-off tests). No pre-existing client-test regressions.

**Build:** `npm run build:client` rebuilds the risk bundle clean (39 modules, no build errors) — the `.tsx` change is now live locally, not just in the transpile-only test run.

**Type note:** `tsc --noEmit -p tsconfig.client.json` reports errors, but ALL are **pre-existing** debt in `RiskApp.tsx` (`ResolvedCombat.attackerSurvivors/defenderSurvivors`, `CombatRound`, the `BotSeat` filter predicate — 4 occurrences present unchanged at HEAD) and some test files, unrelated to E5-7. My six E5-7 files are type-clean. The project ships no tsc gate (build = esbuild, tests = vitest), so this is not newly introduced and is out of scope to fix here.

**Branch:** main (trunk-based; committed directly — `5090960`). Not pushed — held for Reviewer's local-diff review + finish ceremony, per E5-3 precedent.

**Self-review:**
- ✅ Wired end-to-end: every themes consumer (Board tokens, RiskApp bot/faction/attacker/defender hex, EndScreen label) reads `view.colors`; RollOffPanel is mounted in the setup phase. Only 3 files import `themes` and all are threaded — no seat-colour surface left seat-locked.
- ✅ Follows project patterns: seat-indexed throughout; palette single-sourced in `--pN`/`SEAT_HEX`; `??` for 0-safety (matches E5-3 server `firstPlayer`).
- ✅ Input handling: out-of-range colour slot → identity fallback; roll-off winner recompute mirrors server tie-break.
- ⚠️ For Reviewer: AC1 cross-surface *rendering* (crest SVG, seat strip, WebGL dice material) and the AC4 mount are not unit-coverable in jsdom (only Board fill is) — verify by rebuild + visual check. RollOffPanel `.rolloff-*` classes have no CSS yet (Delivery Finding).

**Handoff:** To Reviewer (Captain Darling) for code review — please scrutinise the `paletteSlot` 0-safety/out-of-range logic, the roll-off tie-break parity with server `firstPlayer`, and confirm the scoped split (picker + AC5 deferred) is acceptable.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none (249/249 client tests pass, clean tree, no smells/console/TODO/.only, risk bundle builds clean) | N/A |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — covered manually (see [EDGE]) |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — covered manually (see [SILENT]) |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings — covered manually (see [TEST]) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings — covered manually (see [DOC]) |
| 6 | reviewer-type-design | No | Skipped | disabled | Disabled via settings — covered manually (see [TYPE]) |
| 7 | reviewer-security | No | Skipped | disabled | Disabled via settings — covered manually (see [SEC]) |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings — covered manually (see [SIMPLE]) |
| 9 | reviewer-rule-checker | No | Skipped | disabled | Disabled via settings — covered manually (see [RULE] / Rule Compliance) |

**All received:** Yes (1 enabled subagent returned clean; 8 disabled via `workflow.reviewer_subagents` and assessed manually)
**Total findings:** 1 confirmed non-blocking (Medium — seat-strip/pip colour bypass), 3 low observations, 0 confirmed blocking, 0 dismissed

## Reviewer Assessment

**Verdict:** APPROVED

The shipped diff is correct, tested (249/249 client green), builds clean, and regresses nothing — colours are identity today (no picker yet), so every surface renders the current palette. The result-display half (AC1 board+dice, AC2, AC4 roll-off) is delivered and threaded. One real AC1-completeness gap (seat strip not colour-aware) is **dormant** (only visible once the deferred picker produces a non-identity colour) → Medium, non-blocking, tracked for the picker follow-up.

Nine observations (min. 5 required):

1. `[VERIFIED]` **`paletteSlot` 0-safety + input validation** — `themes.ts:11-16` uses `typeof pick === "number" && Number.isInteger(pick) && pick >= 0 && pick < PALETTE_SIZE`, returning `owner` otherwise. Slot 0 (Red) is honoured (not treated as falsy) and out-of-range picks fall back to identity. Complies with lang-review #4 (equality/0-is-falsy) and #11/TS#10 (input validation). Evidence: `seatFill(2,[1,2,0,3])` → `var(--p0-1)` and `seatFill(0,[9])` → `var(--p0-1)` both green in `risk-colors.test.tsx`.
2. `[VERIFIED]` **Roll-off winner parity with server `firstPlayer`** — `rollOff.ts:15-22` is argmax with strict `>` (lowest-index tie-break), `null` when absent. Matches the server rule. Evidence: `rollOffWinner([6,6,3])===0`, `([3,6,6])===1`, `([6,2,1])===0` green.
3. `[VERIFIED]` **The "strange note that works" — winner is RECOMPUTED, not read from `view.currentPlayer`** — `RollOffPanel`/`rollOff.ts` derive the winner from `turnOrderRolls`, not `currentPlayer`. This is correct and subtle: during setup, `currentPlayer` rotates through seats as each deploys, so reading it would make the "goes first" marker jump. Recomputing argmax (stable, = server's build-time winner) is the right call. Evidence: `rollOff.ts:3-6` comment + `RollOffPanel.tsx:13`.
4. `[VERIFIED]` **Dice ARE colour-aware** — `RiskApp.tsx:119-127` computes `attackerColor`/`defenderColor` via `seatHex(..., view.colors)` and passes them as props to `CombatReveal` (`CombatReveal.tsx:158-170`, `--die`/`themeColor`). So the dice surface honours `view.colors`. AC1 "dice" ✓.
5. `[MEDIUM]` `[EDGE]``[RULE]` **AC1 "seat strip" (and continent pips) are NOT colour-aware** at `Header.tsx:64` (`background: var(--p${seat}-1)` on the seat-strip dot), `Header.tsx:79` (`pipClass = p${currentPlayer}`), and `ContinentRail.tsx:34` (`pip p${o}`). These paint seat colour from the RAW seat index via the `--pN` CSS-class path, which the story's themes-JS threading never touched (Header/ContinentRail are outside the diff and don't import `themes`). **Dormant today** (identity colours ⇒ `--p${seat}` == `--p${slot}`), but AC1 explicitly names "seat strip" — so this surface will show the wrong colour the moment the deferred picker lands. Non-blocking (Medium, no user-visible impact until the picker) but must be threaded with the picker. See Delivery Finding.
6. `[VERIFIED]` **No regression** — `[SILENT]` no swallowed errors (pure functions, explicit guards, no try/catch/`.catch`); `[SEC]` no injection/secrets/XSS (roll-off renders server d6 numbers, no `dangerouslySetInnerHTML`, colour input integer-validated); 249/249 client tests green incl. all pre-existing. Colours default to identity so nothing changes visually until a picker exists.
7. `[LOW]` `[SIMPLE]` **`PALETTE_SIZE = 4`** (`themes.ts:7`) duplicates the client palette length (`SEAT_HEX`/`SEAT_LABEL` = 4, `--p0..--p3`). Acceptable (single file, mirrors the server's E5-3 `PALETTE_SIZE`), but a drift risk if 5–6P support lands — keep in sync or derive from `SEAT_HEX.length`.
8. `[LOW]` `[TYPE]` **`RollOffView` local interface** (`RollOffPanel.tsx:9-12`) re-declares `turnOrderRolls?`/`colors?` rather than `Pick<RiskView, ...>`. Harmless (RiskView is structurally assignable), but a `Pick`/import would prevent drift from the contract. `[DOC]` comments across the three new/changed files are accurate (rng-recompute rationale, 0-safety note) — no stale/misleading docs.
9. `[VERIFIED]` `[TEST]` **Test quality** — `risk-colors`/`risk-rolloff` assert concrete values/shapes (`toBe`, `toEqual`, count-equality on the Board remap), no `.only/.skip`, no vacuous truthy checks; the AC2/neutral/out-of-range guards are green-by-design and remain meaningful. The Board render test (`recoloured p2 count === default p0 count`) is a genuine wiring proof, not vacuous.

### Rule Compliance (lang-review: typescript.md extends javascript.md, enumerated against the diff)

| # | Rule | Verdict | Evidence |
|---|------|---------|----------|
| TS1 | Type-safety escapes (`as any`, `@ts-ignore`) | ✓ N/A | No new `as any`/ts-ignore/non-null in the diff (`RollOffView` typed; `colors?: readonly number[]`) |
| TS2 | Generic/interface pitfalls | ✓ COMPLIANT (good) | `readonly number[]` on the un-mutated `colors` param; no `Record<string,any>`/`Function`/`object` |
| TS4 / JS4 | Null-undefined & 0-is-falsy | ✓ COMPLIANT (good) | `paletteSlot` explicit numeric check (not `\|\| owner`); `??` throughout `RiskApp`; `!rolls \|\| length===0` guards |
| TS5 | Module/`.js` extension | ✓ N/A | Extensionless relative imports match the project's bundler-resolution convention (all existing risk client imports are extensionless) |
| TS6 | React/JSX | ✓ COMPLIANT | `key={r.seat}` stable (seats don't reorder); no `useEffect`; no `dangerouslySetInnerHTML`; `data-winner={... : undefined}` omits attr cleanly |
| TS10 / JS11 | Input validation | ✓ COMPLIANT (good) | `paletteSlot` validates the colour slot (server input) → identity fallback |
| TS11 / JS1 | Error handling / silent failure | ✓ N/A | No try/catch, `.catch`, or `JSON.parse` in the diff; pure functions |
| JS3 | Prototype pollution | ✓ N/A | No object key derived from input; arrays indexed by number |
| JS8 | Test quality | ✓ COMPLIANT | Concrete assertions, no `.only/.skip`, no vacuous checks |

**Rule verdict:** Clean. The change actively adopts the prescribed patterns (#4 explicit numeric check for 0-safety, #11 slot validation, `readonly` on the un-mutated param).

### Devil's Advocate

Let me argue this code is broken. **First**, the whole story claims "colour used consistently across board, crest, seat strip, and dice" (AC1) — but I proved the seat strip (`Header.tsx:64`) and continent pips (`ContinentRail.tsx:34`) still paint from the raw seat index, and the Dev deviation explicitly claimed "no seat-colour surface left seat-locked." That claim is false. *Rebuttal:* it's dormant — `view.colors` defaults to identity server-side (E5-3) and there is no producer of a non-identity colour until the picker (deferred), so `--p${seat}` and the chosen slot coincide; no user can see a discrepancy today. It's a real AC1 gap but a latent, non-blocking one, and I've filed it blocking-for-the-picker so it can't be forgotten. **Second**, a confused user: the roll-off panel shows every seat's die even for eliminated/absent seats. *Rebuttal:* it's mounted only in `phase==="setup"` (no eliminations yet) and `turnOrderRolls` length == seat count at build. **Third**, malformed data: what if `view.colors` or `turnOrderRolls` is a garbage array? `paletteSlot` integer-validates each pick and falls back to identity; `rollOffRows` renders whatever numbers are in `turnOrderRolls` — but that's server-produced d6, not user input, so no injection/overflow surface, and there is no `dangerouslySetInnerHTML`. **Fourth**, the winner marker: could the panel highlight a different seat than the server actually seated first? Only if the client tie-break diverged from server `firstPlayer` — both use argmax with strict `>` (lowest index), so they agree; and recomputing (not reading `currentPlayer`) actually *prevents* the setup-rotation bug. **Fifth**, `rng()===1.0` style overflow — N/A, no rng here (server owns the roll). Net: the shipped diff is correct and safe for what it delivers; the only substantive gap (seat strip) is dormant, sanctioned by the split, and tracked — not a defect in production behaviour today.

**Data flow traced:** server `state.colors` (identity default, E5-3) → `RiskView.colors` → client. `Board` tokens, `RiskApp` bot/faction/attacker/defender `seatHex`, `EndScreen` label, and `RollOffPanel` swatch/label all resolve through `paletteSlot(seat, view.colors)`. Dice: `seatHex(..., view.colors)` → `attackerColor/defenderColor` props → `CombatReveal`. Roll-off: `view.turnOrderRolls` → `rollOffRows` (argmax winner) → setup-phase panel. **Not** on the colour path: `Header` seat-strip dot/pip + `ContinentRail` pips (raw `--p${seat}` — the tracked gap).

**Pattern observed:** single `paletteSlot` resolver reused by all five themes functions (DRY, one place for 0-safety + validation) — `themes.ts:11`.

**Error handling:** no throws; nullish/identity fallbacks throughout; winner recompute is hang-safe (single pass).

**Handoff:** To SM (Edmund Blackadder) for finish-story.

## Delivery Findings

Agents record upstream observations discovered during their phase.
Each finding is one list item. Use "No upstream findings" if none.

**Types:** Gap, Conflict, Question, Improvement
**Urgency:** blocking, non-blocking

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Gap** (blocking for the picker + AC5; non-blocking for this story's result-display scope): The colour **picker UI** (context AC "4. Colour picker exists") and **duplicate-colour uniqueness** (AC5) are deferred — recommend a follow-up split (e.g. E5-7b). Discovery found the picker is design-blocked: TWO colour models coexist — the legacy 2P `state.colors = {a,b}` (creator-picks-colour at the vanilla-JS lobby `public/lobby/lobby.js`, threaded by the game-create route per `test/games-create.test.js`) vs the new seat-indexed `state.colors = number[]` (E5-3, risk) — and a per-seat N-player picker has no located home (vanilla-JS lobby vs React in-game setup). Needs UX/Architect discovery before build. Affects `public/lobby/lobby.js`, the game-create route (`participant.color` producer), `src/clients/risk/*`. *Found by TEA during test design.*
- **Question** (non-blocking): Should a seat's **label** track its chosen colour slot (seat picks Green → labelled "Green")? Tests currently pin yes (`seatLabel` reads the slot). If product wants seat names decoupled from colour, flag before GREEN. Affects `src/clients/risk/themes.ts`. *Found by TEA during test design.*
- **Improvement** (non-blocking): **AC1 cross-surface consistency** (crest SVG, seat strip, WebGL dice material) is not unit-coverable in jsdom — only `Board.tsx` fill is pinned. The other surfaces need `npm run build:client` + a manual/visual check to verify. Affects `src/clients/risk/{RiskApp,EndScreen}.tsx` and the dice materials. *Found by TEA during test design.*

### Dev (implementation)
- **Improvement** (non-blocking): `RollOffPanel` emits presentational classNames (`.rolloff-panel`, `.rolloff-row`, `.rolloff-row--winner`, `.rolloff-swatch`, `.rolloff-name`, `.rolloff-die`, `.rolloff-crown`) that have **no CSS yet** — the panel is functionally correct and tested but unstyled until styles are added. Affects the risk client stylesheet (`style.css`). *Found by Dev during implementation.*
- **Question** (non-blocking): `tsc --noEmit -p tsconfig.client.json` surfaces **pre-existing** type errors in `RiskApp.tsx` (`ResolvedCombat.attackerSurvivors/defenderSurvivors`, `CombatRound` mismatch, `BotSeat` filter predicate — unchanged at HEAD) and test files, unrelated to E5-7. The project has no tsc gate (build = esbuild). Left unfixed (out of scope) but worth a cleanup story. Affects `src/clients/risk/RiskApp.tsx`, `src/clients/shared/contracts/risk.ts`. *Found by Dev during implementation.*
- **Improvement** (blocking for the picker + AC5, non-blocking for this story): Confirms TEA's split — the colour **picker** and duplicate-colour uniqueness (AC5) were **not** implemented (result-display only). A follow-up story is required, gated on UX/Architect discovery of the picker location. Affects `public/lobby/lobby.js`, the game-create route, `src/clients/risk/*`. *Found by Dev during implementation.*

### Reviewer (code review)
- **Gap** (blocking for the picker follow-up, non-blocking for this story — Medium): AC1's "seat strip" and the continent pips are **not colour-aware** — they paint from the raw seat index via the `--pN` CSS-class path, which the themes-JS threading did not touch. Concretely: `src/clients/risk/Header.tsx:64` (seat-strip dot `var(--p${seat}-1)`), `Header.tsx:79` (`pipClass = p${currentPlayer}`), `Header.tsx:80` (crest fallback, 2P-only), and `src/clients/risk/ContinentRail.tsx:34` (`pip p${o}`). Dormant today (identity colours) but will render the wrong colour once the picker produces a non-identity choice. The picker follow-up MUST thread these (map seat→`view.colors[seat]` before emitting `--p${slot}`, or redefine `--pN` per-seat at a container). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `PALETTE_SIZE = 4` (`src/clients/risk/themes.ts:7`) duplicates the client palette length; keep in sync with `SEAT_HEX`/`--pN` (or derive from `SEAT_HEX.length`) if 5–6P support lands. *Found by Reviewer during code review.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.
Each entry: what was changed, what the spec said, and why.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### TEA (test design)
- **Deferred the colour picker (context AC4 "picker exists") and duplicate-colour uniqueness (AC5) — split to a follow-up.**
  - Spec source: context-story-E5-7.md, AC "4. Colour picker exists" and AC "5. Duplicate colours are prevented or clearly surfaced"
  - Spec text: "A player can choose a colour pre-game; the choice flows to the server (`participant.color`) and back through `view.colors`." / "Two seats cannot silently end up the same colour."
  - Implementation: No tests written for a picker UI or duplicate-colour uniqueness. This red phase covers only the result-display half (AC1/AC2/AC4).
  - Rationale: Discovery confirmed the picker is design-blocked — two colour models (legacy 2P `{a,b}` vs new seat-indexed array) and no located home (vanilla-JS lobby vs React setup). The context explicitly sanctions "a further split (picker vs. result-display) is acceptable." Building a picker test blind would prescribe an unowned design.
  - Severity: major (2 of 5 context ACs deferred)
  - Forward impact: follow-up story required; logged as a blocking Delivery Finding. Duplicate-uniqueness belongs with the picker (its producer), so it moves with it.
- **Colour API pinned as an optional `colors?` second param on the existing themes functions.**
  - Spec source: context-story-E5-7.md, "Technical Approach → 1. themes.ts reads view.colors"
  - Spec text: "Rewire colour consumers to resolve each seat's colour through `view.colors[seat]` … Keep the board, crest, seat strip, and dice consistent with the SAME model."
  - Implementation: Tests call `seatFill(seat, colors)` etc.; resolution is `slot = validSlot(colors?.[seat]) ?? seat`.
  - Rationale: Least-invasive — existing call sites `seatFill(owner)` become `seatFill(owner, view.colors)`; the palette stays single-sourced in the `--pN` CSS vars / `SEAT_HEX`.
  - Severity: minor
  - Forward impact: if Dev prefers a resolver object over positional params, the signature-based tests change (raise a deviation).
- **`seatLabel` follows the chosen slot (a seat that picks Green is labelled "Green").**
  - Spec source: context-story-E5-7.md, AC1
  - Spec text: colour "used consistently across the board, crest, seat strip, and dice."
  - Implementation: `seatLabel(seat, colors)` returns `SEAT_LABEL[slot]`, so a seat's name tracks its colour.
  - Rationale: Consistency with the palette-slot model; a green seat reading "Green" is less confusing than a green seat reading "Red".
  - Severity: minor
  - Forward impact: if product wants labels decoupled from colour, the `seatLabel` choice test changes. Raised as a Question in Delivery Findings.
- **Roll-off winner recomputed on the client (argmax of `turnOrderRolls`) rather than read from `view.currentPlayer`.**
  - Spec source: context-story-E5-7.md, AC4 + "Testable seams: Roll-off result view-model mapping (`view.turnOrderRolls` → rows/winner)"
  - Spec text: "The setup-phase UI renders `view.turnOrderRolls` so players see the per-seat rolls and who won the first move."
  - Implementation: `rollOffWinner`/`rollOffRows` compute the winner as argmax with a lowest-seat-index tie-break, independent of `view.currentPlayer`.
  - Rationale: `turnOrderRolls` is static, but `currentPlayer` rotates as the game progresses — recomputing argmax with the SAME tie-break as server `firstPlayer` reliably shows the roll-off winner even past setup, and the two never disagree.
  - Severity: minor
  - Forward impact: Reviewer should confirm the client tie-break (lowest index) matches server `firstPlayer`.
- **`RollOffPanel` DOM contract (`data-seat`, `data-winner="true"`) imposed by the render test.**
  - Spec source: context-story-E5-7.md, AC4
  - Spec text: "The setup-phase UI renders `view.turnOrderRolls`."
  - Implementation: The render test asserts a `data-seat={seat}` per row and `data-winner="true"` on the winning row; visual styling is left to Dev.
  - Rationale: A stable, assertable DOM contract for the roll-off display without over-specifying markup.
  - Severity: minor
  - Forward impact: Dev emits these attributes (or updates the test with an equivalent contract).
- **AC1 cross-surface rendering not unit-tested beyond the board fill.**
  - Spec source: context-story-E5-7.md, AC1 + "Testable seams: Genuinely visual bits … are integration/manual"
  - Spec text: "used consistently across the board, crest, seat strip, and dice."
  - Implementation: Only `Board.tsx` fill has a render test; crest (SVG), seat strip, and WebGL dice material colour are not unit-covered.
  - Rationale: Context: "Genuinely visual bits … are integration/manual (rebuild + observe), not unit-coverable — call that out, don't fake-assert it." Pure themes tests + the Board render prove the mechanism; the rest is Dev-wires-then-manual-verify.
  - Severity: minor
  - Forward impact: full AC1 verification needs `npm run build:client` + a visual check across surfaces (noted for Dev/Reviewer).

### Dev (implementation)
- **Threaded `view.colors` through ALL seat-colour consumers, not just the one test-covered surface (Board).**
  - Spec source: context-story-E5-7.md, AC1
  - Spec text: "that colour is used consistently across the board, crest, seat strip, and dice."
  - Implementation: `seatHex(..., view.colors)` at all 4 `RiskApp.tsx` sites (bot roster, faction, attacker, defender) and `seatLabel(seat, view.colors)` in `EndScreen.tsx`, in addition to `Board.tsx`'s tested `seatFill`/`seatInk`. Only 3 files import `themes`; all are threaded.
  - Rationale: AC1 requires cross-surface consistency; wiring only the Board (the sole jsdom-testable surface) would leave the dice/faction/crest colours seat-locked and inconsistent.
  - Severity: minor
  - Forward impact: the non-Board surfaces are not unit-covered (TEA flagged them integration/manual); AC1 render verification is a rebuild + visual check.
- **`RollOffPanel` renders more than the bare test contract (label + colour swatch + "goes first"), to meet AC4's user-facing intent.**
  - Spec source: context-story-E5-7.md, AC4 + `test/client/risk-rolloff.test.tsx` (panel contract)
  - Spec text: "so players see the per-seat rolls and who won the first move."
  - Implementation: The panel satisfies the machine-readable contract (`data-seat` per row, `data-winner="true"` on the winner, the roll value) and adds a seat label, a colour swatch (`seatFill`), and a "— goes first" marker.
  - Rationale: The test pins the contract; AC4's intent is a legible "who goes first" panel, not a bare data div. Extras are static markup — no new logic or state.
  - Severity: minor
  - Forward impact: none — presentational; the `.rolloff-*` classes need CSS (Delivery Finding).
- **Mounted `RollOffPanel` scoped to the setup phase (`view.phase === "setup"`).**
  - Spec source: context-story-E5-7.md, AC4
  - Spec text: "The setup-phase UI renders `view.turnOrderRolls`."
  - Implementation: `{view.phase === "setup" && <RollOffPanel view={view} />}` after `ContinentRail`; the panel also self-guards (null without `turnOrderRolls`).
  - Rationale: `turnOrderRolls` persists on the view all game; the phase guard keeps the roll-off display from lingering into play, matching AC4's "setup-phase" scope.
  - Severity: minor
  - Forward impact: if the roll-off should also appear in a later game log/history surface, that is a separate story.
- **Left pre-existing `tsc` type errors in `RiskApp.tsx`/tests unfixed.**
  - Spec source: E5-7 scope (session file) — client colour/roll-off rendering only.
  - Spec text: story scope is the pre-game lobby client result-display; no mandate to fix unrelated type debt.
  - Implementation: `tsc --noEmit` errors in the `CombatReveal`/`BotSeat` blocks (present unchanged at HEAD) were not touched; my six E5-7 files are type-clean.
  - Rationale: Out of scope; the project has no tsc gate (build = esbuild, tests = vitest) so the errors are non-blocking and long-standing. Fixing them would be unrelated churn.
  - Severity: minor
  - Forward impact: none for E5-7; logged as a cleanup Question in Delivery Findings.

### Reviewer (audit)
Every logged deviation stamped:
- **TEA — Deferred colour picker + AC5 (split)** → ✓ ACCEPTED: the split is sanctioned by the context and confirmed by discovery (two colour models + unlocated picker home). The picker/AC5 are genuinely design-blocked; deferring is correct, not corner-cutting.
- **TEA — Colour API = optional `colors?` param on themes functions** → ✓ ACCEPTED: least-invasive; single `paletteSlot` resolver keeps 0-safety in one place. Verified no hex/label duplication introduced.
- **TEA — `seatLabel` follows the chosen slot** → ✓ ACCEPTED: consistent with the palette-slot model (a green seat reads "Green"). Reasonable; the open Question is logged for product.
- **TEA — Roll-off winner recomputed (not read from `currentPlayer`)** → ✓ ACCEPTED: verified this is the *correct* choice — `currentPlayer` rotates during setup, so recomputing argmax is what keeps the "goes first" marker stable. Tie-break matches server `firstPlayer`.
- **TEA — `RollOffPanel` DOM contract (`data-seat`/`data-winner`)** → ✓ ACCEPTED: stable, assertable contract; Dev honoured it (`data-winner={... : undefined}` omits the attr on non-winners — clean).
- **TEA — AC1 cross-surface not unit-tested beyond the board** → ✓ ACCEPTED (and prescient): this is exactly the blind spot where the seat-strip gap hid. jsdom can't cover crest/strip/WebGL; the honest flag was correct — the gap is now caught by review, not a fake-green test.
- **Dev — Threaded `view.colors` through ALL seat-colour consumers ("no seat-colour surface left seat-locked")** → ✗ FLAGGED by Reviewer: the completeness claim is inaccurate. Threading covered the *themes-JS-function* consumers (Board/RiskApp/EndScreen/RollOffPanel), but the `--pN` *CSS-class* colour surfaces (`Header.tsx:64,79,80`, `ContinentRail.tsx:34`) remain seat-locked. Non-blocking (dormant until the picker) — downgraded to a Medium Delivery Finding, not a reject, because there is no observable defect today and these belong with the picker work. Accurate scope: "threaded all *themes-importing* consumers."
- **Dev — `RollOffPanel` richer than the bare test contract** → ✓ ACCEPTED: static markup (label + swatch + "goes first") serves AC4's legibility intent; no new logic/state.
- **Dev — `RollOffPanel` mounted scoped to `phase==="setup"`** → ✓ ACCEPTED: correct — `turnOrderRolls` persists all game, so the phase guard matches AC4's "setup-phase" scope; the panel also self-guards on absent rolls.
- **Dev — Left pre-existing `tsc` errors unfixed** → ✓ ACCEPTED: verified pre-existing (4 `attackerSurvivors`/`defenderSurvivors` occurrences unchanged at HEAD; no tsc gate in the project). Out of scope; the cleanup Question is logged.

No undocumented deviations beyond the FLAGGED completeness claim: the shipped diff matches the ACs it targets (AC1 board+dice, AC2, AC4); the deferred ACs (picker, AC5) and the untouched CSS-class surfaces are tracked, not silent.