# E2-10

## Problem

Problem: Players in Risk had a fully-working card engine running on the server — awarding cards for capturing territories, enforcing trade-in rules, and calculating escalating army bonuses — but the game screen showed none of it. The interface was completely blind to a core game mechanic. Why it matters: Without a visible card hand, players couldn't trade in their cards for bonus armies, and the game could reach a soft-lock state where a player holding five or more cards was silently blocked from deploying troops with no explanation.

---

## What Changed

Think of it like adding a card hand to a poker app that previously only tracked your chips. Three things appeared on the screen for the first time:

1. **Your card hand** — A tray at the bottom of the game board now shows each card you hold, labeled with the territory it came from and its type (Infantry, Cavalry, Artillery, or Wild).

2. **A trade-in panel** — You can click cards to select them. When you've picked a valid combination (three of a kind, one of each type, or any two plus a wild card), a "Trade In" button activates and tells you exactly how many bonus armies you'll receive — a number that grows each time anyone trades in a set during the game.

3. **A must-trade warning** — If you're sitting on five or more cards when it's time to deploy armies, a blocking prompt appears and won't let you proceed until you trade a set in first. This prevents a situation where the game quietly refuses your moves with no explanation.

Opponents' cards remain private — you can see *how many* cards they hold, but never *which* ones.

---

## Why This Approach

The server already enforced all the card rules — what makes a valid set, when trading is mandatory, how the bonus escalates. The client-side code was written to mirror that logic exactly, so the interface and the game engine always agree. Showing the bonus army count required adding one small derived value on the server (the "next bonus" number), since the raw counter driving the escalation is kept private to prevent cheating.

The card tray was built as a self-contained component, keeping the new code isolated and easy to test. An early build was rejected during code review because a subtle browser rendering bug could cause cards to flicker or show the wrong selection state after a trade — this was caught and fixed before shipping. The final version passed 144 automated checks covering the full interaction flow including edge cases like invalid sets, stale selections, and the must-trade blocking state.

---
