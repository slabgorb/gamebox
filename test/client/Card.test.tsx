import { describe, it, expect, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

// Mock the card-assets module which wraps the external card-element.js
vi.mock("../../src/clients/shared/card-assets", () => ({
  cardImageUrl: (c: { suit: string; rank: string }) => `/cards/${c.suit}-${c.rank}.jpg`,
  backImageUrl: () => `/cards/back.png`,
}));

import { Card } from "../../src/clients/shared/Card";

describe("Card", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders a face-up <img> with cardImageUrl src", () => {
    const { container } = render(<Card card={{ suit: "H", rank: "A" }} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/cards/H-A.jpg");
    expect(img.getAttribute("alt")).toBe("Ace of Hearts");
  });

  it("renders face-down with backImageUrl src", () => {
    const { container } = render(<Card card={{ suit: "H", rank: "A" }} faceDown />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("/cards/back.png");
    expect(img.getAttribute("alt")).toBe("Face-down card");
  });

  it("respects className prop", () => {
    const { container } = render(<Card card={{ suit: "H", rank: "A" }} className="mini" />);
    expect(container.querySelector("img")!.className).toBe("card mini");
  });
});
