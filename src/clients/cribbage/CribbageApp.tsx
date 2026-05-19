import { useEffect, useRef, useState } from "react";
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
import { play, playForScore, primeAudio } from "./sounds";

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

export function applyTransition(
  prev: CribbageView | null,
  next: CribbageView,
  myUserId: number,
): void {
  if (!prev) return;
  // Activated turn boundary: not-my-turn → my-turn at pegging phase
  const wasMine = prev.activeUserId === myUserId;
  const isMine = next.activeUserId === myUserId;
  if (!wasMine && isMine && next.phase === "pegging") play("your-turn");

  // Match end transition
  if (prev.phase !== "match-end" && next.phase === "match-end") {
    const mySide = next.sides.a === myUserId ? 0 : 1;
    const won = next.winnerSide === (mySide === 0 ? "a" : "b");
    const loserScore = won ? next.scores[1 - mySide] : next.scores[mySide];
    play("cheer-100");
    if (loserScore < 91) {
      setTimeout(() => play("cheer-50"), 600);
    }
  }

  // Score motion → tiered cheer (avoid double-up with match-end)
  for (const side of [0, 1] as const) {
    const delta = (next.scores?.[side] ?? 0) - (prev.scores?.[side] ?? 0);
    if (delta > 0 && next.phase !== "match-end") {
      playForScore(delta);
    }
  }
}

export function CribbageApp() {
  const { view, post, ctx } = useGameState<CribbageView, CribbageAction>();
  const [pendingDiscard, setPendingDiscard] = useState<CardType[]>([]);

  const prevViewRef = useRef<CribbageView | null>(null);

  useEffect(() => {
    if (!view) return;
    const _myUserId = ctx.userId;
    applyTransition(prevViewRef.current, view, _myUserId);
    prevViewRef.current = view;
  });

  useEffect(() => {
    const handler = () => primeAudio();
    document.addEventListener("click", handler, { once: true });
    return () => document.removeEventListener("click", handler);
  }, []);

  if (!view) return <div className="banner">Loading…</div>;

  const myUserId = ctx.userId;
  const mySide: 0 | 1 = view.sides.a === myUserId ? 0 : 1;
  const oppSide: 0 | 1 = (1 - mySide) as 0 | 1;
  const isMatchEnd = view.phase === "match-end";

  const myHand = Array.isArray(view.hands[mySide]) ? (view.hands[mySide] as CardType[]) : [];
  const oppCount = !Array.isArray(view.hands[oppSide])
    ? (view.hands[oppSide] as { count: number }).count
    : (view.hands[oppSide] as CardType[]).length;

  async function onDiscard() {
    if (pendingDiscard.length !== 2) return;
    await post({ type: "discard", payload: { cards: pendingDiscard } });
    setPendingDiscard([]);
  }
  async function onCut() {
    await post({ type: "cut" });
  }
  async function onPlay(card: CardType) {
    await post({ type: "play", payload: { card } });
  }
  async function onAcknowledge() {
    await post({ type: "next" });
  }

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

  const mySubmittedDiscard =
    view.phase === "discard" && view.pendingDiscards[mySide] != null;
  const showDiscardButton =
    view.phase === "discard" && !mySubmittedDiscard;
  const showCutButton = view.phase === "cut" && mySide !== view.dealer;

  return (
    <GameChrome
      title="Cribbage"
      status={
        <span>
          {bannerText(view, mySide, myUserId)}
          {showDiscardButton && (
            <button
              type="button"
              className="btn-discard"
              disabled={pendingDiscard.length !== 2}
              onClick={onDiscard}
            >
              Send to crib
            </button>
          )}
          {showCutButton && (
            <button type="button" className="btn-cut" onClick={onCut}>
              Cut
            </button>
          )}
        </span>
      }
      controls={opponent}
    >
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
        {view.phase === "discard" && !mySubmittedDiscard && (
          <Hand mode="discard" cards={myHand} onSelectionChange={setPendingDiscard} />
        )}
        {view.phase === "discard" && mySubmittedDiscard && (
          <Hand mode="view" cards={myHand} />
        )}
        {view.phase === "cut" && <Hand mode="view" cards={myHand} />}
        {view.phase === "pegging" && view.pegging && (
          <Hand
            mode="pegging"
            cards={myHand}
            pegging={view.pegging}
            isMyTurn={view.activeUserId === myUserId}
            onPlay={onPlay}
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
            onAcknowledge={onAcknowledge}
          />
        </div>
      )}
    </GameChrome>
  );
}
