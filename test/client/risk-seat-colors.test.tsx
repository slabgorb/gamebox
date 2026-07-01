import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { Header } from "../../src/clients/risk/Header";
import { ContinentRail } from "../../src/clients/risk/ContinentRail";
import { TERRITORIES } from "../../src/clients/risk/map-geometry.js";

// E5-8 thread 3 — seat-strip + continent-pip colour threading.
//
// E5-7 threaded `view.colors` (the E5-3 per-seat palette-slot index array)
// through `themes.ts` into the board, crest, dice, and end screen. It did NOT
// touch four surfaces that still paint the RAW seat index via the `--pN` CSS
// path: the seat-strip dot (Header.tsx:64), the turn-pip (Header.tsx:79), the
// crest fallback (Header.tsx:80), and the continent-rail pip (ContinentRail.tsx:34).
//
// `view.colors[seat]` is the palette slot that seat occupies. Every seat-colour
// surface must resolve seat -> slot through that array (mirroring `themes.ts`
// `paletteSlot`) so board / crest / seat-strip / dice stay consistent under ONE
// model. Absent/empty `view.colors` must reproduce today's identity palette
// (Red/Blue/Green/Yellow by seat) — no regression. Palette slot 0 is a real,
// non-falsy choice: resolving with `colors[seat] || seat` would silently drop
// it, so the `?? seat` fallback must survive (JS/TS rule #4).
//
// These pins fail RED because Header and ContinentRail currently ignore
// `view.colors` and key colour off the raw seat/owner index.

const headerView = (overrides: Record<string, unknown> = {}) => ({
  phase: "attack",
  currentPlayer: 1,
  youAre: 0,
  seats: [0, 1, 2],
  territories: {
    a: { owner: 0, armies: 3 },
    b: { owner: 1, armies: 2 },
    c: { owner: 2, armies: 1 },
  },
  eliminated: [false, false, false],
  cardCounts: [0, 0, 0],
  ...overrides,
});

const renderHeader = (
  overrides: Record<string, unknown> = {},
  factionColor: string | null = null,
) =>
  render(
    <Header
      view={headerView(overrides) as never}
      factionName="Test Faction"
      factionColor={factionColor}
      onResign={() => {}}
    />,
  ).container;

const dotBg = (container: HTMLElement, seat: number) => {
  const dots = container.querySelectorAll<HTMLElement>(".seat-strip .dot");
  return dots[seat].style.background;
};

describe("Header seat-strip dot reads view.colors (E5-8 thread 3)", () => {
  it("paints each seat's dot with its chosen palette slot (AC1)", () => {
    const c = renderHeader({ colors: [2, 1, 0] }); // seat 0 -> slot 2, seat 2 -> slot 0
    expect(dotBg(c, 0)).toBe("var(--p2-1)");
    expect(dotBg(c, 2)).toBe("var(--p0-1)");
    // guard: seat 0 must no longer paint its raw identity slot
    expect(dotBg(c, 0)).not.toBe("var(--p0-1)");
  });

  it("keeps the identity palette when colors is undefined (AC2 no regression)", () => {
    const c = renderHeader();
    expect(dotBg(c, 0)).toBe("var(--p0-1)");
    expect(dotBg(c, 1)).toBe("var(--p1-1)");
    expect(dotBg(c, 2)).toBe("var(--p2-1)");
  });

  it("honours a seat that picks palette slot 0 — 0 is not falsy (rule #4)", () => {
    const c = renderHeader({ colors: [2, 0, 1] }); // seat 1 -> slot 0
    expect(dotBg(c, 1)).toBe("var(--p0-1)");
    expect(dotBg(c, 1)).not.toBe("var(--p1-1)");
  });
});

describe("Header turn-pip reads view.colors (E5-8 thread 3)", () => {
  it("resolves the current player's pip class through its chosen slot (AC1)", () => {
    const c = renderHeader({ currentPlayer: 1, colors: [2, 3, 0] }); // seat 1 -> slot 3
    const pip = c.querySelector(".turn-pip") as HTMLElement;
    expect(pip.classList.contains("p3")).toBe(true);
    expect(pip.classList.contains("p1")).toBe(false);
  });

  it("keeps the identity pip class when colors is undefined (AC2 no regression)", () => {
    const c = renderHeader({ currentPlayer: 1 });
    const pip = c.querySelector(".turn-pip") as HTMLElement;
    expect(pip.classList.contains("p1")).toBe(true);
  });
});

describe("Header crest fallback reads view.colors (E5-8 thread 3)", () => {
  const crestFill = (c: HTMLElement) =>
    c.querySelector(".crest svg path")!.getAttribute("fill");

  it("resolves the crest fallback colour through youAre's chosen slot (AC1)", () => {
    const c = renderHeader({ youAre: 0, colors: [2, 1, 0] }, null); // no factionColor -> fallback
    expect(crestFill(c)).toBe("var(--p2-1)");
    expect(crestFill(c)).not.toBe("var(--p0-1)");
  });

  it("still prefers an explicit factionColor over the palette fallback (guard)", () => {
    const c = renderHeader({ youAre: 0, colors: [2, 1, 0] }, "#123456");
    expect(crestFill(c)).toBe("#123456");
  });

  it("keeps the identity crest fallback when colors is undefined (AC2 no regression)", () => {
    const c = renderHeader({ youAre: 0 }, null);
    expect(crestFill(c)).toBe("var(--p0-1)");
  });
});

const railView = (owner: number, colors?: number[]) => ({
  youAre: owner,
  colors,
  territories: Object.fromEntries(
    Object.keys(TERRITORIES).map((id) => [id, { owner, armies: 1 }]),
  ),
});

describe("ContinentRail pip reads view.colors (E5-8 thread 3)", () => {
  it("paints each owned pip with the owner's chosen palette slot (AC1)", () => {
    const c = render(
      <ContinentRail view={railView(0, [2, 1, 0, 3]) as never} />,
    ).container; // seat 0 -> slot 2
    expect(c.querySelectorAll(".pip.p2").length).toBeGreaterThan(0);
    expect(c.querySelectorAll(".pip.p0").length).toBe(0);
  });

  it("keeps the identity pip class when colors is undefined (AC2 no regression)", () => {
    const c = render(<ContinentRail view={railView(0) as never} />).container;
    expect(c.querySelectorAll(".pip.p0").length).toBeGreaterThan(0);
    expect(c.querySelectorAll(".pip.p2").length).toBe(0);
  });

  it("honours an owner that picks palette slot 0 — 0 is not falsy (rule #4)", () => {
    const c = render(
      <ContinentRail view={railView(1, [3, 0, 1, 2]) as never} />,
    ).container; // seat 1 -> slot 0
    expect(c.querySelectorAll(".pip.p0").length).toBeGreaterThan(0);
    expect(c.querySelectorAll(".pip.p1").length).toBe(0);
  });

  it("leaves unowned pips without a seat-colour class (neutral guard)", () => {
    const c = render(
      <ContinentRail view={{ youAre: 0, territories: {} } as never} />,
    ).container;
    expect(c.querySelectorAll(".pip").length).toBeGreaterThan(0);
    expect(
      c.querySelectorAll(".pip.p0, .pip.p1, .pip.p2, .pip.p3").length,
    ).toBe(0);
  });
});
