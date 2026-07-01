// src/clients/risk/ColorPicker.tsx
// Setup-phase per-seat colour picker. Renders one swatch per palette slot; the
// viewer's current slot is marked "mine". Clicking any other slot posts a
// pick-color action — the server swaps if that slot is already taken, so every
// seat keeps a distinct colour.
import type { RiskView, RiskAction } from "../shared/contracts/risk";
import { colorSlots } from "./colorSlots";

export function ColorPicker({
  view,
  post,
}: {
  view: RiskView;
  post: (action: RiskAction) => void;
}) {
  const slots = colorSlots(view);
  return (
    <div className="color-picker" aria-label="Pick your colour">
      {slots.map((s) => (
        <button
          key={s.slot}
          type="button"
          className={`color-swatch${s.isMine ? " mine" : ""}`}
          data-slot={s.slot}
          data-mine={s.isMine ? "true" : undefined}
          style={{ background: `var(--p${s.slot}-1)` }}
          aria-label={s.label}
          aria-pressed={s.isMine}
          onClick={() => {
            if (!s.isMine) post({ type: "pick-color", payload: { color: s.slot } });
          }}
        />
      ))}
    </div>
  );
}
