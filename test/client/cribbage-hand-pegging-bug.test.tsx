// CROSS-BUG-1 regression: player hand intermittently invisible during
// pegging. Root cause hypothesis: `CribbageApp.tsx` silently falls back
// to `myHand = []` when `view.hands[mySide]` is not a `Card[]`. The
// running total keeps ticking from `view.pegging.running`, so the user
// sees the count advance while their cards disappear.
//
// These tests assert the *observable contract* of the post-fix code:
// when the view shape is unexpected during pegging, the app must NOT
// silently render an empty hand row. The Dev may satisfy this by
// caching the previous valid hand, rendering face-down placeholders,
// surfacing a recovery hint, or logging an error — any of those is a
// valid green path.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, waitFor, fireEvent, act } from "@testing-library/react";

vi.mock("../../src/clients/shared/card-assets", () => ({
  cardImageUrl: (c: { suit: string; rank: string }) => `/cards/${c.suit}-${c.rank}.jpg`,
  backImageUrl: () => "/cards/back.png",
}));

const { playMock, playForScoreMock, primeAudioMock } = vi.hoisted(() => ({
  playMock: vi.fn(),
  playForScoreMock: vi.fn(),
  primeAudioMock: vi.fn(),
}));
vi.mock("../../src/clients/cribbage/sounds", () => ({
  play: playMock,
  playForScore: playForScoreMock,
  primeAudio: primeAudioMock,
  isMuted: () => false,
  toggleMuted: () => false,
}));

import { CribbageApp } from "../../src/clients/cribbage/CribbageApp";

const MY_HAND = [
  { rank: "A", suit: "H", id: 1 },
  { rank: "5", suit: "H", id: 2 },
  { rank: "T", suit: "S", id: 3 },
  { rank: "Q", suit: "D", id: 4 },
];

type HandShape = "array" | "count";

function peggingView(myHandShape: HandShape, running = 12) {
  return {
    matchTarget: 121,
    dealNumber: 1,
    phase: "pegging" as const,
    dealer: 0,
    deck: { count: 40 },
    hands: [
      myHandShape === "array"
        ? MY_HAND
        : ({ count: MY_HAND.length } as { count: number }),
      { count: 4 },
    ],
    pendingDiscards: [null, null],
    crib: { count: 0 },
    starter: null,
    pegging: { running, history: [], lastTrick: null },
    scores: [0, 0],
    prevScores: [0, 0],
    showBreakdown: null,
    acknowledged: [false, false],
    sides: { a: 42, b: 99 },
    activeUserId: 42,
    endedReason: null,
    winnerSide: null,
  };
}

beforeEach(() => {
  (window as any).__GAME__ = {
    gameId: 7,
    userId: 42,
    gameType: "cribbage",
    sseUrl: "/sse/g/7",
    actionUrl: "/api/games/7/actions",
    stateUrl: "/api/games/7/state",
    yourFriendlyName: "Me",
    yourColor: "#3b82f6",
    opponentFriendlyName: "Bot",
    opponentColor: "#f59e0b",
    opponentPersonaId: "amos",
    opponentGlyph: "?",
  };
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CribbageApp pegging — player hand visibility (CROSS-BUG-1)", () => {
  it("renders all 4 player cards in the pegging hand row when hands[mySide] is Card[]", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/games/7/state") {
          return new Response(JSON.stringify({ state: peggingView("array") }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(null, { status: 200 });
      }),
    );
    const { container } = render(<CribbageApp />);
    await waitFor(() => {
      const handCards = container.querySelectorAll(".hand-row--me img.card");
      expect(handCards.length).toBe(MY_HAND.length);
    });
  });

  it("does NOT silently render an empty hand row when hands[mySide] arrives as {count: N} during pegging", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/games/7/state") {
          return new Response(JSON.stringify({ state: peggingView("count") }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(null, { status: 200 });
      }),
    );
    const { container } = render(<CribbageApp />);

    // The pegging strip renders fine — the totem & running count tick
    // up regardless of hand shape — so the user thinks the game works.
    await waitFor(() => {
      expect(container.querySelector(".pegging__totem")).not.toBeNull();
    });

    const handRow = container.querySelector(".hand-row--me");
    expect(handRow).not.toBeNull();

    const handCards = handRow!.querySelectorAll("img.card");
    const recoveryHint = handRow!.querySelector('[data-state="hand-unknown"]');

    // Post-fix contract: hand row must show *some* signal — real cards,
    // face-down placeholders, or an explicit recovery hint. Silent empty
    // is what makes the bug invisible to the user.
    expect(handCards.length > 0 || recoveryHint !== null).toBe(true);
  });

  it("logs an observable signal (console.error) when hands[mySide] shape is unexpected during pegging", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/games/7/state") {
          return new Response(JSON.stringify({ state: peggingView("count") }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(null, { status: 200 });
      }),
    );
    const { container } = render(<CribbageApp />);
    await waitFor(() => {
      expect(container.querySelector(".pegging__totem")).not.toBeNull();
    });

    // Filter out unrelated React warnings (act, missing-key, etc.) — we
    // want a signal that *the app itself* noticed the shape mismatch.
    const relevant = errSpy.mock.calls.filter((call) => {
      const text = call.map((a) => String(a)).join(" ");
      return /pegging|hand|view shape|CribbageApp|hands\[/i.test(text);
    });
    expect(relevant.length).toBeGreaterThan(0);
    errSpy.mockRestore();
  });

  it("keeps the player hand visible across a resync that returns a transient masked-hand view", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/games/7/state") {
          call += 1;
          // First resync: canonical 4-card hand.
          // Second resync (triggered by a play): the transient masked-hand
          // view that reproduces the production symptom.
          const shape: HandShape = call === 1 ? "array" : "count";
          return new Response(JSON.stringify({ state: peggingView(shape) }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (init?.method === "POST") {
          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(null, { status: 200 });
      }),
    );

    const { container } = render(<CribbageApp />);

    const playableCards = await waitFor(() => {
      const cards = container.querySelectorAll(".hand-row--me img.card");
      if (cards.length !== MY_HAND.length) throw new Error("hand not rendered yet");
      return cards;
    });

    // Click a playable card → triggers post() → resync() → second view
    // returns the masked-hand transient view. After that resync, the
    // player's hand row must NOT silently empty out.
    await act(async () => {
      fireEvent.click(playableCards[0]);
      // Let the post/resync microtasks settle.
      await Promise.resolve();
      await Promise.resolve();
    });

    await waitFor(() => {
      // Sanity: we did actually trigger the second resync.
      expect(call).toBeGreaterThanOrEqual(2);
    });

    const handRow = container.querySelector(".hand-row--me");
    const after = handRow!.querySelectorAll("img.card");
    const recoveryHint = handRow!.querySelector('[data-state="hand-unknown"]');

    expect(after.length > 0 || recoveryHint !== null).toBe(true);
  });

  it("renders the running total normally even when hand is masked (proves the divergence the user reports)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url === "/api/games/7/state") {
          return new Response(JSON.stringify({ state: peggingView("count", 17) }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(null, { status: 200 });
      }),
    );
    const { container } = render(<CribbageApp />);
    await waitFor(() => {
      const running = container.querySelector(".pegging__running");
      expect(running).not.toBeNull();
      expect(running!.textContent).toBe("17");
    });
    // The whole point: count ticks fine, but hand is silently gone. This
    // test passes today and should continue to pass after the fix — it
    // just pins down the "count works, hand doesn't" symptom shape so
    // future regressions on the count side get flagged separately.
  });
});
