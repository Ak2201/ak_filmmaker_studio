/* ============================================================
   NAV MODEL — every module on the map, wherever it hangs
   ------------------------------------------------------------
   navigation.json has two lists. `phases` are the five stages of a
   film, each with its modules. `global` are the app-scope places in
   the rail — and since 6 Oct 2026 ONE of them, the Library, carries
   modules of its own: Case Studies, Dissection and the Craft
   Glossary are tabs of library.html (owner's ask: the reference tools
   belong with the reference library, not in the Story stage).

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

/** The global destinations that hold modules (today: the Library),
 *  shaped like a phase so a renderer can take either. `shelf: true`
 *  tells them apart; a shelf's hue is a CATEGORY hue (`.hue-*`), not
 *  a phase one (`.sh-ph-*`) — see the hue-class trap in CLAUDE.md. */
export function shelves() {
  return nav.global
    .filter((g) => Array.isArray(g.modules) && g.modules.length)
    .map((g) => ({
      id: g.id, label: g.label, blurb: g.blurb || g.purpose, hue: g.hue,
      icon: g.icon, sym: g.sym, href: g.href, modules: g.modules, shelf: true
    }));
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

export default { shelves, moduleGroups, allModules, hueClassOf };
