import { useState } from "react";
import { useGameState } from "../shared/useGameState";
import { GameChrome } from "../shared/GameChrome";
import { OpponentCard } from "../shared/OpponentCard";
import { OpponentBanter } from "../shared/OpponentBanter";
import { PegBoard } from "./PegBoard";
import { Hand } from "./Hand";
import { Pegging } from "./Pegging";
import { Show } from "./Show";
import { Card as CardImg } from "../shared/Card";
import type {
  CribbageView,
  CribbageAction,
  Card as CardType,
} from "../shared/contracts/cribbage";

function bannerText(view: CribbageView, mySide: 0 | 1, myUserId: number): string {
  const myTurn = view.activeUserId === myUserId;
  const isDealer = mySide === view.dealer;
  switch (view.phase) {
    case "discard":
      return `Discard 2 to ${isDealer ? "your" : "your opponent's"} crib`;
    case "cut":
      return isDealer ? "Waiting for opponent to cut…" : "Cut the deck";
    case "pegging":
      return myTurn
        ? `Your play — running ${view.pegging?.running ?? 0}`
        : `Opponent's play — running ${view.pegging?.running ?? 0}`;
    case "show":
      return "Hand counts";
    case "match-end": {
      const me = view.scores[mySide];
      const opp = view.scores[1 - mySide];
      const won = view.winnerSide === (mySide === 0 ? "a" : "b");
      const skunked = (won ? opp : me) < 91;
      const margin = skunked ? " — skunk!" : "";
      return won
        ? `You won the match, ${me} to ${opp}${margin}`
        : `Opponent won the match, ${opp} to ${me}${margin}`;
    }
  }
}

export function CribbageApp() {
  const { view, ctx } = useGameState<CribbageView, CribbageAction>();
  const [pendingDiscard, setPendingDiscard] = useState<CardType[]>([]);
  void pendingDiscard; // Wired in Task 3.7

  if (!view) return <div className="banner">Loading…</div>;

  const myUserId = ctx.userId;
  const mySide: 0 | 1 = view.sides.a === myUserId ? 0 : 1;
  const oppSide: 0 | 1 = (1 - mySide) as 0 | 1;
  const isMatchEnd = view.phase === "match-end";

  const myHand = Array.isArray(view.hands[mySide]) ? (view.hands[mySide] as CardType[]) : [];
  const oppCount = !Array.isArray(view.hands[oppSide])
    ? (view.hands[oppSide] as { count: number }).count
    : (view.hands[oppSide] as CardType[]).length;

  const opponent = (
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
  );

  return (
    <GameChrome title="Cribbage" status={<span>{bannerText(view, mySide, myUserId)}</span>} controls={opponent}>
      <PegBoard
        scores={view.scores}
        prevScores={view.prevScores}
        matchTarget={view.matchTarget}
        myColor={ctx.yourColor ?? "#3b82f6"}
        opponentColor={ctx.opponentColor ?? "#f59e0b"}
        mySide={mySide}
      />

      <section className="hand-row hand-row--opp">
        <Hand mode="opponent" cards={null} count={oppCount} />
      </section>

      <section className="table">
        <div className="slot slot--starter">
          {view.starter ? <CardImg card={view.starter} /> : null}
        </div>
        {view.pegging && (view.phase === "pegging" || view.phase === "show") && (
          <div className="pegging-strip">
            <Pegging pegging={view.pegging} />
          </div>
        )}
      </section>

      <section className="hand-row hand-row--me">
        {view.phase === "discard" && view.pendingDiscards[mySide] == null && (
          <Hand
            mode="discard"
            cards={myHand}
            onSelectionChange={setPendingDiscard}
          />
        )}
        {view.phase === "discard" && view.pendingDiscards[mySide] != null && (
          <Hand mode="view" cards={myHand} />
        )}
        {view.phase === "cut" && <Hand mode="view" cards={myHand} />}
        {view.phase === "pegging" && view.pegging && (
          <Hand
            mode="pegging"
            cards={myHand}
            pegging={view.pegging}
            isMyTurn={view.activeUserId === myUserId}
            onPlay={() => {}}
          />
        )}
        {(view.phase === "show" || isMatchEnd) && <Hand mode="view" cards={myHand} />}
      </section>

      {(view.phase === "show" || isMatchEnd) && view.showBreakdown && (
        <div className="show-overlay">
          <Show
            breakdown={view.showBreakdown}
            isDealer={mySide === view.dealer}
            isMatchEnd={isMatchEnd}
            myAcknowledged={view.acknowledged[mySide]}
            scoresMe={view.scores[mySide]}
            scoresOpp={view.scores[oppSide]}
            wonMatch={view.winnerSide === (mySide === 0 ? "a" : "b")}
            onAcknowledge={() => {}}
          />
        </div>
      )}
    </GameChrome>
  );
}
