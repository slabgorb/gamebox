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
