import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { rollOffWinner, rollOffRows } from "../../src/clients/risk/rollOff";
import { RollOffPanel } from "../../src/clients/risk/RollOffPanel";

// E5-7 AC4 — the setup-phase UI surfaces the pre-game roll-off so players see
// each seat's d6 and who won the first move. `view.turnOrderRolls` is the E5-3
// server seam (index = seat, value = the seat's roll). The client must select
// the winner the SAME way the server did (`firstPlayer`): highest roll, ties
// broken to the lowest seat index. Absent rolls render nothing.
//
// These pins fail RED because src/clients/risk/rollOff.ts and RollOffPanel.tsx
// do not exist yet.

describe("rollOff: winner selection mirrors server firstPlayer (E5-7 AC4)", () => {
  it("picks the highest roller as the winner", () => {
    expect(rollOffWinner([2, 5, 3])).toBe(1);
    expect(rollOffWinner([4, 1, 6, 2])).toBe(2);
  });

  it("breaks ties to the lowest seat index (matches server firstPlayer)", () => {
    expect(rollOffWinner([6, 6, 3])).toBe(0);
    expect(rollOffWinner([3, 6, 6])).toBe(1);
  });

  it("honours seat 0 as a legitimate winner — 0 is not falsy (rule #4)", () => {
    expect(rollOffWinner([6, 2, 1])).toBe(0);
  });

  it("returns null when there is no roll-off to show", () => {
    expect(rollOffWinner([])).toBe(null);
    expect(rollOffWinner(undefined)).toBe(null);
  });
});

describe("rollOff: per-seat display rows (E5-7 AC4)", () => {
  it("maps each seat to its roll with exactly one winner flagged", () => {
    expect(rollOffRows([2, 5, 3])).toEqual([
      { seat: 0, roll: 2, isWinner: false },
      { seat: 1, roll: 5, isWinner: true },
      { seat: 2, roll: 3, isWinner: false },
    ]);
  });

  it("flags exactly one winner on a tie (no double highlight)", () => {
    const rows = rollOffRows([6, 6, 3]);
    expect(rows.filter((r) => r.isWinner)).toEqual([
      { seat: 0, roll: 6, isWinner: true },
    ]);
  });

  it("returns an empty list when rolls are absent", () => {
    expect(rollOffRows([])).toEqual([]);
    expect(rollOffRows(undefined)).toEqual([]);
  });
});

describe("RollOffPanel renders the roll-off result (E5-7 AC4 wiring)", () => {
  it("shows each seat's roll and marks the winning seat", () => {
    const view = { phase: "setup", turnOrderRolls: [2, 5, 3] } as any;
    const { container } = render(<RollOffPanel view={view} />);

    expect(container.querySelector('[data-seat="0"]')?.textContent).toContain("2");
    expect(container.querySelector('[data-seat="1"]')?.textContent).toContain("5");
    expect(container.querySelector('[data-seat="2"]')?.textContent).toContain("3");

    const winners = container.querySelectorAll('[data-winner="true"]');
    expect(winners.length).toBe(1);
    expect(winners[0].getAttribute("data-seat")).toBe("1");
  });

  it("renders nothing when the view carries no roll-off", () => {
    const view = { phase: "setup" } as any;
    const { container } = render(<RollOffPanel view={view} />);
    expect(container.firstChild).toBe(null);
  });
});
