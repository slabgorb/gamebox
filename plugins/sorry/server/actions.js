import { legalMoves } from './rules/legal-moves.js';
import { resolveLanding } from './rules/slides.js';
import { draw } from './deck.js';

const opponent = (side) => (side === 'a' ? 'b' : 'a');

function actorSide(state, actorId) {
  if (state.sides.a === actorId) return 'a';
  if (state.sides.b === actorId) return 'b';
  return null;
}

const clonePawns = (pawns) => ({
  a: pawns.a.map((p) => ({ ...p })),
  b: pawns.b.map((p) => ({ ...p })),
});

// Place `moverId` of `side` onto track square `landingIndex`, resolving any
// foreign slide and bumping every swept track pawn back to Start. The mover is
// resolved from its origin (it is NOT yet sitting at the landing square) and is
// never self-bumped — it always ends at `finalIndex`. Returns a new pawn map.
function resolveAndPlace(pawns, side, moverId, landingIndex) {
  const { finalIndex, bumped } = resolveLanding({ pawns, side, landingIndex });
  const next = clonePawns(pawns);
  for (const b of bumped) {
    if (b.side === side && b.pawnId === moverId) continue; // mover never self-bumps
    next[b.side][b.pawnId] = { id: b.pawnId, zone: 'start', index: 0 };
  }
  next[side][moverId] = { id: moverId, zone: 'track', index: finalIndex };
  return next;
}

// Place a pawn at a non-track destination (safety or home): no slide, no bump.
function placeOffTrack(pawns, side, pawnId, to) {
  const next = clonePawns(pawns);
  next[side][pawnId] = { id: pawnId, zone: to.zone, index: to.index };
  return next;
}

// Apply a single leg (a pawn moving to a destination loc). Track landings run
// slide/bump resolution; safety/home landings are plain placements.
function applyLeg(pawns, side, pawnId, to) {
  return to.zone === 'track'
    ? resolveAndPlace(pawns, side, pawnId, to.index)
    : placeOffTrack(pawns, side, pawnId, to);
}

// Produce the post-move pawn map for the chosen legal move. Returns null for an
// unrecognized kind (defensive — legalMoves only ever emits the kinds below).
function applyChosenMove(state, side, m) {
  const opp = opponent(side);
  switch (m.kind) {
    case 'out': {
      // Placement onto the start-exit square. Per the E3-4 spec conflict
      // resolution (see session Design Deviations), `out` does NOT run slide
      // resolution — the start-exit square is itself a foreign slide start, and
      // AC-3 fixes the pawn at START_EXIT[side]. It still bumps an occupant
      // sitting on that square.
      const idx = m.to.index;
      const next = clonePawns(state.pawns);
      for (const color of ['a', 'b']) {
        for (const p of next[color]) {
          if (p.zone === 'track' && p.index === idx && !(color === side && p.id === m.pawnId)) {
            next[color][p.id] = { id: p.id, zone: 'start', index: 0 };
          }
        }
      }
      next[side][m.pawnId] = { id: m.pawnId, zone: 'track', index: idx };
      return next;
    }
    case 'forward':
    case 'back':
      return applyLeg(state.pawns, side, m.pawnId, m.to);
    case 'split': {
      let next = state.pawns;
      for (const leg of m.legs) next = applyLeg(next, side, leg.pawnId, leg.to);
      return next;
    }
    case 'swap': {
      // The opponent's pawn takes the mover's old square; the mover then lands
      // on the opponent's old square (m.to.index), resolving any slide there.
      const myOrigin = state.pawns[side][m.pawnId].index;
      const tmp = clonePawns(state.pawns);
      tmp[opp][m.targetPawnId] = { id: m.targetPawnId, zone: 'track', index: myOrigin };
      return resolveAndPlace(tmp, side, m.pawnId, m.to.index);
    }
    case 'sorry': {
      // Evict the target opponent pawn to Start, then land the acting pawn on
      // the target's former square (slide/bump resolution applies there).
      const tmp = clonePawns(state.pawns);
      tmp[opp][m.targetPawnId] = { id: m.targetPawnId, zone: 'start', index: 0 };
      return resolveAndPlace(tmp, side, m.pawnId, m.to.index);
    }
    default:
      return null;
  }
}

const allHome = (sidePawns) => sidePawns.every((p) => p.zone === 'home');

// Discard the played card, draw the next, switch player unless a 2 was played,
// and auto-pass any drawn card the new player cannot use (discard it and switch
// again), up to a small guard limit before committing whatever state exists.
function advanceTurn(state, pawnsAfter, playedCard) {
  let deck = state.deck;
  let discard = [...state.discard, playedCard];
  let currentPlayer = playedCard === 2 ? state.currentPlayer : opponent(state.currentPlayer);

  let drawn = draw({ deck, discard, rng: state.rng });
  deck = drawn.deck;
  discard = drawn.discard;
  let card = drawn.card;

  for (let guard = 0; guard < 8; guard++) {
    const probe = { ...state, pawns: pawnsAfter, currentPlayer, drawnCard: card };
    if (legalMoves(probe).length > 0) break;
    discard = [...discard, card];
    currentPlayer = opponent(currentPlayer);
    drawn = draw({ deck, discard, rng: state.rng });
    deck = drawn.deck;
    discard = drawn.discard;
    card = drawn.card;
  }

  return { ...state, pawns: pawnsAfter, deck, discard, drawnCard: card, currentPlayer, winner: null };
}

// The host turn engine. Validates the actor, turn ownership, and move legality,
// applies the move (with slide/bump/swap/Sorry! resolution), detects a win, and
// otherwise advances the turn. Mirrors the backgammon plugin's return contract:
// `{ state, ended, scoreDelta?, summary }` on success, `{ error }` on rejection
// (no mutation). `state.activeUserId` always mirrors the current player so the
// orchestrator's bot-wake gate stays consistent.
export function applySorryAction({ state, action, actorId }) {
  const side = actorSide(state, actorId);
  if (side === null) return { error: 'unknown participant' };
  if (!action || action.type !== 'move') return { error: `unknown action: ${action?.type}` };
  if (side !== state.currentPlayer) return { error: 'not your turn' };

  const moveId = action.payload?.moveId;
  const m = legalMoves(state).find((x) => x.id === moveId);
  if (!m) return { error: 'move is not legal' };

  const pawnsAfter = applyChosenMove(state, side, m);
  if (!pawnsAfter) return { error: 'move is not legal' };

  // Win: all four of the acting side's pawns are home. Skip turn advancement
  // and keep activeUserId on the winner so the host can attribute the result.
  if (allHome(pawnsAfter[side])) {
    const winnerUserId = state.sides[side];
    const winState = {
      ...state,
      pawns: pawnsAfter,
      discard: [...state.discard, state.drawnCard],
      drawnCard: null,
      winner: side,
      activeUserId: winnerUserId,
    };
    return { state: winState, ended: true, scoreDelta: { [winnerUserId]: 1 }, summary: { kind: 'win', side } };
  }

  const next = advanceTurn(state, pawnsAfter, state.drawnCard);
  const withActive = { ...next, activeUserId: next.sides[next.currentPlayer] };
  return { state: withActive, ended: false, summary: { kind: m.kind } };
}
