# Demo Script — E2-11

**Total runtime: ~8 minutes**

**Scene 1 — Title (Slide 1) | 0:00–0:30**
Open on the title slide. Introduce the story: "Today we're showing how we gave our AI opponents different levels of brainpower depending on which game they're playing."

**Scene 2 — Problem (Slide 2) | 0:30–1:30**
Walk through the before state. "Previously, every bot — whether playing Risk or Cribbage — used the same model. That's like hiring a chess grandmaster to play Go Fish." Point to the cost vs. quality tension bullet.

**Scene 3 — What We Built (Slide 3) | 1:30–3:00**
Show the model routing diagram. Walk through: "When the server wakes up an AI turn, it now checks `GAME_MODEL_MAP`. Risk resolves to `claude-sonnet-4-6`. Everything else resolves to `claude-haiku-4-5`."

Show the map in the terminal:
```bash
grep -A 10 "GAME_MODEL_MAP" server/ai/orchestrator.js
```
Point out the three lines: the map, the resolver, the fallback.

**Scene 4 — Why This Approach (Slide 4) | 3:00–4:30**
Explain the concierge analogy. Emphasize: one map, zero changes to game engines, easy to extend.

**Scene 5 — Live Demo | 4:30–6:30**
Run the test suite to show both assertions passing:
```bash
npm test -- --grep "model resolution"
```
Expected output: two green checkmarks —
- `Risk resolves to claude-sonnet-4-6` ✓
- `Cribbage resolves to claude-haiku-4-5` ✓

*Fallback if tests fail:* Switch to the Before/After slide showing the diff with the map literal and the two test descriptions highlighted.

**Scene 6 — Roadmap (Roadmap Slide) | 6:30–7:30**
"This seam is what makes the next phase possible — per-persona model tuning, cost dashboards, and eventually offline model support."

**Scene 7 — Questions | 7:30–8:00**

---
