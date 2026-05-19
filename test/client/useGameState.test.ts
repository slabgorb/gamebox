// test/client/useGameState.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useGameState } from "../../src/clients/shared/useGameState";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  listeners: Record<string, ((e: unknown) => void)[]> = {};
  url: string;
  closed = false;
  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }
  addEventListener(t: string, fn: (e: unknown) => void) {
    (this.listeners[t] ??= []).push(fn);
  }
  emit(t: string) {
    (this.listeners[t] ?? []).forEach((fn) => fn({}));
  }
  close() {
    this.closed = true;
  }
}

beforeEach(() => {
  FakeEventSource.instances = [];
  (globalThis as any).EventSource = FakeEventSource;
  (globalThis as any).window.__GAME__ = {
    stateUrl: "/state",
    actionUrl: "/action",
    sseUrl: "/sse",
  };
});

function mockFetchSequence(views: unknown[]) {
  let i = 0;
  globalThis.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") {
      return { ok: true, json: async () => ({}) } as Response;
    }
    const body = views[Math.min(i++, views.length - 1)];
    return { ok: true, json: async () => body } as Response;
  }) as unknown as typeof fetch;
}

describe("useGameState", () => {
  it("fetches the initial view (unwrapping data.state) and goes live", async () => {
    mockFetchSequence([{ state: { phase: "attack" } }]);
    const { result } = renderHook(() => useGameState());
    await waitFor(() => expect(result.current.status).toBe("live"));
    expect(result.current.view).toEqual({ phase: "attack" });
    expect(FakeEventSource.instances).toHaveLength(1);
  });

  it("refetches on an SSE 'update' event", async () => {
    mockFetchSequence([{ phase: "attack" }, { phase: "fortify" }]);
    const { result } = renderHook(() => useGameState());
    await waitFor(() => expect(result.current.status).toBe("live"));
    act(() => FakeEventSource.instances[0].emit("update"));
    await waitFor(() =>
      expect(result.current.view).toEqual({ phase: "fortify" }),
    );
  });

  it("post() POSTs JSON then refetches", async () => {
    mockFetchSequence([{ phase: "attack" }, { phase: "attack", n: 2 }]);
    const { result } = renderHook(() => useGameState());
    await waitFor(() => expect(result.current.status).toBe("live"));
    await act(async () => {
      await result.current.post({ type: "end-attack" });
    });
    const calls = (globalThis.fetch as any).mock.calls;
    const post = calls.find((c: any[]) => c[1]?.method === "POST");
    expect(post[0]).toBe("/action");
    expect(JSON.parse(post[1].body)).toEqual({ type: "end-attack" });
  });

  it("surfaces a transient actionError when post fails, no optimistic change", async () => {
    let i = 0;
    globalThis.fetch = vi.fn(async (_u: string, init?: RequestInit) => {
      if (init?.method === "POST")
        return { ok: false, status: 400, json: async () => ({}) } as Response;
      return {
        ok: true,
        json: async () => ({ phase: "attack", tick: i++ }),
      } as Response;
    }) as unknown as typeof fetch;
    const { result } = renderHook(() => useGameState());
    await waitFor(() => expect(result.current.status).toBe("live"));
    const before = result.current.view;
    await act(async () => {
      await result.current.post({ type: "end-attack" }).catch(() => {});
    });
    expect(result.current.actionError).toMatch(/400/);
    expect(result.current.view).toEqual(before); // no optimistic mutation
  });

  it("goes 'reconnecting' on SSE error", async () => {
    mockFetchSequence([{ phase: "attack" }]);
    const { result } = renderHook(() => useGameState());
    await waitFor(() => expect(result.current.status).toBe("live"));
    act(() => FakeEventSource.instances[0].emit("error"));
    await waitFor(() => expect(result.current.status).toBe("reconnecting"));
  });
});
