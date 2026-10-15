/* ============================================================
   BACKUP — the one menu, in the top bar, on every page
   ------------------------------------------------------------
   Backup used to exist in three places: the Home toolbar's menu (JSON
   export, import, the overview PDF), Settings > Storage's "Download a
   backup" button, and Settings > Drive (Google Drive). A person looking
   for "my backup" had to know which of three screens held which half.

   Now it is ONE menu in the right-hand zone of the band, next to the
   project switcher, the theme button and the account name, on every
   page. It does the quick things itself (export, import, the overview
   PDF) and points at the one place the settings live — Settings > Data
   & backup — for Google Drive.

   CORE, so nothing heavy is imported here. The work is in
   src/pages/hub/backup-menu.js (which pulls the PDF code and Drive),
   loaded on the first click; the menu markup is a few buttons.
   Nothing is written except by a click: verify asserts zero idle
   writes.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { actionMenu, wireActionBar } from './actionbar.js';
import '../styles/topbar-backup.css';
/* The activity log and Drive's sync state are read and written through
   src/lib/hub-activity.js, which owns both key names (copies, not
   imports: all-keys.js pulls drive-sync.js, and CORE must stay light).
   The keys are a storage contract, so they do not move. */
import { lastBackup, logActivitySafe } from '../lib/hub-activity.js';

/* ---- BACKUP HEALTH (reads only) -------------------------------------
   "When was this studio last backed up?" has two honest answers already
   on the device, and neither is a new key: the activity log's
   "Exported full studio backup" line (written by the export, here and on
   Home), and Drive's own `syncedAt` while Drive is connected. The newer
   of the two wins. An IMPORT is not a backup and is not counted. Nothing
   here writes, so the idle-write assertion in verify still holds. */
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

/* lastBackup() — the newer of the two — is src/lib/hub-activity.js. */

function ago(ms) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return m + (m === 1 ? ' minute' : ' minutes') + ' ago';
  const hr = Math.round(m / 60);
  if (hr < 24) return hr + (hr === 1 ? ' hour' : ' hours') + ' ago';
  const d = Math.round(hr / 24);
  if (d < 14) return d + (d === 1 ? ' day' : ' days') + ' ago';
  return d < 60 ? Math.round(d / 7) + ' weeks ago' : Math.round(d / 30) + ' months ago';
}

/** Redraw the line in the menu and the dot on the button. */
function refreshHealth() {
  const menu = document.querySelector('[data-tb-backup]');
  if (!menu) return;
  const last = lastBackup();
  const stale = !last || Date.now() - last.at > STALE_MS;
  const text = last ? 'Last backup: ' + ago(last.at) + (last.via === 'drive' ? ' (Google Drive)' : '') : 'Never backed up';
  const note = menu.querySelector('.tb-note');
  if (note) note.textContent = text;
  menu.classList.toggle('is-backup-stale', stale);
  const btn = menu.querySelector('.tb-menu-btn');
  if (btn) {
    const label = 'Backup — export, import, or back up to Google Drive. ' + text + (stale && last ? ' — over a week old' : '');
    btn.setAttribute('aria-label', label);
    btn.setAttribute('title', label);
  }
}

/** The same activity-log write the Home page made, so "Exported a
 *  backup" still shows in Settings > Activity wherever it was done. */
function logActivity(where, what, url) {
  /* thirty lines, but the newest backup line survives the cap (see capLog in
     src/lib/hub-activity.js): it is what the health line reads. */
  logActivitySafe(where, what, url);
  refreshHealth();
}

let io = null;
async function backup() {
  if (!io) {
    const m = await import('../pages/hub/backup-menu.js');
    io = m.createBackupMenu({ allKeys: [], logActivity });
  }
  return io;
}

let fileInput = null;
function pickFile() {
  if (!fileInput) {
    fileInput = h('input', {
      type: 'file', accept: '.json', class: 'visually-hidden', 'aria-label': 'Import a studio backup', tabindex: '-1'
    });
    fileInput.addEventListener('change', async (e) => { (await backup()).handleImportAll(e); });
    document.body.append(fileInput);
  }
  fileInput.click();
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  wireActionBar();
  delegate(document, 'click', '[data-action="bk-export"]', async () => { (await backup()).exportAll(); });
  delegate(document, 'click', '[data-action="bk-import"]', () => pickFile());
  delegate(document, 'click', '[data-action="bk-overview"]', async () => { (await backup()).exportOverviewPDF(); });
  /* The wording is relative ("2 hours ago"), so it is recomputed when the
     menu opens and when the tab is looked at again, never on a timer. */
  delegate(document, 'click', '[data-tb-backup] [data-action="tb-menu-toggle"]', () => refreshHealth());
  window.addEventListener('focus', refreshHealth);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshHealth(); });
}

/** Mount the Backup menu into `host` (the band's right-hand zone).
 *  Idempotent: one per document. */
export function mountBackupMenu(host) {
  if (!host || document.querySelector('[data-tb-backup]')) return null;
  const menu = actionMenu('Backup', [
    { label: 'Export everything', hint: '.json', action: 'bk-export', title: 'Every project, not just the open one' },
    { label: 'Import a backup', action: 'bk-import' },
    { label: 'Studio overview', hint: '.pdf', action: 'bk-overview', title: 'The studio overview as a paginated A4 document' },
    '---',
    { label: 'Google Drive backup', hint: 'Settings', href: 'settings.html#backup', title: 'Connect Google Drive, back up now, restore an earlier version' }
  ], { align: 'right', ariaLabel: 'Backup — export, import, or back up to Google Drive' });
  menu.setAttribute('data-tb-backup', '');
  /* The health line sits first in the panel, above the actions, and is not
     a menu item. The dot on the button is drawn by topbar-backup.css when
     the menu carries .is-backup-stale. */
  const panel = menu.querySelector('.tb-menu-panel');
  if (panel) panel.prepend(h('div.tb-note', { role: 'presentation' }));
  const btn = menu.querySelector('.tb-menu-btn');
  if (btn) btn.append(h('span.tb-backup-dot', { 'aria-hidden': 'true' }));
  host.append(menu);
  wire();
  refreshHealth();
  return menu;
}

export default { mountBackupMenu };
