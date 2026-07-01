// src/clients/risk/rollOff.ts
// Client view-model for the pre-game roll-off (E5-3 server seam). `view.turnOrderRolls`
// is a per-seat d6 (index = seat); the seat with the highest roll goes first.
// The winner is recomputed here (rather than read from `view.currentPlayer`,
// which rotates as the game progresses) using the SAME rule as the server's
// `firstPlayer`: argmax with ties broken to the lowest seat index.

export interface RollOffRow {
  seat: number;
  roll: number;
  isWinner: boolean;
}

// The seat that won the roll-off, or null when there is no roll-off to show.
export function rollOffWinner(rolls?: readonly number[]): number | null {
  if (!rolls || rolls.length === 0) return null;
  let best = 0;
  for (let i = 1; i < rolls.length; i++) {
    // Strict `>` keeps the lowest-index seat on a tie — matches server firstPlayer.
    if (rolls[i] > rolls[best]) best = i;
  }
  return best;
}

// Per-seat display rows with exactly one winner flagged. Empty when absent.
export function rollOffRows(rolls?: readonly number[]): RollOffRow[] {
  if (!rolls || rolls.length === 0) return [];
  const winner = rollOffWinner(rolls);
  return rolls.map((roll, seat) => ({ seat, roll, isWinner: seat === winner }));
}
