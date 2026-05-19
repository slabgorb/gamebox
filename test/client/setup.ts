// test/client/setup.ts
import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";

// jsdom in this environment ships a broken localStorage (no methods). Until
// the underlying jsdom config can be fixed, provide a minimal in-memory stub
// and reset it between tests so state cannot leak across files.
const store: Record<string, string> = {};
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => (key in store ? store[key] : null),
  setItem: (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: (key: string) => {
    delete store[key];
  },
  clear: () => {
    for (const key of Object.keys(store)) delete store[key];
  },
  key: (index: number) => Object.keys(store)[index] ?? null,
  get length() {
    return Object.keys(store).length;
  },
};

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});

// jsdom does not ship an EventSource — provide a tiny test-only stub.
// Tests grab the most-recent instance via __lastEventSource and call
// instance._emit(name, data) to dispatch synthetic SSE events.

class FakeEventSource implements EventTarget {
  readonly url: string;
  readonly listeners = new Map<string, Set<EventListener>>();
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSED = 2;
  readyState = 1;
  onopen: ((this: EventSource, ev: Event) => unknown) | null = null;
  onmessage: ((this: EventSource, ev: MessageEvent) => unknown) | null = null;
  onerror: ((this: EventSource, ev: Event) => unknown) | null = null;
  withCredentials = false;

  constructor(url: string) {
    this.url = url;
    __lastEventSource.set(this as unknown as EventSource);
  }

  addEventListener(type: string, listener: EventListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }
  dispatchEvent(event: Event): boolean {
    this.listeners.get(event.type)?.forEach((l) => l(event));
    return true;
  }
  close() {
    this.readyState = this.CLOSED;
    if (__lastEventSource.get() === (this as unknown as EventSource)) {
      __lastEventSource.set(null);
    }
  }

  // Test helper: dispatch a typed SSE event with JSON-encoded payload.
  _emit(type: string, data: unknown) {
    const ev = new MessageEvent(type, { data: JSON.stringify(data) });
    this.dispatchEvent(ev);
  }
}

class LastRef {
  private value: EventSource | null = null;
  get() {
    return this.value;
  }
  set(v: EventSource | null) {
    this.value = v;
  }
}

export const __lastEventSource = new LastRef();

(globalThis as unknown as { EventSource: typeof EventSource }).EventSource =
  FakeEventSource as unknown as typeof EventSource;
