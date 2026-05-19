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

export interface DriveArgs {
  force: number;
  defenders: number;
  rollAttacker: (count: number) => Promise<number[]>;
  rollDefender: (count: number) => Promise<number[]>;
  /** Optional hook fired after each round resolves. `af`/`df` are the surviving attacker/defender counts *after* this round's attrition is applied. */
  onRound?: (r: {
    aDice: number[];
    dDice: number[];
    af: number;
    df: number;
  }) => void;
}

/**
 * Runs the full attack round-by-round, rolling via the injected functions.
 * Returns the resolved outcome to POST to the server (spec Amendment A.1).
 */
export async function driveCombat(args: DriveArgs): Promise<ResolvedCombat> {
  let af = args.force;
  let df = args.defenders;
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
  }
  return {
    rounds,
    attackerLosses: args.force - af,
    defenderLosses: args.defenders - df,
    captured: df === 0,
  };
}
