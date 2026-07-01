import { useEffect, useRef, useState } from "react";
import { BotCard, type BotBubble, type BotStall } from "./BotCard";
import "./OpponentCard.css";

export interface BotSeat {
  seat: number;
  userId: number; // == botUserId
  personaId: string;
  friendlyName: string;
  color?: string | null;
  glyph?: string | null;
}
export interface AiRosterProps {
  bots: BotSeat[];
  gameId: number;
  userId: number;
  sseUrl: string;
}

interface PersonaState {
  bubble: BotBubble | null;
  stall: BotStall | null;
}

const EMPTY: PersonaState = { bubble: null, stall: null };

interface LogEntry {
  id: number;
  author: string;
  text: string;
  kind: "bot" | "me";
  color?: string | null;
}
const MAX_LOG = 8;

export function AiRoster({ bots, gameId, userId, sseUrl }: AiRosterProps) {
  const [state, setState] = useState<Record<string, PersonaState>>({});
  const [myFlash, setMyFlash] = useState<string | null>(null);
  const [chatSubmitting, setChatSubmitting] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const hideTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const logRef = useRef<HTMLUListElement>(null);
  const logSeq = useRef(0);
  const knownPersonas = useRef(new Set(bots.map((b) => b.personaId)));
  knownPersonas.current = new Set(bots.map((b) => b.personaId));
  // persona → display name + colour, kept current each render for the log.
  const botMeta = useRef<Record<string, { name: string; color?: string | null }>>({});
  botMeta.current = Object.fromEntries(
    bots.map((b) => [b.personaId, { name: b.friendlyName, color: b.color }]),
  );

  function patch(personaId: string, fn: (s: PersonaState) => PersonaState) {
    if (!knownPersonas.current.has(personaId)) return;
    setState((prev) => ({ ...prev, [personaId]: fn(prev[personaId] ?? EMPTY) }));
  }

  function scheduleHide(personaId: string) {
    clearTimeout(hideTimers.current[personaId]);
    hideTimers.current[personaId] = setTimeout(() => {
      patch(personaId, (s) => ({ ...s, bubble: null }));
    }, 5000);
  }

  // The bubbles auto-hide; the log is the persistent scrollback (last MAX_LOG).
  function pushLog(entry: Omit<LogEntry, "id">) {
    setLog((prev) => [...prev, { ...entry, id: logSeq.current++ }].slice(-MAX_LOG));
  }

  useEffect(() => {
    const es = new EventSource(sseUrl);

    const onBanter = (ev: Event) => {
      const d = JSON.parse((ev as MessageEvent).data ?? "{}");
      if (!d.text || !d.personaId) return;
      patch(d.personaId, (s) => ({ ...s, bubble: { text: d.text, thinking: false } }));
      scheduleHide(d.personaId);
      const meta = botMeta.current[d.personaId];
      pushLog({
        author: meta?.name ?? d.displayName ?? "AI",
        text: d.text,
        kind: "bot",
        color: meta?.color ?? null,
      });
    };
    const onThinking = (ev: Event) => {
      const d = JSON.parse((ev as MessageEvent).data ?? "{}");
      if (!d.personaId) return;
      clearTimeout(hideTimers.current[d.personaId]);
      patch(d.personaId, (s) => ({
        ...s,
        stall: null,
        bubble: { text: `${d.displayName ?? "AI"} is thinking`, thinking: true },
      }));
    };
    const onStalled = (ev: Event) => {
      const d = JSON.parse((ev as MessageEvent).data ?? "{}");
      if (!d.personaId) return;
      patch(d.personaId, (s) => ({ ...s, stall: { reason: d.reason ?? "unknown" } }));
    };
    const onUpdate = () => {
      // Clear lingering "thinking" bubbles once a real state update lands.
      setState((prev) => {
        const next: Record<string, PersonaState> = {};
        for (const [k, v] of Object.entries(prev)) {
          next[k] = v.bubble?.thinking ? { ...v, bubble: null } : v;
        }
        return next;
      });
    };
    const onUserChat = (ev: Event) => {
      const d = JSON.parse((ev as MessageEvent).data ?? "{}");
      if (d.userId !== userId || !d.text) return;
      pushLog({ author: "You", text: d.text, kind: "me" });
    };

    es.addEventListener("banter", onBanter);
    es.addEventListener("bot_thinking", onThinking);
    es.addEventListener("bot_stalled", onStalled);
    es.addEventListener("update", onUpdate);
    es.addEventListener("user_chat", onUserChat);

    return () => {
      es.removeEventListener("banter", onBanter);
      es.removeEventListener("bot_thinking", onThinking);
      es.removeEventListener("bot_stalled", onStalled);
      es.removeEventListener("update", onUpdate);
      es.removeEventListener("user_chat", onUserChat);
      es.close();
      for (const t of Object.values(hideTimers.current)) clearTimeout(t);
      if (flashTimer.current) clearTimeout(flashTimer.current);
    };
  }, [sseUrl, userId]);

  // Keep the scrollback pinned to the newest message.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [log]);

  async function onRetry(botUserId: number, personaId: string) {
    try {
      const r = await fetch(`/api/games/${gameId}/ai/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ botUserId }),
      });
      if (r.ok) patch(personaId, (s) => ({ ...s, stall: null }));
      else {
        const detail = (await r.json().catch(() => ({}))).error || String(r.status);
        alert(`retry failed: ${detail}`);
      }
    } catch (e) {
      alert(`retry failed: ${(e as Error).message}`);
    }
  }

  async function onAbandon() {
    if (!confirm("End this game?")) return;
    try {
      const r = await fetch(`/api/games/${gameId}/ai/abandon`, { method: "POST" });
      if (r.ok) window.location.reload();
      else {
        const detail = (await r.json().catch(() => ({}))).error || String(r.status);
        alert(`abandon failed: ${detail}`);
      }
    } catch (e) {
      alert(`abandon failed: ${(e as Error).message}`);
    }
  }

  async function onChatSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const text = (inputRef.current?.value ?? "").trim();
    if (!text) return;
    if (inputRef.current) inputRef.current.value = "";
    setChatSubmitting(true);
    try {
      const results = await Promise.all(
        bots.map((b) =>
          fetch(`/api/games/${gameId}/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, botUserId: b.userId }),
          })
            .then((r) => r.ok)
            .catch(() => false),
        ),
      );
      if (results.some((ok) => !ok)) {
        setMyFlash("(message failed to send)");
        if (flashTimer.current) clearTimeout(flashTimer.current);
        flashTimer.current = setTimeout(() => setMyFlash(null), 4000);
      }
    } finally {
      setChatSubmitting(false);
    }
  }

  if (bots.length === 0) return null;
  const anyStalled = bots.some((b) => state[b.personaId]?.stall);

  return (
    <div className="ai-roster">
      {bots.map((b) => {
        const s = state[b.personaId] ?? EMPTY;
        return (
          <BotCard
            key={b.userId}
            personaId={b.personaId}
            friendlyName={b.friendlyName}
            color={b.color}
            glyph={b.glyph}
            bubble={s.bubble}
            stall={s.stall}
            onRetry={() => onRetry(b.userId, b.personaId)}
          />
        );
      })}

      <div className="opp-card__chatbox">
        <div className="opp-card__chat-title">💬 Trash talk</div>
        <ul className="opp-card__log" aria-label="Trash-talk log" ref={logRef}>
          {log.length === 0 ? (
            <li className="opp-card__log-empty">Say something to your opponents…</li>
          ) : (
            log.map((e) => (
              <li
                key={e.id}
                className={`opp-card__log-line opp-card__log-line--${e.kind}`}
                style={e.color ? { borderLeftColor: e.color } : undefined}
              >
                {e.author}: {e.text}
              </li>
            ))
          )}
        </ul>
        <form className="opp-card__chat" onSubmit={onChatSubmit}>
          <input
            ref={inputRef}
            type="text"
            maxLength={200}
            placeholder="Talk smack…"
            autoComplete="off"
            disabled={chatSubmitting}
            aria-label="Talk smack to your opponents"
          />
          <button type="submit" className="opp-card__chat-send" disabled={chatSubmitting}>
            Send
          </button>
        </form>
        {myFlash && <div className="opp-card__chat-status">{myFlash}</div>}
      </div>

      {anyStalled && (
        <button type="button" className="opp-card__abandon" onClick={onAbandon}>
          Abandon game
        </button>
      )}
    </div>
  );
}
