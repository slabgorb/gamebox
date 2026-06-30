# Story E5-5 Context

## Title
Talk-smack discoverability + chat presentation

## Metadata
- **Story ID:** E5-5
- **Type:** feature
- **Points:** 2
- **Priority:** p3
- **Workflow:** trivial
- **Repo:** g-1
- **Epic:** Risk Playtest Follow-up

## Problem
**Low priority** (flagged by the user). Two issues with player→bot smack-talk, both in
`src/clients/shared/AiRoster.tsx`:

- **Discoverability:** the input is an unlabeled `<input placeholder="Talk smack…">` with
  a `hidden` submit button, tucked at the bottom of the `.ai-roster` panel. Playtesters
  didn't find it.
- **Presentation:** it's hard to follow the conversation. Bot bubbles auto-hide after 5s
  (`scheduleHide`), the player's own echoed message (`myFlash`) clears after 4s, and there
  is no scrollback — messages are transient and easy to miss.

## Technical Approach
**Client-only, contained to `AiRoster.tsx` + `src/clients/shared/OpponentCard.css`.** No
SSE-protocol or server changes.

- **Discoverability:** give the chat a visible affordance — a label or a visible send
  button/icon, and/or a clearer position. The SSE events (`banter`, `bot_thinking`,
  `bot_stalled`, `user_chat`) and the per-bot POST to `/api/games/:id/chat` already work;
  this is purely making the entry point obvious.
- **Presentation:** make the exchange easier to read — e.g. a small persistent recent-
  message log (last N lines) in addition to or instead of the auto-hiding bubbles, or
  longer-lived / better-placed bubbles. Keep it lightweight; this is polish, not a chat
  subsystem.
- Build: `npm run build:client` + restart before "done".

## Scope
- **In scope:** a discoverable chat-input affordance; more legible presentation of the
  smack-talk exchange.
- **Out of scope:** changing the SSE event protocol or the `/chat` endpoint; bot banter
  *generation* (persona prompts); persisting chat history server-side; the portrait
  overlap fix (E5-4, same component — coordinate if co-scheduled).

## Acceptance Criteria
1. **Discoverable input.** The smack-talk entry point has a visible label or button (not
   just a placeholder) and is reasonably findable without prior knowledge.
2. **Legible exchange.** Recent messages (player and bot) are readable for longer than the
   current 4–5s auto-hide — e.g. a short persistent log or parked bubbles — so a player
   can follow the back-and-forth.
3. **No protocol regression.** Sending still POSTs per-bot to `/api/games/:id/chat` and
   incoming `banter`/`user_chat` SSE events still render; existing chat tests stay green.

---
_Authored by Architect (Naomi Nagata, design mode), 2026-06-30. Low priority per the user._
