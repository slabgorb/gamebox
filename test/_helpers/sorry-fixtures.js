// Shared Sorry! test fixtures.

// Four pawns of one side, all sitting in Start.
export const mkStartPawns = () =>
  Array.from({ length: 4 }, (_, i) => ({ id: i, zone: 'start', index: 0 }));

// A valid baseline state: all 8 pawns in Start, side 'a' to move, card 1
// (so the four out:* moves are legal). Override any field via `over`.
export function baseState(over = {}) {
  return {
    sides: { a: 'user-a', b: 'user-b' },
    pawns: { a: mkStartPawns(), b: mkStartPawns() },
    deck: [],
    discard: [],
    drawnCard: 1,
    currentPlayer: 'a',
    winner: null,
    lastEvent: null,
    activeUserId: 'user-a',
    ...over,
  };
}
