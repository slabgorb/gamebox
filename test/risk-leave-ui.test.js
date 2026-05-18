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

test('renderLeaveButton adds a labelled button and invokes onLeave on click', async () => {
  const { renderLeaveButton } = await import('../plugins/risk/client/leave-button.js');
  withDom((doc) => {
    const parent = doc.createElement('div');
    let called = 0;
    renderLeaveButton(parent, { onLeave: () => { called++; } });
    const btn = parent.querySelector('button');
    assert.ok(btn, 'a button is rendered');
    assert.match(btn.textContent, /leave/i);
    btn.dispatchEvent(new (global.document.defaultView.MouseEvent)('click'));
    assert.equal(called, 1, 'clicking the button calls onLeave');
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
