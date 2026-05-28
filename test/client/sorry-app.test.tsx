import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// Mutable, hoisted handles so each test can swap the view/post the mocked
// useGameState hook returns before rendering SorryApp.
const h = vi.hoisted(() => ({
  view: null as unknown,
  post: vi.fn(() => Promise.resolve()),
}));

vi.mock("../../src/clients/shared/useGameState", () => ({
  useGameState: () => ({
    view: h.view,
    status: "live",
    actionError: null,
    post: h.post,
    ctx: {
      gameId: 1,
      userId: 1,
      gameType: "sorry",
      sseUrl: "/sse",
      actionUrl: "/act",
      stateUrl: "/state",
      yourFriendlyName: "You",
      opponentFriendlyName: "The Bully",
      opponentPersonaId: "the-bully",
      yourColor: "#c33",
      opponentColor: "#36c",
    },
  }),
}));

import { SorryApp } from "../../src/clients/sorry/SorryApp";

function baseView(over: Record<string, unknown> = {}) {
  return {
    sides: { a: 1, b: 2 },
    pawns: {
      a: [0, 1, 2, 3].map((id) => ({ id, zone: "start", index: 0 })),
      b: [0, 1, 2, 3].map((id) => ({ id, zone: "start", index: 0 })),
    },
    discard: [],
    drawnCard: 1,
    currentPlayer: "a",
    winner: null,
    lastEvent: null,
    activeUserId: 1,
    deckCount: 44,
    youAre: "a",
    legalMoves: undefined as unknown,
    ...over,
  };
}

beforeEach(() => {
  h.post.mockClear();
});

describe("SorryApp", () => {
  // AC #2 — the drawn card value comes from the server view and is shown face-up.
  it("shows the drawn card face from the public view", () => {
    h.view = baseView({ drawnCard: 7 });
    render(<SorryApp />);
    expect(screen.getByTestId("drawn-card")).toHaveTextContent("7");
  });

  // AC #2 — no client-side draw logic: the shown card simply tracks the server
  // value as it changes across SSE updates (a new view with a new drawnCard).
  it("updates the shown card when the server delivers a new drawnCard", () => {
    h.view = baseView({ drawnCard: 1 });
    const { rerender, getByTestId } = render(<SorryApp />);
    expect(getByTestId("drawn-card")).toHaveTextContent("1");

    h.view = baseView({ drawnCard: "sorry" });
    rerender(<SorryApp />);
    expect(getByTestId("drawn-card")).toHaveTextContent(/sorry/i);
  });

  // AC #4 — clicking a legal target POSTs the backgammon-style move contract.
  it("posts { type: 'move', payload: { moveId } } when a legal target is clicked", () => {
    h.view = baseView({
      youAre: "a",
      currentPlayer: "a",
      legalMoves: [
        { id: "out:0", kind: "out", pawnId: 0, to: { zone: "track", index: 4 } },
      ],
    });
    const { container } = render(<SorryApp />);
    const hit = container.querySelector('[data-pick="out:0"]') as HTMLElement;
    expect(hit).not.toBeNull();
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(h.post).toHaveBeenCalledWith({
      type: "move",
      payload: { moveId: "out:0" },
    });
  });

  // AC #5 — win banner when youAre === winner.
  it("shows a WIN banner when the local player is the winner", () => {
    h.view = baseView({ winner: "a", youAre: "a" });
    render(<SorryApp />);
    expect(screen.getByText(/you win/i)).toBeInTheDocument();
  });

  // AC #5 — lose banner when the opponent is the winner.
  it("shows a LOSE banner when the opponent is the winner", () => {
    h.view = baseView({ winner: "b", youAre: "a" });
    render(<SorryApp />);
    expect(screen.getByText(/you lose|defeat/i)).toBeInTheDocument();
  });

  // AC #5 — no end banner while the game is still in progress.
  it("shows no end banner while winner is null", () => {
    h.view = baseView({ winner: null, youAre: "a" });
    render(<SorryApp />);
    expect(screen.queryByText(/you win/i)).toBeNull();
    expect(screen.queryByText(/you lose|defeat/i)).toBeNull();
  });
});
