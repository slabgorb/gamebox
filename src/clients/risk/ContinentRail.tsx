import type { RiskView } from "../shared/contracts/risk";
import { CONTINENT_BONUS, CONTINENTS_META, TERRITORIES } from "./map-geometry.js";

export function ContinentRail({ view }: { view: RiskView }) {
  return (
    <div className="continent-rail">
      {Object.entries(CONTINENT_BONUS as Record<string, number>).map(
        ([key, bonus]) => {
          const ids = Object.keys(TERRITORIES).filter(
            (t: string) => (TERRITORIES as any)[t].continent === key,
          );
          const held = ids.every(
            (t) => view.territories[t]?.owner === view.youAre,
          );
          const name = (CONTINENTS_META as any)[key]?.name ?? key;
          return (
            <span key={key} className={`cont-chip${held ? " held" : ""}`}>
              {name} +{bonus}
            </span>
          );
        },
      )}
    </div>
  );
}
