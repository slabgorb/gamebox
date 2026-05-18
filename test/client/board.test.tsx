import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { buildBoardHTML } from "../../src/clients/risk/board-svg";
import { Board } from "../../src/clients/risk/Board";
import { TERRITORIES } from "../../src/clients/risk/map-geometry.js";

const anyId = Object.keys(TERRITORIES)[0];
const view = {
  youAre: 0,
  phase: "attack",
  territories: Object.fromEntries(
    Object.keys(TERRITORIES).map((id) => [id, { owner: 0, armies: 2 }]),
  ),
} as any;

describe("board-svg", () => {
  it("builds an SVG containing a hit path for every territory", () => {
    const html = buildBoardHTML(view, {
      selected: null,
      plan: {},
      to: null,
    });
    expect(html).toContain("risk-map");
    expect(html).toContain(`data-pick="${anyId}"`);
  });
});

describe("Board", () => {
  it("clicking a territory hit target calls onPick with its id", () => {
    const onPick = vi.fn();
    const { container } = render(
      <Board view={view} onPick={onPick} selected={null} plan={{}} to={null} />,
    );
    const hit = container.querySelector(
      `[data-pick="${anyId}"]`,
    ) as HTMLElement;
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onPick).toHaveBeenCalledWith(anyId);
  });
});
