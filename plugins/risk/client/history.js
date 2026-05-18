// plugins/risk/client/history.js
export function renderHistory(root, log = []) {
  const box = document.createElement('div');
  box.className = 'log';
  box.innerHTML = log.slice(-12).map(e => {
    if (e.kind === 'attack') return `P${e.player} attacked ${e.from}→${e.to} (${e.captured ? 'captured' : 'repulsed'})`;
    if (e.kind === 'deploy' || e.kind === 'setup-deploy') return `P${e.player} deployed`;
    if (e.kind === 'fortify') return `P${e.player} fortified ${e.from}→${e.to} ×${e.count}`;
    if (e.kind === 'end-turn') return `— turn to P${e.next} —`;
    return '';
  }).filter(Boolean).map(s => `<div>${s}</div>`).join('');
  root.appendChild(box);
}
