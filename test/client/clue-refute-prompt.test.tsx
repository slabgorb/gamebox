import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { RefutePrompt } from "../../src/clients/clue/RefutePrompt";

// Minimal view: seat 0 suggested scarlett·knife·study; our hand holds
// scarlett + knife (+ an unrelated card), so refuteChoices => [scarlett, knife].
const view = {
  suggestion: { bySeat: 0, suspect: "scarlett", weapon: "knife", room: "study" },
  hand: ["scarlett", "knife", "ballroom"],
} as any;

describe("RefutePrompt with ClueCard", () => {
  it("renders one pickable ClueCard per refutable choice", () => {
    const { container } = render(<RefutePrompt view={view} onShow={() => {}} />);
    const cards = container.querySelectorAll("button.clue-card");
    expect(cards.length).toBe(2);
    const ids = Array.from(cards).map((c) => c.getAttribute("data-card")).sort();
    expect(ids).toEqual(["knife", "scarlett"]);
  });

  it("calls onShow with the card id when a card is clicked", () => {
    const onShow = vi.fn();
    const { container } = render(<RefutePrompt view={view} onShow={onShow} />);
    const knife = container.querySelector('button.clue-card[data-card="knife"]') as HTMLButtonElement;
    fireEvent.click(knife);
    expect(onShow).toHaveBeenCalledWith("knife");
  });
});
