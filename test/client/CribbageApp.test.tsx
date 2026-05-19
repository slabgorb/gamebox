// test/client/CribbageApp.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";

vi.mock("../../src/clients/shared/card-assets", () => ({
  cardImageUrl: (c: { suit: string; rank: string }) => `/cards/${c.suit}-${c.rank}.jpg`,
  backImageUrl: () => "/cards/back.png",
}));

import { CribbageApp } from "../../src/clients/cribbage/CribbageApp";

const fixtureView = (phase: "discard" | "pegging" = "discard") => ({
  matchTarget: 121,
  dealNumber: 1,
  phase,
  dealer: 0,
  deck: { count: 40 },
  hands: [
    [
      { rank: "A", suit: "H", id: 1 },
      { rank: "2", suit: "H", id: 2 },
      { rank: "3", suit: "H", id: 3 },
      { rank: "4", suit: "H", id: 4 },
      { rank: "5", suit: "H", id: 5 },
      { rank: "6", suit: "H", id: 6 },
    ],
    { count: 6 },
  ],
  pendingDiscards: [null, null],
  crib: { count: 0 },
  starter: null,
  pegging: phase === "pegging"
    ? { running: 0, history: [], lastTrick: null }
    : null,
  scores: [0, 0],
  prevScores: [0, 0],
  showBreakdown: null,
  acknowledged: [false, false],
  sides: { a: 42, b: 99 },
  activeUserId: 42,
  endedReason: null,
  winnerSide: null,
});

beforeEach(() => {
  (window as any).__GAME__ = {
    gameId: 7,
    userId: 42,
    gameType: "cribbage",
    sseUrl: "/sse/g/7",
    actionUrl: "/api/games/7/actions",
    stateUrl: "/api/games/7/state",
    yourFriendlyName: "Me",
    yourColor: "#3b82f6",
    opponentFriendlyName: "Bot",
    opponentColor: "#f59e0b",
    opponentPersonaId: "amos",
    opponentGlyph: "?",
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url === "/api/games/7/state") {
        return new Response(JSON.stringify({ state: fixtureView("discard") }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 200 });
    }),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CribbageApp skeleton", () => {
  it("renders the game chrome with title and opponent card", async () => {
    const { findByText, container } = render(<CribbageApp />);
    await findByText("Cribbage");
    expect(container.querySelector(".opp-card")).not.toBeNull();
  });

  it("renders the peg board after fetching state", async () => {
    const { container } = render(<CribbageApp />);
    await act(async () => {
      await Promise.resolve();
    });
    // Wait one microtask for the resync fetch.
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector("svg.peg-board-svg")).not.toBeNull();
  });
});
