import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { CardTray } from "../../src/clients/risk/CardTray";
import type { Card } from "../../src/clients/shared/contracts/risk";

const inf = (t: string): Card => ({ territory: t, type: "infantry" });
const cav = (t: string): Card => ({ territory: t, type: "cavalry" });
const art = (t: string): Card => ({ territory: t, type: "artillery" });

const base = {
  phase: "reinforce",
  currentPlayer: 0,
  youAre: 0,
  territories: {},
  reinforcePool: 5,
  setupPools: [0, 0],
  fortifyUsed: false,
  lastCombat: null,
  winner: null,
  log: [],
  opponentCardCount: 2,
  nextTradeBonus: 8,
} as any;

function view(hand: Card[], over: Record<string, unknown> = {}) {
  return { ...base, hand, ...over };
}

describe("CardTray", () => {
  it("renders nothing when the game has no card state", () => {
    const { container } = render(<CardTray view={{ ...base, hand: undefined }} post={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders the player's hand and the opponent count", () => {
    render(<CardTray view={view([inf("alaska"), cav("nwt")])} post={vi.fn()} />);
    expect(screen.getAllByTestId("hand-card")).toHaveLength(2);
    expect(screen.getByTestId("opponent-card-count")).toHaveTextContent("Opponent holds 2");
  });

  it("shows the bonus the next trade will grant", () => {
    render(<CardTray view={view([inf("alaska"), cav("nwt"), art("greenland")])} post={vi.fn()} />);
    expect(screen.getByTestId("next-trade-bonus")).toHaveTextContent("+8 armies");
  });

  it("disables trade-in until three cards forming a valid set are selected", () => {
    render(<CardTray view={view([inf("alaska"), cav("nwt"), art("greenland")])} post={vi.fn()} />);
    const btn = screen.getByTestId("trade-in-btn");
    expect(btn).toBeDisabled();
    const cards = screen.getAllByTestId("hand-card");
    fireEvent.click(cards[0]);
    fireEvent.click(cards[1]);
    expect(btn).toBeDisabled(); // only two selected
    fireEvent.click(cards[2]);
    expect(btn).toBeEnabled(); // three distinct types = valid set
  });

  it("dispatches a trade-in action with the selected card indices", () => {
    const post = vi.fn();
    render(<CardTray view={view([inf("alaska"), cav("nwt"), art("greenland")])} post={post} />);
    const cards = screen.getAllByTestId("hand-card");
    fireEvent.click(cards[0]);
    fireEvent.click(cards[1]);
    fireEvent.click(cards[2]);
    fireEvent.click(screen.getByTestId("trade-in-btn"));
    expect(post).toHaveBeenCalledWith({ type: "trade-in", payload: { cardIndices: [0, 1, 2] } });
  });

  it("blocks with a must-trade modal when holding 5+ cards on your reinforce step", () => {
    const five = [inf("alaska"), inf("nwt"), inf("greenland"), cav("alberta"), art("ontario")];
    render(<CardTray view={view(five)} post={vi.fn()} />);
    expect(screen.getByTestId("must-trade-modal")).toBeInTheDocument();
  });

  it("does not show the must-trade modal below the threshold", () => {
    render(<CardTray view={view([inf("alaska"), cav("nwt"), art("greenland")])} post={vi.fn()} />);
    expect(screen.queryByTestId("must-trade-modal")).not.toBeInTheDocument();
  });

  it("does not force a trade on the opponent's turn", () => {
    const five = [inf("alaska"), inf("nwt"), inf("greenland"), cav("alberta"), art("ontario")];
    render(<CardTray view={view(five, { currentPlayer: 1 })} post={vi.fn()} />);
    expect(screen.queryByTestId("must-trade-modal")).not.toBeInTheDocument();
  });

  it("disables card selection when it is not the reinforce phase", () => {
    render(<CardTray view={view([inf("alaska"), cav("nwt")], { phase: "attack" })} post={vi.fn()} />);
    for (const c of screen.getAllByTestId("hand-card")) expect(c).toBeDisabled();
    expect(screen.queryByTestId("trade-in-btn")).not.toBeInTheDocument();
  });
});
