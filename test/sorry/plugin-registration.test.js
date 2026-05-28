import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plugins } from '../../src/plugins/index.js';

test('sorry plugin is registered with the expected shape', () => {
  const p = plugins.sorry;
  assert.ok(p, 'plugins.sorry should be defined');
  assert.equal(p.id, 'sorry');
  assert.equal(p.displayName, 'Sorry!');
  assert.equal(p.players, 2);
  assert.equal(typeof p.initialState, 'function');
  assert.equal(typeof p.applyAction, 'function');
  assert.equal(typeof p.publicView, 'function');
});

test('sorry plugin declares a client directory', () => {
  // Mirrors backgammon's contract; the client UI itself ships in E3-6 but the
  // registration contract must point at the directory now.
  assert.equal(plugins.sorry.clientDir, 'plugins/sorry/client');
});
