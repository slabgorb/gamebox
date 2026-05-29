import { describe, it, expect } from "vitest";
import {
  START_CENTER,
  HOME_CELL,
  safetyCells,
} from "../../src/clients/sorry/board-geometry.js";

// Canonical pinwheel spec (from the approved brainstorm mock, ._mock_gen_reference.js).
// One reference side is rotated 90°×k for the four seats; the two live engine
// sides occupy opposite top/bottom seats:
//
//   engine a → TOP seat (blue, opponent)  = reference at k=0
//   engine b → BOTTOM seat (red, you)     = reference rotated 180° (k=2)
//
// Reference side furniture (cell coords on the 16×16 grid):
//   start circle centre (col 4,  row 2.6)
//   home star          (col 1,  row 6.6)
//   safety lane        col 1, rows 1..5 (entry→home)
//
// Rotating 180° about the board centre (col 7.5, row 7.5) maps each to its
// bottom-seat twin: row→15-row, col→15-col.
describe("Sorry canonical pinwheel geometry", () => {
  it("places engine a (top seat) at the reference position", () => {
    expect(START_CENTER.a).toEqual({ row: 2.6, col: 4 });
    expect(HOME_CELL.a).toEqual({ row: 6.6, col: 1 });
    expect(safetyCells("a")).toEqual([
      { row: 1, col: 1 },
      { row: 2, col: 1 },
      { row: 3, col: 1 },
      { row: 4, col: 1 },
      { row: 5, col: 1 },
    ]);
  });

  it("places engine b (bottom seat) at the 180° twin of the reference", () => {
    expect(START_CENTER.b).toEqual({ row: 12.4, col: 11 });
    expect(HOME_CELL.b).toEqual({ row: 8.4, col: 14 });
    expect(safetyCells("b")).toEqual([
      { row: 14, col: 14 },
      { row: 13, col: 14 },
      { row: 12, col: 14 },
      { row: 11, col: 14 },
      { row: 10, col: 14 },
    ]);
  });
});
