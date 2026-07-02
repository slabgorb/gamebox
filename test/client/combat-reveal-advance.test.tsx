// E5-10: CombatReveal integration — after an interactive (human-attacker)
// capture, the advance chooser gates onResolved; the chosen count rides the
// resolved payload as `advanceCount`. Non-interactive resolutions (defender
// proxying a bot's attack) never see a chooser and post no advanceCount —
// the server applies the bot's default policy.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { CombatReveal } from "../../src/clients/risk/CombatReveal";

// force 4 vs 2 defenders with these rolls: one round, [6,6,6] vs [1,1],
// captured with 0 attacker losses → survivors 4, winning dice 3 → range [3,4].
const sweepRolls = {
  rollAttacker: async (n: number) => Array(n).fill(6),
  rollDefender: async (n: number) => Array(n).fill(1),
};

function liveProps(overrides: Record<string, unknown> = {}) {
  return {
    mode: "live" as const,
    from: "A",
    to: "B",
    force: 4,
    defenders: 2,
    attackerColor: "#c33",
    defenderColor: "#36c",
    ...sweepRolls,
    ...overrides,
  };
}

describe("CombatReveal interactive capture (human attacker)", () => {
  it("holds onResolved until the advance is chosen, then includes advanceCount", async () => {
    const onResolved = vi.fn();
    render(<CombatReveal {...liveProps({ interactive: true })} onResolved={onResolved} />);

    // The chooser appears once the capture resolves...
    const slider = await screen.findByRole("slider");
    expect(slider).toHaveAttribute("min", "3");
    expect(slider).toHaveAttribute("max", "4");
    // ...and the resolved payload has NOT been posted yet.
    expect(onResolved).not.toHaveBeenCalled();

    fireEvent.change(slider, { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /advance/i }));

    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    const out = onResolved.mock.calls[0][0];
    expect(out.captured).toBe(true);
    expect(out.advanceCount).toBe(3);
  });

  it("repulse shows no chooser and resolves immediately", async () => {
    const onResolved = vi.fn();
    render(
      <CombatReveal
        {...liveProps({
          interactive: true,
          force: 2, // 1 attack die vs 2 defender dice — guaranteed repulse
          rollAttacker: async (n: number) => Array(n).fill(1),
          rollDefender: async (n: number) => Array(n).fill(6),
        })}
        onResolved={onResolved}
      />,
    );
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    const out = onResolved.mock.calls[0][0];
    expect(out.captured).toBe(false);
    expect(out.advanceCount).toBeUndefined();
    expect(screen.queryByRole("slider")).toBeNull();
  });
});

describe("CombatReveal non-interactive capture (defender resolving a bot attack)", () => {
  it("resolves immediately with no chooser and no advanceCount", async () => {
    const onResolved = vi.fn();
    render(<CombatReveal {...liveProps()} onResolved={onResolved} />);
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    const out = onResolved.mock.calls[0][0];
    expect(out.captured).toBe(true);
    expect(out.advanceCount).toBeUndefined();
    expect(screen.queryByRole("slider")).toBeNull();
  });
});
