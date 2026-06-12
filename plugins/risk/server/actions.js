import { CONTINENTS, continentBonus, areAdjacent } from './map.js';
import { validateDeploy, validateAttack, validateFortify, validateTradeIn } from './validate.js';
import { replayAttack } from './combat.js';
import { playerIndex, userIdOf, playerCount, isEliminated, liveSeats } from './state.js';
import { shuffle } from '../../../src/shared/cards/deck.js';

export function reinforcementFor(state, playerIdx) {
  const owned = Object.values(state.territories).filter(t => t.owner === playerIdx).length;
  let bonus = 0;
  for (const key of Object.keys(CONTINENTS)) {
    const all = CONTINENTS[key].territories;
    if (all.every(id => state.territories[id].owner === playerIdx)) bonus += continentBonus(key);
  }
  return Math.max(3, Math.floor(owned / 3)) + bonus;
}

function syncActiveUser(state) {
  if (state.winner != null) {
    state.activeUserId = null;
    return state;
  }
  // Bot's attack intent is paused for client-side resolution: the defender
  // (a human in mixed games) is the one who must POST the resolved payload.
  // Flipping activeUserId hands the route-level "not your turn" gate to them.
  if (state.pendingCombat) {
    state.activeUserId = userIdOf(state, state.pendingCombat.defenderIdx);
    return state;
  }
  state.activeUserId = userIdOf(state, state.currentPlayer);
  return state;
}

function clone(state) {
  return JSON.parse(JSON.stringify(state));
}

export function applyRiskAction({ state, action, actorId, rng }) {
  const actorIdx = playerIndex(state, actorId);
  if (actorIdx === null) return { error: 'unknown participant' };
  if (state.phase === 'gameover') return { error: 'game is over' };

  // Resign / leave: a forfeit by either participant, allowed on ANY turn
  // (the whole point of "leave" is bailing out of a game you can't act in
  // — e.g. while the bot is thinking or stalled). Handled before the
  // turn-ownership guard for that reason.
  if (action.type === 'resign') {
    // Multiplayer games can't end on a resign and seat elimination by
    // forfeit isn't supported (yet) — conquest is the only exit.
    if (playerCount(state) > 2) {
      return { error: 'resign is not supported in multiplayer games' };
    }
    const r = clone(state);
    r.winner = actorIdx === 0 ? 1 : 0;
    r.phase = 'gameover';
    return finishGame(r, 'resign');
  }
  if (isEliminated(state, actorIdx)) return { error: 'you have been eliminated' };

  // Defender-as-proxy: when a bot's attack is awaiting client-side
  // resolution (state.pendingCombat set), the defender is allowed to act —
  // they're driving the physics on the bot's behalf and POSTing the
  // resolved payload. Any other action falls back to the standard
  // currentPlayer gate.
  const isResolverPost = action.type === 'attack'
    && action.payload?.resolved
    && state.pendingCombat
    && state.pendingCombat.defenderIdx === actorIdx;
  if (!isResolverPost && actorIdx !== state.currentPlayer) {
    return { error: 'not your turn' };
  }

  const s = clone(state);
  let err;
  switch (`${s.phase}:${action.type}`) {
    case 'reinforce:deploy':
      err = applyDeploy(s, actorIdx, action.payload, 'reinforce');
      break;
    case 'reinforce:trade-in':
      err = applyTradeIn(s, actorIdx, action.payload);
      break;
    case 'setup:setup-deploy':
      err = applySetupDeploy(s, actorIdx, action.payload);
      break;
    case 'attack:attack':
      err = applyAttack(s, actorIdx, action.payload);
      break;
    case 'attack:end-attack':
      s.phase = 'fortify';
      break;
    case 'fortify:fortify':
      err = applyFortify(s, actorIdx, action.payload);
      if (!err) endTurn(s, rng);
      break;
    case 'fortify:end-turn':
      endTurn(s, rng);
      break;
    default:
      return { error: `action '${action.type}' not allowed in phase '${s.phase}'` };
  }
  if (err) return { error: err };
  // A capture that wiped out the opponent set phase='gameover' inside
  // applyAttack. Signal `ended` so routes.js calls endGame() and the host
  // registry flips status to 'ended' (stops the bot, frees the lobby).
  if (s.phase === 'gameover') return finishGame(s, 'conquest');
  return { state: syncActiveUser(s) };
}

// Finalize a game-over state: stamp the winning seat (plus the legacy 2P
// side alias) and the reason, and signal `ended` + a summary so the host
// records a turn row and marks the game ended.
function finishGame(s, reason) {
  s.winnerSeat = s.winner;
  s.winnerSide = s.winner === 0 ? 'a' : s.winner === 1 ? 'b' : null;
  s.endedReason = reason;
  return {
    state: syncActiveUser(s),
    ended: true,
    summary: { kind: reason === 'resign' ? 'resign' : 'game-over' },
  };
}

function handSize(s, playerIdx) {
  return s.hands?.[playerIdx]?.length ?? 0;
}

// Escalating trade-in bonus: trade #1 (n=0) -> 4, then 6,8,10,12,15, then +5
// each (20, 25, ...). n is the number of trades already made (tradeInCount).
const TRADE_BONUSES = [4, 6, 8, 10, 12, 15];
export function tradeBonus(n) {
  return n < TRADE_BONUSES.length ? TRADE_BONUSES[n] : 15 + 5 * (n - (TRADE_BONUSES.length - 1));
}

function applyTradeIn(s, playerIdx, payload) {
  const idxs = payload?.cardIndices;
  const verr = validateTradeIn(s, playerIdx, idxs);
  if (verr) return verr;
  const hand = s.hands[playerIdx];
  const remove = new Set(idxs);
  const cards = idxs.map(i => hand[i]);

  s.reinforcePool += tradeBonus(s.tradeInCount ?? 0);
  s.tradeInCount = (s.tradeInCount ?? 0) + 1;

  // Territory-match: +2 armies on one owned territory named by a traded card.
  for (const c of cards) {
    if (c.territory !== null && s.territories[c.territory]?.owner === playerIdx) {
      s.territories[c.territory].armies += 2;
      break;
    }
  }

  s.discard = s.discard ?? [];
  s.hands[playerIdx] = hand.filter((_, i) => !remove.has(i));
  for (const c of cards) s.discard.push(c);
  s.log.push({ kind: 'trade-in', player: playerIdx });
  return null;
}

// Draw the top card of the deck into a player's hand. If the deck has run dry,
// the discard pile is reshuffled (with the game rng) to form the new deck.
function drawCard(s, playerIdx, rng) {
  if (!Array.isArray(s.hands?.[playerIdx]) || !Array.isArray(s.deck)) return;
  if (s.deck.length === 0) {
    if (!s.discard || s.discard.length === 0) return;
    s.deck = shuffle(s.discard, rng ?? Math.random);
    s.discard = [];
  }
  s.hands[playerIdx].push(s.deck.pop());
}

function applyDeploy(s, playerIdx, payload, mode) {
  if (mode === 'reinforce' && handSize(s, playerIdx) >= 5) {
    return 'you must trade in a card set before deploying while holding 5 or more cards';
  }
  const placements = payload?.placements ?? {};
  const pool = mode === 'reinforce' ? s.reinforcePool : s.setupPools[playerIdx];
  const verr = validateDeploy(s, playerIdx, placements, pool);
  if (verr) return verr;
  for (const [id, n] of Object.entries(placements)) s.territories[id].armies += n;
  if (mode === 'reinforce') {
    s.reinforcePool = 0;
    s.phase = 'attack';
    s.log.push({ kind: 'deploy', player: playerIdx, placements });
  }
  return null;
}

function applySetupDeploy(s, playerIdx, payload) {
  const placements = payload?.placements ?? {};
  const verr = validateDeploy(s, playerIdx, placements, s.setupPools[playerIdx]);
  if (verr) return verr;
  for (const [id, n] of Object.entries(placements)) s.territories[id].armies += n;
  s.setupPools[playerIdx] = 0;
  s.log.push({ kind: 'setup-deploy', player: playerIdx, placements });

  // Pass to the next seat (in turn order) that still has setup armies.
  const n = playerCount(s);
  let next = null;
  for (let step = 1; step <= n; step++) {
    const cand = (playerIdx + step) % n;
    if (s.setupPools[cand] > 0) { next = cand; break; }
  }
  if (next !== null) {
    s.currentPlayer = next;
  } else {
    s.currentPlayer = 0;
    s.phase = 'reinforce';
    s.reinforcePool = reinforcementFor(s, 0);
  }
  return null;
}

function ownedCount(s, playerIdx) {
  return Object.values(s.territories).filter(t => t.owner === playerIdx).length;
}

function applyAttack(s, playerIdx, payload /* rng intentionally unused */) {
  const { from, to, force, resolved } = payload ?? {};

  // Client-resolved path: the client rolled the dice (their own or the
  // bot's, per CROSS-BUG-3) and posts the round sequence; we validate +
  // apply. The committed force is implicit — the maximum (armies-1) —
  // matching the round-by-round driver on the client.
  //
  // When pendingCombat is set the attacker authority comes from that record
  // (the bot is the attacker; the human is acting as physics proxy and the
  // POST's actorId is the human's). When pendingCombat is absent the
  // attacker is the acting player (Amendment A.1 human path).
  if (resolved) {
    const pc = s.pendingCombat;
    const attackerIdx = pc ? pc.attackerIdx : playerIdx;
    const src = s.territories[from];
    const tgt = s.territories[to];
    if (!src || !tgt) return 'unknown territory';
    if (pc && (pc.from !== from || pc.to !== to)) {
      return 'resolved combat must match the pending intent';
    }
    if (src.owner !== attackerIdx) return `source ${from} not owned`;
    if (tgt.owner === attackerIdx) return `target ${to} is not an enemy territory`;
    if (!areAdjacent(from, to)) return `${from} and ${to} are not adjacent`;
    if (!Number.isInteger(src.armies) || src.armies < 2) {
      return `force must be an integer in 2..${src.armies - 1}`;
    }
    const forceCommitted = src.armies - 1;
    const defenderIdx = tgt.owner;
    const eff = replayAttack({
      force: forceCommitted,
      defenders: tgt.armies,
      rounds: resolved.rounds,
    });
    if (eff.error) return eff.error;
    // Mirror the rolled path's bookkeeping exactly: the committed force
    // marches out of src; on capture survivors occupy tgt (src stays at
    // armies-force = 1), on repulse survivors retreat home (src ends at
    // 1 + attackerSurvivors).
    src.armies -= forceCommitted;
    if (eff.captured) {
      tgt.owner = attackerIdx;
      tgt.armies = eff.attackerSurvivors;
      s.capturedThisTurn = true;
    } else {
      tgt.armies = eff.defenderSurvivors;
      src.armies += eff.attackerSurvivors;
    }
    s.lastCombat = {
      from, to, force: forceCommitted,
      rounds: eff.rounds,
      captured: eff.captured,
      attackerSurvivors: eff.attackerSurvivors,
      defenderSurvivors: eff.defenderSurvivors,
    };
    s.log.push({ kind: 'attack', player: attackerIdx, from, to, force: forceCommitted, captured: eff.captured });
    if (pc) delete s.pendingCombat;
    if (eff.captured && ownedCount(s, defenderIdx) === 0) {
      eliminatePlayer(s, defenderIdx, attackerIdx);
    }
    const live = liveSeats(s);
    if (live.length === 1) {
      s.phase = 'gameover';
      s.winner = live[0];
    }
    return null;
  }

  // Bot-intent path (CROSS-BUG-3): no resolved payload means "attacker is
  // signalling an attack; client will roll." Validate legality, then store
  // pendingCombat so the defender's client can drive the physics. The
  // resolved POST that follows runs through the branch above and clears
  // pendingCombat after applying the outcome.
  const verr = validateAttack(s, playerIdx, { from, to, force });
  if (verr) return verr;
  const defenderIdx = s.territories[to].owner;
  s.pendingCombat = { from, to, force, attackerIdx: playerIdx, defenderIdx };
  return null;
}

// A seat whose last territory just fell is out: the conqueror takes their
// cards (canonical Risk). Hand-limit enforcement happens at the eliminator's
// next reinforce phase via the existing 5+ must-trade gate — a deliberate
// simplification of the canonical "trade immediately at 6+" rule (logged as
// a design deviation in the multiplayer spec).
function eliminatePlayer(s, victimIdx, byIdx) {
  s.eliminated = s.eliminated ?? Array(playerCount(s)).fill(false);
  if (s.eliminated[victimIdx]) return;
  s.eliminated[victimIdx] = true;
  s.eliminationOrder = s.eliminationOrder ?? [];
  s.eliminationOrder.push(victimIdx);
  const cards = s.hands?.[victimIdx] ?? [];
  if (cards.length > 0 && Array.isArray(s.hands?.[byIdx])) {
    s.hands[byIdx].push(...cards);
    s.hands[victimIdx] = [];
  }
  s.log.push({ kind: 'eliminated', player: victimIdx, by: byIdx, cardsTaken: cards.length });
}

function applyFortify(s, playerIdx, payload) {
  const { from, to, count } = payload ?? {};
  const verr = validateFortify(s, playerIdx, { from, to, count });
  if (verr) return verr;
  s.territories[from].armies -= count;
  s.territories[to].armies += count;
  s.fortifyUsed = true;
  s.log.push({ kind: 'fortify', player: playerIdx, from, to, count });
  return null;
}

function endTurn(s, rng) {
  // A capture anywhere this turn earns one card for the player whose turn ends.
  if (s.capturedThisTurn) drawCard(s, s.currentPlayer, rng);
  s.capturedThisTurn = false;
  s.fortifyUsed = false;
  // Rotate to the next live seat in turn order.
  const n = playerCount(s);
  let next = s.currentPlayer;
  for (let step = 1; step <= n; step++) {
    const cand = (s.currentPlayer + step) % n;
    if (!isEliminated(s, cand)) { next = cand; break; }
  }
  s.currentPlayer = next;
  s.phase = 'reinforce';
  s.reinforcePool = reinforcementFor(s, s.currentPlayer);
  s.log.push({ kind: 'end-turn', next: s.currentPlayer });
}
