export function rollDice(n, rng) {
  const d = [];
  for (let i = 0; i < n; i++) d.push(Math.floor(rng() * 6) + 1);
  return d.sort((x, y) => y - x);
}

export function combatRound({ attackForce, defenders }, rng) {
  const aDice = rollDice(Math.min(3, attackForce - 1), rng);
  const dDice = rollDice(Math.min(2, defenders), rng);
  let aLoss = 0, dLoss = 0;
  const pairs = Math.min(aDice.length, dDice.length);
  for (let i = 0; i < pairs; i++) {
    if (aDice[i] > dDice[i]) dLoss++;
    else aLoss++; // ties resolve in the defender's favour
  }
  return { aDice, dDice, aLoss, dLoss };
}

export function resolveAttack({ force, defenders }, rng) {
  let af = force;
  let df = defenders;
  const rounds = [];
  while (af > 1 && df > 0) {
    const r = combatRound({ attackForce: af, defenders: df }, rng);
    af -= r.aLoss;
    df -= r.dLoss;
    rounds.push(r);
  }
  return {
    rounds,
    attackerSurvivors: af,
    defenderSurvivors: df,
    captured: df === 0,
  };
}

// Validate + apply a client-posted combat (spec Amendment A.1). Mirrors
// resolveAttack's loop but consumes posted dice instead of rolling, and
// asserts the dice are legal for the running force/defenders. Returns the
// same shape as resolveAttack, or { error } on any inconsistency.
export function replayAttack({ force, defenders, rounds }) {
  if (!Array.isArray(rounds)) return { error: 'rounds must be an array' };
  if (rounds.length === 0 && force > 1 && defenders > 0) {
    return { error: 'rounds must include at least one round when combat is possible' };
  }
  let af = force;
  let df = defenders;
  const out = [];
  for (const round of rounds) {
    if (af <= 1 || df <= 0) {
      return { error: 'extra round after the attack should have stopped' };
    }
    const aDice = round?.aDice;
    const dDice = round?.dDice;
    if (!Array.isArray(aDice) || !Array.isArray(dDice)) {
      return { error: 'each round needs aDice and dDice arrays' };
    }
    if (
      aDice.length !== Math.min(3, af - 1) ||
      dDice.length !== Math.min(2, df)
    ) {
      return { error: `illegal dice count for force ${af}/defenders ${df}` };
    }
    for (const v of [...aDice, ...dDice]) {
      if (!Number.isInteger(v) || v < 1 || v > 6) {
        return { error: `die value out of range: ${v}` };
      }
    }
    const a = [...aDice].sort((x, y) => y - x);
    const d = [...dDice].sort((x, y) => y - x);
    let aLoss = 0;
    let dLoss = 0;
    const pairs = Math.min(a.length, d.length);
    for (let i = 0; i < pairs; i++) {
      if (a[i] > d[i]) dLoss++;
      else aLoss++;
    }
    af -= aLoss;
    df -= dLoss;
    out.push({ aDice: a, dDice: d, aLoss, dLoss });
  }
  return {
    rounds: out,
    attackerSurvivors: af,
    defenderSurvivors: df,
    captured: df === 0,
  };
}
