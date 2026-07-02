import { ALL_CARDS } from './cards.js';

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

// Deterministic least-leak refute selection for bot refuters.
//
// The hard contract: return exactly one card the refuter HOLDS from the
// three NAMED, deterministically. The least-leak ranking is best-effort
// from information the refuter legitimately owns: the public refute log
// omits the shown card by design (E6-1 privacy), so "already shown to this
// suggester" is not reconstructible without a new state field — a Plan 4
// concern (finding F6). The available conservative signal: a card the
// suggester has ALREADY NAMED in a prior suggestion of their own leaks
// less that is new. Ties break on fixed catalog order.
export function chooseRefuteCard(state, refuterSeat, named) {
  const trio = named ?? state.suggestion ?? {};
  const cards = [trio.suspect, trio.weapon, trio.room];
  const matches = cards.filter((c) => state.hands[refuterSeat].includes(c));
  if (matches.length === 0) return null;

  const suggesterSeat = state.suggestion?.bySeat;
  const priorSuggests = state.log
    .filter((e) => e.type === 'suggest' && e.bySeat === suggesterSeat)
    .slice(0, -1); // the in-flight suggestion names all three — no signal
  const namedBefore = new Set(
    priorSuggests.flatMap((e) => [e.suspect, e.weapon, e.room]),
  );

  return matches
    .slice()
    .sort((a, b) => {
      const leakA = namedBefore.has(a) ? 0 : 1;
      const leakB = namedBefore.has(b) ? 0 : 1;
      if (leakA !== leakB) return leakA - leakB;
      return ALL_CARDS.indexOf(a) - ALL_CARDS.indexOf(b);
    })[0];
}
