// E5-10: pure advance-range rule for the conquest advance chooser.
//
// Contract: advanceRange(out, force) — out is the ResolvedCombat produced by
// driveCombat, force the committed attacking force. Returns null unless the
// combat captured; otherwise { min, max, forced }:
//   survivors = force - out.attackerLosses
//   min = min(dice rolled in the final/winning round, survivors)
//   max = survivors            // ≡ origin armies - 1 at conquest time
//   forced = (min === max)     // AC-3: single legal value, show no chooser
import { describe, it, expect } from "vitest";
import { advanceRange } from "../../src/clients/risk/combat-rules";

describe("advanceRange", () => {
  it("returns [finalRoundDice, survivors] for a one-round sweep", () => {
    const out = {
      rounds: [{ aDice: [6, 6, 6], dDice: [1, 1] }],
      attackerLosses: 0,
      defenderLosses: 2,
      captured: true,
    };
    expect(advanceRange(out, 9)).toEqual({ min: 3, max: 9, forced: false });
  });

  it("uses the FINAL round's dice count, not the battle's largest roll", () => {
    const out = {
      rounds: [
        { aDice: [1, 1, 1], dDice: [6, 6] }, // 3 dice early...
        { aDice: [6], dDice: [1, 1] },
        { aDice: [6], dDice: [1, 1] },
        { aDice: [6], dDice: [1] }, // ...but the winning round rolled 1
      ],
      attackerLosses: 2,
      defenderLosses: 3,
      captured: true,
    };
    // survivors = 4 - 2 = 2
    expect(advanceRange(out, 4)).toEqual({ min: 1, max: 2, forced: false });
  });

  it("clamps min to survivors and flags forced when the range collapses (AC-3)", () => {
    // Synthetic: 3 dice in the winning round but only 2 survivors — the only
    // legal advance is everything, so the chooser must not be shown.
    const out = {
      rounds: [{ aDice: [6, 6, 6], dDice: [1, 1] }],
      attackerLosses: 1,
      defenderLosses: 2,
      captured: true,
    };
    expect(advanceRange(out, 3)).toEqual({ min: 2, max: 2, forced: true });
  });

  it("flags forced when survivors equal the winning-round dice count (AC-3)", () => {
    const out = {
      rounds: [{ aDice: [6, 6, 6], dDice: [1, 1] }],
      attackerLosses: 0,
      defenderLosses: 2,
      captured: true,
    };
    expect(advanceRange(out, 3)).toEqual({ min: 3, max: 3, forced: true });
  });

  it("returns null for a repulse — there is nothing to advance into", () => {
    const out = {
      rounds: [{ aDice: [1, 1, 1], dDice: [6, 6] }],
      attackerLosses: 2,
      defenderLosses: 0,
      captured: false,
    };
    expect(advanceRange(out, 4)).toBeNull();
  });
});
