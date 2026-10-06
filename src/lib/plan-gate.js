/* ============================================================
   PLAN GATE — what a plan may SEE (schema section 18, `features`)
   ------------------------------------------------------------
   The database decides what a plan may SYNC (the limit triggers) and
   this module decides what it may SHOW: which modules open, whether
   new projects can be made, whether the hub shows anything but the
   sample. The map comes from the plan's `features` — the console's
   Features matrix writes it, billing_status() carries it — and a key
   that is MISSING is allowed. Only a tick removed in the console locks
   anything, so a plan nobody has edited hides nothing.

   WHO IS GATED. A signed-in account whose plan is known. A signed-out
   visitor is not — the site gate has already decided whether they see
   the app at all, and `npm run verify` loads every page signed out —
   and a code-only visitor (gate.js's code pass) is not either: the
   code was the owner's invitation. So this is the owner's PRODUCT
   boundary for members, not a security boundary; the data boundary is
   RLS and the triggers, and a page hidden here is still a public file.

   THREE THINGS IT DOES.
     allowed(key)      the question every caller asks
     the page lock     a module page whose every module is locked gets
                       a panel over it (.pg-lock) with the plan named
                       and the way up; `main` is hidden underneath.
                       Nothing is removed from the document.
     the tab lock      a module that is a TAB of a bigger page (the
                       Library's case studies, dissection, glossary)
                       locks that tab only: its section gets the same
                       card inline and its content hidden. Locking the
                       whole Library because one shelf is off the plan
                       would hide twenty-two films nobody unticked.
     the marks         [data-module-id] elements in the shell's menus,
                       the launcher and the palette get .is-locked and
                       a PLAN flag, so a locked door looks locked
                       before it is tried.
   The hub reads sampleOnly() and allowed('new_projects') itself.

   Capabilities, beside the module ids (which come from navigation.json
   and are not repeated here):
     sample_only     the hub shows the Dragon sample project and no other
     new_projects    create / import / duplicate a project
     script_import   the Fountain / FDX / PDF importers
     ai_tools        every model-backed tool
     exports         PDF, backup and other downloads
     drive_backup    Google Drive backup
   ============================================================ */
import Store from './store.js';
import nav from '../data/navigation.json';
import { moduleGroups, shelves } from './navmodel.js';
import { h } from './dom.js';
import Billing from './billing.js';   // same chunk on every page; a dynamic import here moved nothing
import '../styles/plan-gate.css';

export const CAPABILITIES = [
  ['sample_only',   'Sample project only',    'The hub shows the Dragon sample and nothing else'],
  ['new_projects',  'New projects',           'Create, import or duplicate a project'],
  ['script_import', 'Script import',          'Fountain, FDX and PDF importers'],
  ['ai_tools',      'AI tools',               'Every model-backed tool, on the user’s own key'],
  ['exports',       'Exports',                'PDF, backup and other downloads'],
  ['drive_backup',  'Google Drive backup',    'The Drive connection on Settings']
];

let features = null;      // null = unknown / not gated; an object once a plan is known
let plan = '';
let planName = '';

/** True unless the plan says false. Missing key = allowed. */
export function allowed(key) {
  if (!features) return true;
  return features[key] !== false;
}
/** The one capability that is OFF unless the plan says true. */
export function sampleOnly() { return !!(features && features.sample_only === true); }
export function currentPlan() { return { plan, planName, features: features ? { ...features } : null, gated: !!features }; }

/** The modules of navigation.json, by stage, for the console's matrix.
 *  `page` is the file a module lives on and `siblings` the other
 *  modules on it: a page locks only when EVERY module on it is
 *  unticked (pageLocked() below), and the matrix says so per row. */
export function moduleCatalogue() {
  const pageOf = (m) => (m.href || '').split('#')[0].toLowerCase();
  /* Siblings are only ever PAGE siblings, which a shelf's tabs are not:
     each tab locks on its own (the tab lock below), so "the page locks
     when all are unticked" would be untrue of them. */
  const pageMods = nav.phases.flatMap((p) => p.modules.filter((m) => m.status !== 'planned' && m.href));
  return moduleGroups().map((p) => ({
    id: p.id, label: p.label,
    modules: p.modules.filter((m) => m.status !== 'planned').map((m) => ({
      id: m.id, label: m.label, page: pageOf(m),
      siblings: p.shelf ? [] : pageMods.filter((o) => o.id !== m.id && pageOf(o) === pageOf(m)).map((o) => o.label)
    }))
  }));
}

/* ---- learning the plan ------------------------------------------ */

let _refreshing = null;
let _again = false;
async function _refreshOnce() {
  const c = window.StudioCloud;
  const prev = JSON.stringify(features);
  try {
    if (!c || !c.isConfigured() || !c.getSession()) { features = null; plan = ''; planName = ''; }
    else {
      const st = await Billing.status();
      features = (st && st.features && typeof st.features === 'object') ? st.features : {};
      plan = (st && st.plan) || 'free';
      planName = (st && st.plan_name) || Billing.planName(plan);
    }
  } catch (e) {
    /* The table or the RPC missing (section 16/18 not run), or a
       network failure: nothing is known, so nothing is locked. */
    features = null; plan = ''; planName = '';
  }
  if (JSON.stringify(features) !== prev) Store.notify('plan:changed', currentPlan());
  apply();
}
export function refresh() {
  /* TWO TRAPS, both of which left a free member ungated for good:

     - The in-flight marker used to be cleared in a `finally` INSIDE the
       async body. Signed out, that body never awaits, so it ran to the
       end — finally included — before `_refreshing = (async …)()` was
       even assigned, and the assignment then stored a settled promise
       that nothing ever cleared. Every later refresh, the gate opening
       included, returned that stale "signed out" answer. The marker is
       cleared on the promise now, after the assignment by construction.
     - A request that lands while one is in flight is not the same
       request: the first may have read the state before the session
       was restored. It is run once more afterwards instead of being
       answered with the first one's result. */
  if (_refreshing) { _again = true; return _refreshing; }
  _refreshing = (async () => {
    do { _again = false; await _refreshOnce(); } while (_again);
  })().finally(() => { _refreshing = null; });
  return _refreshing;
}

/* ---- the page lock ---------------------------------------------- */

const file = () => (typeof location === 'undefined' ? '' : (location.pathname.split('/').pop() || 'index.html').toLowerCase().replace(/^$/, 'index.html'));
/** Every module navigation.json puts on THIS page. */
export function modulesHere() {
  const here = file().replace(/\.html$/, '');
  const out = [];
  for (const p of nav.phases) for (const m of p.modules) {
    if (!m.href) continue;
    const f = m.href.split('#')[0].toLowerCase().replace(/\.html$/, '');
    if (f === here) out.push(m);
  }
  return out;
}
/** Locked when the page has modules and none of them is allowed. */
export function pageLocked() {
  const ms = modulesHere();
  return ms.length > 0 && ms.every((m) => !allowed(m.id));
}

/** The card that says why — shared by the page lock and the tab lock. */
function lockCard(names) {
  return h('div.pg-lock-card', {}, [
    h('p.bd-eyebrow', { text: 'Your plan' }),
    h('h2.pg-lock-h', { text: 'Not on the ' + (planName || 'current') + ' plan.' }),
    h('p.pg-lock-p', { text: (names ? names + ' is' : 'This part of the studio is') + ' part of a higher tier. Everything you have written here is still saved on this device; it reappears the moment the plan includes it.' }),
    h('div.pg-lock-actions', {}, [
      h('a.btn.primary', { href: 'settings.html#plan', text: 'SEE PLANS' }),
      h('a.btn', { href: 'index.html', text: 'BACK TO THE STUDIO' })
    ])
  ]);
}

function lockPanel() {
  const names = modulesHere().map((m) => m.label).join(' · ');
  return h('div.pg-lock', { role: 'region', 'aria-label': 'Not on your plan' }, [lockCard(names)]);
}

/** Shelf modules whose tab is on THIS page and in the document. */
function tabsHere() {
  const here = file().replace(/\.html$/, '');
  const out = [];
  for (const s of shelves()) for (const m of s.modules) {
    const [f, frag] = (m.href || '').split('#');
    if (!frag || f.toLowerCase().replace(/\.html$/, '') !== here) continue;
    const sec = document.getElementById(frag);
    if (sec) out.push({ m, sec });
  }
  return out;
}

/* THE TAB LOCK. The section keeps its id and its place in
   the tab strip; everything in it is hidden under the card
   (plan-gate.css) and comes back untouched when the plan changes.
   Exported because the library renders its tabs after this module has
   run, and calls it once they exist. */
export function lockTabs() {
  if (typeof document === 'undefined') return;
  for (const { m, sec } of tabsHere()) {
    const locked = !allowed(m.id);
    let card = sec.querySelector(':scope > .pg-lock-inline');
    sec.toggleAttribute('data-tab-lock', locked);
    if (locked && !card) {
      card = h('div.pg-lock-inline', { role: 'region', 'aria-label': 'Not on your plan' }, [lockCard(m.label)]);
      sec.prepend(card);
    }
    if (!locked && card) card.remove();
  }
}

function apply() {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const existing = document.querySelector('.pg-lock');
  if (pageLocked()) {
    root.dataset.planLock = '1';
    if (!existing) document.body.append(lockPanel());
  } else {
    delete root.dataset.planLock;
    if (existing) existing.remove();
  }
  lockTabs();
  markLocked();
}

/* ---- the marks ---------------------------------------------------- */
export function markLocked(scope) {
  if (typeof document === 'undefined') return;
  (scope || document).querySelectorAll('[data-module-id]').forEach((el) => {
    const locked = !allowed(el.dataset.moduleId);
    el.classList.toggle('is-locked', locked);
    let flag = el.querySelector(':scope > .pg-flag');
    if (locked && !flag) el.append(h('span.pg-flag', { text: 'PLAN', title: 'Not on your plan' }));
    if (!locked && flag) flag.remove();
  });
}

/* ---- wiring ------------------------------------------------------- */
if (typeof window !== 'undefined') {
  Store.subscribe('gate:changed', () => { refresh(); });
  Store.subscribe('billing:changed', () => { refresh(); });
  const hook = setInterval(() => {
    const c = window.StudioCloud;
    if (!c) return;
    clearInterval(hook);
    if (c.onAuth) c.onAuth(() => setTimeout(refresh, 0));
    refresh();
  }, 50);
  setTimeout(() => clearInterval(hook), 20000);
}

export default { allowed, sampleOnly, currentPlan, refresh, moduleCatalogue, modulesHere, pageLocked, lockTabs, markLocked, CAPABILITIES };
