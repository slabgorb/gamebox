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
