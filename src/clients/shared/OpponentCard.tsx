import type { ReactNode } from "react";
import "./OpponentCard.css";

interface Props {
  personaId: string | null;
  friendlyName: string;
  color?: string | null;
  glyph?: string | null;
  children?: ReactNode;
}

export function OpponentCard({
  personaId,
  friendlyName,
  color,
  glyph,
  children,
}: Props) {
  if (personaId == null) return null;
  return (
    <div className="opp-card" id="opp-card">
      <div
        className="opp-card__portrait"
        style={color ? { background: color } : undefined}
      >
        <span className="opp-card__fallback">{glyph ?? "?"}</span>
        <img
          className="opp-card__img"
          src={`/shared/portraits/${personaId}.png`}
          alt={friendlyName}
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).remove();
          }}
        />
      </div>
      <div className="opp-card__name">{friendlyName}</div>
      {children}
    </div>
  );
}
