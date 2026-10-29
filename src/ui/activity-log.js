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
import { relTime } from '../pages/hub/util.js';
/* The log's key, its reading and its one write ("Clear log"), and where an
   old row links to, are src/lib/hub-activity.js. */
import { activityEntries, clearActivityLog, activityHref as rewriteUrl } from '../lib/hub-activity.js';

const WHERE_CLASS = { feat: 'feat', short: 'short', lib: 'lib' };
const WHERE_LABEL = { feat: 'FEATURE', short: 'SHORT', lib: 'LIBRARY' };

export { activityEntries };

/** Draw the log into `host` (replaces its children). Returns the entry count. */
export function renderActivityLog(host) {
  const arr = activityEntries();
  host.textContent = '';
  const count = h('div.al-count', { id: 'activityCount', text: arr.length + ' ENTR' + (arr.length === 1 ? 'Y' : 'IES') });
  const list = h('div.activity-list', { id: 'activityList' });
  if (!arr.length) {
    list.append(h('div.activity-empty', {
      text: 'Nothing saved in this browser yet. Edits you save show up here.'
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
  const clear = h('button.mini-btn.danger', { type: 'button', text: 'Clear log' });
  /* Nothing to clear is not an action: an empty log's CLEAR LOG stays
     visible (the row keeps its shape) but cannot be pressed. */
  clear.disabled = !arr.length;
  refresh.addEventListener('click', () => renderActivityLog(host));
  clear.addEventListener('click', async () => {
    const ok = await ask({
      title: 'Clear the activity log?',
      body: 'Your blueprint data is not affected.',
      confirm: 'Clear log', danger: true
    });
    if (!ok) return;
    clearActivityLog();
    renderActivityLog(host);
  });
  host.append(count, list, h('div.activity-actions', {}, [refresh, clear]));
  return arr.length;
}

export default { renderActivityLog, activityEntries };
