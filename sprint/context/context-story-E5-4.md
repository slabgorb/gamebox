# Story E5-4 Context

## Title
Bot portraits overlap on the display

## Metadata
- **Story ID:** E5-4
- **Type:** bug
- **Points:** 2
- **Priority:** p2
- **Workflow:** trivial
- **Repo:** g-1
- **Epic:** Risk Playtest Follow-up

## Problem
With 3–4 players (more bots on screen since E4 made Risk N-player), the AI portraits
overlap. `src/clients/shared/AiRoster.tsx` renders one `BotCard` per bot inside a
`.ai-roster` container; the layout (in `src/clients/shared/OpponentCard.css`) doesn't
wrap or size the cards for more than the original 2P case, so multiple portraits collide.

## Technical Approach
**Client-only, CSS layout fix — no logic change.**

- Fix the `.ai-roster` / `.opp-card` layout in `src/clients/shared/OpponentCard.css` so
  3–4 portraits lay out without overlap: flex-wrap and/or per-card sizing / `max-width`,
  and verify the chat input (`.opp-card__chat`) and `my-bubble` still sit correctly below.
- Confirm against a real 4-seat game (3 bots + you). The roster is rendered from
  `RiskApp.tsx`'s `bots` list, so seat count drives the card count.
- Do not change portrait content, persona resolution, or the SSE banter wiring — purely
  the box layout.
- Build: `npm run build:client` + restart before "done".

## Scope
- **In scope:** CSS layout so bot portraits/cards don't overlap at 2–4 bots.
- **Out of scope:** portrait artwork, persona logic, banter behavior, 5–6P layouts
  (Risk caps at 4 today), and the chat-input redesign (that's E5-5 — both touch the same
  component; coordinate if scheduled together).

## Acceptance Criteria
1. **No overlap at max seats.** In a 4-seat game (3 bot portraits), the cards render
   side-by-side or wrapped with no visual overlap.
2. **2P unchanged.** The legacy 2P single-portrait layout is visually unregressed.
3. **Chat affordance intact.** The "Talk smack…" input and self-message bubble still
   render in their correct positions relative to the (now non-overlapping) cards.

---
_Authored by Architect (Naomi Nagata, design mode), 2026-06-30._
