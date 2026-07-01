// src/clients/risk/ContinentRail.tsx
// Six parchment plaques across the top of the board — one per continent.
// Each plaque shows the continent name, +bonus, and a pip roster of who
// owns each of its territories. A muted brass band runs down the left
// edge when you hold the continent; muted navy when the opponent does.
import type { RiskView } from "../shared/contracts/risk";
import { CONTINENTS_META, TERRITORIES } from "./map-geometry.js";
import { seatClass } from "./themes";

type TerritoryGeom = { continent: string };
type ContinentMeta = { name: string; bonus: number; color: string };

const T = TERRITORIES as Record<string, TerritoryGeom>;
const C = CONTINENTS_META as Record<string, ContinentMeta>;

export function ContinentRail({ view }: { view: RiskView }) {
  return (
    <div className="continent-rail">
      {Object.entries(C).map(([key, meta]) => {
        const ids = Object.entries(T)
          .filter(([, g]) => g.continent === key)
          .map(([id]) => id);
        const owners = ids.map((id) => view.territories[id]?.owner ?? null);
        const allMine = ids.length > 0 && owners.every((o) => o === view.youAre);
        const allTheirs =
          ids.length > 0 && owners.every((o) => o != null && o !== view.youAre);
        const heldClass = allMine ? " held mine" : allTheirs ? " held theirs" : "";
        return (
          <div key={key} className={`cont-plaque${heldClass}`}>
            <span className="name">{meta.name}</span>
            <span className="bonus">+{meta.bonus}</span>
            <div className="roster" aria-hidden="true">
              {ids.map((id) => {
                const o = view.territories[id]?.owner ?? null;
                const cls = seatClass(o, view.colors);
                return <span key={id} className={cls ? `pip ${cls}` : "pip"} title={id} />;
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
