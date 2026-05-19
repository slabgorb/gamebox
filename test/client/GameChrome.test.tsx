import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { GameChrome } from "../../src/clients/shared/GameChrome";

describe("GameChrome", () => {
  it("renders title, status slot, controls slot, and children", () => {
    const { container, getByText } = render(
      <GameChrome
        title="Cribbage"
        status={<span data-testid="status">Your turn</span>}
        controls={<button data-testid="resign">Resign</button>}
      >
        <main data-testid="game" />
      </GameChrome>,
    );
    expect(getByText("Cribbage")).not.toBeNull();
    expect(container.querySelector('[data-testid="status"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="resign"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="game"]')).not.toBeNull();
  });

  it("renders without controls slot", () => {
    const { container } = render(
      <GameChrome title="X" status={<span>idle</span>}>
        <div />
      </GameChrome>,
    );
    expect(container.querySelector("header")).not.toBeNull();
  });
});
