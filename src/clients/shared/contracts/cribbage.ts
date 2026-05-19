export type Suit = "S" | "H" | "D" | "C";
export type Rank =
  | "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "T" | "J" | "Q" | "K";

export interface Card {
  rank: Rank;
  suit: Suit;
  id?: number | string;
}

export type Phase = "discard" | "cut" | "pegging" | "show" | "match-end";

export interface PeggingState {
  running: number;
  history: Card[];
  lastTrick: {
    kind: "31" | "go";
    cards: Card[];
    points: number;
  } | null;
}

export interface BreakdownItem {
  say: string;
  cards: Card[];
  points?: number;
  kind?: string;
}

export interface BreakdownGroup {
  total: number;
  items: BreakdownItem[];
}

export interface ShowBreakdown {
  nonDealer: BreakdownGroup;
  dealer: BreakdownGroup;
  crib: BreakdownGroup;
}

export interface CribbageView {
  matchTarget: number;
  dealNumber: number;
  phase: Phase;
  dealer: 0 | 1;
  deck: { count: number };
  hands: Array<Card[] | { count: number }>;
  pendingDiscards: Array<Card[] | boolean | null>;
  crib: Card[] | { count: number };
  starter: Card | null;
  pegging: PeggingState | null;
  scores: [number, number];
  prevScores: [number, number];
  showBreakdown: ShowBreakdown | null;
  acknowledged: [boolean, boolean];
  sides: { a: number; b: number };
  activeUserId: number | null;
  endedReason: string | null;
  winnerSide: "a" | "b" | null;
}

export type CribbageAction =
  | { type: "discard"; payload: { cards: Card[] } }
  | { type: "cut" }
  | { type: "play"; payload: { card: Card } }
  | { type: "next" }
  | { type: "resign" };
