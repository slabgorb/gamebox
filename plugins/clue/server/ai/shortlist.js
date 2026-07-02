// Bounded, difficulty-capped, sub-state-aware action menu for the Clue bot.
//
// Imperfection is a designed property of the MENU, not LLM incompetence:
// the caps bound how good the options can be, the persona picks among them.
// Every entry is a shipped reducer action — never the raw enterRoom (F7) —
// and the roll slot is a VALUES-LESS intent: the client rolls the die and
// POSTs roll{value}; the bot never materialises a die value (F8).
import { SUSPECTS, WEAPONS } from '../cards.js';
import { BOARD } from '../geometry.js';
import { legalMoves, secretPassageDest } from '../rules/movement.js';

const SHORTLIST_CAP = 6; // max entries offered to the LLM (backgammon MAX_SHORTLIST idiom)
const MOVE_CAP = 4;      // max movement destinations in the post-roll sub-state
const SUGGEST_CAP = 4;   // max suggestion probes in the suggest sub-state
// Difficulty: 'solved' (v1) offers accuse ONLY when the tracker has certainly
// solved the envelope. A future per-persona lever may loosen this (F10).
const DIFFICULTY = 'solved';

export function buildClueShortlist({ state, geo = BOARD, seat, tracker, difficulty = DIFFICULTY }) {
  const entries = [];
  const take = (entry) => {
    if (entries.length >= SHORTLIST_CAP) return;
    if (entries.some((e) => e.id === entry.id)) return;
    entries.push(entry);
  };

  const accuseEntry = () => {
    const solution = tracker.envelopeSolution();
    if (difficulty === 'solved' && solution == null) return null;
    if (solution == null) return null;
    return {
      id: 'accuse',
      slot: 'accuse',
      action: { type: 'accuse', payload: solution },
      summary: `accuse: ${solution.suspect} with the ${solution.weapon} in the ${solution.room}`,
    };
  };

  const suspect = state.seatSuspect[seat];
  const loc = state.pawns[suspect];
  const currentRoom = loc && loc.room ? loc.room : null;

  if (state.phase === 'move' && state.pendingRoll == null) {
    // Top of turn: solve it, leap it, or roll for movement.
    const accuse = accuseEntry();
    if (accuse) take(accuse);
    if (currentRoom && secretPassageDest(geo, currentRoom)) {
      take({
        id: 'secret-passage',
        slot: 'secret-passage',
        action: { type: 'secretPassage' },
        summary: `take the secret passage to the ${secretPassageDest(geo, currentRoom)}`,
      });
    }
    take({ id: 'roll', slot: 'roll', action: { type: 'roll' }, summary: 'roll the die' });
    return entries;
  }

  if (state.phase === 'move' && state.pendingRoll != null) {
    // Post-roll movement: chase-ranked rooms first, then corridor spread.
    const { squares, rooms } = legalMoves(state, geo, seat);
    const chased = tracker.envelopeCandidates('room');
    const ranked = [
      ...rooms.filter((r) => chased.includes(r)),
      ...rooms.filter((r) => !chased.includes(r)),
    ];
    let moves = 0;
    for (const room of ranked) {
      if (moves >= MOVE_CAP) break;
      take({
        id: `move-room-${room}`,
        slot: chased.includes(room) ? 'chase' : 'room',
        action: { type: 'move', payload: { room } },
        summary: chased.includes(room)
          ? `enter the ${room} (still a candidate)`
          : `enter the ${room}`,
      });
      moves++;
    }
    for (const [c, r] of squares) {
      if (moves >= MOVE_CAP) break;
      take({
        id: `move-${c}-${r}`,
        slot: 'corridor',
        action: { type: 'move', payload: { square: [c, r] } },
        summary: `move to corridor square [${c}, ${r}]`,
      });
      moves++;
    }
    if (entries.length === 0) {
      // Sealed in (occupied doorway): the only legal play is to pass.
      take({ id: 'pass', slot: 'pass', action: { type: 'pass' }, summary: 'no reachable square or room — pass' });
    }
    return entries;
  }

  if (state.phase === 'suggest') {
    const room = currentRoom;
    const probe = (id, slot, s, w, summary) => {
      if (!SUSPECTS.includes(s) || !WEAPONS.includes(w)) return;
      if (entries.some((e) => e.action.payload?.suspect === s && e.action.payload?.weapon === w)) return;
      if (entries.filter((e) => e.action.type === 'suggest').length >= SUGGEST_CAP) return;
      take({ id, slot, action: { type: 'suggest', payload: { suspect: s, weapon: w, room } }, summary });
    };

    const unseenS = tracker.unseenSuspects();
    const unseenW = tracker.unseenWeapons();
    const candS = tracker.envelopeCandidates('suspect');
    const candW = tracker.envelopeCandidates('weapon');
    const heldS = state.hands[seat].filter((c) => SUSPECTS.includes(c));
    const heldW = state.hands[seat].filter((c) => WEAPONS.includes(c));

    probe('suggest-info-max', 'info-max', unseenS[0], unseenW[0],
      'probe two cards you have not located');
    probe('suggest-chase', 'chase', candS[0], candW[0],
      'name the pair you suspect is in the envelope');
    probe('suggest-bluff', 'bluff', heldS[0] ?? unseenS[0], heldS[0] ? (unseenW[0] ?? heldW[0]) : heldW[0],
      'mix a card from your own hand into the question');
    probe('suggest-safe', 'safe', heldS[0], heldW[0],
      'a quiet probe that reveals nothing you do not already know');
    if (entries.length === 0) {
      // Caps or dedup emptied the menu: fall back to the first legal probe.
      probe('suggest-fallback', 'info-max', SUSPECTS[0], WEAPONS[0], 'ask the room a question');
    }
    return entries;
  }

  if (state.phase === 'accuse-or-pass') {
    const accuse = accuseEntry();
    if (accuse) take(accuse);
    take({ id: 'pass', slot: 'pass', action: { type: 'pass' }, summary: 'end the turn' });
    return entries;
  }

  // Unexpected sub-state (refute is short-circuited in clue-player): the
  // never-empty contract still holds.
  take({ id: 'pass', slot: 'pass', action: { type: 'pass' }, summary: 'end the turn' });
  return entries;
}
