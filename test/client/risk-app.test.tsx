import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TERRITORIES } from "../../src/clients/risk/map-geometry.js";

// Board iterates every territory in the map geometry, so the smoke fixture
// must own all of them; flip two to opponent so phase=attack has a target.
const ids = Object.keys(TERRITORIES);
const territories: Record<string, { owner: 0 | 1; armies: number }> =
  Object.fromEntries(ids.map((id) => [id, { owner: 0, armies: 5 }]));
territories[ids[0]] = { owner: 1, armies: 2 };

const view = {
  phase: "attack",
  currentPlayer: 0,
  youAre: 0,
  territories,
  reinforcePool: 0,
  setupPools: [0, 0],
  fortifyUsed: false,
  lastCombat: null,
  winner: null,
  log: [],
};

vi.mock("../../src/clients/shared/useGameState", () => ({
  useGameState: () => ({
    view,
    status: "live",
    actionError: null,
    post: vi.fn(),
    ctx: { opponentColor: "#36c", yourColor: "#c33" },
  }),
}));

beforeEach(() => {
  if (!customElements.get("dice-tray")) {
    customElements.define("dice-tray", class extends HTMLElement {});
  }
});

describe("RiskApp", () => {
  it("renders the banner and board for an in-progress game", async () => {
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    render(<RiskApp />);
    await waitFor(() =>
      expect(screen.getByText(/Phase: attack/i)).toBeInTheDocument(),
    );
    expect(
      screen.getByRole("button", { name: /done attacking/i }),
    ).toBeInTheDocument();
  });
});
