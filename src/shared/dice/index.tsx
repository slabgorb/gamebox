/**
 * <dice-tray> — Web Component wrapper around the React/R3F dice scene.
 *
 * Plugins consume this as a custom element:
 *   <dice-tray dice="2d6" mode="active" theme="ivory"></dice-tray>
 *
 * The React tree mounts directly inside the element (light DOM, NOT shadow
 * DOM) so pointer events used by R3F's controls work without re-dispatching.
 */

import { createRoot, Root } from "react-dom/client";
import { Canvas } from "@react-three/fiber";
import {
  DiceScene,
  parseDiceNotation,
  dieKindForSides,
  THEME_PRESETS,
  type ThrowParams,
  type DiceThrowParams,
  type DieKind,
} from "@local/dice-lib";

type Mode = "active" | "replay" | "idle";

interface State {
  kind: DieKind;
  count: number;
  mode: Mode;
  themeKey: string;
  /**
   * Per-die throw params. `null` = pickup row. Single object = applied to
   * every die (user-drag path; physics provides variation via die-die
   * contact). Array = die `i` uses `throwParams[i]` (auto-roll path —
   * required to avoid identical-trajectory doubles).
   */
  throwParams: ThrowParams | ThrowParams[] | null;
  rollKey: number;
}

/** Convert a single scene ThrowParams to wire-format DiceThrowParams. */
function toWireParams(p: ThrowParams): DiceThrowParams {
  return {
    velocity: p.linearVelocity,
    angular: p.angularVelocity,
    position: [p.position[0] + 0.5, (p.position[2] + 0.8) / 1.6],
  };
}

class DiceTrayElement extends HTMLElement {
  static observedAttributes = ["dice", "mode", "theme", "replay", "disabled"];

  private root: Root | null = null;
  private state: State = {
    kind: "d6",
    count: 1,
    mode: "idle",
    themeKey: "default",
    throwParams: null,
    rollKey: 0,
  };

  connectedCallback() {
    this.root = createRoot(this);
    this.syncFromAttributes();
    this._render();
  }

  disconnectedCallback() {
    this.root?.unmount();
    this.root = null;
  }

  attributeChangedCallback(_name: string, _old: string | null, _next: string | null) {
    if (!this.root) return;
    this.syncFromAttributes();
    this._render();
  }

  /** Programmatic API: trigger a throw with the provided params (active mode).
   *  The same params apply to every die in the tray — physics + die-die
   *  contact provide the variation. For auto-rolls (no user gesture), use
   *  {@link throwAll} instead, otherwise all dice settle to the same face. */
  throw(params: ThrowParams) {
    this.state = { ...this.state, throwParams: params, rollKey: this.state.rollKey + 1 };
    this.dispatchEvent(new CustomEvent("dice-throw", { detail: { throwParams: [params] } }));
    this._render();
  }

  /** Programmatic API: trigger an N-die throw where each die gets its own
   *  ThrowParams. Required for auto-rolls — identical kinematics on dice
   *  that don't collide settle to identical faces (doubles every time). */
  throwAll(paramsList: ThrowParams[]) {
    this.state = { ...this.state, throwParams: paramsList, rollKey: this.state.rollKey + 1 };
    this.dispatchEvent(new CustomEvent("dice-throw", { detail: { throwParams: paramsList } }));
    this._render();
  }

  /** Programmatic API: reset to the idle pickup die. */
  reset() {
    this.state = { ...this.state, throwParams: null, rollKey: this.state.rollKey + 1 };
    this._render();
  }

  private syncFromAttributes() {
    const diceAttr = this.getAttribute("dice") ?? "1d6";
    try {
      const spec = parseDiceNotation(diceAttr);
      this.state.kind = dieKindForSides(spec.sides);
      this.state.count = spec.count;
    } catch (err) {
      this.dispatchEvent(new CustomEvent("dice-error", { detail: { message: String(err) } }));
      // Keep prior state on parse failure rather than crashing the render.
    }

    const modeAttr = (this.getAttribute("mode") ?? "idle") as Mode;
    this.state.mode = modeAttr;
    this.state.themeKey = this.getAttribute("theme") ?? "default";

    const replayAttr = this.getAttribute("replay");
    if (modeAttr === "replay" && replayAttr) {
      try {
        const parsed = JSON.parse(replayAttr) as { throwParams: ThrowParams[]; values?: number[] };
        if (parsed.throwParams && parsed.throwParams.length > 0) {
          // Preserve the full per-die array so multi-die replays reproduce
          // each die's trajectory. (Pre-batch builds used parsed.throwParams[0]
          // for every die — the source of the "always doubles" bug.)
          this.state.throwParams = parsed.throwParams;
          this.state.rollKey = this.state.rollKey + 1;
        }
      } catch (err) {
        this.dispatchEvent(new CustomEvent("dice-error", { detail: { message: `Invalid replay JSON: ${err}` } }));
      }
    } else if (modeAttr === "idle" || modeAttr === "active") {
      this.state.throwParams = null;
    }
  }

  private handleThrow = (params: ThrowParams) => {
    this.state = { ...this.state, throwParams: params, rollKey: this.state.rollKey + 1 };
    this.dispatchEvent(new CustomEvent("dice-throw", { detail: { throwParams: [params] } }));
    this._render();
  };

  private handleAllSettle = (values: number[]) => {
    if (this.state.mode === "replay") {
      this.dispatchEvent(new CustomEvent("dice-replay-settle", { detail: { values } }));
    } else {
      const tp = this.state.throwParams;
      const wire: DiceThrowParams[] = tp
        ? Array.isArray(tp)
          ? tp.map(toWireParams)
          : [toWireParams(tp)]
        : [];
      this.dispatchEvent(new CustomEvent("dice-settle", { detail: { values, throwParams: wire } }));
    }
  };

  private _render() {
    if (!this.root) return;
    const theme = THEME_PRESETS[this.state.themeKey] ?? THEME_PRESETS.default;
    this.root.render(
      <div style={{ width: "100%", height: "100%", minHeight: 240 }}>
        <Canvas
          camera={{ position: [0, 2.2, 0], fov: 42, near: 0.1, far: 50 }}
          shadows
        >
          <DiceScene
            kind={this.state.kind}
            count={this.state.count}
            throwParams={this.state.throwParams}
            rollKey={this.state.rollKey}
            onThrow={this.handleThrow}
            onAllSettle={this.handleAllSettle}
            theme={theme}
          />
        </Canvas>
      </div>
    );
  }
}

if (!customElements.get("dice-tray")) {
  customElements.define("dice-tray", DiceTrayElement);
}

export { DiceTrayElement };
