import { useEffect, useRef, useState } from "react";

/**
 * E5-10: post-conquest advance chooser. The attacker picks how many armies
 * march into the captured territory, bounded by [min, max] from
 * `advanceRange`. Defaults to max — confirm-without-touching matches the old
 * all-in behavior. A collapsed range (min === max, AC-3) renders nothing and
 * fires onChoose(min) automatically: there is no choice to present.
 */
interface Props {
  min: number;
  max: number;
  onChoose: (n: number) => void;
}

export function AdvanceChooser({ min, max, onChoose }: Props) {
  const forced = min === max;
  const [value, setValue] = useState(max);
  // Auto-fire exactly once for the forced case, even if the parent re-renders.
  const fired = useRef(false);
  useEffect(() => {
    if (forced && !fired.current) {
      fired.current = true;
      onChoose(min);
    }
  }, [forced, min, onChoose]);

  if (forced) return null;

  return (
    <div className="advance-chooser">
      <span className="advance-chooser__label">
        March into the conquered territory:
      </span>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => setValue(Number(e.target.value))}
      />
      <span className="advance-chooser__count">{value}</span>
      <button
        type="button"
        className="combat-btn advance"
        onClick={() => onChoose(value)}
      >
        Advance {value}
      </button>
    </div>
  );
}
