import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { __lastEventSource } from "./setup";

describe("EventSource jsdom mock", () => {
  beforeEach(() => {
    __lastEventSource.set(null);
  });
  afterEach(() => {
    __lastEventSource.set(null);
  });

  it("constructs and records the instance globally", () => {
    const es = new EventSource("/sse/test");
    expect(__lastEventSource.get()).toBe(es);
    expect((es as unknown as { url: string }).url).toBe("/sse/test");
  });

  it("dispatches typed events to addEventListener handlers", () => {
    const es = new EventSource("/sse/test");
    let received: MessageEvent | null = null;
    es.addEventListener("update", (ev) => {
      received = ev as MessageEvent;
    });
    (es as unknown as { _emit: (n: string, d: unknown) => void })._emit("update", {
      score: 7,
    });
    expect(received).not.toBeNull();
    expect(JSON.parse((received as unknown as MessageEvent).data)).toEqual({ score: 7 });
  });

  it("close() removes the global reference", () => {
    const es = new EventSource("/sse/test");
    es.close();
    expect(__lastEventSource.get()).toBeNull();
  });
});
