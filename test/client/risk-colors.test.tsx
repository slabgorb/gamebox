import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import {
  seatClass,
  seatFill,
  seatInk,
  seatHex,
  seatLabel,
  SEAT_HEX,
  SEAT_LABEL,
} from "../../src/clients/risk/themes";
import { Board } from "../../src/clients/risk/Board";
import { TERRITORIES } from "../../src/clients/risk/map-geometry.js";

// E5-7 AC1/AC2 — themes colour resolution reads `view.colors`.
//
// `view.colors` is a per-seat palette-slot index array (E5-3 server seam):
// index = seat, value = the palette slot that seat occupies. It defaults to
// the identity mapping (seat s -> slot s), so an absent/empty array must
// reproduce today's Red/Blue/Green/Yellow-by-seat palette exactly. A seat that
// picks a different slot renders that slot's colour consistently across the
// board fill, ink, CSS class, WebGL hex, and label.
//
// These pins fail RED because themes.ts currently keys colour off the raw seat
// index and ignores any second `colors` argument.

describe("themes: colour resolution reads view.colors (E5-7 AC2 default)", () => {
  it("uses the seat's own palette slot when colors is undefined (no regression)", () => {
    expect(seatFill(0)).toBe("var(--p0-1)");
    expect(seatFill(1)).toBe("var(--p1-1)");
    expect(seatInk(2)).toBe("var(--p2-ink)");
    expect(seatClass(3)).toBe("p3");
    expect(seatHex(0)).toBe(SEAT_HEX[0]);
    expect(seatLabel(1)).toBe("Blue");
  });

  it("treats an empty colors array as identity per seat (no regression)", () => {
    expect(seatFill(0, [])).toBe("var(--p0-1)");
    expect(seatClass(1, [])).toBe("p1");
    expect(seatHex(2, [])).toBe(SEAT_HEX[2]);
    expect(seatLabel(3, [])).toBe("Yellow");
  });
});

describe("themes: colour resolution reads view.colors (E5-7 AC1 choice)", () => {
  it("resolves a seat to its chosen palette slot across fill/ink/class/hex/label", () => {
    const colors = [2, 1, 0, 3]; // seat 0 chose slot 2 (Green)
    expect(seatFill(0, colors)).toBe("var(--p2-1)");
    expect(seatInk(0, colors)).toBe("var(--p2-ink)");
    expect(seatClass(0, colors)).toBe("p2");
    expect(seatHex(0, colors)).toBe(SEAT_HEX[2]);
    expect(seatLabel(0, colors)).toBe(SEAT_LABEL[2]); // "Green"
  });

  it("resolves every seat independently through the same colors array", () => {
    const colors = [3, 0, 1, 2]; // seat 1 -> slot 0, seat 3 -> slot 2
    expect(seatFill(1, colors)).toBe("var(--p0-1)");
    expect(seatHex(3, colors)).toBe(SEAT_HEX[2]);
    expect(seatClass(2, colors)).toBe("p1");
  });

  // CRITICAL: palette slot 0 is a legitimate choice. Resolving with
  // `colors[seat] || seat` would silently drop a slot-0 pick (0 is falsy).
  // Must use `colors[seat] ?? seat`. (JS rule #4 / TS rule #4)
  it("honours a seat that picks palette slot 0 — slot 0 is not falsy (rule #4)", () => {
    const colors = [1, 2, 0, 3]; // seat 2 chose slot 0 (Red)
    expect(seatFill(2, colors)).toBe("var(--p0-1)");
    expect(seatClass(2, colors)).toBe("p0");
    expect(seatHex(2, colors)).toBe(SEAT_HEX[0]);
    // guard against `colors[2] || 2` regressing to the seat's own slot:
    expect(seatFill(2, colors)).not.toBe("var(--p2-1)");
  });
});

describe("themes: colour resolution guards bad input (E5-7 rule #11 / TS #10)", () => {
  it("falls back to the seat's identity slot when the chosen slot is out of range", () => {
    expect(seatFill(0, [9])).toBe("var(--p0-1)"); // 9 invalid -> identity seat 0
    expect(seatHex(1, [-1, 7])).toBe(SEAT_HEX[1]); // 7 invalid -> identity seat 1
    expect(seatClass(0, [9])).toBe("p0");
  });

  it("leaves neutral/unowned owners at the neutral colour regardless of colors", () => {
    const colors = [2, 1, 0, 3];
    expect(seatFill(null, colors)).toBe("var(--neutral)");
    expect(seatInk(null, colors)).toBe("var(--neutral)");
    expect(seatHex(null, colors)).toBe("#8a7c5c");
    expect(seatLabel(null, colors)).toBe("Neutral");
  });
});

describe("Board paints each seat in its chosen colour (E5-7 AC1 wiring)", () => {
  const base = {
    youAre: 0,
    phase: "attack",
    territories: Object.fromEntries(
      Object.keys(TERRITORIES).map((id) => [id, { owner: 0, armies: 2 }]),
    ),
  };
  const renderWith = (colors?: number[]) =>
    render(
      <Board
        view={{ ...base, colors } as any}
        onPick={() => {}}
        selected={null}
        plan={{}}
        to={null}
      />,
    ).container;

  it("remaps every seat-0 army token from the identity slot to the chosen slot", () => {
    const def = renderWith(); // default: seat 0 -> slot 0
    const identityTokens = def.querySelectorAll('circle[fill="var(--p0-1)"]').length;
    expect(identityTokens).toBeGreaterThan(0); // sanity: default paints seat 0 as slot 0

    const recoloured = renderWith([2, 1, 0, 3]); // seat 0 -> slot 2
    // Every token that was slot 0 by default must now paint slot 2.
    expect(
      recoloured.querySelectorAll('circle[fill="var(--p2-1)"]').length,
    ).toBe(identityTokens);
  });
});
