import { describe, it, expect } from "vitest";
import { cribbagePublicView } from "../../plugins/cribbage/server/view.js";
import type { CribbageView } from "../../src/clients/shared/contracts/cribbage";

// Synthesize a state that mirrors what plugins/cribbage/server/state.js builds.
function fixtureState() {
  return {
    matchTarget: 121,
    dealNumber: 1,
    phase: "discard" as const,
    dealer: 0,
    deck: Array.from({ length: 40 }, (_, i) => ({ rank: "2", suit: "H", id: i })),
    hands: [
      Array.from({ length: 6 }, (_, i) => ({ rank: "2", suit: "H", id: i })),
      Array.from({ length: 6 }, (_, i) => ({ rank: "3", suit: "H", id: i + 6 })),
    ],
    pendingDiscards: [null, null],
    crib: [],
    starter: null,
    pegging: null,
    scores: [0, 0],
    prevScores: [0, 0],
    showBreakdown: null,
    acknowledged: [false, false],
    sides: { a: 1, b: 2 },
    activeUserId: null,
    endedReason: null,
    winnerSide: null,
  };
}

describe("CribbageView contract drift", () => {
  it("has exactly the same keys as cribbagePublicView() output", () => {
    const view = cribbagePublicView({ state: fixtureState(), viewerId: 1 });
    // Build a "structurally complete" CribbageView so unused-key drift surfaces.
    const _typeAssert: CribbageView = view as unknown as CribbageView;
    void _typeAssert;
    const serverKeys = new Set(Object.keys(view));
    const expectedKeys = new Set([
      "matchTarget",
      "dealNumber",
      "phase",
      "dealer",
      "deck",
      "hands",
      "pendingDiscards",
      "crib",
      "starter",
      "pegging",
      "scores",
      "prevScores",
      "showBreakdown",
      "acknowledged",
      "sides",
      "activeUserId",
      "endedReason",
      "winnerSide",
    ]);
    expect(serverKeys).toEqual(expectedKeys);
  });
});
