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

    // replay: step recorded rounds on a timer
    let i = 0;
    const tick = () => {
      if (i >= props.rounds.length) {
        setDone(props.captured);
        return;
      }
      setRound(props.rounds[i]);
      i += 1;
      setTimeout(tick, STEP_MS);
    };
    tick();
  }, [props]);

  return (
    <div className="combat-reveal">
      <div className="combat-reveal__head">
        {props.from} → {props.to}
      </div>
      <div className="combat-reveal__trays">
        <div className="tray atk" style={{ ["--die" as any]: props.attackerColor }}>
          <DiceTray ref={atkRef} themeColor={props.attackerColor} />
          <span className="pips atk">{(round?.aDice ?? []).join(" ")}</span>
        </div>
        <span className="vs">vs</span>
        <div className="tray def" style={{ ["--die" as any]: props.defenderColor }}>
          <DiceTray ref={defRef} themeColor={props.defenderColor} />
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
