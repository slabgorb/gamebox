// CROSS-BUG-2 — Backgammon dice render must drive every turn.
//
// Bug repro: during an AI turn, the viewer sees a single static die frozen on
// '2' while game state advances. Root cause: `renderDice` falls back to a
// static `.die-placeholder` pip row during the `moving` phase, which is the
// only thing the viewer sees while the AI plays. When state arrives partially
// (or in a different shape than the previous turn), the static row paints a
// stale single die.
//
// Story scope: "the new renderer drives every turn (player and AI)" — the
// live dice-tray takes over the `moving` phase so the stale static row is
// gone. The element can use mode="replay" to animate the rolled values.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { renderDice } from "../../plugins/backgammon/client/dice.js";

class StubDiceTray extends HTMLElement {
  throw() {}
  throwAll() {}
  reset() {}
}

beforeAll(() => {
  if (!customElements.get("dice-tray")) {
    customElements.define("dice-tray", StubDiceTray);
  }
});

beforeEach(() => {
  document.body.innerHTML = "";
  const mount = document.createElement("div");
  mount.id = "dice-area";
  document.body.appendChild(mount);
});

function getMount(): HTMLElement {
  const m = document.getElementById("dice-area");
  if (!m) throw new Error("dice-area not in DOM");
  return m;
}

describe("backgammon renderDice — live tray drives every turn", () => {
  it("renders a <dice-tray> during the AI's moving phase (not a static pip row)", () => {
    const state = {
      youAre: "p1",
      turn: { phase: "moving", activePlayer: "p2", dice: { values: [3, 5] } },
    };
    renderDice(state, { send: () => {} }, () => {});
    const mount = getMount();
    expect(
      mount.querySelector("dice-tray"),
      "moving phase during AI turn must use the live dice-tray renderer",
    ).not.toBeNull();
    expect(
      mount.querySelector(".die-placeholder"),
      "static pip row is the freeze surface — must not appear during AI moving phase",
    ).toBeNull();
  });

  it("renders a <dice-tray> during the viewer's own moving phase too", () => {
    const state = {
      youAre: "p1",
      turn: { phase: "moving", activePlayer: "p1", dice: { values: [4, 6] } },
    };
    renderDice(state, { send: () => {} }, () => {});
    const mount = getMount();
    expect(
      mount.querySelector("dice-tray"),
      "moving phase must use the live dice-tray renderer for both players",
    ).not.toBeNull();
    expect(mount.querySelector(".die-placeholder")).toBeNull();
  });

  it("does not paint a partial single-die row if values arrive truncated", () => {
    // Repro for "freeze on a single die showing 2": state arrives with one
    // value mid-stream. The live tray + replay mode handles this cleanly;
    // the static fallback used to paint a lone .die-placeholder.
    const state = {
      youAre: "p1",
      turn: { phase: "moving", activePlayer: "p2", dice: { values: [2] } },
    };
    renderDice(state, { send: () => {} }, () => {});
    const mount = getMount();
    expect(
      mount.querySelectorAll(".die-placeholder").length,
      "no static fallback row may paint during the AI's moving phase",
    ).toBe(0);
  });
});
