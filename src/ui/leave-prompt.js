/* ============================================================
   LEAVE PROMPT — "Your script changed since Draft 3."
   ------------------------------------------------------------
   installLeavePrompt({ getDoc, persistNow }) is called once by a page
   that edits the script (script.html; drafts.html in its own way).

   WHEN IT ASKS: the writer follows an in-app link (a same-origin <a>
   that is not a '#' jump, the stage bar's links among them) or picks
   another project from the band's switcher, AND the working copy
   differs from the latest draft (changedSinceDraft — derived, never
   stored). The dialog offers
        Save as Draft N+1 · Update Draft N · Not now
   or, before any draft exists,  Save as Draft 1 · Not now.
   After ANY answer — Escape and the scrim included, which mean "Not
   now" — the navigation carries on. Not now leaves everything in the
   always-saved working copy.

   Ctrl/⌘+S opens the same dialog and does not navigate.

   The browser's own close/reload gets the standard beforeunload
   warning only (browsers forbid a custom one), and only when changed.
   Once the writer has answered the dialog the warning is off for that
   navigation, so nobody is asked twice.

   NEVER BLOCKS TYPING: nothing here listens to input, nothing runs on
   a timer, nothing writes unless a button is pressed. persistNow() is
   called before a draft is written, and again after.

   Returns { changed(), prompt(), dispose() }; the page may use
   changed() to show "Unsaved draft changes" beside the draft name,
   and listens for the `fms:drafts-changed` event on document to
   refresh it after a draft is saved.
   ============================================================ */
import { h } from '../lib/dom.js';
import '../styles/leave-prompt.css';
import StudioUI from './chrome.js';
import { holdFocus, releaseFocus } from './modal-focus.js';
import {
  changedSinceDraft, latestDraft, nextDraftNumber, saveNewDraft, updateDraft
} from '../lib/drafts.js';

let seq = 0;

/** A small modal: resolves with the chosen id, or null for Escape / the
    scrim / the close control ("Not now"). `choices` are
    { id, label, primary?, danger? }. Exported for the drafts page. */
export function choiceDialog({ title, body, choices, field }) {
  return new Promise((resolve) => {
    const uid = 'lp' + (++seq);
    let input = null;
    const card = h('div.modal.lp-card', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': uid + 't' }, [
      h('h3', { id: uid + 't', text: title }),
      body ? h('p.deck', { text: body }) : null
    ]);
    if (field) {
      input = h('input.lp-field', { type: 'text', maxlength: '120', placeholder: field, 'aria-label': field });
      card.append(input);
    }
    const row = h('div.lp-actions');
    for (const c of choices) {
      row.append(h('button.btn' + (c.primary ? '.primary' : '') + (c.danger ? '.danger' : ''), {
        type: 'button', 'data-lp': c.id, text: c.label
      }));
    }
    card.append(row);
    const overlay = h('div.modal-overlay.show.lp-overlay', {}, [card]);
    let done = false;
    const close = (id) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      releaseFocus(overlay);
      overlay.remove();
      resolve({ id, value: input ? input.value.trim() : '' });
    };
    const notNow = () => close(null);
    const onKey = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); notNow(); } };
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) notNow();
      const b = e.target.closest && e.target.closest('[data-lp]');
      if (b) close(b.dataset.lp);
    });
    if (input) input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); const p = choices.find((c) => c.primary); if (p) close(p.id); }
    });
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    holdFocus(overlay);
    const first = overlay.querySelector('.btn.primary') || overlay.querySelector('button');
    (input || first).focus();
  });
}

const say = (m) => { try { StudioUI.toast(m, { type: 'success' }); } catch (e) { /* chrome not up */ } };

export function installLeavePrompt({ getDoc, persistNow } = {}) {
  const doc = () => (typeof getDoc === 'function' ? getDoc() : null);
  const flush = () => { try { if (typeof persistNow === 'function') persistNow(); } catch (e) { console.warn('[leave] persist', e); } };
  const changed = () => { const d = doc(); return !!d && changedSinceDraft(d); };

  let bypass = false;      // the navigation we resume must not be intercepted again
  let answered = false;    // set only when a navigation is resuming after an answer
  let open = false;

  /* Ask once. Resolves true when a draft was saved/updated. */
  async function prompt() {
    const d = doc();
    if (!d || open) return false;
    if (!changed()) return false;
    open = true;
    try {
      const last = latestDraft(d);
      const next = last ? 'Draft ' + nextDraftNumber(d) : 'Draft 1';
      const choices = [{ id: 'new', label: 'Save as ' + next, primary: true }];
      if (last) choices.push({ id: 'update', label: 'Update ' + last.name });
      choices.push({ id: 'skip', label: 'Not now' });
      const res = await choiceDialog({
        title: last ? 'Your script changed since ' + last.name + '.' : 'Save this script as a draft?',
        body: last
          ? 'A draft is a copy you can come back to, compare and print. What you have written is already kept either way.'
          : 'You have not saved a draft yet. A draft is a copy you can come back to, compare and print. What you have written is already kept either way.',
        choices
      });
      if (res.id === 'new' || res.id === 'update') {
        flush();
        const dd = doc();
        const made = res.id === 'new' ? saveNewDraft(dd) : updateDraft(dd, last.id);
        flush();
        try { document.dispatchEvent(new CustomEvent('fms:drafts-changed', { detail: { draft: made && made.number } })); } catch (e) { /* old engine */ }
        say((res.id === 'new' ? 'Saved as ' : 'Updated ') + (made ? made.name : 'the draft') + '.');
        return true;
      }
      return false;
    } finally {
      open = false;
    }
  }

  const sameDoc = (url) => url.origin === location.origin && url.pathname === location.pathname && url.search === location.search;

  function onClick(e) {
    if (bypass || e.defaultPrevented || e.button !== 0) return;
    const t = e.target && e.target.closest ? e.target.closest('a[href], .ps-item') : null;
    if (!t) return;
    let href = null;
    if (t.tagName === 'A') {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;      // a new tab keeps this one
      if ((t.target && t.target !== '_self') || t.hasAttribute('download')) return;
      const raw = t.getAttribute('href') || '';
      if (!raw || raw.startsWith('#')) return;
      let url;
      try { url = new URL(raw, location.href); } catch (err) { return; }
      if (!/^https?:$/.test(url.protocol) || url.origin !== location.origin) return;
      if (sameDoc(url)) return;
      href = url.href;
    } else if (t.classList.contains('is-current')) {
      return;                                                           // the project already open
    }
    if (!changed()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    prompt().then(() => {
      answered = true;          // asked; the browser's own warning would be a second ask
      if (href) { location.assign(href); return; }
      bypass = true;
      try { t.click(); } finally { bypass = false; }
    });
  }

  function onKeydown(e) {
    if (!((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 's' || e.key === 'S'))) return;
    e.preventDefault();                       // never the browser's "Save page as"
    if (!changed()) {
      const last = latestDraft(doc() || {});
      try {
        StudioUI.toast(last ? 'No changes since ' + last.name + '.' : 'Nothing to save yet.', { type: 'info' });
      } catch (err) { /* chrome not up */ }
      return;
    }
    prompt();
  }

  function onBeforeUnload(e) {
    if (answered || !changed()) return;
    e.preventDefault();
    e.returnValue = '';
  }

  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeydown);
  window.addEventListener('beforeunload', onBeforeUnload);

  return {
    changed,
    prompt,
    dispose() {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('keydown', onKeydown);
      window.removeEventListener('beforeunload', onBeforeUnload);
    }
  };
}

export default { installLeavePrompt, choiceDialog };
