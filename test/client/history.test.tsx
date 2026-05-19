// test/client/history.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { History } from "../../src/clients/risk/History";

describe("History", () => {
  it("renders the last 12 entries with kind-specific text", () => {
    render(
      <History
        log={[
          { kind: "attack", player: 0, from: "A", to: "B", captured: true } as any,
          { kind: "fortify", player: 1, from: "C", to: "D", count: 3 } as any,
          { kind: "end-turn", next: 0 } as any,
        ]}
      />,
    );
    expect(screen.getByText(/attacked A→B \(captured\)/)).toBeInTheDocument();
    expect(screen.getByText(/fortified C→D ×3/)).toBeInTheDocument();
    expect(screen.getByText(/turn to P0/)).toBeInTheDocument();
  });
});
