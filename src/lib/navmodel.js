/* ============================================================
   NAV MODEL — every module on the map, wherever it hangs
   ------------------------------------------------------------
   navigation.json has two lists. `phases` are the five stages of a
   film, each with its modules. `global` are the app-scope places in
   the rail — and since 6 Oct 2026 TWO of them carry modules of their
   own. The Library: Case Studies, Dissection and the Craft Glossary
   are tabs of library.html (owner's ask: the reference tools belong
   with the reference library, not in the Story stage). And the
   Blueprints: the feature and short blueprints walk all five stages,
   so filing them inside Story put "Phase 02 Pre-Production" inside a
   stage (docs/BLUEPRINT-REALIGN-PLAN.md). Each stage now carries a
   `guide` list pointing at the blueprint part that covers it.

   A module's id did not change when it moved. Plans key their
   features by module id (schema section 18, src/lib/plan-gate.js), so
   a renamed id would have silently re-ticked a module somebody had
   unticked in the console.

   Callers that mean "a stage" read phases() here and callers that
   mean "every module" read moduleGroups(), so the two lists are
   joined in one place instead of in each of them.

   REGION (9 Oct 2026). A module may carry `"region": "IN"`, and in
   International mode it is not on the map: not in the launcher, not
   in the shell's menus, not in the palette, not in the console's
   Features matrix, and not counted. The filter lives HERE and
   nowhere else, which is the same rule the hue classes and the step
   list follow — a second copy of "which modules exist" is a copy
   that is wrong by the next change. Every caller that iterated
   `nav.phases` or `nav.global` directly now calls phases() or
   globals() for exactly that reason.

   A STAGE IS NOT REGION-TAGGABLE, deliberately. The five stages are
   the shape of making a film and that shape is the same everywhere;
   a tag on one would leave a hole in the rail and a phase menu with
   nothing in it. A SHELF may be tagged, because a shelf is a
   collection and a collection can be empty of things that apply here.

   WHAT IS NOT TAGGED TODAY, and it matters that this is said out
   loud rather than discovered: NOTHING. No module in navigation.json
   is India-only. The India-specific material is finer-grained than a
   module — the certification tab of deliverables.html (CBFC, and the
   COTPA and AWBI rules inside src/data/cbfc-rules.json), the three
   Indian OTT delivery templates in deliverables.json, the Chennai
   rate card, the FEFSI bata figures and the Indian festival list.
   Tagging a whole module would hide a page people need to hide a
   tab they do not. The plumbing is here and live so that when one of
   those grows an id of its own, tagging it is one field in the JSON.
   ============================================================ */
import nav from '../data/navigation.json';
import { region } from './region.js';

/** Does this entry belong on the map in the region in force? An entry
 *  with no `region` belongs everywhere, which is why tagging nothing
 *  changes nothing. */
export function inRegion(entry, r) {
  const want = entry && entry.region;
  if (!want) return true;
  return String(want).toUpperCase() === (r || region());
}

/** The five stages, with their region-hidden modules removed. Every
 *  caller that means "the stages" reads this rather than nav.phases. */
export function phases() {
  const r = region();
  return nav.phases.map((p) => ({ ...p, modules: (p.modules || []).filter((m) => inRegion(m, r)) }));
}

/** The rail's app-scope destinations, likewise filtered — both the
 *  destination itself and any modules it carries. */
export function globals() {
  const r = region();
  return nav.global
    .filter((g) => inRegion(g, r))
    .map((g) => (Array.isArray(g.modules) ? { ...g, modules: g.modules.filter((m) => inRegion(m, r)) } : g));
}

/** The global destinations that hold modules (the Library, the Blueprints),
 *  shaped like a phase so a renderer can take either. `shelf: true`
 *  tells them apart; a shelf's hue is a CATEGORY hue (`.hue-*`), not
 *  a phase one (`.sh-ph-*`) — see the hue-class trap in CLAUDE.md. */
export function shelves() {
  return globals()
    .filter((g) => Array.isArray(g.modules) && g.modules.length)
    .map((g) => ({
      id: g.id, label: g.label, blurb: g.blurb || g.purpose, hue: g.hue,
      icon: g.icon, sym: g.sym, href: g.href, modules: g.modules, shelf: true,
      projectPages: !!g.projectPages
    }));
}

/** The page files (no fragment) a film is written on: every stage
 *  module's, plus those of a shelf marked `projectPages` (the
 *  blueprints). src/ui/no-project.js reads this. */
export function projectPageFiles() {
  const groups = [...phases(), ...shelves().filter((s) => s.projectPages)];
  return new Set(groups.flatMap((g) => (g.modules || []).map((m) => String(m.href || '').split('#')[0].toLowerCase()))
    .filter(Boolean));
}

/** The blueprint stops on one page — `[{ phase, index, guide, frag }]`
 *  in stage order — read from each stage's `guide` list. `file` is a
 *  bare filename such as 'feature.html'. */
export function guideStops(file) {
  const f = String(file || '').toLowerCase();
  const out = [];
  phases().forEach((phase, index) => {
    for (const g of phase.guide || []) {
      const [gf, frag] = String(g.href || '').split('#');
      if (gf.toLowerCase() === f && frag) out.push({ phase, index, guide: g, frag });
    }
  });
  return out;
}

/** The five stages, then the shelves. Region-filtered, like both. */
export function moduleGroups() {
  return [...phases(), ...shelves()];
}

/** Every module, in map order. */
export function allModules() {
  return moduleGroups().flatMap((g) => g.modules);
}

/** The class that sets --hue for a group: `.sh-ph-<id>` for a stage,
 *  `.hue-<hue>` for a shelf. A wrong family fails silently by design. */
export function hueClassOf(group) {
  if (!group) return '';
  if (group.shelf) return group.hue ? 'hue-' + group.hue : '';
  return 'sh-ph-' + group.hue;
}

/** The first module a visitor can open in a stage: built, with an
 *  href. The stage's menu, the rail's stage link and the hub's doors
 *  all start there, so there is one answer. */
export function firstModuleOf(phase) {
  return ((phase && phase.modules) || []).find((m) => m.status === 'built' && m.href) || null;
}

/** The hub's three doors (`jobs` in navigation.json): each resolved to
 *  the stages it names, the first stage's first built module (its
 *  href is the door's), and that stage's hue class. A job whose stages
 *  are all unknown or empty is dropped rather than drawn as a door to
 *  nowhere. */
export function jobs() {
  const byId = Object.fromEntries(phases().map((p) => [p.id, p]));
  return (nav.jobs || []).map((j) => {
    const stages = (j.stages || []).map((id) => byId[id]).filter(Boolean);
    const lead = stages.map(firstModuleOf).find(Boolean);
    if (!lead) return null;
    const first = stages.find((p) => firstModuleOf(p) === lead);
    return { id: j.id, label: j.label, line: j.line || '', stages, href: lead.href, module: lead, hueClass: hueClassOf(first) };
  }).filter(Boolean);
}

export default { phases, globals, inRegion, shelves, moduleGroups, allModules, hueClassOf, projectPageFiles, guideStops, firstModuleOf, jobs };
