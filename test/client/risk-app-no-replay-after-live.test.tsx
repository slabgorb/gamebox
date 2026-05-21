// Regression for CROSS-BUG-3 follow-up: when the local player resolves
// a combat live (either as attacker, or as defender driving a bot's
// pending attack), the *next* render must not mount CombatReveal in
// `replay` mode. Replay can't reproduce the dice throwParams, so it
// would re-render with random-faced 3D dice while the chronicle shows
// the correct values — visible as "AI rolls don't line up with the
// reported rolls."
//
// The fix: when posting the resolved payload, pre-seed the
// replay-suppression signature so shouldReplay() returns false for the
// signature that's about to land.
import { describe, it, expect, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { TERRITORIES } from "../../src/clients/risk/map-geometry.js";

type CapturedProps = {
  mode: string;
  from: string;
  to: string;
  force?: number;
  defenders?: number;
  onResolved?: (out: {
    rounds: { aDice: number[]; dDice: number[] }[];
    captured?: boolean;
    attackerSurvivors?: number;
    defenderSurvivors?: number;
  }) => void;
};

const mounts: CapturedProps[] = [];

vi.mock("../../src/clients/risk/CombatReveal", () => ({
  CombatReveal: (props: CapturedProps) => {
    mounts.push(props);
    return <div data-testid="combat-reveal" data-mode={props.mode} />;
  },
}));

const ids = Object.keys(TERRITORIES);
const territories: Record<string, { owner: 0 | 1; armies: number }> =
  Object.fromEntries(ids.map((id) => [id, { owner: 0, armies: 5 }]));
// alaska and nwt are adjacent in the static map.
territories.alaska = { owner: 1, armies: 6 };
territories.nwt = { owner: 0, armies: 3 };

// Stateful view container so re-renders can flip pendingCombat → lastCombat
// to simulate the server applying the resolved payload.
let view: any = {
  phase: "attack",
  currentPlayer: 1,
  youAre: 0,
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
    attackerIdx: 1,
    defenderIdx: 0,
  },
};

const postSpy = vi.fn();

vi.mock("../../src/clients/shared/useGameState", () => ({
  useGameState: () => ({
    view,
    status: "live",
    actionError: null,
    post: postSpy,
    ctx: { opponentColor: "#36c", yourColor: "#c33" },
  }),
}));

describe("RiskApp — no replay after local-resolved combat", () => {
  it("does not mount a replay CombatReveal after the defender's live resolve", async () => {
    mounts.length = 0;
    postSpy.mockClear();
    const { RiskApp } = await import("../../src/clients/risk/RiskApp");
    const { rerender } = render(<RiskApp />);
    await waitFor(() => expect(mounts.length).toBeGreaterThan(0));

    // First mount: live combat reveal driven by the defender.
    const live = mounts.find((m) => m.mode === "live");
    expect(live).toBeTruthy();

    // Simulate dice physics settling and the user's client POSTing.
    const resolved = {
      rounds: [{ aDice: [6, 6, 6], dDice: [1, 1] }],
      captured: true,
      attackerSurvivors: 3,
      defenderSurvivors: 0,
    };
    live!.onResolved!(resolved);

    // Server applies: pendingCombat clears, lastCombat is set with the
    // exact same fields the client predicted. Flip the view shape and
    // force a re-render — the replay branch must NOT fire.
    view = {
      ...view,
      pendingCombat: undefined,
      lastCombat: {
        from: "alaska",
        to: "nwt",
        force: 5,
        rounds: resolved.rounds,
        captured: true,
        attackerSurvivors: 3,
        defenderSurvivors: 0,
      },
      log: [
        {
          kind: "attack",
          player: 1,
          from: "alaska",
          to: "nwt",
          force: 5,
          captured: true,
        },
      ],
    };
    mounts.length = 0;
    rerender(<RiskApp />);
    await waitFor(() => {
      // Either nothing mounted (clean re-render) or only non-replay mounts.
      const replayMount = mounts.find((m) => m.mode === "replay");
      expect(replayMount).toBeUndefined();
    });
  });
});
