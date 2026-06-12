import { describe, it, expect } from "vitest";
import { boardRotation, seatColors } from "../../src/clients/sorry/board-geometry.js";

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

// seatColors colours the four drawn seats from the engine-side assignment:
// engine a is the top seat, engine b the bottom, and the two unused palette
// colours decorate the sides. (Viewer anchoring is boardRotation's job.)
describe("Sorry seat colour assignment", () => {
  it("maps engine a to the top seat and b to the bottom, unused colours to the sides", () => {
    expect(seatColors({ a: "green", b: "orange" })).toEqual({
      top: "green", bottom: "orange", right: "red", left: "blue",
    });
  });

  it("defaults to red(a)/blue(b) for legacy games with no colors", () => {
    expect(seatColors(undefined)).toEqual({
      top: "red", bottom: "blue", right: "green", left: "orange",
    });
  });
});
