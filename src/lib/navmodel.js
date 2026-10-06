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

   Callers that mean "a stage" keep reading `nav.phases`. Callers that
   mean "every module" — the console's Features matrix, the palette,
   the hub's map and its counts — read moduleGroups() here, so the two
   lists are joined in one place instead of in each of them.
   ============================================================ */
import nav from '../data/navigation.json';

/** The global destinations that hold modules (the Library, the Blueprints),
 *  shaped like a phase so a renderer can take either. `shelf: true`
 *  tells them apart; a shelf's hue is a CATEGORY hue (`.hue-*`), not
 *  a phase one (`.sh-ph-*`) — see the hue-class trap in CLAUDE.md. */
export function shelves() {
  return nav.global
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
  const groups = [...nav.phases, ...shelves().filter((s) => s.projectPages)];
  return new Set(groups.flatMap((g) => (g.modules || []).map((m) => String(m.href || '').split('#')[0].toLowerCase()))
    .filter(Boolean));
}

/** The blueprint stops on one page — `[{ phase, index, guide, frag }]`
 *  in stage order — read from each stage's `guide` list. `file` is a
 *  bare filename such as 'feature.html'. */
export function guideStops(file) {
  const f = String(file || '').toLowerCase();
  const out = [];
  nav.phases.forEach((phase, index) => {
    for (const g of phase.guide || []) {
      const [gf, frag] = String(g.href || '').split('#');
      if (gf.toLowerCase() === f && frag) out.push({ phase, index, guide: g, frag });
    }
  });
  return out;
}

/** The five stages, then the shelves. */
export function moduleGroups() {
  return [...nav.phases, ...shelves()];
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

export default { shelves, moduleGroups, allModules, hueClassOf, projectPageFiles, guideStops };
