import { useEffect, useRef, useState } from "react";
import { useGameState } from "../shared/useGameState";
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
import { play, playForScore, primeAudio, isMuted, toggleMuted } from "./sounds";

const THEME_KEY = "cribbage.tableTheme";
type TableTheme = "baize" | "walnut" | "noir";
const THEMES: ReadonlyArray<TableTheme> = ["baize", "walnut", "noir"];
function readStoredTheme(): TableTheme {
  if (typeof localStorage === "undefined") return "baize";
  const v = localStorage.getItem(THEME_KEY) as TableTheme | null;
  return v && THEMES.includes(v) ? v : "baize";
}

function PhaseEyebrow({
  phase,
  running,
  myTurn,
  isDealer,
}: {
  phase: CribbageView["phase"];
  running: number;
  myTurn: boolean;
  isDealer: boolean;
}) {
  switch (phase) {
    case "discard":
      return (
        <div className="phase-eyebrow">
          <span>
            Discard 2 to <em>{isDealer ? "your" : "their"}</em> crib.
          </span>
        </div>
      );
    case "cut":
      return (
        <div className="phase-eyebrow">
          {isDealer ? <em>Waiting for the cut…</em> : <span>Cut the deck.</span>}
        </div>
      );
    case "pegging":
      return (
        <div className="phase-eyebrow">
          <span>{myTurn ? "Your play." : "Their play."}</span>
          <span className="phase-eyebrow__count">
            Running <em style={{ marginLeft: 6 }}>{running}</em> / 31
          </span>
        </div>
      );
    case "show":
      return (
        <div className="phase-eyebrow">
          <em>"Pegs forward — let's count 'em."</em>
        </div>
      );
    default:
      return null;
  }
}

export function applyTransition(
  prev: CribbageView | null,
  next: CribbageView,
  myUserId: number,
): void {
  if (!prev) return;
  const wasMine = prev.activeUserId === myUserId;
  const isMine = next.activeUserId === myUserId;
  if (!wasMine && isMine && next.phase === "pegging") play("your-turn");

  if (prev.phase !== "match-end" && next.phase === "match-end") {
    const mySide = next.sides.a === myUserId ? 0 : 1;
    const won = next.winnerSide === (mySide === 0 ? "a" : "b");
    const loserScore = won ? next.scores[1 - mySide] : next.scores[mySide];
    play("cheer-100");
    if (loserScore < 91) {
      setTimeout(() => play("cheer-50"), 600);
    }
  }

  for (const side of [0, 1] as const) {
    const delta = (next.scores?.[side] ?? 0) - (prev.scores?.[side] ?? 0);
    if (delta > 0 && next.phase !== "match-end") {
      playForScore(delta);
    }
  }
}

export function formatDealSummary(
  prev: CribbageView,
  next: CribbageView,
  myName: string,
  oppName: string,
): string {
  return `Deal ${prev.dealNumber} → ${next.dealNumber}. ${myName} ${prev.scores[0]}, ${oppName} ${prev.scores[1]}.`;
}

function SkunkPlate({
  won,
  scoresMe,
  scoresOpp,
}: {
  won: boolean;
  scoresMe: number;
  scoresOpp: number;
}) {
  return (
    <div className="skunk-plate" id="skunk-banner">
      <div className="skunk-plate__eyebrow">
        {won ? "Skunk delivered" : "Skunk taken"}
      </div>
      <div className="skunk-plate__title">SKUNKED</div>
      <div className="skunk-plate__sub">
        {won ? (
          <>
            You finished {scoresMe} to {scoresOpp}. <em>Cruel, that.</em>
          </>
        ) : (
          <>
            Final: {scoresOpp} to {scoresMe}. <em>Stings, doesn't it.</em>
          </>
        )}
      </div>
    </div>
  );
}

export function CribbageApp() {
  const { view, post, ctx } = useGameState<CribbageView, CribbageAction>();
  const [pendingDiscard, setPendingDiscard] = useState<CardType[]>([]);
  const [toast, setToast] = useState<string | null>(null);

  const prevViewRef = useRef<CribbageView | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handCacheRef = useRef<CardType[] | null>(null);
  const lastShapeOkRef = useRef(true);

  useEffect(() => {
    if (!view) return;
    applyTransition(prevViewRef.current, view, ctx.userId);
    if (
      prevViewRef.current &&
      prevViewRef.current.phase === "show" &&
      view.phase === "discard" &&
      prevViewRef.current.showBreakdown
    ) {
      const summary = formatDealSummary(
        prevViewRef.current,
        view,
        ctx.yourFriendlyName ?? "You",
        ctx.opponentFriendlyName ?? "Opponent",
      );
      setToast(summary);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 4500);
    }
    prevViewRef.current = view;
  });

  useEffect(
    () => () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    const handler = () => primeAudio();
    document.addEventListener("click", handler, { once: true });
    return () => document.removeEventListener("click", handler);
  }, []);

  const [theme, setTheme] = useState<TableTheme>(readStoredTheme);
  const [muted, setMuted] = useState<boolean>(() => isMuted());

  useEffect(() => {
    const classes = THEMES.map((t) => `table-${t}`);
    document.body.classList.remove(...classes);
    document.body.classList.add(`table-${theme}`);
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(THEME_KEY, theme);
    }
    return () => {
      document.body.classList.remove(`table-${theme}`);
    };
  }, [theme]);

  function onToggleMute() {
    const next = toggleMuted();
    setMuted(next);
    if (!next) play("click");
  }

  if (!view) return <div className="banner">Loading…</div>;

  const myUserId = ctx.userId;
  const mySide: 0 | 1 = view.sides.a === myUserId ? 0 : 1;
  const oppSide: 0 | 1 = (1 - mySide) as 0 | 1;
  const isMatchEnd = view.phase === "match-end";
  const myTurn = view.activeUserId === myUserId;
  const isDealer = mySide === view.dealer;

  // CROSS-BUG-1: defend against transient masked-hand views. A resync
  // race or viewerSide=null moment can deliver view.hands[mySide] in
  // the opponent shape {count: N}. Silent fallback to [] hid the bug
  // — the user saw the count keep ticking while their cards vanished.
  // Now: cache the last-good Card[], log on transition into bad shape,
  // and render face-down placeholders when there's no cache yet.
  const rawMyHand = view.hands[mySide];
  let myHand: CardType[];
  let myHandSource: "view" | "cache" | "placeholder" = "view";
  let myHandPlaceholderCount = 0;
  if (Array.isArray(rawMyHand)) {
    myHand = rawMyHand as CardType[];
    handCacheRef.current = myHand;
    lastShapeOkRef.current = true;
  } else {
    if (lastShapeOkRef.current) {
      console.error(
        "CribbageApp: view.hands[mySide] not Card[] — masked-hand shape during",
        view.phase,
        { mySide, raw: rawMyHand },
      );
      lastShapeOkRef.current = false;
    }
    if (handCacheRef.current) {
      myHand = handCacheRef.current;
      myHandSource = "cache";
    } else {
      myHand = [];
      myHandSource = "placeholder";
      myHandPlaceholderCount =
        (rawMyHand as { count?: number } | null)?.count ?? 0;
    }
  }
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

  const mySubmittedDiscard =
    view.phase === "discard" && view.pendingDiscards[mySide] != null;
  const showDiscardButton = view.phase === "discard" && !mySubmittedDiscard;
  const showCutButton = view.phase === "cut" && mySide !== view.dealer;

  const skunkLoserScore = isMatchEnd
    ? view.winnerSide === (mySide === 0 ? "a" : "b")
      ? view.scores[oppSide]
      : view.scores[mySide]
    : 121;
  const showSkunk = isMatchEnd && skunkLoserScore < 91;
  const wonMatch = view.winnerSide === (mySide === 0 ? "a" : "b");

  const myLabel = (ctx.yourFriendlyName ?? "You").split(" ")[0];
  const opponentLabel = (ctx.opponentFriendlyName ?? "Opp").split(" ")[0];

  const activeSide: 0 | 1 | null =
    view.activeUserId == null
      ? null
      : view.activeUserId === myUserId
        ? mySide
        : oppSide;

  return (
    <main className="cribbage" data-screen-label={`Cribbage · ${view.phase}`}>
      <header className="gb-header game-chrome__header">
        <span className="gb-screws gb-screws--l" />
        <span className="gb-screws gb-screws--r" />
        <div className="gb-header__inner">
          <a
            href="/"
            className="gb-back"
            aria-label="Back to cabinet"
          >
            ← Cabinet
          </a>
          <h1 className="gb-plate game-chrome__title">Cribbage</h1>
          <div className="gb-controls">
            <label className="gb-theme">
              <span className="gb-theme__label">Table</span>
              <select
                className="gb-theme__select"
                value={theme}
                onChange={(e) => setTheme(e.target.value as TableTheme)}
                aria-label="Table backdrop"
              >
                <option value="baize">Baize</option>
                <option value="walnut">Walnut</option>
                <option value="noir">Noir</option>
              </select>
            </label>
            <button
              type="button"
              id="btn-mute"
              className="gb-mute"
              aria-label={muted ? "Unmute sounds" : "Mute sounds"}
              aria-pressed={muted}
              onClick={onToggleMute}
            >
              {muted ? "🔇" : "🔊"}
            </button>
          </div>
        </div>
      </header>

      <div className="cribbage__layout">
        <div className="peg-board-wrap">
          <PegBoard
            scores={view.scores}
            prevScores={view.prevScores}
            matchTarget={view.matchTarget}
            myColor={ctx.yourColor ?? "#3b82f6"}
            opponentColor={ctx.opponentColor ?? "#f59e0b"}
            mySide={mySide}
            activeSide={activeSide}
            myLabel={myLabel}
            opponentLabel={opponentLabel}
          />
        </div>

        <section className="opp-row hand-row hand-row--opp">
          <div className="opp-row__hand">
            <Hand mode="opponent" cards={null} count={oppCount} />
          </div>
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
        </section>

        {view.phase === "pegging" && view.pegging && (
          <div className="pegging-strip">
            <Pegging pegging={view.pegging} starter={view.starter} />
          </div>
        )}

        {view.phase !== "pegging" && !isMatchEnd && (
          <div className="table table-row">
            <div className="slot">
              <div className="slot__label">Crib</div>
              {view.phase === "discard" && mySubmittedDiscard ? (
                <div className="crib-stack">
                  <CardImg card={{}} faceDown />
                  <CardImg card={{}} faceDown />
                </div>
              ) : (
                <div className="slot__placeholder">crib</div>
              )}
            </div>
            <div className="slot slot--starter">
              <div className="slot__label">Starter</div>
              {view.starter ? (
                <CardImg card={view.starter} className="is-starter" />
              ) : (
                <div className="slot__placeholder">cut</div>
              )}
            </div>
          </div>
        )}

        <section className="hand-row hand-row--me">
          <PhaseEyebrow
            phase={view.phase}
            running={view.pegging?.running ?? 0}
            myTurn={myTurn}
            isDealer={isDealer}
          />
          <div className="hand hand--flat">
            {view.phase === "discard" && !mySubmittedDiscard && (
              <Hand
                mode="discard"
                cards={myHand}
                onSelectionChange={setPendingDiscard}
              />
            )}
            {view.phase === "discard" && mySubmittedDiscard && (
              <Hand mode="view" cards={myHand} />
            )}
            {view.phase === "cut" && <Hand mode="view" cards={myHand} />}
            {view.phase === "pegging" && view.pegging && myHandSource !== "placeholder" && (
              <Hand
                mode="pegging"
                cards={myHand}
                pegging={view.pegging}
                isMyTurn={myTurn}
                onPlay={onPlay}
              />
            )}
            {view.phase === "pegging" && myHandSource === "placeholder" && (
              <div
                data-state="hand-unknown"
                className="hand-unknown"
                aria-label="Your hand is syncing"
              >
                {Array.from({ length: myHandPlaceholderCount }, (_, i) => (
                  <CardImg key={i} card={{}} faceDown />
                ))}
              </div>
            )}
            {(view.phase === "show" || isMatchEnd) && (
              <Hand mode="view" cards={myHand} />
            )}
          </div>
          {(showDiscardButton || showCutButton) && (
            <div className="phase-action">
              {showDiscardButton && (
                <button
                  type="button"
                  className="phase-action__btn btn-discard"
                  disabled={pendingDiscard.length !== 2}
                  onClick={onDiscard}
                >
                  Send to crib
                </button>
              )}
              {showCutButton && (
                <button
                  type="button"
                  className="phase-action__btn btn-cut"
                  onClick={onCut}
                >
                  Cut the deck
                </button>
              )}
            </div>
          )}
        </section>

        {(view.phase === "show" || isMatchEnd) && view.showBreakdown && (
          <div className="show-overlay">
            <Show
              breakdown={view.showBreakdown}
              isDealer={isDealer}
              isMatchEnd={isMatchEnd}
              myAcknowledged={view.acknowledged[mySide]}
              scoresMe={view.scores[mySide]}
              scoresOpp={view.scores[oppSide]}
              wonMatch={wonMatch}
              onAcknowledge={onAcknowledge}
            />
          </div>
        )}
      </div>

      {toast && <div className="cribbage-toast">{toast}</div>}
      {showSkunk && (
        <SkunkPlate
          won={wonMatch}
          scoresMe={view.scores[mySide]}
          scoresOpp={view.scores[oppSide]}
        />
      )}
    </main>
  );
}
