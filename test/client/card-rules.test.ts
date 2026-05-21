import { describe, it, expect } from "vitest";
import { isValidCardSet, cardLabel, cardTypeLabel } from "../../src/clients/risk/card-rules";
import type { Card } from "../../src/clients/shared/contracts/risk";

const inf = (t: string): Card => ({ territory: t, type: "infantry" });
const cav = (t: string): Card => ({ territory: t, type: "cavalry" });
const art = (t: string): Card => ({ territory: t, type: "artillery" });
const wild = (): Card => ({ territory: null, type: "wild" });

describe("isValidCardSet (client mirror of server validate.js)", () => {
  it("accepts three of a kind", () => {
    expect(isValidCardSet([inf("alaska"), inf("nwt"), inf("greenland")])).toBe(true);
  });
  it("accepts three distinct types", () => {
    expect(isValidCardSet([inf("alaska"), cav("nwt"), art("greenland")])).toBe(true);
  });
  it("accepts any two plus a wild", () => {
    expect(isValidCardSet([inf("alaska"), inf("nwt"), wild()])).toBe(true);
    expect(isValidCardSet([inf("alaska"), cav("nwt"), wild()])).toBe(true);
  });
  it("rejects two-of-a-kind-plus-a-third-different (only two distinct types, no wild)", () => {
    expect(isValidCardSet([inf("alaska"), inf("nwt"), cav("greenland")])).toBe(false);
  });
  it("rejects anything that is not exactly three cards", () => {
    expect(isValidCardSet([inf("alaska"), cav("nwt")])).toBe(false);
    expect(isValidCardSet([inf("a"), cav("b"), art("c"), wild()])).toBe(false);
    expect(isValidCardSet([])).toBe(false);
  });
});

describe("cardLabel / cardTypeLabel", () => {
  it("labels a territory card with its name and troop type", () => {
    expect(cardLabel(inf("alaska"))).toBe("Alaska · Infantry");
  });
  it("labels a wild card as Wild", () => {
    expect(cardLabel(wild())).toBe("Wild");
  });
  it("capitalises troop types", () => {
    expect(cardTypeLabel("cavalry")).toBe("Cavalry");
    expect(cardTypeLabel("artillery")).toBe("Artillery");
  });
});
