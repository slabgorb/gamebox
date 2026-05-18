import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateDeploy, validateAttack, validateFortify } from '../plugins/risk/server/validate.js';

// northern_reach is adjacent to cordillera & atlantic_shore but NOT persia.
const base = () => ({
  currentPlayer: 0,
  territories: {
    northern_reach: { owner: 0, armies: 5 }, cordillera: { owner: 0, armies: 1 },
    atlantic_shore: { owner: 1, armies: 3 }, persia: { owner: 1, armies: 2 },
  },
});

test('validateDeploy: pool must be spent exactly on owned territories', () => {
  assert.equal(validateDeploy(base(), 0, { northern_reach: 2, cordillera: 1 }, 3), null);
  assert.match(validateDeploy(base(), 0, { northern_reach: 2 }, 3), /pool/);
  assert.match(validateDeploy(base(), 0, { atlantic_shore: 3 }, 3), /not owned/);
  assert.match(validateDeploy(base(), 0, { northern_reach: -1, cordillera: 4 }, 3), /negative/);
});

test('validateAttack: source owned, target adjacent enemy, force in range', () => {
  assert.equal(validateAttack(base(), 0, { from: 'northern_reach', to: 'atlantic_shore', force: 4 }), null);
  assert.match(validateAttack(base(), 0, { from: 'atlantic_shore', to: 'northern_reach', force: 1 }), /not owned/);
  assert.match(validateAttack(base(), 0, { from: 'northern_reach', to: 'persia', force: 2 }), /not adjacent/);
  assert.match(validateAttack(base(), 0, { from: 'northern_reach', to: 'cordillera', force: 1 }), /enemy/);
  assert.match(validateAttack(base(), 0, { from: 'northern_reach', to: 'atlantic_shore', force: 5 }), /force/);
  assert.match(validateAttack(base(), 0, { from: 'northern_reach', to: 'atlantic_shore', force: 0 }), /force/);
});

test('validateFortify: both owned, adjacent, leave >=1 behind', () => {
  assert.equal(validateFortify(base(), 0, { from: 'northern_reach', to: 'cordillera', count: 4 }), null);
  assert.match(validateFortify(base(), 0, { from: 'northern_reach', to: 'atlantic_shore', count: 1 }), /owned/);
  assert.match(validateFortify(base(), 0, { from: 'northern_reach', to: 'persia', count: 1 }), /adjacent/);
  assert.match(validateFortify(base(), 0, { from: 'northern_reach', to: 'cordillera', count: 5 }), /leave/);
});
