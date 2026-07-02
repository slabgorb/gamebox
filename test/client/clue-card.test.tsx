import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { ClueCard } from "../../src/clients/clue/ClueCard";

describe("ClueCard", () => {
  it("renders a suspect portrait with the persona filename src and label", () => {
    const { container } = render(<ClueCard id="scarlett" />);
    const root = container.querySelector(".clue-card")!;
    expect(root).not.toBeNull();
    expect(root.classList.contains("clue-card--suspect")).toBe(true);
    expect(root.getAttribute("data-card")).toBe("scarlett");
    const img = container.querySelector("img.clue-card__img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/shared/portraits/miss-scarlett.png");
    expect(img.getAttribute("alt")).toBe("Miss Scarlett");
    expect(container.querySelector(".clue-card__label")!.textContent).toBe("Miss Scarlett");
  });

  it("renders the glyph fallback layer behind the portrait img", () => {
    const { container } = render(<ClueCard id="leadpipe" />);
    // The glyph is always present as the fallback layer; onError removes the
    // img so the glyph shows through only if the portrait fails to load.
    expect(container.querySelector(".clue-card__glyph")!.textContent).toBe("🩹");
    const img = container.querySelector("img.clue-card__img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/shared/portraits/leadpipe.png");
    expect(container.querySelector(".clue-card__label")!.textContent).toBe("Lead Pipe");
    expect(container.querySelector(".clue-card--weapon")).not.toBeNull();
  });

  it("renders a caption when provided (ledger attribution)", () => {
    const { container } = render(<ClueCard id="knife" caption="(Scarlett)" />);
    expect(container.querySelector(".clue-card__caption")!.textContent).toBe("(Scarlett)");
  });

  it("is a non-interactive span with no onClick", () => {
    const { container } = render(<ClueCard id="study" />);
    expect(container.querySelector("button")).toBeNull();
    expect(container.querySelector("span.clue-card")).not.toBeNull();
  });

  it("removes the img and reveals the glyph fallback when the portrait fails to load", () => {
    const { container } = render(<ClueCard id="scarlett" />);
    const img = container.querySelector("img.clue-card__img") as HTMLImageElement;
    expect(img).not.toBeNull();
    fireEvent.error(img);
    expect(container.querySelector("img.clue-card__img")).toBeNull();
    expect(container.querySelector(".clue-card__glyph")).not.toBeNull();
  });

  it("is a button that fires onClick with its id when pickable", () => {
    const onClick = vi.fn();
    const { container } = render(<ClueCard id="rope" onClick={onClick} selected />);
    const btn = container.querySelector("button.clue-card") as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.getAttribute("data-card")).toBe("rope");
    expect(btn.classList.contains("is-selected")).toBe(true);
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalledWith("rope");
  });
});
