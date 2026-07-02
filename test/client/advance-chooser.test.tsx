// E5-10: AdvanceChooser — the post-conquest "how many armies march in?" UI
// that slots into the E5-1 interactive attack overlay.
//
// Contract: <AdvanceChooser min max onChoose /> renders a slider over
// [min, max] (default value: max — commit forward, matching the old all-in
// behavior) plus a confirm button that fires onChoose(value) exactly once.
// When min === max the choice is forced (AC-3): no slider, no button —
// onChoose(min) fires automatically.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdvanceChooser } from "../../src/clients/risk/AdvanceChooser";

describe("AdvanceChooser", () => {
  it("renders a slider spanning [min, max] with max preselected", () => {
    render(<AdvanceChooser min={3} max={9} onChoose={vi.fn()} />);
    const slider = screen.getByRole("slider");
    expect(slider).toHaveAttribute("min", "3");
    expect(slider).toHaveAttribute("max", "9");
    expect((slider as HTMLInputElement).value).toBe("9");
  });

  it("confirming the default choice fires onChoose(max) once", () => {
    const onChoose = vi.fn();
    render(<AdvanceChooser min={3} max={9} onChoose={onChoose} />);
    fireEvent.click(screen.getByRole("button", { name: /advance/i }));
    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith(9);
  });

  it("moving the slider to min and confirming fires onChoose(min)", () => {
    const onChoose = vi.fn();
    render(<AdvanceChooser min={3} max={9} onChoose={onChoose} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: /advance/i }));
    expect(onChoose).toHaveBeenCalledWith(3);
  });

  it("shows the currently selected count so the player can see the split", () => {
    render(<AdvanceChooser min={3} max={9} onChoose={vi.fn()} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "5" } });
    // The chosen number must be visible somewhere in the chooser.
    expect(screen.getAllByText(/5/).length).toBeGreaterThan(0);
  });

  it("forced range (min === max): fires onChoose(min) automatically with no chooser UI (AC-3)", async () => {
    const onChoose = vi.fn();
    render(<AdvanceChooser min={2} max={2} onChoose={onChoose} />);
    await waitFor(() => expect(onChoose).toHaveBeenCalledTimes(1));
    expect(onChoose).toHaveBeenCalledWith(2);
    expect(screen.queryByRole("slider")).toBeNull();
    expect(screen.queryByRole("button", { name: /advance/i })).toBeNull();
  });
});
