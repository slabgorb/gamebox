import { START_EXIT, SAFETY_ENTRY, TRACK_LEN } from '../geometry.js';

// One physical step along the absolute 60-square loop (dir = +1 forward, -1
// backward). Forward diverts into Safety at the side's safety mouth and ends at
// Home; Safety is a one-way lane (no backing out). Returns null for an illegal
// step: overshooting past Home, or moving backward out of Safety/Home.
function step(side, loc, dir) {
  if (dir > 0) {
    if (loc.zone === 'home') return null; // already Home — cannot advance
    if (loc.zone === 'safety') {
      return loc.index === 4 ? { zone: 'home', index: 0 } : { zone: 'safety', index: loc.index + 1 };
    }
    // track: if currently on the safety-entry square, a forward step enters the Safety lane.
    if (loc.index === SAFETY_ENTRY[side]) return { zone: 'safety', index: 0 };
    return { zone: 'track', index: (loc.index + 1) % TRACK_LEN };
  }
  // backward
  if (loc.zone !== 'track') return null; // Safety/Home are forward-only
  return { zone: 'track', index: (loc.index - 1 + TRACK_LEN) % TRACK_LEN };
}

// Advance `steps` (may be negative) along the loop from a pawn; return the
// destination loc, or null if any step is illegal. Only called for track/safety
// pawns (Start pawns move via the `out` move, never through here).
function advance(side, pawn, steps) {
  let loc = { zone: pawn.zone, index: pawn.index };
  const dir = steps >= 0 ? 1 : -1;
  for (let i = 0; i < Math.abs(steps); i++) {
    loc = step(side, loc, dir);
    if (loc === null) return null;
  }
  return loc;
}

function ownTrackOrSafety(pawns, side) {
  return pawns[side].filter((p) => p.zone === 'track' || p.zone === 'safety');
}

// Enumerate every legal move for the side to move, given the drawn card.
// Pure: never mutates state, applies moves, resolves slides, or draws cards.
export function legalMoves(state) {
  const side = state.currentPlayer;
  const opp = side === 'a' ? 'b' : 'a';
  const card = state.drawnCard;
  const mine = state.pawns[side];
  const moves = [];

  const pushForward = (pawn, steps, kind = 'forward') => {
    const to = advance(side, pawn, steps);
    if (to) moves.push({ id: `${kind}:${pawn.id}:${steps}`, kind, pawnId: pawn.id, steps, to });
  };

  // Out of Start (cards 1 and 2 only).
  if (card === 1 || card === 2) {
    for (const pawn of mine) {
      if (pawn.zone === 'start') {
        moves.push({
          id: `out:${pawn.id}`,
          kind: 'out',
          pawnId: pawn.id,
          to: { zone: 'track', index: START_EXIT[side] },
        });
      }
    }
  }

  // Plain forward cards.
  const numeric = { 1: 1, 2: 2, 3: 3, 5: 5, 8: 8, 12: 12 };
  if (card in numeric) {
    for (const pawn of mine) {
      if (pawn.zone === 'track' || pawn.zone === 'safety') pushForward(pawn, numeric[card]);
    }
  }

  // Card 4: back four.
  if (card === 4) {
    for (const pawn of ownTrackOrSafety(state.pawns, side)) pushForward(pawn, -4, 'back');
  }

  // Card 10: forward ten or back one.
  if (card === 10) {
    for (const pawn of ownTrackOrSafety(state.pawns, side)) {
      pushForward(pawn, 10, 'forward');
      pushForward(pawn, -1, 'back');
    }
  }

  // Card 7: full seven on one pawn, or a split across two distinct pawns.
  if (card === 7) {
    const movers = ownTrackOrSafety(state.pawns, side);
    for (const pawn of movers) pushForward(pawn, 7, 'forward');
    for (let s = 1; s <= 6; s++) {
      const other = 7 - s;
      for (const p1 of movers) {
        for (const p2 of movers) {
          if (p1.id === p2.id) continue;
          const to1 = advance(side, p1, s);
          const to2 = advance(side, p2, other);
          if (to1 && to2) {
            moves.push({
              id: `split:${p1.id}:${s}:${p2.id}:${other}`,
              kind: 'split',
              legs: [
                { pawnId: p1.id, steps: s, to: to1 },
                { pawnId: p2.id, steps: other, to: to2 },
              ],
            });
          }
        }
      }
    }
  }

  // Card 11: forward eleven, or swap an own track pawn with an opponent's.
  if (card === 11) {
    const myTrack = mine.filter((p) => p.zone === 'track');
    const oppTrack = state.pawns[opp].filter((p) => p.zone === 'track');
    for (const pawn of myTrack) {
      pushForward(pawn, 11, 'forward');
      for (const t of oppTrack) {
        moves.push({
          id: `swap:${pawn.id}:${t.id}`,
          kind: 'swap',
          pawnId: pawn.id,
          targetPawnId: t.id,
          to: { zone: 'track', index: t.index },
        });
      }
    }
  }

  // Sorry! card: a Start pawn bumps an opponent track pawn home.
  if (card === 'sorry') {
    const startPawns = mine.filter((p) => p.zone === 'start');
    const oppTrack = state.pawns[opp].filter((p) => p.zone === 'track');
    if (startPawns.length > 0) {
      for (const t of oppTrack) {
        moves.push({
          id: `sorry:${startPawns[0].id}:${t.id}`,
          kind: 'sorry',
          pawnId: startPawns[0].id,
          targetPawnId: t.id,
          to: { zone: 'track', index: t.index },
        });
      }
    }
  }

  return moves;
}
