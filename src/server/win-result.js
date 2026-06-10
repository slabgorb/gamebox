// Normalize a finished plugin state's winner declaration into the platform's
// canonical shape: a seat array plus an explicit draw flag.
//   - winnerSeats: [seat, ...]  (N-player / partnership plugins)
//   - winnerSeat: int           (Risk and other solo N-player plugins)
//   - winnerSide: 'a'|'b'|'draw' (legacy 2P plugins)
export function winSeatsFromState(state) {
  if (Array.isArray(state.winnerSeats)) {
    return { winnerSeats: state.winnerSeats, isDraw: false };
  }
  if (Number.isInteger(state.winnerSeat)) {
    return { winnerSeats: [state.winnerSeat], isDraw: false };
  }
  if (state.winnerSide === 'a') return { winnerSeats: [0], isDraw: false };
  if (state.winnerSide === 'b') return { winnerSeats: [1], isDraw: false };
  if (state.winnerSide === 'draw') return { winnerSeats: null, isDraw: true };
  return { winnerSeats: null, isDraw: false };
}
