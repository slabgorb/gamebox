import { describe, it, expect } from "vitest";
import { SUSPECT_CHECKER, WEAPON_ICONS } from "../../src/clients/clue/board-art.js";

const SUSPECTS = ["scarlett", "mustard", "white", "green", "peacock", "plum"];
const WEAPONS = ["candlestick", "knife", "leadpipe", "revolver", "rope", "wrench"];
const COLORS = ["red", "orange", "white", "green", "blue", "pink"];

describe("board-art skin constants", () => {
  it("maps every suspect to a known checker colour file", () => {
    expect(Object.keys(SUSPECT_CHECKER).sort()).toEqual([...SUSPECTS].sort());
    for (const s of SUSPECTS) expect(COLORS).toContain(SUSPECT_CHECKER[s]);
  });

  it("gives every weapon an icon path and a positive stroke-width", () => {
    expect(Object.keys(WEAPON_ICONS).sort()).toEqual([...WEAPONS].sort());
    for (const w of WEAPONS) {
      expect(typeof WEAPON_ICONS[w].icon).toBe("string");
      expect(WEAPON_ICONS[w].icon.length).toBeGreaterThan(0);
      expect(WEAPON_ICONS[w].sw).toBeGreaterThan(0);
    }
  });
});
