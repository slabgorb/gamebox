import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

// Mock the card-assets module which wraps the external card-element.js
vi.mock("../../src/clients/shared/card-assets", () => ({
  cardImageUrl: (c: { suit: string; rank: string }) => `/cards/${c.suit}-${c.rank}.jpg`,
  backImageUrl: () => "/cards/back.png",
}));

import { Show } from "../../src/clients/cribbage/Show";

const BREAKDOWN = {
  nonDealer: {
    total: 8,
    items: [{ say: "Fifteen 2", cards: [{ rank: "T" as const, suit: "H" as const, id: 1 }] }],
  },
  dealer: {
    total: 4,
    items: [{ say: "Pair", cards: [{ rank: "5" as const, suit: "H" as const, id: 2 }] }],
  },
  crib: {
    total: 2,
    items: [{ say: "Knobs", cards: [{ rank: "J" as const, suit: "H" as const, id: 3 }] }],
  },
};

describe("Show", () => {
  it("renders three breakdown cards with totals", () => {
    const { container } = render(
      <Show
        breakdown={BREAKDOWN}
        isDealer
        isMatchEnd={false}
        myAcknowledged={false}
        scoresMe={50}
        scoresOpp={40}
        wonMatch={false}
        onAcknowledge={() => {}}
      />,
    );
    const cards = container.querySelectorAll(".breakdown-card");
    expect(cards.length).toBe(3);
    expect(cards[0].querySelector("h3")!.textContent).toContain("— 8");
    expect(cards[2].querySelector("h3")!.textContent).toContain("Crib — 2");
  });

  it("Continue button fires onAcknowledge when not acknowledged", () => {
    const onAck = vi.fn();
    const { getByText } = render(
      <Show
        breakdown={BREAKDOWN}
        isDealer
        isMatchEnd={false}
        myAcknowledged={false}
        scoresMe={50}
        scoresOpp={40}
        wonMatch={false}
        onAcknowledge={onAck}
      />,
    );
    fireEvent.click(getByText("Continue"));
    expect(onAck).toHaveBeenCalled();
  });

  it("shows 'Waiting for opponent…' when myAcknowledged", () => {
    const { getByText } = render(
      <Show
        breakdown={BREAKDOWN}
        isDealer
        isMatchEnd={false}
        myAcknowledged
        scoresMe={50}
        scoresOpp={40}
        wonMatch={false}
        onAcknowledge={() => {}}
      />,
    );
    const btn = getByText("Waiting for opponent…") as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("at match-end shows a victory header and a Back to lobby link", () => {
    const { getByText, container } = render(
      <Show
        breakdown={BREAKDOWN}
        isDealer={false}
        isMatchEnd
        myAcknowledged={false}
        scoresMe={121}
        scoresOpp={75}
        wonMatch
        onAcknowledge={() => {}}
      />,
    );
    expect(getByText(/Game! You won, 121 to 75\./)).not.toBeNull();
    const link = container.querySelector("a.show-lobby-btn") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("/");
  });

  it("at match-end with skunk shows the skunk wording", () => {
    const { getByText } = render(
      <Show
        breakdown={BREAKDOWN}
        isDealer={false}
        isMatchEnd
        myAcknowledged={false}
        scoresMe={121}
        scoresOpp={88}
        wonMatch
        onAcknowledge={() => {}}
      />,
    );
    expect(getByText(/Game! You skunked them, 121 to 88\./)).not.toBeNull();
  });
});
