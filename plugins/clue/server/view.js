// The single information-disclosure seam. Every field here is deliberate:
// public board state for all, the viewer's own private hand/ledger, and NOTHING
// about the envelope, other hands, other ledgers, or a shown card the viewer
// did not personally receive.
import { BOARD } from './geometry.js';
import { legalMoves, secretPassageDest } from './rules/movement.js';

export function cluePublicView({ state, viewerId, geo = BOARD }) {
  const idx = state.seats.indexOf(viewerId);
  const seat = idx === -1 ? null : idx;

  let suggestion = null;
  if (state.suggestion) {
    const isSuggester = seat !== null && seat === state.suggestion.bySeat;
    suggestion = {
      bySeat: state.suggestion.bySeat,
      suspect: state.suggestion.suspect,
      weapon: state.suggestion.weapon,
      room: state.suggestion.room,
      refuterSeat: state.suggestion.refuterSeat,
      shownCard: isSuggester ? state.suggestion.shownCard : null,
    };
  }

  // Reachability is disclosed ONLY to the seat whose input is awaited.
  let movement = null;
  const isActive = seat !== null && viewerId === state.activeUserId && !state.eliminated[seat];
  if (isActive && state.phase === 'move') {
    if (state.pendingRoll == null) {
      const loc = state.pawns[state.seatSuspect[seat]];
      const room = loc && loc.room ? loc.room : null;
      movement = { needsRoll: true, secretPassage: room ? secretPassageDest(geo, room) : null };
    } else {
      const { squares, rooms } = legalMoves(state, geo, seat);
      movement = { needsRoll: false, pendingRoll: state.pendingRoll, squares, rooms };
    }
  }

  return {
    youAreSeat: seat,
    seats: state.seats,
    phase: state.phase,
    currentSeat: state.currentSeat,
    activeUserId: state.activeUserId,
    pawns: state.pawns,
    weapons: state.weapons,
    seatSuspect: state.seatSuspect,
    eliminated: state.eliminated,
    log: state.log,
    suggestion,
    hand: seat === null ? [] : state.hands[seat],
    ledger: seat === null ? [] : state.ledgers[seat],
    winnerSeat: state.winnerSeat ?? null,
    pendingRoll: state.pendingRoll ?? null,
    movement,
    // envelope, hands, ledgers are intentionally NOT copied out.
  };
}
