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

export function AiRoster({ bots, gameId, userId, sseUrl }: AiRosterProps) {
  const [state, setState] = useState<Record<string, PersonaState>>({});
  const [myFlash, setMyFlash] = useState<string | null>(null);
  const hideTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const knownPersonas = useRef(new Set(bots.map((b) => b.personaId)));
  knownPersonas.current = new Set(bots.map((b) => b.personaId));

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

  useEffect(() => {
    const es = new EventSource(sseUrl);

    const onBanter = (ev: Event) => {
      const d = JSON.parse((ev as MessageEvent).data ?? "{}");
      if (!d.text || !d.personaId) return;
      patch(d.personaId, (s) => ({ ...s, bubble: { text: d.text, thinking: false } }));
      scheduleHide(d.personaId);
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
      setMyFlash(d.text);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setMyFlash(null), 4000);
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
    await Promise.all(
      bots.map((b) =>
        fetch(`/api/games/${gameId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text, botUserId: b.userId }),
        }).catch(() => {}),
      ),
    );
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

      <form className="opp-card__chat" onSubmit={onChatSubmit}>
        <input
          ref={inputRef}
          type="text"
          maxLength={200}
          placeholder="Talk smack…"
          autoComplete="off"
        />
        <button type="submit" hidden>
          Submit
        </button>
      </form>
      {myFlash && <div className="opp-card__my-bubble">{myFlash}</div>}

      {anyStalled && (
        <button type="button" className="opp-card__abandon" onClick={onAbandon}>
          Abandon game
        </button>
      )}
    </div>
  );
}
