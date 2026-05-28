---
parent: E3
---
# Story E3-5: AI adapter + prompts + two personas + adapter/persona registration

## Business Context

E3-5 makes Sorry! playable against AI opponents. Without it the game exists on the server but has no bot — it is unplayable vs AI and therefore unshippable as a solo experience. The story delivers the full AI stack in one slice: a `chooseAction` adapter that drives the bot's turn, the prompt builder that translates board state into LLM input, the JSON-response parser that extracts `{moveId, banter}`, and the two contrasting personas (`the-bully`, `the-tortoise`) that give the game personality.

The two personas are what differentiates Sorry! from "just another board game." The Bully plays to cause pain — bumps, slides, Sorry!-bombs — while The Tortoise plays steady and unbothered. Players pick an opponent with a clear personality; the persona drives the LLM's move selection *and* banter tone. Without both personas registered to `games: [sorry]` the AI subsystem won't surface them as opponents, and registering the plugin alone (E3-1) is not sufficient — a game-scoped persona is required before the orchestrator can run a bot turn.

E3-5 depends on E3-4 (the turn engine). E3-6 (client UI) depends on E3-5.

## Technical Guardrails

- **Mirror backgammon-player.js exactly.** `sorry-player.js` follows the same `chooseAction({ llm, persona, sessionId, state, botPlayerIdx, userMessages })` signature. `buildTurnPrompt`, `parseLlmResponse`, and `extractJson` in `prompts.js` are copied from `plugins/backgammon/server/ai/prompts.js`, not cross-plugin imported — each plugin owns its own copy.
- **Defensive in-adapter fallback is mandatory.** On any unparseable or invalid LLM output (bad JSON, `moveId` not in the legal set), `sorry-player.js` falls back to `moves[Math.floor(Math.random() * moves.length)]` before returning. The bot never throws; a solo game must never deadlock on a bad LLM response.
- **Bot emits only `move` actions.** Card draw is a server-authoritative rule step inside `buildInitialState` and `advanceTurn`; the bot never emits a `draw` action. `chooseAction` always returns `{ action: { type: 'move', payload: { moveId } }, banter, sessionId }`.
- **2P only.** `botPlayerIdx` is 0 (side `a`) or 1 (side `b`). No multi-player generalization.
- **Persona schema validation.** `src/server/ai/persona-catalog.js` (`loadPersonaCatalog(dir)`) validates every YAML on load; it enforces required fields `id`, `displayName`, `color`, `glyph`, `systemPrompt` (all non-empty strings), and optional `games` (array of non-empty strings) and `voiceExamples` (array of non-empty strings). The function returns a `Map` keyed by persona id — not an array. Persona filenames must match their `id` field exactly.
- **AI adapter registration follows the existing adapters map in `src/server/ai/index.js`.** The map entry shape is `{ plugin: sorryPlugin, chooseAction: sorryChoose }`. Read `bootAiSubsystem` in that file before editing; add the sorry entry alongside the backgammon, cribbage, words, and risk entries. The `llmByGameType` loop picks up new keys automatically.
- **Portraits auto-load by persona id.** No separate portrait wiring is needed; the host loads a portrait image matching the persona `id` by convention.

## Scope Boundaries

**In scope (E3-5):**
- `plugins/sorry/server/ai/prompts.js` — `buildTurnPrompt`, `parseLlmResponse`, `extractJson`.
- `plugins/sorry/server/ai/sorry-player.js` — `chooseAction` with legal-move enumeration, LLM call, response parse, and random-legal-move fallback.
- `data/ai-personas/the-bully.yaml` — aggressive persona, scoped to `games: [sorry]`.
- `data/ai-personas/the-tortoise.yaml` — patient persona, scoped to `games: [sorry]`.
- `src/server/ai/index.js` — add `sorry` entry to the `adapters` map inside `bootAiSubsystem`.
- Tests: `test/sorry/sorry-player.test.js` and `test/sorry/ai-registration.test.js`.

**Out of scope:**
- Client UI (E3-6).
- Additional personas beyond `the-bully` and `the-tortoise`.
- Any modification to the turn engine or legal-move enumeration (E3-4 and earlier stories).
- Per-game model routing — sorry will pick up whatever `modelForGameType('sorry')` resolves to; do not add special-case model logic in E3-5.
- The orchestrator integration test (`test/sorry/orchestrator-turn.test.js`) is scoped to E3-6.

## AC Context

1. **`buildTurnPrompt` surfaces all context the LLM needs.** Given `{ state, legalMoves, botPlayerIdx, userMessages }`, it emits: the bot's side, its own pawn positions (zone + index), the opponent's pawn positions, the drawn card, an optional opponent-banter reaction block (when `userMessages` is non-empty), the full legal-move list with human-readable descriptions keyed by move id, and the strict JSON response instruction `{"moveId": "<id>", "banter": "<non-empty line>"}`. The prompt is text-only; no special tokens or markdown fences in the instruction block.

2. **`parseLlmResponse` and `extractJson` are copied helpers, not cross-plugin imports.** `extractJson` strips a fenced code block or slices `{...}` from the raw text. `parseLlmResponse` calls `JSON.parse(extractJson(text))` and throws if `moveId` is not a string. These helpers live in `plugins/sorry/server/ai/prompts.js` and are not re-exported to other plugins.

3. **`chooseAction` validates the parsed moveId against the live legal-move set.** After calling `parseLlmResponse`, it calls `legalMoves(state)` and does `moves.find(m => m.id === parsed.moveId)`. If the find returns `undefined` (id not in legal set), it falls through to the random fallback. If `parseLlmResponse` throws (bad JSON), the catch block also falls through to the random fallback. The returned `sessionId` is taken from `r.sessionId` (the LLM response), not the input, so conversation threading is preserved.

4. **Random fallback guarantees forward progress.** When the fallback fires, `chosen` is selected as `moves[Math.floor(Math.random() * moves.length)]` where `moves = legalMoves(state)`. Because `chooseAction` only runs when `activeUserId === botId` (the orchestrator gate), and `legalMoves` was non-empty before the bot was woken, the fallback always picks a valid move. The returned `banter` is the empty string `''` when the fallback fires.

5. **`the-bully.yaml` persona.** Required YAML fields: `id: the-bully`, `displayName: The Bully`, `games: [sorry]`, `color`, `glyph`, `systemPrompt`. The system prompt establishes the aggressive archetype (loves bumps, Sorry! card, slides that knock opponents back; aggression over position) and gives strict JSON-format instructions (`{"moveId": "...", "banter": "..."}`). `voiceExamples` contains at least two short needling lines. Filename must be `the-bully.yaml`.

6. **`the-tortoise.yaml` persona.** Required YAML fields: `id: the-tortoise`, `displayName: The Tortoise`, `games: [sorry]`, `color`, `glyph`, `systemPrompt`. The system prompt establishes the patient archetype (avoids exposure, hugs safety zones, steady forward progress over flashy bumps, unbothered by setbacks) and gives the same strict JSON-format instructions. `voiceExamples` contains at least two calm, slow-and-steady lines. Filename must be `the-tortoise.yaml`.

7. **Adapter registration wires `chooseAction` into the `adapters` map.** In `src/server/ai/index.js`, add: import `sorryPlugin` from `plugins/sorry/plugin.js`; import `chooseAction as sorryChoose` from `plugins/sorry/server/ai/sorry-player.js`; add `sorry: { plugin: sorryPlugin, chooseAction: sorryChoose }` to the `adapters` object inside `bootAiSubsystem`. The `llmByGameType` loop in that function iterates `Object.keys(adapters)` and creates a client entry for `'sorry'` automatically — no additional wiring needed.

8. **`test/sorry/sorry-player.test.js` covers LLM-chosen move and fallback.** Test 1: stub `llm.send` returns valid JSON with a legal `moveId`; assert `r.action` equals `{ type: 'move', payload: { moveId: 'out:0' } }` and `r.banter` matches. Test 2: stub returns unparseable text; assert `r.action.type === 'move'` and `r.action.payload.moveId` matches a legal move id pattern (e.g. `/^out:/`).

9. **`test/sorry/ai-registration.test.js` verifies both personas load and are scoped to sorry.** The test imports `loadPersonaCatalog` from `src/server/ai/persona-catalog.js` and calls it with the personas directory path. Because `loadPersonaCatalog` returns a `Map`, the test must call `[...catalog.values()].filter(p => p.games.includes('sorry'))` (not `.filter` directly on the Map). Assert `sorryPersonas.length >= 2` and that `the-bully` and `the-tortoise` ids are present. Note: the plan's test snippet calls `loadPersonaCatalog()` without an argument and calls `.filter` on the result — both will fail since the real function requires a `dir` argument and returns a `Map`; the implementer must adjust the test to pass the personas directory and iterate the Map values.
