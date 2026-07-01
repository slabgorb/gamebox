// Walk seats to the LEFT of the suggester (increasing index, wrapping), looking
// for the first that can disprove the suggestion. Eliminated players still hold
// cards and still refute, so they are NOT skipped.
export function findRefuterWalk(state, suggesterSeat, named) {
  const n = state.seats.length;
  const cards = [named.suspect, named.weapon, named.room];
  const passes = [];
  for (let step = 1; step < n; step++) {
    const seat = (suggesterSeat + step) % n;
    const holds = cards.some((c) => state.hands[seat].includes(c));
    if (holds) return { passes, refuterSeat: seat };
    passes.push(seat);
  }
  return { passes, refuterSeat: null };
}
