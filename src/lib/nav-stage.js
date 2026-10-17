/* ============================================================
   NAV STAGE — a page's ONE home stage, and a stage's ONE lead
   ------------------------------------------------------------
   Owner, 17 Oct 2026: "the UI changes depending on which page I
   navigated from — I want my UI to be the same when it is opened from
   any page." It did, because the shell coloured a page from the hash
   it was ENTERED by: contacts.html#call-sheets wore Production,
   contacts.html wore Pre-Production, and Reports' DPR tab wore no
   stage at all. Two rules end that, and both live here so that the
   shell, the dashboard, the hub's doors and the Node tests ask one
   function rather than four copies:

   1. homeStage(file) — a page has ONE stage: the phase that owns the
      FIRST module (navigation.json order) whose href is this file.
      A stage's own landing page (STAGE_PAGES) and a retired page kept
      behind ?stay=1 (STAY_PAGES) say theirs declaratively. Everything
      else — the hub, the dashboard, the Library, Settings, the
      console, the blueprints — has none (null). It decides the
      accent (<html data-phase>), the lit rail stage and the crumb's
      stage segment, whichever tab is open; only the crumb's LAST
      segment follows the tab. Each root .html carries the same value
      statically, so the first paint with scripts off already matches
      (scripts/test-home-stage.mjs asserts the two agree).

   2. stageLead(phase, gate) — a stage's link is its FIRST module that
      is built (not planned), has an href, is not switched off for
      every plan, and is allowed for this member; failing allowed(),
      the first that is merely not off; else null. The rail icon, the
      crumb's stage button, the dashboard's stage cards and the hub's
      doors all use it. allowed() fails OPEN, so signed out this is
      the first built module.

   PURE: no import but the map itself, so journey.js (read by Node
   tests) can use it and navmodel.js re-exports it. The plan gate is
   passed in, or read from `window.StudioPlan` (plan-gate.js sets it),
   never imported — plan-gate pulls in the store and billing.

   It reads navigation.json RAW, without navmodel's region filter, on
   purpose: a static attribute in an .html file cannot depend on the
   visitor's region, and no module is region-tagged today (navmodel's
   header says so). If one ever is, a page's home stage still must not
   change with the region, or the scripts-off paint would disagree.
   ============================================================ */
import nav from '../data/navigation.json';

/** Retired pages that stay reachable behind `?stay=1` (write-route.js,
 *  blueprint-route.js). They are in no module's href, so without this
 *  the crumb is a bare "Studio" and no stage is lit. `frags` names the
 *  sections kept (label = the crumb's last segment, also the tab
 *  label); `stage` is the stage the page belongs to; `back` is the
 *  page the persistent back link returns to. Declarative: shell.js and
 *  tabs.js read this and name no page. */
export const STAY_PAGES = {
  'write.html': {
    stage: 'screenplay', back: 'screenplay.html', backLabel: 'Back to the Screenplay Writer',
    frags: { coverage: 'AI coverage', generate: 'Write from a synopsis' },
    label: 'Screenplay tools'
  },
  'feature.html': { stage: '', label: 'Feature blueprint', frags: {} },
  'short.html': { stage: '', label: 'Short film blueprint', frags: {} }
};

/** A stage's own landing page — not a module, so it has no plan feature and
 *  no usage counter, but it still belongs to its stage: the crumb reads
 *  "Pre-Production › Path" and the stage tab is lit. Declarative, like
 *  STAY_PAGES; shell.js reads it and names no page. */
export const STAGE_PAGES = {
  'preprod.html': { stage: 'preprod', label: 'Path' }
};

const fileOf = (href) => String(href || '').split('#')[0].split('?')[0].toLowerCase();

/** The id of the stage a page belongs to, or null. `file` is a bare
 *  filename such as 'contacts.html' (pageFile() of the pathname). */
export function homeStage(file, map = nav) {
  const f = fileOf(file);
  if (!f) return null;
  const decl = STAGE_PAGES[f] || STAY_PAGES[f];
  if (decl) return decl.stage || null;
  for (const p of map.phases || []) {
    if (p.home && fileOf(p.home.href) === f) return p.id;
    for (const m of p.modules || []) if (m && m.href && fileOf(m.href) === f) return p.id;
  }
  return null;
}

/** The plan gate as `{ isOff(id), allowed(id) }`, from window.StudioPlan
 *  when nothing is passed. Every question fails toward "on". */
function gateOf(gate) {
  if (gate) return gate;
  const g = typeof window !== 'undefined' ? window.StudioPlan : null;
  return {
    isOff: (id) => { try { return !!(g && typeof g.isDisabledEverywhere === 'function' && g.isDisabledEverywhere(id)); } catch (e) { return false; } },
    allowed: (id) => { try { return !(g && typeof g.allowed === 'function') || g.allowed(id) !== false; } catch (e) { return true; } }
  };
}

const live = (m) => !!(m && m.status === 'built' && m.href);   // 'planned' is not built

/** The module a stage's link opens (see rule 2 above). A stage with a
 *  `home` (its own landing page) leads with that. Null when every
 *  module is planned or off for everybody. */
export function stageLead(phase, gate) {
  if (!phase) return null;
  if (phase.home && phase.home.href) return { id: phase.id + '-home', status: 'built', ...phase.home };
  const g = gateOf(gate);
  const on = (phase.modules || []).filter((m) => live(m) && !g.isOff(m.id));
  return on.find((m) => g.allowed(m.id)) || on[0] || null;
}

/** True when a stage has modules somebody could open but none of them on
 *  this member's plan — the dashboard skips such a stage when it
 *  suggests what is next. Unknown is NOT locked (allowed fails open). */
export function stageAllLocked(phase, gate) {
  if (!phase || (phase.home && phase.home.href)) return false;
  const g = gateOf(gate);
  const on = (phase.modules || []).filter((m) => live(m) && !g.isOff(m.id));
  return on.length > 0 && !on.some((m) => g.allowed(m.id));
}

export default { homeStage, stageLead, stageAllLocked, STAY_PAGES, STAGE_PAGES };
