/* ============================================================
   ADMIN TAB — Support (support, #support)
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
    body: "A manual queue: refund requests, invite requests and tickets an admin logs by hand. Arrives with the operate build.",
    stamp: true
  });
}

export default { render };
