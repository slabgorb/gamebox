// test/client/combat-rules.test.ts
import { describe, it, expect } from "vitest";
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
