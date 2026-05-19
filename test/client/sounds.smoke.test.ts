// test/client/sounds.smoke.test.ts
import { describe, it, expect } from "vitest";
import * as sounds from "../../src/clients/cribbage/sounds";

describe("sounds module", () => {
  it("exports play, playForScore, primeAudio, isMuted, toggleMuted", () => {
    expect(typeof sounds.play).toBe("function");
    expect(typeof sounds.playForScore).toBe("function");
    expect(typeof sounds.primeAudio).toBe("function");
    expect(typeof sounds.isMuted).toBe("function");
    expect(typeof sounds.toggleMuted).toBe("function");
  });

  it("toggleMuted flips state and persists to localStorage", () => {
    const initial = sounds.isMuted();
    const after = sounds.toggleMuted();
    expect(after).toBe(!initial);
    expect(localStorage.getItem("cribbage.muted")).toBe(after ? "1" : "0");
    // Reset for other tests.
    sounds.toggleMuted();
  });
});
