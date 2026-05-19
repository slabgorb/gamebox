// src/clients/risk/Board.tsx
import { useEffect, useRef } from "react";
import type { RiskView } from "../shared/contracts/risk";
import { buildBoardHTML, type BoardOpts } from "./board-svg";

interface Props extends BoardOpts {
  view: RiskView;
  onPick: (id: string) => void;
}

export function Board({
  view,
  onPick,
  selected,
  plan = {},
  to = null,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const html = buildBoardHTML(view, { selected, plan, to });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const handler = (e: Event) => {
      const t = (e.target as Element)?.closest("[data-pick]");
      if (t) onPick(t.getAttribute("data-pick")!);
    };
    el.addEventListener("click", handler);
    return () => el.removeEventListener("click", handler);
  }, [onPick, html]);

  return (
    <div
      className="map-frame"
      ref={ref}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
