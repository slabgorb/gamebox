// Rate-limit retry helper. Used by the tournament harness to survive Pro
// Max 5-hour / weekly throttle windows: on first rate-limit error, sleep
// once and retry. If the retry also fails, propagate — the caller is
// expected to checkpoint and exit cleanly.

const RATE_LIMIT_PATTERNS = [
  /rate[\s\-_]?limit/i,
  /\b429\b/,
  /too many requests/i,
  /usage limit/i,
];

export function isRateLimitError(err) {
  if (!err) return false;
  const stderr = typeof err.stderr === 'string' ? err.stderr : '';
  const message = typeof err.message === 'string' ? err.message : '';
  const haystack = stderr || message;
  if (!haystack) return false;
  return RATE_LIMIT_PATTERNS.some(re => re.test(haystack));
}

const defaultSleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export async function runWithRateLimitRetry(fn, {
  sleep = defaultSleep,
  log = console.log,
  sleepMs = 5 * 60 * 1000,
} = {}) {
  try {
    return await fn();
  } catch (err) {
    if (!isRateLimitError(err)) throw err;
    const minutes = Math.round(sleepMs / 60_000);
    log(`[paused: rate-limited, sleeping ${minutes}m]`);
    await sleep(sleepMs);
    return await fn();
  }
}
