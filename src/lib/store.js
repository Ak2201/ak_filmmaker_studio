/* ============================================================
   THE FILMMAKER'S STUDIO — PROJECT STORE  (ES module port)
   ------------------------------------------------------------
   Ported from studio-store.js. Behaviour, storage keys and bus
   event names are unchanged. Adds:
     1. A multi-project model (was single-project before)
     2. Per-project namespaced localStorage (legacy keys auto-suffix)
     3. A subscribe/notify bus for cross-field cascading
     4. One-time migration of existing single-project data
     5. A preamble (`init()` → `installStorageProxy()`) that makes all
        legacy `localStorage.getItem('fms_…')` calls transparently
        scope to the current project — no other code changes needed.

   ⚠️  LOAD ORDER — READ THIS BEFORE IMPORTING ANYTHING ELSE  ⚠️
   ------------------------------------------------------------
   `installStorageProxy()` monkey-patches `Storage.prototype`, and
   every other module in the app assumes that patch is already in
   place when it touches localStorage. As a plain <script> this was
   guaranteed by tag order; as a module it is guaranteed by IMPORT
   ORDER instead — ES modules evaluate depth-first in import order.

   Therefore:
     • Every page entry point MUST import this module (directly or
       transitively) BEFORE any module that reads localStorage.
       Put `import './lib/store.js'` (or an import of a module that
       itself imports it first) at the TOP of the entry file.
     • src/ui/chrome.js and src/lib/cloud.js import this module
       explicitly for exactly this reason — do not remove those
       imports "because the symbol is unused".
     • `init()` is called at module evaluation time (bottom of this
       file), same as the old file's auto-init block. Importing this
       module is enough; callers do not need to call init().
   ============================================================ */

// The shared chrome CSS that this module used to inject at runtime.
// Imported (not injected) so it participates in the build — see
// injectSharedStyles() below.
import '../styles/chrome-injected.css';

const global = typeof window !== 'undefined' ? window : globalThis;

// ============================================================
// CONSTANTS
// ============================================================
const PROJECTS_KEY        = 'fms_studio_projects_v1';     // array of project meta
const CURRENT_KEY         = 'fms_studio_current_project_v1'; // string projectId
const SCHEMA_VERSION_KEY  = 'fms_studio_schema_v1';       // for future migrations

// Legacy per-blueprint keys that should be project-scoped.
// Anything in this list gets auto-suffixed with `__<projectId>`
// when read or written through the storage proxy.
const SCOPED_KEYS = [
  'fms_filmmaker_combined_v1',
  'fms_shortfilm_blueprint_v1',
  'fms_library_calc_v1',
  'fms_filmmaker_prefs_v1',
  'fms_shortfilm_prefs_v1',
  'fms_library_prefs_v1',
  'fms_studio_activity_v1',
  'fms_scenes_v1',
  'fms_contacts_v1',
  'fms_shots_v1',
  'fms_script_v1',
  'fms_locations_v1',
  'fms_workbench_v1',
  'fms_dissect_v1',
  'fms_festivals_v1',
  'fms_scriptgen_v1',
  'fms_songs_v1'
  // intentionally NOT scoped: fms_studio_prefs_v1 (dark mode = global),
  //                            fms_supabase_cfg_v1 (account-level),
  //                            fms_note_* (per-field notes, fine global for now)
];

const FORMATS = ['feature', 'short', 'documentary', 'musicvideo', 'adfilm'];

// ============================================================
// INTERNAL: low-level localStorage access (BEFORE proxy)
// ============================================================
// We capture the original methods so the proxy can call through.
const _origGet    = global.localStorage.getItem.bind(global.localStorage);
const _origSet    = global.localStorage.setItem.bind(global.localStorage);
const _origRemove = global.localStorage.removeItem.bind(global.localStorage);

export function rawGet(k)    { try { return _origGet(k); } catch (e) { return null; } }
export function rawSet(k, v) { try { _origSet(k, v); return true; } catch (e) { return false; } }
export function rawRemove(k) { try { _origRemove(k); return true; } catch (e) { return false; } }

export function jsonGet(k, fallback) {
  const raw = rawGet(k);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}
export function jsonSet(k, v) { return rawSet(k, JSON.stringify(v)); }

// ============================================================
// PROJECTS — list / CRUD
// ============================================================
function uuid() {
  if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

export function listProjects() {
  const arr = jsonGet(PROJECTS_KEY, []);
  return Array.isArray(arr) ? arr : [];
}

export function getProject(id) {
  if (!id) return null;
  return listProjects().find(p => p.id === id) || null;
}

function saveProjects(arr) { jsonSet(PROJECTS_KEY, arr); }

export function createProject(meta) {
  meta = meta || {};
  const now = new Date().toISOString();
  const project = {
    id:         meta.id || uuid(),
    title:      (meta.title || 'Untitled Project').trim(),
    format:     FORMATS.indexOf(meta.format) >= 0 ? meta.format : 'feature',
    createdAt:  now,
    updatedAt:  now
  };
  const arr = listProjects();
  arr.push(project);
  saveProjects(arr);
  setCurrentProject(project.id);
  notify('projects:changed', { reason: 'create', project });
  return project;
}

export function updateProject(id, patch) {
  const arr = listProjects();
  const idx = arr.findIndex(p => p.id === id);
  if (idx < 0) return null;
  Object.assign(arr[idx], patch || {}, { updatedAt: new Date().toISOString() });
  saveProjects(arr);
  notify('projects:changed', { reason: 'update', project: arr[idx] });
  notify('project:meta', arr[idx]);
  return arr[idx];
}

export function deleteProject(id) {
  const arr = listProjects().filter(p => p.id !== id);
  saveProjects(arr);
  // wipe namespaced data
  SCOPED_KEYS.forEach(k => rawRemove(k + '__' + id));
  if (currentProjectId() === id) {
    // pick another, or clear
    const next = arr[0] ? arr[0].id : null;
    rawSet(CURRENT_KEY, next || '');
    notify('current:changed', { id: next });
  }
  notify('projects:changed', { reason: 'delete', id });
  return true;
}

export function currentProjectId() {
  return rawGet(CURRENT_KEY) || null;
}

export function currentProject() {
  return getProject(currentProjectId());
}

export function setCurrentProject(id) {
  if (!getProject(id)) return false;
  rawSet(CURRENT_KEY, id);
  notify('current:changed', { id });
  return true;
}

// Bump updatedAt on the active project. Called by the storage
// proxy whenever any scoped key is written.
function touch() {
  const id = currentProjectId();
  if (!id) return;
  const arr = listProjects();
  const idx = arr.findIndex(p => p.id === id);
  if (idx < 0) return;
  arr[idx].updatedAt = new Date().toISOString();
  saveProjects(arr);
}

// ============================================================
// STORAGE PROXY
// ============================================================
// Monkey-patches Storage.prototype so that every existing
// `localStorage.getItem('fms_filmmaker_combined_v1')` etc.
// is transparently scoped to the current project.
//
// Idempotent — safe to call multiple times. Only installs once.
//
// MUST run before any other module reads localStorage — see the
// load-order banner at the top of this file.
// ============================================================
let _proxyInstalled = false;
export function installStorageProxy() {
  if (_proxyInstalled) return;
  _proxyInstalled = true;

  const proto = global.Storage && global.Storage.prototype;
  if (!proto) return; // bail gracefully in odd environments

  function scopedKey(k) {
    if (typeof k !== 'string') return k;
    if (SCOPED_KEYS.indexOf(k) < 0) return k;
    const id = currentProjectId();
    if (!id) return k; // no current project → fall back to legacy unsuffixed key
    return k + '__' + id;
  }

  const originalGet    = proto.getItem;
  const originalSet    = proto.setItem;
  const originalRemove = proto.removeItem;

  proto.getItem = function (k) {
    // only intercept on `localStorage` (not sessionStorage)
    if (this === global.localStorage) k = scopedKey(k);
    return originalGet.call(this, k);
  };
  proto.setItem = function (k, v) {
    if (this === global.localStorage) {
      const orig = k;
      k = scopedKey(k);
      const result = originalSet.call(this, k, v);
      if (k !== orig) {
        touch();
        // Tell the UI a save happened (debounced display in src/ui/chrome.js)
        notify('saved', { key: orig });
      }
      return result;
    }
    return originalSet.call(this, k, v);
  };
  proto.removeItem = function (k) {
    if (this === global.localStorage) k = scopedKey(k);
    return originalRemove.call(this, k);
  };
}

// ============================================================
// MIGRATION — one-time
// ============================================================
// If user has legacy single-project data (any of the SCOPED_KEYS
// present without a `__<id>` suffix) and no projects yet,
// create a project "My First Project" and move that data under it.
// ============================================================
/* ============================================================
   THE PREFIX MIGRATION — fms_ -> fms_
   ------------------------------------------------------------
   CLAUDE.md invariant 1: every localStorage key is load-bearing, and
   renaming one without a migration silently orphans somebody's
   writing. This renames all of them at once, so it is the one change
   in this repo that most needs to be boring and verifiable.

   FIVE PROPERTIES, each of which is a way this could have gone wrong:

   1. RAW, NOT PROXIED. It runs through the captured _orig* methods,
      before installStorageProxy() has patched anything. The proxy
      suffixes SCOPED_KEYS with the open project id; a migration that
      went through it would rename one project's data and silently
      skip the rest.

   2. PREFIX-ONLY, so the `__<projectId>` suffix and the open-ended
      families (note_, studio_backup_) come along without being
      enumerated. A list of 36 key names would be wrong the first
      time somebody added the 37th.

   3. SET, VERIFY, THEN REMOVE. The old key is deleted only after the
      new one is read back and compared. If setItem throws on quota
      the old value is still there, and the marker is not written, so
      the next load tries again.

   4. IT NEVER CLOBBERS. If a new-prefix key somehow already holds a
      different value, the old one is parked under a salvage name
      rather than either value being dropped.

   5. IDEMPOTENT AND INTERRUPT-SAFE. The marker is written last. A
      run killed halfway leaves the marker unset and the remaining
      old keys in place, and the next load finishes the job.

   The middle of the names is deliberately untouched — fms_library_calc_v1
   becomes fms_library_calc_v1 and not fms_budget_calc_v1, even though
   the estimator now lives on budget.html. Renaming the middle is a
   second migration, and hiding it inside this one is how a rename
   turns into data loss.
   ============================================================ */

const OLD_PREFIX = 'arunak_';
const NEW_PREFIX = 'fms_';
/* In the NEW namespace on purpose: were it an arunak_ key it would
   rename itself mid-run and the migration would look unfinished. */
const PREFIX_DONE_KEY = 'fms_studio_prefix_v1';

export function migratePrefix() {
  let done = null;
  try { done = _origGet(PREFIX_DONE_KEY); } catch (e) { return { ran: false, reason: 'storage unavailable' }; }
  if (done === '1') return { ran: false, reason: 'already migrated' };

  const old = [];
  try {
    for (let i = 0; i < global.localStorage.length; i++) {
      const k = global.localStorage.key(i);
      if (k && k.indexOf(OLD_PREFIX) === 0) old.push(k);
    }
  } catch (e) { return { ran: false, reason: 'enumeration failed' }; }

  const moved = [], kept = [], failed = [];
  for (const k of old) {
    const nk = NEW_PREFIX + k.slice(OLD_PREFIX.length);
    let value = null;
    try { value = _origGet(k); } catch (e) { failed.push(k); continue; }
    if (value == null) continue;

    let existing = null;
    try { existing = _origGet(nk); } catch (e) {}
    if (existing != null && existing !== value) {
      // Property 4. Park it; do not choose for the user.
      try { _origSet(NEW_PREFIX + 'salvage_' + k, value); _origRemove(k); kept.push(nk); } catch (e) { failed.push(k); }
      continue;
    }

    try {
      _origSet(nk, value);
      if (_origGet(nk) !== value) { failed.push(k); continue; }  // property 3
      _origRemove(k);
      moved.push(nk);
    } catch (e) {
      failed.push(k);   // quota or private mode: old key survives untouched
    }
  }

  if (!failed.length) {
    try { _origSet(PREFIX_DONE_KEY, '1'); } catch (e) {}
  }
  return { ran: true, moved: moved.length, collided: kept.length, failed: failed.length, failedKeys: failed };
}

export function migrateLegacy() {
  if (rawGet(SCHEMA_VERSION_KEY) === '1') return null; // already migrated
  const projects = listProjects();
  const hasLegacy = SCOPED_KEYS.some(k => rawGet(k) != null);

  if (projects.length === 0 && hasLegacy) {
    // Try to read the existing feature title for a nice name
    let title = 'My First Project';
    try {
      const featRaw = rawGet('fms_filmmaker_combined_v1');
      if (featRaw) {
        const feat = JSON.parse(featRaw);
        if (feat && (feat.meta_title || feat.v1_title)) {
          title = (feat.meta_title || feat.v1_title).trim() || title;
        }
      }
    } catch (e) {}

    const project = createProject({ title, format: 'feature' });

    // Move legacy keys to namespaced keys
    SCOPED_KEYS.forEach(k => {
      const v = rawGet(k);
      if (v != null) {
        rawSet(k + '__' + project.id, v);
        rawRemove(k);
      }
    });

    rawSet(SCHEMA_VERSION_KEY, '1');
    notify('migration:done', { project });
    return project;
  }

  rawSet(SCHEMA_VERSION_KEY, '1');
  return null;
}

// ============================================================
// PUB/SUB BUS
// ============================================================
const _subs = {};
export function subscribe(event, cb) {
  if (!_subs[event]) _subs[event] = [];
  _subs[event].push(cb);
  return function unsubscribe() {
    _subs[event] = (_subs[event] || []).filter(fn => fn !== cb);
  };
}
export function notify(event, payload) {
  (_subs[event] || []).forEach(fn => {
    try { fn(payload); } catch (e) { console.warn('[StudioStore]', event, e); }
  });
  // wildcard `*` listeners receive the event name as first arg
  (_subs['*'] || []).forEach(fn => {
    try { fn(event, payload); } catch (e) { console.warn('[StudioStore]', event, e); }
  });
}

// ============================================================
// CROSS-FIELD BINDING — `data-bind="project.meta.title"`
// ============================================================
// Two-way bind any input to a path on the current project meta.
// Today we support: project.meta.title, project.meta.format
// Future paths (project.protagonist.name, project.scenes[]) plug
// into the same pattern but read/write through the blueprint
// storage instead of the project meta.
// ============================================================
export function bindElements(root) {
  root = root || document;
  const els = root.querySelectorAll('[data-bind]');
  els.forEach(el => {
    const path = el.getAttribute('data-bind');
    if (!path) return;
    // initial population
    const v = readPath(path);
    if (v != null) setElValue(el, v);
    // listen for changes from elsewhere
    subscribe('bind:' + path, function (newVal) {
      if (document.activeElement !== el) setElValue(el, newVal);
    });
    // write back on input
    const handler = function () {
      const val = getElValue(el);
      writePath(path, val);
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });
}

function getElValue(el) {
  if (el.type === 'checkbox') return el.checked;
  return el.value;
}
function setElValue(el, v) {
  if (el.type === 'checkbox') el.checked = !!v;
  else if (el.value !== v) el.value = v == null ? '' : v;
  // also update any text-display siblings tagged data-bind-text
  const display = document.querySelectorAll('[data-bind-text="' + el.getAttribute('data-bind') + '"]');
  display.forEach(d => { d.textContent = v == null ? '' : v; });
}

function readPath(path) {
  // only `project.meta.<key>` for now
  const parts = path.split('.');
  if (parts[0] !== 'project') return null;
  const proj = currentProject();
  if (!proj) return null;
  if (parts[1] === 'meta') return proj[parts[2]];
  return null;
}
function writePath(path, value) {
  const parts = path.split('.');
  if (parts[0] !== 'project') return;
  const proj = currentProject();
  if (!proj) return;
  if (parts[1] === 'meta') {
    const patch = {};
    patch[parts[2]] = value;
    updateProject(proj.id, patch);
    // notify all bound listeners
    notify('bind:' + path, value);
    // also update any text displays everywhere on the page
    document.querySelectorAll('[data-bind-text="' + path + '"]').forEach(d => {
      d.textContent = value == null ? '' : value;
    });
  }
}

export function refreshAllBoundDisplays(root) {
  root = root || document;
  root.querySelectorAll('[data-bind]').forEach(el => {
    const path = el.getAttribute('data-bind');
    const v = readPath(path);
    if (v != null) setElValue(el, v);
  });
  root.querySelectorAll('[data-bind-text]').forEach(el => {
    const path = el.getAttribute('data-bind-text');
    const v = readPath(path);
    el.textContent = v == null ? '' : v;
  });
}

// ============================================================
// BLUEPRINT HELPER — wires the toolbar "← STUDIO · <project>" link
// and shows a banner when no project is selected.
// Each blueprint calls this once at end of body.
// ============================================================
export function wireBlueprintHeader(opts) {
  opts = opts || {};
  const linkId  = opts.linkId  || 'studioProjLink';
  const labelId = opts.labelId || 'studioProjLabel';
  function update() {
    const p = currentProject();
    const link = document.getElementById(linkId);
    const lab  = document.getElementById(labelId);
    if (!link || !lab) return;
    if (p) {
      lab.textContent = p.title;
      link.classList.remove('no-project');
      link.title = 'Back to Studio · editing "' + p.title + '"';
    } else {
      lab.textContent = 'NO PROJECT — pick one';
      link.classList.add('no-project');
      link.title = 'No project selected. Click to go to the Studio and pick or create one.';
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', update);
  } else {
    update();
  }
  subscribe('current:changed', update);
  subscribe('project:meta', update);

  // Also show a banner if no project — makes it impossible to miss
  function ensureBanner() {
    if (currentProject()) {
      const existing = document.getElementById('studioNoProjectBanner');
      if (existing) existing.remove();
      return;
    }
    if (document.getElementById('studioNoProjectBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'studioNoProjectBanner';
    // Styling lives in chrome-injected.css (imported here) so it can use
    // tokens. It was an inline cssText blob with two raw colours, the
    // text one being the pre-token paper value, so the banner did not
    // move with the theme.
    banner.className = 'studio-no-project-banner';
    banner.append(
      '⚠ NO PROJECT SELECTED — your edits won\'t save until you pick a project. '
    );
    const link = document.createElement('a');
    link.href = 'index.html';
    link.textContent = 'GO TO STUDIO →';
    banner.append(link);
    document.body.insertBefore(banner, document.body.firstChild);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureBanner);
  } else {
    ensureBanner();
  }
  subscribe('current:changed', ensureBanner);
}

// Re-render bound displays whenever the active project changes
subscribe('current:changed', () => refreshAllBoundDisplays());
subscribe('project:meta',     () => refreshAllBoundDisplays());

// ============================================================
// PUBLIC API
// ============================================================
// Shape is identical to the old `window.StudioStore` global so that
// legacy inline page scripts keep working unchanged.
const StudioStore = {
  // version
  VERSION: '1.0.0',

  // projects
  listProjects,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  currentProjectId,
  currentProject,
  setCurrentProject,

  // bus
  subscribe,
  notify,

  // bindings
  bindElements,
  refreshAllBoundDisplays,
  wireBlueprintHeader,

  // storage
  installStorageProxy,
  migrateLegacy,

  // raw helpers (handy for blueprints)
  rawGet, rawSet, rawRemove, jsonGet, jsonSet,

  // constants
  FORMATS,
  SCOPED_KEYS
};

export const VERSION = StudioStore.VERSION;

// ============================================================
// SHARED CSS
// ============================================================
// Used to build a CSS string and inject <style id="studio-store-styles">.
// The rules now live in src/styles/chrome-injected.css, imported at the
// top of this module, so the bundler owns them. This function is kept
// (and still called by init()) purely so the public API shape and any
// legacy caller keep working; it is intentionally a no-op.
export function injectSharedStyles() {
  /* rules moved to ../styles/chrome-injected.css — imported above */
}

// ============================================================
// INIT — migration + storage proxy + shared styles
// ============================================================
// Called once at module evaluation (below), exactly as the old file's
// auto-init block did. Exported so an entry point can be explicit
// about the ordering requirement documented at the top of this file.
// Idempotent: migrateLegacy() short-circuits on the schema flag and
// installStorageProxy() only installs once.
export function init() {
  try {
    /* FIRST, before anything reads a key and before the proxy is
       installed. migrateLegacy() reads SCOPED_KEYS by their current
       names, so the prefix has to be settled before it runs — and
       the proxy has to be absent, or the rename would only reach the
       open project. */
    migratePrefix();
    migrateLegacy();
    installStorageProxy();
    injectSharedStyles();
  } catch (e) {
    console.warn('[StudioStore] init error', e);
  }
}

// Auto-init: run migration + install proxy as soon as we load.
// (Blueprints relying on existing `localStorage.getItem(KEY)`
// calls will Just Work after this.)
init();

// Auto-wire the blueprint header link if the elements are present.
// Blueprints just need to include `<a id="studioProjLink"><span id="studioProjLabel">…</span></a>`
// and StudioStore takes care of label + banner.
function autoWireIfBlueprint() {
  if (document.getElementById('studioProjLink')) wireBlueprintHeader();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoWireIfBlueprint);
} else {
  autoWireIfBlueprint();
}

// ============================================================
// AUTO TITLE BRIDGE
// ------------------------------------------------------------
// Two-way sync between a blueprint's title fields and the
// project's meta.title, so typing the title once reflects
// everywhere — toolbar, project list, blueprint header, exports.
//
// Bridges any input with data-key="meta_title" or "v1_title".
// Runs slightly after DOMContentLoaded so the blueprint's own
// load logic populates fields first.
// ============================================================
function autoBridgeTitle() {
  if (typeof document === 'undefined') return;

  function setup() {
    const fields = document.querySelectorAll(
      '[data-key="meta_title"], [data-key="v1_title"]'
    );
    if (!fields.length) return;

    function pushToFields(value) {
      fields.forEach(el => {
        if (document.activeElement !== el && el.value !== value) {
          el.value = value || '';
          // Tell the existing data-key save handler (in each
          // blueprint) that this field changed, so it persists.
          try {
            el.dispatchEvent(new Event('input',  { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (e) {}
        }
      });
    }

    function pullFromField(el) {
      const proj = currentProject();
      if (!proj) return;
      const v = (el.value || '').trim();
      if (v && v !== proj.title) updateProject(proj.id, { title: v });
    }

    // Sync after blueprint's own loadAll (~100 ms is plenty)
    setTimeout(() => {
      const proj = currentProject();
      if (!proj) return;
      const firstFilled = Array.prototype.find.call(
        fields, el => el.value && el.value.trim()
      );
      // If field has a real value and project is still "Untitled
      // Project", lift the field value up into project meta.
      if (firstFilled &&
          (!proj.title || /^untitled/i.test(proj.title))) {
        updateProject(proj.id, { title: firstFilled.value.trim() });
        pushToFields(firstFilled.value.trim());
      } else if (proj.title) {
        pushToFields(proj.title);
      }
    }, 100);

    subscribe('project:meta', (p) => { if (p) pushToFields(p.title); });

    fields.forEach(el => {
      el.addEventListener('input',  () => pullFromField(el));
      el.addEventListener('change', () => pullFromField(el));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
}
autoBridgeTitle();

// Legacy inline page scripts call this by global name; the HTML pages
// migrate later, so keep the global assignment.
global.StudioStore = StudioStore;

export { FORMATS, SCOPED_KEYS, StudioStore };
export default StudioStore;
