/* ============================================================
   ADMIN TAB — Controls (controls, #controls)
   ------------------------------------------------------------
   Four things only an OWNER may touch (schema §45, role matrix §46):

     Roles               who is an admin, and what kind
     Feature overrides   a kill switch (or an addition) for one feature,
                         for everybody, one plan or one account
     Announcement        the one-line banner every page shows
     Data tools          export, or erase, one person's server-side data

   THE SERVER IS THE BOUNDARY. Every RPC here calls require_role(owner);
   this tab only declines to draw for anybody else, so a finance or
   support admin sees a sentence instead of four forms that would all
   answer 42501. A role that cannot be read (§45 not run) is an error
   state with the reason, never a silent empty tab.

   NOTHING IS STORED IN THE BROWSER. Drafts live in this module so a
   re-render of the whole console (every block does it when its data
   lands) does not wipe a half-typed announcement.

   This is the BODY, loaded on demand by controls.js (its own chunk, so the
   console's first paint does not carry it). Same contract: render(ctx) ->
   Node, built synchronously; ctx.rerender() when state changes.
   ============================================================ */
import { errorSentence } from '../../lib/gate.js';
import { h } from '../../lib/dom.js';
import { ask, askDanger, tell } from '../../ui/dialog.js';
import { emptyState, errorState, skeleton, pill, dataTable, relTime, absTime } from '../../ui/admin-kit.js';
import { bannerBar, refreshBanner } from '../../ui/site-banner.js';
import Billing from '../../lib/billing.js';
import { controlsCall } from '../../lib/admin-api.js';
import { ROLES, ROLE_REACH, SCOPE_WORDS, personText, matchPerson, emailOf as emailIn, roleQuestion, scopeCell, overrideQuestion, toIso, exportFileName } from '../../lib/admin-controls-model.js';


let ctx = null;
const S = {
  me: { phase: 'idle', role: null, error: '' },
  roles: { phase: 'idle', rows: [], error: '' },
  ov: { phase: 'idle', rows: [], keys: [], error: '' },
  ann: { phase: 'idle', live: null, error: '' },
  plans: [],
  users: null,                       // admin_list_users(), loaded on first need
  busy: '',                          // which form is mid-call
  note: {},                          // form -> 'Saved.' / a refusal sentence
  draft: {
    role: { who: '', role: 'support' },
    ov: { key: '', scope: 'global', scopeId: '', enabled: 'false' },
    ann: { text: '', level: 'info', starts: '', ends: '' },
    data: { who: '' }
  }
};

const rpc = (name, args) => controlsCall(ctx && ctx.cloud, name, args);
const why = (e) => errorSentence(e, 'The server did not say why.');
const redraw = () => { if (ctx && ctx.rerender) ctx.rerender(); };

/* ---- loading ------------------------------------------------------ */

async function loadMe() {
  S.me = { phase: 'loading', role: null, error: '' };
  try {
    const r = await rpc('studio_role');
    S.me = { phase: 'ok', role: r || null, error: '' };
  } catch (e) { S.me = { phase: 'error', role: null, error: why(e) }; }
  redraw();
  if (S.me.role === 'owner') { loadRoles(); loadOverrides(); loadAnnouncement(); loadPlans(); }
}
async function loadRoles() {
  S.roles = { ...S.roles, phase: 'loading' };
  try { S.roles = { phase: 'ok', rows: (await rpc('admin_list_roles')) || [], error: '' }; }
  catch (e) { S.roles = { phase: 'error', rows: [], error: why(e) }; }
  redraw();
}
async function loadOverrides() {
  S.ov = { ...S.ov, phase: 'loading' };
  try {
    const d = (await rpc('admin_list_feature_overrides')) || {};
    S.ov = { phase: 'ok', rows: d.overrides || [], keys: d.known_keys || [], error: '' };
    if (!S.draft.ov.key && S.ov.keys.length) S.draft.ov.key = S.ov.keys[0];
  } catch (e) { S.ov = { phase: 'error', rows: [], keys: [], error: why(e) }; }
  redraw();
}
async function loadAnnouncement() {
  S.ann = { ...S.ann, phase: 'loading' };
  try { S.ann = { phase: 'ok', live: (await rpc('site_announcement_now')) || null, error: '' }; }
  catch (e) { S.ann = { phase: 'error', live: null, error: why(e) }; }
  redraw();
}
async function loadPlans() {
  try { S.plans = ((await Billing.listPlans()) || []).filter((p) => p.id !== 'free'); redraw(); } catch (e) { /* the scope id falls back to a text field */ }
}
async function loadUsers() {
  if (S.users) return S.users;
  S.users = (await rpc('admin_list_users')) || [];
  return S.users;
}

/** An e-mail or a user id -> { id, email } or a thrown sentence. */
async function resolvePerson(text) {
  const t = personText(text);
  const users = await loadUsers();
  return matchPerson(users, t);
}
const emailOf = (id) => emailIn(S.roles.rows, id);

/* ---- small builders ---------------------------------------------- */

function field(label, control, { wide, id } = {}) {
  const fid = id || 'ctl-' + Math.random().toString(36).slice(2, 8);
  control.id = fid;
  return h('div.gt-field' + (wide ? '.ctl-wide' : ''), {}, [h('label', { for: fid, text: label }), control]);
}
function select(options, value, onChange) {
  const el = h('select', {}, options.map(([v, t]) => h('option', { value: v, text: t })));
  el.value = value;
  el.addEventListener('change', () => onChange(el.value));
  return el;
}
function input(value, onInput, props = {}) {
  const el = h('input', { type: 'text', autocomplete: 'off', ...props });
  el.value = value;
  el.addEventListener('input', () => onInput(el.value));
  return el;
}
const noteLine = (key) => h('p.ad-meta.ctl-note', { role: 'status', text: S.note[key] || '' });
function card(title, lede, kids) {
  return h('section.ad-card.ctl-card', { 'aria-label': title }, [
    h('h3.ad-card-h', { text: title }),
    lede ? h('p.ad-meta', { text: lede }) : null,
    ...kids
  ]);
}
function panelState(s, title, body) {
  if (s.phase === 'error') return errorState({ title: title + ' could not load', why: s.error, onRetry: body.retry });
  if (s.phase !== 'ok') return skeleton({ kind: 'rows', count: 3 });
  return null;
}
async function act(key, work, doneText) {
  if (S.busy) return;
  S.busy = key; S.note[key] = ''; redraw();
  try { await work(); S.note[key] = doneText || 'Saved.'; }
  catch (e) {
    S.note[key] = '';
    await tell({ title: 'That did not go through', body: why(e) });
  }
  S.busy = ''; redraw();
}

/* ---- roles -------------------------------------------------------- */

function rolesCard() {
  const bad = panelState(S.roles, 'Roles', { retry: loadRoles });
  const d = S.draft.role;
  const table = bad || dataTable({
    caption: S.roles.rows.length + (S.roles.rows.length === 1 ? ' administrator' : ' administrators'),
    columns: [
      { key: 'email', label: 'Person' },
      { key: 'role', label: 'Role', render: (r) => pill(r.role, r.role === 'owner' ? 'accent' : 'neutral', { title: ROLE_REACH[r.role] }) },
      { key: 'at', label: 'Since', render: (r) => (r.at ? h('time', { title: absTime(r.at), text: relTime(r.at) }) : 'from the start') },
      { key: 'by', label: 'Set by', render: (r) => (r.granted_by ? emailOf(r.granted_by) : r.explicit ? '—' : 'no role row: reads as owner') },
      { key: 'go', label: '', align: 'end', render: (r) => h('span.ctl-row-a', {}, [
        h('button.btn', { type: 'button', text: 'Edit', 'aria-label': 'Edit the role of ' + r.email, onclick: () => { S.draft.role = { who: r.email || r.user_id, role: r.role }; redraw(); const el = document.getElementById('ctl-role-who'); if (el) el.focus(); } }),
        h('button.btn', { type: 'button', text: 'Remove', 'aria-label': 'Remove the role of ' + r.email, onclick: () => setRole(r.user_id, r.email, null) })
      ]) }
    ],
    rows: S.roles.rows,
    rowId: (r) => r.user_id,
    empty: { title: 'No administrators', body: 'That should not happen: the console needs at least one owner.' }
  });
  const form = h('form.ctl-form', { novalidate: '' }, [
    h('div.gt-grid', {}, [
      field('E-mail or user id', input(d.who, (v) => { d.who = v; }, { placeholder: 'person@example.com', 'aria-describedby': 'ctl-role-help' }), { id: 'ctl-role-who' }),
      field('Role', select(ROLES.map((r) => [r, r]), d.role, (v) => { d.role = v; redraw(); }))
    ]),
    h('p#ctl-role-help.ad-meta', { text: ROLE_REACH[d.role] + ' Anyone given a role becomes an administrator.' }),
    h('div.gt-actions', {}, [
      h('button.btn.primary', { type: 'submit', text: 'Set role', disabled: S.busy ? '' : null }),
      noteLine('role')
    ])
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { const p = await resolvePerson(d.who); await setRole(p.id, p.email || d.who, d.role); }
    catch (err) { await tell({ title: 'Check the person', body: why(err) }); }
  });
  return card('Roles', 'Owners can do everything. Finance and support see only their own part of the console, and the server refuses the rest.', [table, form]);
}

async function setRole(userId, label, role) {
  const who = label || userId;
  const ok = role
    ? await ask({ title: roleQuestion(who, role), body: ROLE_REACH[role], confirm: 'Set role' })
    : await askDanger({ title: 'Remove the role of ' + who + '?', body: 'They stop being an administrator and become an ordinary member. Their own work is not touched.', confirm: 'Remove role' });
  if (!ok) return;
  await act('role', async () => {
    await rpc('admin_set_role', { p_user: userId, p_role: role });
    S.draft.role.who = '';
    await loadRoles();
  }, role ? 'Role set.' : 'Role removed.');
}

/* ---- feature overrides ------------------------------------------- */

function overridesCard() {
  const bad = panelState(S.ov, 'Feature overrides', { retry: loadOverrides });
  const d = S.draft.ov;
  const table = bad || dataTable({
    caption: S.ov.rows.length + (S.ov.rows.length === 1 ? ' override' : ' overrides'),
    columns: [
      { key: 'key', label: 'Feature' },
      { key: 'scope', label: 'Applies to', render: scopeCell, title: (r) => r.scope_id || 'everybody' },
      { key: 'enabled', label: 'Effect', render: (r) => pill(r.enabled ? 'forced ON' : 'switched OFF', r.enabled ? 'ok' : 'danger') },
      { key: 'set_by', label: 'Set by', render: (r) => emailOf(r.set_by) },
      { key: 'at', label: 'When', render: (r) => h('time', { title: absTime(r.at), text: relTime(r.at) }) },
      { key: 'go', label: '', align: 'end', render: (r) => h('button.btn', { type: 'button', text: 'Clear', 'aria-label': 'Clear the override for ' + r.key, onclick: () => clearOverride(r) }) }
    ],
    rows: S.ov.rows,
    rowId: (r) => r.key + ':' + r.scope + ':' + r.scope_id,
    empty: { title: 'No overrides', body: 'Every feature follows its plan. Nothing here is switched off or forced on.' }
  });
  const scopeField = d.scope === 'global' ? null
    : d.scope === 'plan' && S.plans.length
      ? field('Plan', select(S.plans.map((p) => [p.id, p.name || p.id]), d.scopeId || S.plans[0].id, (v) => { d.scopeId = v; }), { id: 'ctl-ov-scopeid' })
      : field(d.scope === 'plan' ? 'Plan id' : 'Account id', input(d.scopeId, (v) => { d.scopeId = v; }, { placeholder: d.scope === 'plan' ? 'indie' : 'account id (uuid)' }), { id: 'ctl-ov-scopeid' });
  if (d.scope === 'plan' && S.plans.length && !d.scopeId) d.scopeId = S.plans[0].id;
  const form = h('form.ctl-form', { novalidate: '' }, [
    h('div.gt-grid', {}, [
      field('Feature', S.ov.keys.length
        ? select(S.ov.keys.map((k) => [k, k]), d.key || S.ov.keys[0], (v) => { d.key = v; })
        : input(d.key, (v) => { d.key = v; }, { placeholder: 'feature key' })),
      field('Applies to', select(Object.entries(SCOPE_WORDS), d.scope, (v) => { d.scope = v; d.scopeId = ''; redraw(); })),
      scopeField,
      field('Effect', select([['false', 'Switch it OFF (kill switch)'], ['true', 'Force it ON (add it)']], d.enabled, (v) => { d.enabled = v; }))
    ]),
    h('p.ad-meta', { text: 'Which one wins, most specific first: an override for one account, then one for a plan, then one for everybody, then the plan’s own list. Two overrides of the same kind that disagree: the restrictive one wins. If this cannot be read, the plan’s own list applies and nothing is hidden.' }),
    h('div.gt-actions', {}, [
      h('button.btn.primary', { type: 'submit', text: 'Save override', disabled: S.busy ? '' : null }),
      noteLine('ov')
    ])
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const key = d.key || (S.ov.keys[0] || '');
    const scopeId = d.scope === 'global' ? '' : (d.scopeId || '').trim();
    if (!key) { await tell({ title: 'Pick a feature', body: 'Choose the feature this applies to.' }); return; }
    if (d.scope !== 'global' && !scopeId) { await tell({ title: 'Which ' + d.scope + '?', body: 'Say which ' + d.scope + ' this override is for.' }); return; }
    const on = d.enabled === 'true';
    const q = overrideQuestion(key, on, d.scope, scopeId);
    const ok = await ask({
      title: q.title,
      body: q.body,
      confirm: 'Save override', danger: !on
    });
    if (!ok) return;
    act('ov', async () => { await rpc('admin_set_feature_override', { p_key: key, p_scope: d.scope, p_scope_id: scopeId, p_enabled: on }); await loadOverrides(); });
  });
  return card('Feature overrides', 'Switch one feature off for a while, or add it for someone, without editing the plans.', [table, form]);
}
async function clearOverride(r) {
  const ok = await ask({ title: 'Clear the override for ' + r.key + '?', body: 'The feature goes back to following the plan' + (r.scope === 'global' ? '' : ' for that ' + r.scope) + '.', confirm: 'Clear' });
  if (!ok) return;
  act('ov', async () => { await rpc('admin_set_feature_override', { p_key: r.key, p_scope: r.scope, p_scope_id: r.scope_id, p_enabled: null }); await loadOverrides(); }, 'Cleared.');
}

/* ---- the announcement banner ------------------------------------- */

function annCard() {
  const d = S.draft.ann;
  const live = S.ann.live;
  const liveLine = S.ann.phase === 'error'
    ? errorState({ title: 'The live banner could not be read', why: S.ann.error, onRetry: loadAnnouncement })
    : S.ann.phase !== 'ok' ? skeleton({ kind: 'rows', count: 1 })
    : live
      ? h('div.ctl-live', {}, [
        h('p.ad-meta', { text: 'Showing now' + (live.ends_at ? ', until ' + new Date(live.ends_at).toLocaleString() : ', with no end date') + ':' }),
        bannerBar(live, { preview: true })
      ])
      : h('p.ad-meta', { text: 'No banner is showing. Visitors see nothing extra.' });
  const count = h('span.ad-meta.ctl-count', { text: d.text.length + ' / 200', 'aria-live': 'off' });
  const text = h('textarea', { rows: '2', maxlength: '200', placeholder: 'A short notice, in one or two sentences. Plain text.' });
  text.value = d.text;
  const preview = h('div.ctl-preview', { 'aria-label': 'Preview' });
  const paint = () => { preview.replaceChildren(d.text.trim() ? bannerBar({ text: d.text.trim(), level: d.level }, { preview: true }) : h('p.ad-meta', { text: 'Type a message to see it here, exactly as visitors will.' })); };
  text.addEventListener('input', () => { d.text = text.value; count.textContent = d.text.length + ' / 200'; paint(); });
  paint();
  const form = h('form.ctl-form', { novalidate: '' }, [
    field('Message', text, { wide: true, id: 'ctl-ann-text' }),
    h('div.gt-grid', {}, [
      field('Kind', select([['info', 'Information'], ['warn', 'Warning']], d.level, (v) => { d.level = v; paint(); })),
      field('Starts (your time)', input(d.starts, (v) => { d.starts = v; }, { type: 'datetime-local' })),
      field('Ends (your time)', input(d.ends, (v) => { d.ends = v; }, { type: 'datetime-local' }))
    ]),
    h('div.ctl-count-row', {}, [count, h('span.ad-meta', { text: 'Leave the dates empty to start now and run until cleared.' })]),
    h('div.ctl-prev-wrap', {}, [h('span.ctl-prev-l', { text: 'Preview' }), preview]),
    h('div.gt-actions', {}, [
      h('button.btn.primary', { type: 'submit', text: 'Set banner', disabled: S.busy ? '' : null }),
      h('button.btn', { type: 'button', text: 'Clear banner', disabled: S.busy || !live ? '' : null, onclick: clearBanner }),
      noteLine('ann')
    ])
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const t = d.text.trim();
    if (!t) { await tell({ title: 'Write the message', body: 'The banner needs 1 to 200 characters.' }); return; }
    const ok = await ask({ title: 'Show this banner on every page?', body: 'It replaces any banner showing now. Visitors can close it for their visit.', confirm: 'Set banner' });
    if (!ok) return;
    act('ann', async () => {
      await rpc('admin_set_announcement', { p_text: t, p_level: d.level, p_starts_at: toIso(d.starts), p_ends_at: toIso(d.ends) });
      await loadAnnouncement();
      refreshBanner();
    }, 'Banner set.');
  });
  return card('Announcement banner', 'One notice above every page, for planned downtime or news. Plain text, never changes by itself.', [liveLine, form]);
}
async function clearBanner() {
  const ok = await ask({ title: 'Take the banner down?', body: 'It disappears for everybody the next time a page loads.', confirm: 'Clear banner' });
  if (!ok) return;
  act('ann', async () => { await rpc('admin_clear_announcement'); await loadAnnouncement(); refreshBanner(); }, 'Banner cleared.');
}

/* ---- data-subject tools ------------------------------------------ */

function download(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function dataCard() {
  const d = S.draft.data;
  const who = field('E-mail or user id', input(d.who, (v) => { d.who = v; }, { placeholder: 'person@example.com' }), { wide: true, id: 'ctl-data-who' });
  const form = h('form.ctl-form', { novalidate: '' }, [
    who,
    h('p.ad-meta', { text: 'Export covers what is on the server: profile, payments, invoices, notes, sessions and synced projects. Work kept only in someone’s own browser is not here, and the file says so. To erase a person, use People → Delete totally.' }),
    h('div.gt-actions', {}, [
      h('button.btn.primary', { type: 'submit', text: 'Export as JSON', disabled: S.busy ? '' : null }),
      noteLine('data')
    ])
  ]);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let p;
    try { p = await resolvePerson(d.who); } catch (err) { await tell({ title: 'Check the person', body: why(err) }); return; }
    act('data', async () => {
      const out = await rpc('admin_export_user', { p_user: p.id });
      download(exportFileName(p), JSON.stringify(out, null, 2));
    }, 'Export downloaded. This was recorded in the audit log.');
  });
  return card('Data tools', 'Answer a data request about one person: give them a copy. Erasing a person is People → Delete totally.', [form]);
}
/* ---- the tab ------------------------------------------------------ */

export function render(c) {
  ctx = c;
  /* Nothing is fetched until this tab is the one on screen: the console draws
     every tab at once, and four owner-only reads on every visit to Overview
     would be waste. Claimed NOW (not in the microtask): the console renders
     several times in one tick. */
  if (S.me.phase === 'idle') { S.me.phase = 'loading'; queueMicrotask(loadMe); }
  if (S.me.phase === 'error') return errorState({ title: 'Controls could not load', why: S.me.error, onRetry: loadMe });
  if (S.me.phase !== 'ok') return h('div.ctl', {}, [skeleton({ kind: 'block', count: 2 })]);
  if (S.me.role !== 'owner') {
    return emptyState({
      title: S.me.role ? 'Controls are for owners' : 'Controls are for administrators',
      body: S.me.role
        ? 'Your role is ' + S.me.role + '. Roles, feature switches, the banner and data requests need the owner role. Ask an owner to make the change, or to change your role.'
        : 'This account is not an administrator.'
    });
  }
  return h('div.ctl', {}, [rolesCard(), overridesCard(), annCard(), dataCard()]);
}

export default { render };
