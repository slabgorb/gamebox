import { describe, it, expect, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";
import { DiceTray, type DiceTrayHandle } from "../../src/clients/shared/DiceTray";

class StubDiceTray extends HTMLElement {
  thrown: unknown[] = [];
  thrownBatches: unknown[][] = [];
  throw(params: unknown) {
    this.thrown.push(params);
    this.settle();
  }
  throwAll(paramsList: unknown[]) {
    this.thrownBatches.push(paramsList);
    for (const p of paramsList) this.thrown.push(p);
    this.settle();
  }
  reset() {}
  private settle() {
    // Simulate physics settling on the next tick.
    setTimeout(() => {
      this.dispatchEvent(
        new CustomEvent("dice-settle", {
          detail: { values: [4, 2, 6], throwParams: [] },
        }),
      );
    }, 0);
  }
}

beforeAll(() => {
  if (!customElements.get("dice-tray")) {
    customElements.define("dice-tray", StubDiceTray);
  }
});

describe("DiceTray", () => {
  it("roll(count) submits a batch throw and resolves with settled values", async () => {
    const ref = createRef<DiceTrayHandle>();
    const { container } = render(<DiceTray ref={ref} themeColor="#c33" />);
    const values = await ref.current!.roll(3);
    expect(values).toEqual([4, 2, 6]);

    // Bug guard: roll(N) must send N *distinct* throw params via throwAll, not
    // N identical params via individual throw() calls. Same params on
    // non-colliding dice = always-doubles.
    const el = container.querySelector("dice-tray") as unknown as StubDiceTray;
    expect(el.thrownBatches).toHaveLength(1);
    expect(el.thrownBatches[0]).toHaveLength(3);
    // Sanity: at least two of the three are not reference-equal.
    const batch = el.thrownBatches[0];
    expect(new Set(batch).size).toBeGreaterThan(1);
  });
});
