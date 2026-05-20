// CROSS-BUG-3: AC3 — defender's client picks up pendingCombat and resolves it.
//
// When the server-side view exposes state.pendingCombat (a bot's stored
// intent) and youAre === pendingCombat.defenderIdx, RiskApp must mount
// CombatReveal in `live` mode driving both rolls locally, and on the
// resolved Promise POST `{type: 'attack', payload: {from, to, force,
// resolved: {rounds}}}` so the server's validator/applier finishes the
// combat and clears pendingCombat.
//
// This test fails today because RiskApp has no pendingCombat branch — it
// only mounts CombatReveal when the LOCAL user clicked attack (the `live`
// state) or when a replay signature triggers replay mode.
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { TERRITORIES } from "../../src/clients/risk/map-geometry.js";

type CapturedProps = {
  mode: string;
  from: string;
  to: string;
  force?: number;
  defenders?: number;
  onResolved?: (out: { rounds: { aDice: number[]; dDice: number[] }[]; captured?: boolean; attackerSurvivors?: number; defenderSurvivors?: number }) => void;
};

let captured: CapturedProps | null = null;

vi.mock("../../src/clients/risk/CombatReveal", () => ({
  CombatReveal: (props: CapturedProps) => {
    captured = props;
    return <div data-testid="combat-reveal" data-mode={props.mode} />;
  },
}));

const ids = Object.keys(TERRITORIES);
const territories: Record<string, { owner: 0 | 1; armies: number }> =
  Object.fromEntries(ids.map((id) => [id, { owner: 0, armies: 5 }]));
// Pick a known adjacent pair from the static map — alaska adjacent to nwt.
territories.alaska = { owner: 1, armies: 6 };
territories.nwt = { owner: 0, armies: 3 };

// Bot is currentPlayer (1). Bot attacks from alaska → nwt. Human (youAre=0) is the defender.
const baseView = {
  phase: "attack" as const,
  currentPlayer: 1 as const,
  youAre: 0 as const,
  territories,
  reinforcePool: 0,
  setupPools: [0, 0],
  fortifyUsed: false,
  lastCombat: null,
  winner: null,
  log: [],
  pendingCombat: {
    from: "alaska",
    to: "nwt",
    force: 5,
    attackerIdx: 1 as const,
    defenderIdx: 0 as const,
  },
};

const postSpy = vi.fn();

vi.mock("../../src/clients/shared/useGameState", () => ({
  useGameState: () => ({
    view: baseView,
    status: "live",
    actionError: null,
    post: postSpy,
    ctx: { opponentColor: "#36c", yourColor: "#c33" },
  }),
}));

describe("RiskApp pendingCombat pickup (AC3)", () => {
  it("mounts CombatReveal in live mode for the defender when pendingCombat is set", async () => {
    captured = null;
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    render(<RiskApp />);
    await waitFor(() => expect(captured).not.toBeNull());
    expect(captured!.mode).toBe("live");
    expect(captured!.from).toBe("alaska");
    expect(captured!.to).toBe("nwt");
    expect(captured!.force).toBe(5);
    expect(captured!.defenders).toBe(territories.nwt.armies);
  });

  it("POSTs the resolved attack action when CombatReveal's onResolved fires", async () => {
    captured = null;
    postSpy.mockClear();
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    render(<RiskApp />);
    await waitFor(() => expect(captured).not.toBeNull());

    // Simulate the dice physics settling.
    const resolved = {
      rounds: [{ aDice: [6, 6, 6], dDice: [1, 1] }],
      captured: true,
      attackerSurvivors: 3,
      defenderSurvivors: 0,
    };
    captured!.onResolved!(resolved);

    expect(postSpy).toHaveBeenCalledTimes(1);
    const [action] = postSpy.mock.calls[0];
    expect(action.type).toBe("attack");
    expect(action.payload.from).toBe("alaska");
    expect(action.payload.to).toBe("nwt");
    expect(action.payload.force).toBe(5);
    expect(action.payload.resolved.rounds).toEqual(resolved.rounds);
  });
});
