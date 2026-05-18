// Last-resort error boundary: when a render function throws, the player must
// never be left staring at a blank screen — they get a clear message and a
// guaranteed Lobby escape (the bug that bricked the old-id game 50).
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

test('renderError replaces blank/stale content with a message and a Lobby escape', async () => {
  const { renderError } = await import('../plugins/risk/client/error-boundary.js');
  withDom((doc) => {
    const root = doc.createElement('div');
    // Simulate the half-rendered DOM left behind when a render throws.
    root.appendChild(doc.createElement('span'));
    root.innerHTML += '<svg class="risk-map"></svg>';

    const { lobby } = renderError(root, { error: new Error('Cannot read properties of undefined') });

    // Stale broken markup is gone.
    assert.equal(root.querySelector('.risk-map'), null, 'stale board cleared');
    // A visible alert with a human message.
    const alert = root.querySelector('[role="alert"]');
    assert.ok(alert, 'an alert region is rendered');
    assert.match(root.textContent, /went wrong/i, 'human-readable message shown');
    // The underlying error is surfaced, not swallowed.
    assert.match(root.textContent, /Cannot read properties of undefined/, 'error detail shown');
    // A guaranteed escape: a Lobby link to '/'.
    assert.ok(lobby, 'returns the lobby node');
    assert.equal(lobby.getAttribute('href'), '/');
    assert.match(lobby.textContent, /lobby/i);
    assert.equal(root.querySelectorAll('a[href="/"]').length, 1, 'exactly one lobby link');
  });
});

test('renderError works with no error argument (still shows escape)', async () => {
  const { renderError } = await import('../plugins/risk/client/error-boundary.js');
  withDom((doc) => {
    const root = doc.createElement('div');
    renderError(root);
    assert.ok(root.querySelector('[role="alert"]'), 'alert still rendered');
    assert.ok(root.querySelector('a[href="/"]'), 'lobby escape still present');
  });
});
