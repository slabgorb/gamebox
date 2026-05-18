// Risk leave/exit UI: a persistent mid-game "Leave game" button and a
// "Back to lobby" link on the game-over screen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

function withDom(fn) {
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  const prev = global.document;
  global.document = dom.window.document;
  try { return fn(dom.window.document); }
  finally { if (prev === undefined) delete global.document; else global.document = prev; }
}

test('renderExitControls renders a Lobby link and a separate Resign button', async () => {
  const { renderExitControls } = await import('../plugins/risk/client/leave-button.js');
  withDom((doc) => {
    const parent = doc.createElement('div');
    let resigned = 0;
    renderExitControls(parent, { onResign: () => { resigned++; } });

    // Lobby: a plain navigation link to '/', non-destructive (no resign).
    const lobby = parent.querySelector('a');
    assert.ok(lobby, 'a lobby link is rendered');
    assert.equal(lobby.getAttribute('href'), '/');
    assert.match(lobby.textContent, /lobby/i);

    // Resign: a distinct button that forfeits via the onResign callback.
    const btn = parent.querySelector('button');
    assert.ok(btn, 'a resign button is rendered');
    assert.match(btn.textContent, /resign/i);
    assert.ok(lobby !== btn, 'lobby and resign are different controls');

    btn.dispatchEvent(new (global.document.defaultView.MouseEvent)('click'));
    assert.equal(resigned, 1, 'clicking Resign calls onResign');

    // Clicking the lobby link must NOT trigger a resign.
    lobby.dispatchEvent(new (global.document.defaultView.MouseEvent)('click'));
    assert.equal(resigned, 1, 'navigating to lobby does not resign');
  });
});

test('end screen shows the result and a Back-to-lobby link to /', async () => {
  const { renderEnd } = await import('../plugins/risk/client/end-screen.js');
  withDom((doc) => {
    const root = doc.createElement('div');
    renderEnd(root, { winner: 1, youAre: 0 });
    assert.match(root.textContent, /defeat/i, 'loser sees Defeat');
    const link = root.querySelector('a');
    assert.ok(link, 'a back-to-lobby link exists');
    assert.equal(link.getAttribute('href'), '/');
    assert.match(link.textContent, /lobby|back/i);
  });
});
