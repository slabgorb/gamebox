import { buildDeck, draw } from './deck.js';

export function buildInitialState({ participants, options } = {}) {
  if (!Array.isArray(participants) || participants.length !== 2) {
    throw new Error('sorry requires exactly 2 participants');
  }
  const pA = participants.find((p) => p?.side === 'a');
  const pB = participants.find((p) => p?.side === 'b');
  if (!pA || !pB) throw new Error("sorry: missing side 'a' or 'b' participant");
  if (pA.userId === undefined || pB.userId === undefined) throw new Error('sorry: participant missing userId');
  if (pA.userId === pB.userId) throw new Error('sorry: participants must have distinct userIds');

  const rng = typeof options?.rng === 'function' ? options.rng : Math.random;
  const mkPawns = () => Array.from({ length: 4 }, (_, i) => ({ id: i, zone: 'start', index: 0 }));
  const fullDeck = buildDeck(rng);
  const { card, deck, discard } = draw({ deck: fullDeck, discard: [], rng });

  return {
    sides: { a: pA.userId, b: pB.userId },
    pawns: { a: mkPawns(), b: mkPawns() },
    deck,
    discard,
    drawnCard: card,
    currentPlayer: 'a',
    winner: null,
    lastEvent: null,
    activeUserId: pA.userId,
  };
}
