import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRateLimitError, runWithRateLimitRetry } from '../src/server/ai/retry.js';

class FakeSubprocessFailed extends Error {
  constructor(stderr) { super(stderr); this.stderr = stderr; }
}

test('isRateLimitError: matches "rate limit" in stderr', () => {
  assert.equal(isRateLimitError(new FakeSubprocessFailed('Error: rate limit exceeded')), true);
});

test('isRateLimitError: matches "429" in stderr', () => {
  assert.equal(isRateLimitError(new FakeSubprocessFailed('HTTP 429 Too Many Requests')), true);
});

test('isRateLimitError: matches "usage limit" in stderr (Pro Max wording)', () => {
  assert.equal(isRateLimitError(new FakeSubprocessFailed('Usage limit reached. Try again later.')), true);
});

test('isRateLimitError: false on unrelated stderr', () => {
  assert.equal(isRateLimitError(new FakeSubprocessFailed('connection refused')), false);
});

test('isRateLimitError: false on null/undefined errors', () => {
  assert.equal(isRateLimitError(null), false);
  assert.equal(isRateLimitError(undefined), false);
});

test('isRateLimitError: false on error without stderr field', () => {
  assert.equal(isRateLimitError(new Error('something else')), false);
});

test('isRateLimitError: matches 429 in err.message (Ollama plain Error)', () => {
  assert.equal(isRateLimitError(new Error('OllamaClient: HTTP 429: rate exceeded')), true);
});

test('isRateLimitError: matches "too many requests" in err.message', () => {
  assert.equal(isRateLimitError(new Error('Too Many Requests')), true);
});

test('runWithRateLimitRetry: returns value on first success', async () => {
  const r = await runWithRateLimitRetry(() => Promise.resolve('ok'));
  assert.equal(r, 'ok');
});

test('runWithRateLimitRetry: passes through non-rate-limit errors', async () => {
  const err = new Error('something else');
  await assert.rejects(
    () => runWithRateLimitRetry(() => Promise.reject(err)),
    /something else/,
  );
});

test('runWithRateLimitRetry: sleeps and retries once on rate-limit error', async () => {
  let calls = 0;
  let slept = 0;
  const fakeSleep = ms => { slept = ms; return Promise.resolve(); };
  const fn = async () => {
    calls++;
    if (calls === 1) throw new FakeSubprocessFailed('rate limit');
    return 'recovered';
  };
  const r = await runWithRateLimitRetry(fn, { sleep: fakeSleep, log: () => {}, sleepMs: 1234 });
  assert.equal(r, 'recovered');
  assert.equal(calls, 2);
  assert.equal(slept, 1234);
});

test('runWithRateLimitRetry: throws on second consecutive rate-limit', async () => {
  const fakeSleep = () => Promise.resolve();
  const fn = async () => { throw new FakeSubprocessFailed('rate limit'); };
  await assert.rejects(
    () => runWithRateLimitRetry(fn, { sleep: fakeSleep, log: () => {} }),
    /rate limit/,
  );
});

test('runWithRateLimitRetry: calls log on pause', async () => {
  const messages = [];
  const fakeSleep = () => Promise.resolve();
  let calls = 0;
  const fn = async () => {
    calls++;
    if (calls === 1) throw new FakeSubprocessFailed('rate limit');
    return 'ok';
  };
  await runWithRateLimitRetry(fn, { sleep: fakeSleep, log: m => messages.push(m), sleepMs: 60_000 });
  assert.ok(messages.some(m => /rate/i.test(m) && /1m/i.test(m)));
});
