// src/clients/shared/contracts/risk.ts
export type RiskPhase =
  | "setup"
  | "reinforce"
  | "attack"
  | "fortify"
  | "gameover";

export type PlayerIdx = number;

export interface Territory {
  owner: PlayerIdx | null;
  armies: number;
}

export type CardType = "infantry" | "cavalry" | "artillery" | "wild";

export interface Card {
  // null for wild cards; a map territory id otherwise.
  territory: string | null;
  type: CardType;
}

export interface CombatRound {
  aDice: number[];
  dDice: number[];
  aLoss: number;
  dLoss: number;
}

export interface LastCombat {
  from: string;
  to: string;
  force: number;
  rounds: CombatRound[];
  captured: boolean;
  attackerSurvivors: number;
  defenderSurvivors: number;
}

export interface RiskLogEntry {
  kind: "setup-deploy" | "deploy" | "attack" | "fortify" | "end-turn" | "trade-in" | "eliminated";
  player?: number;
  by?: number;
  cardsTaken?: number;
  from?: string;
  to?: string;
  force?: number;
  count?: number;
  captured?: boolean;
  next?: number;
  placements?: Record<string, number>;
  // Territory trade-in bonus (E5-2): set on a `trade-in` entry when a traded
  // card named an owned territory, which auto-received +2 armies. E5-6 itemizes it.
  bonusTerritory?: string;
  bonusArmies?: number;
}

export interface PendingCombat {
  from: string;
  to: string;
  force: number;
  attackerIdx: PlayerIdx;
  defenderIdx: PlayerIdx;
}

export interface RiskView {
  phase: RiskPhase;
  currentPlayer: PlayerIdx;
  // Pre-game roll-off (E5-3): seeded d6 per seat (index = seat); the highest
  // roll sets currentPlayer. Present once the game has been built.
  turnOrderRolls?: number[];
  // Per-seat colour as a palette-slot index (index = seat). Defaults to the
  // identity seat→slot mapping; a seat may pick a different slot pre-game.
  colors?: number[];
  territories: Record<string, Territory>;
  reinforcePool: number;
  setupPools: number[];
  fortifyUsed: boolean;
  lastCombat: LastCombat | null;
  winner: PlayerIdx | null;
  winnerSeat?: number | null;
  // Seat roster (userIds in turn order) and elimination bookkeeping.
  seats?: number[];
  eliminated?: boolean[];
  eliminationOrder?: number[];
  log: RiskLogEntry[];
  youAre: PlayerIdx | null;
  // Card hands are private: the view exposes only the viewer's own hand and a
  // count of the opponent's. Absent in games with no card state.
  hand?: Card[];
  opponentCardCount?: number;
  // Per-seat hand sizes (index = seat).
  cardCounts?: number[];
  // Bonus armies the viewer's next trade-in would grant (escalating). Derived
  // server-side from the private trade counter; present when cards are in play.
  nextTradeBonus?: number;
  // Set when a bot's attack is awaiting client-side dice resolution. The
  // defender's client mounts a live CombatReveal and POSTs the resolved
  // payload back so the server can apply the outcome.
  pendingCombat?: PendingCombat;
}

// Resolved combat outcome posted by the human attacker's client.
export interface ResolvedCombat {
  rounds: { aDice: number[]; dDice: number[] }[];
  attackerLosses: number;
  defenderLosses: number;
  captured: boolean;
  // E5-10: on a capture, how many survivors the attacker chose to advance
  // into the conquered territory (min = winning-round dice, max = all
  // survivors). Absent — repulses, pre-E5-10 clients, and the defender-proxy
  // path — the server defaults to max (all survivors advance).
  advanceCount?: number;
}

export type RiskAction =
  | { type: "setup-deploy"; payload: { placements: Record<string, number> } }
  | { type: "deploy"; payload: { placements: Record<string, number> } }
  | {
      type: "attack";
      payload: {
        from: string;
        to: string;
        force?: number;
        // Absent on a bot's intent POST (server stores pendingCombat);
        // present on the defender's resolve POST (server applies the outcome
        // and clears pendingCombat). Also present on a human attacker's POST
        // (Amendment A.1).
        resolved?: ResolvedCombat;
      };
    }
  | { type: "end-attack" }
  | { type: "fortify"; payload: { from: string; to: string; count: number } }
  | { type: "end-turn" }
  // Trade three held cards (referenced by index into the viewer's own hand)
  // for bonus armies during the reinforce phase.
  | { type: "trade-in"; payload: { cardIndices: number[] } }
  | { type: "resign" }
  // Setup-phase per-seat colour pick: choose a palette slot (0..3). Picking a
  // slot another seat holds swaps them, so colours stay unique.
  | { type: "pick-color"; payload: { color: number } };
