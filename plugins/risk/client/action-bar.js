// plugins/risk/client/action-bar.js
// Phase-aware controls. `post(action)` sends an action to the host.
// `pending` holds in-progress UI selections shared with board.js via app.js.
import { adjust, placed, remaining, isComplete } from './deploy-plan.js';

export function renderActionBar(root, view, ctx) {
  const { post, pending, setPending } = ctx;
  const bar = document.createElement('div');
  bar.className = 'bar';
  const yourTurn = view.youAre === view.currentPlayer;

  function btn(label, fn, enabled = true) {
    const b = document.createElement('button');
    b.textContent = label;
    b.disabled = !enabled || !yourTurn;
    b.addEventListener('click', fn);
    bar.appendChild(b);
  }

  if (!yourTurn) {
    bar.textContent = 'Waiting for opponent…';
  } else if (view.phase === 'setup' || view.phase === 'reinforce') {
    const pool = view.phase === 'setup' ? view.setupPools[view.youAre] : view.reinforcePool;
    const type = view.phase === 'setup' ? 'setup-deploy' : 'deploy';
    const plan = pending.plan ?? {};
    const sel = pending.deployTarget;
    const left = remaining(plan, pool);

    bar.append(placed(plan)
      ? `Deploy: ${left} left `
      : `Deploy ${pool} — tap territories you own `);

    // One row per territory you've allocated to, with steppers to fine-tune.
    for (const [id, n] of Object.entries(plan)) {
      const row = document.createElement('span');
      row.className = 'deploy-row';
      row.append(`${id} +${n}`);
      const step = (label, delta, enabled) => {
        const b = document.createElement('button');
        b.className = 'step';
        b.textContent = label;
        b.disabled = !enabled || !yourTurn;
        b.addEventListener('click', () => setPending({ plan: adjust(plan, id, delta, pool), deployTarget: id }));
        row.appendChild(b);
      };
      step('−', -1, true);
      step('+', 1, left > 0);
      bar.appendChild(row);
    }

    btn('Deploy all here', () => {
      if (!sel) return;
      post({ type, payload: { placements: { [sel]: pool } } });
      setPending({});
    }, !!sel);
    btn('Clear', () => setPending({}), placed(plan) > 0);
    btn('Deploy ▶', () => {
      post({ type, payload: { placements: plan } });
      setPending({});
    }, isComplete(plan, pool));
  } else if (view.phase === 'attack') {
    const { from, to } = pending;
    bar.append(`Attack: ${from ?? '?'} → ${to ?? '?'} `);
    btn('Attack', () => {
      const f = view.territories[from];
      post({ type: 'attack', payload: { from, to, force: f.armies - 1 } });
      setPending({});
    }, from && to);
    btn('Done attacking', () => post({ type: 'end-attack' }));
  } else if (view.phase === 'fortify') {
    const { from, to } = pending;
    bar.append(`Fortify: ${from ?? '?'} → ${to ?? '?'} `);
    btn('Move all', () => {
      const f = view.territories[from];
      post({ type: 'fortify', payload: { from, to, count: f.armies - 1 } });
      setPending({});
    }, from && to);
    btn('End turn', () => post({ type: 'end-turn' }));
  }
  root.appendChild(bar);
}
