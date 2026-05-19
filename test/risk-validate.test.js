import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeploy, validateAttack, validateFortify } from '../plugins/risk/server/validate.js';

// alaska is adjacent to nwt & alberta but NOT indonesia.
const base = () => ({
  currentPlayer: 0,
  territories: {
    alaska: { owner: 0, armies: 5 }, nwt: { owner: 0, armies: 1 },
    alberta: { owner: 1, armies: 3 }, indonesia: { owner: 1, armies: 2 },
  },
});

test('validateDeploy: pool must be spent exactly on owned territories', () => {
  assert.equal(validateDeploy(base(), 0, { alaska: 2, nwt: 1 }, 3), null);
  assert.match(validateDeploy(base(), 0, { alaska: 2 }, 3), /pool/);
  assert.match(validateDeploy(base(), 0, { alberta: 3 }, 3), /not owned/);
  assert.match(validateDeploy(base(), 0, { alaska: -1, nwt: 4 }, 3), /negative/);
});

test('validateAttack: source owned, target adjacent enemy, force in range', () => {
  assert.equal(validateAttack(base(), 0, { from: 'alaska', to: 'alberta', force: 4 }), null);
  assert.match(validateAttack(base(), 0, { from: 'alberta', to: 'alaska', force: 1 }), /not owned/);
  assert.match(validateAttack(base(), 0, { from: 'alaska', to: 'indonesia', force: 2 }), /not adjacent/);
  assert.match(validateAttack(base(), 0, { from: 'alaska', to: 'nwt', force: 1 }), /enemy/);
  assert.match(validateAttack(base(), 0, { from: 'alaska', to: 'alberta', force: 5 }), /force/);
  assert.match(validateAttack(base(), 0, { from: 'alaska', to: 'alberta', force: 0 }), /force/);
});

test('validateFortify: both owned, adjacent, leave >=1 behind', () => {
  assert.equal(validateFortify(base(), 0, { from: 'alaska', to: 'nwt', count: 4 }), null);
  assert.match(validateFortify(base(), 0, { from: 'alaska', to: 'alberta', count: 1 }), /owned/);
  assert.match(validateFortify(base(), 0, { from: 'alaska', to: 'indonesia', count: 1 }), /adjacent/);
  assert.match(validateFortify(base(), 0, { from: 'alaska', to: 'nwt', count: 5 }), /leave/);
});
