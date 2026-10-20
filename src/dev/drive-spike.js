/* ============================================================
   DRIVE SPIKE (dev only, throwaway) — docs/DRIVE-STORAGE.md
   ------------------------------------------------------------
   Phase 0 of the Drive-only storage plan. Two people, two browsers,
   the app's own OAuth client and its `drive.file` scope. Each button
   runs one experiment against the real Drive API and appends a line to
   the log; "Copy results" gives the owner one block to paste back.

     OWNER (account A)        TEAMMATE (account B, and C as commenter)
     1  make folder + files   4  open by folder id alone        Q2
     2  share with B / C      5  open through the Picker        Q1
     3  link-share + revoke   6  try to write as commenter      Q4
     7  revision retention (either side)                         Q5

   Nothing here is imported by the app, nothing is stored (ids live in
   the inputs), and the token is the app's in-memory one from drive.js.
   ============================================================ */
import { getToken, CLIENT_ID } from '../lib/drive.js';

const API = 'https://www.googleapis.com';
const log = [];
const $ = (id) => document.getElementById(id);

function say(test, ok, detail) {
  const line = { test, result: ok === null ? 'info' : ok ? 'PASS' : 'FAIL', detail };
  log.push(line);
  const li = document.createElement('li');
  li.textContent = `[${line.result}] ${test}: ${typeof detail === 'string' ? detail : JSON.stringify(detail)}`;
  $('log').prepend(li);
}

async function token() { return getToken({ interactive: true }); }

async function call(path, { method = 'GET', body, type = 'application/json', raw = false } = {}) {
  const t = await token();
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: 'Bearer ' + t, ...(body != null && !raw ? { 'Content-Type': type } : {}) },
    body: body == null ? undefined : raw ? body : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch (e) { /* not JSON */ }
  return { ok: res.ok, status: res.status, json, text };
}

async function upload(name, content, parents, mime = 'application/json') {
  const meta = { name, mimeType: mime, parents };
  const b = 'spike' + Math.random().toString(36).slice(2);
  const body = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n` +
    `--${b}\r\nContent-Type: ${mime}\r\n\r\n${content}\r\n--${b}--`;
  const t = await token();
  const res = await fetch(API + '/upload/drive/v3/files?uploadType=multipart&fields=id,name',
    { method: 'POST', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'multipart/related; boundary=' + b }, body });
  return { ok: res.ok, status: res.status, json: await res.json().catch(() => null) };
}

const children = (folderId) =>
  call('/drive/v3/files?fields=files(id,name,mimeType)&q=' + encodeURIComponent(`'${folderId}' in parents and trashed=false`));

/* ---- owner ---------------------------------------------------- */
async function makeFolder() {
  const f = await call('/drive/v3/files?fields=id,name', { method: 'POST', body: { name: 'FMS spike ' + new Date().toISOString().slice(0, 16), mimeType: 'application/vnd.google-apps.folder' } });
  if (!f.ok) return say('1 folder', false, f.status + ' ' + f.text.slice(0, 200));
  $('folder').value = f.json.id;
  const a = await upload('project.json', JSON.stringify({ v: 1, spike: true }), [f.json.id]);
  const c = await upload('comments.json', '[]', [f.json.id]);
  say('1 folder + project.json + comments.json', a.ok && c.ok, { folder: f.json.id, project: a.json && a.json.id, comments: c.json && c.json.id });
}
async function addLater() {
  const r = await upload('added-after-share.json', JSON.stringify({ at: Date.now() }), [$('folder').value]);
  say('1b file added AFTER sharing (teammate re-runs 4/5 to see it)', r.ok, r.json || r.status);
}
async function share(role) {
  const email = $(role === 'writer' ? 'emailB' : 'emailC').value.trim();
  if (!email) return say('2 share', false, 'type the e-mail first');
  const r = await call(`/drive/v3/files/${$('folder').value}/permissions?sendNotificationEmail=false&fields=id,role`,
    { method: 'POST', body: { type: 'user', role, emailAddress: email } });
  say('2 share folder as ' + role, r.ok, r.ok ? r.json : r.status + ' ' + r.text.slice(0, 200));
}
async function linkShare() {
  const f = await upload('screening-test.txt', 'screening pass test', [$('folder').value], 'text/plain');
  if (!f.ok) return say('3 link share', false, f.status);
  const p = await call(`/drive/v3/files/${f.json.id}/permissions?fields=id`, { method: 'POST', body: { type: 'anyone', role: 'reader' } });
  $('linkFile').value = f.json.id; $('linkPerm').value = p.json && p.json.id || '';
  say('3 anyone-with-link reader', p.ok, { file: f.json.id, open: 'https://drive.google.com/file/d/' + f.json.id + '/view (open in a private window)' });
  const e = await call(`/drive/v3/files/${f.json.id}/permissions/${p.json && p.json.id}?fields=id,expirationTime`,
    { method: 'PATCH', body: { expirationTime: new Date(Date.now() + 864e5).toISOString() } });
  say('3b expirationTime on an anyone permission', e.ok, e.ok ? e.json : e.status + ' ' + e.text.slice(0, 160));
}
async function revoke() {
  const r = await call(`/drive/v3/files/${$('linkFile').value}/permissions/${$('linkPerm').value}`, { method: 'DELETE' });
  say('3c revoke link (reload the private window: it should refuse)', r.ok || r.status === 204, r.status);
}

/* ---- teammate ------------------------------------------------- */
async function readWrite(label, folderId) {
  const list = await children(folderId);
  if (!list.ok) return say(label + ' list', false, list.status + ' ' + list.text.slice(0, 200));
  const files = (list.json.files || []);
  say(label + ' list children', true, files.map((f) => f.name));
  const p = files.find((f) => f.name === 'project.json');
  if (!p) return say(label + ' read', false, 'project.json not visible');
  const read = await fetch(API + `/drive/v3/files/${p.id}?alt=media`, { headers: { Authorization: 'Bearer ' + await token() } });
  say(label + ' read project.json', read.ok, read.status);
  const t = await token();
  const w = await fetch(API + `/upload/drive/v3/files/${p.id}?uploadType=media`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ v: 1, by: 'teammate', at: Date.now() }) });
  say(label + ' write project.json', w.ok, w.status);
  const n = await upload('teammate-new.json', '{}', [folderId]);
  say(label + ' create a new file in the folder', n.ok, n.ok ? n.json : n.status);
}
async function byId() { await readWrite('4 by folder id', $('folder').value.trim()); }

let pickerReady = null;
function loadPicker() {
  pickerReady = pickerReady || new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://apis.google.com/js/api.js';
    s.onload = () => window.gapi.load('picker', { callback: resolve });
    s.onerror = reject;
    document.head.append(s);
  });
  return pickerReady;
}
async function viaPicker() {
  const key = $('apiKey').value.trim(), appId = $('appId').value.trim();
  if (!key || !appId) return say('5 picker', false, 'needs the API key and the project number (app id)');
  const t = await token();
  await loadPicker();
  const P = window.google.picker;
  const view = new P.DocsView(P.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true);
  new P.PickerBuilder().addView(view).addView(new P.DocsView().setIncludeFolders(true).setOwnedByMe(false))
    .setOAuthToken(t).setDeveloperKey(key).setAppId(appId)
    .enableFeature(P.Feature.SUPPORT_DRIVES)
    .setCallback(async (d) => {
      if (d.action !== P.Action.PICKED) return;
      const doc = d.docs[0];
      say('5 picked', null, { id: doc.id, name: doc.name, mime: doc.mimeType });
      if (doc.mimeType === 'application/vnd.google-apps.folder') await readWrite('5 after Picker (folder)', doc.id);
    }).build().setVisible(true);
}
async function commenterWrite() {
  const list = await children($('folder').value.trim());
  const c = list.ok && (list.json.files || []).find((f) => f.name === 'comments.json');
  if (!c) return say('6 commenter', false, 'comments.json not visible (status ' + list.status + ')');
  const t = await token();
  const w = await fetch(API + `/upload/drive/v3/files/${c.id}?uploadType=media`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: '[{"note":"from commenter"}]' });
  say('6 commenter writes comments.json (expect FAIL)', w.ok, w.status);
  const dc = await call(`/drive/v3/files/${c.id}/comments?fields=id`, { method: 'POST', body: { content: 'spike comment' } });
  say('6b commenter uses Drive comments API', dc.ok, dc.ok ? dc.json : dc.status + ' ' + dc.text.slice(0, 160));
}

/* ---- either --------------------------------------------------- */
async function revisions() {
  const f = await upload('revisions.json', '{"n":0}', [$('folder').value.trim()]);
  if (!f.ok) return say('7 revisions', false, f.status);
  const t = await token();
  for (let n = 1; n <= 30; n++) {
    await fetch(API + `/upload/drive/v3/files/${f.json.id}?uploadType=media`, { method: 'PATCH', headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' }, body: JSON.stringify({ n }) });
  }
  const r = await call(`/drive/v3/files/${f.json.id}/revisions?fields=revisions(id,modifiedTime,keepForever)`);
  say('7 revisions kept after 30 quick writes', r.ok, { file: f.json.id, kept: r.json && r.json.revisions && r.json.revisions.length, note: 're-run 7b in an hour and tomorrow' });
  $('revFile').value = f.json.id;
}
async function revisionsAgain() {
  const r = await call(`/drive/v3/files/${$('revFile').value.trim()}/revisions?fields=revisions(id,modifiedTime)`);
  say('7b revisions still kept', r.ok, r.json && r.json.revisions && r.json.revisions.length);
}

function ui() {
  const field = (id, label, ph = '') => `<label>${label} <input id="${id}" placeholder="${ph}" size="44"></label><br>`;
  const btn = (id, label) => `<button type="button" id="${id}">${label}</button> `;
  document.getElementById('app').innerHTML = `
    <h1>Drive spike</h1>
    <p>Client id: ${CLIENT_ID ? 'set' : '<b>missing: VITE_GOOGLE_CLIENT_ID</b>'}. Steps: docs/DRIVE-STORAGE.md.</p>
    ${field('folder', 'Folder id', 'filled by 1, or paste the owner\'s')}
    ${field('emailB', 'Teammate B (writer) e-mail')}
    ${field('emailC', 'Teammate C (commenter) e-mail')}
    ${field('apiKey', 'Picker API key')}
    ${field('appId', 'Project number (app id)')}
    ${field('linkFile', 'Link file id')}${field('linkPerm', 'Link permission id')}${field('revFile', 'Revisions file id')}
    <h2>Owner (A)</h2>${btn('t1', '1 Make folder + files')}${btn('t1b', '1b Add a file after sharing')}${btn('t2w', '2 Share with B (writer)')}${btn('t2c', '2 Share with C (commenter)')}${btn('t3', '3 Link-share a file')}${btn('t3c', '3c Revoke the link')}
    <h2>Teammate (B / C)</h2>${btn('t4', '4 Open by folder id')}${btn('t5', '5 Open through the Picker')}${btn('t6', '6 Write as commenter (C)')}
    <h2>Either</h2>${btn('t7', '7 Revision retention')}${btn('t7b', '7b Count revisions again')}
    <p>${btn('copy', 'Copy results')}</p><ol id="log" reversed></ol>`;
  const on = (id, fn) => $(id).addEventListener('click', () => fn().catch((e) => say(id, false, e.message)));
  on('t1', makeFolder); on('t1b', addLater); on('t2w', () => share('writer')); on('t2c', () => share('commenter'));
  on('t3', linkShare); on('t3c', revoke); on('t4', byId); on('t5', viaPicker); on('t6', commenterWrite);
  on('t7', revisions); on('t7b', revisionsAgain);
  on('copy', async () => { await navigator.clipboard.writeText(JSON.stringify(log, null, 1)); say('copy', null, log.length + ' lines copied'); });
}
ui();
