import { path, START_EXIT } from '../geometry.js';

// Resolve a pawn's current position to its index within its side's path()
// list. Start pawns sit "before" the path (index -1).
function pathPos(side, pawn) {
  if (pawn.zone === 'start') return -1;
  const p = path(side);
  if (pawn.zone === 'track') return p.indexOf(pawn.index);
  if (pawn.zone === 'safety') return p.indexOf(`${side}-safe-${pawn.index}`);
  if (pawn.zone === 'home') return p.length - 1;
  return -1;
}

// Map a physical path square id back to a tagged location.
function squareToLoc(sq) {
  if (typeof sq === 'number') return { zone: 'track', index: sq };
  if (sq.endsWith('-home')) return { zone: 'home', index: 0 };
  const m = sq.match(/-safe-(\d)$/);
  if (m) return { zone: 'safety', index: Number(m[1]) };
  return null;
}

// Advance `steps` (may be negative) along the path from a pawn; return the
// destination loc, or null if it would overshoot Home or fall off the path
// start. Exactly landing on Home (last path index) is legal.
function advance(side, pawn, steps) {
  const p = path(side);
  const pos = pathPos(side, pawn);
  const target = pos + steps;
  if (target < 0) return null; // backward off the track / out of start
  if (target > p.length - 1) return null; // overshoot Home
  return squareToLoc(p[target]);
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
