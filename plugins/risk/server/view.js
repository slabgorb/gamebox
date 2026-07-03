import { playerIndex } from './state.js';
import { tradeBonus } from './actions.js';
import { CONTINENTS, continentBonus } from './map.js';

// E5-6: itemize the current player's muster so the client can show WHERE the
// reinforce pool came from instead of a bare number. Pure presentation over
// state the engine already holds — base/continent math from ownership, the
// traded-set bonus as the pool residual, and the +2 territory placement from
// E5-2's enriched `trade-in` log entry.
function reinforceBreakdown(state) {
  const playerIdx = state.currentPlayer;
  const owned = Object.values(state.territories ?? {}).filter(t => t.owner === playerIdx).length;
  const base = Math.max(3, Math.floor(owned / 3));

  const continents = [];
  for (const key of Object.keys(CONTINENTS)) {
    const held = CONTINENTS[key].territories.every(id => state.territories?.[id]?.owner === playerIdx);
    if (held) continents.push({ name: CONTINENTS[key].name, armies: continentBonus(key) });
  }
  const contSum = continents.reduce((sum, c) => sum + c.armies, 0);

  const breakdown = { base, continents };

  // The traded-set bonus is folded into reinforcePool; the log entry doesn't
  // carry the amount, so recover it as the residual over base + continents.
  const tradeIn = (state.reinforcePool ?? 0) - base - contSum;
  if (tradeIn > 0) breakdown.tradeIn = tradeIn;

  // The +2 placement is on the territory, NOT in the pool. Read it from the
  // current muster's trade-in only — scan back to the last end-turn so a prior
  // turn's placement can't leak into this muster.
  const territoryBonus = currentMusterTerritoryBonus(state, playerIdx);
  if (territoryBonus) breakdown.territoryBonus = territoryBonus;

  return breakdown;
}

function currentMusterTerritoryBonus(state, playerIdx) {
  const log = Array.isArray(state.log) ? state.log : [];
  for (let i = log.length - 1; i >= 0; i--) {
    const e = log[i];
    if (e.kind === 'end-turn') break; // reached the start of the current muster
    if (e.kind === 'trade-in' && e.player === playerIdx && e.bonusTerritory != null) {
      return { territory: e.bonusTerritory, armies: e.bonusArmies };
    }
  }
  return null;
}

export function riskPublicView({ state, viewerId }) {
  const youAre = playerIndex(state, viewerId);
  // Hands, deck, and discard are private information — never ship their
  // identities to a client. The viewer sees only their own hand and per-seat
  // card counts. capturedThisTurn / tradeInCount are internal engine
  // bookkeeping and are not part of the RiskView contract.
  const { hands, deck, discard, capturedThisTurn, tradeInCount, ...rest } = state;
  const view = { ...rest, youAre };
  // The itemized muster is meaningful only while a pool is being deployed.
  if (state.phase === 'reinforce') view.reinforceBreakdown = reinforceBreakdown(state);
  if (Array.isArray(hands)) {
    const isPlayer = youAre !== null && youAre >= 0;
    view.hand = isPlayer ? (hands[youAre] ?? []) : [];
    view.cardCounts = hands.map(h => h?.length ?? 0);
    // Legacy 2P field: the other seat's count (first seat that isn't you).
    const oppIdx = isPlayer ? (youAre === 0 ? 1 : 0) : null;
    view.opponentCardCount = oppIdx === null ? 0 : (hands[oppIdx]?.length ?? 0);
    // Derived: how many bonus armies the NEXT trade-in grants. The raw
    // tradeInCount counter stays private; the client only needs the figure
    // to label the trade-in control (AC: "shows the bonus it will grant").
    view.nextTradeBonus = tradeBonus(tradeInCount ?? 0);
  }
  return view;
}
