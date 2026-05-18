import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeploy, validateAttack, validateFortify } from '../plugins/risk/server/validate.js';

const base = () => ({
  currentPlayer: 0,
  territories: {
    N1: { owner: 0, armies: 5 }, N2: { owner: 0, armies: 1 },
    N3: { owner: 1, armies: 3 }, E1: { owner: 1, armies: 2 },
  },
});

test('validateDeploy: pool must be spent exactly on owned territories', () => {
  assert.equal(validateDeploy(base(), 0, { N1: 2, N2: 1 }, 3), null);
  assert.match(validateDeploy(base(), 0, { N1: 2 }, 3), /pool/);
  assert.match(validateDeploy(base(), 0, { N3: 3 }, 3), /not owned/);
  assert.match(validateDeploy(base(), 0, { N1: -1, N2: 4 }, 3), /negative/);
});

test('validateAttack: source owned, target adjacent enemy, force in range', () => {
  assert.equal(validateAttack(base(), 0, { from: 'N1', to: 'N3', force: 4 }), null);
  assert.match(validateAttack(base(), 0, { from: 'N3', to: 'N1', force: 1 }), /not owned/);
  assert.match(validateAttack(base(), 0, { from: 'N1', to: 'E1', force: 2 }), /not adjacent/);
  assert.match(validateAttack(base(), 0, { from: 'N1', to: 'N2', force: 1 }), /enemy/);
  assert.match(validateAttack(base(), 0, { from: 'N1', to: 'N3', force: 5 }), /force/);
  assert.match(validateAttack(base(), 0, { from: 'N1', to: 'N3', force: 0 }), /force/);
});

test('validateFortify: both owned, adjacent, leave >=1 behind', () => {
  assert.equal(validateFortify(base(), 0, { from: 'N1', to: 'N2', count: 4 }), null);
  assert.match(validateFortify(base(), 0, { from: 'N1', to: 'N3', count: 1 }), /owned/);
  assert.match(validateFortify(base(), 0, { from: 'N1', to: 'E1', count: 1 }), /adjacent/);
  assert.match(validateFortify(base(), 0, { from: 'N1', to: 'N2', count: 5 }), /leave/);
});
