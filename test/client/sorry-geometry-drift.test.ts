import { describe, it, expect } from "vitest";
import {
  START as B4P_START,
  HOME as B4P_HOME,
  SAFETY as B4P_SAFETY,
} from "../../src/clients/sorry/Board4P";
import {
  START_CENTER,
  HOME_CELL,
  safetyCells,
} from "../../src/clients/sorry/board-geometry.js";

// Drift guard for the "KEEP THESE CONSTANTS IN SYNC" contract between the drawn
// board (Board4P.tsx) and the pawn overlay geometry (board-geometry.js).
//
// The engine is 2-player (sides a, b); those map onto two diagonally opposite
// drawn quadrants: engine a → visual a (red, top-left), engine b → visual c
// (blue, bottom-right). If START/HOME/SAFETY cells ever drift apart, pawns and
// hotspots land off their drawn circles — exactly the misalignment this checks.
const LIVE_MAP = { a: "a", b: "c" } as const;

describe("Sorry board geometry drift guard", () => {
  for (const [engineSide, visualSide] of Object.entries(LIVE_MAP)) {
    it(`START center for engine ${engineSide} matches drawn START ${visualSide}`, () => {
      expect(START_CENTER[engineSide as "a" | "b"]).toEqual(
        B4P_START[visualSide],
      );
    });

    it(`HOME cell for engine ${engineSide} matches drawn HOME ${visualSide}`, () => {
      expect(HOME_CELL[engineSide as "a" | "b"]).toEqual(B4P_HOME[visualSide]);
    });

    it(`SAFETY cells for engine ${engineSide} match drawn SAFETY ${visualSide}`, () => {
      // board-geometry returns {row, col}; Board4P stores [row, col] tuples.
      const drawn = B4P_SAFETY[visualSide].cells.map(([row, col]) => ({
        row,
        col,
      }));
      expect(safetyCells(engineSide as "a" | "b")).toEqual(drawn);
    });
  }
});
