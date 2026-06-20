import { OpponentCard } from "./OpponentCard";

export interface BotBubble {
  text: string;
  thinking: boolean;
}
export interface BotStall {
  reason: string;
}
export interface BotCardProps {
  personaId: string;
  friendlyName: string;
  color?: string | null;
  glyph?: string | null;
  bubble: BotBubble | null;
  stall: BotStall | null;
  onRetry: () => void;
}

export function BotCard({
  personaId,
  friendlyName,
  color,
  glyph,
  bubble,
  stall,
  onRetry,
}: BotCardProps) {
  return (
    <OpponentCard
      personaId={personaId}
      friendlyName={friendlyName}
      color={color}
      glyph={glyph}
    >
      {bubble && (
        <div className="opp-card__bubble">
          {bubble.text}
          {bubble.thinking && (
            <span className="opp-card__dots">
              <span />
              <span />
              <span />
            </span>
          )}
        </div>
      )}
      {stall && (
        <div className="opp-card__stall">
          <span>
            {friendlyName} froze up ({stall.reason}).
          </span>
          <div className="opp-card__stall-actions">
            <button type="button" className="opp-card__retry" onClick={onRetry}>
              Retry
            </button>
          </div>
        </div>
      )}
    </OpponentCard>
  );
}
