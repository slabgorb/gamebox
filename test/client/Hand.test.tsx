import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";

vi.mock("../../src/clients/shared/card-assets", () => ({
  cardImageUrl: (c: { suit: string; rank: string; id?: number }) =>
    `/cards/${c.suit}-${c.rank}.jpg`,
  backImageUrl: () => "/cards/back.png",
}));

import { Hand } from "../../src/clients/cribbage/Hand";

const HAND = [
  { rank: "A" as const, suit: "H" as const, id: 1 },
  { rank: "5" as const, suit: "H" as const, id: 2 },
  { rank: "T" as const, suit: "S" as const, id: 3 },
  { rank: "Q" as const, suit: "D" as const, id: 4 },
];

describe("Hand", () => {
  it("renders an opponent hand as N face-down backs", () => {
    const { container } = render(<Hand mode="opponent" cards={null} count={4} />);
    const imgs = container.querySelectorAll("img");
    expect(imgs).toHaveLength(4);
    imgs.forEach((img) => expect(img.getAttribute("src")).toBe("/cards/back.png"));
  });

  it("renders my hand in view mode (all clickable=false)", () => {
    const { container } = render(<Hand mode="view" cards={HAND} />);
    expect(container.querySelectorAll("img")).toHaveLength(4);
    expect(container.querySelector(".is-selected")).toBeNull();
  });

  it("discard mode allows up to 2 selections, third click is ignored", () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <Hand mode="discard" cards={HAND} onSelectionChange={onSelectionChange} />,
    );
    const cards = container.querySelectorAll("img.card");
    fireEvent.click(cards[0]);
    fireEvent.click(cards[1]);
    fireEvent.click(cards[2]);
    const selected = container.querySelectorAll("img.is-selected");
    expect(selected).toHaveLength(2);
    expect(onSelectionChange).toHaveBeenLastCalledWith([HAND[0], HAND[1]]);
  });

  it("discard mode toggles a re-clicked card off", () => {
    const onSelectionChange = vi.fn();
    const { container } = render(
      <Hand mode="discard" cards={HAND} onSelectionChange={onSelectionChange} />,
    );
    const cards = container.querySelectorAll("img.card");
    fireEvent.click(cards[0]);
    fireEvent.click(cards[0]);
    expect(container.querySelectorAll("img.is-selected")).toHaveLength(0);
    expect(onSelectionChange).toHaveBeenLastCalledWith([]);
  });

  it("pegging mode disables unplayable cards and emits onPlay for playable", () => {
    const onPlay = vi.fn();
    const peg = { running: 25, history: [], lastTrick: null };
    const { container } = render(
      <Hand mode="pegging" cards={HAND} pegging={peg} isMyTurn onPlay={onPlay} />,
    );
    const cards = container.querySelectorAll("img.card");
    // A(1) playable: 25+1=26; 5 playable: 30; T(10) unplayable: 35; Q(10) unplayable: 35
    expect(cards[0].classList.contains("is-disabled")).toBe(false);
    expect(cards[1].classList.contains("is-disabled")).toBe(false);
    expect(cards[2].classList.contains("is-disabled")).toBe(true);
    expect(cards[3].classList.contains("is-disabled")).toBe(true);
    fireEvent.click(cards[1]);
    expect(onPlay).toHaveBeenCalledWith(HAND[1]);
    fireEvent.click(cards[2]); // unplayable; ignored
    expect(onPlay).toHaveBeenCalledTimes(1);
  });
});
