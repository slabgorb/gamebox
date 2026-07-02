// One visual card tile for any Clue card id. Reads CARD_ART for portrait,
// label, glyph, and category; the glyph sits behind the img and shows through
// if the portrait fails to load (the OpponentCard pattern). Interactive when
// onClick is provided (a <button>, e.g. refute choices).
import type { CardId } from "../shared/contracts/clue";
import { CARD_ART } from "./card-art.js";

interface ClueCardProps {
  id: CardId;
  onClick?: (id: CardId) => void;
  selected?: boolean;
  caption?: string;
}

export function ClueCard({ id, onClick, selected, caption }: ClueCardProps) {
  const art = CARD_ART[id];
  const className = [
    "clue-card",
    `clue-card--${art.category}`,
    onClick ? "clue-card--pickable" : "",
    selected ? "is-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const inner = (
    <>
      <span className="clue-card__portrait">
        <span className="clue-card__glyph" aria-hidden="true">{art.glyph}</span>
        {art.file && (
          <img
            className="clue-card__img"
            src={`/shared/portraits/${art.file}.png`}
            alt={art.label}
            onError={(e) => (e.currentTarget as HTMLImageElement).remove()}
          />
        )}
      </span>
      <span className="clue-card__label">{art.label}</span>
      {caption && <em className="clue-card__caption">{caption}</em>}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        data-card={id}
        aria-pressed={selected ? true : undefined}
        onClick={() => onClick(id)}
      >
        {inner}
      </button>
    );
  }
  return (
    <span className={className} data-card={id}>
      {inner}
    </span>
  );
}
