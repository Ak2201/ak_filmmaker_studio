/* ============================================================
   ADMIN TAB — Controls (controls, #controls)
   ------------------------------------------------------------
   A SHELL. The tab itself (roles, feature overrides, the announcement
   banner, data tools) is controls-body.js, loaded the first time this
   tab is the one on screen. Two reasons:

   - The console draws every tab at once, and this one is about 11 KB of
     code that an Overview visit never needs. admin's first-paint budget
     (scripts/budget.json) counts what a first load fetches; a dynamic
     import fires only when somebody opens Controls.
   - It reads four owner-only things. Nothing is requested until the tab
     is open, so a finance or support admin's console never even asks.

   Contract (src/pages/admin.js): render(ctx) -> Node, built synchronously.
   ============================================================ */
import { h } from '../../lib/dom.js';
import { skeleton, errorState, hashParts } from '../../ui/admin-kit.js';

let body = null;        // the loaded controls-body.js module
let loading = false;
let failed = '';
let watching = false;

const isActive = () => hashParts().tab === 'controls';

function load(ctx) {
  if (loading || body) return;
  loading = true; failed = '';
  import('./controls-body.js')
    .then((m) => { body = m; })
    .catch((e) => { failed = (e && e.message) || 'The Controls code did not load.'; })
    .finally(() => { loading = false; ctx.rerender(); });
}

export function render(ctx) {
  if (body) return body.render(ctx);
  if (failed) return errorState({ title: 'Controls could not load', why: failed, onRetry: () => { failed = ''; load(ctx); ctx.rerender(); } });
  if (isActive()) load(ctx);
  else if (!watching) {
    watching = true;
    window.addEventListener('hashchange', () => { if (!body && isActive()) ctx.rerender(); });
  }
  return h('div.ctl', { 'aria-busy': 'true' }, [skeleton({ kind: 'block', count: 1 })]);
}

export default { render };
