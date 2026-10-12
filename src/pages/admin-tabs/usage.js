/* ============================================================
   ADMIN TAB — Usage (usage, #usage)
   ------------------------------------------------------------
   A placeholder. Replace render() with the real tab; nothing else in
   the console needs to change. Contract (src/pages/admin.js):

     render(ctx) -> Node        the tab's content, built synchronously.
                                The console re-renders the whole page when
                                any block's data lands, so keep your state in
                                this module and call ctx.rerender() when it
                                changes.
     badge(ctx) -> number|null  OPTIONAL: a count for the sub-nav badge.

   ctx: see the header of src/pages/admin.js.
   ============================================================ */
import { emptyState } from '../../ui/admin-kit.js';

export function render(ctx) {
  return emptyState({
    title: 'Coming in this build',
    body: "Which modules are opened, how many people come back, and which limits get hit. Counts only. Arrives with the insight build.",
    stamp: true
  });
}

export default { render };
