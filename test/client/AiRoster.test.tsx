import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AiRoster, type BotSeat } from "../../src/clients/shared/AiRoster";
import { __lastEventSource } from "./setup";

const bots: BotSeat[] = [
  { seat: 1, userId: 11, personaId: "hattie", friendlyName: "Hattie", color: "#a00" },
  { seat: 2, userId: 12, personaId: "the-shark", friendlyName: "Shark", color: "#0a0" },
  { seat: 3, userId: 13, personaId: "doofi", friendlyName: "Doofi", color: "#00a" },
];

function emit(type: string, data: unknown) {
  __lastEventSource.get()!._emit(type, data);
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AiRoster", () => {
  it("renders one card per bot seat", () => {
    const { container } = render(
      <AiRoster bots={bots} gameId={7} userId={1} sseUrl="/api/games/7/events" />,
    );
    expect(container.querySelectorAll(".opp-card").length).toBe(3);
  });

  it("routes a banter event to the matching persona's card only", async () => {
    render(<AiRoster bots={bots} gameId={7} userId={1} sseUrl="/api/games/7/events" />);
    emit("banter", { personaId: "the-shark", displayName: "Shark", text: "boom" });
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
    // Only one bubble in the DOM.
    expect(document.querySelectorAll(".opp-card__bubble").length).toBe(1);
  });

  it("shows a stall badge for the stalled bot and retries with its botUserId", async () => {
    render(<AiRoster bots={bots} gameId={7} userId={1} sseUrl="/api/games/7/events" />);
    emit("bot_stalled", { personaId: "doofi", displayName: "Doofi", reason: "invalid_response" });
    const retry = await screen.findByRole("button", { name: /retry/i });
    await userEvent.click(retry);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/games/7/ai/retry",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ botUserId: 13 }),
      }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: /retry/i })).toBeNull(),
    );
  });

  it("broadcasts a chat message to every bot", async () => {
    render(<AiRoster bots={bots} gameId={7} userId={1} sseUrl="/api/games/7/events" />);
    const input = screen.getByPlaceholderText(/talk smack/i);
    await userEvent.type(input, "hello bots{enter}");
    await waitFor(() => {
      const chatCalls = fetchMock.mock.calls.filter((c) => c[0] === "/api/games/7/chat");
      expect(chatCalls.length).toBe(3);
    });
    const sentBotIds = fetchMock.mock.calls
      .filter((c) => c[0] === "/api/games/7/chat")
      .map((c) => JSON.parse((c[1] as RequestInit).body as string).botUserId)
      .sort((a, b) => a - b);
    expect(sentBotIds).toEqual([11, 12, 13]);
  });

  it("renders nothing when there are no bots", () => {
    const { container } = render(
      <AiRoster bots={[]} gameId={7} userId={1} sseUrl="/api/games/7/events" />,
    );
    expect(container.querySelector(".ai-roster")).toBeNull();
  });

  it("shows a thinking bubble for the matching bot and clears it on update", async () => {
    render(<AiRoster bots={bots} gameId={7} userId={1} sseUrl="/api/games/7/events" />);
    emit("bot_thinking", { personaId: "hattie", displayName: "Hattie" });
    await waitFor(() => expect(screen.getByText(/Hattie is thinking/i)).toBeInTheDocument());
    expect(document.querySelectorAll(".opp-card__bubble").length).toBe(1);
    emit("update", {});
    await waitFor(() =>
      expect(document.querySelectorAll(".opp-card__bubble").length).toBe(0),
    );
  });

  it("flashes a failure message when a chat broadcast POST fails", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "nope" }) });
    render(<AiRoster bots={bots} gameId={7} userId={1} sseUrl="/api/games/7/events" />);
    const input = screen.getByPlaceholderText(/talk smack/i);
    await userEvent.type(input, "hi{enter}");
    await waitFor(() =>
      expect(screen.getByText(/message failed to send/i)).toBeInTheDocument(),
    );
  });

  it("abandons the game with no request body", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });
    render(<AiRoster bots={bots} gameId={7} userId={1} sseUrl="/api/games/7/events" />);
    emit("bot_stalled", { personaId: "hattie", displayName: "Hattie", reason: "invalid_response" });
    const abandon = await screen.findByRole("button", { name: /abandon game/i });
    await userEvent.click(abandon);
    expect(fetchMock).toHaveBeenCalledWith("/api/games/7/ai/abandon", { method: "POST" });
  });
});
