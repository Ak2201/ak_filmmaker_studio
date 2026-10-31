/* ============================================================
   DRIVE UI — what drive-only storage shows (lazy)
   ------------------------------------------------------------
   Loaded only by src/lib/drive-project-sync.js, so only in drive mode.
   Every surface is a kit piece or a toast — never a native dialog:

     openMigrationSheet()  "Moving your films to your Google Drive": a
                           meter, the line that matters ("Nothing on our
                           server is deleted until your Drive copy reads
                           back identical") and Pause. Closed, it folds
                           into a toast with an action that does NOT time
                           out (an actionable toast never does).
     reconnectToast()      a mint refused with 'regrant'
     sharedFilmToast()     a ?drive=<folder> link: one click opens the
                           Google Picker (the click is the user gesture)
     lateFilesToast()      files a teammate cannot see yet (Fallback A)
   ============================================================ */
import { h } from '../lib/dom.js';
import { meter, setMeter, button, notice, sheet, closeSheet } from './kit/index.js';
import '../styles/drive.css';
import { BRAND } from '../lib/brand.js';

const ui = () => (typeof window !== 'undefined' ? window.StudioUI : null);
function toast(msg, opts) { const u = ui(); return u && u.toast ? u.toast(msg, opts || {}) : null; }

const STEP = {
  folder: 'Finding its folder',
  copy: 'Copying',
  comments: 'Copying the comments',
  frames: 'Moving storyboard frames',
  share: 'Sharing with your collaborators',
  delete: 'Removing the server copy',
  finish: 'Finishing',
  done: 'Done'
};

export function openMigrationSheet({ total, titles, onPause }) {
  let done = 0, last = 'Starting…', open = false, finished = false, chip = null;
  const m = meter({ label: 'Films moved', value: 0, max: Math.max(1, total || 1), show: 'ratio', size: 'lg' });
  const line = h('p.dm-line', { role: 'status', 'aria-live': 'polite', text: last });
  const pause = button({ label: 'Pause', variant: 'secondary', attrs: { 'data-drive-migrate-pause': '' } });
  const list = h('ul.dm-list', {}, (titles || []).slice(0, 8).map((t) => h('li', { text: t || 'Untitled Project' })));
  const body = h('div.dm-sheet', { 'data-drive-migrate': '' }, [
    notice({ tone: 'info', body: 'Nothing on our server is deleted until your Drive copy reads back identical.' }),
    h('p.dm-deck', { text: 'Your films are moving into a ' + BRAND.name + ' folder in your own Google Drive. You can keep working; this page saves as usual.' }),
    list, m, line, h('div.dm-actions', {}, [pause])
  ]);
  pause.addEventListener('click', () => {
    if (finished) { closeSheet(); return; }
    if (typeof onPause === 'function') onPause();
    last = 'Pausing — the next sign-in carries on from here.';
    line.textContent = last;
    pause.disabled = true;
  });
  const show = () => {
    open = true;
    if (chip && chip.dismiss) { try { chip.dismiss(); } catch (e) { /* gone */ } }
    chip = null;
    sheet({ title: 'Moving your films to your Google Drive', body, kind: 'drive-migrate', onClose: () => { open = false; collapse(); } });
  };
  const collapse = () => {
    if (finished || chip) return;
    chip = toast('Moving your films to Google Drive: ' + done + ' of ' + total + '.', { type: 'info', action: 'Show progress', onAction: () => show() });
  };
  show();
  return {
    update(p) {
      if (!p) return;
      if (p.step === 'done') done = Math.min(total, (p.done || 0) + 1);
      setMeter(m, done, Math.max(1, total));
      last = (STEP[p.step] || p.step) + (p.title ? ' — ' + p.title : '') + (p.scope ? ' (' + p.scope + ')' : '');
      line.textContent = last;
    },
    done(res) {
      finished = true;
      setMeter(m, total, Math.max(1, total));
      const left = (res && res.frames && res.frames.length) || 0;
      line.textContent = 'All ' + total + ' film' + (total === 1 ? ' is' : 's are') + ' in your Google Drive.' + (left ? ' ' + left + ' storyboard frame' + (left === 1 ? '' : 's') + ' owned by someone else stayed where ' + (left === 1 ? 'it is' : 'they are') + '.' : '');
      pause.textContent = 'Close';
      pause.disabled = false;
      if (chip && chip.dismiss) { try { chip.dismiss(); } catch (e) { /* */ } chip = null; }
      if (!open) toast('Your films are in your Google Drive.', { type: 'success' });
    },
    stopped(e) {
      finished = true;
      const paused = e && e.paused;
      line.textContent = paused ? 'Paused. Nothing was deleted from the server that is not already in your Drive; the next sign-in carries on.'
        : 'Stopped: ' + ((e && e.message) || 'something went wrong') + ' Nothing was deleted that is not already in your Drive; the next sign-in tries again.';
      pause.textContent = 'Close';
      pause.disabled = false;
      if (chip && chip.dismiss) { try { chip.dismiss(); } catch (er) { /* */ } chip = null; }
      if (!open) toast(paused ? 'Moving to Google Drive is paused.' : 'Moving to Google Drive stopped. Nothing was lost; it carries on at the next sign-in.', { type: paused ? 'info' : 'error', action: 'Details', onAction: () => show() });
    }
  };
}

export function reconnectToast(onReconnect) {
  return toast('Google Drive needs you to sign in again. Your work is safe on this device until you do.', {
    type: 'error', action: 'Reconnect Google Drive', onAction: () => onReconnect()
  });
}

export function sharedFilmToast(onOpen) {
  return toast('A film was shared with you in Google Drive. Pick its folder once to open it here.', {
    type: 'info', action: 'Open the shared film', onAction: () => onOpen()
  });
}

export function lateFilesToast(n, onPick) {
  const msg = typeof n === 'number'
    ? n + ' new file' + (n === 1 ? '' : 's') + ' in this film — pick to open.'
    : 'This film’s files are not visible yet — pick them to open.';
  return toast(msg, { type: 'info', action: 'Pick files', onAction: () => onPick() });
}

/* ------------------------------------------------------------
   THE SHARE SHEET in drive mode: e-mail only, Drive permissions
   ------------------------------------------------------------ */
const ROLE_LABEL = { edit: 'Can edit', comment: 'Can comment', view: 'Can view' };
export function openDriveShareSheet(projectId, D, opts) {
  const o = opts || {};
  const email = h('input', { type: 'email', id: 'dsEmail', autocomplete: 'off', placeholder: 'name@gmail.com', 'aria-label': 'Their Google e-mail', list: 'dsSuggest' });
  const role = h('select', { id: 'dsRole', 'aria-label': 'What they can do' }, [
    h('option', { value: 'edit', text: 'Can edit' }),
    h('option', { value: 'comment', text: 'Can comment', selected: true }),
    h('option', { value: 'view', text: 'Can view' })
  ]);
  const add = button({ label: 'Share', variant: 'primary', attrs: { 'data-drive-share': '' } });
  const suggest = h('datalist', { id: 'dsSuggest' });
  const err = h('p.dm-err', { role: 'alert', hidden: true });
  const listEl = h('div.share-list', { id: 'dsList' }, [h('em', { class: 'cm-hint', text: 'Loading…' })]);
  const body = h('div.dm-sheet', { 'data-drive-share-sheet': '' }, [
    h('p.dm-deck', { text: 'This film lives in a folder in your Google Drive. Share the folder with a teammate’s Google account; Google e-mails them a link, and they open it in the studio.' }),
    h('div.share-row', {}, [email, role, add]), suggest, err,
    h('h3.share-h3', { text: 'People with access' }), listEl
  ]);
  async function render() {
    let rows = [];
    try { rows = await D.listShares(projectId); } catch (e) { rows = []; }
    listEl.replaceChildren();
    if (!rows.length) { listEl.append(h('em', { class: 'cm-hint', text: 'Only you, so far.' })); return; }
    for (const r of rows) {
      const rm = button({ label: 'Remove', variant: 'ghost', size: 'sm', attrs: { 'data-perm': r.id, 'aria-label': 'Remove ' + (r.email || r.name) } });
      rm.addEventListener('click', async () => {
        const Dialog = await import('./dialog.js');
        if (!await Dialog.askDanger('Remove ' + (r.email || 'this person') + '? They lose access to the film’s folder in Google Drive.')) return;
        try { await D.revokeShare(r.id, projectId); toast('Access removed.', { type: 'success' }); }
        catch (e) { toast((e && e.message) || String(e), { type: 'error' }); }
        render();
      });
      listEl.append(h('div.share-item', { 'data-drive-perm': r.email || '' }, [
        h('div.si-meta', {}, [h('span.si-role', { text: ROLE_LABEL[r.role] || r.role }), h('span.si-exp', { text: r.email || r.name || 'Anyone with the link' })]),
        h('span'), rm
      ]));
    }
  }
  add.addEventListener('click', async () => {
    const v = String(email.value || '').trim();
    err.hidden = true;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { err.textContent = 'Type their Google e-mail address.'; err.hidden = false; email.focus(); return; }
    add.disabled = true;
    try {
      await D.shareByEmail(projectId, v, role.value);
      email.value = '';
      toast('Shared with ' + v + '. Google has e-mailed them a link.', { type: 'success' });
      render();
    } catch (e) {
      err.textContent = (e && e.message) || String(e); err.hidden = false;
    } finally { add.disabled = false; }
  });
  /* The account's member e-mails as suggestions (seats are account
     membership; Drive permissions are not counted against them). */
  import('../lib/account.js').then((A) => A.loadAccount()).then((acc) => {
    for (const m of (acc && acc.members) || []) if (m.invited_email) suggest.append(h('option', { value: m.invited_email }));
  }).catch(() => { /* no account: no suggestions */ });
  sheet({ title: 'Share this film', body, kind: 'drive-share', focus: () => email, returnTo: o.returnTo || null });
  render();
}

export default { openMigrationSheet, reconnectToast, sharedFilmToast, lateFilesToast, openDriveShareSheet };
