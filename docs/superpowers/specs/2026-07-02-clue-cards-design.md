# Clue visual cards — design spec

**Date:** 2026-07-02
**Status:** Approved (design), ready for implementation plan
**Scope:** Client-only. Replace the plain text-pill card rendering in the Clue
client with proper visual cards showing the existing portrait art.

## Problem

Clue cards render today as bare text pills. In `ClueApp.tsx:280` a hand card is
`<span className="clue-card">scarlett</span>`, styled as a tan pill by
`#clue-root .clue-card` in `plugins/clue/client/style.css`. The ledger
("Shown to you") and the refute prompt are likewise text-only. We have portrait
art for every suspect, every room, and 5 of 6 weapons — but none of it reaches
the card surfaces.

We want the cards to look like cards: a framed tile with the portrait, a name,
and category-colored trim.

## Decisions (from brainstorming)

- **Runtime HTML/CSS components**, not baked composite PNGs. The art already
  exists as individual portrait PNGs; a component reuses them directly, needs no
  new committed binaries, supports interactive/selectable states, and lets a
  missing weapon (leadpipe) degrade to a glyph.
- **`leadpipe.png` will be authored by the user** (like `kitchen`/`hall` were).
  Until then the card shows a glyph fallback; dropping the PNG in later needs no
  code change.
- **The suggest/accuse picker (`ThreeCardPicker`) stays as `<select>`
  dropdowns** this pass. Converting it to a visual card-grid selector is a
  separable follow-up.

## Card id → art inventory

Engine card ids come from `plugins/clue/server/cards.js`; contract types are in
`src/clients/shared/contracts/clue.ts` (`SuspectId | WeaponId | RoomId =
CardId`).

| Category | Card ids | Portrait file | Notes |
|----------|----------|---------------|-------|
| Suspect  | `scarlett, mustard, white, green, peacock, plum` | `miss-scarlett, colonel-mustard, mrs-white, mr-green, mrs-peacock, professor-plum` | **id ≠ filename** — needs a map |
| Weapon   | `candlestick, knife, leadpipe, revolver, rope, wrench` | same as id `.png` | **`leadpipe.png` not yet authored** — glyph fallback |
| Room     | `kitchen, ballroom, conservatory, diningroom, billiardroom, library, lounge, hall, study` | same as id `.png` | all 9 present, exact match |

The suspect id↔filename mismatch is the crux: the short card id (`scarlett`) is
not the persona/portrait filename (`miss-scarlett`). This mapping is resolved in
exactly one place (§2).

## Components

### 1. `<Card>` — one reusable card tile

New `src/clients/clue/Card.tsx`. Renders any card id as a framed tile.

Props:

```ts
interface CardProps {
  id: CardId;
  onClick?: (id: CardId) => void; // present => rendered as a <button> (pickable)
  selected?: boolean;             // pickable/selected visual state
  caption?: string;               // e.g. ledger attribution "(Scarlett)"
}
```

Behavior:
- Looks up `CARD_ART[id]` (§2) for the portrait file, display label, glyph, and
  category.
- Renders portrait `<img src="/shared/portraits/{file}.png" alt="{label}">` over
  a category-colored frame. On image load error **or** when the map entry has no
  `file`, shows the glyph instead (same fallback shape as `opp-card__fallback`).
- Capitalized name label below the portrait.
- When `onClick` is provided, the tile is a `<button>` (keyboard-focusable,
  `data-card={id}` preserved so existing selectors/tests still target it);
  otherwise a non-interactive `<div>`.

### 2. `CARD_ART` — single source-of-truth art map

New `src/clients/clue/card-art.ts`:

```ts
export interface CardArt {
  file: string | null;   // portrait basename, null => glyph-only (e.g. leadpipe today)
  label: string;         // display name, e.g. "Miss Scarlett", "Lead Pipe"
  glyph: string;         // emoji/char fallback
  category: "suspect" | "weapon" | "room";
}

export const CARD_ART: Record<CardId, CardArt> = { /* 21 entries */ };
```

This is the **only** place the suspect id→filename mapping lives (`scarlett →
miss-scarlett`, etc.) and the only place a missing-art entry (`leadpipe`,
`file: null`) is declared. Weapons/rooms set `file` equal to the id.

### 3. Render sites

- **Hand** (`ClueApp.tsx`, `clue-hand`): map `view.hand` to `<Card>` display
  tiles.
- **Ledger** (`ClueApp.tsx`, `clue-ledger`): map `view.ledger` to
  `<Card caption={"(" + name(e.fromSeat) + ")"} />`.
- **RefutePrompt** (`RefutePrompt.tsx`): replace the text `<button>`s with
  `<Card onClick={onShow}>` selectable cards. Keep `data-card={card}` so the
  refute e2e/Playwright selectors are unchanged.
- **ThreeCardPicker**: unchanged (`<select>` dropdowns) this pass.

## Styling

New card classes live in the **checked-in** `plugins/clue/client/style.css`
under `#clue-root` (high specificity), replacing the current `#clue-root
.clue-card` pill rule. They do **not** go in a shared/imported stylesheet:
`app.css` (built, gitignored) is low-specificity and loses the cascade to
`#clue-root`, per the Risk two-stylesheet lesson. Category trim colors reuse the
canonical pawn palette where sensible.

## Data flow & build

- **No server changes.** Card ids already arrive in the server view
  (`view.hand`, `view.ledger[].card`, and the refute `choices` derived from the
  view). Rendering is pure client.
- The `.tsx`/`.ts`/`.css` sources under `src/clients/clue` +
  `plugins/clue/client/style.css` are the source of truth; the runtime bundle
  `plugins/clue/client/app.js` is gitignored and **inert until rebuilt**. After
  edits: `npm run build:client`, then restart prod with
  `launchctl kickstart -k gui/$(id -u)/com.slabgorb.words-server`.

## Testing

- **Unit — `CARD_ART` drift guard** (mirrors `test/clue-board-drift.test.js`):
  every `SUSPECTS`/`WEAPONS`/`ROOMS` id has exactly one `CARD_ART` entry with a
  non-empty `label`, `glyph`, and correct `category`; there are no orphan
  entries. This keeps the map in sync with the engine card lists and pins the
  suspect→file mapping.
- **Playwright** (project's browser-test stack): in a live game, a hand card
  renders `<img src="/shared/portraits/miss-scarlett.png">` for `scarlett`;
  `leadpipe` renders the glyph fallback (no broken `<img>`); a refute card is
  clickable and POSTs the `refute{card}` action.

## Out of scope / follow-ups

- Visual card-grid selector for suggest/accuse (`ThreeCardPicker`).
- Card-back / envelope art.
- `leadpipe.png` authoring (owned by the user, tracked separately).
