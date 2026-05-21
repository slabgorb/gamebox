// Mulberry32 PRNG — small, fast, well-distributed, deterministic from seed.
// Plenty good for game-state randomization and dice rolls; not for crypto.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Wilson score interval for a binomial proportion at 95% confidence.
// Returns { low, high } each in [0, 1]. Defined as [0, 0] when n === 0.
export function wilsonInterval(wins, n, z = 1.96) {
  if (n === 0) return { low: 0, high: 0 };
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return {
    low: Math.max(0, (centre - margin) / denom),
    high: Math.min(1, (centre + margin) / denom),
  };
}
