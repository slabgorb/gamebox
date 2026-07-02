import { useEffect, useRef, useState } from "react";
import { DiceTray, type DiceTrayHandle } from "../shared/DiceTray";
import {
  advanceRange,
  driveCombat,
  resolveRound,
  type CombatDecision,
} from "./combat-rules";
import { AdvanceChooser } from "./AdvanceChooser";
import type { ResolvedCombat } from "../shared/contracts/risk";

type Rolls = (n: number) => Promise<number[]>;

interface CommonProps {
  from: string;
  to: string;
  attackerColor: string;
  defenderColor: string;
}
type LiveProps = CommonProps & {
  mode: "live";
  force: number;
  defenders: number;
  rollAttacker?: Rolls;
  rollDefender?: Rolls;
  /**
   * When true, the local human is the attacker: accumulate a per-round card
   * stack and prompt Roll-again / Blitz / Stop between rounds. When false or
   * absent (e.g. the defender's client resolving a bot's attack via
   * pendingCombat), combat auto-grinds with no controls — there is no human
   * attacker present to ask "again or stop?".
   */
  interactive?: boolean;
  onResolved: (out: import("../shared/contracts/risk").ResolvedCombat) => void;
};
type ReplayProps = CommonProps & {
  mode: "replay";
  rounds: { aDice: number[]; dDice: number[] }[];
  captured: boolean;
};
type Props = LiveProps | ReplayProps;

const STEP_MS = 700;

/** One resolved round, as rendered on a thin card in the interactive stack. */
interface RoundCard {
  aDice: number[];
  dDice: number[];
  aLoss: number;
  dLoss: number;
  af: number;
  df: number;
}

export function CombatReveal(props: Props) {
  const atkRef = useRef<DiceTrayHandle>(null);
  const defRef = useRef<DiceTrayHandle>(null);
  const [round, setRound] = useState<{ aDice: number[]; dDice: number[] } | null>(
    null,
  );
  const [done, setDone] = useState<boolean | null>(null); // captured?
  // Interactive (human-attacker) state: the accumulating battle log and the
  // pending between-round decision. Both are component-local, so a new attack
  // (a fresh mount) starts empty — the stack is this-battle-only.
  const [cards, setCards] = useState<RoundCard[]>([]);
  const [awaiting, setAwaiting] = useState(false);
  // E5-10: an interactive capture holds the resolved outcome here until the
  // attacker picks an advance count; onResolved fires with advanceCount set.
  const [pendingAdvance, setPendingAdvance] = useState<{
    out: ResolvedCombat;
    min: number;
    max: number;
  } | null>(null);
  const decideResolver = useRef<((d: CombatDecision) => void) | null>(null);
  const started = useRef(false);

  const interactive = props.mode === "live" && props.interactive === true;

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (props.mode === "live") {
      const ra: Rolls =
        props.rollAttacker ?? ((n) => atkRef.current!.roll(n));
      const rd: Rolls =
        props.rollDefender ?? ((n) => defRef.current!.roll(n));
      const isInteractive = props.interactive === true;
      driveCombat({
        force: props.force,
        defenders: props.defenders,
        rollAttacker: ra,
        rollDefender: rd,
        onRound: (r) => {
          setRound({ aDice: r.aDice, dDice: r.dDice });
          if (isInteractive) {
            const { aLoss, dLoss } = resolveRound(r.aDice, r.dDice);
            setCards((cs) => [
              ...cs,
              { aDice: r.aDice, dDice: r.dDice, aLoss, dLoss, af: r.af, df: r.df },
            ]);
          }
        },
        // Human attacker only: pause between rounds and let the buttons resolve
        // the decision. The bot/defender path passes no decide ⇒ auto-grind.
        decide: isInteractive
          ? () =>
              new Promise<CombatDecision>((resolve) => {
                decideResolver.current = resolve;
                setAwaiting(true);
              })
          : undefined,
      }).then((out) => {
        setAwaiting(false);
        setDone(out.captured);
        // E5-10: a human attacker chooses the advance after a capture — gate
        // the resolved POST behind the chooser. Every other path (repulse,
        // defender proxying a bot's attack) resolves immediately with no
        // advanceCount; the server applies its default (all survivors).
        const range = isInteractive && out.captured
          ? advanceRange(out, props.force)
          : null;
        if (range) {
          setPendingAdvance({ out, min: range.min, max: range.max });
        } else {
          props.onResolved(out);
        }
      });
      return;
    }

    // Replay: step recorded rounds on a timer. We don't have the original
    // throwParams (server doesn't echo them for opponent rolls), so the 3D
    // dice can't physically replay the exact faces. Drive .roll(n) per
    // round anyway so the trays animate with the correct die count and
    // the user sees motion instead of frozen pickup dice — the actual
    // rolled values are shown in the `.pips` text below.
    let i = 0;
    const tick = () => {
      if (i >= props.rounds.length) {
        setDone(props.captured);
        return;
      }
      const r = props.rounds[i];
      setRound(r);
      atkRef.current?.roll(r.aDice.length).catch(() => {});
      defRef.current?.roll(r.dDice.length).catch(() => {});
      i += 1;
      setTimeout(tick, STEP_MS);
    };
    tick();
  }, [props]);

  // Resolve the pending between-round decision with the attacker's choice.
  const choose = (d: CombatDecision) => {
    setAwaiting(false);
    const resolve = decideResolver.current;
    decideResolver.current = null;
    resolve?.(d);
  };

  // Pre-mount counts so the trays show the right number of pickup dice
  // before the first round tick lands. Falls back to live props when
  // available, or 3v2 (the standard Risk attack-vs-defend maxima) otherwise.
  const initialAtkCount =
    props.mode === "live"
      ? Math.max(1, Math.min(3, props.force))
      : Math.max(1, props.rounds[0]?.aDice.length ?? 3);
  const initialDefCount =
    props.mode === "live"
      ? Math.max(1, Math.min(2, props.defenders))
      : Math.max(1, props.rounds[0]?.dDice.length ?? 2);

  // Latest resolved round drives control enablement (af/df after attrition).
  const last = cards[cards.length - 1];

  return (
    <div className="combat-reveal">
      <div className="combat-reveal__head">
        {props.from} → {props.to}
      </div>
      <div className="combat-reveal__trays">
        <div className="tray atk" style={{ ["--die" as any]: props.attackerColor }}>
          <DiceTray
            ref={atkRef}
            themeColor={props.attackerColor}
            count={initialAtkCount}
          />
          <span className="pips atk">{(round?.aDice ?? []).join(" ")}</span>
        </div>
        <span className="vs">vs</span>
        <div className="tray def" style={{ ["--die" as any]: props.defenderColor }}>
          <DiceTray
            ref={defRef}
            themeColor={props.defenderColor}
            count={initialDefCount}
          />
          <span className="pips def">{(round?.dDice ?? []).join(" ")}</span>
        </div>
      </div>

      {interactive && cards.length > 0 && (
        <ol className="combat-reveal__log">
          {cards.map((c, i) => (
            // Append-only within a battle (never reordered/removed), so the
            // round index is a stable key.
            <li className="combat-card" key={i}>
              <span className="combat-card__round">R{i + 1}</span>
              <span className="combat-card__dice atk">{c.aDice.join(" ")}</span>
              <span className="combat-card__vs">→</span>
              <span className="combat-card__dice def">{c.dDice.join(" ")}</span>
              <span className="combat-card__loss">
                −{c.aLoss}/−{c.dLoss}
              </span>
              <span className="combat-card__survivors">
                {c.af} v {c.df}
              </span>
            </li>
          ))}
        </ol>
      )}

      {interactive && awaiting && last && (
        <div className="combat-reveal__controls">
          <button
            type="button"
            className="combat-btn roll"
            disabled={last.af <= 1}
            onClick={() => choose("roll")}
          >
            Roll again
          </button>
          <button
            type="button"
            className="combat-btn blitz"
            onClick={() => choose("blitz")}
          >
            Blitz
          </button>
          {last.df > 0 && (
            <button
              type="button"
              className="combat-btn stop"
              onClick={() => choose("stop")}
            >
              Stop
            </button>
          )}
        </div>
      )}

      {done !== null && (
        <div className={`combat-reveal__result ${done ? "won" : "lost"}`}>
          {done ? "Captured" : "Repulsed"}
        </div>
      )}

      {props.mode === "live" && pendingAdvance && (
        <AdvanceChooser
          min={pendingAdvance.min}
          max={pendingAdvance.max}
          onChoose={(n) => {
            setPendingAdvance(null);
            props.onResolved({ ...pendingAdvance.out, advanceCount: n });
          }}
        />
      )}
    </div>
  );
}
