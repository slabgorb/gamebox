// src/clients/risk/ActionBar.tsx
import type { RiskView, RiskAction } from "../shared/contracts/risk";
import { adjust, placed, remaining, isComplete, type DeployPlan } from "./deploy-plan";

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

export function ActionBar({ view, pending, post, setPending, onAttack }: Props) {
  const yourTurn = view.youAre === view.currentPlayer;

  if (!yourTurn) return <div className="bar">Waiting for opponent…</div>;

  if (view.phase === "setup" || view.phase === "reinforce") {
    const pool =
      view.phase === "setup"
        ? view.setupPools[view.youAre as 0 | 1]
        : view.reinforcePool;
    const type = view.phase === "setup" ? "setup-deploy" : "deploy";
    const plan = pending.plan ?? {};
    const sel = pending.deployTarget;
    const left = remaining(plan, pool);
    return (
      <div className="bar">
        {placed(plan)
          ? `Deploy: ${left} left `
          : `Deploy ${pool} — tap territories you own `}
        {Object.entries(plan).map(([id, n]) => (
          <span className="deploy-row" key={id}>
            {`${id} +${n}`}
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
        <button
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
          disabled={placed(plan) <= 0}
          onClick={() => setPending({})}
        >
          Clear
        </button>
        <button
          disabled={!isComplete(plan, pool)}
          onClick={() => {
            post({ type, payload: { placements: plan } } as RiskAction);
            setPending({});
          }}
        >
          Deploy ▶
        </button>
      </div>
    );
  }

  if (view.phase === "attack") {
    const { from, to } = pending;
    return (
      <div className="bar">
        {`Attack: ${from ?? "?"} → ${to ?? "?"} `}
        <button
          disabled={!(from && to)}
          onClick={() => from && to && onAttack(from, to)}
        >
          Attack
        </button>
        <button onClick={() => post({ type: "end-attack" })}>
          Done attacking
        </button>
      </div>
    );
  }

  if (view.phase === "fortify") {
    const { from, to } = pending;
    return (
      <div className="bar">
        {`Fortify: ${from ?? "?"} → ${to ?? "?"} `}
        <button
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
        <button onClick={() => post({ type: "end-turn" })}>End turn</button>
      </div>
    );
  }
  return null;
}
