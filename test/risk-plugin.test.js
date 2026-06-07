import { test } from 'node:test';
import assert from 'node:assert/strict';
import riskPlugin from '../plugins/risk/plugin.js';
import { validatePlugin } from '../src/server/plugins.js';

function rngFrom(seq) { let i = 0; return () => seq[i++ % seq.length]; }

test('plugin manifest passes validator', () => {
  assert.doesNotThrow(() => validatePlugin(riskPlugin));
});

test('manifest fields', () => {
  assert.equal(riskPlugin.id, 'risk');
  assert.equal(riskPlugin.displayName, 'Risk');
  assert.deepEqual(riskPlugin.players, { min: 2, max: 4 });
  assert.match(riskPlugin.clientDir, /plugins\/risk\/client/);
  assert.equal(typeof riskPlugin.legalActions, 'function');
});

test('initialState + publicView + applyAction wired through manifest', () => {
  const s = riskPlugin.initialState({
    participants: [{ userId: 1, side: 'a' }, { userId: 2, side: 'b' }],
    rng: rngFrom([0.5, 0.2, 0.8, 0.1, 0.9, 0.3, 0.7, 0.4, 0.6, 0.0, 0.15, 0.45]),
  });
  assert.equal(s.phase, 'setup');
  assert.equal(riskPlugin.publicView({ state: s, viewerId: 1 }).youAre, 0);
});

test('plugin appears in host registry', async () => {
  const { plugins } = await import('../src/plugins/index.js');
  assert.equal(plugins.risk, riskPlugin);
});
