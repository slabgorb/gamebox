// src/clients/sorry/SorryApp.tsx
// "The Cabinet" chrome (Claude Design handoff): wood-plank header with a brass
// SORRY! plate, a paper deck/card rail, a wood-framed board, and a table
// roster. The board is drawn for four sides but the engine is 2-player, so two
// roster seats sit empty and two board quadrants are decorative.
import { useGameState } from "../shared/useGameState";
import type { SorryView, SorryAction, SorryCard, SorrySide } from "../shared/contracts/sorry";
import { Board } from "./Board";
import { OpponentBanter } from "../shared/OpponentBanter";
// OpponentBanter renders with the shared opp-card__* classes; pull their styles
// into the bundle (the Cabinet chrome no longer renders OpponentCard itself).
import "../shared/OpponentCard.css";

// The drawn card's printed face. The value is always the server's — the client
// never draws a card (card draw is a server-authoritative rule step).
function cardFace(card: SorryCard): string {
  if (card === null) return "";
  if (card === "sorry") return "Sorry!";
  return String(card);
}

interface Seat {
  color: "red" | "blue" | "green" | "orange";
  side: SorrySide | null; // null = decorative open seat
  checker: string;
}

export function SorryApp() {
  const { view, post, ctx } = useGameState<SorryView, SorryAction>();

  if (!view) return <div className="banner">Loading…</div>;

  const myTurn = view.youAre != null && view.currentPlayer === view.youAre;

  // Viewer-relative seating to match the board: you are always red, the opponent
  // blue (spectator: the bottom seat, engine b, is red). The two empty seats are
  // the decorative colours.
  const redSide: SorrySide = view.youAre ?? "b";
  const blueSide: SorrySide = redSide === "a" ? "b" : "a";
  const seats: Seat[] = [
    { color: "red", side: redSide, checker: "assets/checker-red.png" },
    { color: "blue", side: blueSide, checker: "assets/checker-blue.png" },
    { color: "green", side: null, checker: "assets/checker-green.png" },
    { color: "orange", side: null, checker: "assets/checker-orange.png" },
  ];
  // On the active viewer's turn legalMoves is always present; an empty array
  // means there is no legal move and the only action is to pass.
  const mustPass = myTurn && (view.legalMoves?.length ?? 0) === 0;

  function seatLabel(seat: Seat): { name: string; meta: string; you: boolean } {
    if (seat.side == null) return { name: "Open seat", meta: "—", you: false };
    const you = view!.youAre === seat.side;
    const name = you
      ? ctx.yourFriendlyName ?? "You"
      : ctx.opponentFriendlyName ?? "Opponent";
    const isTurn = view!.currentPlayer === seat.side;
    const meta = isTurn ? "to play" : "waiting";
    return { name, meta, you };
  }

  const face = view.drawnCard;
  const glyph = face === "sorry" ? "!" : face === null ? "" : String(face);
  const corner = face === "sorry" ? "Sorry" : face === null ? "" : String(face);

  return (
    <div className="va-root" id="sorry-root-inner">
      {/* Wood plank header with brass SORRY! plate */}
      <header className="va-plank">
        <span className="va-screw va-screw-l" />
        <span className="va-screw va-screw-r" />
        <div className="va-plate">
          <span className="va-rivet va-rivet-tl" />
          <span className="va-rivet va-rivet-tr" />
          <span className="va-rivet va-rivet-bl" />
          <span className="va-rivet va-rivet-br" />
          <span className="va-plate-text">SORRY!</span>
        </div>
        <div className="va-plank-meta">
          <a className="va-lobby-link" href="/">↩ Lobby</a>
          <span className="va-eyebrow">match · {ctx.gameId}</span>
          <em>{myTurn ? "your move" : "opponent's move"}</em>
        </div>
      </header>

      {/* Control rail: deck + drawn card */}
      <section className="va-rail">
        <div className="va-deck-group">
          <div className="va-deck-stack" aria-hidden="true">
            <span className="va-deck-back va-deck-back-3" />
            <span className="va-deck-back va-deck-back-2" />
            <span className="va-deck-back va-deck-back-1">
              <span className="va-deck-pip">{view.deckCount}</span>
            </span>
          </div>
          {/* key on the value so a changed drawnCard remounts and replays the
              CSS flip animation; the face is whatever the server revealed. */}
          <div
            key={`card-${cardFace(face)}`}
            className={`va-card flip${face === null ? " is-empty" : ""}`}
            data-testid="drawn-card"
            data-card={cardFace(face)}
          >
            <span className="va-card-corner tl">{corner}</span>
            <span className="va-card-glyph">{glyph}</span>
            <span className="va-card-corner br">{corner}</span>
          </div>
          <p className="va-rail-meta">
            <em>
              {face === null
                ? "Draw a card to begin your turn."
                : face === "sorry"
                  ? "Bump any opponent pawn back to Start."
                  : `Move a pawn ${glyph}.`}
            </em>
          </p>
        </div>
      </section>

      {/* Turn prompt — the card is auto-drawn server-side, so spell out that it's
          already dealt and that the move is a tap on a glowing space. */}
      <div className={`va-turn${myTurn ? " is-mine" : ""}`} data-testid="turn-prompt" role="status">
        {myTurn ? (
          mustPass ? (
            <span>
              <strong>Your turn</strong> — you drew{" "}
              <b className="va-turn-card">{cardFace(view.drawnCard)}</b>, but there's no legal move.{" "}
              <button
                type="button"
                className="va-pass-btn"
                data-testid="pass-button"
                onClick={() => post({ type: "pass" })}
              >
                Pass
              </button>
            </span>
          ) : (
            <span>
              <strong>Your turn</strong> — you drew{" "}
              <b className="va-turn-card">{cardFace(view.drawnCard)}</b>. Tap a glowing space to move.
            </span>
          )
        ) : (
          <span>
            <strong>{ctx.opponentFriendlyName ?? "Opponent"}</strong> is thinking…
          </span>
        )}
      </div>

      {/* Breadcrumb so an opponent's (or your own) no-move pass is visible — the
          turn no longer flips silently. Cleared by the server on any real move. */}
      {view.lastEvent?.kind === "pass" && (
        <div className="va-lastevent" data-testid="last-event" role="status">
          {view.lastEvent.side === view.youAre ? "You" : (ctx.opponentFriendlyName ?? "Opponent")} drew{" "}
          <b>{cardFace(view.lastEvent.card)}</b> — no legal move, passed.
        </div>
      )}

      {/* Wood-framed board */}
      <div className="va-frame">
        <span className="va-corner tl" />
        <span className="va-corner tr" />
        <span className="va-corner bl" />
        <span className="va-corner br" />
        <Board view={view} onPick={(moveId) => post({ type: "move", payload: { moveId } })} />
      </div>

      {/* Table roster */}
      <section className="va-roster-wrap">
        <div className="va-roster-head">
          <span className="va-eyebrow">at the table</span>
          <em>two players · cabinet rules</em>
        </div>
        <ul className="va-roster">
          {seats.map((seat) => {
            const { name, meta, you } = seatLabel(seat);
            const isTurn = seat.side != null && view.currentPlayer === seat.side;
            return (
              <li
                key={seat.color}
                className={`va-roster-row ${you ? "is-you" : ""} ${seat.side == null ? "is-open" : ""}`}
              >
                <span className={`va-roster-pip va-roster-pip-${seat.color}`}>
                  <img src={seat.checker} alt="" draggable={false} />
                </span>
                <span className="va-roster-name">
                  <strong>{name}</strong>
                  <em>{meta}</em>
                </span>
                {isTurn && <span className="va-roster-turn">{you ? "Your move" : "To play"}</span>}
              </li>
            );
          })}
        </ul>
        <OpponentBanter
          gameId={ctx.gameId}
          userId={ctx.userId}
          sseUrl={ctx.sseUrl}
          friendlyName={ctx.opponentFriendlyName ?? "Opponent"}
        />
      </section>

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
