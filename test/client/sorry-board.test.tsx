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
  // The "Cabinet" redesign draws the board as an inline SVG (Board4P), replacing
  // the earlier baked-image parquet trick. The DOM overlays pieces on top.
  it("renders the board as an inline SVG surface, not a baked board image", () => {
    const { container } = render(
      <Board view={view} onPick={() => {}} />,
    );
    expect(container.querySelector("svg.board-svg")).not.toBeNull();
    expect(container.querySelector("img.board-image")).toBeNull();
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

  it("collapses legal moves that share one destination into a single hotspot", () => {
    // All four Start pawns can come out to the same exit square. They must not
    // stack four identical overlapping hotspots (only the top one was clickable).
    const fourOut = {
      ...view,
      pawns: {
        a: [0, 1, 2, 3].map((id) => ({ id, zone: "start", index: 0 })),
        b: view.pawns.b,
      },
      legalMoves: [0, 1, 2, 3].map((pawnId) => ({
        id: `out:${pawnId}`,
        kind: "out",
        pawnId,
        to: { zone: "track", index: 4 },
      })),
    } as any;
    const onPick = vi.fn();
    const { container } = render(<Board view={fourOut} onPick={onPick} />);
    const targets = container.querySelectorAll(".sorry-target");
    expect(targets.length).toBe(1);
    // Clicking the single hotspot still plays one of the collapsed moves.
    (targets[0] as HTMLElement).dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(onPick).toHaveBeenCalledWith("out:0");
  });

  it("rings the pawns that can move on the player's turn", () => {
    const { container } = render(<Board view={view} onPick={() => {}} />);
    // The one legal move sources pawn a-0, so that pawn is flagged movable.
    expect(container.querySelector('[data-pawn="a-0"].movable')).not.toBeNull();
    // A pawn with no legal move is not flagged.
    expect(container.querySelector('[data-pawn="a-3"].movable')).toBeNull();
  });

  it("renders no decorative stub-player pawns on the 2-player board", () => {
    // The 4-zone board ART stays, but the green/orange "decor" checkers read as
    // fake players on a 2-player game. Only the 8 live red/blue pawns may render.
    const { container } = render(<Board view={view} onPick={() => {}} />);
    expect(container.querySelector(".pawn-decor")).toBeNull();
    expect(container.querySelector(".pawn-green, .pawn-orange")).toBeNull();
    // Every rendered pawn is a live, side-tagged piece.
    expect(container.querySelectorAll(".pawn").length).toBe(8);
  });

  it("renders no legal-move hotspots when the viewer has no legalMoves (not their turn)", () => {
    const idle = { ...view, legalMoves: undefined };
    const { container } = render(
      <Board view={idle} onPick={() => {}} />,
    );
    expect(container.querySelector("[data-pick]")).toBeNull();
  });
});
