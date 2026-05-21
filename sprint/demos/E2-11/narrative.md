# E2-11

## Problem

Problem: Every AI opponent in the game platform — whether playing Risk, Cribbage, or Words — was using the same AI model, regardless of how complex or strategic that game is. Why it matters: Risk involves territory management, probabilistic combat, and long-horizon planning across dozens of decisions per turn; running it on the same lightweight model as a word game left quality on the table. Meanwhile, routing all games through a premium model would inflate costs unnecessarily for simpler games that don't need it.

---

## What Changed

Imagine a hotel concierge who used to send every guest to the same single taxi — whether they needed a quick ride across town or a six-hour airport transfer with luggage. Now the concierge checks where you're going first, then picks the right vehicle.

The AI orchestrator now does exactly that: before waking up a bot player, it checks which game is being played, then looks up the right AI model for that game type. Risk gets routed to Claude Sonnet 4.6 (the strategic thinker). Cribbage, Backgammon, and Words stay on Claude Haiku (fast and cost-efficient). Any new game type that hasn't been mapped yet automatically falls back to the platform default — no crashes, no surprises.

---

## Why This Approach

A hard-coded single model is fragile — changing it means touching every game. A per-game map is a one-line addition when a new game ships. We put the routing logic in one place (the orchestrator) so game engines don't need to know anything about AI models; they just ask "wake up the bot" and the orchestrator handles the rest. This also makes A/B testing future models trivial: swap one entry in the map, redeploy, done.

Sonnet was chosen for Risk specifically because Risk AI personas (aggressor, diplomat, turtler) need nuanced reasoning about multi-territory chains and opponent psychology — capabilities where Sonnet measurably outperforms Haiku. For turn-based card and word games, Haiku's speed and lower cost are the right tradeoff.

---
