import {
  forwardRef,
  useImperativeHandle,
  useRef,
  type CSSProperties,
} from "react";

export interface DiceTrayHandle {
  /** Auto-roll `count` d6 dice; resolves with the settled face values. */
  roll: (count: number) => Promise<number[]>;
}

interface Props {
  /** Passed through as `data-color` for host-page CSS hooks only. The bundle's 3D
   *  dice theme is NOT driven by this; the element themes via its `theme` attribute
   *  (keys: "default" | "ivory" | "obsidian"). Color→theme mapping for attacker/
   *  defender tinting is a Task 4.7/5.4 concern, not handled here. */
  themeColor?: string;
  style?: CSSProperties;
}

// Synthesized throw params: a physical-looking auto-roll (no drag gesture).
// position/velocity/angular are cosmetic; the settled value is whatever the
// physics yields — Risk posts those values to the server (spec Amendment A).
//
// Bounds discipline: the tray ceiling collider's bottom face is at y=1.0, so
// the spawn y MUST stay below ~0.85 (die half-edge ~0.21) or dice initialise
// embedded in the ceiling and Rapier ejects them out of the tray — looks
// exactly like "dice falling through". Values mirror dice-lib's
// buildDefaultThrowParams (the proven user-drag fallback).
function autoThrowParams() {
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  return {
    position: [0, 0.5, rand(-0.2, 0.2)] as [number, number, number],
    linearVelocity: [rand(-2, 2), rand(2, 4), rand(-4, -2)] as [
      number,
      number,
      number,
    ],
    angularVelocity: [rand(-12, 12), rand(-12, 12), rand(-12, 12)] as [
      number,
      number,
      number,
    ],
    rotation: [rand(-3, 3), rand(-3, 3), rand(-3, 3)] as [
      number,
      number,
      number,
    ],
  };
}

export const DiceTray = forwardRef<DiceTrayHandle, Props>(function DiceTray(
  { themeColor, style },
  ref,
) {
  const elRef = useRef<HTMLElement & {
    throw: (p: unknown) => void;
    throwAll: (ps: unknown[]) => void;
    reset: () => void;
  }>(null);

  useImperativeHandle(
    ref,
    () => ({
      roll(count: number) {
        return new Promise<number[]>((resolve, reject) => {
          const el = elRef.current;
          if (!el) return reject(new Error("dice-tray not mounted"));
          const onSettle = (e: Event) => {
            cleanup();
            resolve((e as CustomEvent).detail.values as number[]);
          };
          const onError = (e: Event) => {
            cleanup();
            reject(new Error((e as CustomEvent).detail?.message ?? "dice error"));
          };
          const cleanup = () => {
            el.removeEventListener("dice-settle", onSettle);
            el.removeEventListener("dice-error", onError);
          };
          el.addEventListener("dice-settle", onSettle);
          el.addEventListener("dice-error", onError);
          el.setAttribute("dice", `${count}d6`);
          el.setAttribute("mode", "active");
          // Per-die params: identical kinematics across non-colliding dice
          // settle to the same face (always-doubles bug). Submit as a batch
          // so the scene applies throwParams[i] to PhysicsDie i.
          const allParams = Array.from({ length: count }, () => autoThrowParams());
          el.throwAll(allParams);
        });
      },
    }),
    [],
  );

  return (
    // @ts-expect-error custom element registered by public/shared/dice.js
    <dice-tray
      ref={elRef}
      dice="1d6"
      mode="idle"
      data-color={themeColor}
      // Custom elements default to `display: inline`, which ignores width/
      // min-height — the bundle's 3D scene then collapses and dice render
      // (and visually fall) out of frame. Force a sized block box. 240px
      // matches the bundle's internal canvas minHeight.
      style={{ display: "block", width: "100%", height: 240, ...style }}
    />
  );
});
