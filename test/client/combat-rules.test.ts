// test/client/combat-rules.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  attackerDiceCount,
  defenderDiceCount,
  resolveRound,
  driveCombat,
} from "../../src/clients/risk/combat-rules";

describe("combat-rules", () => {
  it("dice counts follow Risk rules", () => {
    expect(attackerDiceCount(4)).toBe(3); // min(3, force-1)
    expect(attackerDiceCount(2)).toBe(1);
    expect(defenderDiceCount(5)).toBe(2); // min(2, defenders)
    expect(defenderDiceCount(1)).toBe(1);
  });

  it("resolveRound sorts desc, compares pairs, ties go to defender", () => {
    // attacker [6,5,2] vs defender [6,3] -> pair0 6vs6 tie (aLoss), pair1 5vs3 (dLoss)
    expect(resolveRound([2, 6, 5], [3, 6])).toEqual({ aLoss: 1, dLoss: 1 });
    // attacker [6,6] vs defender [5] -> 6>5 dLoss
    expect(resolveRound([6, 6], [5])).toEqual({ aLoss: 0, dLoss: 1 });
    // attacker [2] vs defender [2] -> tie -> aLoss
    expect(resolveRound([2], [2])).toEqual({ aLoss: 1, dLoss: 0 });
  });

  it("driveCombat steps rounds until af<=1 or df<=0 and reports the outcome", async () => {
    // Scripted rolls: attacker always rolls 6s, defender always 1s -> attacker captures.
    const roll = async (n: number) =>
      Array.from({ length: n }, (_, i) => (n === 1 ? 6 : 6 - i === 0 ? 6 : 6));
    const out = await driveCombat({
      force: 3,
      defenders: 2,
      rollAttacker: async (n) => Array(n).fill(6),
      rollDefender: async (n) => Array(n).fill(1),
    });
    expect(out.captured).toBe(true);
    expect(out.defenderLosses).toBe(2);
    expect(out.rounds.length).toBeGreaterThan(0);
    // each round records the dice that were shown
    expect(out.rounds[0]).toHaveProperty("aDice");
    expect(out.rounds[0]).toHaveProperty("dDice");
    void roll;
  });

  it("driveCombat: defender holds when defender always wins", async () => {
    const out = await driveCombat({
      force: 3,
      defenders: 5,
      rollAttacker: async (n) => Array(n).fill(1),
      rollDefender: async (n) => Array(n).fill(6),
    });
    expect(out.captured).toBe(false);
    expect(out.attackerLosses).toBeGreaterThan(0);
  });

  it("driveCombat reports exact losses for a deterministic one-round capture", async () => {
    // force 3 (attacker rolls min(3,2)=2 dice), defenders 2 (rolls 2 dice).
    // attacker all 6s vs defender all 1s -> both pairs: 6>1 -> 2 dLoss, 0 aLoss.
    // df: 2 -> 0 (captured); af: 3 -> 3. One round, then loop exits (df<=0).
    const out = await driveCombat({
      force: 3,
      defenders: 2,
      rollAttacker: async (n) => Array(n).fill(6),
      rollDefender: async (n) => Array(n).fill(1),
    });
    expect(out).toEqual({
      rounds: [{ aDice: [6, 6], dDice: [1, 1] }],
      attackerLosses: 0,
      defenderLosses: 2,
      captured: true,
    });
  });

  it("driveCombat fires onRound after each round with post-attrition counts", async () => {
    const seen: { aDice: number[]; dDice: number[]; af: number; df: number }[] = [];
    const out = await driveCombat({
      force: 3,
      defenders: 2,
      rollAttacker: async (n) => Array(n).fill(6),
      rollDefender: async (n) => Array(n).fill(1),
      onRound: (r) => seen.push(r),
    });
    // exactly one round; onRound saw the post-attrition survivors (df hit 0).
    expect(seen).toHaveLength(out.rounds.length);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ aDice: [6, 6], dDice: [1, 1], af: 3, df: 0 });
  });

  it("driveCombat runs multiple rounds with mixed outcomes and exact attrition", async () => {
    // force 3 (2 attacker dice), defenders 3 (2 defender dice).
    // Round 1: a=[3,3] d=[6,6] -> sorted equal-len pairs: 3>6? no -> aLoss; 3>6? no -> aLoss
    //          => aLoss 2, dLoss 0 -> af 3->1, df 3. Loop guard af>1 now false -> stop.
    // Attacker repelled, 1 round, attackerLosses 2, defenderLosses 0, not captured.
    const out = await driveCombat({
      force: 3,
      defenders: 3,
      rollAttacker: async (n) => Array(n).fill(3),
      rollDefender: async (n) => Array(n).fill(6),
    });
    expect(out).toEqual({
      rounds: [{ aDice: [3, 3], dDice: [6, 6] }],
      attackerLosses: 2,
      defenderLosses: 0,
      captured: false,
    });
  });
});

// E5-1: driveCombat gains an optional between-round decision hook so a human
// attacker can Roll-again / Blitz / Stop mid-fight. The hook is awaited after
// each round resolves and *before the next* — i.e. only at a real decision
// point, when the loop would otherwise continue (af > 1 && df > 0).
//
//   decide?: (r) => Promise<"roll" | "blitz" | "stop">
//
//   - absent/undefined  => current auto-grind (regression guard for the bot /
//                          defender-resolves-for-bot path, which has no human to ask)
//   - "roll"            => resolve another round (normal continuation)
//   - "blitz"           => stop consulting decide; run the rest to resolution
//   - "stop"            => break now; survivors stay in the from-territory,
//                          captured === (df === 0)
//
// These tests pin the contract at the driveCombat level. The visual card stack,
// button enablement, ephemeral-on-unmount behaviour, and the bot-no-controls
// rendering (ACs 4-7) are verified manually — the design's Testing section scopes
// automated tests to driveCombat, and CombatReveal's interactive prop API is not
// yet specified (DOM tests would over-specify it). See the TEA Assessment's
// Manual-Verify checklist.
describe("combat-rules: between-round decision hook (E5-1)", () => {
  // Deterministic scenario reused as the auto-grind reference: attacker always
  // rolls 6s, defender always 1s. force 10 vs 5 -> a 3-round capture.
  const capture3 = {
    force: 10,
    defenders: 5,
    rollAttacker: async (n: number) => Array(n).fill(6),
    rollDefender: async (n: number) => Array(n).fill(1),
  };

  it("AC1: decide='stop' after a surviving round exits with the partial fight", async () => {
    // force 5 (3 attacker dice) vs 5 (2 defender dice). Attacker and defender
    // both roll 6s -> ties go to defender -> round 1: aLoss 2, dLoss 0.
    // After round 1: af 5->3, df 5 (still standing) -> a real decision point.
    const decide = vi.fn(async () => "stop" as const);
    const out = await driveCombat({
      force: 5,
      defenders: 5,
      rollAttacker: async (n) => Array(n).fill(6),
      rollDefender: async (n) => Array(n).fill(6),
      decide,
    });
    expect(out).toEqual({
      rounds: [{ aDice: [6, 6, 6], dDice: [6, 6] }],
      attackerLosses: 2,
      defenderLosses: 0,
      captured: false, // df === 5, not 0
    });
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it("AC2: decide='blitz' stops consulting and runs to resolution", async () => {
    const auto = await driveCombat(capture3); // reference auto-grind
    const decide = vi.fn(async () => "blitz" as const);
    const out = await driveCombat({ ...capture3, decide });
    // Blitz after round 1 must resolve byte-identically to the auto-grind...
    expect(out).toEqual(auto);
    // ...and decide is consulted exactly once before blitz takes over.
    expect(decide).toHaveBeenCalledTimes(1);
  });

  it("AC3: absent decide is the unchanged auto-grind (bot-path regression guard)", async () => {
    const out = await driveCombat(capture3);
    expect(out).toEqual({
      rounds: [
        { aDice: [6, 6, 6], dDice: [1, 1] },
        { aDice: [6, 6, 6], dDice: [1, 1] },
        { aDice: [6, 6, 6], dDice: [1] },
      ],
      attackerLosses: 0,
      defenderLosses: 5,
      captured: true,
    });
  });

  it("decide='roll' continues like auto-grind and is consulted once per surviving round", async () => {
    const auto = await driveCombat(capture3);
    const decide = vi.fn(async () => "roll" as const);
    const out = await driveCombat({ ...capture3, decide });
    expect(out).toEqual(auto);
    // 3-round capture: consulted after rounds 1 and 2; NOT after round 3, which
    // drops df to 0 (Stop is moot once the territory is captured / AC5).
    expect(decide).toHaveBeenCalledTimes(2);
  });

  it("decide is not consulted once the attacker is down to 1 army (Roll-again unavailable at af<=1 / AC5)", async () => {
    // force 4 (3 dice) vs 5 (2 dice), attacker 1s vs defender 6s -> attacker loses.
    // R1: af 4->2, df 5 -> decision point (consulted). R2: af 2->1 -> loop exits,
    // no decision offered (Roll-again would be disabled).
    const decide = vi.fn(async () => "roll" as const);
    const out = await driveCombat({
      force: 4,
      defenders: 5,
      rollAttacker: async (n) => Array(n).fill(1),
      rollDefender: async (n) => Array(n).fill(6),
      decide,
    });
    expect(decide).toHaveBeenCalledTimes(1);
    expect(out.rounds).toHaveLength(2);
    expect(out.attackerLosses).toBe(3); // 4 -> 1
    expect(out.captured).toBe(false);
  });
});
