# E3-6

## Problem

**Problem:** The Sorry! game engine and AI opponents existed but there was no way for a player to actually see or interact with the game — no board, no cards, no way to make a move, and no moment of victory. **Why it matters:** A game engine without a user interface is invisible. Epic E3's goal was a fully playable Sorry! experience against an AI opponent; this story is what turns that engine into something a real person can sit down and enjoy.

---

## What Changed

Imagine a board game that existed only as a rulebook — every rule was written down perfectly, but the board, the cards, and the pieces were sitting in a box, still unassembled. That was the state of Sorry! before this story.

This story assembled everything into a playable game:

- **A visual board appeared.** Players now see the colorful Sorry! track — the ring of 60 spaces, the Home zones, the Safety lanes, and the three colored Slides — rendered as a crisp, pre-drawn image.
- **Pawns show up in the right places.** Each player's four pawns sit exactly where the game engine says they are, updating after every move.
- **Cards work like real cards.** The deck sits face-down. When it's your turn, you click it and the card flips over to reveal what you drew.
- **Legal moves light up.** After drawing a card, every square you're legally allowed to move to becomes a clickable target. You click it and your pawn moves there. No menus, no forms — just click where you want to go.
- **The AI takes its turn automatically.** When it's the AI's turn (whether playing as The Bully or The Tortoise), the opponent thinks, picks a move, and plays — all without the human player doing anything.
- **Someone wins.** When a player gets all four pawns home, a banner appears declaring the winner and offering a rematch.

---

## Why This Approach

Three decisions shaped how this was built, and each one was deliberate:

**1. React instead of plain HTML/JavaScript.** The two other complex board games in Gamebox (Risk and Cribbage) already use React for their client interfaces. Matching that pattern means the Sorry! UI gets the same shared tools, the same build pipeline, and the same test framework — rather than maintaining a one-off that future developers would have to learn separately.

**2. A baked board image instead of drawing the board in code.** Some game boards are simple enough to describe in code. Sorry!'s board — with its marble track, wood-grain field, Safety lanes, and colored Slides — is not one of them. A Python script generates one high-quality board image once; the browser loads it like a photograph and the game overlays pawns and move targets on top of it. This approach is faster to load, simpler to maintain, and looks significantly better than anything assembled from CSS boxes.

**3. The server decides everything, the browser just displays it.** The server tells the client which card was drawn and which moves are legal. The browser never calculates this itself. This keeps the game honest — a player can't cheat by manipulating their browser — and it means the AI opponent and the human player are evaluated by the exact same rules engine.

---
