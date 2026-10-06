/* ============================================================
   THE BACKUP FILE — one builder, one applier
   ------------------------------------------------------------
   `exportAll()` in src/pages/hub.js used to do two jobs in one
   function: BUILD the v2 backup object and TRIGGER a download of
   it. The import side had the same knot the other way up —
   reading a File off disk and applying a parsed object were one
   `FileReader.onload`.

   That was fine while the only consumer was a button on the hub.
   It stopped being fine the moment a second consumer existed:
   Drive sync uploads the same object and applies the same object,
   and the one thing this codebase refuses is a second copy of a
   thing that has to agree with itself. CLAUDE.md names the price
   twice — four copies of the rupee parser disagreeing about
   identical stored data, and the API key form copied into
   visualize.js.

   So the format lives HERE and nowhere else:

     buildBackup()           returns the object. No download.
     applyBackup(all, opts)  applies a parsed object. No File, no
                             FileReader, no reload.

   The hub owns the download and the file picker; drive-sync.js
   owns the upload and the fetch. Neither owns the format.

   THE KEY MAPS MOVED WITH IT. PROJECT_KEYS and GLOBAL_KEYS are
   the backup's own schema — the map from a field name in the file
   to a storage key on disk — so they belong to the format rather
   than to the page that happened to be first to need them.
   ALL_KEYS stayed in hub.js, because that one is the reset list
   and reset is the hub's.

   TWO MODES, ONE IMPLEMENTATION.
     'merge'   (the hub's import, and the default) — additive. A
               backup never deletes or overwrites a project you
               already have; an incoming id that collides lands
               alongside as a marked copy.
     'restore' (Drive pull) — an incoming id that collides
               REPLACES that project's buckets in place, because a
               pull is "this device is behind", not "here are some
               more films". Local projects the backup has never
               heard of are left alone either way: a sync that
               deletes a film because the other device has not seen
               it yet is the exact outcome this app refuses.

   The two differ by one branch inside one loop. They are not two
   functions, for the reason at the top of this comment.
   ============================================================ */
import Store from './store.js';

/* Backup field name -> storage key, for the keys store.js
   namespaces per project (its SCOPED_KEYS). Everything here exists
   once PER PROJECT; reading it through localStorage would silently
   give you only the active one, which is exactly the bug this map
   exists to kill. */
export const PROJECT_KEYS = {
  feature_blueprint: 'fms_filmmaker_combined_v1',
  short_blueprint:   'fms_shortfilm_blueprint_v1',
  library_calc:      'fms_library_calc_v1',
  feature_prefs:     'fms_filmmaker_prefs_v1',
  short_prefs:       'fms_shortfilm_prefs_v1',
  library_prefs:     'fms_library_prefs_v1',
  activity_log:      'fms_studio_activity_v1',
  scenes:            'fms_scenes_v1',
  contacts:          'fms_contacts_v1',
  shots:             'fms_shots_v1',
  script:            'fms_script_v1',
  locations:         'fms_locations_v1',
  workbench:         'fms_workbench_v1',
  dissect:           'fms_dissect_v1',
  festivals:         'fms_festivals_v1',
  scriptgen:         'fms_scriptgen_v1',
  songs:             'fms_songs_v1',
  story:             'fms_story_v1',
  idea_vault:        'fms_idea_vault_v1',
  edit:              'fms_edit_v1',
  deliverables:      'fms_deliverables_v1'
};

/* Deliberately NOT per project: the theme is a device preference
   and the Supabase config is account-level. Both are global in
   store.js too.

   DELIBERATELY NOT HERE AT ALL, and each absence is load-bearing:
     fms_ai_key_v1          a credential. A key inside a file a
                            user emails to themselves is the
                            mistake ai.js was written to avoid.
     fms_studio_account_v1  an identity. In a backup it would make
                            another machine claim to be somebody.
     fms_drive_sync_v1      a pointer at ONE Drive file on ONE
                            device. Restored elsewhere it would
                            make that machine push its own studio
                            into this machine's backup file. See
                            the header of drive-sync.js. */
export const GLOBAL_KEYS = {
  studio_prefs: 'fms_studio_prefs_v1',
  sync_config:  'fms_supabase_cfg_v1',
  /* The Write page's per-device preferences: the keyboard preset and
     any changed Return flow (src/lib/write-keys.js), shared with the
     format guide. It travels with a backup the way the theme does. */
  write_prefs:  'fms_write_prefs_v1'
};

export const NOTE_PREFIX = 'fms_note_';

/* The one place the v1 flat field names are mapped. A v1 file has
   no project identity in it at all. */
const V1_KEYS = {
  feature_blueprint: PROJECT_KEYS.feature_blueprint,
  short_blueprint:   PROJECT_KEYS.short_blueprint,
  library_calc:      PROJECT_KEYS.library_calc,
  feature_prefs:     PROJECT_KEYS.feature_prefs,
  short_prefs:       PROJECT_KEYS.short_prefs,
  library_prefs:     PROJECT_KEYS.library_prefs,
  studio_prefs:      GLOBAL_KEYS.studio_prefs,
  sync_config:       GLOBAL_KEYS.sync_config,
  activity_log:      PROJECT_KEYS.activity_log
};

function parseStorage(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; }
}

/* A note's key is the ONE place a backup stores a RAW storage key
   rather than a field name, so a file written before the fms_
   rename carries `arunak_note_*` and would restore keys this build
   no longer reads. Mapped forward on the way in, in the one place
   every inbound path goes through. */
function noteKey(k) {
  return k.indexOf('arunak_') === 0 ? 'fms_' + k.slice('arunak_'.length) : k;
}

/* ============================================================
   BUILD
   ============================================================ */

/**
 * The whole studio as one plain object. No download, no network,
 * no storage writes — this function only ever READS.
 *
 * listAllProjects, not listProjects: the list is filtered by
 * ACCOUNT NAMESPACE as well as by project, so the scoped version
 * would produce a file calling itself a full studio backup while
 * holding only the namespace you happened to be standing in. The
 * buckets below are read with rawGet by project id, which is
 * namespace-blind, so widening the list is the whole fix.
 *
 * Safe to widen because the applier does NOT carry `ns` across: it
 * passes id/title/format to createProject, which stamps the
 * IMPORTING namespace. So a backup taken while signed in restores
 * VISIBLY when signed out.
 */
export function buildBackup() {
  const projects = Store.listAllProjects();
  const all = {
    _exported: new Date().toISOString(),
    _from: "FilmMakerStudio",
    _curator: 'Arunak',
    _version: 2,
    projects,
    currentProject: Store.currentProjectId() || null,
    data: {},
    global: {},
    notes: {}
  };

  // Read each project's namespaced keys directly. Switching the
  // active project to read them would fire change events and bump
  // updatedAt on every project just for taking a backup.
  const readBucket = (suffix) => {
    const bucket = {};
    Object.keys(PROJECT_KEYS).forEach((name) => {
      const raw = Store.rawGet(PROJECT_KEYS[name] + suffix);
      if (raw == null) return;
      try { bucket[name] = JSON.parse(raw); } catch (e) { /* skip corrupt */ }
    });
    return bucket;
  };
  projects.forEach((p) => { all.data[p.id] = readBucket('__' + p.id); });

  /* UNFILED WORK — what a page wrote with no project open (store.js,
     "UNFILED WORK"). This used to be read only when the studio had NO
     projects, which was exactly backwards for the case that mattered:
     work written with no project open while projects existed, or in an
     account with none of its own, was in no backup at all.

     Now every holding slot on the device is read, whatever the project
     count, because a backup that calls itself the whole studio must
     not drop work that is on disk. Read only — taking a backup never
     adopts anything; adoption is the person creating a project. The
     device's slot is `_unfiled` (the name older files already use);
     an account's is `_unfiled_<n>`, numbered rather than named so no
     account id rides inside the file. */
  /* WORK ONLY. The activity log and the three legacy prefs blobs are
     scoped too, and the hub writes the log whenever it acts with no
     project open — "Project deleted" after you delete your last film.
     Carrying those would make every such backup import an empty
     "Unfiled work" project. They still adopt (harmless); they just do
     not make a bucket worth restoring. */
  const HOUSEKEEPING = ['activity_log', 'feature_prefs', 'short_prefs', 'library_prefs'];
  let n = 1;
  Store.unfiledNamespaces().sort().forEach((ns) => {
    const bucket = readBucket(ns ? '@' + ns : '');
    HOUSEKEEPING.forEach((f) => { delete bucket[f]; });
    if (!Object.keys(bucket).length) return;
    all.data[ns ? '_unfiled_' + (++n) : '_unfiled'] = bucket;
  });

  Object.keys(GLOBAL_KEYS).forEach((n) => { all.global[n] = parseStorage(GLOBAL_KEYS[n]); });

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NOTE_PREFIX)) all.notes[k] = localStorage.getItem(k);
  }

  return all;
}

/** What is in a parsed file, without applying any of it. */
/* The download itself, beside the thing it downloads.

   This was ten lines inside hub.js's exportAll(), which was fine
   while the hub was the only place anybody could ask for a backup.
   It is not any more: when the browser runs out of storage the
   person is mid-sentence on write.html, and the useful answer is the
   file, not directions to a button on another page. A local wrapper
   for PRESENTATION is allowed where a local copy of the format would
   not be — and this is the presentation half, with buildBackup()
   still the only thing that knows what a backup IS. */
export function downloadBackup() {
  const all = buildBackup();
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fms_studio_backup_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
  return (all.projects || []).length;
}

const UNFILED_RE = /^_unfiled(_\d+)?$/;

export function backupShape(all) {
  const v2 = !!(all && all._version >= 2 && all.data);
  const projects = (v2 && Array.isArray(all.projects)) ? all.projects : [];
  const unfiledBuckets = v2
    ? Object.keys(all.data).filter((k) => UNFILED_RE.test(k) && all.data[k] && typeof all.data[k] === 'object')
    : [];
  return {
    version:   v2 ? 2 : 1,
    looksOurs: !!(all && all._from && String(all._from).includes('Studio')),
    exported:  (all && all._exported) || null,
    projects,
    unfiled: unfiledBuckets.length > 0,
    unfiledBuckets,
    count: v2 ? projects.length + unfiledBuckets.length : 1
  };
}

/* ============================================================
   APPLY
   ============================================================ */

/**
 * Apply a PARSED backup object. Never reads a File, never
 * fetches, never reloads the page — the caller owns all three.
 *
 * opts.mode     'merge' (default) | 'restore' — see the header.
 * opts.confirm  (question) => boolean. The prompts belong to the
 *               page, not to the format, so they are asked through
 *               this. Default: agree. Drive passes a no-op because
 *               the conflict was already resolved out loud before
 *               this is reached.
 *
 * Returns { ok, added, replaced, message }. ok is false when the
 * caller's confirm said no, or there was nothing to apply.
 */
export function applyBackup(all, opts) {
  opts = opts || {};
  const shape = backupShape(all);
  return shape.version === 2 ? applyV2(all, shape, opts) : applyV1(all, opts);
}

function applyGlobalsAndNotes(all) {
  // Globals and notes are studio-wide; last write wins, as before.
  if (all.global) {
    Object.keys(GLOBAL_KEYS).forEach((n) => {
      if (all.global[n] !== undefined) {
        localStorage.setItem(GLOBAL_KEYS[n], JSON.stringify(all.global[n]));
      }
    });
  }
  if (all.notes) {
    Object.keys(all.notes).forEach((k) => {
      localStorage.setItem(noteKey(k), all.notes[k]);
    });
  }
}

/* v2 — a whole studio. */
function applyV2(all, shape, opts) {
  const ok = opts.confirm || (() => true);
  const restore = opts.mode === 'restore';
  const total = shape.count;
  if (!total) {
    return { ok: false, added: 0, replaced: 0, message: 'That backup contains no projects.' };
  }

  if (!ok('Import ' + total + ' project' + (total === 1 ? '' : 's') +
          ' into this studio?\n\nNothing you already have is deleted or ' +
          'overwritten — the imported work is added alongside it.')) {
    return { ok: false, added: 0, replaced: 0, message: null };
  }

  const taken = Store.listProjects().map((p) => p.id);
  let added = 0, replaced = 0;

  const writeBucket = (id, bucket) => {
    Object.keys(PROJECT_KEYS).forEach((name) => {
      if (bucket[name] === undefined) return;
      Store.rawSet(PROJECT_KEYS[name] + '__' + id, JSON.stringify(bucket[name]));
    });
  };

  const land = (meta, bucket) => {
    const clash = !!meta.id && taken.indexOf(meta.id) >= 0;
    if (clash && restore) {
      /* The one branch that makes this two modes. A pull is this
         device catching up with itself, so the incoming copy of a
         project it already has REPLACES that project's buckets
         rather than arriving beside it as a duplicate. */
      Store.updateProject(meta.id, {
        title:  meta.title || undefined,
        format: meta.format || undefined
      });
      writeBucket(meta.id, bucket);
      replaced++;
      return;
    }
    const created = Store.createProject({
      id:     clash ? undefined : meta.id,
      title:  (meta.title || 'Imported Project') + (clash ? ' (imported)' : ''),
      format: meta.format
    });
    writeBucket(created.id, bucket);
    taken.push(created.id);
    added++;
  };

  shape.projects.forEach((p) => land(p, all.data[p.id] || {}));

  /* Unfiled buckets. MERGE (a file somebody chose to import) lands
     each as a project of its own, as it always did — visible at once,
     beside everything else. RESTORE (a Drive pull: this device
     catching up with itself) puts it back where it came from, this
     namespace's holding slot, key by key and never over a value that
     is already there, so the next project created adopts it as it
     would have on the device that wrote it. Landing it as a project
     on every pull would mint a new "Imported Project" per sync. */
  shape.unfiledBuckets.forEach((name) => {
    const bucket = all.data[name] || {};
    if (!restore) { land({ title: 'Unfiled work (imported)', format: 'feature' }, bucket); return; }
    let wrote = 0;
    Object.keys(PROJECT_KEYS).forEach((field) => {
      if (bucket[field] === undefined) return;
      const slot = Store.holdingKey(PROJECT_KEYS[field]);
      if (Store.rawGet(slot) != null) return;          // never clobber
      Store.rawSet(slot, JSON.stringify(bucket[field]));
      wrote++;
    });
    if (wrote) replaced++;
  });

  applyGlobalsAndNotes(all);

  const parts = [];
  if (added)    parts.push('Imported ' + added + ' project' + (added === 1 ? '' : 's'));
  if (replaced) parts.push('Updated ' + replaced + ' project' + (replaced === 1 ? '' : 's'));
  return {
    ok: true, added, replaced,
    message: (parts.join(', ') || 'Nothing to change') + '.'
  };
}

/* v1 — a single project's worth of data, with no project identity
   in the file. Keeps working exactly as it did, including the
   warning that it lands on top of whatever is currently open. */
function applyV1(all, opts) {
  const ok = opts.confirm || (() => true);
  if (!Store.currentProjectId()) {
    const tryTitle =
      (all.feature_blueprint && (all.feature_blueprint.meta_title || all.feature_blueprint.v1_title)) ||
      (all.short_blueprint && all.short_blueprint.meta_title) ||
      'Imported Project';
    Store.createProject({ title: tryTitle, format: 'feature' });
  } else if (!ok('This is an older single-project backup. It will REPLACE the data in ' +
                 'the active project ("' + Store.currentProject().title + '"). Continue?' +
                 '\n\nTip: cancel and create a new project first if you want to keep the current one.')) {
    return { ok: false, added: 0, replaced: 0, message: null };
  }
  Object.keys(V1_KEYS).forEach((name) => {
    if (all[name]) localStorage.setItem(V1_KEYS[name], JSON.stringify(all[name]));
  });
  // Same legacy-note mapping as the v2 path; a restore and a merge
  // can both be handed a pre-rename file.
  if (all.notes) {
    Object.keys(all.notes).forEach((k) => {
      localStorage.setItem(noteKey(k), all.notes[k]);
    });
  }
  return { ok: true, added: 1, replaced: 0, message: 'Studio data imported.' };
}

export default {
  downloadBackup,
  PROJECT_KEYS, GLOBAL_KEYS, NOTE_PREFIX,
  buildBackup, backupShape, applyBackup
};
