// src/clients/sorry/SorryApp.tsx
import { useGameState } from "../shared/useGameState";
import type { SorryView, SorryAction, SorryCard } from "../shared/contracts/sorry";
import { Board } from "./Board";
import { OpponentCard } from "../shared/OpponentCard";
import { OpponentBanter } from "../shared/OpponentBanter";

// The drawn card's printed face. The value is always the server's — the client
// never draws a card (card draw is a server-authoritative rule step).
function cardFace(card: SorryCard): string {
  if (card === null) return "";
  if (card === "sorry") return "Sorry!";
  return String(card);
}

export function SorryApp() {
  const { view, post, ctx } = useGameState<SorryView, SorryAction>();

  if (!view) return <div className="banner">Loading…</div>;

  const myTurn = view.youAre != null && view.currentPlayer === view.youAre;

  return (
    <div id="sorry-root-inner">
      <header className="sorry-header">
        <h1 className="sorry-title">Sorry!</h1>
        <div className={`turn-pill${myTurn ? " mine" : ""}`}>
          {myTurn ? "Your turn" : "Opponent's turn"}
        </div>
      </header>

      <OpponentCard
        personaId={ctx.opponentPersonaId ?? null}
        friendlyName={ctx.opponentFriendlyName ?? "Opponent"}
        color={ctx.opponentColor}
        glyph={ctx.opponentGlyph}
      >
        <OpponentBanter
          gameId={ctx.gameId}
          userId={ctx.userId}
          sseUrl={ctx.sseUrl}
          friendlyName={ctx.opponentFriendlyName ?? "Opponent"}
        />
      </OpponentCard>

      <div className="sorry-deck">
        <div className="deck-stack" aria-hidden="true">
          {view.deckCount}
        </div>
        {/* key on the value so a changed drawnCard remounts and replays the
            CSS flip animation; the face is whatever the server revealed. */}
        <div
          key={`card-${cardFace(view.drawnCard)}`}
          className="sorry-card flip"
          data-testid="drawn-card"
          data-card={cardFace(view.drawnCard)}
        >
          {cardFace(view.drawnCard)}
        </div>
      </div>

      <Board
        view={view}
        onPick={(moveId) => post({ type: "move", payload: { moveId } })}
        selected={null}
      />

      {view.winner !== null && (
        <div
          className={`sorry-endbanner ${view.youAre === view.winner ? "win" : "lose"}`}
          role="status"
        >
          {view.youAre === view.winner ? "You win!" : "You lose — defeat."}
        </div>
      )}
    </div>
  );
}
