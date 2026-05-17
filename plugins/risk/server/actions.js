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
