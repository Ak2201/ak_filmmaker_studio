/* ============================================================
   HUB — the Backup menu: export, import, the overview PDF, reset.
   Moved out of hub.js in the split of 7 Oct 2026, behaviour unchanged.

   A factory, because reset walks the page's RESET list (ALL_KEYS stays
   on hub.js — CLAUDE.md says why) and export/import write to the
   page's activity log. Both are passed in once. The backup FORMAT is
   not here either: buildBackup()/applyBackup() in src/lib/backup.js
   are the one builder and the one applier, shared with Drive.
   ============================================================ */
import Store from '../../lib/store.js';
import { downloadBackup, applyBackup, backupShape } from '../../lib/backup.js';
import { projectsToErase, eraseDeviceStorage } from '../../lib/hub-reset.js';
import PDF from '../../lib/pdf.js';
import { $ } from './util.js';
import { BRAND } from '../../lib/brand.js';
import { ask, tell } from '../../ui/dialog.js';
import * as DriveSync from '../../lib/drive-sync.js';

/**
 * @param {object} o
 * @param {string[]} o.allKeys        hub.js's ALL_KEYS, the reset list
 * @param {Function} o.logActivity    the hub's activity logger
 */
/* KEEP_ON_ERASE (credentials and access, not work) lives with the erase
   itself, in src/lib/hub-reset.js. */

/**
 * Erase this device. Does NOT sign out. Cloud copies are untouched,
 * and cloud sync is PAUSED (cloudSync:'off' in the device prefs) so
 * the next load neither pulls the account back nor pushes emptiness.
 * @returns {Promise<{ok:boolean, cancelled?:boolean, projects:number,
 *           driveDeleted:boolean, message:string}>}
 */
export async function resetAll({ alsoDrive = false, confirmed = false, allKeys = [] } = {}) {
  return resetAllImpl({ alsoDrive, confirmed, allKeys });
}

async function resetAllImpl({ alsoDrive = false, confirmed = false, allKeys = [] } = {}) {
  const projects = projectsToErase();
  const n = projects.length;
  const plural = n === 1 ? '' : 's';
  if (!confirmed) {
    const r = await ask({
      title: 'Erase everything on this device?',
      body: 'This erases ' + n + ' project' + plural + ', both blueprints, library calc, all prefs and comments from this device. ' +
            'Export first if you want to keep anything. You stay signed in; copies in your account are not deleted.',
      confirm: 'Erase everything', danger: true, typeToConfirm: 'ERASE',
      checkbox: { label: 'Also delete my Google Drive backup file' }
    });
    if (!r || !r.ok) return { ok: false, cancelled: true, projects: 0, driveDeleted: false, message: 'Cancelled.' };
    alsoDrive = !!r.checked;
  }

  let driveDeleted = false, driveNote = '';
  if (alsoDrive) {
    try { driveDeleted = await DriveSync.deleteBackupFile(); }
    catch (e) { driveNote = ' The Drive file could not be deleted (' + (e && e.message || e) + ') and is still there.'; }
  }

  /* The storage half — every project in every namespace, every `fms_`
     key by base and suffixed name, the pointers, the notes, then
     cloudSync:'off' in the device prefs — is src/lib/hub-reset.js. */
  eraseDeviceStorage({ projects, allKeys });
  const c = window.StudioCloud;
  if (c && c.setSyncEnabled) { try { await c.setSyncEnabled(false); } catch (e) { /* none */ } }

  await Store.flushStorage();
  const signed = !!(c && c.getSession && c.getSession());
  const message = n + ' project' + plural + ' erased from this device.' +
    (alsoDrive ? (driveDeleted ? ' Your Google Drive backup was deleted.' : driveNote || ' No Drive backup was connected.') : '') +
    (signed ? ' You are still signed in. Copies in your account are untouched and cloud sync is paused; turn sync on in Settings to pull them back.' : '');
  return { ok: true, projects: n, driveDeleted, message };
}

export function createBackupMenu({ allKeys, logActivity }) {
  const ALL_KEYS = allKeys;

// ============================================================
// EXPORT / IMPORT / RESET  (cross-blueprint)
// ============================================================

/* The overview, as paper, beside the JSON. The two are not
   alternatives: the JSON is the backup — the only one a local-first
   app has — and a PDF of it would be useless for restoring anything.
   This is the other half, the thing you hand somebody: what is in the
   studio, how far each blueprint has got, and where to find the rest.

   Deliberately NOT called a backup, and deliberately below the two
   that are, so that nobody reaches for it at the moment they most
   need the JSON. */
function exportOverviewPDF() {
  const projects = Store.listProjects();
  const open = Store.currentProject();
  PDF.exportPDF({
    scope: 'overview',
    project: BRAND.name,
    label: 'Studio overview',
    title: BRAND.name + " — overview",
    subtitle: [
      projects.length + (projects.length === 1 ? ' project' : ' projects'),
      open && open.title ? 'open: ' + open.title : ''
    ].filter(Boolean).join(' · ')
  });
}

/* THE DOWNLOAD, and only the download. The object it writes to disk
   is built by buildBackup() in src/lib/backup.js, which is also what
   Drive uploads — one builder, so the file a user emails themselves
   and the file in their Drive cannot drift apart. The long note that
   used to live here, about listAllProjects and about the importer not
   carrying `ns` across, moved there with the code it explains. */
function exportAll() {
  const n = downloadBackup();
  logActivity('studio', 'Exported full studio backup — ' + n + ' project' + (n === 1 ? '' : 's'));
}

function importAll() { $('#importAllFile').click(); }

/* READING A FILE OFF DISK, and only that. What the parsed object
   MEANS — v1 or v2, which projects land, how a colliding id is
   handled, how a pre-rename note key is mapped forward — is
   applyBackup() in src/lib/backup.js, because Drive restores the
   same object and two appliers is two sets of rules for one file.

   The prompts stay here. `confirm` is passed in rather than called
   there: what to ask a person is the page's business, and a library
   that opens a modal is a library you cannot call from a sync. */
function handleImportAll(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = async (ev) => {
    try {
      const all = JSON.parse(ev.target.result);
      if (!backupShape(all).looksOurs) {
        if (!await ask('This file does not look like a Studio backup. Try anyway?')) return;
      }
      /* applyBackup asks synchronously, and asks before it writes
         anything: a refusal leaves the studio untouched. So the first
         call records the question and says no; the question is put in
         the app's own dialog; on yes the call is made again for real.
         When nothing needed asking, the first call was the real one. */
      let question = '';
      let res = applyBackup(all, { mode: 'merge', confirm: (q) => { question = q; return false; } });
      if (question) {
        if (!await ask(question)) return;
        res = applyBackup(all, { mode: 'merge', confirm: () => true });
      }
      if (!res.ok) { if (res.message) await tell(res.message); return; }
      if (res.added || res.replaced) {
        logActivity('studio', 'Imported ' + res.added + ' project' + (res.added === 1 ? '' : 's'));
      }
      /* FLUSH BEFORE THE DIALOG, NOT JUST BEFORE THE RELOAD.

         A restored screenplay is over the overflow threshold, so
         applyBackup() has only STARTED its write when it returns. The
         alert then blocks the event loop the IndexedDB transaction
         needs and the reload destroys the connection, and the script
         is gone — proved, through this exact path. Both halves have
         to wait: holding the dialog longer made it worse, not better,
         so moving the flush after it would not have been enough. */
      await Store.flushStorage();
      await tell('✓ ' + res.message + ' Refreshing…');
      location.reload();
    } catch (err) {
      await tell('Import failed: ' + err.message);
    }
  };
  r.readAsText(file);
  e.target.value = '';
}

async function resetAll(opts) {
  const r = await resetAllImpl({ allKeys: ALL_KEYS, ...(opts || {}) });
  if (r.cancelled) return r;
  await tell({ title: r.ok ? 'Studio erased' : 'Erase failed', body: r.message });
  location.reload();
  return r;
}

  return { exportOverviewPDF, exportAll, importAll, handleImportAll, resetAll };
}
