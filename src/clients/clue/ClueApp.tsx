// Top-level Clue client. Renders the server's truth (view) over the geometry
// mirror; every decision is a POSTed engine action. Dice are client-side:
// the human rolls a visible d6 for themselves AND resolves a bot's
// clue_roll_request on its behalf (backgammon proxy pattern). The client
// never emits enterRoom (F7): room entry is a move onto a reachable room.
import { useEffect, useRef, useState } from "react";
import { useGameState } from "../shared/useGameState";
import { AiRoster, type BotSeat } from "../shared/AiRoster";
import { DiceTray, type DiceTrayHandle } from "../shared/DiceTray";
import type {
  ClueView, ClueAction, RoomId, SuspectId, WeaponId, CardId,
} from "../shared/contracts/clue";
import { Board } from "./Board";
import { RefutePrompt } from "./RefutePrompt";
import { ClueCard } from "./ClueCard";
import { isMyRefute } from "./refute-prompt.js";
import { PAWN_COLORS } from "./board-geometry.js";
import "../shared/OpponentCard.css";

const SUSPECTS: SuspectId[] = ["scarlett", "mustard", "white", "green", "peacock", "plum"];
const WEAPONS: WeaponId[] = ["candlestick", "knife", "leadpipe", "revolver", "rope", "wrench"];
const ROOMS: RoomId[] = [
  "kitchen", "ballroom", "conservatory", "diningroom", "billiardroom",
  "library", "lounge", "hall", "study",
];

interface RollRequest {
  seat: number;
  personaId: string;
}

function ThreeCardPicker({
  rooms,
  fixedRoom,
  verb,
  onSubmit,
}: {
  rooms: RoomId[] | null; // null => room locked to fixedRoom
  fixedRoom?: RoomId;
  verb: string;
  onSubmit: (suspect: SuspectId, weapon: WeaponId, room: RoomId) => void;
}) {
  const [suspect, setSuspect] = useState<SuspectId>(SUSPECTS[0]);
  const [weapon, setWeapon] = useState<WeaponId>(WEAPONS[0]);
  const [room, setRoom] = useState<RoomId>(fixedRoom ?? ROOMS[0]);
  return (
    <div className="clue-picker" data-testid={`${verb}-form`}>
      <select value={suspect} onChange={(e) => setSuspect(e.target.value as SuspectId)}>
        {SUSPECTS.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={weapon} onChange={(e) => setWeapon(e.target.value as WeaponId)}>
        {WEAPONS.map((w) => <option key={w} value={w}>{w}</option>)}
      </select>
      {rooms ? (
        <select value={room} onChange={(e) => setRoom(e.target.value as RoomId)}>
          {rooms.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      ) : (
        <b className="clue-picker-room">{fixedRoom}</b>
      )}
      <button type="button" onClick={() => onSubmit(suspect, weapon, fixedRoom ?? room)}>
        {verb}
      </button>
    </div>
  );
}

function logLine(entry: Record<string, unknown>, name: (seat: number) => string): string {
  switch (entry.type) {
    case "suggest":
      return `${name(entry.bySeat as number)} suggests ${entry.suspect} · ${entry.weapon} · ${entry.room}`;
    case "no-refute":
      return `${name(entry.seat as number)} cannot refute`;
    case "refute":
      return `${name(entry.bySeat as number)} shows a card to ${name(entry.ofSeat as number)}`;
    case "accuse":
      return `${name(entry.bySeat as number)} accuses — ${entry.correct ? "CORRECT!" : "wrong"}`;
    default:
      return JSON.stringify(entry);
  }
}

export function ClueApp() {
  const { view, post, ctx, actionError } = useGameState<ClueView, ClueAction>();
  const diceRef = useRef<DiceTrayHandle>(null);
  const [rollReq, setRollReq] = useState<RollRequest | null>(null);
  const [rolling, setRolling] = useState(false);
  const [accusing, setAccusing] = useState(false);

  // A bot's values-less roll intent arrives as a named SSE event. Any human
  // participant may resolve it; the engine rejects duplicate/late rolls.
  useEffect(() => {
    const es = new EventSource(ctx.sseUrl);
    const onReq = (e: MessageEvent) => {
      try {
        setRollReq(JSON.parse(e.data) as RollRequest);
      } catch {
        /* malformed frame: ignore — the SSE-subscribe nudge will re-request */
      }
    };
    es.addEventListener("clue_roll_request", onReq as EventListener);
    return () => es.close();
  }, [ctx.sseUrl]);

  if (!view) return <div className="banner">Loading…</div>;

  const players = ctx.players ?? [];
  const name = (seat: number) =>
    players.find((p) => p.seat === seat)?.friendlyName ?? `Seat ${seat + 1}`;
  const bots: BotSeat[] = players
    .filter((p) => p.isBot)
    .map((p) => ({
      seat: p.seat,
      userId: p.userId,
      personaId: p.personaId ?? "",
      friendlyName: p.friendlyName,
      color: p.color,
      glyph: p.glyph,
    }));

  const myTurn = view.youAreSeat != null && view.activeUserId === ctx.userId;
  const needsRoll = myTurn && view.phase === "move" && view.movement?.needsRoll === true;
  const passage = view.movement?.needsRoll === true ? view.movement.secretPassage : null;
  // A stale roll request self-invalidates once the view shows the die landed
  // (or the bot's turn ended some other way, e.g. it accused instead).
  const liveRollReq =
    rollReq != null &&
    view.phase === "move" &&
    view.pendingRoll == null &&
    view.currentSeat === rollReq.seat &&
    view.seatSuspect[rollReq.seat] != null &&
    view.activeUserId !== ctx.userId
      ? rollReq
      : null;
  const showTray = needsRoll || liveRollReq != null;

  async function rollAndPost() {
    if (rolling) return;
    setRolling(true);
    try {
      const values = await diceRef.current!.roll(1);
      await post({ type: "roll", payload: { value: values[0] } });
    } catch {
      /* duplicate/late roll or dice error — the next update resyncs */
    } finally {
      setRolling(false);
      setRollReq(null);
    }
  }

  const myRoom: RoomId | undefined =
    view.youAreSeat != null
      ? view.pawns[view.seatSuspect[view.youAreSeat]]?.room
      : undefined;
  const canAccuse =
    myTurn && (view.phase === "accuse-or-pass" || (view.phase === "move" && needsRoll));
  const winner = view.winnerSeat;

  return (
    <div className="clue-root-inner">
      <header className="clue-header">
        <div>
          <span className="clue-title">CLUE</span>
          <span className="clue-sub">the classic mystery · game {ctx.gameId}</span>
        </div>
        <div className="clue-header-meta">
          <a href="/">↩ Lobby</a>
          <em data-testid="turn-status">
            {view.phase === "ended"
              ? "case closed"
              : myTurn
                ? "your move"
                : `waiting for ${name(view.currentSeat)}`}
          </em>
        </div>
      </header>

      <section className="clue-roster" data-testid="roster">
        {view.seats.map((_, seat) => (
          <span
            key={seat}
            className={`clue-seat${seat === view.currentSeat ? " is-turn" : ""}${view.eliminated[seat] ? " is-out" : ""}${seat === view.youAreSeat ? " is-you" : ""}`}
          >
            <i
              className="clue-seat-pip"
              style={{ background: PAWN_COLORS[view.seatSuspect[seat]] }}
            />
            {name(seat)}
            <em> as {view.seatSuspect[seat]}</em>
            {view.eliminated[seat] && <em> · eliminated</em>}
          </span>
        ))}
      </section>

      {actionError && <div className="clue-error" role="alert">{actionError}</div>}

      {/* Client-side dice: my roll, or resolving a bot's requested roll. */}
      {showTray && (
        <section className="clue-dice" data-testid="dice-tray">
          <DiceTray ref={diceRef} count={1} tuning={{ camera: "low" }} />
          <button type="button" className="clue-roll" disabled={rolling} onClick={rollAndPost}>
            {needsRoll
              ? "Roll the die"
              : `Roll for ${name(liveRollReq!.seat)} 🎲`}
          </button>
          {needsRoll && passage && (
            <button
              type="button"
              className="clue-passage"
              onClick={() => post({ type: "secretPassage" }).catch(() => {})}
            >
              Take the secret passage to the {passage}
            </button>
          )}
        </section>
      )}

      <Board
        view={view}
        onPickSquare={(sq) => post({ type: "move", payload: { square: sq } }).catch(() => {})}
        onPickRoom={(room) => post({ type: "move", payload: { room } }).catch(() => {})}
      />

      {myTurn && view.phase === "suggest" && myRoom && (
        <section className="clue-panel" data-testid="suggest-panel">
          <h3>You are in the {myRoom} — make a suggestion</h3>
          <ThreeCardPicker
            rooms={null}
            fixedRoom={myRoom}
            verb="Suggest"
            onSubmit={(suspect, weapon, room) =>
              post({ type: "suggest", payload: { suspect, weapon, room } }).catch(() => {})
            }
          />
        </section>
      )}

      {myTurn && view.phase === "accuse-or-pass" && (
        <section className="clue-panel" data-testid="pass-panel">
          <button type="button" className="clue-pass" onClick={() => post({ type: "pass" }).catch(() => {})}>
            End turn
          </button>
        </section>
      )}

      {canAccuse && (
        <section className="clue-panel clue-accuse" data-testid="accuse-panel">
          {accusing ? (
            <>
              <h3>Final accusation — a wrong guess eliminates you</h3>
              <ThreeCardPicker
                rooms={ROOMS}
                verb="Accuse"
                onSubmit={(suspect, weapon, room) =>
                  post({ type: "accuse", payload: { suspect, weapon, room } }).catch(() => {})
                }
              />
              <button type="button" onClick={() => setAccusing(false)}>Never mind</button>
            </>
          ) : (
            <button type="button" onClick={() => setAccusing(true)}>Make an accusation…</button>
          )}
        </section>
      )}

      {view.phase === "refute" && isMyRefute(view, ctx.userId) && (
        <RefutePrompt
          view={view}
          onShow={(card: CardId) => post({ type: "refute", payload: { card } }).catch(() => {})}
        />
      )}
      {view.phase === "refute" && !isMyRefute(view, ctx.userId) && view.suggestion && (
        <div className="clue-banner" role="status">
          Waiting for {name(view.suggestion.refuterSeat ?? 0)} to show a card…
        </div>
      )}

      <section className="clue-tray">
        <div className="clue-hand" data-testid="hand">
          <h4>Your hand</h4>
          {view.hand.map((c) => <ClueCard key={c} id={c} />)}
        </div>
        {view.ledger.length > 0 && (
          <div className="clue-ledger" data-testid="ledger">
            <h4>Shown to you</h4>
            {view.ledger.map((e, i) => (
              <ClueCard key={i} id={e.card} caption={`(${name(e.fromSeat)})`} />
            ))}
          </div>
        )}
      </section>

      {view.log.length > 0 && (
        <section className="clue-log" data-testid="log">
          {view.log.slice(-8).reverse().map((entry, i) => (
            <p key={view.log.length - i}>{logLine(entry, name)}</p>
          ))}
        </section>
      )}

      {bots.length > 0 && (
        <AiRoster bots={bots} gameId={ctx.gameId} userId={ctx.userId} sseUrl={ctx.sseUrl} />
      )}

      {winner != null && (
        <div
          className={`clue-endbanner ${view.youAreSeat === winner ? "win" : "lose"}`}
          role="status"
          data-testid="end-banner"
        >
          {view.youAreSeat === winner
            ? "Case closed — you win!"
            : `${name(winner)} solved it.`}
        </div>
      )}
    </div>
  );
}
