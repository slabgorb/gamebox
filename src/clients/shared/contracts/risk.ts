// src/clients/shared/contracts/risk.ts
export type RiskPhase =
  | "setup"
  | "reinforce"
  | "attack"
  | "fortify"
  | "gameover";

export type PlayerIdx = 0 | 1;

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
  kind: "setup-deploy" | "deploy" | "attack" | "fortify" | "end-turn" | "trade-in";
  player?: number;
  from?: string;
  to?: string;
  force?: number;
  count?: number;
  captured?: boolean;
  next?: number;
  placements?: Record<string, number>;
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
  territories: Record<string, Territory>;
  reinforcePool: number;
  setupPools: [number, number];
  fortifyUsed: boolean;
  lastCombat: LastCombat | null;
  winner: PlayerIdx | null;
  log: RiskLogEntry[];
  youAre: PlayerIdx | null;
  // Card hands are private: the view exposes only the viewer's own hand and a
  // count of the opponent's. Absent in games with no card state.
  hand?: Card[];
  opponentCardCount?: number;
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
  | { type: "resign" };
