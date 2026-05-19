import { describe, it, expect, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { createRef } from "react";
import { DiceTray, type DiceTrayHandle } from "../../src/clients/shared/DiceTray";

class StubDiceTray extends HTMLElement {
  thrown: unknown[] = [];
  throw(params: unknown) {
    this.thrown.push(params);
    // Simulate physics settling on the next tick.
    setTimeout(() => {
      this.dispatchEvent(
        new CustomEvent("dice-settle", {
          detail: { values: [4, 2, 6], throwParams: [] },
        }),
      );
    }, 0);
  }
  reset() {}
}

beforeAll(() => {
  if (!customElements.get("dice-tray")) {
    customElements.define("dice-tray", StubDiceTray);
  }
});

describe("DiceTray", () => {
  it("roll(count) calls the element's throw() and resolves with settled values", async () => {
    const ref = createRef<DiceTrayHandle>();
    render(<DiceTray ref={ref} themeColor="#c33" />);
    const values = await ref.current!.roll(3);
    expect(values).toEqual([4, 2, 6]);
  });
});
