// Pure refute-pause helpers (no JSX) so they are covered by node --test. The
// client shows ONLY cards the refuter both holds and were suggested; the
// server re-validates the choice.
export function refuteChoices(view) {
  const s = view?.suggestion;
  if (!s || !Array.isArray(view.hand)) return [];
  const named = [s.suspect, s.weapon, s.room];
  return named.filter((card) => view.hand.includes(card));
}

export function isMyRefute(view, myUserId) {
  if (!view || view.phase !== 'refute' || !view.suggestion) return false;
  if (view.activeUserId !== myUserId) return false;
  return view.youAreSeat === view.suggestion.refuterSeat;
}
