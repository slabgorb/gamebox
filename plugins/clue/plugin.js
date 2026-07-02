import { buildInitialState } from './server/state.js';
import { applyClueAction } from './server/actions.js';
import { cluePublicView } from './server/view.js';

export default {
  id: 'clue',
  displayName: 'Clue',
  players: { min: 3, max: 4 },
  clientDir: 'plugins/clue/client',

  initialState: buildInitialState,
  applyAction: applyClueAction,
  publicView: cluePublicView,
};
