import { randomUUID } from 'node:crypto';

export class OllamaClient {
  constructor({
    model,
    baseUrl = 'http://localhost:11434',
    timeoutMs = 180_000,
    fetch: fetchImpl = globalThis.fetch,
  } = {}) {
    if (!model) throw new Error('OllamaClient: model is required');
    this._model = model;
    this._baseUrl = baseUrl.replace(/\/+$/, '');
    this._timeoutMs = timeoutMs;
    this._fetch = fetchImpl;
    // Ollama is stateless; callers built for stateful backends (e.g. the Claude
    // CLI's --resume) only send systemPrompt on the first call. Cache it per
    // sessionId so the persona persists across turns within a game.
    this._systemPromptBySession = new Map();
  }

  async send({ prompt, sessionId, systemPrompt }) {
    const effectiveSession = sessionId ?? randomUUID();
    const effectiveSystem = systemPrompt
      ?? this._systemPromptBySession.get(effectiveSession)
      ?? null;
    if (systemPrompt) this._systemPromptBySession.set(effectiveSession, systemPrompt);

    const messages = [];
    if (effectiveSystem) messages.push({ role: 'system', content: effectiveSystem });
    messages.push({ role: 'user', content: prompt });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this._timeoutMs);
    let res;
    try {
      res = await this._fetch(`${this._baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model: this._model, messages, stream: false }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`OllamaClient: HTTP ${res.status}: ${body.slice(0, 200)}`);
    }

    const data = await res.json();
    const text = data?.message?.content ?? '';
    if (!text) throw new Error('OllamaClient: empty response content');

    return { text, sessionId: effectiveSession };
  }
}
