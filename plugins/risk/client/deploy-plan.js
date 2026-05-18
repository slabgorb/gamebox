// plugins/risk/client/deploy-plan.js
// Pure helpers for the multi-territory deploy plan used during the `setup`
// and `reinforce` phases. A plan is a plain `{ territoryId: armies }` map;
// the server's validateDeploy accepts exactly this shape. Keeping the maths
// here (and pure) keeps action-bar.js/app.js dumb and lets it be tested
// without a DOM.

export function placed(plan) {
  let sum = 0;
  for (const n of Object.values(plan)) sum += n;
  return sum;
}

export function remaining(plan, pool) {
  return pool - placed(plan);
}

// Add `delta` armies to `id`, never letting the plan overspend the pool and
// never going below zero. A territory that drops to zero is removed so the
// plan only ever lists territories with armies on them. Returns a new object;
// the input is not mutated.
export function adjust(plan, id, delta, pool) {
  const next = { ...plan };
  const current = next[id] ?? 0;
  let target = current + delta;
  if (target < 0) target = 0;
  const headroom = pool - (placed(plan) - current); // pool minus everyone else
  if (target > headroom) target = headroom;
  if (target === 0) delete next[id];
  else next[id] = target;
  return next;
}

export function isComplete(plan, pool) {
  return pool > 0 && placed(plan) === pool;
}
