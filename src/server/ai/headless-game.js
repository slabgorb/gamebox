import { buildInitialState, userIdOf } from '../../../plugins/risk/server/state.js';
import { applyRiskAction } from '../../../plugins/risk/server/actions.js';
import { resolveAttack } from '../../../plugins/risk/server/combat.js';
import { chooseAction } from '../../../plugins/risk/server/ai/risk-player.js';

// Mulberry32 PRNG — small, fast, well-distributed, deterministic from seed.
// Plenty good for game-state randomization and dice rolls; not for crypto.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FAKE_USER_A = 1;
const FAKE_USER_B = 2;

// Drive any pending combat by acting as the defender's client: roll dice
// with our seeded RNG via resolveAttack, then re-call applyRiskAction with
// a resolved payload, attributed to the defender (the actor proxy contract).
// Returns the updated state. May loop only once per attack; the resolved
// branch clears pendingCombat.
function resolvePendingCombat(state, rng) {
  const pc = state.pendingCombat;
  if (!pc) return state;
  const defenderArmies = state.territories[pc.to].armies;
  const outcome = resolveAttack({ force: pc.force, defenders: defenderArmies }, rng);
  const defenderUserId = userIdOf(state, pc.defenderIdx);
  const result = applyRiskAction({
    state,
    action: {
      type: 'attack',
      payload: {
        from: pc.from,
        to: pc.to,
        force: pc.force,
        resolved: {
          rounds: outcome.rounds,
          attackerSurvivors: outcome.attackerSurvivors,
          defenderSurvivors: outcome.defenderSurvivors,
          captured: outcome.captured,
        },
      },
    },
    actorId: defenderUserId,
    rng,
  });
  if (result.error) {
    throw new Error(`runGame: resolved combat rejected: ${result.error}`);
  }
  return result.state;
}

export async function runGame({
  llmA, llmB, personaA, personaB, seed, maxTurns = 500,
}) {
  const rng = mulberry32(seed);
  const t0 = Date.now();

  let state = buildInitialState({
    participants: [
      { side: 'a', userId: FAKE_USER_A },
      { side: 'b', userId: FAKE_USER_B },
    ],
    rng,
  });

  const transcript = [];
  let sessionA = null;
  let sessionB = null;

  for (let turn = 0; turn < maxTurns; turn++) {
    if (state.winner !== null) {
      return {
        winner: state.winner === 0 ? 'a' : 'b',
        endReason: 'win',
        turnCount: turn,
        durationMs: Date.now() - t0,
        transcript,
      };
    }

    const sideIdx = state.currentPlayer;
    const side = sideIdx === 0 ? 'a' : 'b';
    const llm = sideIdx === 0 ? llmA : llmB;
    const persona = sideIdx === 0 ? personaA : personaB;
    const sessionId = sideIdx === 0 ? sessionA : sessionB;

    let result;
    try {
      result = await chooseAction({
        llm, persona, sessionId,
        state, botPlayerIdx: sideIdx,
        userMessages: [],
      });
    } catch (err) {
      return {
        winner: sideIdx === 0 ? 'b' : 'a',
        endReason: 'forfeit',
        turnCount: turn,
        durationMs: Date.now() - t0,
        transcript,
        forfeitReason: err.message,
      };
    }

    if (sideIdx === 0) sessionA = result.sessionId;
    else sessionB = result.sessionId;

    transcript.push({
      turn,
      side,
      phase: state.phase,
      chosenMoveId: result.action.type,
      banter: result.banter,
      stateBefore: structuredClone(state),
      action: result.action,
    });

    const actorId = sideIdx === 0 ? FAKE_USER_A : FAKE_USER_B;
    const applied = applyRiskAction({ state, action: result.action, actorId, rng });
    if (applied.error) {
      // The bot chose a legal-shaped move that applyRiskAction rejected
      // (race/edge case). Treat as forfeit so the tournament continues.
      return {
        winner: sideIdx === 0 ? 'b' : 'a',
        endReason: 'forfeit',
        turnCount: turn + 1,
        durationMs: Date.now() - t0,
        transcript,
        forfeitReason: `apply rejected: ${applied.error}`,
      };
    }
    state = applied.state;

    // If the action was an attack-intent, applyRiskAction set pendingCombat;
    // resolve it now (the harness plays the defender's client).
    if (state.pendingCombat) {
      state = resolvePendingCombat(state, rng);
    }

    // Check for game end from conquest (applyRiskAction returned ended:true).
    if (applied.ended) {
      return {
        winner: state.winner === 0 ? 'a' : 'b',
        endReason: 'win',
        turnCount: turn + 1,
        durationMs: Date.now() - t0,
        transcript,
      };
    }
  }

  return {
    winner: null,
    endReason: 'timeout',
    turnCount: maxTurns,
    durationMs: Date.now() - t0,
    transcript,
  };
}

// Wilson score interval for a binomial proportion at 95% confidence.
// Returns { low, high } each in [0, 1]. Defined as [0, 0] when n === 0.
export function wilsonInterval(wins, n, z = 1.96) {
  if (n === 0) return { low: 0, high: 0 };
  const p = wins / n;
  const denom = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return {
    low: Math.max(0, (centre - margin) / denom),
    high: Math.min(1, (centre + margin) / denom),
  };
}
