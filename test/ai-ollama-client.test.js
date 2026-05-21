import { test } from 'node:test';
import assert from 'node:assert/strict';
import { OllamaClient } from '../src/server/ai/ollama-client.js';

function fakeFetch(responder) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init);
  };
  return { fetch, calls };
}

function okResponse(text) {
  return new Response(JSON.stringify({ message: { content: text } }), {
    status: 200, headers: { 'content-type': 'application/json' },
  });
}

test('OllamaClient: posts chat request with model + system + user', async () => {
  const { fetch, calls } = fakeFetch(() => okResponse('hello world'));
  const client = new OllamaClient({ model: 'llama3.1:8b', fetch });
  const r = await client.send({ prompt: 'pick a move', systemPrompt: 'you are a bot' });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://localhost:11434/api/chat');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'llama3.1:8b');
  assert.equal(body.stream, false);
  assert.deepEqual(body.messages, [
    { role: 'system', content: 'you are a bot' },
    { role: 'user', content: 'pick a move' },
  ]);
  assert.equal(r.text, 'hello world');
  assert.equal(typeof r.sessionId, 'string');
});

test('OllamaClient: omits system message when systemPrompt is null', async () => {
  const { fetch, calls } = fakeFetch(() => okResponse('ok'));
  const client = new OllamaClient({ model: 'llama3.1:8b', fetch });
  await client.send({ prompt: 'hi', systemPrompt: null });
  const body = JSON.parse(calls[0].init.body);
  assert.deepEqual(body.messages, [{ role: 'user', content: 'hi' }]);
});

test('OllamaClient: round-trips sessionId across calls', async () => {
  const { fetch } = fakeFetch(() => okResponse('ok'));
  const client = new OllamaClient({ model: 'llama3.1:8b', fetch });
  const first = await client.send({ prompt: 'a', systemPrompt: 's' });
  const second = await client.send({ prompt: 'b', sessionId: first.sessionId });
  assert.equal(second.sessionId, first.sessionId);
});

test('OllamaClient: throws on non-200 response', async () => {
  const { fetch } = fakeFetch(() => new Response('boom', { status: 500 }));
  const client = new OllamaClient({ model: 'llama3.1:8b', fetch });
  await assert.rejects(client.send({ prompt: 'x' }), /500/);
});

test('OllamaClient: throws on empty message content', async () => {
  const { fetch } = fakeFetch(() => okResponse(''));
  const client = new OllamaClient({ model: 'llama3.1:8b', fetch });
  await assert.rejects(client.send({ prompt: 'x' }), /empty/i);
});

test('OllamaClient: uses custom baseUrl', async () => {
  const { fetch, calls } = fakeFetch(() => okResponse('ok'));
  const client = new OllamaClient({
    model: 'llama3.1:8b', baseUrl: 'http://1.2.3.4:9999', fetch,
  });
  await client.send({ prompt: 'x' });
  assert.equal(calls[0].url, 'http://1.2.3.4:9999/api/chat');
});
