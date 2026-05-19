import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { __lastEventSource } from "./setup";
import { OpponentBanter } from "../../src/clients/shared/OpponentBanter";

function emit(type: string, data: unknown) {
  const es = __lastEventSource.get();
  if (!es) throw new Error("no EventSource");
  (es as unknown as { _emit: (n: string, d: unknown) => void })._emit(type, data);
}

describe("OpponentBanter — bubble + thinking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    __lastEventSource.set(null);
  });

  it("opens an EventSource on the supplied sseUrl", () => {
    render(
      <OpponentBanter gameId={1} userId={42} sseUrl="/sse/g/1" friendlyName="Amos" />,
    );
    const es = __lastEventSource.get();
    expect(es).not.toBeNull();
    expect((es as unknown as { url: string }).url).toBe("/sse/g/1");
  });

  it("shows the banter bubble with the emitted text", () => {
    const { container } = render(
      <OpponentBanter gameId={1} userId={42} sseUrl="/sse/g/1" friendlyName="Amos" />,
    );
    act(() => emit("banter", { text: "Nice peg." }));
    const bubble = container.querySelector(".opp-card__bubble");
    expect(bubble).not.toBeNull();
    expect(bubble!.textContent).toContain("Nice peg.");
  });

  it("shows thinking dots on bot_thinking and clears them on update", () => {
    const { container } = render(
      <OpponentBanter gameId={1} userId={42} sseUrl="/sse/g/1" friendlyName="Amos" />,
    );
    act(() => emit("bot_thinking", { displayName: "Amos" }));
    expect(container.querySelector(".opp-card__dots")).not.toBeNull();
    expect(container.querySelector(".opp-card__bubble")!.textContent).toContain(
      "Amos is thinking",
    );
    act(() => emit("update", {}));
    expect(container.querySelector(".opp-card__dots")).toBeNull();
  });

  it("hides the bubble after 5400ms (5s display + 400ms fade)", () => {
    const { container } = render(
      <OpponentBanter gameId={1} userId={42} sseUrl="/sse/g/1" friendlyName="Amos" />,
    );
    act(() => emit("banter", { text: "Fifteen-two." }));
    expect(container.querySelector(".opp-card__bubble")).not.toBeNull();
    act(() => {
      vi.advanceTimersByTime(5400);
    });
    expect(container.querySelector(".opp-card__bubble")).toBeNull();
  });

  it("closes the EventSource on unmount", () => {
    const { unmount } = render(
      <OpponentBanter gameId={1} userId={42} sseUrl="/sse/g/1" friendlyName="Amos" />,
    );
    const es = __lastEventSource.get();
    expect(es).not.toBeNull();
    unmount();
    expect(__lastEventSource.get()).toBeNull();
  });
});

describe("OpponentBanter — stall surface", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
    vi.stubGlobal("confirm", vi.fn(() => true));
    // location.reload tampering: replace just .reload
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: vi.fn() },
    });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    __lastEventSource.set(null);
  });

  it("shows stall banner with reason on bot_stalled", () => {
    const { container } = render(
      <OpponentBanter gameId={7} userId={42} sseUrl="/sse/g/7" friendlyName="Amos" />,
    );
    act(() => emit("bot_stalled", { displayName: "Amos", reason: "timeout" }));
    const stall = container.querySelector(".opp-card__stall");
    expect(stall).not.toBeNull();
    expect(stall!.textContent).toContain("Amos froze up (timeout)");
    expect(container.querySelector("button.opp-card__retry")).not.toBeNull();
    expect(container.querySelector("button.opp-card__abandon")).not.toBeNull();
  });

  it("retry button POSTs to /api/games/:id/ai/retry and clears the stall on OK", async () => {
    const { container } = render(
      <OpponentBanter gameId={7} userId={42} sseUrl="/sse/g/7" friendlyName="Amos" />,
    );
    act(() => emit("bot_stalled", { displayName: "Amos", reason: "timeout" }));
    const btn = container.querySelector("button.opp-card__retry") as HTMLButtonElement;
    await act(async () => {
      btn.click();
    });
    expect(fetch).toHaveBeenCalledWith("/api/games/7/ai/retry", { method: "POST" });
    expect(container.querySelector(".opp-card__stall")).toBeNull();
  });

  it("abandon button confirms, POSTs to /ai/abandon, then reloads on OK", async () => {
    const { container } = render(
      <OpponentBanter gameId={7} userId={42} sseUrl="/sse/g/7" friendlyName="Amos" />,
    );
    act(() => emit("bot_stalled", { displayName: "Amos", reason: "timeout" }));
    const btn = container.querySelector("button.opp-card__abandon") as HTMLButtonElement;
    await act(async () => {
      btn.click();
    });
    expect(confirm).toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith("/api/games/7/ai/abandon", { method: "POST" });
    expect(window.location.reload).toHaveBeenCalled();
  });
});

describe("OpponentBanter — trash talk", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 200 })),
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    __lastEventSource.set(null);
  });

  it("renders a chat form with input and submit button", () => {
    const { container } = render(
      <OpponentBanter gameId={9} userId={42} sseUrl="/sse/g/9" friendlyName="Amos" />,
    );
    expect(container.querySelector("form.opp-card__chat")).not.toBeNull();
    expect(
      container.querySelector("form.opp-card__chat input[type=text]"),
    ).not.toBeNull();
  });

  it("submit POSTs to /api/games/:id/chat with the typed text", async () => {
    const { container } = render(
      <OpponentBanter gameId={9} userId={42} sseUrl="/sse/g/9" friendlyName="Amos" />,
    );
    const form = container.querySelector("form.opp-card__chat") as HTMLFormElement;
    const input = form.querySelector("input") as HTMLInputElement;
    await act(async () => {
      input.value = "git gud";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    expect(fetch).toHaveBeenCalledWith(
      "/api/games/9/chat",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "git gud" }),
      }),
    );
  });

  it("flashes my-bubble when user_chat arrives with my userId", () => {
    const { container } = render(
      <OpponentBanter gameId={9} userId={42} sseUrl="/sse/g/9" friendlyName="Amos" />,
    );
    act(() => emit("user_chat", { userId: 42, text: "hi" }));
    const flash = container.querySelector(".opp-card__my-bubble");
    expect(flash).not.toBeNull();
    expect(flash!.textContent).toBe("hi");
  });

  it("ignores user_chat for other users", () => {
    const { container } = render(
      <OpponentBanter gameId={9} userId={42} sseUrl="/sse/g/9" friendlyName="Amos" />,
    );
    act(() => emit("user_chat", { userId: 99, text: "not me" }));
    expect(container.querySelector(".opp-card__my-bubble")).toBeNull();
  });
});
