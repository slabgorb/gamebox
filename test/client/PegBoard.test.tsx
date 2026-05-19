import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { PegBoard } from "../../src/clients/cribbage/PegBoard";

describe("PegBoard", () => {
  it("renders an SVG with two lanes (each 2 hole-rows + start hole)", () => {
    const { container } = render(
      <PegBoard
        scores={[0, 0]}
        prevScores={[0, 0]}
        matchTarget={121}
        myColor="#3b82f6"
        opponentColor="#f59e0b"
        mySide={0}
      />,
    );
    const svg = container.querySelector("svg.peg-board-svg");
    expect(svg).not.toBeNull();
    // Two lanes × 2 rows of 60 holes = 240 normal holes; + 2 start holes + 1 game hole = 243 circles.
    const circles = svg!.querySelectorAll("circle.peg-hole");
    expect(circles.length).toBe(2 * 2 * 60 + 2 + 1);
  });

  it("renders front and back peg per player at the right positions", () => {
    const { container } = render(
      <PegBoard
        scores={[12, 8]}
        prevScores={[7, 8]}
        matchTarget={121}
        myColor="#3b82f6"
        opponentColor="#f59e0b"
        mySide={0}
      />,
    );
    const pegs = container.querySelectorAll("g.peg");
    expect(pegs.length).toBe(4); // 2 pegs (front + back) per player
    const fronts = container.querySelectorAll("g.peg--front");
    expect(fronts.length).toBe(2);
    const backs = container.querySelectorAll("g.peg--back");
    expect(backs.length).toBe(2);
  });

  it("renders my-side lane on top regardless of side number", () => {
    const { container } = render(
      <PegBoard
        scores={[0, 0]}
        prevScores={[0, 0]}
        matchTarget={121}
        myColor="#3b82f6"
        opponentColor="#f59e0b"
        mySide={1}
      />,
    );
    // Visual ordering is a layout invariant: the FIRST front-peg in document
    // order is the user's. (Mirrors vanilla "topPlayer = mySide".)
    const fronts = container.querySelectorAll("g.peg--front circle");
    // First peg uses myColor, second uses opponentColor.
    expect((fronts[0] as SVGCircleElement).getAttribute("fill")).toBe("#3b82f6");
    expect((fronts[1] as SVGCircleElement).getAttribute("fill")).toBe("#f59e0b");
  });
});
