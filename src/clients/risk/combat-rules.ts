// src/clients/risk/combat-rules.ts
import type { ResolvedCombat } from "../shared/contracts/risk";

export function attackerDiceCount(attackForce: number): number {
  return Math.min(3, attackForce - 1);
}
export function defenderDiceCount(defenders: number): number {
  return Math.min(2, defenders);
}

/** Compare sorted-desc dice pairs. Ties resolve in the defender's favour. */
export function resolveRound(
  aDiceRaw: number[],
  dDiceRaw: number[],
): { aLoss: number; dLoss: number } {
  const a = [...aDiceRaw].sort((x, y) => y - x);
  const d = [...dDiceRaw].sort((x, y) => y - x);
  let aLoss = 0;
  let dLoss = 0;
  const pairs = Math.min(a.length, d.length);
  for (let i = 0; i < pairs; i++) {
    if (a[i] > d[i]) dLoss++;
    else aLoss++;
  }
  return { aLoss, dLoss };
}

/** A human attacker's between-round choice. */
export type CombatDecision = "roll" | "blitz" | "stop";

/** Per-round result. `af`/`df` are the surviving attacker/defender counts *after* this round's attrition is applied. */
export interface RoundResult {
  aDice: number[];
  dDice: number[];
  af: number;
  df: number;
}

export interface DriveArgs {
  force: number;
  defenders: number;
  rollAttacker: (count: number) => Promise<number[]>;
  rollDefender: (count: number) => Promise<number[]>;
  /** Optional hook fired after each round resolves. */
  onRound?: (r: RoundResult) => void;
  /**
   * Optional between-round decision hook. Awaited after each round resolves and
   * *before the next* — only at a real decision point, when the loop would
   * otherwise continue (`af > 1 && df > 0`). Absent/undefined ⇒ the legacy
   * auto-grind to exhaustion (preserves every existing caller and the bot /
   * defender-resolves-for-bot path, which has no human attacker to ask).
   * - `"roll"`  resolve another round (normal continuation);
   * - `"blitz"` stop consulting and run the rest to resolution;
   * - `"stop"`  end the attack now — survivors stay in the from-territory,
   *             `captured === (df === 0)`.
   */
  decide?: (r: RoundResult) => Promise<CombatDecision>;
}

/**
 * Runs the full attack round-by-round, rolling via the injected functions.
 * Returns the resolved outcome to POST to the server (spec Amendment A.1).
 */
export async function driveCombat(args: DriveArgs): Promise<ResolvedCombat> {
  let af = args.force;
  let df = args.defenders;
  // Cleared on "blitz" so the remaining rounds resolve unattended.
  let decide = args.decide;
  const rounds: { aDice: number[]; dDice: number[] }[] = [];
  while (af > 1 && df > 0) {
    const [aDice, dDice] = await Promise.all([
      args.rollAttacker(attackerDiceCount(af)),
      args.rollDefender(defenderDiceCount(df)),
    ]);
    const { aLoss, dLoss } = resolveRound(aDice, dDice);
    af -= aLoss;
    df -= dLoss;
    rounds.push({ aDice, dDice });
    args.onRound?.({ aDice, dDice, af, df });
    // Ask only when another round is actually possible — that is the decision
    // ("roll again?"). A capture or an attacker down to 1 has already ended it.
    if (decide && af > 1 && df > 0) {
      const decision = await decide({ aDice, dDice, af, df });
      if (decision === "stop") break;
      if (decision === "blitz") decide = undefined;
    }
  }
  return {
    rounds,
    attackerLosses: args.force - af,
    defenderLosses: args.defenders - df,
    captured: df === 0,
  };
}
