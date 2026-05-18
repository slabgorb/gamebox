// plugins/risk/client/leave-button.js
// Persistent mid-game escape hatch. Pure DOM factory — the caller owns the
// confirm prompt and the POST (see app.js), so this stays unit-testable
// without touching window.confirm / fetch.
export function renderLeaveButton(parent, { onLeave }) {
  const btn = document.createElement('button');
  btn.className = 'leave-btn';
  btn.type = 'button';
  btn.textContent = 'Leave game';
  btn.addEventListener('click', onLeave);
  parent.appendChild(btn);
  return btn;
}
