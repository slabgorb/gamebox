// Reachable-squares enumeration for the Clue move phase. Pure; geometry is
// injected so the algorithm is tested against a synthetic board. Movement is a
// self-avoiding orthogonal walk: corridor destinations require EXACTLY `die`
// steps; a room is enterable via a doorway in <= `die` steps (excess ignored),
// and entry ends the move. Occupied corridor squares block passage; the
// turn-start room cannot be re-entered.
const key = ([c, r]) => `${c},${r}`;
const ortho = ([c, r]) => [[c, r - 1], [c, r + 1], [c + 1, r], [c - 1, r]];

export function occupiedSquares(state, exceptSuspect) {
  const occ = new Set();
  for (const [suspect, loc] of Object.entries(state.pawns)) {
    if (suspect === exceptSuspect) continue;
    if (loc && Array.isArray(loc.square)) occ.add(key(loc.square));
  }
  return occ;
}

export function secretPassageDest(geo, roomId) {
  // Own-property lookup: obj['__proto__'] would return Object.prototype.
  return Object.hasOwn(geo.secretPassages, roomId) ? geo.secretPassages[roomId] : null;
}

export function legalMoves(state, geo, seat) {
  // Clamp at the walk boundary: doRoll validates 1-6 on the reducer path,
  // but the bot shortlist calls legalMoves directly, and an unclamped
  // pendingRoll (e.g. 100) explodes the self-avoiding walk (E6-3 finding).
  const raw = state.pendingRoll;
  if (!raw || raw < 1) return { squares: [], rooms: [] };
  const die = Math.min(6, Math.max(1, Math.floor(raw)));

  const suspect = state.seatSuspect[seat];
  const loc = state.pawns[suspect];
  const startRoom = loc && loc.room ? loc.room : null;
  const occ = occupiedSquares(state, suspect);

  const squares = new Set(); // "c,r" reachable at EXACTLY `die`
  const rooms = new Set();   // rooms enterable at <= `die`

  // From a corridor square `sq` already reached in `steps`, try entering an
  // adjacent room (via a door at this square) and continue the walk.
  function walk(sq, steps, visited) {
    for (const rm of geo.doorsBySquare.get(key(sq)) ?? []) {
      if (rm !== startRoom && steps + 1 <= die) rooms.add(rm);
    }
    if (steps === die) { squares.add(key(sq)); return; }
    for (const nb of ortho(sq)) {
      const k = key(nb);
      if (!geo.isCorridor(nb) || occ.has(k) || visited.has(k)) continue;
      visited.add(k);
      walk(nb, steps + 1, visited);
      visited.delete(k);
    }
  }

  if (startRoom) {
    // Exit through each door: stepping onto the (unoccupied) threshold is step 1.
    for (const dsq of geo.doorsByRoom.get(startRoom) ?? []) {
      if (occ.has(key(dsq)) || !geo.isCorridor(dsq)) continue; // blocked doorway
      walk(dsq, 1, new Set([key(dsq)]));
    }
  } else if (loc && Array.isArray(loc.square)) {
    walk(loc.square, 0, new Set([key(loc.square)]));
  }

  return {
    squares: [...squares].map((s) => s.split(',').map(Number)),
    rooms: [...rooms],
  };
}
