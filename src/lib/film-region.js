/* ============================================================
   FILM REGION — the open film's region, for the pages that show or
   hide India-only material and the two controls that set it
   ------------------------------------------------------------
   REGION-CONTENT (docs/US-MARKET-PLAN.md §A3, §E).

   WHY THIS IS NOT region.js currentProjectPrefs() / setProjectRegion().
   Those are the contract's calls, and they are right; they are also in
   the two chunks EVERY page loads. region.js rides in `studio` (CORE:
   navmodel.js imports it) and region-core.js is forced into `startlib`
   (vite.config.js), so the first call to either from ANY page adds
   their bodies to every page's first paint. Measured on 22 Oct 2026:
   about 930 bytes, against a Library that had about 550 to spare under
   scripts/budget.json. This file is imported only by the pages and
   modules that need it (settings, dashboard, deliverables, and
   src/ui/india-content.js), so it costs nothing anywhere else.

   It answers only what those surfaces need — the film's own region,
   whether it set one, and whether India-only material shows — by the
   same rule as region-core.js projectPrefs(): a film with a region
   decides for itself; a film without one keeps following the DEVICE's
   market (region.js region(), already in CORE). `npm run
   test:region-content` asserts showIndia() against projectPrefs() and
   setFilmRegion() against setProjectRegion()'s source shape. The day
   a CORE caller of currentProjectPrefs() lands anyway (PAPERWORK's
   pdf.js does), delete this file and import region.js.

   The writer runs on a click only, never on load (verify's idle-write
   check), and writes the `region` field on the project's ENTRY in
   fms_studio_projects_v1 — no new key, no data-key.
   ============================================================ */
import Store from './store.js';
import { region } from './region.js';

const own = (v) => (v === 'IN' || v === 'INT' ? v : '');

/** Pure: does a film with this entry show India-only material, on a
 *  device whose market is `deviceRegion`? region-core projectPrefs()'s
 *  showIndiaContent, restated. */
export function showIndia(entry, deviceRegion) {
  const r = own(entry && entry.region);
  return r ? r === 'IN' : deviceRegion !== 'INT';
}

/** { region: 'IN'|'INT'|'', explicit, showIndiaContent } for the open
 *  (or named) film. With no film open, the device decides. */
export function filmRegion(id) {
  const entry = id ? Store.getProject(id) : Store.currentProject();
  const r = own(entry && entry.region);
  let device = 'IN';
  try { device = region(); } catch (e) { /* India */ }
  return { region: r, explicit: !!r, showIndiaContent: entry ? showIndia(entry, device) : device !== 'INT' };
}

/** region.js setProjectRegion(), restated: 'IN' | 'INT', or '' to
 *  remove the field. Answers the updated entry, or null. Notifies
 *  `region:project` {id, region} when it moved. A click only. */
export function setFilmRegion(r, id) {
  const pid = id || Store.currentProjectId();
  if (!pid) return null;
  const want = own(String(r || '').trim().toUpperCase());
  if (r && !want) return null;
  const before = Store.getProject(pid);
  if (!before) return null;
  if ((before.region || '') === want) return before;
  const after = Store.updateProject(pid, { region: want || undefined });
  if (after) Store.notify('region:project', { id: pid, region: want });
  return after;
}
