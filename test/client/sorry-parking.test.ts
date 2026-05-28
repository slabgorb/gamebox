import { describe, it, expect } from "vitest";
import {
  parkCenter,
  START_CENTER,
  HOME_CELL,
  CELL,
} from "../../src/clients/sorry/board-geometry.js";

// Parked pawns (in START or HOME) must form a cluster CENTERED on the circle,
// regardless of how many are parked or which pawn ids they are. The old layout
// keyed slots to permanent pawn id, so when ids 2 & 3 were the ones home they
// both landed in the bottom row and the cluster slumped low / spilled out.
function centroid(points: { x: number; y: number }[]) {
  const n = points.length;
  return {
    x: points.reduce((s, p) => s + p.x, 0) / n,
    y: points.reduce((s, p) => s + p.y, 0) / n,
  };
}

describe("Sorry start/home pawn parking", () => {
  for (const side of ["a", "b"] as const) {
    for (const [zone, base] of [
      ["start", START_CENTER],
      ["home", HOME_CELL],
    ] as const) {
      const center = { x: (base[side].col + 0.5) * CELL, y: (base[side].row + 0.5) * CELL };

      for (const count of [1, 2, 3, 4]) {
        it(`centers ${count} ${zone} pawn(s) on the ${side} circle`, () => {
          const pts = Array.from({ length: count }, (_, rank) =>
            parkCenter(side, zone, rank, count),
          );
          const c = centroid(pts);
          expect(c.x).toBeCloseTo(center.x, 6);
          expect(c.y).toBeCloseTo(center.y, 6);
        });
      }

      it(`gives 4 ${zone} pawns four distinct, in-bounds slots on ${side}`, () => {
        const pts = Array.from({ length: 4 }, (_, rank) => parkCenter(side, zone, rank, 4));
        const keys = new Set(pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
        expect(keys.size).toBe(4); // no two pawns share a slot
        // every parked pawn stays comfortably within its circle (< 0.7 cell from center)
        for (const p of pts) {
          expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeLessThan(0.7 * CELL);
        }
      });
    }
  }
});
