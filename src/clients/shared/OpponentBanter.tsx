// src/clients/shared/OpponentBanter.tsx
import { useEffect, useRef, useState } from "react";

interface Props {
  gameId: number;
  userId: number;
  sseUrl: string;
  friendlyName: string;
}

interface BubbleState {
  text: string;
  thinking: boolean;
}

interface StallState {
  reason: string;
  displayName: string;
}

export function OpponentBanter({ gameId, userId, sseUrl, friendlyName }: Props) {
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const [stall, setStall] = useState<StallState | null>(null);
  const [chatSubmitting, setChatSubmitting] = useState(false);
  const [myFlash, setMyFlash] = useState<string | null>(null);
  const queueRef = useRef<string[]>([]);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myFlashTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function clearHideTimer() {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }

  function showNext() {
    const next = queueRef.current.shift();
    if (!next) return;
    setBubble({ text: next, thinking: false });
    clearHideTimer();
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = setTimeout(() => {
        setBubble(null);
        hideTimerRef.current = null;
        showNext();
      }, 400);
    }, 5000);
  }

  useEffect(() => {
    const es = new EventSource(sseUrl);

    const onBanter = (ev: Event) => {
      const data = JSON.parse((ev as MessageEvent).data ?? "{}");
      if (!data.text) return;
      queueRef.current.push(data.text);
      setBubble((b) => (b?.thinking ? null : b));
      if (!hideTimerRef.current) showNext();
    };
    const onThinking = (ev: Event) => {
      const data = JSON.parse((ev as MessageEvent).data ?? "{}");
      setStall(null);
      setBubble({ text: `${data.displayName ?? friendlyName} is thinking`, thinking: true });
      clearHideTimer();
    };
    const onStalled = (ev: Event) => {
      const data = JSON.parse((ev as MessageEvent).data ?? "{}");
      setStall({ reason: data.reason ?? "unknown", displayName: data.displayName ?? friendlyName });
      setBubble((b) => (b?.thinking ? null : b));
    };
    const onUpdate = () => {
      setBubble((b) => (b?.thinking ? null : b));
    };
    const onUserChat = (ev: Event) => {
      const data = JSON.parse((ev as MessageEvent).data ?? "{}");
      if (data.userId !== userId) return;
      if (!data.text) return;
      setMyFlash(data.text);
      if (myFlashTimerRef.current) clearTimeout(myFlashTimerRef.current);
      myFlashTimerRef.current = setTimeout(() => {
        setMyFlash(null);
        myFlashTimerRef.current = null;
      }, 4000);
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
      clearHideTimer();
      if (myFlashTimerRef.current) clearTimeout(myFlashTimerRef.current);
    };
  }, [sseUrl, friendlyName, userId]);

  async function onRetry() {
    try {
      const r = await fetch(`/api/games/${gameId}/ai/retry`, { method: "POST" });
      if (r.ok) {
        setStall(null);
      } else {
        const detail =
          (await r.json().catch(() => ({}))).error || String(r.status);
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
      if (r.ok) {
        setStall(null);
        window.location.reload();
      } else {
        const detail =
          (await r.json().catch(() => ({}))).error || String(r.status);
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
      const r = await fetch(`/api/games/${gameId}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!r.ok) {
        const detail =
          (await r.json().catch(() => ({}))).error || String(r.status);
        setMyFlash(`(failed: ${detail})`);
        if (myFlashTimerRef.current) clearTimeout(myFlashTimerRef.current);
        myFlashTimerRef.current = setTimeout(() => setMyFlash(null), 4000);
      }
    } finally {
      setChatSubmitting(false);
    }
  }

  return (
    <>
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
          <span>{stall.displayName} froze up ({stall.reason}).</span>
          <div className="opp-card__stall-actions">
            <button type="button" className="opp-card__retry" onClick={onRetry}>
              Retry
            </button>
            <button type="button" className="opp-card__abandon" onClick={onAbandon}>
              Abandon
            </button>
          </div>
        </div>
      )}
      <form className="opp-card__chat" onSubmit={onChatSubmit}>
        <input
          ref={inputRef}
          type="text"
          maxLength={200}
          placeholder="Talk smack…"
          autoComplete="off"
          disabled={chatSubmitting}
        />
        <button type="submit" hidden>
          Submit
        </button>
      </form>
      {myFlash && <div className="opp-card__my-bubble">{myFlash}</div>}
    </>
  );
}
