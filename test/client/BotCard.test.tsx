import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BotCard } from "../../src/clients/shared/BotCard";

describe("BotCard", () => {
  it("renders the persona portrait and name", () => {
    const { container } = render(
      <BotCard
        personaId="hattie" friendlyName="Hattie" color="#a00" glyph="x"
        bubble={null} stall={null} onRetry={vi.fn()}
      />,
    );
    const card = container.querySelector(".opp-card");
    expect(card).not.toBeNull();
    expect(card!.querySelector(".opp-card__name")!.textContent).toBe("Hattie");
    const img = card!.querySelector("img.opp-card__img");
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("/shared/portraits/hattie.png");
  });

  it("shows a banter bubble when bubble is set", () => {
    render(
      <BotCard
        personaId="hattie" friendlyName="Hattie"
        bubble={{ text: "ha!", thinking: false }} stall={null} onRetry={vi.fn()}
      />,
    );
    expect(screen.getByText("ha!")).toBeInTheDocument();
  });

  it("shows a stall badge with Retry and fires onRetry", async () => {
    const onRetry = vi.fn();
    render(
      <BotCard
        personaId="hattie" friendlyName="Hattie"
        bubble={null} stall={{ reason: "invalid_response" }} onRetry={onRetry}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("renders the thinking dots when bubble.thinking is true", () => {
    const { container } = render(
      <BotCard
        personaId="hattie" friendlyName="Hattie"
        bubble={{ text: "Hattie is thinking", thinking: true }} stall={null} onRetry={vi.fn()}
      />,
    );
    expect(container.querySelector(".opp-card__dots")).not.toBeNull();
  });
});
