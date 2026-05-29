import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { Board } from "../../src/clients/sorry/Board";
import { Board4P } from "../../src/clients/sorry/Board4P";

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

  it("parks leftover start pawns centered, not slumped to the bottom", () => {
    // Only the higher-id pawns (2,3) remain in Start. They must straddle the
    // circle centre, not both land in the bottom row.
    const v = {
      ...view,
      currentPlayer: "b",
      pawns: {
        a: [
          { id: 0, zone: "track", index: 4 },
          { id: 1, zone: "track", index: 5 },
          { id: 2, zone: "start", index: 0 },
          { id: 3, zone: "start", index: 0 },
        ],
        b: view.pawns.b,
      },
      legalMoves: undefined,
    } as any;
    const { container } = render(<Board view={v} onPick={() => {}} />);
    const p2 = container.querySelector('[data-pawn="a-2"]') as HTMLElement;
    const p3 = container.querySelector('[data-pawn="a-3"]') as HTMLElement;
    const centerTopPct = (310 / 1600) * 100; // START a row 2.6 → y=310px
    expect((parseFloat(p2.style.top) + parseFloat(p3.style.top)) / 2).toBeCloseTo(centerTopPct, 1);
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

  // Viewer-relative colour: the human is always red at the bottom — "no longer
  // playing blue". The viewer's engine side gets the red checker, the opponent
  // blue, regardless of which engine side the viewer is.
  const checkerSrc = (container: HTMLElement, pawn: string) =>
    container
      .querySelector(`[data-pawn="${pawn}"] img`)
      ?.getAttribute("src") ?? "";

  it("paints the viewer's pawns red and the opponent's blue (viewer = a)", () => {
    const { container } = render(<Board view={view} onPick={() => {}} />);
    expect(checkerSrc(container, "a-0")).toContain("checker-red");
    expect(checkerSrc(container, "b-0")).toContain("checker-blue");
  });

  // The seat circle must match the pawns sitting on it: engine a is drawn at the
  // top seat, b at the bottom. For viewer a (red), the top seat circle must be
  // red so a's red pawns don't land on a blue circle; for viewer b it flips.
  const circleFill = (container: HTMLElement, seat: string) =>
    container
      .querySelector(`[data-testid="start-circle-${seat}"]`)
      ?.getAttribute("fill") ?? "";
  const RED_MID = "#b8332a";
  const BLUE_MID = "#2c647f";

  it("paints the viewer's seat circle red and the opponent's blue (viewer = a)", () => {
    const { container } = render(<Board view={view} onPick={() => {}} />);
    expect(circleFill(container, "top")).toBe(RED_MID); // engine a → top seat
    expect(circleFill(container, "bottom")).toBe(BLUE_MID);
  });

  it("paints the viewer's seat circle red and the opponent's blue (viewer = b)", () => {
    const asB = { ...view, youAre: "b" } as any;
    const { container } = render(<Board view={asB} onPick={() => {}} />);
    expect(circleFill(container, "bottom")).toBe(RED_MID); // engine b → bottom seat
    expect(circleFill(container, "top")).toBe(BLUE_MID);
  });

  it("paints the viewer's pawns red and the opponent's blue (viewer = b)", () => {
    const asB = { ...view, youAre: "b" } as any;
    const { container } = render(<Board view={asB} onPick={() => {}} />);
    expect(checkerSrc(container, "b-0")).toContain("checker-red");
    expect(checkerSrc(container, "a-0")).toContain("checker-blue");
  });

  it("renders no legal-move hotspots when the viewer has no legalMoves (not their turn)", () => {
    const idle = { ...view, legalMoves: undefined };
    const { container } = render(
      <Board view={idle} onPick={() => {}} />,
    );
    expect(container.querySelector("[data-pick]")).toBeNull();
  });

  // Viewer-relative orientation: the human's colour is always anchored at the
  // bottom. Side a starts on the top edge, so its viewer sees the whole surface
  // (SVG board + pawn overlay, rotated as one unit so they stay aligned) flipped
  // 180°. Side b is already the bottom seat, so its board stays upright.
  it("flips the whole board surface 180° for side a, so the human sits at the bottom", () => {
    const { container } = render(<Board view={view} onPick={() => {}} />);
    const surface = container.querySelector(".board-surface") as HTMLElement;
    expect(surface.style.transform).toContain("rotate(180deg)");
  });

  it("leaves the board surface upright for side b (already the bottom seat)", () => {
    const asB = { ...view, youAre: "b" } as any;
    const { container } = render(<Board view={asB} onPick={() => {}} />);
    const surface = container.querySelector(".board-surface") as HTMLElement;
    expect(surface.style.transform).not.toContain("180deg");
  });

  it("keeps the neutral centre wordmark upright when the board is flipped", () => {
    // Per-seat furniture (START/SAFETY) legitimately flips to face each seat,
    // but the central SORRY! medallion is neutral chrome — it counter-rotates so
    // it never reads upside-down to the side-a viewer.
    const { container } = render(<Board view={view} onPick={() => {}} />);
    const medallion = container.querySelector(
      '[data-testid="board-medallion"]',
    ) as SVGGElement;
    expect(medallion).not.toBeNull();
    expect(medallion.getAttribute("transform")).toContain("rotate(-180");
  });

  // The brainstorm chose all-upright labels (legibility) over per-seat flipping.
  // Each START label counter-rotates by -rotation so it survives the board flip.
  const SEATS = ["top", "right", "bottom", "left"] as const;
  const labelTransform = (container: HTMLElement, seat: string) =>
    container
      .querySelector(`[data-testid="start-label-${seat}"]`)
      ?.getAttribute("transform") ?? "";

  it("draws all four START labels upright when the board is unrotated", () => {
    const { container } = render(<Board4P />);
    for (const seat of SEATS) {
      const t = labelTransform(container, seat);
      expect(t).toContain("rotate(0");
      expect(t).not.toContain("rotate(180");
    }
  });

  it("counter-rotates every START label so none reads upside-down under the flip", () => {
    const { container } = render(<Board4P rotation={180} />);
    for (const seat of SEATS) {
      expect(labelTransform(container, seat)).toContain("rotate(-180");
    }
  });
});
