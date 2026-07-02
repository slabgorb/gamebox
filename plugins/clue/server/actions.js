import { SUSPECTS, WEAPONS, ROOMS } from './cards.js';
import { findRefuterWalk } from './refute.js';
import { BOARD } from './geometry.js';
import { legalMoves, secretPassageDest } from './rules/movement.js';

const clone = (s) => structuredClone(s);

function actorSeat(state, actorId) {
  const i = state.seats.indexOf(actorId);
  return i === -1 ? null : i;
}

export function applyClueAction({ state, action, actorId, geo = BOARD }) {
  const seat = actorSeat(state, actorId);
  if (seat === null) return { error: 'not a participant' };
  switch (action.type) {
    case 'roll': return doRoll(state, seat, action.payload);
    case 'move': return doMove(state, seat, action.payload, geo);
    case 'secretPassage': return doSecretPassage(state, seat, geo);
    case 'enterRoom': return doEnterRoom(state, seat, action.payload, geo);
    case 'suggest': return doSuggest(state, seat, action.payload);
    case 'refute': return doRefute(state, seat, action.payload);
    case 'accuse': return doAccuse(state, seat, action.payload);
    case 'pass': return doPass(state, seat);
    default: return { error: `unknown action '${action.type}'` };
  }
}

function doRoll(state, seat, payload) {
  if (seat !== state.currentSeat) return { error: 'not your turn' };
  if (state.phase !== 'move') return { error: `cannot roll in phase '${state.phase}'` };
  if (state.pendingRoll != null) return { error: 'already rolled this turn' };
  const value = payload?.value;
  if (!Number.isInteger(value) || value < 1 || value > 6) {
    return { error: 'die value must be an integer 1-6' };
  }
  const next = clone(state);
  next.pendingRoll = value;
  return { state: next };
}

function doMove(state, seat, payload, geo) {
  if (seat !== state.currentSeat) return { error: 'not your turn' };
  if (state.phase !== 'move') return { error: `cannot move in phase '${state.phase}'` };
  if (state.pendingRoll == null) return { error: 'roll before moving' };

  const { squares, rooms } = legalMoves(state, geo, seat);

  if (payload?.room != null) {
    if (!rooms.includes(payload.room)) return { error: 'that room is not reachable this turn' };
    // Entering a room ends the move; route through the existing reducer.
    return doEnterRoom(state, seat, { room: payload.room }, geo);
  }

  const sq = payload?.square;
  const reachable = Array.isArray(sq)
    && squares.some(([c, r]) => c === sq[0] && r === sq[1]);
  if (!reachable) return { error: 'that square is not reachable this turn' };

  const next = clone(state);
  next.pawns[next.seatSuspect[seat]] = { square: [sq[0], sq[1]] };
  next.pendingRoll = null;
  // Spec §5: a move that reaches no room ends at accuse-or-pass.
  next.phase = 'accuse-or-pass';
  next.activeUserId = next.seats[seat];
  return { state: next };
}

function doSecretPassage(state, seat, geo) {
  if (seat !== state.currentSeat) return { error: 'not your turn' };
  if (state.phase !== 'move') return { error: `cannot use a secret passage in phase '${state.phase}'` };
  if (state.pendingRoll != null) return { error: 'cannot use a secret passage after rolling' };
  const loc = state.pawns[state.seatSuspect[seat]];
  const from = loc && loc.room ? loc.room : null;
  const dest = from ? secretPassageDest(geo, from) : null;
  if (!dest) return { error: 'no secret passage from your location' };
  // The leap lands in the opposite corner room and ends the move (-> suggest).
  return doEnterRoom(state, seat, { room: dest }, geo);
}

function doEnterRoom(state, seat, payload, geo) {
  if (seat !== state.currentSeat) return { error: 'not your turn' };
  if (state.phase !== 'move') return { error: `cannot enter a room in phase '${state.phase}'` };
  const room = payload?.room;
  // Validate against the injected geometry (default BOARD carries exactly the
  // catalog rooms) so synthetic test boards work; own-property check keeps
  // prototype keys out.
  if (typeof room !== 'string' || !Object.hasOwn(geo.rooms, room)) {
    return { error: `invalid room '${room}'` };
  }

  const next = clone(state);
  next.pawns[next.seatSuspect[seat]] = { room };
  next.pendingRoll = null;
  next.phase = 'suggest';
  next.activeUserId = next.seats[seat];
  return { state: next };
}

function doSuggest(state, seat, payload) {
  if (seat !== state.currentSeat) return { error: 'not your turn' };
  if (state.phase !== 'suggest') return { error: `cannot suggest in phase '${state.phase}'` };
  const { suspect, weapon, room } = payload ?? {};
  if (!SUSPECTS.includes(suspect)) return { error: `invalid suspect '${suspect}'` };
  if (!WEAPONS.includes(weapon)) return { error: `invalid weapon '${weapon}'` };
  if (!ROOMS.includes(room)) return { error: `invalid room '${room}'` };
  if (room !== state.pawns[state.seatSuspect[seat]].room) {
    return { error: 'must suggest the room you are in' };
  }

  const next = clone(state);
  // Drag the named suspect pawn and weapon token into the room (public signal).
  next.pawns[suspect] = { room };
  next.weapons[weapon] = room;
  next.log.push({ type: 'suggest', bySeat: seat, suspect, weapon, room });

  const { passes, refuterSeat } = findRefuterWalk(next, seat, { suspect, weapon, room });
  for (const p of passes) next.log.push({ type: 'no-refute', seat: p });

  next.suggestion = { bySeat: seat, suspect, weapon, room, refuterSeat, shownCard: null };
  if (refuterSeat === null) {
    next.phase = 'accuse-or-pass';
    next.activeUserId = next.seats[seat];
  } else {
    next.phase = 'refute';
    next.activeUserId = next.seats[refuterSeat];
  }
  return { state: next };
}

function doRefute(state, seat, payload) {
  if (state.phase !== 'refute' || !state.suggestion) return { error: 'no suggestion to refute' };
  if (seat !== state.suggestion.refuterSeat) return { error: 'not your card to show' };
  const card = payload?.card;
  const named = [state.suggestion.suspect, state.suggestion.weapon, state.suggestion.room];
  if (!named.includes(card)) return { error: 'card is not one of the suggested cards' };
  if (!state.hands[seat].includes(card)) return { error: 'you do not hold that card' };

  const next = clone(state);
  next.suggestion.shownCard = card;
  next.ledgers[next.suggestion.bySeat].push({ fromSeat: seat, card });
  next.log.push({ type: 'refute', bySeat: seat, ofSeat: next.suggestion.bySeat });
  next.phase = 'accuse-or-pass';
  next.activeUserId = next.seats[next.suggestion.bySeat];
  return { state: next };
}

function livingCount(state) {
  return state.eliminated.filter((e) => !e).length;
}

function nextSeat(state, from) {
  const n = state.seats.length;
  for (let step = 1; step <= n; step++) {
    const s = (from + step) % n;
    if (!state.eliminated[s]) return s;
  }
  return from;
}

function endWith(next, winnerSeat, reason) {
  next.phase = 'ended';
  next.winnerSeat = winnerSeat;
  next.endedReason = reason;
  next.activeUserId = null;
  next.suggestion = null;
  return { state: next, ended: true };
}

function doAccuse(state, seat, payload) {
  if (seat !== state.currentSeat) return { error: 'not your turn' };
  if (state.phase !== 'move' && state.phase !== 'accuse-or-pass') {
    return { error: `cannot accuse in phase '${state.phase}'` };
  }
  const { suspect, weapon, room } = payload ?? {};
  if (!SUSPECTS.includes(suspect)) return { error: `invalid suspect '${suspect}'` };
  if (!WEAPONS.includes(weapon)) return { error: `invalid weapon '${weapon}'` };
  if (!ROOMS.includes(room)) return { error: `invalid room '${room}'` };

  const correct = suspect === state.envelope.suspect
    && weapon === state.envelope.weapon
    && room === state.envelope.room;

  const next = clone(state);
  next.log.push({ type: 'accuse', bySeat: seat, correct });

  if (correct) return endWith(next, seat, 'accusation');

  // Wrong: eliminate but keep the accuser's cards for future refutes.
  next.eliminated[seat] = true;
  if (livingCount(next) === 1) {
    return endWith(next, next.eliminated.findIndex((e) => !e), 'last-standing');
  }
  const nseat = nextSeat(next, seat);
  next.currentSeat = nseat;
  next.phase = 'move';
  next.activeUserId = next.seats[nseat];
  next.suggestion = null;
  next.pendingRoll = null;
  return { state: next };
}

function doPass(state, seat) {
  if (seat !== state.currentSeat) return { error: 'not your turn' };
  if (state.phase !== 'move' && state.phase !== 'accuse-or-pass') {
    return { error: `cannot pass in phase '${state.phase}'` };
  }
  const next = clone(state);
  const nseat = nextSeat(next, seat);
  next.currentSeat = nseat;
  next.phase = 'move';
  next.activeUserId = next.seats[nseat];
  next.suggestion = null;
  next.pendingRoll = null;
  return { state: next };
}
