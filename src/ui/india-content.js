/* ============================================================
   INDIA-ONLY MATERIAL, hidden for a film made elsewhere
   ------------------------------------------------------------
   REGION-CONTENT (docs/US-MARKET-PLAN.md §E). One attribute on <html>,
   `data-no-india`, present while the open film's prefs say
   showIndiaContent is false (src/lib/region-core.js projectPrefs: the
   film's own region, or the device's market for a film that predates
   regions). india-content.css hides, under it:

     [data-india-only]          anything a module marks (the Tamil
                                preview, Tanglish help, Tamil dictation)
     [data-action="sc-tamil"]   the Screenplay Writer's Tamil typing item
     .tn / .tanglish / .lang-switch   the Tamil glosses and the reading-
                                language switch, unless the reader has
                                already chosen Tanglish (or they could
                                never switch back)

   HIDDEN, NEVER REMOVED. Every data-key and fragment target stays in the
   DOM, and switching the film back to India shows them again without a
   reload. It READS only (no storage write on load or idle, which verify
   asserts), and re-stamps on the three notices that can move the
   answer: another film opened, a film's region set, the device's
   market changed.

   NOT CORE, ON PURPOSE. It is imported by the modules that draw India-
   only material (tamil-type, alt-lines, dictation, format-guide, the
   deliverables page, the dashboard), so it costs nothing on a page
   that has none — the Library had a few hundred bytes of first paint
   to spare under scripts/budget.json on 21 Oct 2026, and the shelf is a
   device-wide reference, not a film's page.
   ============================================================ */
import '../styles/india-content.css';
import Store from '../lib/store.js';
import { currentProjectPrefs } from '../lib/region.js';

/** Stamp or clear `data-no-india` for the open film. Answers whether
 *  India-only material shows. */
export function markIndiaContent() {
  let show = true;
  try { show = currentProjectPrefs().showIndiaContent !== false; } catch (e) { /* India */ }
  try { document.documentElement.toggleAttribute('data-no-india', !show); } catch (e) { /* no DOM */ }
  return show;
}

/** True when the open film shows India-only material. */
export const indiaContentShown = () => {
  try { return currentProjectPrefs().showIndiaContent !== false; } catch (e) { return true; }
};

if (typeof document !== 'undefined') {
  markIndiaContent();
  ['current:changed', 'region:project', 'region:changed'].forEach((ev) => {
    try { Store.subscribe(ev, markIndiaContent); } catch (e) { /* older store */ }
  });
}

export default { markIndiaContent, indiaContentShown };
