// src/clients/risk/MuteToggle.tsx
// Tiny brass-pill toggle that flips the SFX mute state. Persists via
// the sounds module (localStorage `risk.muted`). Renders the speaker
// glyph and a strikethrough overlay when muted so it's legible without
// reading the label.
import { useState } from "react";
import { isMuted, toggleMuted, play } from "./sounds";

export function MuteToggle() {
  const [muted, setMuted] = useState<boolean>(() => isMuted());
  const label = muted ? "Unmute sound" : "Mute sound";
  return (
    <button
      type="button"
      className="mute-btn"
      aria-pressed={muted}
      aria-label={label}
      title={label}
      onClick={() => {
        const next = toggleMuted();
        setMuted(next);
        if (!next) play("click");
      }}
    >
      <span aria-hidden="true">{muted ? "🔇" : "🔊"}</span>
    </button>
  );
}
