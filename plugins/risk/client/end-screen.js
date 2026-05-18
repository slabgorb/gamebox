// plugins/risk/client/end-screen.js
import { SIDE_LABEL } from './themes.js';
export function renderEnd(root, view) {
  const won = view.winner === view.youAre;
  const el = document.createElement('div');
  el.className = 'end';
  el.innerHTML = `<h1>${won ? 'Victory' : 'Defeat'}</h1><p>${SIDE_LABEL[view.winner]} controls the world.</p>`;
  root.appendChild(el);
}
