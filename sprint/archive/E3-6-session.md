---
story_id: "E3-6"
jira_key: null
epic: "E3"
workflow: "tdd"
---
# Story E3-6: Client UI (board, card flip, move interaction, win banner) + orchestrator integration + playtest

## Story Details
- **ID:** E3-6
- **Jira Key:** null (kanban)
- **Epic:** E3 (Sorry! game plugin)
- **Workflow:** tdd
- **Stack Parent:** E3-5 (AI adapter + prompts + two personas)

## Workflow Tracking
**Workflow:** tdd
**Phase:** finish
**Phase Started:** 2026-05-28T13:53:15Z

### Phase History
| Phase | Started | Ended | Duration |
|-------|---------|-------|----------|
| setup | 2026-05-28T12:39:02Z | 2026-05-28T12:41:30Z | 2m 28s |
| red | 2026-05-28T12:41:30Z | 2026-05-28T13:15:10Z | 33m 40s |
| green | 2026-05-28T13:15:10Z | 2026-05-28T13:29:28Z | 14m 18s |
| spec-check | 2026-05-28T13:29:28Z | 2026-05-28T13:31:41Z | 2m 13s |
| verify | 2026-05-28T13:31:41Z | 2026-05-28T13:39:36Z | 7m 55s |
| review | 2026-05-28T13:39:36Z | 2026-05-28T13:51:28Z | 11m 52s |
| spec-reconcile | 2026-05-28T13:51:28Z | 2026-05-28T13:53:15Z | 1m 47s |
| finish | 2026-05-28T13:53:15Z | - | - |

## Story Context

**Epic E3:** Sorry! game plugin (full ruleset, 2P, vs AI)

This story completes the Sorry! plugin by delivering the client UI layer: interactive board rendering, card flip interaction, move selection and validation, and win state presentation. It also integrates the AI orchestrator contract to gate turn-continuation on active player identity and deliver end-to-end playtest coverage.

**Acceptance Criteria:**

1. **Board Rendering**: Render a visual Sorry! board with all 16 pawns per player, two home rows, and three slides. Pawn positions sync to engine state.
2. **Card Flip Interaction**: Deck display shows back of card by default. Clicking reveals the card face. Card click zones on client are gated on `activeUserId===currentPlayer`.
3. **Move Selection UI**: Display legal moves as clickable zones or buttons. Move submission updates game state via engine.apply() and triggers server state save.
4. **Win Banner**: Display banner when a player reaches home with all pawns. Banner shows winner name and includes restart option.
5. **Orchestrator Integration**: Implement AI turn-continuation per the contract: gate on `activeUserId===bot`, drive full turn in one wake-up, use `activeUserId=null` for concurrent phases if needed.
6. **Playtest**: End-to-end playtest vs both AI personas (The Bully, The Tortoise). Document any gameplay issues or balance findings.

## Sm Assessment

**Story:** E3-6 — final story of Epic E3 (Sorry! plugin). Delivers the greenfield
client UI + orchestrator integration + playtest. Stack parent E3-5 (AI adapter +
personas) is merged to main, so dependencies are satisfied.

**Workflow:** tdd (phased). Routing setup → red → TEA (Hamlet) writes failing tests
for the six acceptance criteria.

**Key directive captured:** The Sorry! board must reuse the "parquet trick" (baked
tile-grid board image mapped 1:1 to the cell grid) — see the dedicated section below.
TEA should write a test/expectation that the board renders via a baked image surface,
not per-cell DOM, so the directive survives into green.

**Risks/notes:** Client dir for Sorry! does not yet exist — fully greenfield. AC #5
must honor the orchestrator turn-continuation contract (gate on `activeUserId===bot`,
drive full turn in one wake-up).

## Board Rendering — REUSE THE PARQUET TRICK (user directive)

Good Patron has directed that the Sorry! board reuse the "backgammon parquet trick"
for its board surface — render the board as a pre-baked tile-grid image mapped 1:1
to the cell grid, rather than drawing every cell in DOM/CSS.

The technique lives in the **words** plugin:
- `plugins/words/client/style.css:639+` — `#board` background uses a baked checker
  image at `100% 100% / no-repeat` layered over a frame gradient via
  `background-clip`/`background-origin` (content-box, padding-box).
- `plugins/words/client/themes.js:25+` — `parquet-*` theme variants + texture list.
- Backgammon's analogous client theming for study:
  `plugins/backgammon/client/themes.js`, `plugins/backgammon/client/board.js`.

Note: Sorry! has no client dir yet (`plugins/sorry/` = plugin.js + server/ only),
so the client UI is greenfield.

## TEA Assessment

### Red Phase (test writing)

**Tests Required:** Yes
**Status:** RED (failing — ready for Dev)

**Decision captured (Good Patron, in-session):** The client is built in **React**, not
vanilla JS — mirroring the already-React `risk` and `cribbage` clients (shared component
layer + vite build pipeline). The stale "vanilla JS" guardrail is logged as a deviation
below. Risk (a board game with a baked `chart-of-the-world.png` board image) is the
near-exact precedent for the parquet directive.

**Authoritative AC source:** `context-story-E3-6.md` "AC Context" (the session's templated
"Acceptance Criteria" list is stale/inconsistent — logged as a deviation + delivery finding).

**Test Files:**
- `test/sorry/view.test.js` (node:test) — AC #3: `sorryPublicView` exposes `legalMoves`
  to the current player only; deck order stays redacted.
- `test/sorry/orchestrator-turn.test.js` (node:test) — AC #6: turn-continuation invariant
  `activeUserId === sides[currentPlayer]`; draw-again on a `2` keeps the bot active.
- `test/sorry/client-files.test.js` (node:test) — AC #1/#2/#4/#5: built bundle + React
  sources + baked board image asset exist.
- `test/client/sorry-board.test.tsx` (vitest) — AC #1 board render via baked `img.board-image`
  + data-driven pawn placement; AC #4 legal-move hotspot → `onPick(moveId)`.
- `test/client/sorry-app.test.tsx` (vitest) — AC #2 server-driven card reveal; AC #4 move
  POST `{type:'move',payload:{moveId}}`; AC #5 win/lose banner keyed on `youAre === winner`.

**Tests Written:** 22 (12 node:test + 10 vitest) covering ACs #1–#6.
**RED verification (testing-runner):**
- node:test → 6 fail / 6 pass. Failing: view legalMoves-for-current-player, 3 client-bundle
  files, React sources, baked board asset. Passing guards: opponent/spectator get no
  legalMoves (must STAY green), deck-redaction guard, and the 3 orchestrator characterization
  tests (green over merged E3-4/E3-5 — AC #6 is an integration milestone, not new code).
- vitest → both files fail to load (`SorryApp`/`Board` absent). ~10 assertions activate once
  Dev creates the components.

**Component/contract API the tests pin (for Dev):**
- `plugins/sorry/server/view.js`: add `legalMoves` to `sorryPublicView` when
  `state.currentPlayer === youAre` (import `legalMoves` from `rules/legal-moves.js`); keep
  deck redacted.
- `src/clients/shared/contracts/sorry.ts`: `SorryView` / `SorryAction` types (mirror `risk.ts`).
- `src/clients/sorry/Board.tsx` — `Board({ view, onPick, selected })`: renders
  `<img className="board-image" src=…(png|jpg|webp)>` (parquet baked surface); one
  `[data-pawn="<side>-<id>"]` element per pawn with `data-zone`/`data-index`; one
  `[data-pick="<moveId>"]` clickable hotspot per `view.legalMoves` calling `onPick(moveId)`;
  no hotspots when `legalMoves` is absent.
- `src/clients/sorry/SorryApp.tsx` — `SorryApp()`: `useGameState<SorryView, SorryAction>()`;
  `[data-testid="drawn-card"]` shows `view.drawnCard` (value tracks the server view, no client
  draw logic); `onPick` → `post({ type:'move', payload:{ moveId } })`; win banner `/you win/i`
  when `youAre === winner`, lose banner `/you lose|defeat/i` otherwise, none when `winner` null.
- `src/clients/sorry/main.tsx`, hand-authored `plugins/sorry/client/{index.html,style.css}`,
  a baked board PNG in `plugins/sorry/client/assets/`, then `npm run build:client` emits `app.js`.

### Rule Coverage

| Rule (lang-review) | Coverage | Notes |
|--------------------|----------|-------|
| JS #4 / #8 strict equality, test quality | `view.test.js`, `sorry-app.test.tsx` | `legalMoves`/`winner`/`youAre` gated on strict `===`; self-checked for vacuous asserts |
| TS #4 `??` vs `||` on nullable view fields | `sorry-app.test.tsx` | `winner: null` must render no banner (0/"" are valid card values) |
| TS #6 React/JSX (`key`, deps) | partial | Pawn-list keys flagged for Dev; behavioral coverage = 8 pawns render with stable `data-pawn` ids |
| Server contract (no client recompute of legality) | `view.test.js` | view exposes engine `legalMoves` verbatim; client reads the array |
| Bot emits only `move`, never `draw` | `orchestrator-turn.test.js` | action.type asserted `move` |

**Rules note:** the lang-review checklists are dev-side static scans (silent-error swallowing,
prototype pollution, regex safety, etc.) not amenable to greenfield RED tests; the behaviorally
testable rules are encoded above. Reviewer/Dev self-review covers the static ones.

**Self-check:** No vacuous assertions — every test asserts a concrete value, identity, or
call argument; assertions chosen to fail before implementation and pass only on correct behavior.

**Handoff:** To Dev (Puck) for implementation.

## Dev Assessment

**Implementation Complete:** Yes
**Tests:** 1074/1074 node:test passing (1 intentional LIVE skip) + 10/10 vitest — full suite GREEN, no regressions.
**Branch:** feat/E3-6-sorry-client-ui (pushed)

**Files Changed:**
- `plugins/sorry/server/view.js` — `sorryPublicView` now includes `legalMoves` (from
  `rules/legal-moves.js`) only when `state.currentPlayer === youAre`; deck stays redacted. (AC #3)
- `scripts/render-sorry-board.py` — PIL board baker, patterned on `scripts/render-board.py`
  (cover-fit textures, supersampled masks → LANCZOS, bevel + inner shadow). Renders the 60-cell
  marble track ring on a wood field with both Start pens, Safety lanes, Homes, and colour Slides.
  `--style`/`--list-styles`/`--out` CLI.
- `plugins/sorry/client/assets/sorry-board.png` — the baked board surface (parquet trick). (AC #1)
- `src/clients/shared/contracts/sorry.ts` — `SorryView` / `SorryAction` / `LegalMove` types.
- `src/clients/sorry/board-geometry.js` — the 1:1 geometry contract (GRID/CELL + track-index→cell
  mapping + `pawnCenter`/`moveDestCenter`/`toPct`), kept in lockstep with the render script.
- `src/clients/sorry/Board.tsx` — renders `<img class="board-image">` + pawn tokens
  (`[data-pawn]`/`data-zone`/`data-index`) + legal-move hotspots (`[data-pick]` → `onPick`). (AC #1/#4)
- `src/clients/sorry/SorryApp.tsx` — `useGameState`; `[data-testid="drawn-card"]` (server-driven,
  re-keyed to replay the flip); move POST `{type:'move',payload:{moveId}}`; win/lose end banner;
  OpponentCard + OpponentBanter for AC #8 banter. (AC #2/#4/#5)
- `src/clients/sorry/main.tsx`, `plugins/sorry/client/{index.html,style.css}` — shell + scoped
  styling (board layout, pawn tokens, card-flip keyframes, banner). Built bundle (`app.js`/`app.css`)
  emitted by `npm run build:client`; gitignored like risk/cribbage.
- `test/sorry/client-files.test.js` — fixed a path-depth bug (see deviation); assertions unchanged.
- `.gitignore` — ignore sorry's built `app.js`/`app.css`/`.map` (mirrors risk/cribbage).

**AC #6 (orchestrator):** no code needed — the merged E3-4/E3-5 engine+adapter already satisfy the
turn-continuation contract; TEA's characterization tests stay green.
**AC #8 (playtest):** deferred to the manual playtest step (cannot be unit-tested).

**Type safety:** the Sorry! client typechecks clean under `tsconfig.client.json`; the only `tsc`
errors are pre-existing in `src/clients/risk/RiskApp.tsx` (logged as a finding).

**Handoff:** To TEA (verify) → Reviewer.

## Architect Assessment (spec-check)

**Spec Alignment:** Drift detected — but the drift is **spec-vs-spec**, not code-vs-spec.
The implementation aligns with the authoritative `context-story-E3-6.md` AC Context and the
merged engine reality. The session file's templated "Acceptance Criteria" block (lines 35–42,
the *highest-authority* source per the spec hierarchy) is a stale/internally-inconsistent
artifact that contradicts the engine. TEA flagged this in red; I confirm it and recommend the
spec be reconciled. **No code change required.**

**Mismatches Found:** 4 (all rooted in the stale session AC block; all Minor/Trivial)

- **Pawn/slide counts wrong in session AC #1** (Different behavior — Behavioral, Minor)
  - Spec: "all 16 pawns per player, two home rows, and three slides"
  - Code: 4 pawns/side (state.js `mkPawns` length 4), 2 slides/side (geometry.js `SLIDES`),
    one Safety lane + Home per side — rendered correctly by Board + baked board.
  - Recommendation: **A — Update spec.** The engine builds 4 pawns/side; 16 is impossible.
    Code matches `context-story` and the engine. SM should correct the session AC text.

- **Session AC #2 describes click-to-reveal + `engine.apply()` semantics** (Different behavior — Behavioral, Minor)
  - Spec: "Deck display shows back of card by default. Clicking reveals the card face."
    / AC #3 "Move submission updates game state via engine.apply()".
  - Code: card is auto-revealed from the server view (`drawnCard`); no client draw/reveal click;
    moves POST `{type:'move',payload:{moveId}}` to the action endpoint (the Gamebox contract).
  - Recommendation: **A — Update spec.** Card draw is a server-authoritative rule (per the epic
    design + project memory on visible-animation mechanics); there is no client `engine.apply()`.
    `context-story` AC #2/#4 already state the correct behavior; code is right.

- **Session AC #4 "includes restart option"** (Missing in code — Behavioral, Minor)
  - Spec: "Banner shows winner name and includes restart option."
  - Code: end banner shows win/lose; no in-game restart control.
  - Recommendation: **A — Update spec** (or **D — Defer**). No Gamebox sibling client (risk,
    cribbage) offers in-game restart — games are launched from the lobby. `context-story` AC #5
    does not require restart. Drop from scope, or defer to a platform-wide feature.

- **OpponentCard/OpponentBanter + turn-pill present, not enumerated in the AC list** (Extra in code — Cosmetic, Trivial)
  - Spec: not mentioned in the session AC list.
  - Code: SorryApp renders the shared opponent card + banter and a turn indicator.
  - Recommendation: **A — Update spec / note in passing.** Sibling-consistent (mirrors risk),
    and directly serves `context-story` AC #8 ("the bot produces banter after each of its turns").

**Architectural note (non-blocking):** the 1:1 board geometry is mirrored by hand across two
languages — `scripts/render-sorry-board.py` (bakes the PNG) and
`src/clients/sorry/board-geometry.js` (positions the overlay). There is no automated drift guard
(the vitest tests assert data-attributes/existence, not pixel-on-cell correctness), so a future
edit to one could silently misalign pawns from the printed cells. This mirrors the accepted
risk `map-geometry.js` ↔ `risk-map.jpg` pattern; acceptable for now, but pawn-on-cell alignment
is a **manual playtest (AC #8) watch-item**, and a small fixture-based drift guard would harden it.

**Decision:** Proceed to verify/review. The implementation is substantively aligned with the
authoritative spec; the only actions are spec-text corrections (Option A) owned by SM at reconcile,
not code fixes. No hand-back to Dev.

## TEA Assessment (verify)

**Phase:** finish
**Status:** GREEN confirmed (1074/1074 node:test + 10/10 vitest after simplify; Sorry! client typechecks clean)

### Simplify Report

**Teammates:** reuse, quality, efficiency
**Files Analyzed:** 14 (all reviewable E3-6 changes)

| Teammate | Status | Findings |
|----------|--------|----------|
| simplify-reuse | 7 findings | 1 high (main.tsx bootstrap dup → platform refactor), 2 med (shared app-test fixtures, `useIsMyTurn` hook), 4 low all "no extraction — appropriately game-specific" |
| simplify-quality | 2 findings | 1 high (dead `selected` prop), 1 low (test `as any`, codebase-consistent) |
| simplify-efficiency | 7 findings | 1 high (unused `pawnCenter` default param), several med/low (LegalMove discriminated union, prop threading, micro-nits) |

**Applied:** 1 high-confidence fix
- Removed the dead `selected` prop from `Board` (always `null` from SorryApp; `isSelected` and the
  `.sorry-target.selected` CSS were dead). Touched `Board.tsx`, `SorryApp.tsx`, `style.css`,
  `test/client/sorry-board.test.tsx`; rebuilt the bundle. Commit `89d7b81`. No behavior change.

**Flagged for Review / deferred (NOT applied — see Delivery Findings):**
- `main.tsx` bootstrap duplication across risk/cribbage/sorry — high-confidence observation, but the
  real fix is a **platform refactor** touching sibling plugins (out of E3-6 scope); a sorry-only
  extraction would add indirection without removing duplication.
- `pawnCenter` unused `pawnId=0` default — trivial; deliberately NOT churning the load-bearing 1:1
  geometry file for a cosmetic nit.
- `LegalMove` optional-field interface → discriminated union — a type-design improvement; noted for
  Reviewer / type-design rather than auto-applied (changes the shared contract + ripples).
- `useIsMyTurn` shared hook + shared app-test view fixtures — cross-cutting reuse opportunities.

**Reverted:** 0
**Regression detection:** `node --test` 1074/1074, vitest 10/10, `tsc -p tsconfig.client.json` clean
for `src/clients/sorry/**` (pre-existing risk errors unchanged). No regression from the simplify.

**Overall:** simplify: applied 1 fix

**Quality Checks:** All passing (full suite green; Sorry! client typechecks clean).
**Handoff:** To Reviewer (Portia) for code review.

## Subagent Results

| # | Specialist | Received | Status | Findings | Decision |
|---|-----------|----------|--------|----------|----------|
| 1 | reviewer-preflight | Yes | clean | none | N/A — tests 1074/1074 + 10/10, 0 story-scope tsc errors, 0 code smells |
| 2 | reviewer-edge-hunter | No | Skipped | disabled | Disabled via settings — domain checked manually (see [EDGE]) |
| 3 | reviewer-silent-failure-hunter | No | Skipped | disabled | Disabled via settings — domain checked manually (see [SILENT]) |
| 4 | reviewer-test-analyzer | No | Skipped | disabled | Disabled via settings — domain checked manually (see [TEST]) |
| 5 | reviewer-comment-analyzer | No | Skipped | disabled | Disabled via settings — domain checked manually (see [DOC]) |
| 6 | reviewer-type-design | Yes | findings | 5 | confirmed 1 (LegalMove union — Low/deferred), dismissed 2 (.js-ext false-positive; import-type already correct), deferred 2 (lastEvent typing, youAre boundary — both Low, pre-existing shared layer) |
| 7 | reviewer-security | Yes | findings | 4 | confirmed 0 blocking; 1 Med pre-existing (discard exposure), 3 Low (py path-handling, drawnCard-visible by design, lastEvent `...rest`) — all non-blocking |
| 8 | reviewer-simplifier | No | Skipped | disabled | Disabled via settings — verify-phase simplify already ran (dead `selected` removed); preflight reports 0 dead code |
| 9 | reviewer-rule-checker | Yes | findings | 5 | confirmed 5, ALL Low (as-any test fixture, img! test assertion, `!= null`, py broad-except, py `fill` annotations); 34/39 rule applications compliant |

**All received:** Yes (4 ran, 5 disabled-skipped)
**Total findings:** 6 confirmed (all Low, non-blocking), 2 dismissed (with rationale), 4 deferred/pre-existing

## Reviewer Assessment

**Verdict:** APPROVED

No Critical or High findings across preflight, type-design, security, or the exhaustive
rule-checker (39 rule applications, 34 compliant). The implementation is server-authoritative,
XSS-safe, fully tested, and faithfully mirrors the risk/cribbage React client pattern. The six
confirmed findings are all Low severity and non-blocking; captured as Delivery Findings.

### Observations (≥5)

- `[VERIFIED]` **Server-authoritative move legality.** Client-supplied `moveId` is a lookup key
  only — `applySorryAction` (plugins/sorry/server/actions.js:141) re-derives `legalMoves(state)`
  from authoritative state and `.find()`s the id; an illegal/forged `moveId` returns `{error}`
  with no mutation. The view's `legalMoves` is a UI hint, not a trust boundary. Complies with the
  "server-authoritative legality" guardrail. Corroborated by [SEC].
- `[VERIFIED]` **No XSS.** All server- and LLM-derived data (`drawnCard`, pawn data, and opponent
  **banter** via shared OpponentBanter) renders through React text nodes — no `innerHTML`,
  `dangerouslySetInnerHTML`, `eval`, or `document.write` anywhere in the diff (preflight: 0;
  [SEC]: 0/8). `cardFace()` (SorryApp.tsx:10) coerces via `String(card)` to a text child.
- `[VERIFIED]` **Deck order stays redacted after the view change.** view.js diff adds only
  `legalMoves` (gated on `currentPlayer === youAre`); `const { deck, ...rest }` redaction is intact;
  `view.test.js` regression-guards `deck === undefined` + `deckCount`. evidence: plugins/sorry/server/view.js:7-15.
- `[LOW][RULE]` **`!= null` loose inequality** at src/clients/sorry/SorryApp.tsx:21 — `youAre` is
  typed `SorrySide | null`, so `!== null` is the strict, rule-compliant form (JS-4). Functionally
  correct; style-only. Non-blocking.
- `[LOW][RULE][TEST]` **`as any` partial fixture** (test/client/sorry-board.test.tsx:29) and
  **`img!` non-null assertion** (line 42, guarded by a preceding `expect().not.toBeNull()`). Both are
  test-only and match the existing risk/cribbage test convention; they make the fixture immune to
  future SorryView field additions. Non-blocking. (TS-1/TS-8)
- `[LOW][RULE]` **Python `except Exception`** (scripts/render-sorry-board.py:224, font fallback) is
  broader than the expected `(OSError, AttributeError)`; and `fill` params on `rounded_cell`/`disc`
  (lines 143/150) lack type annotations (PY-1, PY-3). One-shot dev asset-baker; non-blocking.
- `[MEDIUM]` **Pawn-on-cell geometry has no automated drift guard** (Architect watch-item). The
  vitest tests assert `data-*` attributes, not pixel alignment between board-geometry.js and the
  baked PNG. Inherent to the baked-image approach (same as risk's map-geometry ↔ risk-map.jpg);
  verified only by the manual playtest (AC #8). Non-blocking; flagged for playtest.

### Dispatch-tag coverage

- `[TYPE]` LegalMove (sorry.ts:28) is a flat interface with 5 optional fields where `kind`
  discriminates — a discriminated union would make illegal states unrepresentable. Confirmed,
  **Low / deferred** (the server is the sole producer and is correct; this hardens what the client
  *accepts*). The type-design `.js`-extension finding is **dismissed**: `tsconfig.client.json` uses
  `moduleResolution: "bundler"`, every sibling client imports contracts extensionless, and `tsc`
  passes clean — corroborated by [RULE] TS-5. `import type` is already used correctly.
- `[SEC]` No XSS, server-authoritative legality, deck redacted, no secrets. The `discard` array is
  sent to both players, but the view.js diff proves this is **pre-existing** (the `{deck, ...rest}`
  spread predates E3-6) and is arguably faithful to physical Sorry! (discard is face-up). Low,
  non-blocking, pre-existing. `drawnCard` visible to both = by design (visible draw).
- `[RULE]` 5 Low violations (above); 34/39 applications compliant — no silent errors, no `||`-where-
  `??`, no `key={index}`, no missing `useEffect` deps, no unsafe deserialization.
- `[EDGE]` (subagent disabled — manual): empty `legalMoves` → no hotspots (tested); null `view` →
  Loading; `winner === null` → no banner (tested); a malformed move lacking both `to` and `legs` →
  `moveDestCenter` returns null and the hotspot is dropped defensively (board-geometry.js:60-63).
  No unhandled boundary found.
- `[SILENT]` (disabled — manual): no swallowed errors in client; `moveDestCenter` returns null
  *explicitly*; `post()` failure surfaces via `actionError` in useGameState. Only catch is the
  Python font fallback (flagged Low by [RULE]).
- `[TEST]` (disabled — manual): assertions are specific (values, identities, call args), not vacuous;
  coverage maps ACs #1–#6; AC #8 is the manual playtest. Two Low test-style nits noted above.
- `[DOC]` (disabled — manual): comments accurate — board-geometry.js documents the 1:1 contract,
  view.js comment correctly updated, render-sorry-board.py docstring matches behavior. No stale docs.
- `[SIMPLE]` (disabled — manual): verify-phase simplify already removed the dead `selected` prop;
  preflight reports 0 dead code, longest function ~12 lines.

### Rule Compliance (lang-review checklists)

Exhaustive enumeration delegated to reviewer-rule-checker (39 applications across JS/TS/Python).
Result: **34 compliant, 5 Low violations** (listed above). Key VERIFIEDs: strict `===` in view.js
(JS-4); `??` not `||` for `legalMoves ?? []` (TS-4); stable composite keys, no `key={index}`,
no hook-dep issues (TS-6); `import type` + bundler-correct extensions (TS-5); pathlib + `.resolve()`
in the Python script (PY-5); no unsafe deserialization (PY-8).

### Data flow traced

User clicks a legal target → `Board` `onClick` → `onPick(move.id)` → `SorryApp` `post({type:'move',
payload:{moveId}})` → POST `ctx.actionUrl` → server `applySorryAction` **re-validates legality**
from authoritative state → new state → SSE `update` → `useGameState.resync()` → `view` prop →
re-render. **Safe because** the server never trusts the client's `moveId` for legality; on failure
`useGameState` sets `actionError` and the board is unchanged. Wiring confirmed end-to-end.

### Devil's Advocate

Assume this client is broken. A malicious player edits the POST body to send a `moveId` for a move
that isn't theirs, or an out-of-turn move — but `applySorryAction` checks `side !== currentPlayer`
and `.find()` over freshly-derived legal moves, rejecting both with `{error}` and no mutation, so
the forged move dies at the server. Could they read hidden information? The view redacts `deck`
order; the only over-share is `discard` (pre-existing, and face-up in the physical game) — a
card-counter gains the remaining-rank distribution, a minor edge that exists in real Sorry! too.
A confused user mid-turn sees stale state? `useGameState` resyncs on every SSE `update` and after
each POST, and `winner !== null` short-circuits to the banner. What if the server emits a move
`kind` the client doesn't know? `moveDestCenter` returns null and silently drops that hotspot —
the player simply can't click it; not a crash, but a latent UX gap if the engine grows new kinds
before the client contract updates (mitigated by the LegalMove-union recommendation). What about
the board image failing to load? The `<img>` 404s but the overlay (pawns, hotspots) still renders
on a blank surface — degraded but playable. What about geometry drift — pawns rendered off their
printed cells? This is the real soft spot: nothing automated asserts pixel alignment between
board-geometry.js and the baked PNG; a future edit to one and not the other would misplace every
pawn, caught only by eye in the manual playtest. That is precisely why AC #8 (manual playtest vs
The Bully/The Tortoise) must be run before the epic closes — flagged below. None of these rise to
Critical/High; the server-authoritative design contains the security blast radius, and the
remaining risks are cosmetic or pre-existing.

**Handoff:** To SM (Prospero) for finish-story.

## Delivery Findings

No upstream findings yet. Agents will record discoveries here as they occur.

<!-- Agents: append findings below this line. Do not edit other agents' entries. -->

### Reviewer (code review)
- **Question** (blocking-for-epic, non-blocking-for-PR): AC #8 manual playtest vs The Bully and The
  Tortoise has NOT been run — it cannot be unit-tested and is the only check that exercises real
  pawn-on-cell alignment + live banter. Affects the epic close (run via `/run` before E3 is marked
  done). *Found by Reviewer during code review.*
- **Improvement** (non-blocking): `LegalMove` (`src/clients/shared/contracts/sorry.ts:28`) is a flat
  interface with 5 optional fields; a discriminated union keyed on `kind` would make illegal
  combinations unrepresentable and remove the `move.to ?? move.legs?.[0]?.to` fallback in
  `board-geometry.js`. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): Low rule-checker nits, all trivial — `!= null` → `!== null`
  (`src/clients/sorry/SorryApp.tsx:21`); test `as any` fixture + `img!` assertion
  (`test/client/sorry-board.test.tsx:29,42`); Python `except Exception` → `(OSError, AttributeError)`
  and `fill` type annotations (`scripts/render-sorry-board.py:143,150,224`). Sweepable in one chore.
  *Found by Reviewer during code review.*
- **Gap** (non-blocking, pre-existing): `sorryPublicView` sends the full `discard` array to both
  players (predates E3-6; faithful to physical Sorry! where discard is face-up, but enables
  rank-distribution counting). Affects `plugins/sorry/server/view.js` — confirm with product whether
  to redact to a `discardCount`. *Found by Reviewer during code review.*
- **Improvement** (non-blocking): No automated guard asserts pawn-on-cell alignment between
  `src/clients/sorry/board-geometry.js` and the baked `sorry-board.png`; a fixture-based drift guard
  would harden the 1:1 contract. Affects the board geometry. *Found by Reviewer during code review.*

### TEA (verify)
- **Improvement** (non-blocking): React root bootstrap (`ErrorBoundary` + `createRoot` +
  `getElementById`) is duplicated across `src/clients/{risk,cribbage,sorry}/main.tsx`. Affects all
  three `main.tsx` files (extract a shared `src/clients/shared/createGameRoot.ts`). Platform-level
  refactor — out of E3-6 scope; do it as a standalone chore touching all three clients at once.
  *Found by TEA during test verification.*
- **Improvement** (non-blocking): `LegalMove` in `src/clients/shared/contracts/sorry.ts` uses five
  optional fields where the `kind` discriminates which are populated. A discriminated union
  (`{kind:'split'; legs} | {kind:'out'|...; to}`) would remove caller guard-noise. Affects
  `contracts/sorry.ts` (+ `board-geometry.js` `moveDestCenter`). Deferred — type-design call for
  Reviewer. *Found by TEA during test verification.*
- **Improvement** (non-blocking): The my-turn check `view.youAre != null && view.currentPlayer ===
  view.youAre` recurs in risk and sorry. Affects `src/clients/sorry/SorryApp.tsx` +
  `src/clients/risk/{RiskApp,Header}.tsx` (extract `useIsMyTurn(view)` to shared). Cross-cutting;
  defer to a platform chore. *Found by TEA during test verification.*

### Dev (implementation)
- **Improvement** (non-blocking): The client typecheck (`npx tsc --noEmit -p tsconfig.client.json`)
  is red due to pre-existing errors in `src/clients/risk/RiskApp.tsx` (CombatRound missing
  `aLoss`/`dLoss`; `ResolvedCombat` missing `attackerSurvivors`/`defenderSurvivors`) — unrelated
  to E3-6. Affects `src/clients/risk/RiskApp.tsx` (+ `contracts/risk.ts`). Verify/CI typecheck will
  flag these until risk is reconciled; they are NOT introduced by this story. *Found by Dev during implementation.*
- **Resolved (was TEA Gap)**: The baked board image dependency is satisfied programmatically by
  `scripts/render-sorry-board.py` → `plugins/sorry/client/assets/sorry-board.png`. The art is
  functional (marble-on-wood parquet); a richer designed asset can replace it later via the same
  script's `--field`/`--tile`/`--style` overrides without touching the client. *Found by Dev during implementation.*

### TEA (test design)
- **Gap** (non-blocking): The Sorry! client needs a baked board image asset (the parquet
  board surface) at `plugins/sorry/client/assets/`. Affects `src/clients/sorry/Board.tsx`
  + a board-geometry module of square coordinates (render the baked `<img>` and absolutely
  position pawns over it — mirrors risk's `chart-of-the-world.png` + `map-geometry.js`). The
  image is a new art artifact; generate it (Claude Design handoff) or place a usable board PNG.
  *Found by TEA during test design.*
- **Conflict** (non-blocking): The session "Acceptance Criteria" list is stale/templated and
  contradicts the merged engine — "16 pawns per player" (state.js builds 4/side), "engine.apply()"
  (the contract is POST `{type:'move',payload:{moveId}}`), "three slides" (geometry.js defines 2
  per side), "restart option" (not in scope). Affects `.session/E3-6-session.md` — SM should
  reconcile the AC list to `context-story-E3-6.md`. Tests follow context-story. *Found by TEA
  during test design.*
- **Improvement** (non-blocking): AC #7 references `npx vitest run test/sorry`, but the Sorry!
  engine suite is node:test (`node --test test/sorry`); vitest only covers the React component
  tests under `test/client`. Full-green verification must run BOTH `node --test` and
  `npm run test:client`. Affects the story's verify/CI step. *Found by TEA during test design.*

## Design Deviations

Agents log spec deviations as they happen — not after the fact.

<!-- Agents: append deviations below this line. Do not edit other agents' entries. -->

### Reviewer (audit)
Every logged deviation reviewed; all ACCEPTED. No undocumented deviations found.
- **TEA: Client built in React, not vanilla JS** → ✓ ACCEPTED: user-directed; the vanilla guardrail
  is demonstrably stale (risk/cribbage are React), and the parquet directive is satisfied by the
  baked-image board surface.
- **TEA: Testing against context-story ACs, not the session's templated AC list** → ✓ ACCEPTED:
  the session "Acceptance Criteria" block is internally inconsistent with the engine (16 pawns,
  `engine.apply()`, 3 slides); context-story is the correct, engine-faithful source. Spec-text
  correction owned by SM at reconcile.
- **TEA: AC #6 orchestrator test is characterization (green on write)** → ✓ ACCEPTED: the contract
  shipped in E3-4/E3-5; the test correctly locks it as a regression guard.
- **TEA: AC #8 manual playtest not automated** → ✓ ACCEPTED: inherently manual; re-flagged as a
  blocking-for-epic delivery finding so it isn't lost.
- **TEA: AC #7 "vitest run test/sorry" runner reference inaccurate** → ✓ ACCEPTED: sorry engine
  tests are node:test; full-green needs both runners. Verified both pass.
- **Dev: Fixed a path-depth bug in a TEA test (assertions unchanged)** → ✓ ACCEPTED: the test
  resolved `root` one level too shallow and could never pass from `test/sorry/`; only the path was
  corrected, assertions intact. Confirmed via the now-passing client-files.test.js.
- **Dev: Client implemented in React (executing TEA's framework deviation)** → ✓ ACCEPTED: consistent
  with the accepted TEA framework deviation; built bundles correctly gitignored like risk/cribbage.

### Dev (implementation)
- **Fixed a path-depth bug in a TEA test (assertions unchanged)**
  - Spec source: `test/sorry/client-files.test.js` (TEA red-phase test)
  - Spec text: `const root = resolve(import.meta.dirname, '..');`
  - Implementation: changed to `resolve(import.meta.dirname, '..', '..')`.
  - Rationale: The file lives in `test/sorry/` (two levels below repo root), but borrowed the
    single-`..` root computation from the `test/<plugin>-client-files.test.js` convention (one level
    below root). As written it resolved `root` to `test/` and asserted against `test/plugins/...`,
    so it could NEVER pass regardless of implementation. Only the root path was corrected; every
    existence assertion is intact, and the test now genuinely verifies the delivered client.
  - Severity: minor
  - Forward impact: none — test now passes against the real deliverables; no production code affected.
- **Client implemented in React (executing TEA's logged framework deviation)**
  - Spec source: context-story-E3-6.md Technical Guardrails ("vanilla JS")
  - Spec text: "Vanilla JS, no build step ... matching all existing plugins."
  - Implementation: React under `src/clients/sorry`, built via the existing vite client pipeline,
    mirroring risk/cribbage — per Good Patron's in-session directive (see TEA deviation above).
  - Rationale: User-directed; the guardrail is stale (risk/cribbage are already React). The board
    uses the parquet baked-image surface, satisfying the directive in React rather than vanilla.
  - Severity: major
  - Forward impact: the plugin now depends on `npm run build:client` (`prepare`) to emit `app.js`,
    consistent with risk/cribbage; built bundles are gitignored.

### TEA (test design)
- **Client built in React, not vanilla JS**
  - Spec source: context-story-E3-6.md, Technical Guardrails
  - Spec text: "Vanilla JS, no build step ... plain HTML/CSS/JS on the client, matching all existing plugins."
  - Implementation: Tests target a React client under `src/clients/sorry` (`SorryApp`, `Board`) built via the existing vite client pipeline, mirroring `risk`/`cribbage`.
  - Rationale: Good Patron directed this in-session. The guardrail is stale — `cribbage` and `risk` are already React with a shared component layer + build pipeline, so "matching all existing plugins" now means React. Risk is a board game with a baked board image (`chart-of-the-world.png`), a near-exact precedent for the parquet directive, and React enables real component/interaction tests instead of brittle source-greps.
  - Severity: major
  - Forward impact: Dev implements React (`src/clients/sorry/*`; run `npm run build:client`), not vanilla; a baked board image asset is required; the parquet trick is realised as a baked `<img>` board surface + positioned pawn overlays (risk Board pattern).
- **Testing against context-story ACs, not the session's templated AC list**
  - Spec source: E3-6-session.md "Acceptance Criteria" vs context-story-E3-6.md "AC Context"
  - Spec text: session ACs say "16 pawns per player", "engine.apply()", "three slides", "restart option".
  - Implementation: Tests follow context-story-E3-6.md ACs (4 pawns/side; POST `{type:'move',payload:{moveId}}`; 2 slides per side; win/lose banner keyed on `youAre === winner`).
  - Rationale: The session AC block is an internally inconsistent template fill contradicting the merged engine (state.js: 4 pawns/side; geometry.js: 2 slides/side; actions.js: moveId POST, no `engine.apply()`). context-story-E3-6.md is consistent with the engine and epic architecture, and the SM Assessment itself directs testing "the six acceptance criteria" from context-story.
  - Severity: minor
  - Forward impact: SM should reconcile the session AC list to context-story (see Delivery Findings).
- **AC #6 orchestrator integration test is a characterization test (green on write), not RED**
  - Spec source: context-story-E3-6.md, AC #6
  - Spec text: "Orchestrator integration test passes ... against the real engine with no mocks beyond the LLM stub."
  - Implementation: `test/sorry/orchestrator-turn.test.js` passes immediately — the turn engine (E3-4) and adapter (E3-5) are already merged; it locks the contract rather than driving new code.
  - Rationale: AC #6 is E3-6's integration milestone, but the code it exercises shipped earlier. The test still belongs here as the regression guard the AC requires.
  - Severity: minor
  - Forward impact: none — Dev must keep it green; no new engine code is needed for AC #6.
- **AC #8 manual playtest is not automated**
  - Spec source: context-story-E3-6.md, AC #8
  - Spec text: "A game is started vs The Bully ... observed in the browser ..."
  - Implementation: No automated test; deferred to the manual playtest step (verify/playtest).
  - Rationale: An end-to-end browser playtest with a live AI opponent cannot be expressed as a unit/component test.
  - Severity: minor
  - Forward impact: Playtest must be performed manually before the epic closes; document findings.
- **AC #7 runner reference ("vitest run test/sorry") is inaccurate**
  - Spec source: context-story-E3-6.md, AC #7
  - Spec text: "npx vitest run test/sorry passes all tests"
  - Implementation: Sorry! engine tests are node:test under `test/sorry` (run by `node --test`, package.json "test"); the React component tests are vitest under `test/client`. Full green = both runners.
  - Rationale: vitest's `include` is `test/client/**` only; `test/sorry` runs via `node --test`.
  - Severity: minor
  - Forward impact: verify/CI must run both `node --test` and `npm run test:client`.

### Architect (reconcile)

**Existing entries verified:** All 5 TEA and 2 Dev deviation entries reviewed — every entry has all
6 fields, the cited spec sources exist (`sprint/context/context-story-E3-6.md`,
`docs/superpowers/specs/2026-05-27-sorry-plugin-design.md`,
`docs/superpowers/plans/2026-05-27-sorry-plugin.md`), the quoted spec text is accurate, and the
implementation descriptions match the code. Reviewer stamped all 7 ACCEPTED. No corrections needed.

**Added (one self-contained deviation TEA's umbrella entry referenced but did not itemize):**

- **Session-file AC list reinterpreted to match the merged engine and `context-story` ACs**
  - Spec source: `.session/E3-6-session.md`, "Acceptance Criteria" (the templated story-scope list,
    the highest-authority source per the spec hierarchy)
  - Spec text: "Render a visual Sorry! board with all 16 pawns per player, two home rows, and three
    slides" (AC #1); "Deck display shows back of card by default. Clicking reveals the card face"
    (AC #2); "Move submission updates game state via engine.apply()" (AC #3); "Banner ... includes
    restart option" (AC #4).
  - Implementation: 4 pawns per side (engine `state.js` builds `length: 4`); the drawn card is
    auto-revealed face-up from the server view (no click-to-reveal — card draw is a server-
    authoritative rule); moves POST `{ type:'move', payload:{ moveId } }` to the action endpoint
    (there is no client `engine.apply()`); the win/lose banner has no restart control (no Gamebox
    client offers in-game restart — games launch from the lobby); the board has 2 slides per side
    (geometry.js `SLIDES`), Safety lane + Home per side.
  - Rationale: The session AC block is a stale template fill that is internally inconsistent with
    the merged engine (E3-1…E3-5). The build correctly followed `context-story-E3-6.md`'s "AC
    Context" (engine-faithful) and the project's server-authoritative-mechanics convention. Resolves
    to spec-check **Option A (update spec)**: the session AC text should be corrected to match the
    engine; no code change is warranted.
  - Severity: minor
  - Forward impact: none on code or sibling stories. Documentation hygiene only — SM should align the
    session AC text to `context-story-E3-6.md` so the audit trail is internally consistent.

**AC deferral check:** No formal ac-completion accountability table was produced by this tdd run.
The only outstanding AC is **AC #8 (manual playtest vs The Bully / The Tortoise)** — inherently
manual, deferred to the playtest step, and tracked as a Reviewer delivery finding. It was not
addressed or invalidated during review; status unchanged (outstanding, blocking-for-epic-close).