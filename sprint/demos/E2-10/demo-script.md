# Demo Script — E2-10

**Total time: ~8 minutes**

---

**Scene 1 — Title (Slide 1), 0:00–0:30**
Open on the title slide. Introduce the story: "Today we're showing the card mechanic coming to life in the Risk game interface — the last missing piece before the AI-style data collection can begin."

---

**Scene 2 — Problem (Slide 2), 0:30–1:30**
Advance to the Problem slide. Say: "Until this week, Risk had a fully-running card engine on the server — cards awarded, sets validated, bonuses tracked — but the player's screen showed nothing. No hand, no trade button, no warning when blocked. The game could silently refuse to let you deploy with no explanation."

*Fallback if live demo unavailable: stay on Slide 2 and describe what a player saw before — no card indicators anywhere.*

---

**Scene 3 — What We Built (Slide 3), 1:30–4:00**
Open a Risk game in the browser with a seeded hand (minimum 3 cards for a valid set; 5 cards for the must-trade demo).

- **Hand tray:** Point to the card tray at the bottom of the board. Show a hand containing, for example: "Kamchatka (Infantry), Irkutsk (Cavalry), Yakutsk (Wild)." Each card shows its territory name and type label.
- **Valid set selection:** Click the three cards above. The "Trade In" button activates and shows: "Trade in for **6 bonus armies**." Point out the number updates based on how many sets have already been traded in this game (escalating: 4 → 6 → 8 → 10 → 12 → 15 → 20 → ...).
- **Invalid set:** Deselect, then select three Infantry cards (if available) or describe: "Selecting two Infantry and one Cavalry with no Wild — button stays disabled."
- **Opponent count:** Point to the opponent's card indicator: "You can see your opponent holds 4 cards. You cannot see which territories or types."

*Fallback: Show the Before/After slide instead of the live board.*

---

**Scene 4 — Must-Trade Modal, 4:00–5:30**
Switch to a game state with exactly 5 cards in hand (or describe the scenario if not pre-seeded).

- At the start of the reinforcement phase, a blocking modal appears: "You must trade in a card set before deploying."
- Attempt to click the deploy button — it is blocked. The modal is the only thing on screen.
- Trade in a valid set. The modal dismisses. The deploy interface becomes available.
- Say: "Before this, the server would simply reject the deploy action with an error message. Now the game guides the player through the required step."

*Fallback: Show the Before/After slide describing the soft-lock scenario.*

---

**Scene 5 — Why This Approach (Slide 4), 5:30–6:30**
Advance to Slide 4. Highlight two points: (1) the client mirrors server validation so the UI and the engine always agree on what's a valid set; (2) an early build had a rendering bug where traded cards could flicker — caught in code review, fixed before shipping.

---

**Scene 6 — Roadmap (Roadmap Slide), 6:30–7:30**
Advance to the Roadmap slide. "This is the last UI piece the data collection harness needs. Starting next, the AI opponents can now see and use the card mechanic — E2-9 wires that in. The corpus collection work (E2-3 through E2-7) is gated on the pilot results."

---

**Scene 7 — Questions Slide, 7:30–8:00**
Open for questions.

---
