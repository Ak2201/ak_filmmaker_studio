/* ============================================================
   WHAT'S NEW — the released changes, in a drawer
   ------------------------------------------------------------
   The entries are src/data/changelog.json (content in JSON, invariant
   2); this draws them in the kit's sheet (src/ui/kit/sheet.js: the one
   overlay, header, close button, focus trap, Escape and backdrop the
   phone's Go to / Tools sheets use — a bottom drawer on a phone,
   centred at a reading width from 720px). No second overlay.

   "Seen" lives in the EXISTING device prefs blob fms_studio_prefs_v1,
   as `whatsNewSeen`: the id of the newest entry the reader has opened.
   No new key. It is written ONLY when the drawer is opened (a click),
   never on load — verify's four idle seconds assert that. unseen() is
   a read, so the dashboard's button can say "New" without writing.

   Imported by dashboard.js only; the JSON is small and rides with it.
   ============================================================ */
import { h } from '../lib/dom.js';
import { sheet } from './kit/index.js';
import { readDevicePrefs, updateDevicePrefs } from '../lib/chrome-prefs.js';
import data from '../data/changelog.json';
import '../styles/changelog.css';

const ENTRIES = (data.entries || []).filter((e) => e && e.id && e.title);
const latest = () => (ENTRIES[0] ? ENTRIES[0].id : '');

/** True when there is an entry newer than the last one opened here. */
export function unseen() {
  const id = latest();
  if (!id) return false;
  let seen = '';
  try { seen = String(readDevicePrefs().whatsNewSeen || ''); } catch (e) { seen = ''; }
  return seen !== id;
}

const fmt = (iso) => {
  const d = new Date(iso + 'T12:00:00');
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : iso;
};

function body() {
  const wrap = h('div.cl-body');
  const ol = h('ol.cl-list');
  for (const e of ENTRIES) {
    ol.append(h('li.cl-entry', {}, [
      h('p.cl-date', {}, [h('time', { datetime: e.date, text: fmt(e.date) })]),
      h('h3.cl-title', { text: e.title }),
      h('ul.cl-items', {}, (e.items || []).map((t) => h('li', { text: t })))
    ]));
  }
  wrap.append(ol);
  return wrap;
}

/** Open the drawer and mark the newest entry seen (a click, so a write). */
export function openChangelog(returnTo) {
  const id = latest();
  if (id) { try { updateDevicePrefs({ whatsNewSeen: id }); } catch (e) { /* private mode: it simply shows New again */ } }
  return sheet({ title: 'What’s new', body: body(), kind: 'changelog', returnTo });
}

export default { openChangelog, unseen };
