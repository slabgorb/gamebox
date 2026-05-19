import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TERRITORIES } from "../../src/clients/risk/map-geometry.js";

// Same fixture shape as test/client/risk-app.test.tsx so Board can iterate
// every territory. Phase=attack gives us a stable mid-game frame.
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
    ctx: {
      gameId: 99,
      userId: 1,
      gameType: "risk",
      sseUrl: "/api/games/99/events",
      actionUrl: "/api/games/99/action",
      stateUrl: "/api/games/99",
      yourFriendlyName: "Me",
      yourColor: "#c33",
      opponentFriendlyName: "Professor Doofi",
      opponentColor: "#8b5cf6",
      opponentPersonaId: "professor-doofi",
      opponentGlyph: "✦",
    },
  }),
}));

// RiskApp's CombatReveal mounts a <dice-tray> web component; jsdom needs a stub registered.
beforeEach(() => {
  if (!customElements.get("dice-tray")) {
    customElements.define("dice-tray", class extends HTMLElement {});
  }
});

afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../../src/clients/shared/useGameState");
});

describe("RiskApp opponent card", () => {
  it("mounts the OpponentCard when ctx has opponentPersonaId", async () => {
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    const { container } = render(<RiskApp />);
    await waitFor(() =>
      expect(screen.getByText(/Phase: attack/i)).toBeInTheDocument(),
    );
    // BEM class names (.opp-card / .opp-card__name / .opp-card__img) are the integration contract with OpponentCard.tsx — coupling here is intentional.
    const card = container.querySelector(".opp-card");
    expect(card).not.toBeNull();
    expect(card!.querySelector(".opp-card__name")!.textContent).toBe(
      "Professor Doofi",
    );
    const img = card!.querySelector("img.opp-card__img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe(
      "/shared/portraits/professor-doofi.png",
    );
  });

  it("renders no .opp-card when opponentPersonaId is null", async () => {
    vi.resetModules();
    vi.doMock("../../src/clients/shared/useGameState", () => ({
      useGameState: () => ({
        view,
        status: "live",
        actionError: null,
        post: vi.fn(),
        ctx: {
          gameId: 99,
          userId: 1,
          gameType: "risk",
          sseUrl: "/api/games/99/events",
          actionUrl: "/api/games/99/action",
          stateUrl: "/api/games/99",
          opponentFriendlyName: "Opponent",
          opponentColor: "#36c",
          opponentPersonaId: null,
        },
      }),
    }));
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    const { container } = render(<RiskApp />);
    await waitFor(() =>
      expect(screen.getByText(/Phase: attack/i)).toBeInTheDocument(),
    );
    expect(container.querySelector(".opp-card")).toBeNull();
  });
});
