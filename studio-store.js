/* ============================================================
   THE FILMMAKER'S STUDIO — PROJECT STORE
   ------------------------------------------------------------
   A tiny, dependency-free module that adds:
     1. A multi-project model (was single-project before)
     2. Per-project namespaced localStorage (legacy keys auto-suffix)
     3. A subscribe/notify bus for cross-field cascading
     4. One-time migration of existing single-project data
     5. A preamble (`StudioStore.installStorageProxy()`) that any
        blueprint can call ONCE at top of its <script> to make all
        legacy `localStorage.getItem('arunak_…')` calls transparently
        scope to the current project — no other code changes needed.

   Loaded as a plain <script> — no build step. Same self-contained
   spirit as the rest of the studio.
   ============================================================ */
(function (global) {
  'use strict';

  // ============================================================
  // CONSTANTS
  // ============================================================
  const PROJECTS_KEY        = 'arunak_studio_projects_v1';     // array of project meta
  const CURRENT_KEY         = 'arunak_studio_current_project_v1'; // string projectId
  const SCHEMA_VERSION_KEY  = 'arunak_studio_schema_v1';       // for future migrations

  // Legacy per-blueprint keys that should be project-scoped.
  // Anything in this list gets auto-suffixed with `__<projectId>`
  // when read or written through the storage proxy.
  const SCOPED_KEYS = [
    'arunak_filmmaker_combined_v1',
    'arunak_shortfilm_blueprint_v1',
    'arunak_library_calc_v1',
    'arunak_filmmaker_prefs_v1',
    'arunak_shortfilm_prefs_v1',
    'arunak_library_prefs_v1',
    'arunak_studio_activity_v1'
    // intentionally NOT scoped: arunak_studio_prefs_v1 (dark mode = global),
    //                            arunak_supabase_cfg_v1 (account-level),
    //                            arunak_note_* (per-field notes, fine global for now)
  ];

  const FORMATS = ['feature', 'short', 'documentary', 'musicvideo', 'adfilm'];

  // ============================================================
  // INTERNAL: low-level localStorage access (BEFORE proxy)
  // ============================================================
  // We capture the original methods so the proxy can call through.
  const _origGet    = global.localStorage.getItem.bind(global.localStorage);
  const _origSet    = global.localStorage.setItem.bind(global.localStorage);
  const _origRemove = global.localStorage.removeItem.bind(global.localStorage);

  function rawGet(k)        { try { return _origGet(k); } catch (e) { return null; } }
  function rawSet(k, v)     { try { _origSet(k, v); return true; } catch (e) { return false; } }
  function rawRemove(k)     { try { _origRemove(k); return true; } catch (e) { return false; } }

  function jsonGet(k, fallback) {
    const raw = rawGet(k);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }
  function jsonSet(k, v) { return rawSet(k, JSON.stringify(v)); }

  // ============================================================
  // PROJECTS — list / CRUD
  // ============================================================
  function uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  function listProjects() {
    const arr = jsonGet(PROJECTS_KEY, []);
    return Array.isArray(arr) ? arr : [];
  }

  function getProject(id) {
    if (!id) return null;
    return listProjects().find(p => p.id === id) || null;
  }

  function saveProjects(arr) { jsonSet(PROJECTS_KEY, arr); }

  function createProject(meta) {
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

  function updateProject(id, patch) {
    const arr = listProjects();
    const idx = arr.findIndex(p => p.id === id);
    if (idx < 0) return null;
    Object.assign(arr[idx], patch || {}, { updatedAt: new Date().toISOString() });
    saveProjects(arr);
    notify('projects:changed', { reason: 'update', project: arr[idx] });
    notify('project:meta', arr[idx]);
    return arr[idx];
  }

  function deleteProject(id) {
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

  function currentProjectId() {
    return rawGet(CURRENT_KEY) || null;
  }

  function currentProject() {
    return getProject(currentProjectId());
  }

  function setCurrentProject(id) {
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
  // `localStorage.getItem('arunak_filmmaker_combined_v1')` etc.
  // is transparently scoped to the current project.
  //
  // Idempotent — safe to call multiple times. Only installs once.
  // ============================================================
  let _proxyInstalled = false;
  function installStorageProxy() {
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
          // Tell the UI a save happened (debounced display in studio-ui.js)
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
  function migrateLegacy() {
    if (rawGet(SCHEMA_VERSION_KEY) === '1') return null; // already migrated
    const projects = listProjects();
    const hasLegacy = SCOPED_KEYS.some(k => rawGet(k) != null);

    if (projects.length === 0 && hasLegacy) {
      // Try to read the existing feature title for a nice name
      let title = 'My First Project';
      try {
        const featRaw = rawGet('arunak_filmmaker_combined_v1');
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
  function subscribe(event, cb) {
    if (!_subs[event]) _subs[event] = [];
    _subs[event].push(cb);
    return function unsubscribe() {
      _subs[event] = (_subs[event] || []).filter(fn => fn !== cb);
    };
  }
  function notify(event, payload) {
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
  function bindElements(root) {
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

  function refreshAllBoundDisplays(root) {
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
  function wireBlueprintHeader(opts) {
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
      banner.style.cssText =
        'position:sticky;top:0;z-index:101;background:#b03a1f;color:#f5ecd6;' +
        'padding:10px 16px;text-align:center;font-family:JetBrains Mono,monospace;' +
        'font-size:11px;letter-spacing:1.5px;font-weight:600;';
      banner.innerHTML =
        '⚠ NO PROJECT SELECTED — your edits won\'t save until you pick a project. ' +
        '<a href="index.html" style="color:#f5ecd6;text-decoration:underline;">GO TO STUDIO →</a>';
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

  // ============================================================
  // SHARED CSS — injected so every blueprint has the project-link
  // styling without each having to define it.
  // ============================================================
  function injectSharedStyles() {
    if (document.getElementById('studio-store-styles')) return;
    const css =
      '.studio-proj-link {' +
        'display: inline-flex; align-items: center; gap: 6px;' +
        'color: #f5ecd6; text-decoration: none;' +
        'font-family: \'JetBrains Mono\', monospace;' +
        'font-size: 10px; letter-spacing: 1.5px;' +
        'padding: 6px 11px; border-radius: 2px;' +
        'border: 1px solid rgba(244,237,224,0.3);' +
        'background: rgba(244,237,224,0.04);' +
        'transition: all 0.15s; max-width: 260px;' +
        'font-weight: 600;' +
      '}' +
      '.studio-proj-link:hover {' +
        'background: rgba(244,237,224,0.15);' +
        'border-color: rgba(244,237,224,0.6);' +
      '}' +
      '.studio-proj-link .spl-arrow { opacity: 0.7; }' +
      '.studio-proj-link .spl-label {' +
        'overflow: hidden; text-overflow: ellipsis; white-space: nowrap;' +
        'max-width: 200px;' +
      '}' +
      '.studio-proj-link.no-project {' +
        'border-color: #b03a1f; background: rgba(176,58,31,0.18);' +
        'color: #ffbfa8;' +
      '}' +
      '.studio-proj-link.no-project:hover { background: rgba(176,58,31,0.32); }';
    const style = document.createElement('style');
    style.id = 'studio-store-styles';
    style.textContent = css;
    if (document.head) document.head.appendChild(style);
    else document.addEventListener('DOMContentLoaded', () => document.head.appendChild(style));
  }

  // Auto-init: run migration + install proxy as soon as we load.
  // (Blueprints relying on existing `localStorage.getItem(KEY)`
  // calls will Just Work after this.)
  try {
    migrateLegacy();
    installStorageProxy();
    injectSharedStyles();
  } catch (e) {
    console.warn('[StudioStore] init error', e);
  }

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

  global.StudioStore = StudioStore;
})(typeof window !== 'undefined' ? window : this);
