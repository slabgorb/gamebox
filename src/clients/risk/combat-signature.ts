import type { LastCombat } from "../shared/contracts/risk";

// The signature only needs the identifying fields plus the round count, so it
// accepts anything carrying them: a full server `LastCombat`, or a freshly
// resolved combat whose rounds omit per-round losses.
export interface CombatLike {
  from: string;
  to: string;
  force: number;
  captured: boolean;
  rounds?: readonly unknown[] | null;
}

export function combatSignature(
  lastCombat: CombatLike | null | undefined,
): string | null {
  if (!lastCombat) return null;
  const { from, to, force, captured, rounds } = lastCombat;
  return `${from}|${to}|${force}|${captured}|${rounds ? rounds.length : 0}`;
}

export function shouldReplay(
  prevSignature: string | null | undefined,
  lastCombat: LastCombat | null | undefined,
): { signature: string | null; replay: boolean } {
  const signature = combatSignature(lastCombat);
  return { signature, replay: signature != null && signature !== prevSignature };
}
