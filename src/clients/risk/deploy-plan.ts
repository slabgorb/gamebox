export type DeployPlan = Record<string, number>;

export function placed(plan: DeployPlan): number {
  let sum = 0;
  for (const n of Object.values(plan)) sum += n;
  return sum;
}

export function remaining(plan: DeployPlan, pool: number): number {
  return pool - placed(plan);
}

export function adjust(
  plan: DeployPlan,
  id: string,
  delta: number,
  pool: number,
): DeployPlan {
  const next: DeployPlan = { ...plan };
  const current = next[id] ?? 0;
  let target = current + delta;
  if (target < 0) target = 0;
  const headroom = pool - (placed(plan) - current);
  if (target > headroom) target = headroom;
  if (target === 0) delete next[id];
  else next[id] = target;
  return next;
}

export function isComplete(plan: DeployPlan, pool: number): boolean {
  return pool > 0 && placed(plan) === pool;
}
