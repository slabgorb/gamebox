import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { Board } from "../../src/clients/sorry/Board";

// A view with one pawn in each zone per side, and a single legal move so the
// active player has exactly one clickable target.
const view = {
  youAre: "a",
  currentPlayer: "a",
  pawns: {
    a: [
      { id: 0, zone: "start", index: 0 },
      { id: 1, zone: "track", index: 4 },
      { id: 2, zone: "safety", index: 2 },
      { id: 3, zone: "home", index: 0 },
    ],
    b: [
      { id: 0, zone: "track", index: 34 },
      { id: 1, zone: "start", index: 0 },
      { id: 2, zone: "start", index: 0 },
      { id: 3, zone: "start", index: 0 },
    ],
  },
  drawnCard: 1,
  winner: null,
  legalMoves: [
    { id: "out:0", kind: "out", pawnId: 0, to: { zone: "track", index: 4 } },
  ],
} as any;

describe("Sorry Board", () => {
  // User directive: render the board surface as a baked image (parquet trick),
  // not as a per-cell DOM grid.
  it("renders the board from a single baked board image, not a per-cell DOM grid", () => {
    const { container } = render(
      <Board view={view} onPick={() => {}} />,
    );
    const img = container.querySelector(
      "img.board-image",
    ) as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toMatch(/\.(png|jpe?g|webp|avif)$/i);
  });

  it("places all eight pawns, each tagged with its side, zone and index", () => {
    const { container } = render(
      <Board view={view} onPick={() => {}} />,
    );
    expect(container.querySelectorAll("[data-pawn]").length).toBe(8);
    // Placement is data-driven from the public view, not hard-coded.
    expect(
      container.querySelector(
        '[data-pawn="a-1"][data-zone="track"][data-index="4"]',
      ),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-pawn="a-3"][data-zone="home"]'),
    ).not.toBeNull();
    expect(
      container.querySelector('[data-pawn="b-0"][data-zone="track"][data-index="34"]'),
    ).not.toBeNull();
  });

  it("exposes one clickable hotspot per legal move and reports its moveId on click", () => {
    const onPick = vi.fn();
    const { container } = render(
      <Board view={view} onPick={onPick} />,
    );
    const hit = container.querySelector('[data-pick="out:0"]') as HTMLElement;
    expect(hit).not.toBeNull();
    hit.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onPick).toHaveBeenCalledWith("out:0");
  });

  it("renders no legal-move hotspots when the viewer has no legalMoves (not their turn)", () => {
    const idle = { ...view, legalMoves: undefined };
    const { container } = render(
      <Board view={idle} onPick={() => {}} />,
    );
    expect(container.querySelector("[data-pick]")).toBeNull();
  });
});
