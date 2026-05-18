// plugins/risk/client/error-boundary.js
// Last-resort UI when a render function throws. app.js's render() only ever
// guarded the network fetch, so an exception in any render* helper wiped the
// whole UI to a silent blank with no message and no escape (this is exactly
// what bricked the pre-rename game 50: a missing territory threw in
// renderContinentRail). This panel guarantees the player always sees what
// failed and can always get back to the Lobby.
export function renderError(root, { error } = {}) {
  root.innerHTML = '';

  const box = document.createElement('div');
  box.className = 'render-error';
  box.setAttribute('role', 'alert');

  const msg = document.createElement('p');
  msg.className = 'render-error__msg';
  msg.textContent = 'Something went wrong displaying this game.';
  box.appendChild(msg);

  const detail = document.createElement('p');
  detail.className = 'render-error__detail';
  detail.textContent = error ? String(error.message || error) : '';
  box.appendChild(detail);

  const actions = document.createElement('div');
  actions.className = 'render-error__actions';

  const lobby = document.createElement('a');
  lobby.className = 'lobby-link';
  lobby.href = '/';
  lobby.textContent = 'Back to Lobby';
  actions.appendChild(lobby);

  const reload = document.createElement('button');
  reload.type = 'button';
  reload.className = 'resign-btn';
  reload.textContent = 'Reload';
  reload.addEventListener('click', () => { try { location.reload(); } catch { /* test env */ } });
  actions.appendChild(reload);

  box.appendChild(actions);
  root.appendChild(box);
  return { lobby, reload };
}
