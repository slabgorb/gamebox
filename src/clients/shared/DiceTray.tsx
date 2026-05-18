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
function autoThrowParams() {
  const rand = (a: number, b: number) => a + Math.random() * (b - a);
  return {
    position: [rand(-0.3, 0.3), 1.2, rand(-0.3, 0.3)] as [
      number,
      number,
      number,
    ],
    linearVelocity: [rand(-2, 2), 1, rand(-6, -3)] as [number, number, number],
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
          for (let i = 0; i < count; i++) el.throw(autoThrowParams());
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
      style={{ width: "100%", minHeight: 200, ...style }}
    />
  );
});
