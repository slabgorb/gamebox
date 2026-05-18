import { playerIndex } from './state.js';

export function riskPublicView({ state, viewerId }) {
  return { ...state, youAre: playerIndex(state, viewerId) };
}
