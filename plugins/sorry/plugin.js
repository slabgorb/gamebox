import { buildInitialState } from './server/state.js';
import { applySorryAction } from './server/actions.js';
import { sorryPublicView } from './server/view.js';

export default {
  id: 'sorry',
  displayName: 'Sorry!',
  players: 2,
  clientDir: 'plugins/sorry/client',

  initialState: buildInitialState,
  applyAction: applySorryAction,
  publicView: sorryPublicView,
};
