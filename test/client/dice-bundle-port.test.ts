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
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = new URL("../../", import.meta.url).pathname;
const DICE_DIR = join(REPO_ROOT, "src/shared/dice");
const ENTRY = join(DICE_DIR, "index.tsx");

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
    const src = readFileSync(ENTRY, "utf8");
    // Accept either a named import from "@local/dice-lib" that pulls in
    // DiceTrayElement, or a side-effect import of the lib's element module.
    const hasLibImport =
      /import\s*\{[^}]*\bDiceTrayElement\b[^}]*\}\s*from\s*["']@local\/dice-lib["']/.test(
        src,
      );
    expect(
      hasLibImport,
      "src/shared/dice/index.tsx must import DiceTrayElement from @local/dice-lib " +
        "instead of declaring its own class",
    ).toBe(true);
  });

  it("does not declare its own custom-element class", () => {
    const src = readFileSync(ENTRY, "utf8");
    expect(
      /class\s+\w+\s+extends\s+HTMLElement/.test(src),
      "bundle entry must not redeclare `class … extends HTMLElement`; " +
        "use the lib's DiceTrayElement",
    ).toBe(false);
  });

  it("does not keep duplicate copies of dice-lib source in words", () => {
    const present = readdirSync(DICE_DIR);
    const offenders = FORBIDDEN_LOCAL_FILES.filter((f) => present.includes(f));
    expect(
      offenders,
      `These files are owned by @local/dice-lib and must not live in src/shared/dice/: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
