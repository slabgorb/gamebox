import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

vi.mock("../../src/clients/shared/card-assets.ts", () => ({
  cardImageUrl: (c: { suit: string; rank: string }) => `/cards/${c.suit}-${c.rank}.jpg`,
  backImageUrl: () => "/cards/back.png",
}));

import { Pegging, isPlayable } from "../../src/clients/cribbage/Pegging";

const PEG_BASE = { running: 12, history: [{ rank: "5" as const, suit: "H" as const, id: 1 }], lastTrick: null };

describe("Pegging", () => {
  it("renders the running total", () => {
    const { getByText } = render(<Pegging pegging={PEG_BASE} />);
    expect(getByText(/Running: 12/)).not.toBeNull();
  });

  it("renders history cards in order", () => {
    const peg = {
      running: 18,
      history: [
        { rank: "5" as const, suit: "H" as const, id: 1 },
        { rank: "8" as const, suit: "D" as const, id: 2 },
      ],
      lastTrick: null,
    };
    const { container } = render(<Pegging pegging={peg} />);
    const cards = container.querySelectorAll("img.card");
    expect(cards).toHaveLength(2);
  });

  it("renders a last-trick block with `31 for N` label", () => {
    const peg = {
      running: 0,
      history: [],
      lastTrick: {
        kind: "31" as const,
        cards: [{ rank: "T" as const, suit: "H" as const, id: 1 }],
        points: 2,
      },
    };
    const { container } = render(<Pegging pegging={peg} />);
    const label = container.querySelector(".last-trick__label");
    expect(label!.textContent).toBe("31 for 2");
  });

  it("renders a last-trick block with `Go for N` label", () => {
    const peg = {
      running: 28,
      history: [],
      lastTrick: {
        kind: "go" as const,
        cards: [{ rank: "5" as const, suit: "H" as const, id: 1 }],
        points: 1,
      },
    };
    const { container } = render(<Pegging pegging={peg} />);
    expect(container.querySelector(".last-trick__label")!.textContent).toBe("Go for 1");
  });
});

describe("isPlayable", () => {
  const peg = { running: 25, history: [], lastTrick: null };
  it("returns true when card pip + running <= 31", () => {
    expect(isPlayable({ rank: "5", suit: "H" }, peg)).toBe(true); // 30
    expect(isPlayable({ rank: "6", suit: "H" }, peg)).toBe(true); // 31
  });
  it("returns false when card pip + running > 31", () => {
    expect(isPlayable({ rank: "7", suit: "H" }, peg)).toBe(false); // 32
    expect(isPlayable({ rank: "T", suit: "H" }, peg)).toBe(false); // 35
    expect(isPlayable({ rank: "K", suit: "H" }, peg)).toBe(false); // 35
  });
});
