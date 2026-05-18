// plugins/risk/client/action-bar.js
// Phase-aware controls. `post(action)` sends an action to the host.
// `pending` holds in-progress UI selections shared with board.js via app.js.
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
    const sel = pending.deployTarget;
    bar.append(`Deploy ${pool} to ${sel ?? '(tap a territory you own)'} `);
    btn('Deploy all here', () => {
      if (!sel) return;
      post({ type: view.phase === 'setup' ? 'setup-deploy' : 'deploy', payload: { placements: { [sel]: pool } } });
      setPending({});
    }, !!sel);
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
