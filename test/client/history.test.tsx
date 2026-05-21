// test/client/history.test.tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { History } from "../../src/clients/risk/History";

describe("History (chronicle)", () => {
  it("renders kind-specific lines in antique prose", () => {
    render(
      <History
        log={[
          { kind: "attack", player: 0, from: "A", to: "B", captured: true } as any,
          { kind: "fortify", player: 1, from: "C", to: "D", count: 3 } as any,
          { kind: "end-turn", next: 0 } as any,
        ]}
      />,
    );
    // Attack: who/from/to + Captured verdict pip
    expect(screen.getByText(/marched from/i)).toBeInTheDocument();
    expect(screen.getByText(/Captured/)).toBeInTheDocument();
    // Fortify count appears in its verdict pip
    expect(screen.getByText(/×3/)).toBeInTheDocument();
    // End-turn line cites the next player
    expect(screen.getByText(/Turn to/i)).toBeInTheDocument();
  });

  it("shows an empty-chronicle hint when the log is empty", () => {
    render(<History log={[]} />);
    expect(screen.getByText(/no moves yet/i)).toBeInTheDocument();
  });
});
