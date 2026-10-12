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
/* Copied from src/pages/hub/all-keys.js rather than imported: that file pulls
   drive-sync.js, and CORE must stay light. The key is a storage contract, so
   it does not move. */
const ACTIVITY_KEY = 'fms_studio_activity_v1';

/** The same activity-log write the Home page made, so "Exported a
 *  backup" still shows in Settings > Activity wherever it was done. */
function logActivity(where, what, url) {
  try {
    const raw = localStorage.getItem(ACTIVITY_KEY);
    const log = raw ? JSON.parse(raw) : {};
    const arr = Array.isArray(log.entries) ? log.entries : [];
    arr.unshift({ ts: Date.now(), where, what, url });
    log.entries = arr.slice(0, 30);
    localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log));
  } catch (e) { /* a log line is not worth a failed backup */ }
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
  host.append(menu);
  wire();
  return menu;
}

export default { mountBackupMenu };
