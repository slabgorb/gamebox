// plugins/risk/client/board.js
import { sideClass } from './themes.js';

// Renders the four continents as labelled groups of tappable territory chips.
// `onPick(id)` is called when a territory is tapped; `selected` highlights one.
export function renderBoard(root, view, { onPick, selected }) {
  const CONT = {
    Norland: ['N1', 'N2', 'N3'],
    Ostmark: ['E1', 'E2', 'E3', 'E4'],
    Sudreach: ['S1', 'S2', 'S3'],
    Westfen: ['W1', 'W2', 'W3'],
  };
  const wrap = document.createElement('div');
  for (const [name, ids] of Object.entries(CONT)) {
    const sec = document.createElement('div');
    sec.className = 'continent';
    sec.innerHTML = `<h3>${name}</h3>`;
    for (const id of ids) {
      const t = view.territories[id];
      const el = document.createElement('button');
      el.className = `terr ${sideClass(t.owner)}${selected === id ? ' sel' : ''}`;
      el.textContent = `${id} · ${t.armies}`;
      el.addEventListener('click', () => onPick(id));
      sec.appendChild(el);
    }
    wrap.appendChild(sec);
  }
  root.appendChild(wrap);
}
