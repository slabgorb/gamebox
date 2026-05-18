import { describe, it, expect } from "vitest";
import {
  combatSignature,
  shouldReplay,
} from "../../src/clients/risk/combat-signature";

const combat = {
  from: "N1",
  to: "N2",
  force: 3,
  captured: true,
  rounds: [{}, {}],
} as any;

describe("combat-signature", () => {
  it("signature is null when there is no combat", () => {
    expect(combatSignature(null)).toBeNull();
    expect(combatSignature(undefined)).toBeNull();
  });
  it("signature is stable for the same combat", () => {
    expect(combatSignature(combat)).toBe(combatSignature({ ...combat }));
  });
  it("signature changes when the combat changes", () => {
    expect(combatSignature(combat)).not.toBe(
      combatSignature({ ...combat, to: "N3" }),
    );
    expect(combatSignature(combat)).not.toBe(
      combatSignature({ ...combat, rounds: [{}] }),
    );
  });
  it("no replay when there is no combat", () => {
    expect(shouldReplay(null, null)).toEqual({
      signature: null,
      replay: false,
    });
  });
  it("replay on a fresh transition", () => {
    const r = shouldReplay(null, combat);
    expect(r.replay).toBe(true);
    expect(r.signature).toBe(combatSignature(combat));
  });
  it("undefined prevSignature is treated as a fresh transition", () => {
    const r = shouldReplay(undefined, combat);
    expect(r.replay).toBe(true);
  });
  it("no replay when the signature is unchanged", () => {
    const sig = combatSignature(combat);
    expect(shouldReplay(sig, combat)).toEqual({
      signature: sig,
      replay: false,
    });
  });
  it("replay when the signature changes", () => {
    const prev = combatSignature(combat);
    const next = { ...combat, to: "N3" };
    const r = shouldReplay(prev, next);
    expect(r.replay).toBe(true);
    expect(r.signature).toBe(combatSignature(next));
  });
});
