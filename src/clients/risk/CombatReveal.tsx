import { useEffect, useRef, useState } from "react";
import { DiceTray, type DiceTrayHandle } from "../shared/DiceTray";
import { driveCombat } from "./combat-rules";

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
  onResolved: (out: import("../shared/contracts/risk").ResolvedCombat) => void;
};
type ReplayProps = CommonProps & {
  mode: "replay";
  rounds: { aDice: number[]; dDice: number[] }[];
  captured: boolean;
};
type Props = LiveProps | ReplayProps;

const STEP_MS = 700;

export function CombatReveal(props: Props) {
  const atkRef = useRef<DiceTrayHandle>(null);
  const defRef = useRef<DiceTrayHandle>(null);
  const [round, setRound] = useState<{ aDice: number[]; dDice: number[] } | null>(
    null,
  );
  const [done, setDone] = useState<boolean | null>(null); // captured?
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (props.mode === "live") {
      const ra: Rolls =
        props.rollAttacker ?? ((n) => atkRef.current!.roll(n));
      const rd: Rolls =
        props.rollDefender ?? ((n) => defRef.current!.roll(n));
      driveCombat({
        force: props.force,
        defenders: props.defenders,
        rollAttacker: ra,
        rollDefender: rd,
        onRound: (r) => setRound({ aDice: r.aDice, dDice: r.dDice }),
      }).then((out) => {
        setDone(out.captured);
        props.onResolved(out);
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
      {done !== null && (
        <div className={`combat-reveal__result ${done ? "won" : "lost"}`}>
          {done ? "Captured" : "Repulsed"}
        </div>
      )}
    </div>
  );
}
