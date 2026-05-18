// plugins/risk/client/leave-button.js
// Two distinct mid-game exits:
//   - Lobby:  a plain link to '/'. Non-destructive — the game stays alive
//             and resumable (Gamebox is async 2-player). No confirm.
//   - Resign: forfeits the game. Destructive, so the caller (app.js) owns
//             the confirm prompt and the POST; this stays a pure factory.
export function renderExitControls(parent, { onResign }) {
  const wrap = document.createElement('span');
  wrap.className = 'exit-controls';

  const lobby = document.createElement('a');
  lobby.className = 'lobby-link';
  lobby.href = '/';
  lobby.textContent = 'Lobby';
  wrap.appendChild(lobby);

  const resign = document.createElement('button');
  resign.className = 'resign-btn';
  resign.type = 'button';
  resign.textContent = 'Resign';
  resign.addEventListener('click', onResign);
  wrap.appendChild(resign);

  parent.appendChild(wrap);
  return { lobby, resign };
}
