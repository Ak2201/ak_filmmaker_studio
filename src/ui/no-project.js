/* ============================================================
   NO PROJECT OPEN — the banner, on every page that writes a film
   ------------------------------------------------------------
   With no project open, every scoped write lands in the holding slot
   (store.js, "UNFILED WORK"). That work is real and is adopted into
   the next project created from the hub, but a page that shows SAVED
   and says nothing else leaves the writer believing it belongs to a
   film. The banner says where it actually is.

   WHICH PAGES: the ones a STAGE module lives on, read from
   navigation.json — `phases[].modules[].href`, fragment dropped. That
   is story, both blueprints, write, breakdown, stripboard, reports,
   visualize, budget, contacts, plan, shoot, edit and deliverables
   today, and a module added to a stage tomorrow gets the banner with
   no edit here. The hub, settings, admin, the Library and its shelves
   are app-scope places and are left alone: none of them is where a
   film is written, and the hub is where the project gets created.

   Imported once, from chrome.js, which every reachable app page loads.
   The builder itself is store.js's, shared with wireBlueprintHeader()
   on the two blueprints, so there is one sentence and one element id.
   ============================================================ */
import Store from '../lib/store.js';
import nav from '../data/navigation.json';

const PROJECT_PAGES = new Set(
  (nav.phases || []).flatMap((p) => (p.modules || []).map((m) => String(m.href || '').split('#')[0]))
    .filter(Boolean)
);

function pageName() {
  try {
    const last = (location.pathname.split('/').pop() || '').toLowerCase();
    if (!last) return 'index.html';
    // cleanUrls hosts serve /contacts for contacts.html
    return last.endsWith('.html') ? last : last + '.html';
  } catch (e) { return ''; }
}

export function isProjectPage(name = pageName()) {
  return PROJECT_PAGES.has(name);
}

if (typeof document !== 'undefined' && isProjectPage()) {
  Store.watchNoProjectBanner();
}

export default { isProjectPage };
