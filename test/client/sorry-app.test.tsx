import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

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

  it("prompts you to move on your turn and names the drawn card", () => {
    h.view = baseView({
      youAre: "a",
      currentPlayer: "a",
      drawnCard: 11,
      legalMoves: [{ id: "forward:0:11", kind: "forward", pawnId: 0, to: { zone: "track", index: 15 } }],
    });
    render(<SorryApp />);
    const prompt = screen.getByTestId("turn-prompt");
    expect(prompt).toHaveTextContent(/your turn/i);
    expect(prompt).toHaveTextContent(/11/);
  });

  it("says the opponent is thinking when it is not your turn", () => {
    h.view = baseView({ youAre: "a", currentPlayer: "b" });
    render(<SorryApp />);
    expect(screen.getByTestId("turn-prompt")).toHaveTextContent(/the bully/i);
  });

  // Pause-for-acknowledgement: an unplayable card stops on the player, who must
  // tap Pass (legalMoves is an empty array on their turn → no move available).
  it("shows a Pass button on your turn when you have no legal move, and posts a pass", () => {
    h.view = baseView({ youAre: "a", currentPlayer: "a", drawnCard: 3, legalMoves: [] });
    render(<SorryApp />);
    const btn = screen.getByTestId("pass-button");
    fireEvent.click(btn);
    expect(h.post).toHaveBeenCalledWith({ type: "pass" });
  });

  it("shows no Pass button when you have a legal move", () => {
    h.view = baseView({
      youAre: "a",
      currentPlayer: "a",
      legalMoves: [{ id: "out:0", kind: "out", pawnId: 0, to: { zone: "track", index: 4 } }],
    });
    render(<SorryApp />);
    expect(screen.queryByTestId("pass-button")).toBeNull();
  });

  it("renders a note when the opponent had no move and passed", () => {
    h.view = baseView({ youAre: "a", currentPlayer: "a", lastEvent: { kind: "pass", side: "b", card: 4 } });
    render(<SorryApp />);
    const note = screen.getByTestId("last-event");
    expect(note).toHaveTextContent(/no legal move, passed/i);
    expect(note).toHaveTextContent(/4/);
  });

  // The roster colours must agree with the board: the viewer is red, the
  // opponent blue, regardless of which engine side the viewer is.
  it("paints the viewer's roster row red and the opponent's blue (viewer = b)", () => {
    h.view = baseView({ youAre: "b", currentPlayer: "a" });
    const { container } = render(<SorryApp />);
    const youImg = container.querySelector(".va-roster-row.is-you img") as HTMLImageElement;
    const oppImg = container.querySelector(
      ".va-roster-row:not(.is-you):not(.is-open) img",
    ) as HTMLImageElement;
    expect(youImg?.getAttribute("src")).toContain("checker-red");
    expect(oppImg?.getAttribute("src")).toContain("checker-blue");
  });

  it("renders a link back to the lobby", () => {
    h.view = baseView();
    render(<SorryApp />);
    const link = screen.getByRole("link", { name: /lobby/i });
    expect(link).toHaveAttribute("href", "/");
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
