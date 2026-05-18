import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ExitControls } from "../../src/clients/risk/ExitControls";
import { EndScreen } from "../../src/clients/risk/EndScreen";

describe("ExitControls", () => {
  it("renders a Lobby link to / and a separate Resign button", () => {
    const onResign = vi.fn();
    render(<ExitControls onResign={onResign} />);
    const lobby = screen.getByRole("link", { name: /lobby/i });
    expect(lobby).toHaveAttribute("href", "/");
    const resign = screen.getByRole("button", { name: /resign/i });
    expect(lobby).not.toBe(resign);
    fireEvent.click(resign);
    expect(onResign).toHaveBeenCalledTimes(1);
    fireEvent.click(lobby);
    expect(onResign).toHaveBeenCalledTimes(1); // lobby never resigns
  });
});

describe("EndScreen", () => {
  it("loser sees Defeat and a back-to-lobby link to /", () => {
    render(<EndScreen view={{ winner: 1, youAre: 0 } as any} />);
    expect(screen.getByText(/defeat/i)).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/");
  });
  it("winner sees Victory", () => {
    render(<EndScreen view={{ winner: 0, youAre: 0 } as any} />);
    expect(screen.getByText(/victory/i)).toBeInTheDocument();
  });
});
