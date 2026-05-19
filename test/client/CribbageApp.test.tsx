// test/client/CribbageApp.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act, fireEvent, waitFor } from "@testing-library/react";

vi.mock("../../src/clients/shared/card-assets", () => ({
  cardImageUrl: (c: { suit: string; rank: string }) => `/cards/${c.suit}-${c.rank}.jpg`,
  backImageUrl: () => "/cards/back.png",
}));

const { playMock, playForScoreMock, primeAudioMock } = vi.hoisted(() => ({
  playMock: vi.fn(),
  playForScoreMock: vi.fn(),
  primeAudioMock: vi.fn(),
}));
vi.mock("../../src/clients/cribbage/sounds", () => ({
  play: playMock,
  playForScore: playForScoreMock,
  primeAudio: primeAudioMock,
  isMuted: () => false,
  toggleMuted: () => false,
}));

import { CribbageApp } from "../../src/clients/cribbage/CribbageApp";
import type { CribbageView } from "../../src/clients/shared/contracts/cribbage";

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

describe("CribbageApp action posting", () => {
  it("Send-to-crib POSTs { type: 'discard', payload: { cards } }", async () => {
    const { container } = render(<CribbageApp />);
    const handCards = await waitFor(() => {
      const cards = container.querySelectorAll(".hand-row--me img.card");
      if (cards.length < 2) throw new Error("hand not rendered yet");
      return cards;
    });
    fireEvent.click(handCards[0]);
    fireEvent.click(handCards[1]);
    const btn = container.querySelector("button.btn-discard") as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    await act(async () => {
      btn.click();
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/games/7/actions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"type":"discard"'),
      }),
    );
  });

  it("Cut button POSTs { type: 'cut' } when the user is non-dealer", async () => {
    // Override fetch to return a cut-phase state, non-dealer
    (fetch as any).mockImplementation(async (url: string) => {
      if (url === "/api/games/7/state") {
        const v = fixtureView("discard");
        v.phase = "cut" as any;
        v.dealer = 1; // I'm side 0, dealer is side 1 → I'm non-dealer → I can cut
        return new Response(JSON.stringify({ state: v }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response(null, { status: 200 });
    });
    const { container } = render(<CribbageApp />);
    const btn = await waitFor(() => {
      const el = container.querySelector("button.btn-cut") as HTMLButtonElement | null;
      if (!el) throw new Error("btn-cut not rendered yet");
      return el;
    });
    await act(async () => {
      btn.click();
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/games/7/actions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"type":"cut"'),
      }),
    );
  });
});

describe("CribbageApp transitions (applyTransition)", () => {
  beforeEach(() => {
    playMock.mockReset();
    playForScoreMock.mockReset();
  });

  it("plays 'cheer-100' on transition into match-end", async () => {
    const { applyTransition } = await import("../../src/clients/cribbage/CribbageApp");
    const prev = fixtureView("pegging") as unknown as CribbageView;
    const next = {
      ...(fixtureView("pegging") as unknown as CribbageView),
      phase: "match-end" as const,
      winnerSide: "a" as const,
      scores: [121, 75] as [number, number],
    };
    applyTransition(prev, next, 42);
    expect(playMock).toHaveBeenCalledWith("cheer-100");
  });

  it("plays 'your-turn' when activeUserId flips to me at pegging", async () => {
    const { applyTransition } = await import("../../src/clients/cribbage/CribbageApp");
    const prev = {
      ...(fixtureView("pegging") as unknown as CribbageView),
      activeUserId: 99,
    };
    const next = {
      ...(fixtureView("pegging") as unknown as CribbageView),
      activeUserId: 42,
    };
    applyTransition(prev, next, 42);
    expect(playMock).toHaveBeenCalledWith("your-turn");
  });

  it("calls playForScore on a positive score delta in non-match-end", async () => {
    const { applyTransition } = await import("../../src/clients/cribbage/CribbageApp");
    const prev = {
      ...(fixtureView("pegging") as unknown as CribbageView),
      scores: [0, 0] as [number, number],
    };
    const next = {
      ...(fixtureView("pegging") as unknown as CribbageView),
      scores: [4, 0] as [number, number],
    };
    applyTransition(prev, next, 42);
    expect(playForScoreMock).toHaveBeenCalledWith(4);
  });

  it("does NOT play anything when prev is null (first view)", async () => {
    const { applyTransition } = await import("../../src/clients/cribbage/CribbageApp");
    const next = fixtureView("discard") as unknown as CribbageView;
    applyTransition(null, next, 42);
    expect(playMock).not.toHaveBeenCalled();
    expect(playForScoreMock).not.toHaveBeenCalled();
  });

  it("formatDealSummary returns text including deal numbers and names + scores", async () => {
    const { formatDealSummary } = await import("../../src/clients/cribbage/CribbageApp");
    const prev = {
      ...(fixtureView("discard") as unknown as CribbageView),
      phase: "show" as const,
      showBreakdown: { nonDealer: { total: 0, items: [] }, dealer: { total: 0, items: [] }, crib: { total: 0, items: [] } },
      dealNumber: 3,
      scores: [12, 14] as [number, number],
      prevScores: [12, 10] as [number, number],
    };
    const next = {
      ...(fixtureView("discard") as unknown as CribbageView),
      dealNumber: 4,
      scores: [12, 14] as [number, number],
    };
    const text = formatDealSummary(prev, next, "You", "Bot");
    expect(text).toMatch(/Deal 3 → 4/);
    expect(text).toContain("You 12");
    expect(text).toContain("Bot 14");
  });
});
