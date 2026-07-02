// E6-5 Task 7 — end-to-end wiring: a registered 3-seat mixed human/bot clue
// game is creatable and playable through the REAL registry, routes, and
// orchestrator (AC1), and the human-refute pause round-trips (AC2).
//
// Everything drives registered/plumbed surfaces: plugins.clue from
// src/plugins/index.js, POST /api/games/:id/action, orchestrator.runTurn.
// No direct engine-module imports.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import express from 'express';
import { openDb } from '../src/server/db.js';
import { mountRoutes } from '../src/server/routes.js';
import { buildRegistry } from '../src/server/plugins.js';
import { plugins } from '../src/plugins/index.js';
import { createAiSession } from '../src/server/ai/agent-session.js';
import { buildTracker } from '../plugins/clue/server/ai/knowledge.js';
import { buildClueShortlist } from '../plugins/clue/server/ai/shortlist.js';
import { isMyRefute, refuteChoices } from '../src/clients/clue/refute-prompt.js';
import { det, determinedDeal, SOLUTION } from './_helpers/clue-fixtures.js';
import { insertGame } from './_helpers/games.js';
import { bootClueGame, gameState, rawState } from './_helpers/clue-orchestrator-harness.js';

const parts = (n) => Array.from({ length: n }, (_, i) => ({ userId: 100 + i, seat: i }));

// A real-board state with the fixture's fully-determined deal: envelope
// {scarlett, rope, study}; seat 1 holds green+hall, so a {green, knife, hall}
// suggestion from seat 0 pauses on seat 1.
function determinedState(over = {}) {
  const state = plugins.clue.initialState({ participants: parts(3), rng: det(7) });
  const { envelope, hands } = determinedDeal();
  return {
    ...state,
    envelope,
    hands: structuredClone(hands),
    ledgers: [[], [], []],
    ...over,
  };
}

test('AC1: clue is creatable from the registry at 3 and 4 seats, never leaking secrets', () => {
  const registry = buildRegistry(plugins);
  assert.ok(registry.clue, 'clue missing from the built registry');

  for (const n of [3, 4]) {
    const state = registry.clue.initialState({ participants: parts(n), rng: det(3) });
    assert.equal(state.seats.length, n);
    for (const viewerId of state.seats) {
      const v = registry.clue.publicView({ state, viewerId });
      assert.equal('envelope' in v, false);
      assert.equal('hands' in v, false);
      assert.equal('ledgers' in v, false);
    }
  }
});

test('AC1: roll pause -> client-resolved die -> move, through the registered surface', () => {
  const state = determinedState();

  const rolled = plugins.clue.applyAction({
    state, action: { type: 'roll', payload: { value: 5 } }, actorId: 100,
  });
  assert.equal(rolled.error, undefined);
  assert.equal(rolled.state.pendingRoll, 5);
  assert.equal(rolled.state.activeUserId, 100, 'resolving the die does not hand the turn away');
  assert.equal(rolled.state.phase, 'move');

  const v = plugins.clue.publicView({ state: rolled.state, viewerId: 100 });
  assert.equal(v.movement.needsRoll, false);
  assert.ok(v.movement.squares.length > 0);

  const sq = v.movement.squares[0];
  const moved = plugins.clue.applyAction({
    state: rolled.state, action: { type: 'move', payload: { square: sq } }, actorId: 100,
  });
  assert.equal(moved.error, undefined);
  assert.equal(moved.state.phase, 'accuse-or-pass');
  assert.equal(moved.state.pendingRoll, null);
});

test('AC2: suggest -> human-refute pause -> card shown -> suggester resumes', () => {
  const state = determinedState({ phase: 'suggest' });
  state.pawns[state.seatSuspect[0]] = { room: 'hall' };

  const suggested = plugins.clue.applyAction({
    state,
    action: { type: 'suggest', payload: { suspect: 'green', weapon: 'knife', room: 'hall' } },
    actorId: 100,
  });
  assert.equal(suggested.error, undefined);
  assert.equal(suggested.state.phase, 'refute');
  assert.equal(suggested.state.suggestion.refuterSeat, 1);
  assert.equal(suggested.state.activeUserId, 101, 'pause lands on the refuter');

  // The pause surfaces exactly one card-choice prompt: the refuter's.
  const v0 = plugins.clue.publicView({ state: suggested.state, viewerId: 100 });
  const v1 = plugins.clue.publicView({ state: suggested.state, viewerId: 101 });
  const v2 = plugins.clue.publicView({ state: suggested.state, viewerId: 102 });
  assert.equal(isMyRefute(v1, 101), true, 'refuter sees the prompt');
  assert.equal(isMyRefute(v0, 100), false, 'suggester does not');
  assert.equal(isMyRefute(v2, 102), false, 'third seat does not');
  assert.deepEqual(refuteChoices(v1), ['green', 'hall'],
    'choices are the held-and-named cards (seat 1 holds green + hall, not knife)');

  const refuted = plugins.clue.applyAction({
    state: suggested.state, action: { type: 'refute', payload: { card: 'green' } }, actorId: 101,
  });
  assert.equal(refuted.error, undefined);
  assert.equal(refuted.state.phase, 'accuse-or-pass');
  assert.equal(refuted.state.activeUserId, 100, 'suggester resumes after the shown card');

  // Shown-card disclosure: suggester sees it, bystander does not.
  const r0 = plugins.clue.publicView({ state: refuted.state, viewerId: 100 });
  const r2 = plugins.clue.publicView({ state: refuted.state, viewerId: 102 });
  assert.equal(r0.suggestion.shownCard, 'green');
  assert.equal(r2.suggestion.shownCard, null);
  assert.deepEqual(r0.ledger.at(-1), { fromSeat: 1, card: 'green' });
});

test('AC1: a correct accusation ends the game; a wrong one eliminates the accuser', () => {
  const won = plugins.clue.applyAction({
    state: determinedState({ phase: 'accuse-or-pass' }),
    action: { type: 'accuse', payload: SOLUTION },
    actorId: 100,
  });
  assert.equal(won.error, undefined);
  assert.equal(won.ended, true);
  assert.equal(won.state.phase, 'ended');
  assert.equal(won.state.winnerSeat, 0);
  assert.equal(won.state.endedReason, 'accusation');
  assert.equal(won.state.activeUserId, null);

  const lost = plugins.clue.applyAction({
    state: determinedState({ phase: 'accuse-or-pass' }),
    action: { type: 'accuse', payload: { suspect: 'plum', weapon: 'wrench', room: 'kitchen' } },
    actorId: 100,
  });
  assert.equal(lost.error, undefined);
  assert.equal(lost.state.eliminated[0], true, 'wrong accuser is eliminated');
  assert.equal(lost.state.phase, 'move');
  assert.equal(lost.state.currentSeat, 1, 'play continues with the next seat');
  assert.equal(lost.state.activeUserId, lost.state.seats[1]);
});

test('AC1: the orchestrator drives a bot turn across the client-dice pause (F8b integration)', async () => {
  // Top of the bot's turn: runTurn must broadcast clue_roll_request and wait.
  const { db, gameId, botId, humanB, broadcasts, llm, orchestrator } = bootClueGame({
    llmResponses: [{ text: JSON.stringify({ moveId: 'roll', banter: 'Here we go.' }), sessionId: 's1' }],
    mutateState: (s, { botId: bot }) => {
      s.currentSeat = 1;
      s.activeUserId = bot;
    },
  });

  await orchestrator.runTurn(gameId);
  assert.ok(broadcasts.some((b) => b.type === 'clue_roll_request'), 'bot roll intent becomes a client-dice request');
  assert.equal(gameState(db, gameId).pendingRoll, null, 'no server-side die value');

  // A human client resolves the die on the bot's behalf: the engine receives
  // roll{value} for the bot's seat, exactly what the route-level proxy POSTs.
  const resolved = plugins.clue.applyAction({
    state: gameState(db, gameId), action: { type: 'roll', payload: { value: 3 } }, actorId: botId,
  });
  assert.equal(resolved.error, undefined);
  db.prepare('UPDATE games SET state = ?, updated_at = ? WHERE id = ?')
    .run(JSON.stringify(resolved.state), Date.now(), gameId);

  // The next wake-up must DRIVE the move off the numeric pendingRoll (F8b),
  // then finish the turn (forced pass) in the same wake-up.
  const s = gameState(db, gameId);
  const shortlist = buildClueShortlist({ state: s, seat: 1, tracker: buildTracker({ state: s, seat: 1 }) });
  const move = shortlist.find((e) => e.slot === 'corridor');
  assert.ok(move, 'die 3 offers corridor moves from the mustard start');
  llm.pushResponse({ text: JSON.stringify({ moveId: move.id, banter: 'Onward.' }), sessionId: 's2' });
  llm.pushResponse({ text: '{}', sessionId: 's3' });

  await orchestrator.runTurn(gameId);

  const final = gameState(db, gameId);
  assert.deepEqual(final.pawns[final.seatSuspect[1]], { square: move.action.payload.square });
  assert.equal(final.pendingRoll, null);
  assert.equal(final.activeUserId, humanB, 'bot turn completed and handed on');
});

// ---------------------------------------------------------------------------
// Route-level proxy contract (the browser flow AC1 depends on).
//
// routes.js rejects any action when activeUserId !== req.user.id — but during
// a clue bot's dice pause, activeUserId stays on the BOT while a HUMAN client
// must POST the resolved roll on its behalf (the backgammon "human resolves
// the bot's roll" pattern; dice stay client-side). These tests pin the
// OUTCOME, not the mechanism: a human participant can resolve a bot's die,
// yet still cannot roll for another human.
// ---------------------------------------------------------------------------

function setupRouteApp({ seat1IsBot }) {
  const app = express();
  app.use(express.json());
  const db = openDb(':memory:');
  const now = Date.now();

  db.prepare("INSERT INTO users (id, email, friendly_name, color, created_at) VALUES (1, 'h1@x', 'H1', '#f00', ?)").run(now);
  if (seat1IsBot) {
    db.prepare(`INSERT INTO users (id, email, friendly_name, color, glyph, is_bot, persona_id, created_at)
                VALUES (2, 'ai+miss-scarlett@bot.local', 'Miss Scarlett', '#c0392b', '♛', 1, 'miss-scarlett', ?)`).run(now);
  } else {
    db.prepare("INSERT INTO users (id, email, friendly_name, color, created_at) VALUES (2, 'h2@x', 'H2', '#0f0', ?)").run(now);
  }
  db.prepare("INSERT INTO users (id, email, friendly_name, color, created_at) VALUES (3, 'h3@x', 'H3', '#00f', ?)").run(now);

  // Seat 1 (user 2) is on turn at the top of its turn: dice pause territory.
  const state = plugins.clue.initialState({
    participants: [{ userId: 1, seat: 0 }, { userId: 2, seat: 1 }, { userId: 3, seat: 2 }],
    rng: det(11),
  });
  state.currentSeat = 1;
  state.activeUserId = 2;

  insertGame(db, { id: 1, players: [1, 2, 3], gameType: 'clue', state });
  if (seat1IsBot) createAiSession(db, { gameId: 1, botUserId: 2, personaId: 'miss-scarlett' });

  app.use((req, res, next) => {
    const id = Number(req.header('x-test-user-id'));
    if (!id) return res.status(401).end();
    req.user = { id, email: `${id}@x`, friendlyName: `U${id}` };
    req.authEmail = req.user.email;
    next();
  });
  mountRoutes(app, { db, registry: buildRegistry(plugins), sse: { broadcast() {} } });
  return { app, db };
}

async function startServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    server.listen(0, () => resolve(server));
  });
}

async function call(server, body, userId) {
  const port = server.address().port;
  const res = await fetch(`http://localhost:${port}/api/games/1/action`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-test-user-id': String(userId) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

test('route: a human participant resolves a BOT\'s die via POST roll{value}', async () => {
  const { app, db } = setupRouteApp({ seat1IsBot: true });
  const server = await startServer(app);
  try {
    const r = await call(server, { type: 'roll', payload: { value: 4 } }, 1);
    assert.equal(r.status, 200, `proxy roll for the bot must be accepted, got ${r.status}: ${JSON.stringify(r.body)}`);
    const s = JSON.parse(db.prepare('SELECT state FROM games WHERE id = 1').get().state);
    assert.equal(s.pendingRoll, 4, 'the client-rolled value landed as the bot\'s die');
    assert.equal(s.activeUserId, 2, 'the bot remains the active player to drive its move');
  } finally { server.close(); }
});

test('route: the proxy seam still validates the die value', async () => {
  const { app, db } = setupRouteApp({ seat1IsBot: true });
  const server = await startServer(app);
  try {
    const r = await call(server, { type: 'roll', payload: { value: 9 } }, 1);
    assert.equal(r.status, 422, 'an out-of-range die must be rejected even for the bot');
    const s = JSON.parse(db.prepare('SELECT state FROM games WHERE id = 1').get().state);
    assert.equal(s.pendingRoll, null, 'rejected roll leaves no die behind');
  } finally { server.close(); }
});

test('route: a human can NOT roll for another HUMAN (no cheat regression)', async () => {
  const { app, db } = setupRouteApp({ seat1IsBot: false });
  const server = await startServer(app);
  try {
    const r = await call(server, { type: 'roll', payload: { value: 4 } }, 1);
    assert.equal(r.status, 422, 'rolling on a human\'s behalf must stay rejected');
    const s = JSON.parse(db.prepare('SELECT state FROM games WHERE id = 1').get().state);
    assert.equal(s.pendingRoll, null, 'state unchanged after the rejected roll');
  } finally { server.close(); }
});
