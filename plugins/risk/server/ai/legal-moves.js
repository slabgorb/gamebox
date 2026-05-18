import { neighborsOf } from '../map.js';

function ownedIds(state, p) {
  return Object.keys(state.territories).filter(id => state.territories[id].owner === p);
}

function frontierIds(state, p) {
  // Owned territories adjacent to at least one enemy.
  return ownedIds(state, p).filter(id =>
    neighborsOf(id).some(n => state.territories[n].owner !== p));
}

function deployCandidates(state, p, pool, type) {
  const owned = ownedIds(state, p);
  if (owned.length === 0) return [];
  const front = frontierIds(state, p);
  const candidates = [];

  // (1) Dump the whole pool on the strongest frontier territory.
  const target = (front.length ? front : owned)
    .slice()
    .sort((a, b) => state.territories[b].armies - state.territories[a].armies)[0];
  candidates.push({ [target]: pool });

  // (2) Reinforce the weakest frontier territory.
  const weak = (front.length ? front : owned)
    .slice()
    .sort((a, b) => state.territories[a].armies - state.territories[b].armies)[0];
  if (weak !== target) candidates.push({ [weak]: pool });

  // (3) Spread evenly across frontier territories (remainder on the first).
  const spreadOver = front.length ? front : owned;
  const each = Math.floor(pool / spreadOver.length);
  if (each > 0) {
    const spread = {};
    let left = pool;
    for (const id of spreadOver) { spread[id] = each; left -= each; }
    spread[spreadOver[0]] += left;
    candidates.push(spread);
  }

  return candidates.map((placements, i) => ({
    id: `${type}:${i}`,
    action: { type, payload: { placements } },
    summary: `${type} ${JSON.stringify(placements)}`,
  }));
}

export function enumerateLegalMoves(state, p) {
  switch (state.phase) {
    case 'setup':
      return deployCandidates(state, p, state.setupPools[p], 'setup-deploy');
    case 'reinforce':
      return deployCandidates(state, p, state.reinforcePool, 'deploy');
    case 'attack': {
      const moves = [];
      for (const from of ownedIds(state, p)) {
        const armies = state.territories[from].armies;
        if (armies < 2) continue;
        for (const to of neighborsOf(from)) {
          if (state.territories[to].owner === p) continue;
          moves.push({
            id: `attack:${from}->${to}`,
            action: { type: 'attack', payload: { from, to, force: armies - 1 } },
            summary: `attack ${from}->${to} with ${armies - 1}`,
          });
        }
      }
      moves.push({ id: 'end-attack', action: { type: 'end-attack' }, summary: 'stop attacking' });
      return moves;
    }
    case 'fortify': {
      const moves = [{ id: 'end-turn', action: { type: 'end-turn' }, summary: 'end turn' }];
      for (const from of ownedIds(state, p)) {
        const armies = state.territories[from].armies;
        if (armies < 2) continue;
        for (const to of neighborsOf(from)) {
          if (state.territories[to].owner !== p) continue;
          moves.push({
            id: `fortify:${from}->${to}`,
            action: { type: 'fortify', payload: { from, to, count: armies - 1 } },
            summary: `fortify ${armies - 1} ${from}->${to}`,
          });
        }
      }
      return moves;
    }
    default:
      return [];
  }
}
