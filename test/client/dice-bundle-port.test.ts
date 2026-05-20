/// <reference types="vite/client" />
// CROSS-BUG-2 — Bundle port to @local/dice-lib.
//
// The bundle entry (src/shared/dice/index.tsx → public/shared/dice.js) used to
// redeclare its own `class DiceTrayElement extends HTMLElement` even though
// the lib already exports one. Drift between the two implementations is the
// root cause of "renderer doesn't drive every turn" — only one path gets fixes.
//
// Contract: the bundle MUST import DiceTrayElement from "@local/dice-lib" and
// register it. No local class declaration; no local copy of dice geometry,
// scene, theme, registry, parser, gestures, or replay helpers.

import { describe, it, expect } from "vitest";
// Vite ?raw suffix returns the file's text content at build time — works
// inside vitest's jsdom env without needing `node:fs`.
import bundleEntrySrc from "../../src/shared/dice/index.tsx?raw";

// `import.meta.glob` is Vite's native directory-listing primitive; the keys
// are repo-relative paths to every file matching the pattern.
const localDiceFiles = import.meta.glob("../../src/shared/dice/*", {
  eager: true,
});

const FORBIDDEN_LOCAL_FILES = [
  "d4.ts",
  "d6.ts",
  "d8.ts",
  "d10.ts",
  "d12.ts",
  "d20.ts",
  "DiceScene.tsx",
  "diceTheme.ts",
  "dieRegistry.ts",
  "fbxFaces.ts",
  "parseDiceNotation.ts",
  "replayThrowParams.ts",
  "trayDefaults.ts",
  "types.ts",
  "useDiceThrowGesture.ts",
];

describe("dice bundle entry — port to @local/dice-lib", () => {
  it("imports DiceTrayElement from @local/dice-lib", () => {
    const hasLibImport =
      /import\s*\{[^}]*\bDiceTrayElement\b[^}]*\}\s*from\s*["']@local\/dice-lib["']/.test(
        bundleEntrySrc,
      );
    expect(
      hasLibImport,
      "src/shared/dice/index.tsx must import DiceTrayElement from @local/dice-lib " +
        "instead of declaring its own class",
    ).toBe(true);
  });

  it("does not declare its own custom-element class", () => {
    expect(
      /class\s+\w+\s+extends\s+HTMLElement/.test(bundleEntrySrc),
      "bundle entry must not redeclare `class … extends HTMLElement`; " +
        "use the lib's DiceTrayElement",
    ).toBe(false);
  });

  it("does not keep duplicate copies of dice-lib source in words", () => {
    const present = Object.keys(localDiceFiles).map((p) =>
      p.slice(p.lastIndexOf("/") + 1),
    );
    const offenders = FORBIDDEN_LOCAL_FILES.filter((f) => present.includes(f));
    expect(
      offenders,
      `These files are owned by @local/dice-lib and must not live in src/shared/dice/: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
