import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { colorSlots } from "../../src/clients/risk/colorSlots";
import { ColorPicker } from "../../src/clients/risk/ColorPicker";
import { SEAT_LABEL, SEAT_HEX } from "../../src/clients/risk/themes";

// E5-9 — per-seat colour picker (client). Mounts in the setup phase next to
// RollOffPanel. `view.colors` is the seat->slot map (E5-3 seam); each of the 4
// palette slots is held by at most one seat (the server keeps colours an
// injection via swap). The picker shows all 4 slots, marks the viewer's own,
// and posts a `pick-color` action when a slot is chosen.
//
// Fails RED because colorPicker.ts / ColorPicker.tsx do not exist yet.

describe("colorSlots view-model", () => {
  it("maps each palette slot to the seat that holds it and flags the viewer's own", () => {
    const slots = colorSlots({ colors: [0, 1, 2, 3], youAre: 0 });
    expect(slots).toHaveLength(SEAT_LABEL.length); // 4
    expect(slots[0]).toMatchObject({ slot: 0, label: SEAT_LABEL[0], hex: SEAT_HEX[0], takenBy: 0, isMine: true });
    expect(slots[1]).toMatchObject({ slot: 1, takenBy: 1, isMine: false });
    expect(slots[3]).toMatchObject({ slot: 3, takenBy: 3, isMine: false });
  });

  it("reflects a swap — the viewer's chosen slot is 'mine', its old slot is another seat's", () => {
    const slots = colorSlots({ colors: [2, 1, 0, 3], youAre: 0 }); // seat 0 swapped to slot 2
    expect(slots[2]).toMatchObject({ slot: 2, takenBy: 0, isMine: true });
    expect(slots[0]).toMatchObject({ slot: 0, takenBy: 2, isMine: false });
  });

  it("marks a slot no seat holds as free (takenBy null) — e.g. 2P leaves slots 2,3 open", () => {
    const slots = colorSlots({ colors: [0, 1], youAre: 0 });
    expect(slots[2]).toMatchObject({ slot: 2, takenBy: null, isMine: false });
    expect(slots[3]).toMatchObject({ slot: 3, takenBy: null, isMine: false });
    expect(slots[0]).toMatchObject({ takenBy: 0, isMine: true });
  });
});

describe("ColorPicker component", () => {
  const view = { colors: [0, 1, 2, 3], youAre: 0, phase: "setup" } as never;

  it("renders one swatch per palette slot", () => {
    const { container } = render(<ColorPicker view={view} post={() => {}} />);
    expect(container.querySelectorAll("button[data-slot]")).toHaveLength(SEAT_LABEL.length);
  });

  it("marks the viewer's current slot as theirs", () => {
    const { container } = render(<ColorPicker view={view} post={() => {}} />);
    const mine = container.querySelectorAll('button[data-slot][data-mine="true"]');
    expect(mine).toHaveLength(1);
    expect(mine[0].getAttribute("data-slot")).toBe("0"); // colors[youAre=0] === 0
  });

  it("posts a pick-color action with the chosen slot when a swatch is clicked", () => {
    const post = vi.fn();
    const { container } = render(<ColorPicker view={view} post={post} />);
    const swatch2 = container.querySelector('button[data-slot="2"]') as HTMLButtonElement;
    fireEvent.click(swatch2);
    expect(post).toHaveBeenCalledWith({ type: "pick-color", payload: { color: 2 } });
  });

  it("does not fire when the viewer clicks the slot they already hold (no wasted action)", () => {
    const post = vi.fn();
    const { container } = render(<ColorPicker view={view} post={post} />);
    const mySwatch = container.querySelector('button[data-slot="0"]') as HTMLButtonElement;
    fireEvent.click(mySwatch);
    expect(post).not.toHaveBeenCalled();
  });
});
