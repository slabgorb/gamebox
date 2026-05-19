// Pegging strip — running-total totem on the left, played cards on the
// right. The running number ticks up animatedly; newly-played cards mount
// off-frame and slide in via CSS transition.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Card as CardImg } from "../shared/Card";
import type { Card, PeggingState } from "../shared/contracts/cribbage";

const PIP: Record<string, number> = {
  A: 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9,
  T: 10, J: 10, Q: 10, K: 10,
};

export function isPlayable(card: Card, peg: PeggingState): boolean {
  return peg.running + PIP[card.rank] <= 31;
}

function useTickingNumber(value: number, durationMs = 380): [number, boolean] {
  const [shown, setShown] = useState(value);
  const [ticking, setTicking] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === value) return;
    const start = prev.current;
    const delta = value - start;
    const t0 = performance.now();
    setTicking(true);
    let raf = 0;
    function step(t: number) {
      const k = Math.min(1, (t - t0) / durationMs);
      const eased = 1 - Math.pow(1 - k, 3);
      setShown(Math.round(start + delta * eased));
      if (k < 1) {
        raf = requestAnimationFrame(step);
      } else {
        prev.current = value;
        setShown(value);
        setTicking(false);
      }
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, durationMs]);

  return [shown, ticking];
}

function PeggingHistoryCard({ card, isNew }: { card: Card; isNew: boolean }) {
  const [flicking, setFlicking] = useState(isNew);
  useLayoutEffect(() => {
    if (!isNew) return;
    let id1 = 0;
    let id2 = 0;
    id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(() => setFlicking(false));
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [isNew]);
  const style: React.CSSProperties = {
    transition:
      "transform 360ms cubic-bezier(0.2, 0.8, 0.3, 1), opacity 220ms ease-out",
    transform: flicking
      ? "translate(-32px, -50px) rotate(-12deg) scale(1.05)"
      : "translate(0,0) rotate(0) scale(1)",
    opacity: flicking ? 0 : 1,
  };
  return (
    <div className="pegging__card" style={style}>
      <CardImg card={card} />
    </div>
  );
}

interface Props {
  pegging: PeggingState;
  starter?: Card | null;
}

export function Pegging({ pegging, starter }: Props) {
  const [shown, ticking] = useTickingNumber(pegging.running);

  const prevHistoryIdsRef = useRef<Array<Card["id"]>>(
    pegging.history.map((c) => c.id),
  );
  const newIds = useMemo(() => {
    const ids = pegging.history.map((c) => c.id);
    const fresh = new Set(
      ids.filter((id) => !prevHistoryIdsRef.current.includes(id)),
    );
    prevHistoryIdsRef.current = ids;
    return fresh;
  }, [pegging.history]);

  const [replayKey, setReplayKey] = useState(0);
  const prevTrickIdRef = useRef<string | null>(null);
  useEffect(() => {
    const t = pegging.lastTrick;
    const id = t ? `${t.kind}-${t.points}-${t.cards.length}` : null;
    if (id && id !== prevTrickIdRef.current) {
      prevTrickIdRef.current = id;
      setReplayKey((k) => k + 1);
    }
  }, [pegging.lastTrick]);

  return (
    <div className="pegging">
      {starter && (
        <div className="pegging__starter" aria-label="Starter card">
          <div className="pegging__starter-label">Cut</div>
          <CardImg card={starter} className="is-starter" />
        </div>
      )}
      <div className="pegging__totem">
        <div className="pegging__label">Running</div>
        <div className={`pegging__running ${ticking ? "is-tick" : ""}`}>{shown}</div>
        <div className="pegging__running-cap">of 31</div>
      </div>
      <div className="pegging__strip">
        {pegging.lastTrick && pegging.lastTrick.cards.length > 0 && (
          <div
            className={`last-trick ${replayKey ? "is-replay" : ""}`}
            key={replayKey}
          >
            <div className="last-trick__label">
              {pegging.lastTrick.kind === "31"
                ? `31 for ${pegging.lastTrick.points}`
                : `Go for ${pegging.lastTrick.points}`}
            </div>
            <div className="last-trick__cards">
              {pegging.lastTrick.cards.map((c, i) => (
                <CardImg key={c.id ?? i} card={c} className="mini" />
              ))}
            </div>
          </div>
        )}
        {pegging.history.map((c, i) => (
          <PeggingHistoryCard
            key={c.id ?? `h${i}`}
            card={c}
            isNew={newIds.has(c.id)}
          />
        ))}
      </div>
    </div>
  );
}
