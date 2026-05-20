// CROSS-BUG-2 — Tuner hooks exposed through the shared React wrapper.
//
// Story scope: "library exposes a tuner so we can adjust camera, jitter,
// trajectory, and slide-final behavior per game." Per-game tuning means each
// consumer (risk, backgammon, future games) must be able to pass tuning
// overrides through the shared `<DiceTray>` React wrapper, which forwards
// them to the underlying `<dice-tray>` element. The lib's DiceTrayElement is
// then responsible for applying the overrides to DiceScene.

import { describe, it, expect, beforeAll } from "vitest";
import { render } from "@testing-library/react";
import { DiceTray } from "../../src/clients/shared/DiceTray";

class StubDiceTray extends HTMLElement {
  static observedAttributes = ["tuning", "dice", "mode", "theme"];
  attrs: Record<string, string | null> = {};
  throw() {}
  throwAll() {}
  reset() {}
  attributeChangedCallback(name: string, _old: string | null, next: string | null) {
    this.attrs[name] = next;
  }
}

beforeAll(() => {
  if (!customElements.get("dice-tray")) {
    customElements.define("dice-tray", StubDiceTray);
  }
});

describe("DiceTray React wrapper — tuner pass-through", () => {
  it("forwards a `tuning` prop to the underlying <dice-tray> as a JSON attribute", () => {
    const tuning = {
      camera: { position: [0, 3, 0], fov: 38 },
      jitter: 0.25,
      tray: { ceilingHeight: 1.4 },
    };
    const { container } = render(<DiceTray tuning={tuning} themeColor="#c33" />);
    const el = container.querySelector("dice-tray");
    expect(el, "dice-tray element must be rendered").not.toBeNull();
    const raw = el!.getAttribute("tuning");
    expect(
      raw,
      "tuning prop must be serialized to a `tuning` attribute on the element",
    ).not.toBeNull();
    const parsed = JSON.parse(raw!);
    expect(parsed).toEqual(tuning);
  });

  it("omits the tuning attribute entirely when no tuning prop is given", () => {
    const { container } = render(<DiceTray themeColor="#c33" />);
    const el = container.querySelector("dice-tray");
    expect(el!.getAttribute("tuning")).toBeNull();
  });

  it("updates the tuning attribute when the prop changes", () => {
    const initial = { jitter: 0.1 };
    const next = { jitter: 0.5 };
    const { container, rerender } = render(<DiceTray tuning={initial} />);
    const el = container.querySelector("dice-tray")!;
    expect(JSON.parse(el.getAttribute("tuning")!)).toEqual(initial);
    rerender(<DiceTray tuning={next} />);
    expect(JSON.parse(el.getAttribute("tuning")!)).toEqual(next);
  });
});
