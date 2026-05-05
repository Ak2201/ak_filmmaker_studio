/* ============================================================
   THE FILMMAKER'S STUDIO — CLOUD LAYER (v3)
   ------------------------------------------------------------
   Layered on top of StudioStore (local-first). Adds:
     - Supabase auth (magic link + Google)
     - Cloud sync of every project (push debounced, pull realtime)
     - Sharing (links + claim flow)
     - Comments (per-data-key threads, suggestion accept/reject)

   Loaded as a plain <script type="module"> after studio-store.js
   and studio-ui.js. Idempotent — safe to reload.
   ============================================================ */
(async function () {
  'use strict';

  if (!window.StudioStore) {
    console.warn('[StudioCloud] StudioStore must load first.');
    return;
  }
  const Store = window.StudioStore;

  // ============================================================
  // CONSTANTS
  // ============================================================
  const SDK_URL          = 'https://esm.sh/@supabase/supabase-js@2.45.4';
  const CFG_KEY          = 'arunak_supabase_cfg_v1';        // { url, key } — public
  const QUEUE_KEY        = 'arunak_studio_cloud_queue_v1';  // offline queue
  const MIGRATE_FLAG_KEY = 'arunak_studio_migrated_v1';     // <userId> = migrated
  const MIGRATE_LOCK_KEY = 'arunak_studio_migrate_lock_v1'; // ts when running

  // Map between localStorage scoped-key and DB scope name
  const SCOPE_BY_KEY = {
    'arunak_filmmaker_combined_v1':  'feature',
    'arunak_shortfilm_blueprint_v1': 'short',
    'arunak_library_calc_v1':        'library',
    'arunak_filmmaker_prefs_v1':     'feature_prefs',
    'arunak_shortfilm_prefs_v1':     'short_prefs',
    'arunak_library_prefs_v1':       'library_prefs',
    'arunak_studio_activity_v1':     'activity'
  };
  const KEY_BY_SCOPE = Object.fromEntries(
    Object.entries(SCOPE_BY_KEY).map(([k, v]) => [v, k])
  );

  // ============================================================
  // STATE
  // ============================================================
  let supabase = null;          // client instance, null until configured
  let session = null;           // current session, null until signed in
  let cfg = null;               // {url,key}
  let _applyingRemote = false;  // echo-loop guard
  let _activeChannels = [];     // realtime subscriptions for current project
  let _migrationPromise = null; // single-flight migration guard

  // ============================================================
  // CFG (URL + anon key — both public, gated by RLS)
  // ============================================================
  function getCfg() {
    try { return JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); }
    catch (e) { return null; }
  }
  function setCfg(c) {
    if (c && c.url && c.key) {
      localStorage.setItem(CFG_KEY, JSON.stringify({ url: c.url.trim(), key: c.key.trim() }));
      cfg = c;
    } else {
      localStorage.removeItem(CFG_KEY);
      cfg = null;
    }
  }

  // ============================================================
  // CLIENT INIT — loads SDK on demand
  // ============================================================
  async function ensureClient() {
    if (supabase) return supabase;
    cfg = getCfg();
    if (!cfg || !cfg.url || !cfg.key) return null;
    try {
      const mod = await import(SDK_URL);
      supabase = mod.createClient(cfg.url, cfg.key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        },
        realtime: {
          params: { eventsPerSecond: 5 }
        }
      });
      // Restore session
      const { data } = await supabase.auth.getSession();
      session = data.session;
      // Listen for auth changes
      supabase.auth.onAuthStateChange((event, sess) => {
        const wasNull = !session;
        session = sess;
        notifyAuth(event, sess);
        if (sess && wasNull) {
          // First time signed in this load — try migration
          maybeMigrateLocalToCloud();
          attachToCurrentProject();
        }
        if (!sess) {
          tearDownChannels();
        }
      });
      return supabase;
    } catch (e) {
      console.warn('[StudioCloud] failed to load SDK', e);
      return null;
    }
  }

  // ============================================================
  // AUTH
  // ============================================================
  const authListeners = new Set();
  function onAuth(cb) { authListeners.add(cb); return () => authListeners.delete(cb); }
  function notifyAuth(event, sess) {
    authListeners.forEach(fn => { try { fn(event, sess); } catch (e) {} });
  }
  function getSession() { return session; }
  function getUser()    { return session && session.user; }
  function getUserEmail() {
    if (!session || !session.user) return null;
    return session.user.email || (session.user.user_metadata && session.user.user_metadata.email);
  }

  async function signInWithEmail(email) {
    const sb = await ensureClient();
    if (!sb) throw new Error('Cloud not configured. Open Settings to add your Supabase URL + anon key.');
    const { error } = await sb.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
    return true;
  }

  async function signInWithGoogle() {
    const sb = await ensureClient();
    if (!sb) throw new Error('Cloud not configured.');
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: location.origin + location.pathname }
    });
    if (error) throw error;
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    session = null;
    tearDownChannels();
  }

  // ============================================================
  // MIGRATION
  // ============================================================
  async function maybeMigrateLocalToCloud() {
    if (!session) return;
    const userId = session.user.id;
    const flag = Store.rawGet(MIGRATE_FLAG_KEY);
    if (flag === userId) return;  // already migrated for this user
    // Avoid race when two tabs sign in at the same time
    const lock = parseInt(Store.rawGet(MIGRATE_LOCK_KEY) || '0', 10);
    if (lock && (Date.now() - lock) < 30_000) return;
    Store.rawSet(MIGRATE_LOCK_KEY, String(Date.now()));

    if (_migrationPromise) return _migrationPromise;
    _migrationPromise = (async () => {
      try {
        const local = Store.listProjects();
        if (!local.length) {
          // Nothing to migrate — but still pull cloud projects
          await pullProjectList();
          Store.rawSet(MIGRATE_FLAG_KEY, userId);
          return;
        }
        // Ask the user
        const ok = await askMigratePrompt(local.length);
        if (!ok) {
          // Don't re-prompt; mark as migrated even though we didn't do anything,
          // so they can sign in/out without the prompt re-appearing.
          Store.rawSet(MIGRATE_FLAG_KEY, userId);
          await pullProjectList();
          return;
        }
        await uploadAllLocalProjects(local);
        Store.rawSet(MIGRATE_FLAG_KEY, userId);
        toast('Uploaded ' + local.length + ' project' + (local.length === 1 ? '' : 's') + ' to cloud.', 'success');
      } catch (e) {
        console.warn('[StudioCloud] migrate failed', e);
        toast('Migration failed: ' + (e.message || e), 'error');
      } finally {
        Store.rawRemove(MIGRATE_LOCK_KEY);
        _migrationPromise = null;
      }
    })();
    return _migrationPromise;
  }

  async function askMigratePrompt(count) {
    if (window.StudioUI && StudioUI.openMigrationModal) {
      return await StudioUI.openMigrationModal(count);
    }
    return confirm('Found ' + count + ' local project(s). Upload to your cloud account?');
  }

  async function uploadAllLocalProjects(localProjects) {
    if (!supabase) return;
    const userId = session.user.id;
    for (const p of localProjects) {
      // Insert/update project meta — keep the same UUID locally so we don't
      // need a key rewrite. The cloud accepts the local UUID directly.
      const { error: pe } = await supabase.from('projects').upsert({
        id: p.id,
        owner_id: userId,
        title: p.title,
        format: p.format || 'feature',
        created_at: p.createdAt || new Date().toISOString(),
        updated_at: p.updatedAt || new Date().toISOString()
      }, { onConflict: 'id' });
      if (pe) { console.warn('[migrate proj]', pe); continue; }

      // Push every scope
      for (const [k, scope] of Object.entries(SCOPE_BY_KEY)) {
        const raw = Store.rawGet(k + '__' + p.id);
        if (!raw) continue;
        let json = null;
        try { json = JSON.parse(raw); } catch (e) { json = raw; }
        await supabase.from('project_data').upsert({
          project_id: p.id,
          scope: scope,
          data: json,
          updated_at: new Date().toISOString(),
          updated_by: userId
        }, { onConflict: 'project_id,scope' });
      }
    }
  }

  async function pullProjectList() {
    if (!supabase || !session) return;
    const { data, error } = await supabase
      .from('projects')
      .select('id,title,format,created_at,updated_at,owner_id')
      .order('updated_at', { ascending: false });
    if (error) { console.warn('[pull list]', error); return; }
    if (!data) return;
    // Merge into local: any project_id we don't have, add it.
    const localIds = new Set(Store.listProjects().map(p => p.id));
    for (const row of data) {
      if (!localIds.has(row.id)) {
        // Add to local list directly via Store internals (bypass createProject which
        // would set as current). We use a direct write to projects key.
        const all = Store.listProjects();
        all.push({
          id: row.id,
          title: row.title,
          format: row.format,
          createdAt: row.created_at,
          updatedAt: row.updated_at
        });
        Store.rawSet('arunak_studio_projects_v1', JSON.stringify(all));
      }
      // For each scope, pull the data
      await pullProjectData(row.id);
    }
    Store.notify('projects:changed', { reason: 'cloud-pull' });
  }

  async function pullProjectData(projectId) {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('project_data')
      .select('scope,data,updated_at')
      .eq('project_id', projectId);
    if (error) { console.warn('[pull data]', error); return; }
    if (!data) return;
    _applyingRemote = true;
    try {
      for (const row of data) {
        const localKey = KEY_BY_SCOPE[row.scope];
        if (!localKey) continue;
        const namespacedKey = localKey + '__' + projectId;
        // compare timestamps: only overwrite if remote is newer or local missing
        const localRaw = Store.rawGet(namespacedKey);
        if (localRaw) {
          // We don't store updated_at locally, so we always trust remote on pull.
          // (Push debounce ensures local edits win after the user types.)
        }
        Store.rawSet(namespacedKey, JSON.stringify(row.data || {}));
      }
    } finally {
      _applyingRemote = false;
    }
  }

  // ============================================================
  // PUSH ENGINE
  // ============================================================
  const _pushTimers = new Map();
  function _debouncedPush(projectId, scope, delay) {
    if (!projectId || !scope) return;
    const k = projectId + '::' + scope;
    clearTimeout(_pushTimers.get(k));
    _pushTimers.set(k, setTimeout(() => {
      _pushTimers.delete(k);
      _pushScope(projectId, scope).catch(e => {
        console.warn('[push]', e);
        _enqueue({ kind: 'upsert', projectId, scope });
      });
    }, delay || 800));
  }

  async function _pushScope(projectId, scope) {
    if (!supabase || !session) {
      _enqueue({ kind: 'upsert', projectId, scope });
      return;
    }
    const localKey = KEY_BY_SCOPE[scope];
    if (!localKey) return;
    const raw = Store.rawGet(localKey + '__' + projectId);
    let json = {};
    if (raw) { try { json = JSON.parse(raw); } catch (e) { json = {}; } }
    const { error } = await supabase.from('project_data').upsert({
      project_id: projectId,
      scope: scope,
      data: json,
      updated_at: new Date().toISOString(),
      updated_by: session.user.id
    }, { onConflict: 'project_id,scope' });
    if (error) {
      console.warn('[push scope]', error);
      _enqueue({ kind: 'upsert', projectId, scope });
      throw error;
    }
  }

  async function _pushProjectMeta(project) {
    if (!supabase || !session || !project) return;
    const { error } = await supabase.from('projects').upsert({
      id: project.id,
      owner_id: session.user.id,
      title: project.title,
      format: project.format,
      created_at: project.createdAt,
      updated_at: project.updatedAt
    }, { onConflict: 'id' });
    if (error) {
      console.warn('[push meta]', error);
      _enqueue({ kind: 'meta', project });
    }
  }

  async function _deleteProjectInCloud(projectId) {
    if (!supabase || !session) return;
    await supabase.from('projects').delete().eq('id', projectId);
  }

  // ============================================================
  // OFFLINE QUEUE
  // ============================================================
  function _readQueue() {
    try { return JSON.parse(Store.rawGet(QUEUE_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function _writeQueue(arr) {
    Store.rawSet(QUEUE_KEY, JSON.stringify(arr));
  }
  function _enqueue(op) {
    const q = _readQueue();
    // dedupe — drop existing same (kind, projectId, scope)
    const filtered = q.filter(o =>
      !(o.kind === op.kind &&
        o.projectId === op.projectId &&
        o.scope === op.scope &&
        JSON.stringify(o.project) === JSON.stringify(op.project))
    );
    filtered.push(Object.assign({}, op, { ts: Date.now() }));
    _writeQueue(filtered);
  }
  async function _flushQueue() {
    const q = _readQueue();
    if (!q.length || !supabase || !session) return;
    const remaining = [];
    for (const op of q) {
      try {
        if (op.kind === 'upsert') await _pushScope(op.projectId, op.scope);
        else if (op.kind === 'meta') await _pushProjectMeta(op.project);
        else if (op.kind === 'delete') await _deleteProjectInCloud(op.projectId);
      } catch (e) {
        remaining.push(op);
      }
    }
    _writeQueue(remaining);
    if (q.length && !remaining.length) {
      toast('Synced ' + q.length + ' offline change' + (q.length === 1 ? '' : 's'), 'success', 1800);
    }
  }
  window.addEventListener('online',  () => { setTimeout(_flushQueue, 500); });
  setInterval(() => { if (navigator.onLine) _flushQueue(); }, 30_000);

  // ============================================================
  // REALTIME
  // ============================================================
  function tearDownChannels() {
    _activeChannels.forEach(ch => { try { ch.unsubscribe(); } catch (e) {} });
    _activeChannels = [];
  }
  async function attachToCurrentProject() {
    if (!supabase || !session) return;
    tearDownChannels();
    const pid = Store.currentProjectId();
    if (!pid) return;
    // 1. Pull latest data
    await pullProjectData(pid);
    // 2. Subscribe to changes
    const dataChannel = supabase
      .channel('pd:' + pid)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'project_data',
          filter: 'project_id=eq.' + pid },
        payload => _onRemoteData(payload))
      .subscribe();
    const commentsChannel = supabase
      .channel('cm:' + pid)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'comments',
          filter: 'project_id=eq.' + pid },
        payload => _onRemoteComment(payload))
      .subscribe();
    _activeChannels = [dataChannel, commentsChannel];
  }

  function _onRemoteData(payload) {
    const row = payload.new || payload.old;
    if (!row) return;
    if (session && row.updated_by === session.user.id) return;  // self echo
    const localKey = KEY_BY_SCOPE[row.scope];
    if (!localKey) return;
    const namespacedKey = localKey + '__' + row.project_id;
    _applyingRemote = true;
    try {
      Store.rawSet(namespacedKey, JSON.stringify(row.data || {}));
    } finally {
      _applyingRemote = false;
    }
    // Re-render visible inputs if blueprint exposes a reload hook
    if (typeof window.loadAll === 'function') {
      try { window.loadAll(); } catch (e) {}
    }
    Store.notify('cloud:synced', { projectId: row.project_id, scope: row.scope });
    toast('Synced from another device.', 'info', 1800);
  }
  function _onRemoteComment(payload) {
    Store.notify('cloud:comment', payload);
  }

  // ============================================================
  // SHARING
  // ============================================================
  function genToken() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    return Math.random().toString(36).slice(2) + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  async function createShare(projectId, role, expiresAt) {
    if (!supabase || !session) throw new Error('Sign in first.');
    const token = genToken();
    const { error } = await supabase.from('shares').insert({
      project_id: projectId,
      role: role || 'comment',
      token: token,
      expires_at: expiresAt || null,
      created_by: session.user.id
    });
    if (error) throw error;
    return token;
  }
  async function listShares(projectId) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('shares')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) { console.warn('[list shares]', error); return []; }
    return data || [];
  }
  async function revokeShare(shareId) {
    if (!supabase) return;
    const { error } = await supabase.from('shares').delete().eq('id', shareId);
    if (error) throw error;
  }
  async function resolveShareToken(token) {
    if (!supabase) await ensureClient();
    if (!supabase) return null;
    const { data, error } = await supabase.rpc('resolve_share', { p_token: token });
    if (error) { console.warn('[resolve]', error); return null; }
    return (data && data[0]) || null;
  }
  async function claimShare(token) {
    if (!supabase || !session) throw new Error('Sign in first to claim a share.');
    const { data, error } = await supabase.rpc('claim_share', { p_token: token });
    if (error) throw error;
    return (data && data[0]) || null;
  }

  // ============================================================
  // COMMENTS (P7 — minimal API, full UI in next session)
  // ============================================================
  async function listComments(projectId, scope, fieldKey) {
    if (!supabase) return [];
    let q = supabase.from('comments').select('*').eq('project_id', projectId);
    if (scope) q = q.eq('scope', scope);
    if (fieldKey) q = q.eq('field_key', fieldKey);
    const { data, error } = await q.order('created_at');
    if (error) { console.warn('[comments list]', error); return []; }
    return data || [];
  }
  async function createComment(opts) {
    if (!supabase || !session) throw new Error('Sign in to comment.');
    const row = {
      project_id: opts.projectId,
      scope: opts.scope,
      field_key: opts.fieldKey,
      author_id: session.user.id,
      author_name: getUserEmail() || 'Anonymous',
      body: opts.body,
      type: opts.type || 'comment',
      parent_id: opts.parentId || null,
      suggest_from: opts.suggestFrom || null,
      suggest_to: opts.suggestTo || null
    };
    const { error } = await supabase.from('comments').insert(row);
    if (error) throw error;
  }
  async function updateCommentStatus(id, status) {
    if (!supabase) return;
    const { error } = await supabase.from('comments').update({ status }).eq('id', id);
    if (error) throw error;
  }

  // ============================================================
  // STORE EVENT WIRE-UP
  // ============================================================
  Store.subscribe('saved', ({ key }) => {
    if (_applyingRemote) return;
    if (!session) return;  // not signed in → no cloud push
    const scope = SCOPE_BY_KEY[key];
    if (!scope) return;
    const pid = Store.currentProjectId();
    if (!pid) return;
    _debouncedPush(pid, scope);
  });
  Store.subscribe('current:changed', () => {
    if (session) attachToCurrentProject();
  });
  Store.subscribe('projects:changed', (info) => {
    if (!session) return;
    if (!info) return;
    if (info.reason === 'create' || info.reason === 'update') {
      if (info.project) _pushProjectMeta(info.project);
    } else if (info.reason === 'delete') {
      if (info.id) {
        _deleteProjectInCloud(info.id).catch(e => {
          _enqueue({ kind: 'delete', projectId: info.id });
        });
      }
    }
  });

  // ============================================================
  // SHARED-LINK URL HANDLER (?share=<token>)
  // ============================================================
  async function handleSharedLink() {
    const params = new URLSearchParams(location.search);
    const token = params.get('share');
    if (!token) return;
    await ensureClient();
    if (!supabase) {
      // need to configure first
      if (window.StudioUI && StudioUI.openCloudAuthModal) StudioUI.openCloudAuthModal({ shareToken: token });
      return;
    }
    const meta = await resolveShareToken(token);
    if (!meta) {
      toast('This share link is invalid.', 'error');
      return;
    }
    if (meta.is_expired) {
      toast('This share link has expired.', 'error');
      return;
    }
    if (!session) {
      // prompt sign-in then claim
      if (window.StudioUI && StudioUI.openCloudAuthModal) {
        StudioUI.openCloudAuthModal({ shareToken: token, shareMeta: meta });
      } else {
        toast('Sign in to view this shared project (' + meta.title + ').', 'info', 4000);
      }
      return;
    }
    // signed in already → claim and switch to the project
    try {
      await claimShare(token);
      // pull list + data, set current
      await pullProjectList();
      Store.setCurrentProject(meta.project_id);
      toast('Joined "' + meta.title + '" as ' + meta.role + '.', 'success', 2400);
      // strip the share param so refresh doesn't reclaim
      history.replaceState({}, '', location.pathname);
    } catch (e) {
      toast('Could not claim share: ' + (e.message || e), 'error');
    }
  }

  // ============================================================
  // SHORT TOAST PASSTHROUGH (uses StudioUI if present)
  // ============================================================
  function toast(msg, type, duration) {
    if (window.StudioUI) {
      const fn = type === 'success' ? StudioUI.toastSuccess
              : type === 'error'   ? StudioUI.toastError
              : StudioUI.toastInfo;
      return fn(msg, { duration: duration || 2400 });
    }
    console.log('[StudioCloud]', msg);
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  window.StudioCloud = {
    // config
    getCfg, setCfg,
    isConfigured: () => !!(getCfg() && getCfg().url && getCfg().key),
    // auth
    ensureClient,
    signInWithEmail, signInWithGoogle, signOut,
    getSession, getUser, getUserEmail,
    onAuth,
    // sync
    pullProjectList, pullProjectData, attachToCurrentProject,
    flushQueue: _flushQueue,
    // sharing
    createShare, listShares, revokeShare, resolveShareToken, claimShare,
    // comments
    listComments, createComment, updateCommentStatus,
    // misc
    SCOPE_BY_KEY, KEY_BY_SCOPE
  };

  // ============================================================
  // BOOT
  // ============================================================
  // Try to initialise the client if cfg exists; fail silently if not.
  await ensureClient();
  // If signed in already (session restored), attach to current project + run migration check
  if (session) {
    await maybeMigrateLocalToCloud();
    attachToCurrentProject();
    setTimeout(_flushQueue, 1500);
  }
  // Always handle ?share= if present, even before sign-in
  handleSharedLink();
})();
