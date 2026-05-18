import type { LastCombat } from "../shared/contracts/risk";

export function combatSignature(
  lastCombat: LastCombat | null | undefined,
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
