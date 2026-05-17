import { CONTINENTS, continentBonus } from './map.js';
import { validateDeploy, validateAttack, validateFortify } from './validate.js';
import { resolveAttack } from './combat.js';
import { playerIndex, userIdOf } from './state.js';

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
  state.activeUserId = state.winner != null ? null : userIdOf(state, state.currentPlayer);
  return state;
}

function clone(state) {
  return JSON.parse(JSON.stringify(state));
}

export function applyRiskAction({ state, action, actorId, rng }) {
  const actorIdx = playerIndex(state, actorId);
  if (actorIdx === null) return { error: 'unknown participant' };
  if (state.phase === 'gameover') return { error: 'game is over' };
  if (actorIdx !== state.currentPlayer) return { error: 'not your turn' };

  const s = clone(state);
  let err;
  switch (`${s.phase}:${action.type}`) {
    case 'reinforce:deploy':
      err = applyDeploy(s, actorIdx, action.payload, 'reinforce');
      break;
    case 'setup:setup-deploy':
      err = applySetupDeploy(s, actorIdx, action.payload);
      break;
    case 'attack:attack':
      err = applyAttack(s, actorIdx, action.payload, rng);
      break;
    case 'attack:end-attack':
      s.phase = 'fortify';
      break;
    case 'fortify:fortify':
      err = applyFortify(s, actorIdx, action.payload);
      if (!err) endTurn(s);
      break;
    case 'fortify:end-turn':
      endTurn(s);
      break;
    default:
      return { error: `action '${action.type}' not allowed in phase '${s.phase}'` };
  }
  if (err) return { error: err };
  return { state: syncActiveUser(s) };
}

function applyDeploy(s, playerIdx, payload, mode) {
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

  const other = playerIdx === 0 ? 1 : 0;
  if (s.setupPools[other] > 0) {
    s.currentPlayer = other;
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

function applyAttack(s, playerIdx, payload, rng) {
  const { from, to, force } = payload ?? {};
  const verr = validateAttack(s, playerIdx, { from, to, force });
  if (verr) return verr;

  const src = s.territories[from];
  const tgt = s.territories[to];
  src.armies -= force; // the committed force marches out

  const outcome = resolveAttack({ force, defenders: tgt.armies }, rng ?? Math.random);

  if (outcome.captured) {
    tgt.owner = playerIdx;
    tgt.armies = outcome.attackerSurvivors;
  } else {
    tgt.armies = outcome.defenderSurvivors;
    src.armies += outcome.attackerSurvivors; // lone survivor retreats
  }

  s.lastCombat = {
    from, to, force,
    rounds: outcome.rounds,
    captured: outcome.captured,
    attackerSurvivors: outcome.attackerSurvivors,
    defenderSurvivors: outcome.defenderSurvivors,
  };
  s.log.push({ kind: 'attack', player: playerIdx, from, to, force, captured: outcome.captured });

  const opponent = playerIdx === 0 ? 1 : 0;
  if (ownedCount(s, opponent) === 0) {
    s.phase = 'gameover';
    s.winner = playerIdx;
  }
  return null;
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

function endTurn(s) {
  s.fortifyUsed = false;
  s.currentPlayer = s.currentPlayer === 0 ? 1 : 0;
  s.phase = 'reinforce';
  s.reinforcePool = reinforcementFor(s, s.currentPlayer);
  s.log.push({ kind: 'end-turn', next: s.currentPlayer });
}
