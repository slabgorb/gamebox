import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { Board } from "../../src/clients/clue/Board";
import type { ClueView } from "../../src/clients/shared/contracts/clue";

function baseView(overrides: Partial<ClueView> = {}): ClueView {
  return {
    youAreSeat: 0,
    seats: [0, 1],
    phase: "move",
    currentSeat: 0,
    activeUserId: 100,
    pawns: {
      scarlett: { square: [8, 20] },
      mustard: { room: "ballroom" },
      white: { room: "ballroom" },
      green: { room: "billiardroom" },
      peacock: { square: [16, 6] },
      plum: { room: "study" },
    },
    weapons: {
      candlestick: "kitchen", knife: "diningroom", leadpipe: "ballroom",
      revolver: "library", rope: "conservatory", wrench: "lounge",
    },
    seatSuspect: ["scarlett", "mustard"],
    eliminated: [false, false],
    log: [], suggestion: null, hand: [], ledger: [],
    winnerSeat: null, pendingRoll: null,
    movement: { needsRoll: false, pendingRoll: 7, squares: [[8, 19]], rooms: ["hall"] },
    ...overrides,
  } as ClueView;
}

function renderBoard(view: ClueView, onPickRoom = vi.fn(), onPickSquare = vi.fn()) {
  const utils = render(<Board view={view} onPickRoom={onPickRoom} onPickSquare={onPickSquare} />);
  return { ...utils, onPickRoom, onPickSquare };
}

const ROOMS = ["kitchen","ballroom","conservatory","diningroom","billiardroom","library","lounge","hall","study"];
const WEAPONS = ["candlestick","knife","leadpipe","revolver","rope","wrench"];

describe("Board (parlour re-theme)", () => {
  it("renders every room with a data-room hook", () => {
    const { container } = renderBoard(baseView());
    for (const id of ROOMS) expect(container.querySelector(`[data-room="${id}"]`)).not.toBeNull();
  });

  it("renders pawns as checker token images by suspect colour", () => {
    const { container } = renderBoard(baseView());
    expect(container.querySelector('[data-pawn="scarlett"]')!.getAttribute("href")).toBe("assets/checker-red.png");
    expect(container.querySelector('[data-pawn="peacock"]')!.getAttribute("href")).toBe("assets/checker-blue.png");
    expect(container.querySelector('[data-pawn="plum"]')!.getAttribute("href")).toBe("assets/checker-pink.png");
  });

  it("places no /shared/portraits image on the board", () => {
    const { container } = renderBoard(baseView());
    const imgs = Array.from(container.querySelectorAll("image"));
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs.every((i) => !(i.getAttribute("href") ?? "").includes("/shared/portraits"))).toBe(true);
  });

  it("renders a brass medallion with an icon path per weapon", () => {
    const { container } = renderBoard(baseView());
    for (const w of WEAPONS) {
      const g = container.querySelector(`[data-weapon="${w}"]`);
      expect(g).not.toBeNull();
      expect(g!.querySelector("path")).not.toBeNull();
    }
  });

  it("rings the viewer's own pawn only", () => {
    const { container } = renderBoard(baseView());
    const you = container.querySelector('[data-pawn="scarlett"]')!.closest("g")!;
    expect(you.querySelector("circle")).not.toBeNull();
    const other = container.querySelector('[data-pawn="plum"]')!.closest("g")!;
    expect(other.querySelector("circle")).toBeNull();
  });

  it("fires onPickRoom / onPickSquare for reachable targets", () => {
    const { container, onPickRoom, onPickSquare } = renderBoard(baseView());
    fireEvent.click(container.querySelector('[data-room="hall"]')!);
    expect(onPickRoom).toHaveBeenCalledWith("hall");
    fireEvent.click(container.querySelector('[data-square="8,19"]')!);
    expect(onPickSquare).toHaveBeenCalledWith([8, 19]);
  });

  it("does not wire clicks on unreachable rooms", () => {
    const { container, onPickRoom } = renderBoard(baseView());
    fireEvent.click(container.querySelector('[data-room="kitchen"]')!);
    expect(onPickRoom).not.toHaveBeenCalled();
  });
});
