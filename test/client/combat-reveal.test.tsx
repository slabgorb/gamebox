import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CombatReveal } from "../../src/clients/risk/CombatReveal";

describe("CombatReveal live mode", () => {
  it("drives the combat and calls onResolved with the posted outcome", async () => {
    const onResolved = vi.fn();
    render(
      <CombatReveal
        mode="live"
        from="A"
        to="B"
        force={4}
        defenders={2}
        attackerColor="#c33"
        defenderColor="#36c"
        // injected deterministic rolls so the test is stable
        rollAttacker={async (n: number) => Array(n).fill(6)}
        rollDefender={async (n: number) => Array(n).fill(1)}
        onResolved={onResolved}
      />,
    );
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    const out = onResolved.mock.calls[0][0];
    expect(out.captured).toBe(true);
    expect(out.rounds.length).toBeGreaterThan(0);
    expect(screen.getByText(/captured/i)).toBeInTheDocument();
  });
});

describe("CombatReveal replay mode", () => {
  it("steps recorded rounds and shows the result", async () => {
    vi.useFakeTimers();
    render(
      <CombatReveal
        mode="replay"
        from="A"
        to="B"
        attackerColor="#c33"
        defenderColor="#36c"
        rounds={[
          { aDice: [6, 6], dDice: [1] },
          { aDice: [6], dDice: [2] },
        ]}
        captured
      />,
    );
    await vi.runAllTimersAsync();
    expect(screen.getByText(/captured/i)).toBeInTheDocument();
    vi.useRealTimers();
  });
});
