import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { OpponentCard } from "../../src/clients/shared/OpponentCard";

describe("OpponentCard", () => {
  it("renders nothing when personaId is null", () => {
    const { container } = render(
      <OpponentCard personaId={null} friendlyName="Bot" />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders portrait wrapper, name strip, and the persona image with alt", () => {
    const { container } = render(
      <OpponentCard
        personaId="amos"
        friendlyName="Amos Burton"
        color="#f59e0b"
        glyph="?"
      />,
    );
    expect(container.querySelector(".opp-card")).not.toBeNull();
    expect(container.querySelector(".opp-card__portrait")).not.toBeNull();
    expect(container.querySelector(".opp-card__name")!.textContent).toBe("Amos Burton");
    const img = container.querySelector("img.opp-card__img") as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/shared/portraits/amos.png");
    expect(img.getAttribute("alt")).toBe("Amos Burton");
    expect(container.querySelector(".opp-card__fallback")!.textContent).toBe("?");
  });

  it("renders children inside the card root (for banter composition)", () => {
    const { container } = render(
      <OpponentCard personaId="amos" friendlyName="Amos">
        <div data-testid="banter-slot" />
      </OpponentCard>,
    );
    const slot = container.querySelector('[data-testid="banter-slot"]');
    expect(slot).not.toBeNull();
    expect(slot!.closest(".opp-card")).not.toBeNull();
  });
});
