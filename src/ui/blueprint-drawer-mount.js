/* ============================================================
   THE GUIDE DRAWER'S LIGHT HALF — decide, from the sidecar alone,
   whether this page needs the drawer at all; fetch it only then
   ------------------------------------------------------------
   chrome.js used to import src/ui/blueprint-drawer.js directly, and
   that module imports both blueprints' step JSON (steps.feature,
   steps.production, steps.short — about 170 KB raw) plus the step
   renderer, to work out whether a "Blueprint step N" pill belongs on
   the page. Every one of the module pages therefore downloaded both
   blueprints on first paint, settings.html and admin.html included,
   to draw a pill most of them never show.

   The question "does ANY blueprint step land on this page" needs
   none of that. The sidecar (src/data/steps.stages.json) holds each
   step's `tools`, and src/lib/navmodel.js resolves a tool to an href
   from navigation.json — 9 KB that is on every page anyway. So this
   module answers the question from those two, and only when the
   answer is yes does it `import()` the drawer, which then mounts
   exactly as it always did (its own last line calls
   mountBlueprintDrawer()). A page with no step pointing at it never
   requests the chunk.

   The answer here may say yes where the drawer then says no — a
   sidecar entry whose id is not a step in the blueprint JSON (an
   interlude section with tools, say). That costs one fetch on that
   page and nothing else: the drawer still decides, by its own rules,
   and mounts nothing. It can never say no where the drawer would say
   yes, because the drawer reads tools from the same sidecar through
   the same resolver.

   The two blueprint pages are excluded here as they are there: the
   drawer is a module page's view INTO a blueprint, and the blueprint
   has the steps on it.
   ============================================================ */
import nav from '../data/navigation.json';
import STAGES from '../data/steps.stages.json';
import { allModules } from '../lib/navmodel.js';

function pageName() {
  try {
    const last = (location.pathname.split('/').pop() || '').toLowerCase();
    if (!last) return 'index.html';
    return last.endsWith('.html') ? last : last + '.html';
  } catch (e) { return ''; }
}

/* The file half of a tool's href — the same resolution step-stages.js's
   resolveTool() performs, minus the labels nobody needs to answer
   "which page". A tool is a module id, or `{ href }` with optional
   `module` / `place` for its label. An unresolved id is skipped
   silently here; step-stages.js warns once when it draws the row. */
function toolFile(entry, mods) {
  let href = '';
  if (typeof entry === 'string') {
    const m = mods.find((x) => x.id === entry);
    href = m && m.href ? m.href : '';
  } else if (entry && typeof entry === 'object' && entry.href) {
    if (entry.module && !mods.some((x) => x.id === entry.module)) return '';
    if (entry.place && !(nav.global || []).some((x) => x.href === entry.place)) return '';
    href = entry.href;
  }
  return String(href).split('#')[0].toLowerCase();
}

/** Does any sidecar entry's tool land on `page`? Reads the sidecar and
 *  navigation.json; touches no DOM and no storage. */
export function stepsMayLandOn(page) {
  if (!page || page === 'feature.html' || page === 'short.html') return false;
  /* The five stage pages carry the questions in their own Guide
     section (src/ui/stage-guide.js); a drawer there would show the
     same steps twice. */
  if (GUIDE_PAGES.has(page)) return false;
  const steps = (STAGES && STAGES.steps) || {};
  const mods = allModules();
  for (const raw of Object.values(steps)) {
    const tools = Array.isArray(raw.tools) ? raw.tools : raw.tools == null ? [] : [raw.tools];
    for (const t of tools) if (toolFile(t, mods) === page) return true;
  }
  return false;
}

const GUIDE_PAGES = new Set(['story.html', 'write.html', 'breakdown.html', 'shoot.html', 'edit.html']);

let loading = null;
/** Fetch and mount the drawer once; a no-op where no step lands. */
export function mountBlueprintDrawerIfNeeded(page = pageName()) {
  if (loading) return loading;
  if (!stepsMayLandOn(page)) return Promise.resolve(null);
  loading = import('./blueprint-drawer.js').catch((e) => {
    console.warn('[blueprint-drawer] could not load', e);
    return null;
  });
  return loading;
}

if (typeof document !== 'undefined') mountBlueprintDrawerIfNeeded();

export default { stepsMayLandOn, mountBlueprintDrawerIfNeeded };
