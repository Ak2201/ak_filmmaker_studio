/* ============================================================
   STORAGE ADMIN — where films are kept, in the console's People tab
   ------------------------------------------------------------
   Schema §66. One block: "Keep films in each person's Google Drive".
   Off ('supabase', the default) is how the studio has always worked:
   films sync to the studio server. On ('drive'): each person's films
   live in their own Google Drive, one folder per film, and on their next
   sign-in what the server holds is copied there, read back, checked, and
   only then deleted (docs/DRIVE-STORAGE.md).

   The server decides: get_storage_mode() reads it for anyone, and
   admin_set_storage_mode() refuses everyone but the owner. The counts
   come from admin_storage_overview(): how much is still on the server,
   never anybody's writing. A database where §66 has not run says so
   instead of drawing a switch. Same shape as coedit-admin.js; no inline
   handlers (CSP): delegate() on [data-storage-action].
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { ask } from './dialog.js';
import { readStorageMode, setStorageMode, storageOverview } from '../lib/storage-mode-api.js';
import { studioRole } from './admin-customer.js';

const S = { state: 'idle', mode: 'supabase', missing: false, busy: false, error: '', owner: false, ov: null };
let rerender = () => {};

const toast = (msg, type) => { if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, type ? { type } : undefined); };
async function load() {
  S.state = 'loading'; rerender();
  try {
    const [r, role, ov] = await Promise.all([readStorageMode(), studioRole().catch(() => null), storageOverview().catch(() => null)]);
    S.mode = r.mode; S.missing = r.missing; S.ov = ov;
    S.owner = role === 'owner';
    S.error = '';
    S.state = 'ready';
  } catch (e) {
    S.error = e.message || 'The storage mode could not be read.'; S.state = 'error';
  } finally { rerender(); }
}

export const STORAGE_DRIVE = 'On: each person’s films are kept in their own Google Drive, one folder per film, shared with their team from Drive. The studio server keeps sign-ins, plans, payments and the console, and no longer holds anybody’s writing.';
export const STORAGE_SERVER = 'Off: films sync to the studio server, as they always have.';

const count = (v) => (Number.isFinite(Number(v)) ? Number(v).toLocaleString('en-IN') : '—');

function overviewList(ov) {
  if (!ov) return null;
  const rows = [
    ['Films still on the server', ov.projects_on_server],
    ['People with films on the server', ov.owners_on_server],
    ['Synced sections on the server', ov.scopes_on_server],
    ['Comments on the server', ov.comments_on_server],
    ['People with Drive renewal set up', ov.users_with_token],
    ['Screening passes that open a Drive file', ov.drive_screening_passes]
  ];
  return h('dl.st-ov',{ 'data-storage-overview': '' }, rows.flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: count(v) })]));
}

export function storageModeBlock(onChange) {
  if (onChange) rerender = onChange;
  if (S.state === 'idle') load();
  const box = h('div.gr-panel.acc-switch', { id: 'storageMode' });
  box.append(h('h3.gt-h3', { text: 'Where films are kept' }));
  if (S.state === 'error') {
    box.append(h('p.gt-meta', { text: S.error }),
      h('div.gr-row', {}, [h('button.btn', { type: 'button', 'data-storage-action': 'retry', text: 'Try again' })]));
    return box;
  }
  if (S.state !== 'ready') { box.append(h('p.gt-meta', { text: 'Loading…' })); return box; }
  if (S.missing) {
    box.append(h('p.gt-meta', { text: 'This switch is not available on this database yet (schema section 66 has not run). Until it runs, films sync to the studio server, as they always have.' }));
    return box;
  }
  const drive = S.mode === 'drive';
  if (S.owner) {
    const sw = h('input', { id: 'storageDriveOn', type: 'checkbox', 'data-storage-action': 'switch' });
    sw.checked = drive;
    sw.disabled = S.busy;
    box.append(h('div.gr-row', {}, [h('label.gr-check', { for: 'storageDriveOn' }, [sw, h('span', { text: 'Keep films in each person’s Google Drive' })])]));
  }
  box.append(h('p.gr-meta', { 'data-storage-state': S.mode, text: drive ? STORAGE_DRIVE : STORAGE_SERVER }));
  const list = overviewList(S.ov);
  if (list) box.append(list);
  if (!S.owner) box.append(h('p.gt-meta', { text: 'Only the owner can change this.' }));
  return box;
}

delegate(document, 'click', '[data-storage-action="retry"]', () => { S.state = 'idle'; load(); });

delegate(document, 'change', '[data-storage-action="switch"]', async (e, el) => {
  const want = el.checked ? 'drive' : 'supabase';
  const body = want === 'drive'
    ? 'Keep films in Google Drive?\n\n' + STORAGE_DRIVE + '\n\nOn each person’s next sign-in, their films on the server are copied to their Drive and read back. Nothing on the server is deleted until the Drive copy reads back identical. Try it with a test account first (docs/LIVE-STEPS-2026-10-31.md).'
    : 'Sync films to the studio server again?\n\n' + STORAGE_SERVER + '\n\nFilms already moved stay in each person’s Drive; their devices upload their own copies to the server again on the next sign-in.';
  if (!(await ask(body, { confirm: want === 'drive' ? 'Keep in Drive' : 'Use the server' }))) {
    el.checked = S.mode === 'drive'; return;
  }
  S.busy = true; rerender();
  try {
    S.mode = await setStorageMode(want);
    toast(S.mode === 'drive' ? 'Films are kept in Google Drive from each person’s next sign-in.' : 'Films sync to the studio server again.', 'success');
    S.ov = await storageOverview().catch(() => S.ov);
  } catch (err) {
    toast(err.message || 'The storage mode was not changed.', 'error');
  }
  S.busy = false; rerender();
});

export default { storageModeBlock };
