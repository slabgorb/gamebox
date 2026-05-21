import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildPilotMeta } from '../scripts/risk-pilot-meta.mjs';

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'pilot-meta-'));
  try { return fn(dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

function makeGameLine({ game, personaA, personaB, turns }) {
  const transcript = [];
  for (let i = 0; i < turns; i++) {
    transcript.push({ turn: i, side: i % 2 === 0 ? 'a' : 'b', phase: 'attack',
      chosenMoveId: 'end-attack', shortlist: [], banter: '', stateBefore: {}, action: { type: 'end-attack' } });
  }
  return JSON.stringify({
    game, personaA, personaB, turnCount: turns,
    transcript,
    winner: 'a', endReason: 'win', durationMs: 1000,
  });
}

const FAKE_PERSONAS = {
  'admiral-vonnegut': { id: 'admiral-vonnegut', systemPrompt: 'you are admiral vonnegut' },
  'colonel-jaune':    { id: 'colonel-jaune',    systemPrompt: 'you are colonel jaune' },
  'major-robert':     { id: 'major-robert',     systemPrompt: 'you are major robert' },
};

test('buildPilotMeta: counts games and turns across pairing files', () => {
  withTmpDir(dir => {
    writeFileSync(join(dir, 'admiral-vonnegut-admiral-vonnegut.jsonl'),
      makeGameLine({ game: 0, personaA: 'admiral-vonnegut', personaB: 'admiral-vonnegut', turns: 30 }) + '\n' +
      makeGameLine({ game: 1, personaA: 'admiral-vonnegut', personaB: 'admiral-vonnegut', turns: 40 }) + '\n');
    writeFileSync(join(dir, 'admiral-vonnegut-colonel-jaune.jsonl'),
      makeGameLine({ game: 0, personaA: 'admiral-vonnegut', personaB: 'colonel-jaune', turns: 50 }) + '\n');

    const meta = buildPilotMeta({ dir, personas: FAKE_PERSONAS, model: 'claude-sonnet-4-6' });
    assert.equal(meta.totalGames, 3);
    assert.equal(meta.totalTurns, 120);
    assert.equal(meta.model, 'claude-sonnet-4-6');
  });
});

test('buildPilotMeta: includes persona system prompts only for personas seen in corpus', () => {
  withTmpDir(dir => {
    writeFileSync(join(dir, 'admiral-vonnegut-colonel-jaune.jsonl'),
      makeGameLine({ game: 0, personaA: 'admiral-vonnegut', personaB: 'colonel-jaune', turns: 10 }) + '\n');

    const meta = buildPilotMeta({ dir, personas: FAKE_PERSONAS, model: 'claude-sonnet-4-6' });
    assert.deepEqual(Object.keys(meta.personaSystemPrompts).sort(),
      ['admiral-vonnegut', 'colonel-jaune']);
    assert.equal(meta.personaSystemPrompts['admiral-vonnegut'], 'you are admiral vonnegut');
  });
});

test('buildPilotMeta: lists pairings with game counts', () => {
  withTmpDir(dir => {
    writeFileSync(join(dir, 'admiral-vonnegut-colonel-jaune.jsonl'),
      makeGameLine({ game: 0, personaA: 'admiral-vonnegut', personaB: 'colonel-jaune', turns: 10 }) + '\n' +
      makeGameLine({ game: 1, personaA: 'admiral-vonnegut', personaB: 'colonel-jaune', turns: 12 }) + '\n');

    const meta = buildPilotMeta({ dir, personas: FAKE_PERSONAS, model: 'claude-sonnet-4-6' });
    assert.equal(meta.pairings.length, 1);
    assert.equal(meta.pairings[0].sideA, 'admiral-vonnegut');
    assert.equal(meta.pairings[0].sideB, 'colonel-jaune');
    assert.equal(meta.pairings[0].games, 2);
  });
});

test('buildPilotMeta: throws on game line referencing unknown persona', () => {
  withTmpDir(dir => {
    writeFileSync(join(dir, 'mystery-pairing.jsonl'),
      makeGameLine({ game: 0, personaA: 'unknown-persona', personaB: 'admiral-vonnegut', turns: 10 }) + '\n');
    assert.throws(
      () => buildPilotMeta({ dir, personas: FAKE_PERSONAS, model: 'claude-sonnet-4-6' }),
      /unknown-persona/,
    );
  });
});

test('buildPilotMeta: returns startedAt/completedAt as ISO strings', () => {
  withTmpDir(dir => {
    writeFileSync(join(dir, 'admiral-vonnegut-colonel-jaune.jsonl'),
      makeGameLine({ game: 0, personaA: 'admiral-vonnegut', personaB: 'colonel-jaune', turns: 10 }) + '\n');
    const meta = buildPilotMeta({ dir, personas: FAKE_PERSONAS, model: 'claude-sonnet-4-6' });
    assert.match(meta.startedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.match(meta.completedAt, /^\d{4}-\d{2}-\d{2}T/);
  });
});
