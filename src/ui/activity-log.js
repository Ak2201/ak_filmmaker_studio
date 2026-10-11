/* ============================================================
   ACTIVITY LOG — the timeline of recent edits, drawn into any host.
   Moved out of the hub on 11 Oct 2026 (owner: "activity log can be in
   settings, not home"). The hub still WRITES entries (logActivity /
   detectActivity in hub.js); this module only reads and renders, and
   its one write is the explicit "Clear log" button. Drawing the list
   never touches storage.
   ============================================================ */
import { h } from '../lib/dom.js';
import { ask } from './dialog.js';
import { parseStorage, relTime, FEATURE_URL, SHORT_URL, LIBRARY_URL } from '../pages/hub/util.js';
import { ACTIVITY_KEY } from '../pages/hub/all-keys.js';

const WHERE_CLASS = { feat: 'feat', short: 'short', lib: 'lib' };
const WHERE_LABEL = { feat: 'FEATURE', short: 'SHORT', lib: 'LIBRARY' };
const RENAMED = {
  'arunak-filmmaker-blueprint.html': FEATURE_URL,
  'arunak-shortfilm-blueprint.html': SHORT_URL,
  'arunak-filmmaker-library.html':   LIBRARY_URL
};

/** Old rows point at the legacy files; bare fragments belong to the hub. */
function rewriteUrl(url) {
  if (!url) return url;
  if (url.startsWith('#')) return 'index.html' + url;
  for (const [oldName, newName] of Object.entries(RENAMED)) {
    if (url.startsWith(oldName)) return newName + url.slice(oldName.length);
  }
  return url;
}

export function activityEntries() {
  const log = parseStorage(ACTIVITY_KEY);
  return Array.isArray(log.entries) ? log.entries : [];
}

/** Draw the log into `host` (replaces its children). Returns the entry count. */
export function renderActivityLog(host) {
  const arr = activityEntries();
  host.textContent = '';
  const count = h('div.al-count', { id: 'activityCount', text: arr.length + ' ENTR' + (arr.length === 1 ? 'Y' : 'IES') });
  const list = h('div.activity-list', { id: 'activityList' });
  if (!arr.length) {
    list.append(h('div.activity-empty', {
      text: 'No activity yet. Start a film and begin filling things in. Activity updates whenever you save.'
    }));
  }
  arr.forEach((e) => {
    const inner = [
      h('span.when', { text: relTime(e.ts) }),
      h('span', { class: 'where ' + (WHERE_CLASS[e.where] || 'studio'), text: WHERE_LABEL[e.where] || 'STUDIO' }),
      h('span.what', { text: e.what })
    ];
    const url = rewriteUrl(e.url);
    list.append(h('div.activity-row', {}, url ? [h('a', { href: url }, inner)] : inner));
  });
  const refresh = h('button.mini-btn', { type: 'button', text: '↻ REFRESH' });
  const clear = h('button.mini-btn.danger', { type: 'button', text: 'CLEAR LOG' });
  refresh.addEventListener('click', () => renderActivityLog(host));
  clear.addEventListener('click', async () => {
    const ok = await ask({
      title: 'Clear the activity log?',
      body: 'Your blueprint data is not affected.',
      confirm: 'CLEAR LOG', danger: true
    });
    if (!ok) return;
    const log = parseStorage(ACTIVITY_KEY);
    log.entries = [];
    try { localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log)); } catch (err) { /* blocked storage */ }
    renderActivityLog(host);
  });
  host.append(count, list, h('div.activity-actions', {}, [refresh, clear]));
  return arr.length;
}

export default { renderActivityLog, activityEntries };
