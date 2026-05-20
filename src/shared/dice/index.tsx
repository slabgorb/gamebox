/**
 * Bundle entry for `<dice-tray>` — words' build emits this as
 * `public/shared/dice.js`, which every game's HTML loads to register the
 * custom element.
 *
 * The element itself lives in `@local/dice-lib`. This file is the registration
 * shim only: import the class, define the element if no other consumer beat
 * us to it, and re-export for the few callers that touch the class directly.
 *
 * Keep this file thin. All geometry, theme, scene, parser, gesture, and replay
 * logic belongs in the lib.
 */

import { DiceTrayElement } from "@local/dice-lib";

if (!customElements.get("dice-tray")) {
  customElements.define("dice-tray", DiceTrayElement);
}

export { DiceTrayElement };
