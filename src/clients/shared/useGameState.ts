// src/clients/shared/useGameState.ts
import { useCallback, useEffect, useRef, useState } from "react";

export interface GameCtx {
  gameId: number;
  userId: number;
  gameType: string;
  sseUrl: string;
  actionUrl: string;
  stateUrl: string;
  yourFriendlyName?: string;
  yourGlyph?: string | null;
  yourColor?: string | null;
  opponentFriendlyName?: string;
  opponentGlyph?: string | null;
  opponentColor?: string | null;
  opponentPersonaId?: string | null;
}

declare global {
  interface Window {
    __GAME__: GameCtx;
  }
}

export type GameStatus = "connecting" | "live" | "reconnecting" | "ended";

export interface UseGameState<TView, TAction> {
  view: TView | null;
  status: GameStatus;
  actionError: string | null;
  post: (action: TAction) => Promise<void>;
  ctx: GameCtx;
}

export function useGameState<TView = unknown, TAction = unknown>(): UseGameState<
  TView,
  TAction
> {
  const ctx = window.__GAME__;
  const [view, setView] = useState<TView | null>(null);
  const [status, setStatus] = useState<GameStatus>("connecting");
  const [actionError, setActionError] = useState<string | null>(null);
  const endedRef = useRef(false);

  const fetchView = useCallback(async (): Promise<TView> => {
    const res = await fetch(ctx.stateUrl);
    if (!res.ok) throw new Error(`state ${res.status}`);
    const data = await res.json();
    return (data?.state ?? data) as TView;
  }, [ctx.stateUrl]);

  const resync = useCallback(async () => {
    try {
      const v = await fetchView();
      setActionError(null);
      setView(v);
      setStatus(endedRef.current ? "ended" : "live");
    } catch {
      setStatus("reconnecting");
    }
  }, [fetchView]);

  const post = useCallback(
    async (action: TAction) => {
      setActionError(null);
      const res = await fetch(ctx.actionUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(action),
      });
      if (!res.ok) {
        const msg = `action failed (${res.status})`;
        setActionError(msg);
        throw new Error(msg);
      }
      await resync();
    },
    [ctx.actionUrl, resync],
  );

  useEffect(() => {
    let es: EventSource | null = null;
    let everConnected = false;
    resync();
    es = new EventSource(ctx.sseUrl);
    es.addEventListener("update", () => resync());
    es.addEventListener("ended", () => {
      endedRef.current = true;
      resync();
    });
    es.addEventListener("error", () => setStatus("reconnecting"));
    es.addEventListener("open", () => {
      if (everConnected) resync();
      everConnected = true;
    });
    return () => es?.close();
  }, [ctx.sseUrl, resync]);

  return { view, status, actionError, post, ctx };
}
