// src/clients/shared/contracts/sorry.ts
// Client-side mirror of the Sorry! public view (server/view.js) and action
// contract (server/actions.js). Kept in lockstep with the engine; the client
// never recomputes game rules from these — it renders the server's truth.

export type SorrySide = "a" | "b";

export type SorryCard = 1 | 2 | 3 | 4 | 5 | 7 | 8 | 10 | 11 | 12 | "sorry" | null;

export type PawnZone = "start" | "track" | "safety" | "home";

export interface PawnLoc {
  id: number;
  zone: PawnZone;
  index: number;
}

export interface MoveLeg {
  pawnId: number;
  steps: number;
  to: { zone: PawnZone; index: number };
}

// One enumerated legal move from server/rules/legal-moves.js. `to` is present
// for single-destination kinds (out/forward/back/swap/sorry); split moves carry
// `legs` instead.
export interface LegalMove {
  id: string;
  kind: "out" | "forward" | "back" | "split" | "swap" | "sorry";
  pawnId?: number;
  steps?: number;
  targetPawnId?: number;
  to?: { zone: PawnZone; index: number };
  legs?: MoveLeg[];
}

export interface SorryView {
  sides: Record<SorrySide, number>;
  pawns: Record<SorrySide, PawnLoc[]>;
  discard: SorryCard[];
  drawnCard: SorryCard;
  currentPlayer: SorrySide;
  winner: SorrySide | null;
  lastEvent: unknown;
  activeUserId: number | null;
  deckCount: number;
  youAre: SorrySide | null;
  // Present only on the active viewer's view (server/view.js).
  legalMoves?: LegalMove[];
}

export type SorryAction = {
  type: "move";
  payload: { moveId: string };
};
