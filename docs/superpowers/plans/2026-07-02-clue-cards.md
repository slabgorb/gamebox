# Clue Visual Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain text-pill Clue card rendering with framed portrait card tiles in the hand, ledger, and refute prompt.

**Architecture:** A single `CARD_ART` data map (plain JS, the board-geometry mirror pattern) resolves every engine card id to its portrait file/label/glyph/category. A thin `ClueCard` React component renders any card id as a framed tile, falling back to a glyph when art is missing (the OpponentCard pattern). The hand, ledger, and refute prompt render `ClueCard`; the suggest/accuse dropdowns are untouched this pass.

**Tech Stack:** React (TSX), plain-JS ESM data modules, vitest + @testing-library/react (jsdom) for component tests, node:test for the data drift guard, Vite client bundle.

## Global Constraints

- **Engine card ids are authoritative** (`plugins/clue/server/cards.js`), copied verbatim:
  - Suspects: `scarlett, mustard, white, green, peacock, plum`
  - Weapons: `candlestick, knife, leadpipe, revolver, rope, wrench`
  - Rooms: `kitchen, ballroom, conservatory, diningroom, billiardroom, library, lounge, hall, study`
- **Canonical suspect id → portrait filename map** (pinned by `test/clue-board-drift.test.js`): `scarlett→miss-scarlett, mustard→colonel-mustard, white→mrs-white, green→mr-green, peacock→mrs-peacock, plum→professor-plum`. Every weapon and room filename equals its id (including `leadpipe.png`, now authored).
- **The per-card `glyph` is a defensive load-failure fallback**, not a shipping state — all 21 portraits now exist, so no card renders glyph-only. The `<img onError>` removal reveals the glyph only if a portrait ever fails to load.
- **Data/mirror modules the tests import must be plain `.js` ESM** (not `.ts`), so `node --test` can import them without a loader — the established `board-geometry.js` / `refute-prompt.js` precedent.
- **Card CSS lives ONLY in the checked-in `plugins/clue/client/style.css` under `#clue-root`.** The built `app.css` is gitignored and low-specificity; it loses the cascade to `#clue-root`. (Risk two-stylesheet lesson.)
- **Preserve `data-card={id}` and the `data-testid` values** `hand`, `ledger`, `refute-prompt` on the surfaces that already carry them, so existing/manual selectors keep working.
- **No server changes.** Card ids already arrive in the server view (`view.hand`, `view.ledger[].card`, refute `choices`).
- **The runtime bundle `plugins/clue/client/app.js` is gitignored and inert until rebuilt.** After source edits: `npm run build:client`, then restart prod with `launchctl kickstart -k gui/$(id -u)/com.slabgorb.words-server`.
- **Do not name the component `Card`** — `src/clients/shared/Card` (the playing-card component) and `test/client/Card.test.tsx` already own that name. Use `ClueCard`.

---

### Task 1: CARD_ART data map + drift guard

**Files:**
- Create: `src/clients/clue/card-art.js`
- Test: `test/clue-card-art-drift.test.js`

**Interfaces:**
- Produces: `CARD_ART: Record<CardId, { file: string|null; label: string; glyph: string; category: "suspect"|"weapon"|"room" }>` exported from `src/clients/clue/card-art.js`.

- [ ] **Step 1: Write the failing drift-guard test**

Create `test/clue-card-art-drift.test.js`:

```js
// Drift guard: the presentation art map (src/clients/clue/card-art.js) must
// stay in exact sync with the engine's card catalog (plugins/clue/server/
// cards.js) — every card has exactly one entry, correct category, non-empty
// label + glyph, and there are no orphan ids. Mirrors clue-board-drift.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CARD_ART } from '../src/clients/clue/card-art.js';
import { WEAPONS, ROOMS, ALL_CARDS, categoryOf } from '../plugins/clue/server/cards.js';

test('every engine card id has exactly one CARD_ART entry', () => {
  assert.deepEqual(Object.keys(CARD_ART).sort(), [...ALL_CARDS].sort());
});

test('each entry carries the correct category and non-empty label + glyph', () => {
  for (const id of ALL_CARDS) {
    const art = CARD_ART[id];
    assert.ok(art, `missing CARD_ART entry for ${id}`);
    assert.equal(art.category, categoryOf(id), `wrong category for ${id}`);
    assert.ok(typeof art.label === 'string' && art.label.length > 0, `label for ${id}`);
    assert.ok(typeof art.glyph === 'string' && art.glyph.length > 0, `glyph for ${id}`);
    assert.ok('file' in art, `file key for ${id}`);
    assert.ok(art.file === null || typeof art.file === 'string', `file type for ${id}`);
  }
});

test('the six suspects map to their canonical persona portrait filenames', () => {
  const expected = {
    scarlett: 'miss-scarlett', mustard: 'colonel-mustard', white: 'mrs-white',
    green: 'mr-green', peacock: 'mrs-peacock', plum: 'professor-plum',
  };
  for (const [id, file] of Object.entries(expected)) {
    assert.equal(CARD_ART[id].file, file, `suspect ${id} portrait file`);
  }
});

test('every weapon and room filename equals its id', () => {
  for (const id of WEAPONS) {
    assert.equal(CARD_ART[id].file, id, `weapon ${id} filename equals id`);
  }
  for (const id of ROOMS) {
    assert.equal(CARD_ART[id].file, id, `room ${id} filename equals id`);
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/clue-card-art-drift.test.js`
Expected: FAIL — `Cannot find module '.../src/clients/clue/card-art.js'`.

- [ ] **Step 3: Create the CARD_ART map**

Create `src/clients/clue/card-art.js`:

```js
// Presentation source-of-truth: every engine card id → its portrait art.
// Pure data (no JSX) so test/clue-card-art-drift.test.js can import it under
// node --test — the board-geometry.js mirror pattern. This is the ONLY place
// the suspect card-id → persona-portrait-filename mismatch is resolved, and
// the only place a not-yet-authored portrait (leadpipe) declares its glyph.

/**
 * @typedef {Object} CardArt
 * @property {string|null} file  portrait basename under /shared/portraits, or null => glyph-only
 * @property {string} label      display name
 * @property {string} glyph      emoji/char fallback when the image is missing or fails to load
 * @property {"suspect"|"weapon"|"room"} category
 */

/** @type {Record<string, CardArt>} */
export const CARD_ART = {
  // Suspects — card id differs from the persona portrait filename.
  scarlett: { file: 'miss-scarlett',   label: 'Miss Scarlett',   glyph: '🔴', category: 'suspect' },
  mustard:  { file: 'colonel-mustard', label: 'Colonel Mustard', glyph: '🟡', category: 'suspect' },
  white:    { file: 'mrs-white',       label: 'Mrs. White',      glyph: '⚪', category: 'suspect' },
  green:    { file: 'mr-green',        label: 'Mr. Green',       glyph: '🟢', category: 'suspect' },
  peacock:  { file: 'mrs-peacock',     label: 'Mrs. Peacock',    glyph: '🔵', category: 'suspect' },
  plum:     { file: 'professor-plum',  label: 'Professor Plum',  glyph: '🟣', category: 'suspect' },
  // Weapons — filename equals id (all six portraits authored).
  candlestick: { file: 'candlestick', label: 'Candlestick', glyph: '🕯️', category: 'weapon' },
  knife:       { file: 'knife',       label: 'Knife',       glyph: '🔪', category: 'weapon' },
  leadpipe:    { file: 'leadpipe',    label: 'Lead Pipe',   glyph: '🩹', category: 'weapon' },
  revolver:    { file: 'revolver',    label: 'Revolver',    glyph: '🔫', category: 'weapon' },
  rope:        { file: 'rope',        label: 'Rope',        glyph: '🪢', category: 'weapon' },
  wrench:      { file: 'wrench',      label: 'Wrench',      glyph: '🔧', category: 'weapon' },
  // Rooms — filename equals id (portraits renamed to match earlier).
  kitchen:      { file: 'kitchen',      label: 'Kitchen',       glyph: '🍽️', category: 'room' },
  ballroom:     { file: 'ballroom',     label: 'Ballroom',      glyph: '💃', category: 'room' },
  conservatory: { file: 'conservatory', label: 'Conservatory',  glyph: '🪴', category: 'room' },
  diningroom:   { file: 'diningroom',   label: 'Dining Room',   glyph: '🍴', category: 'room' },
  billiardroom: { file: 'billiardroom', label: 'Billiard Room', glyph: '🎱', category: 'room' },
  library:      { file: 'library',      label: 'Library',       glyph: '📚', category: 'room' },
  lounge:       { file: 'lounge',       label: 'Lounge',        glyph: '🛋️', category: 'room' },
  hall:         { file: 'hall',         label: 'Hall',          glyph: '🏛️', category: 'room' },
  study:        { file: 'study',        label: 'Study',         glyph: '🗝️', category: 'room' },
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/clue-card-art-drift.test.js`
Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/clients/clue/card-art.js test/clue-card-art-drift.test.js
git commit -m "feat(clue): CARD_ART map + drift guard for visual cards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: ClueCard component

**Files:**
- Create: `src/clients/clue/ClueCard.tsx`
- Modify: `plugins/clue/client/style.css` (replace the `#clue-root .clue-card` pill rules at lines ~90–96 with card-tile rules)
- Test: `test/client/clue-card.test.tsx`

**Interfaces:**
- Consumes: `CARD_ART` from `./card-art.js`; `CardId` from `../shared/contracts/clue`.
- Produces: `ClueCard` React component — `ClueCard({ id: CardId; onClick?: (id: CardId) => void; selected?: boolean; caption?: string })`. When `onClick` is set it renders a `<button data-card={id}>`; otherwise a `<span data-card={id}>`. Root always carries class `clue-card` plus `clue-card--{category}`.

- [ ] **Step 1: Write the failing component test**

Create `test/client/clue-card.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ClueCard } from "../../src/clients/clue/ClueCard";

describe("ClueCard", () => {
  it("renders a suspect portrait with the persona filename src and label", () => {
    const { container } = render(<ClueCard id="scarlett" />);
    const root = container.querySelector(".clue-card")!;
    expect(root).not.toBeNull();
    expect(root.classList.contains("clue-card--suspect")).toBe(true);
    expect(root.getAttribute("data-card")).toBe("scarlett");
    const img = container.querySelector("img.clue-card__img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/shared/portraits/miss-scarlett.png");
    expect(img.getAttribute("alt")).toBe("Miss Scarlett");
    expect(container.querySelector(".clue-card__label")!.textContent).toBe("Miss Scarlett");
  });

  it("renders the glyph fallback layer behind the portrait img", () => {
    const { container } = render(<ClueCard id="leadpipe" />);
    // The glyph is always present as the fallback layer; onError removes the
    // img so the glyph shows through only if the portrait fails to load.
    expect(container.querySelector(".clue-card__glyph")!.textContent).toBe("🩹");
    const img = container.querySelector("img.clue-card__img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/shared/portraits/leadpipe.png");
    expect(container.querySelector(".clue-card__label")!.textContent).toBe("Lead Pipe");
    expect(container.querySelector(".clue-card--weapon")).not.toBeNull();
  });

  it("renders a caption when provided (ledger attribution)", () => {
    const { container } = render(<ClueCard id="knife" caption="(Scarlett)" />);
    expect(container.querySelector(".clue-card__caption")!.textContent).toBe("(Scarlett)");
  });

  it("is a non-interactive span with no onClick", () => {
    const { container } = render(<ClueCard id="study" />);
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("span.clue-card")).not.toBeNull();
  });

  it("is a button that fires onClick with its id when pickable", () => {
    const onClick = vi.fn();
    const { container } = render(<ClueCard id="rope" onClick={onClick} selected />);
    const btn = container.querySelector("button.clue-card") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute("data-card")).toBe("rope");
    expect(btn.classList.contains("is-selected")).toBe(true);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledWith("rope");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:client -- clue-card`
Expected: FAIL — cannot resolve `../../src/clients/clue/ClueCard`.

- [ ] **Step 3: Create the ClueCard component**

Create `src/clients/clue/ClueCard.tsx`:

```tsx
// One visual card tile for any Clue card id. Reads CARD_ART for portrait,
// label, glyph, and category; the glyph sits behind the img and shows through
// if the portrait fails to load (the OpponentCard pattern). Interactive when
// onClick is provided (a <button>, e.g. refute choices).
import type { CardId } from "../shared/contracts/clue";
import { CARD_ART } from "./card-art.js";

interface ClueCardProps {
  id: CardId;
  onClick?: (id: CardId) => void;
  selected?: boolean;
  caption?: string;
}

export function ClueCard({ id, onClick, selected, caption }: ClueCardProps) {
  const art = CARD_ART[id];
  const className = [
    "clue-card",
    `clue-card--${art.category}`,
    onClick ? "clue-card--pickable" : "",
    selected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <span className="clue-card__portrait">
        <span className="clue-card__glyph" aria-hidden="true">{art.glyph}</span>
        {art.file && (
          <img
            className="clue-card__img"
            src={`/shared/portraits/${art.file}.png`}
            alt={art.label}
            onError={(e) => (e.currentTarget as HTMLImageElement).remove()}
          />
        )}
      </span>
      <span className="clue-card__label">{art.label}</span>
      {caption && <em className="clue-card__caption">{caption}</em>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        data-card={id}
        aria-pressed={selected ? true : undefined}
        onClick={() => onClick(id)}
      >
        {inner}
      </button>
    );
  }
  return (
    <span className={className} data-card={id}>
      {inner}
    </span>
  );
}
```

- [ ] **Step 4: Replace the card CSS in the checked-in stylesheet**

In `plugins/clue/client/style.css`, replace the three existing rules (`#clue-root .clue-card { … }`, `#clue-root .clue-card.is-shown { … }`, `#clue-root .clue-card em { … }` — currently around lines 90–96) with:

```css
/* --- Cards: framed portrait tiles (replaces the old text pills) --- */
#clue-root .clue-card {
  display: inline-flex; flex-direction: column; align-items: stretch;
  width: 88px; margin: 0 6px 6px 0; padding: 0;
  background: #efe6d8; color: #2a1a22;
  border: 2px solid #8a6d5a; border-radius: 8px; overflow: hidden;
  font: inherit; font-size: 0.8rem; text-align: center;
  appearance: none; box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
}
#clue-root .clue-card__portrait {
  position: relative; display: flex; align-items: center; justify-content: center;
  width: 100%; height: 88px; background: #1f2937; overflow: hidden;
}
#clue-root .clue-card__glyph { font-size: 40px; line-height: 1; }
#clue-root .clue-card__img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
}
#clue-root .clue-card__label {
  padding: 4px 6px; font-weight: 600; text-transform: capitalize; line-height: 1.2;
}
#clue-root .clue-card__caption {
  display: block; padding: 0 6px 4px; font-size: 0.7rem; font-style: italic; opacity: 0.7;
}
#clue-root .clue-card--suspect { border-color: #c0392b; }
#clue-root .clue-card--weapon  { border-color: #8a6d5a; }
#clue-root .clue-card--room    { border-color: #2980b9; }
#clue-root .clue-card--pickable {
  cursor: pointer; transition: transform 0.08s ease, box-shadow 0.08s ease;
}
#clue-root .clue-card--pickable:hover {
  transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0, 0, 0, 0.45);
}
#clue-root .clue-card--pickable:focus-visible,
#clue-root .clue-card.is-selected {
  outline: 2px solid #e0b23c; outline-offset: 2px;
}
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npm run test:client -- clue-card`
Expected: PASS — all 5 tests green. (jsdom does not load `style.css`; the CSS is verified visually in Task 4. This test verifies structure and classes only.)

- [ ] **Step 6: Commit**

```bash
git add src/clients/clue/ClueCard.tsx test/client/clue-card.test.tsx plugins/clue/client/style.css
git commit -m "feat(clue): ClueCard tile component + card styles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire the refute prompt to ClueCard

**Files:**
- Modify: `src/clients/clue/RefutePrompt.tsx`
- Test: `test/client/clue-refute-prompt.test.tsx`

**Interfaces:**
- Consumes: `ClueCard` from `./ClueCard`; `refuteChoices` from `./refute-prompt.js`.

- [ ] **Step 1: Write the failing test**

Create `test/client/clue-refute-prompt.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { RefutePrompt } from "../../src/clients/clue/RefutePrompt";

// Minimal view: seat 0 suggested scarlett·knife·study; our hand holds
// scarlett + knife (+ an unrelated card), so refuteChoices => [scarlett, knife].
const view = {
  suggestion: { bySeat: 0, suspect: "scarlett", weapon: "knife", room: "study" },
  hand: ["scarlett", "knife", "ballroom"],
} as any;

describe("RefutePrompt with ClueCard", () => {
  it("renders one pickable ClueCard per refutable choice", () => {
    const { container } = render(<RefutePrompt view={view} onShow={() => {}} />);
    const cards = container.querySelectorAll("button.clue-card");
    expect(cards.length).toBe(2);
    const ids = Array.from(cards).map((c) => c.getAttribute("data-card")).sort();
    expect(ids).toEqual(["knife", "scarlett"]);
  });

  it("calls onShow with the card id when a card is clicked", () => {
    const onShow = vi.fn();
    const { container } = render(<RefutePrompt view={view} onShow={onShow} />);
    const knife = container.querySelector('button.clue-card[data-card="knife"]') as HTMLButtonElement;
    fireEvent.click(knife);
    expect(onShow).toHaveBeenCalledWith("knife");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:client -- clue-refute-prompt`
Expected: FAIL — the current `RefutePrompt` renders plain text `<button>`s without the `clue-card` class, so `button.clue-card` matches 0 elements.

- [ ] **Step 3: Rewrite RefutePrompt to render ClueCards**

Replace the body of `src/clients/clue/RefutePrompt.tsx` with:

```tsx
// The async-refute pause card-choice prompt (AC2): shown only to the active
// refuter; picking a card POSTs refute{card} and the engine returns the turn
// to the suggester.
import { refuteChoices } from "./refute-prompt.js";
import { ClueCard } from "./ClueCard";
import type { ClueView, CardId } from "../shared/contracts/clue";

export function RefutePrompt({
  view,
  onShow,
}: {
  view: ClueView;
  onShow: (card: CardId) => void;
}) {
  const choices = refuteChoices(view) as CardId[];
  const s = view.suggestion!;
  return (
    <div className="clue-refute" role="status" data-testid="refute-prompt">
      <p>
        Seat {s.bySeat + 1} suggested <b>{s.suspect}</b> · <b>{s.weapon}</b> ·{" "}
        <b>{s.room}</b>. You must show one card:
      </p>
      <div className="clue-refute-cards">
        {choices.map((card) => (
          <ClueCard key={card} id={card} onClick={onShow} />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm run test:client -- clue-refute-prompt`
Expected: PASS — both tests green.

- [ ] **Step 5: Commit**

```bash
git add src/clients/clue/RefutePrompt.tsx test/client/clue-refute-prompt.test.tsx
git commit -m "feat(clue): refute prompt shows pickable ClueCards

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Wire hand + ledger, build, and verify end-to-end

**Files:**
- Modify: `src/clients/clue/ClueApp.tsx` (import `ClueCard`; hand map ~line 280; ledger map ~line 286)

**Interfaces:**
- Consumes: `ClueCard` from `./ClueCard`; existing `view.hand: CardId[]`, `view.ledger: Array<{ fromSeat: number; card: CardId }>`, and the local `name(seat)` helper (`ClueApp.tsx:107`).

- [ ] **Step 1: Add the ClueCard import**

In `src/clients/clue/ClueApp.tsx`, add after the `RefutePrompt` import (line 14):

```tsx
import { ClueCard } from "./ClueCard";
```

- [ ] **Step 2: Replace the hand render**

In `src/clients/clue/ClueApp.tsx`, replace the hand map (currently line 280):

```tsx
          {view.hand.map((c) => <span key={c} className="clue-card">{c}</span>)}
```

with:

```tsx
          {view.hand.map((c) => <ClueCard key={c} id={c} />)}
```

- [ ] **Step 3: Replace the ledger render**

In `src/clients/clue/ClueApp.tsx`, replace the ledger map (currently lines 285–289):

```tsx
            {view.ledger.map((e, i) => (
              <span key={i} className="clue-card is-shown">
                {e.card} <em>({name(e.fromSeat)})</em>
              </span>
            ))}
```

with:

```tsx
            {view.ledger.map((e, i) => (
              <ClueCard key={i} id={e.card} caption={`(${name(e.fromSeat)})`} />
            ))}
```

- [ ] **Step 4: Run all component tests to confirm no regression**

Run: `npm run test:client`
Expected: PASS — the full `test/client/**` suite, including the new `clue-card` and `clue-refute-prompt` tests.

- [ ] **Step 5: Run the server test suite to confirm no regression**

Run: `npm test`
Expected: PASS — including `clue-card-art-drift`, `clue-board-drift`, `clue-e2e-registration`, and the rest. (No server code changed; this guards against accidental breakage and confirms the new node:test is picked up by the `test/**/*.test.js` glob.)

- [ ] **Step 6: Build the client bundle**

Run: `npm run build:client`
Expected: `[build-clients] building clue` succeeds and reports an updated `plugins/clue/client/app.js` (bundle is gitignored; this is what the running server serves).

- [ ] **Step 7: Restart prod and verify the cards render**

Run: `launchctl kickstart -k gui/$(id -u)/com.slabgorb.words-server`
Then, in a live 3–4 seat mixed game (drive with the project's Playwright/browser tooling, or manually at `words.slabgorb.com`), confirm the spec's checks:
- A hand card renders `<img src="/shared/portraits/miss-scarlett.png">` for a held `scarlett` card (framed tile, not a text pill).
- A `leadpipe` card (if held/shown) renders `<img src="/shared/portraits/leadpipe.png">` (real art, now authored) — not a broken image.
- During a refute, the "show one card" prompt lists clickable card tiles, and clicking one POSTs the refute and returns the turn.
- The ledger ("Shown to you") tiles carry the `(Seat name)` caption.

- [ ] **Step 8: Commit**

```bash
git add src/clients/clue/ClueApp.tsx
git commit -m "feat(clue): hand + ledger render ClueCard tiles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Notes / dependencies

- **All 21 portraits now exist**, including `public/shared/portraits/leadpipe.png` (authored 2026-07-02). Every `CARD_ART` entry has a real `file`; the `glyph` fields are purely defensive load-failure fallbacks.
- **Uncommitted portrait assets** (the two persona renames + 9 room PNGs + `leadpipe.png`) are staged/untracked from prior work; they are not part of this plan's code commits and can be committed separately. The suspect renames (`mrs-peacock.png`, `professor-plum.png`) and every weapon/room PNG must be present for the card images to resolve.
- **Out of scope:** visual card-grid selector for suggest/accuse (`ThreeCardPicker` stays dropdowns), card-back/envelope art.
```
