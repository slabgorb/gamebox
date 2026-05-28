import { describe, it, expect } from "vitest";
import {
  SLIDES as ENGINE_SLIDES,
  TRACK_LEN,
} from "../../plugins/sorry/server/geometry.js";
import {
  SLIDES as MIRROR_SLIDES,
  slideSegments,
  trackCell,
} from "../../src/clients/sorry/board-geometry.js";

// The drawn slide arrows MUST land on the engine's actual slide squares,
// otherwise a pawn lands on a painted arrow and nothing slides ("slides not
// working"). The engine (geometry.js) is authoritative; the board derives its
// slides from the same data so the two can never drift.
describe("Sorry slide geometry", () => {
  it("board-geometry's SLIDES mirror matches the engine exactly", () => {
    expect(MIRROR_SLIDES).toEqual(ENGINE_SLIDES);
  });

  it("draws exactly the engine's slides — one segment per engine slide", () => {
    const engineCount = ENGINE_SLIDES.a.length + ENGINE_SLIDES.b.length;
    expect(slideSegments()).toHaveLength(engineCount);
  });

  it("each drawn segment runs from the slide's start square to its end square", () => {
    const segs = slideSegments();
    for (const side of ["a", "b"] as const) {
      for (const slide of ENGINE_SLIDES[side]) {
        const from = trackCell(slide.start);
        const to = trackCell((slide.start + slide.length) % TRACK_LEN);
        const match = segs.find(
          (s) =>
            s.side === side &&
            s.from[0] === from.row &&
            s.from[1] === from.col &&
            s.to[0] === to.row &&
            s.to[1] === to.col,
        );
        expect(
          match,
          `missing drawn slide for engine ${side} start ${slide.start}`,
        ).toBeTruthy();
      }
    }
  });

  it("draws no slides off the top/bottom edges (the engine has none there)", () => {
    // All engine slides live on row 0 (top) or row 15 (bottom). A painted arrow
    // anywhere else is a lie — a pawn would land on it and not slide.
    for (const s of slideSegments()) {
      expect([0, 15]).toContain(s.from[0]);
      expect([0, 15]).toContain(s.to[0]);
    }
  });
});
