import { describe, it, expect } from "vitest";
import {
  adjust,
  placed,
  remaining,
  isComplete,
} from "../../src/clients/risk/deploy-plan";

describe("deploy-plan", () => {
  it("placed sums the allocation; remaining is pool minus placed", () => {
    expect(placed({})).toBe(0);
    expect(remaining({}, 20)).toBe(20);
    expect(placed({ ALA: 3, URA: 5 })).toBe(8);
    expect(remaining({ ALA: 3, URA: 5 }, 20)).toBe(12);
  });
  it("adjust adds armies to a territory", () => {
    const p = adjust({}, "ALA", 1, 20);
    expect(p).toEqual({ ALA: 1 });
    expect(adjust(p, "ALA", 1, 20)).toEqual({ ALA: 2 });
  });
  it("adjust does not mutate the input plan", () => {
    const p = { ALA: 1 };
    adjust(p, "ALA", 1, 20);
    expect(p).toEqual({ ALA: 1 });
  });
  it("adjust caps the total at the pool, never overspends", () => {
    const p = adjust({ ALA: 18 }, "URA", 5, 20);
    expect(placed(p)).toBe(20);
    expect(p.URA).toBe(2);
  });
  it("adjust full pool onto a fresh territory is clamped", () => {
    expect(adjust({}, "ALA", 99, 20)).toEqual({ ALA: 20 });
  });
  it("adjust down clamps at zero and drops the key", () => {
    expect(adjust({ ALA: 2 }, "ALA", -1, 20)).toEqual({ ALA: 1 });
    expect(adjust({ ALA: 1 }, "ALA", -1, 20)).toEqual({});
    expect(adjust({ ALA: 1 }, "ALA", -5, 20)).toEqual({});
    expect(adjust({}, "ALA", -1, 20)).toEqual({});
  });
  it("isComplete only when the whole pool is spent", () => {
    expect(isComplete({}, 20)).toBe(false);
    expect(isComplete({ ALA: 19 }, 20)).toBe(false);
    expect(isComplete({ ALA: 12, URA: 8 }, 20)).toBe(true);
    expect(isComplete({}, 0)).toBe(false);
  });
});
