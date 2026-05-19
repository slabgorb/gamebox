import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
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

describe("Board", () => {
  it("renders an SVG with a hit hotspot for every territory", () => {
    const { container } = render(
      <Board view={view} onPick={() => {}} selected={null} plan={{}} to={null} />,
    );
    expect(container.querySelector("svg.risk-map")).not.toBeNull();
    for (const id of Object.keys(TERRITORIES)) {
      expect(container.querySelector(`[data-pick="${id}"]`)).not.toBeNull();
    }
  });

  it("clicking a hit hotspot calls onPick with its id", () => {
    const onPick = vi.fn();
    const { container } = render(
      <Board view={view} onPick={onPick} selected={null} plan={{}} to={null} />,
    );
    const hit = container.querySelector(`[data-pick="${anyId}"]`) as SVGElement;
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onPick).toHaveBeenCalledWith(anyId);
  });
});
