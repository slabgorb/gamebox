// src/clients/risk/ActionBar.tsx
// Leather action-tray wrapping the order copy and the brass action
// buttons. The button labels are load-bearing for tests — do not rename
// "Attack", "Done attacking", "End turn", or "Move all" without
// updating test/client/action-bar.test.tsx.
import type { RiskView, RiskAction } from "../shared/contracts/risk";
import { adjust, placed, remaining, isComplete, type DeployPlan } from "./deploy-plan";
import { TERRITORIES } from "./map-geometry.js";

export interface Pending {
  plan?: DeployPlan;
  deployTarget?: string;
  from?: string;
  to?: string;
}

interface Props {
  view: RiskView;
  pending: Pending;
  post: (a: RiskAction) => void | Promise<void>;
  setPending: (p: Pending) => void;
  onAttack: (from: string, to: string) => void;
}

const T = TERRITORIES as Record<string, { name: string }>;
const nameOf = (id: string | undefined): string | null =>
  (id && T[id]?.name) || id || null;

function Slot({ kind, id }: { kind: "from" | "to"; id: string | null }) {
  const empty = !id;
  return (
    <span className={`${kind}${empty ? " empty" : ""}`}>{id ?? "—"}</span>
  );
}

export function ActionBar({ view, pending, post, setPending, onAttack }: Props) {
  const yourTurn = view.youAre === view.currentPlayer;

  if (!yourTurn) {
    return (
      <div className="action-tray">
        <div className="lead">
          <span className="order">Hold</span>
          <em>Waiting for opponent…</em>
        </div>
        <div className="controls">
          <button className="brass-btn" disabled>Awaiting</button>
        </div>
      </div>
    );
  }

  if (view.phase === "setup" || view.phase === "reinforce") {
    const pool =
      view.phase === "setup"
        ? view.setupPools[view.youAre ?? 0]
        : view.reinforcePool;
    const type = view.phase === "setup" ? "setup-deploy" : "deploy";
    const plan = pending.plan ?? {};
    const sel = pending.deployTarget;
    const left = remaining(plan, pool);
    return (
      <div className="action-tray">
        <div className="lead">
          <span className="order">Deploy</span>
          {placed(plan) ? (
            <em>{`${left} of ${pool} regiments left`}</em>
          ) : (
            <em>{`Place ${pool} regiments — tap a held territory`}</em>
          )}
          {Object.entries(plan).map(([id, n]) => (
            <span className="deploy-row" key={id}>
              {`${nameOf(id) ?? id} +${n}`}
              <button
                className="step"
                onClick={() =>
                  setPending({ plan: adjust(plan, id, -1, pool), deployTarget: id })
                }
              >
                −
              </button>
              <button
                className="step"
                disabled={left <= 0}
                onClick={() =>
                  setPending({ plan: adjust(plan, id, 1, pool), deployTarget: id })
                }
              >
                +
              </button>
            </span>
          ))}
        </div>
        <div className="controls">
          <button
            className="brass-btn"
            disabled={!sel}
            onClick={() => {
              if (!sel) return;
              post({ type, payload: { placements: { [sel]: pool } } } as RiskAction);
              setPending({});
            }}
          >
            Deploy all here
          </button>
          <button
            className="brass-btn ghost"
            disabled={placed(plan) <= 0}
            onClick={() => setPending({})}
          >
            Clear
          </button>
          <button
            className="brass-btn"
            disabled={!isComplete(plan, pool)}
            onClick={() => {
              post({ type, payload: { placements: plan } } as RiskAction);
              setPending({});
            }}
          >
            Deploy ▶
          </button>
        </div>
      </div>
    );
  }

  if (view.phase === "attack") {
    const { from, to } = pending;
    return (
      <div className="action-tray">
        <div className="lead">
          <span className="order">Attack</span>
          <em>March from </em>
          <Slot kind="from" id={nameOf(from)} />
          <em> on </em>
          <Slot kind="to" id={nameOf(to)} />
        </div>
        <div className="controls">
          <button
            className="brass-btn"
            disabled={!(from && to)}
            onClick={() => from && to && onAttack(from, to)}
          >
            Attack
          </button>
          <button
            className="brass-btn ghost"
            onClick={() => post({ type: "end-attack" })}
          >
            Done attacking
          </button>
        </div>
      </div>
    );
  }

  if (view.phase === "fortify") {
    const { from, to } = pending;
    return (
      <div className="action-tray">
        <div className="lead">
          <span className="order">Fortify</span>
          <em>Move from </em>
          <Slot kind="from" id={nameOf(from)} />
          <em> to </em>
          <Slot kind="to" id={nameOf(to)} />
        </div>
        <div className="controls">
          <button
            className="brass-btn"
            disabled={!(from && to)}
            onClick={() => {
              const f = view.territories[from!];
              post({
                type: "fortify",
                payload: { from: from!, to: to!, count: f.armies - 1 },
              });
              setPending({});
            }}
          >
            Move all
          </button>
          <button
            className="brass-btn ghost"
            onClick={() => post({ type: "end-turn" })}
          >
            End turn
          </button>
        </div>
      </div>
    );
  }

  return null;
}
