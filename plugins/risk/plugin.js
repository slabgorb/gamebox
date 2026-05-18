import { buildInitialState } from './server/state.js';
import { applyRiskAction } from './server/actions.js';
import { riskPublicView } from './server/view.js';
import { enumerateLegalMoves } from './server/ai/legal-moves.js';
import { playerIndex } from './server/state.js';

export default {
  id: 'risk',
  displayName: 'Risk',
  players: 2,
  clientDir: 'plugins/risk/client',
  initialState: buildInitialState,
  applyAction: applyRiskAction,
  publicView: riskPublicView,
  legalActions: ({ state, userId }) => {
    const idx = playerIndex(state, userId);
    if (idx === null || idx !== state.currentPlayer) return [];
    return enumerateLegalMoves(state, idx).map(m => m.action);
  },
};
