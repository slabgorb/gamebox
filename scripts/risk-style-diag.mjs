#!/usr/bin/env node
// Risk style diagnostic. Reads every *.jsonl file in the supplied pilot dir,
// computes three per-persona metrics, runs pairwise chi-square tests on
// attack-when-available, and prints a structured report with a GO/NO-GO
// recommendation.
//
// Usage:
//   node scripts/risk-style-diag.mjs <pilot-dir>
//
// Default pilot-dir: data/risk-corpus/pilot/

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chiSquare2x2, chiSquarePValue } from '../src/server/ai/diagnostics/chi-square.js';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_DIR = resolve(PROJECT_ROOT, 'data', 'risk-corpus', 'pilot');

const P_THRESHOLD = 0.01;
const SPREAD_PP_THRESHOLD = 15;

// Read all *.jsonl files under dir (skipping pilot-meta.json).
function readGames(dir) {
  const files = readdirSync(dir).filter(f => f.endsWith('.jsonl'));
  const games = [];
  for (const f of files) {
    const lines = readFileSync(join(dir, f), 'utf8').split('\n').filter(l => l.trim());
    for (const line of lines) games.push(JSON.parse(line));
  }
  return games;
}

export function computePersonaMetrics(games) {
  const personas = {};

  function ensure(id) {
    if (!personas[id]) {
      personas[id] = {
        turns: 0,
        moveTypeCounts: {},
        attackWhenAvailable: { attacked: 0, total: 0 },
        // Card-robust style metric (E2-9). A card is earned by capturing >=1
        // territory per turn, so attack-when-available is inflated toward 100%
        // for every persona once cards exist. Persona voice survives in the
        // *post-card-secured* choice: once the turn's card is locked in
        // (cardSecuredThisTurn), does the persona keep pressing or bank it?
        // This segments attack-when-available to just those decisions.
        postCardSecuredAggression: { attacked: 0, total: 0 },
        attackForce: { forceCommitted: 0, attackerArmies: 0, count: 0 },
      };
    }
    return personas[id];
  }

  for (const game of games) {
    const personaBySide = { a: game.personaA, b: game.personaB };
    for (const t of game.transcript) {
      const personaId = personaBySide[t.side];
      const p = ensure(personaId);
      p.turns += 1;

      const actionType = t.action?.type ?? t.chosenMoveId.split(':')[0];
      p.moveTypeCounts[actionType] = (p.moveTypeCounts[actionType] ?? 0) + 1;

      if (t.phase === 'attack' && Array.isArray(t.shortlist)) {
        const hasGoodAttack = t.shortlist.some(m =>
          m.id.startsWith('attack:') && m.score > 0);
        if (hasGoodAttack) {
          p.attackWhenAvailable.total += 1;
          if (actionType === 'attack') p.attackWhenAvailable.attacked += 1;
          if (t.cardSecuredThisTurn === true) {
            p.postCardSecuredAggression.total += 1;
            if (actionType === 'attack') p.postCardSecuredAggression.attacked += 1;
          }
        }
      }

      if (actionType === 'attack' && t.action?.payload) {
        const { from, force } = t.action.payload;
        const armies = t.stateBefore?.territories?.[from]?.armies;
        if (typeof armies === 'number' && armies > 0 && typeof force === 'number') {
          p.attackForce.forceCommitted += force;
          p.attackForce.attackerArmies += armies;
          p.attackForce.count += 1;
        }
      }
    }
  }

  for (const id of Object.keys(personas)) {
    const p = personas[id];
    p.moveTypeMix = {};
    const total = Object.values(p.moveTypeCounts).reduce((s, v) => s + v, 0) || 1;
    for (const [type, count] of Object.entries(p.moveTypeCounts)) {
      p.moveTypeMix[type] = count / total;
    }
  }

  return personas;
}

export function evaluateGoNoGo(metrics, personaIds) {
  const rates = {};
  for (const id of personaIds) {
    const a = metrics[id].attackWhenAvailable;
    rates[id] = a.total > 0 ? a.attacked / a.total : 0;
  }

  const pairwise = [];
  for (let i = 0; i < personaIds.length; i++) {
    for (let j = i + 1; j < personaIds.length; j++) {
      const idA = personaIds[i];
      const idB = personaIds[j];
      const a = metrics[idA].attackWhenAvailable;
      const b = metrics[idB].attackWhenAvailable;
      const stat = chiSquare2x2({
        a: a.attacked, b: a.total - a.attacked,
        c: b.attacked, d: b.total - b.attacked,
      });
      const pValue = chiSquarePValue(stat);
      pairwise.push({ idA, idB, chiSquared: stat, pValue });
    }
  }

  const values = Object.values(rates);
  const spreadPp = Math.round((Math.max(...values) - Math.min(...values)) * 100);

  const allSignificant = pairwise.every(p => p.pValue < P_THRESHOLD);
  const spreadOk = spreadPp >= SPREAD_PP_THRESHOLD;

  let recommendation;
  let reason;
  if (allSignificant && spreadOk) {
    recommendation = 'GO';
    reason = `all ${pairwise.length} pairs distinguishable at p<${P_THRESHOLD}; spread ≥ ${SPREAD_PP_THRESHOLD}pp`;
  } else if (!allSignificant) {
    recommendation = 'NO-GO';
    reason = `at least one pair not significant at p<${P_THRESHOLD}`;
  } else {
    recommendation = 'NO-GO';
    reason = `spread ${spreadPp}pp below threshold of ${SPREAD_PP_THRESHOLD}pp`;
  }

  return { recommendation, reason, spreadPp, pairwise, rates };
}

function pct(x) { return (x * 100).toFixed(1) + '%'; }
function pctInt(x) { return Math.round(x * 100) + '%'; }

function printReport(personaIds, metrics, gate, gameCount, model) {
  console.log(`Risk style diagnostic — ${gameCount} games, model=${model ?? 'unknown'}\n`);

  const header = ['', ...personaIds].map(s => s.padEnd(22)).join('');
  console.log(header);

  const rows = [
    ['turns',             id => String(metrics[id].turns)],
    ['attack%',           id => pct(metrics[id].moveTypeMix.attack ?? 0)],
    ['attack-when-avail', id => {
      const a = metrics[id].attackWhenAvailable;
      return a.total > 0 ? pctInt(a.attacked / a.total) : 'n/a';
    }],
    ['post-card-aggr', id => {
      const a = metrics[id].postCardSecuredAggression;
      return a.total > 0 ? pctInt(a.attacked / a.total) : 'n/a';
    }],
    ['mean-force-frac',   id => {
      const f = metrics[id].attackForce;
      return f.attackerArmies > 0 ? pct(f.forceCommitted / f.attackerArmies) : 'n/a';
    }],
  ];
  for (const [label, fn] of rows) {
    const cells = [label.padEnd(22), ...personaIds.map(id => fn(id).padEnd(22))];
    console.log(cells.join(''));
  }
  console.log();
  console.log('Pairwise chi-square on attack-when-avail:');
  for (const p of gate.pairwise) {
    const passed = p.pValue < P_THRESHOLD ? '✓' : '✗';
    const pStr = p.pValue < 0.001 ? 'p<0.001' : `p=${p.pValue.toFixed(3)}`;
    console.log(`  ${p.idA} vs ${p.idB}: chi²=${p.chiSquared.toFixed(1)}, ${pStr}  ${passed}`);
  }
  console.log();
  console.log(`Spread (max - min attack-when-avail): ${gate.spreadPp}pp\n`);
  console.log(`${gate.recommendation}: ${gate.reason}.`);
  if (gate.recommendation === 'GO') console.log('Recommend scale-up.');
  else console.log('Iterate on prompts before scaling up.');
}

function main() {
  const dir = process.argv[2] ? resolve(process.argv[2]) : DEFAULT_DIR;
  if (!existsSync(dir)) {
    console.error(`risk-style-diag: directory not found: ${dir}`);
    process.exit(1);
  }

  const games = readGames(dir);
  if (games.length === 0) {
    console.error(`risk-style-diag: no .jsonl files in ${dir}`);
    process.exit(1);
  }

  const metrics = computePersonaMetrics(games);
  const personaIds = Object.keys(metrics).sort();
  if (personaIds.length < 2) {
    console.error(`risk-style-diag: need at least 2 personas, found ${personaIds.length}`);
    process.exit(1);
  }

  let model = null;
  const metaPath = join(dir, 'pilot-meta.json');
  if (existsSync(metaPath)) {
    try { model = JSON.parse(readFileSync(metaPath, 'utf8')).model; } catch {}
  }

  const gate = evaluateGoNoGo(metrics, personaIds);
  printReport(personaIds, metrics, gate, games.length, model);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
