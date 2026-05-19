import type { RiskView } from "../shared/contracts/risk";
import { SIDE_LABEL } from "./themes";

export function EndScreen({ view }: { view: RiskView }) {
  const won = view.winner === view.youAre;
  return (
    <div className="end">
      <h1>{won ? "Victory" : "Defeat"}</h1>
      <p>{SIDE_LABEL[String(view.winner)]} controls the world.</p>
      <a className="end-lobby" href="/">
        Back to lobby
      </a>
    </div>
  );
}
