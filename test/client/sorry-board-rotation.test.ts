import { describe, it, expect } from "vitest";
import { boardRotation } from "../../src/clients/sorry/board-geometry.js";

// Viewer-relative orientation: the human's colour is always anchored at the
// bottom. The board is 180° point-symmetric (side a's start hugs the top edge,
// side b's the bottom edge), so anchoring the viewer at the bottom is a clean
// 0°/180° flip — no cell-grid redraw needed.
describe("Sorry viewer-relative board rotation", () => {
  it("leaves the board upright for side b (already the bottom seat)", () => {
    expect(boardRotation("b")).toBe(0);
  });

  it("flips 180° for side a so the human sits at the bottom", () => {
    expect(boardRotation("a")).toBe(180);
  });

  it("keeps the default orientation for a spectator (no seat)", () => {
    expect(boardRotation(null)).toBe(0);
    expect(boardRotation(undefined)).toBe(0);
  });
});
