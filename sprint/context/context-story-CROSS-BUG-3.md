# Story CROSS-BUG-3: Client-side dice rolling for AI (Risk + Backgammon)

## Brief (from user)

Implement client-side dice rolling for AI opponents in Risk and Backgammon. Architecturally this is the same collapsed-mechanic pattern cribbage uses for the cut (see `plugins/cribbage/server/phases/discard.js:25` — applyDiscard inlines performCut when both discards land; no separate "cut" action, no round-trip wait).

**Principle:** Dice rolls are a no-decision rules mechanic with a visible 3D physics animation. So they live on the client (wherever the dice render), inlined into the action that triggers them. The bot never rolls; the server never calls `Math.floor(rng() * 6) + 1` for dice values; whichever client renders the dice physics IS the roll. The physics outcome is the truth.

### Risk Implementation

Today `plugins/risk/server/actions.js:applyAttack` has a server-resolved path (line 178+) that runs `resolveAttack → rollDice` for bot attackers. Tear it out. Replace with:

1. When `applyAttack` receives an attack without a `resolved` payload (i.e., a bot's intent), set `state.pendingCombat = { from, to, force, attackerIdx, defenderIdx }` and return success. Do NOT resolve, do NOT advance phase.
2. Surface `pendingCombat` over the wire. The defender's client (src/clients/risk/...) watches for it and, when `pendingCombat.defenderIdx === me`, renders `<CombatReveal mode="live">` driving both `atkRef.roll(n)` and `defRef.roll(n)` locally. On the resolved Promise, POST `{type: 'attack', payload: {from, to, force, resolved: {rounds}}}` (or a new resolve-combat action — your call) AS the human acting as resolver for the bot's intent.
3. Server's resolved-path validator/applier (already exists, spec Amendment A.1) applies the result, clears `pendingCombat`. Existing logic.
4. The orchestrator's turn-continuation gate currently waits on `activeUserId === bot`. It will naturally re-fire after `pendingCombat` is cleared because state changed; no orchestrator code change should be needed. Verify this on first end-to-end test — if the bot doesn't pick its next attack/end-attack after resolution, the gate needs a "wait until !state.pendingCombat" addition.
5. Delete the server-resolved `rollDice` path entirely once tests pass. `plugins/risk/server/combat.js:rollDice` can stay if used by tests; the action handler call site goes away.

### Backgammon Implementation

Today `src/server/ai/orchestrator.js:37,47` and `plugins/backgammon/server/ai/backgammon-player.js:54` server-side RNG dice values into the bot's roll/roll-initial action payloads. Same fix shape, slightly more handshakes because the bot needs the rolled values to pick moves:

1. Bot's pre-roll/initial-roll wake-up signals intent to roll (action with no values/throwParams, or a new pending-roll marker set server-side). Server stores `state.pendingRoll = { player: botIdx, kind: 'roll' | 'roll-initial' }` and pauses the orchestrator continuation.
2. Human's client picks up `state.pendingRoll`, mounts a dice-tray, physically rolls 2d6 (or 1d6 for initial-roll), reads the settled values, POSTs them back as the roll action with the values.
3. Server applies values to `state.turn.dice`, clears `pendingRoll`, signals orchestrator wake-up. Bot resumes the same wake-up cycle and picks moves using those values.
4. Continuation gate needs: "the bot's wake-up is paused while `state.pendingRoll` exists; resume when cleared." That's the analog of the Risk `pendingCombat` check.

### Out of Scope

- **Doubling-by-bot in backgammon.** Doubling is sequenced strictly before the roll (the bot decides "double or roll", and only if it picks "roll" does the dice mechanic fire). Orchestrator currently auto-rolls and skips the double decision; leave that alone.
- **Exact-value animated replay of recorded rolls.** The client-rolls model makes recorded replays unnecessary for the live game. Old replay paths can be deleted; existing CROSS-BUG-2 delivery findings about wire→scene conversion become moot.
- **Renaming `src/clients/risk/CombatReveal.tsx`.** Its replay mode (the "rounds" prop) was a workaround for the old bug and may still be used for spectator/history views. Audit usages before deleting that mode.

## Acceptance Criteria

### AC1: Risk applyAttack with no `resolved` payload stores pendingCombat instead of rolling server-side
- When `plugins/risk/server/actions.js:applyAttack` receives an attack without a `resolved` payload (a bot's intent), set `state.pendingCombat = { from, to, force, attackerIdx, defenderIdx }` and return success.
- Do NOT resolve the attack, do NOT advance the phase, do NOT call `rollDice`.

### AC2: Risk server never invokes rollDice on the bot-attack path; resolved-payload validator/applier still works
- The server's resolved-path validator/applier applies the result and clears `pendingCombat`.
- Existing human-vs-human attack flows unchanged.
- `plugins/risk/server/combat.js:rollDice` can be retained if used by tests; the action handler call site is removed.

### AC3: Risk defender client picks up pendingCombat where defenderIdx===me and posts {resolved:{rounds}} after physics settles
- Defender's client watches for `pendingCombat` surfaced over the wire.
- When `pendingCombat.defenderIdx === me`, render `<CombatReveal mode="live">` driving both `atkRef.roll(n)` and `defRef.roll(n)` locally.
- On the resolved Promise, POST `{type: 'attack', payload: {from, to, force, resolved: {rounds}}}` (or a new resolve-combat action).
- Orchestrator's turn-continuation gate naturally re-fires after `pendingCombat` is cleared (verify on first e2e test).

### AC4: Backgammon bot roll/roll-initial wake-up stores pendingRoll instead of generating RNG values
- Bot's pre-roll/initial-roll wake-up signals intent to roll (action with no values/throwParams, or a new pending-roll marker set server-side).
- Server stores `state.pendingRoll = { player: botIdx, kind: 'roll' | 'roll-initial' }` and pauses orchestrator continuation.
- Do NOT server-side RNG the values; sites at `src/server/ai/orchestrator.js:37,47` and `plugins/backgammon/server/ai/backgammon-player.js:54` are modified to not generate values.

### AC5: Backgammon client picks up pendingRoll for the human, rolls dice locally, posts settled values back as the roll action
- Human's client picks up `state.pendingRoll` and mounts a dice-tray.
- Physically rolls 2d6 (or 1d6 for initial-roll), reads the settled values.
- POSTs them back as the roll action with the values.
- Server applies values to `state.turn.dice`, clears `pendingRoll`, signals orchestrator wake-up.

### AC6: Backgammon orchestrator continuation paused while pendingRoll set; resumes after clear so bot picks moves using the human-rolled values
- Continuation gate: "the bot's wake-up is paused while `state.pendingRoll` exists; resume when cleared."
- This is the analog of the Risk `pendingCombat` check for the continuation gate.
- Verify that gate modification is needed on first e2e test.

### AC7: No server-side Math.random/rng for dice values on any bot-attack/bot-roll path (greppable assertion)
- All instances of server-side RNG generation for bot dice rolls are removed.
- Code review assertion: grep for Math.random, rng(), rollDice in bot-action paths must be empty.

### AC8: Existing human-vs-human Risk attack and Backgammon roll flows unchanged
- All human-initiated attacks and rolls continue to work as before.
- No changes to human action contracts or phase transitions.

## Key Locations

### Risk
- `plugins/risk/server/actions.js:applyAttack` — bot-intent storage site (add pendingCombat logic here)
- `plugins/risk/server/combat.js:rollDice` — server-side roller (remove from applyAttack call site)
- `src/clients/risk/CombatReveal.tsx` — client-side resolver (wire mode="live", audit replay mode usage)

### Backgammon
- `src/server/ai/orchestrator.js:37,47` — bot roll intent sites (remove RNG generation)
- `plugins/backgammon/server/ai/backgammon-player.js:54` — bot roll-initial intent site (remove RNG generation)
- `plugins/backgammon/client/dice.js` — human client roller (pick up pendingRoll, drive physics)

### Orchestrator
- `src/server/ai/orchestrator.js` — continuation gate (add pendingCombat/pendingRoll check if needed)

## Testing Notes (for TEA)

The TDD workflow means RED tests drive the server-side state storage and client-side pickup logic:

1. **Risk flow:** action with no resolved → pendingCombat stored; defender sees pendingCombat; posts resolved → pendingCombat cleared.
2. **Backgammon flow:** bot roll intent → pendingRoll stored; human rolls → posts values; pendingRoll cleared; bot resumes with those values.
3. **Orchestrator gate:** continuation paused while pending state exists; resumes when cleared.
4. **Greppable assertion:** no Math.random/rng/rollDice on any bot path after fix.

## Stack & Dependencies

- @local/dice-lib is at ~/Projects/dice-lib; already supports settling on physics yield and reporting via dice-settle.
- CROSS-BUG-2 (just landed) ported the dice renderer and removed stale-state pip row; this story removes the server RNG from the other side.

## Workflow

TDD (phased). TEA writes RED tests that exercise both the server's pendingCombat/pendingRoll storage and the client's pickup-and-resolve. Dev makes them green. Reviewer adversarial pass.
