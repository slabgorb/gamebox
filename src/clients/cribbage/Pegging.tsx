import type { Card, PeggingState } from "../shared/contracts/cribbage";

const PIP: Record<string, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 10, Q: 10, K: 10,
};

export function isPlayable(card: Card, peg: PeggingState): boolean {
  return peg.running + PIP[card.rank] <= 31;
}
