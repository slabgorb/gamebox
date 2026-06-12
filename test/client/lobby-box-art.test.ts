import { describe, it, expect } from "vitest";
import {
  boxArt,
  boxArtRisk,
  boxArtCribbage,
  boxArtSorry,
} from "../../public/lobby/box-art.js";

// The lobby renders an illustrated SVG "box lid" per game. Games without a
// dedicated illustration fall back to a blank beige rectangle (200×120). Every
// real illustration is drawn on the shared 420×120 lid canvas, so that canvas
// is what distinguishes "has art" from "beige fallback".
const LID_CANVAS = 'viewBox="0 0 420 120"';
const BEIGE_FALLBACK_CANVAS = 'viewBox="0 0 200 120"';

describe("lobby box art", () => {
  it("draws dedicated art for risk, cribbage and sorry (not the beige fallback)", () => {
    for (const game of ["risk", "cribbage", "sorry"]) {
      const svg = boxArt(game);
      expect(svg).toContain("<svg");
      expect(svg).toContain(LID_CANVAS);
      expect(svg).not.toContain(BEIGE_FALLBACK_CANVAS);
    }
  });

  it("still falls back to the beige lid for an unknown game type", () => {
    const svg = boxArt("nonesuch");
    expect(svg).toContain(BEIGE_FALLBACK_CANVAS);
  });

  it("each new builder returns a distinct, full-canvas SVG string", () => {
    const arts = [boxArtRisk(), boxArtCribbage(), boxArtSorry()];
    for (const svg of arts) {
      expect(svg).toContain("<svg");
      expect(svg).toContain(LID_CANVAS);
    }
    // Distinct illustrations — no two builders return the same markup.
    expect(new Set(arts).size).toBe(3);
  });
});
