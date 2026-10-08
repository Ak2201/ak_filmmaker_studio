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
import { NOTE_PREFIX, downloadBackup, applyBackup, backupShape } from '../../lib/backup.js';
import PDF from '../../lib/pdf.js';
import { $ } from './util.js';
import { BRAND } from '../../lib/brand.js';

/**
 * @param {object} o
 * @param {string[]} o.allKeys        hub.js's ALL_KEYS, the reset list
 * @param {Function} o.logActivity    the hub's activity logger
 */
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
  r.onload = (ev) => {
    try {
      const all = JSON.parse(ev.target.result);
      if (!backupShape(all).looksOurs) {
        if (!confirm('This file does not look like a Studio backup. Try anyway?')) return;
      }
      const res = applyBackup(all, { mode: 'merge', confirm: (q) => confirm(q) });
      if (!res.ok) { if (res.message) alert(res.message); return; }
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
      Store.flushStorage().then(() => {
        alert('✓ ' + res.message + ' Refreshing…');
        location.reload();
      });
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  r.readAsText(file);
  e.target.value = '';
}

async function resetAll() {
  /* This said "erases EVERYTHING" and then called removeItem for each
     scoped key — which the storage proxy resolved to the ACTIVE project
     only. Other projects survived a wipe the user was told was total.
     Now it means what it says: every project, then the globals.

     The account namespace put the same trap back: listProjects()
     AND deleteProject() are both namespace-scoped, so this promised
     to erase everything while leaving every account-only project on
     disk. purgeProjectEverywhere() is the namespace-blind form and
     exists for exactly this one caller. */
  const projects = Store.listAllProjects();
  const n = projects.length;
  /* Say what is kept as well as what goes. The two sentences below are
     the only place a user is told that an ACCOUNT's copy is a separate
     thing from this device's — and getting that wrong in either
     direction is the worst kind of bug this dialog can have. */
  const c      = window.StudioCloud;
  const signed = !!(c && c.getSession && c.getSession());
  if (!confirm('This erases EVERYTHING on this device — ' + n + ' project' + (n === 1 ? '' : 's') +
               ', both blueprints, library calc, all prefs, all comments. ' +
               'EXPORT first if you want to keep anything.\n\nContinue?')) return;
  if (!confirm('Are you absolutely sure? This cannot be undone.' +
               (signed
                 ? '\n\nYou will be signed out. Projects already in your account stay there — ' +
                   'this clears the device, not the account. Sign in again to bring them back.'
                 : '') +
               '')) return;

  // deleteProject already wipes that project's namespaced keys, using
  // store.js's own SCOPED_KEYS as the authority. Don't re-list them here.
  projects.forEach((p) => Store.purgeProjectEverywhere(p.id));

  // Anything still unsuffixed (a studio that predates projects), then globals.
  ALL_KEYS.forEach((k) => Store.rawRemove(k));
  // The per-namespace open-project pointers. ALL_KEYS knows the bare
  // name; an account pointer is `…@<uid>`, which it has never heard of,
  // so a wipe left one behind aiming at a project that no longer exists.
  Store.currentPointerKeys().forEach((k) => Store.rawRemove(k));

  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NOTE_PREFIX)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));

  /* AFTER the purge, never before. signOut() ends with
     Store.setAccount(null), which SCHEDULES A RELOAD — run it first
     and the page can come back before the wipe has finished.

     Signing out is what makes keeping SYNC_CFG safe (see ALL_KEYS).
     Leave the session alive and the next load pulls the account's
     projects straight back down, which would make both confirmations
     above untrue. The session is not an `fms_` key — supabase-js keeps
     it under `sb-<ref>-auth-token` — so nothing above can clear it and
     only this call can.

     Purging first is also safe from the sync side: every write above
     goes through rawRemove, which bypasses the storage proxy and so
     emits no `saved` event for the cloud subscriber to push. */
  if (signed) {
    try { await c.signOut(); }
    catch (e) { console.warn('[reset] sign-out', e); }
  }

  // Same reason as the import path above: removals clear IndexedDB
  // records too, and the reload must not outrun them.
  await Store.flushStorage();
  alert('All studio data cleared — ' + n + ' project' + (n === 1 ? '' : 's') + ' removed. Refreshing…');
  location.reload();
}

  return { exportOverviewPDF, exportAll, importAll, handleImportAll, resetAll };
}
