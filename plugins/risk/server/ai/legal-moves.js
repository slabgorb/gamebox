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

// Find the indices of one tradeable set in a hand (3-of-a-kind, 3-distinct,
// or two cards plus a wild), or null if none exists. Proposes a set for the
// engine to validate — it does not re-implement validation.
function findTradeInSet(hand) {
  if (!Array.isArray(hand) || hand.length < 3) return null;
  const byType = { infantry: [], cavalry: [], artillery: [], wild: [] };
  hand.forEach((c, i) => { byType[c.type].push(i); });

  for (const t of ['infantry', 'cavalry', 'artillery']) {
    if (byType[t].length >= 3) return byType[t].slice(0, 3);
  }
  if (byType.infantry.length > 0 && byType.cavalry.length > 0 && byType.artillery.length > 0) {
    return [byType.infantry[0], byType.cavalry[0], byType.artillery[0]];
  }
  const nonWild = [...byType.infantry, ...byType.cavalry, ...byType.artillery];
  if (byType.wild.length >= 1 && nonWild.length >= 2) return [byType.wild[0], nonWild[0], nonWild[1]];
  if (byType.wild.length >= 2 && nonWild.length >= 1) return [byType.wild[0], byType.wild[1], nonWild[0]];
  return null;
}

export function enumerateLegalMoves(state, p) {
  switch (state.phase) {
    case 'setup':
      return deployCandidates(state, p, state.setupPools[p], 'setup-deploy');
    case 'reinforce': {
      const moves = [];
      const set = findTradeInSet(state.hands?.[p]);
      if (set) {
        moves.push({
          id: 'trade-in',
          action: { type: 'trade-in', payload: { cardIndices: set } },
          summary: `trade in card set ${set.join(',')}`,
        });
      }
      // Holding 5+ cards forces a trade before any deploy is legal.
      const mustTrade = (state.hands?.[p]?.length ?? 0) >= 5;
      if (!mustTrade) moves.push(...deployCandidates(state, p, state.reinforcePool, 'deploy'));
      return moves;
    }
    case 'attack': {
      const moves = [];
      for (const from of ownedIds(state, p)) {
        const armies = state.territories[from].armies;
        if (armies < 3) continue;
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
