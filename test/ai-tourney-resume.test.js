import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { countCompletedGames } from '../scripts/risk-tourney.mjs';

function withTmpDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'tourney-resume-'));
  try { return fn(dir); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

test('countCompletedGames: returns 0 when file does not exist', () => {
  withTmpDir(dir => {
    const r = countCompletedGames(join(dir, 'missing.jsonl'));
    assert.equal(r, 0);
  });
});

test('countCompletedGames: returns 0 on empty file', () => {
  withTmpDir(dir => {
    const p = join(dir, 'empty.jsonl');
    writeFileSync(p, '');
    assert.equal(countCompletedGames(p), 0);
  });
});

test('countCompletedGames: counts non-empty lines (ignores trailing newline)', () => {
  withTmpDir(dir => {
    const p = join(dir, 'three.jsonl');
    writeFileSync(p, '{"game":0}\n{"game":1}\n{"game":2}\n');
    assert.equal(countCompletedGames(p), 3);
  });
});

test('countCompletedGames: counts last line even without trailing newline', () => {
  withTmpDir(dir => {
    const p = join(dir, 'noeol.jsonl');
    writeFileSync(p, '{"game":0}\n{"game":1}\n{"game":2}');
    assert.equal(countCompletedGames(p), 3);
  });
});

test('countCompletedGames: skips blank lines', () => {
  withTmpDir(dir => {
    const p = join(dir, 'blanks.jsonl');
    writeFileSync(p, '{"game":0}\n\n{"game":1}\n');
    assert.equal(countCompletedGames(p), 2);
  });
});
