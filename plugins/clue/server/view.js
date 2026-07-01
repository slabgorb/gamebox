// The single information-disclosure seam. Every field here is deliberate:
// public board state for all, the viewer's own private hand/ledger, and NOTHING
// about the envelope, other hands, other ledgers, or a shown card the viewer
// did not personally receive.
export function cluePublicView({ state, viewerId }) {
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
    // envelope, hands, ledgers are intentionally NOT copied out.
  };
}
