import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionBar } from "../../src/clients/risk/ActionBar";

const base = {
  youAre: 0,
  currentPlayer: 0,
  territories: { A: { owner: 0, armies: 5 }, B: { owner: 1, armies: 2 } },
} as any;

describe("ActionBar", () => {
  it("waiting message when not your turn", () => {
    render(
      <ActionBar
        view={{ ...base, currentPlayer: 1, phase: "attack" }}
        pending={{}}
        post={vi.fn()}
        setPending={vi.fn()}
        onAttack={vi.fn()}
      />,
    );
    expect(screen.getByText(/waiting for opponent/i)).toBeInTheDocument();
  });

  it("attack phase: Attack button calls onAttack(from,to), not post", () => {
    const onAttack = vi.fn();
    const post = vi.fn();
    render(
      <ActionBar
        view={{ ...base, phase: "attack" }}
        pending={{ from: "A", to: "B" }}
        post={post}
        setPending={vi.fn()}
        onAttack={onAttack}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /^attack$/i }));
    expect(onAttack).toHaveBeenCalledWith("A", "B");
    expect(post).not.toHaveBeenCalled();
  });

  it("attack phase: Done attacking posts end-attack", () => {
    const post = vi.fn();
    render(
      <ActionBar
        view={{ ...base, phase: "attack" }}
        pending={{}}
        post={post}
        setPending={vi.fn()}
        onAttack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /done attacking/i }));
    expect(post).toHaveBeenCalledWith({ type: "end-attack" });
  });

  it("fortify phase: End turn posts end-turn", () => {
    const post = vi.fn();
    render(
      <ActionBar
        view={{ ...base, phase: "fortify" }}
        pending={{}}
        post={post}
        setPending={vi.fn()}
        onAttack={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /end turn/i }));
    expect(post).toHaveBeenCalledWith({ type: "end-turn" });
  });
});
