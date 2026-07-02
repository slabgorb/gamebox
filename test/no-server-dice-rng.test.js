// CROSS-BUG-3: AC7 — greppable assertion.
//
// The architectural principle is that dice values come from the client's 3D
// physics, never from a server-side rng. The three sites that today violate
// that on the bot path are:
//   - plugins/risk/server/actions.js → resolveAttack call inside applyAttack
//   - src/server/ai/orchestrator.js  → Math.floor(rng() * 6) in pre-roll /
//                                       initial-roll auto-actions
//   - plugins/backgammon/server/ai/backgammon-player.js → rng materialization
//     of the 'roll' action's values when the LLM picks bare 'roll'
//
// This test pins all three. It MUST fail today because all three sites still
// generate dice values server-side.
//
// We pattern-match on stable code shapes — not on whole-file content — so
// passing tests survive incidental edits but a regression that re-introduces
// the same RNG site fails the suite.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

function read(rel) {
  return readFileSync(resolve(root, rel), 'utf8');
}

test('AC7: plugins/risk/server/actions.js applyAttack does not call resolveAttack on the bot-intent path', () => {
  const src = read('plugins/risk/server/actions.js');
  // resolveAttack is the rolled-path helper. After the fix it has no call
  // sites in actions.js (combat.js keeps it for tests that exercise rollDice
  // directly, but the action handler no longer drives server-side combat).
  assert.ok(
    !/resolveAttack\s*\(/.test(src),
    'applyAttack must not call resolveAttack() — bot-attack stores pendingCombat instead',
  );
});

test('AC7: src/server/ai/orchestrator.js does not materialize dice values from rng', () => {
  const src = read('src/server/ai/orchestrator.js');
  // The two autoActions sites today are `Math.floor(rng() * 6) + 1` (the
  // dice-value formula). After the fix the orchestrator's pre-roll /
  // initial-roll path no longer derives values — it signals intent and the
  // human client rolls.
  assert.ok(
    !/Math\.floor\s*\(\s*rng\s*\(\s*\)\s*\*\s*6\s*\)/.test(src),
    'orchestrator must not derive dice values via Math.floor(rng()*6) — client rolls instead',
  );
});

test('AC7: plugins/backgammon/server/ai/backgammon-player.js does not materialize dice values from rng', () => {
  const src = read('plugins/backgammon/server/ai/backgammon-player.js');
  assert.ok(
    !/Math\.floor\s*\(\s*rng\s*\(\s*\)\s*\*\s*6\s*\)/.test(src),
    'backgammon player must not derive dice values via Math.floor(rng()*6) — chooseAction returns a values-less roll intent',
  );
});

// E6-4 Task 7: the clue bot path inherits the same doctrine. The bot's roll
// is a values-less intent; the client materialises the die and POSTs the
// shipped roll{value} action. These files must exist AND stay RNG-free.
test('AC7: clue bot path materialises no dice values from rng', () => {
  for (const rel of [
    'plugins/clue/server/ai/clue-player.js',
    'plugins/clue/server/ai/shortlist.js',
  ]) {
    const src = read(rel);
    assert.ok(
      !/Math\.floor\s*\(\s*(?:rng|Math\.random)\s*\(\s*\)\s*\*\s*6\s*\)/.test(src),
      `${rel} must not derive a die value — clue bots roll a values-less intent, the client rolls`,
    );
    assert.ok(
      !/\*\s*6\s*\)\s*\+\s*1/.test(src),
      `${rel} must not carry the (…*6)+1 die formula in any disguise`,
    );
  }
});
