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

export function OpponentBanter({ gameId: _gameId, userId: _userId, sseUrl, friendlyName }: Props) {
  const [bubble, setBubble] = useState<BubbleState | null>(null);
  const queueRef = useRef<string[]>([]);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      // 5s display, then fade for 400ms before unmount.
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
      // banter clears any in-flight thinking state
      setBubble((b) => (b?.thinking ? null : b));
      if (!hideTimerRef.current) showNext();
    };

    const onThinking = (ev: Event) => {
      const data = JSON.parse((ev as MessageEvent).data ?? "{}");
      const name = data.displayName ?? friendlyName;
      setBubble({ text: `${name} is thinking`, thinking: true });
      clearHideTimer();
    };

    const onUpdate = () => {
      setBubble((b) => (b?.thinking ? null : b));
    };

    es.addEventListener("banter", onBanter);
    es.addEventListener("bot_thinking", onThinking);
    es.addEventListener("update", onUpdate);

    return () => {
      es.removeEventListener("banter", onBanter);
      es.removeEventListener("bot_thinking", onThinking);
      es.removeEventListener("update", onUpdate);
      es.close();
      clearHideTimer();
    };
  }, [sseUrl, friendlyName]);

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
    </>
  );
}
