import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { TERRITORIES } from "../../src/clients/risk/map-geometry.js";

const ids = Object.keys(TERRITORIES);
const territories: Record<string, { owner: 0 | 1; armies: number }> =
  Object.fromEntries(ids.map((id) => [id, { owner: 0, armies: 5 }]));
territories[ids[0]] = { owner: 1, armies: 2 };

const view = {
  phase: "attack",
  currentPlayer: 0,
  youAre: 0,
  seats: [1, 11],
  territories,
  reinforcePool: 0,
  setupPools: [0, 0],
  fortifyUsed: false,
  lastCombat: null,
  winner: null,
  log: [],
};

function mockCtx(players: unknown[], extra: Record<string, unknown> = {}) {
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
        yourFriendlyName: "Me",
        yourColor: "#c33",
        players,
        ...extra,
      },
    }),
  }));
}

beforeEach(() => {
  if (!customElements.get("dice-tray")) {
    customElements.define("dice-tray", class extends HTMLElement {});
  }
});
afterEach(() => {
  vi.resetModules();
  vi.doUnmock("../../src/clients/shared/useGameState");
});

describe("RiskApp AI roster", () => {
  it("renders a bot card for each bot seat in ctx.players", async () => {
    vi.resetModules();
    mockCtx([
      { userId: 1, seat: 0, friendlyName: "Me", color: "#c33", glyph: null, isBot: false, personaId: null },
      { userId: 11, seat: 1, friendlyName: "Hattie", color: "#a00", glyph: "x", isBot: true, personaId: "hattie" },
    ]);
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    const { container } = render(<RiskApp />);
    await waitFor(() =>
      expect(screen.getByText(/Phase: attack/i)).toBeInTheDocument(),
    );
    const cards = container.querySelectorAll(".opp-card");
    expect(cards.length).toBe(1);
    const img = cards[0].querySelector("img.opp-card__img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/shared/portraits/hattie.png");
  });

  it("renders no card when the only opponent is human", async () => {
    vi.resetModules();
    mockCtx([
      { userId: 1, seat: 0, friendlyName: "Me", color: "#c33", glyph: null, isBot: false, personaId: null },
      { userId: 22, seat: 1, friendlyName: "Pat", color: "#36c", glyph: null, isBot: false, personaId: null },
    ]);
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    const { container } = render(<RiskApp />);
    await waitFor(() =>
      expect(screen.getByText(/Phase: attack/i)).toBeInTheDocument(),
    );
    expect(container.querySelector(".opp-card")).toBeNull();
  });

  it("falls back to opponentPersonaId for a legacy 2P bot seat", async () => {
    vi.resetModules();
    mockCtx(
      [
        { userId: 1, seat: 0, friendlyName: "Me", color: "#c33", glyph: null, isBot: false, personaId: null },
        { userId: 11, seat: 1, friendlyName: "Bot", color: "#a00", glyph: "x", isBot: true, personaId: null },
      ],
      { opponentPersonaId: "professor-doofi", opponentFriendlyName: "Professor Doofi", opponentColor: "#8b5cf6", opponentGlyph: "✦" },
    );
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    const { container } = render(<RiskApp />);
    await waitFor(() =>
      expect(screen.getByText(/Phase: attack/i)).toBeInTheDocument(),
    );
    const img = container.querySelector("img.opp-card__img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/shared/portraits/professor-doofi.png");
  });
});
