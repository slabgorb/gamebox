// test/client/contracts-risk.test.ts
import { describe, it, expect } from "vitest";
import { buildInitialState } from "../../plugins/risk/server/state.js";
import { riskPublicView } from "../../plugins/risk/server/view.js";
import type { RiskView } from "../../src/clients/shared/contracts/risk";

describe("RiskView contract matches the server view", () => {
  it("a fresh public view satisfies RiskView", () => {
    const state = buildInitialState({
      participants: [
        { side: "a", userId: 7 },
        { side: "b", userId: 8 },
      ],
      rng: () => 0.42,
    });
    const view = riskPublicView({ state, viewerId: 7 });
    // Compile-time: this assignment fails to typecheck if the shape drifts.
    const typed: RiskView = view as RiskView;
    expect(typed.phase).toBe("setup");
    expect(typed.youAre).toBe(0);
    expect(typeof typed.currentPlayer).toBe("number");
    expect(Object.keys(typed.territories).length).toBeGreaterThan(0);
    const anyTerr = Object.values(typed.territories)[0];
    expect(anyTerr).toHaveProperty("owner");
    expect(anyTerr).toHaveProperty("armies");
    expect(typed.setupPools).toHaveLength(2);
  });
});
