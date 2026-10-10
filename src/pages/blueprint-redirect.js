/* ============================================================
   BLUEPRINT REDIRECT — feature.html / short.html -> the stage guide
   ------------------------------------------------------------
   NOT IMPORTED ANYWHERE YET. At switch-over, feature.js and short.js
   import this FIRST (before any render) and call enableRedirect().
   Until something calls it the flag below is off and importing this
   module does nothing at all — so merging it is safe.

   Reads the old URL's hash (#step-NN, a cover id, #glossary), maps it
   with blueprint-route.js and location.replace()s, so the Back button
   does not return to a page that bounces. `?stay=1` exempts: the old
   full page stays reachable for widget fallbacks. Touches no storage:
   the page the visitor left already says feature or short, and the
   stage guide reads the project's own format.

   Returns true when it navigated, so the caller can skip rendering.
   ============================================================ */
import { routeForAnchor } from '../lib/blueprint-route.js';

if (typeof window !== 'undefined' && window.__FMS_BLUEPRINT_REDIRECT__ === undefined) {
  window.__FMS_BLUEPRINT_REDIRECT__ = false;
}

export function redirectIfBlueprint(loc = typeof location === 'undefined' ? null : location) {
  if (!loc || typeof window === 'undefined' || !window.__FMS_BLUEPRINT_REDIRECT__) return false;
  if (/(^|[?&])stay=1(&|$)/.test(loc.search || '')) return false;
  const to = routeForAnchor(loc.pathname, loc.hash);
  if (!to) return false;
  loc.replace(to);
  return true;
}

/** Turn the redirect on and apply it now. */
export function enableRedirect() {
  if (typeof window !== 'undefined') window.__FMS_BLUEPRINT_REDIRECT__ = true;
  return redirectIfBlueprint();
}
