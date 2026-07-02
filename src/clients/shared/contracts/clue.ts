// Client-side mirror of the Clue public view (plugins/clue/server/view.js)
// and action contract (plugins/clue/server/actions.js). The client renders
// the server's truth; it never recomputes rules from these types.
export type SuspectId = "scarlett" | "mustard" | "white" | "green" | "peacock" | "plum";
export type WeaponId = "candlestick" | "knife" | "leadpipe" | "revolver" | "rope" | "wrench";
export type RoomId =
  | "kitchen" | "ballroom" | "conservatory" | "diningroom" | "billiardroom"
  | "library" | "lounge" | "hall" | "study";
export type CardId = SuspectId | WeaponId | RoomId;
export type CluePhase = "move" | "suggest" | "refute" | "accuse-or-pass" | "ended";

export interface PawnLoc {
  room?: RoomId;
  square?: [number, number];
}

export interface ClueSuggestion {
  bySeat: number;
  suspect: SuspectId;
  weapon: WeaponId;
  room: RoomId;
  refuterSeat: number | null;
  shownCard: CardId | null; // non-null only in the suggester's own view
}

// Disclosed ONLY to the active viewer in phase 'move' (null otherwise):
// pre-roll it says "roll (or leap)"; post-roll it lists the reachable set.
export type ClueMovement =
  | { needsRoll: true; secretPassage: RoomId | null }
  | { needsRoll: false; pendingRoll: number; squares: [number, number][]; rooms: RoomId[] };

export interface ClueView {
  youAreSeat: number | null;
  seats: number[];
  phase: CluePhase;
  currentSeat: number;
  activeUserId: number | null;
  pawns: Record<SuspectId, PawnLoc>;
  weapons: Record<WeaponId, RoomId>;
  seatSuspect: SuspectId[];
  eliminated: boolean[];
  log: Array<Record<string, unknown>>;
  suggestion: ClueSuggestion | null;
  hand: CardId[];
  ledger: Array<{ fromSeat: number; card: CardId }>;
  winnerSeat: number | null;
  pendingRoll: number | null;
  movement: ClueMovement | null;
}

export type ClueAction =
  | { type: "roll"; payload: { value: number } } // client-rolled 1-6, never server RNG
  | { type: "move"; payload: { square: [number, number] } | { room: RoomId } }
  | { type: "secretPassage" }
  | { type: "suggest"; payload: { suspect: SuspectId; weapon: WeaponId; room: RoomId } }
  | { type: "refute"; payload: { card: CardId } }
  | { type: "accuse"; payload: { suspect: SuspectId; weapon: WeaponId; room: RoomId } }
  | { type: "pass" };
