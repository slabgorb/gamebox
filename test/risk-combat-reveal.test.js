import { test } from 'node:test';
import assert from 'node:assert/strict';
import { combatSignature, shouldReplay } from '../plugins/risk/client/combat-reveal.js';

const combat = { from: 'N1', to: 'N2', force: 3, captured: true, rounds: [{}, {}] };

test('signature is null when there is no combat', () => {
  assert.equal(combatSignature(null), null);
  assert.equal(combatSignature(undefined), null);
});

test('signature is stable for the same combat', () => {
  assert.equal(combatSignature(combat), combatSignature({ ...combat }));
});

test('signature changes when the combat changes', () => {
  assert.notEqual(combatSignature(combat), combatSignature({ ...combat, to: 'N3' }));
  assert.notEqual(combatSignature(combat), combatSignature({ ...combat, rounds: [{}] }));
});

test('no replay when there is no combat', () => {
  assert.deepEqual(shouldReplay(null, null), { signature: null, replay: false });
});

test('replay on a fresh transition', () => {
  const r = shouldReplay(null, combat);
  assert.equal(r.replay, true);
  assert.equal(r.signature, combatSignature(combat));
});

test('replay treats undefined prevSignature like a fresh transition (seeding path)', () => {
  const r = shouldReplay(undefined, combat);
  assert.equal(r.replay, true);
  assert.equal(r.signature, combatSignature(combat));
});

test('no replay when the signature is unchanged', () => {
  const sig = combatSignature(combat);
  assert.deepEqual(shouldReplay(sig, combat), { signature: sig, replay: false });
});

test('replay when the signature changes', () => {
  const prev = combatSignature(combat);
  const next = { ...combat, to: 'N3' };
  const r = shouldReplay(prev, next);
  assert.equal(r.replay, true);
  assert.equal(r.signature, combatSignature(next));
});
