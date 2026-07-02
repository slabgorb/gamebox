// E7-2 (RED) — bots roll their own dice; drop the human proxy-roll click.
//
// Design decision (see .session/E7-2-session.md → TEA Assessment): option (B),
// CLIENT-side auto-roll. The bot's die is a VISIBLE physics roll, so per the
// project's collapsed-mechanic doctrine ("visible-animation mechanics inline
// client-side; dice values come from client physics, never a server rng") the
// die stays client-rolled. The server is UNCHANGED — it still broadcasts
// clue_roll_request for a bot's values-less roll intent (test/clue-orchestrator
// .test.js:58 and test/clue-e2e-registration.test.js:156 stay green, and
// test/no-server-dice-rng.test.js stays green). The ONLY change is that the
// client auto-fires the roll on receiving the request instead of rendering a
// manual "Roll for {bot} 🎲" button.
//
// These tests fail today: ClueApp renders a proxy button and waits for a human
// click. Tests 1/2/4 drive the new behavior (RED); test 3 is a guard that the
// human's own roll is untouched.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import { __lastEventSource } from "./setup";

// Shared spies + mutable game state, hoisted so the vi.mock factories below
// (which are lifted above imports) can close over them.
const H = vi.hoisted(() => ({
  rollSpy: vi.fn<(count: number) => Promise<number[]>>(),
  postSpy: vi.fn<(action: unknown) => Promise<void>>(),
  view: null as unknown,
  ctx: null as unknown,
}));

// DiceTray is a three.js ref-handle component — mock it with a controllable
// imperative `roll()` so we observe whether the client drives the die.
vi.mock("../../src/clients/shared/DiceTray", async () => {
  const React = await import("react");
  return {
    DiceTray: React.forwardRef(function MockDiceTray(
      _props: unknown,
      ref: React.Ref<unknown>,
    ) {
      React.useImperativeHandle(ref, () => ({ roll: H.rollSpy }), []);
      return React.createElement("div", { "data-testid": "mock-dicetray" });
    }),
  };
});

// Heavy / EventSource-owning children the roll flow does not exercise.
vi.mock("../../src/clients/clue/Board", () => ({
  Board: () => null,
}));
vi.mock("../../src/clients/shared/AiRoster", () => ({
  AiRoster: () => null,
}));

vi.mock("../../src/clients/shared/useGameState", () => ({
  useGameState: () => ({
    view: H.view,
    status: "live",
    actionError: null,
    post: H.postSpy,
    ctx: H.ctx,
  }),
}));

const ME = 100;
const BOT = 200;
const HUMAN_B = 300;
const BOT_SEAT = 1;
const SUSPECTS = ["scarlett", "mustard", "white"];

const players = [
  { seat: 0, userId: ME, isBot: false, friendlyName: "Me", personaId: null, color: "#111", glyph: "" },
  { seat: 1, userId: BOT, isBot: true, friendlyName: "Miss Scarlett", personaId: "miss-scarlett", color: "#c22", glyph: "" },
  { seat: 2, userId: HUMAN_B, isBot: false, friendlyName: "Human B", personaId: null, color: "#22c", glyph: "" },
];

const baseCtx = { sseUrl: "/sse", gameId: "g1", userId: ME, players };

// A view where the BOT (seat 1) is on turn at the top of its move (die unrolled
// and awaiting resolution). This is the state in which clue_roll_request lands.
function botAwaitingRollView() {
  return {
    phase: "move",
    currentSeat: BOT_SEAT,
    activeUserId: BOT, // the bot is active — not me
    youAreSeat: 0,
    pendingRoll: null,
    seats: [0, 1, 2],
    seatSuspect: SUSPECTS,
    eliminated: [false, false, false],
    pawns: {},
    movement: null,
    winnerSeat: null,
    hand: [],
    ledger: [],
    log: [],
  };
}

// A view where I (seat 0) am on turn and must roll my own die.
function myOwnRollView() {
  return {
    phase: "move",
    currentSeat: 0,
    activeUserId: ME,
    youAreSeat: 0,
    pendingRoll: null,
    seats: [0, 1, 2],
    seatSuspect: SUSPECTS,
    eliminated: [false, false, false],
    pawns: {},
    movement: { needsRoll: true, secretPassage: null },
    winnerSeat: null,
    hand: [],
    ledger: [],
    log: [],
  };
}

function emit(type: string, data: unknown) {
  const es = __lastEventSource.get() as unknown as {
    _emit: (t: string, d: unknown) => void;
  } | null;
  if (!es) throw new Error("no EventSource created by ClueApp");
  act(() => es._emit(type, data));
}

async function renderClueApp() {
  const { ClueApp } = await import("../../src/clients/clue/ClueApp");
  return render(<ClueApp />);
}

beforeEach(() => {
  __lastEventSource.set(null);
  H.rollSpy.mockReset();
  H.rollSpy.mockResolvedValue([4]);
  H.postSpy.mockReset();
  H.postSpy.mockResolvedValue(undefined);
  H.ctx = baseCtx;
});

describe("E7-2: bot rolls its own die (client auto-roll, no human proxy)", () => {
  it("AC1: auto-rolls and POSTs the bot's die on clue_roll_request — no human click", async () => {
    H.view = botAwaitingRollView();
    await renderClueApp();

    emit("clue_roll_request", { seat: BOT_SEAT, personaId: "miss-scarlett" });

    // The client must drive the physics die itself and POST the resolved value
    // AS the bot — with zero user interaction.
    await waitFor(() => expect(H.rollSpy).toHaveBeenCalledWith(1));
    await waitFor(() => expect(H.postSpy).toHaveBeenCalledTimes(1));
    const [action] = H.postSpy.mock.calls[0];
    expect(action).toEqual({ type: "roll", payload: { value: 4 } });
  });

  it("AC1: the manual 'Roll for {bot}' proxy button no longer renders", async () => {
    H.view = botAwaitingRollView();
    await renderClueApp();

    emit("clue_roll_request", { seat: BOT_SEAT, personaId: "miss-scarlett" });

    // Give any (incorrect) manual-button render a chance to appear.
    await waitFor(() => expect(H.rollSpy).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: /Roll for/i })).toBeNull();
  });

  it("AC3 guard: the human's OWN roll is unchanged — manual button, no auto-fire", async () => {
    H.view = myOwnRollView();
    await renderClueApp();

    // My own turn shows a manual roll button and must NOT auto-fire — the
    // human still throws their own visible die.
    expect(screen.getByRole("button", { name: /Roll the die/i })).toBeInTheDocument();
    // Let any errant auto-roll effect flush.
    await act(async () => { await Promise.resolve(); });
    expect(H.rollSpy).not.toHaveBeenCalled();
    expect(H.postSpy).not.toHaveBeenCalled();
  });

  it("AC4 + TS#6: auto-roll fires exactly once and the prompt self-clears (no re-fire loop)", async () => {
    H.view = botAwaitingRollView();
    await renderClueApp();

    emit("clue_roll_request", { seat: BOT_SEAT, personaId: "miss-scarlett" });
    await waitFor(() => expect(H.postSpy).toHaveBeenCalledTimes(1));

    // After the die settles the request is consumed: the tray/prompt must
    // disappear (no orphaned clue_roll_request) and the effect must not loop
    // and POST again.
    await waitFor(() => expect(screen.queryByTestId("dice-tray")).toBeNull());
    await act(async () => { await Promise.resolve(); });
    expect(H.postSpy).toHaveBeenCalledTimes(1);
  });
});
