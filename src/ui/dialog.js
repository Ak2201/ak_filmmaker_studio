/* ============================================================
   DIALOG — the app's own confirm / alert / prompt
   ------------------------------------------------------------
   The browser's confirm(), alert() and prompt() are a grey system box
   that names the host ("thefilmmakerstudio.vercel.app says"), cannot
   be themed, blocks the page and reads as a different product (owner,
   11 Oct 2026: "all pops should be used inside app only"). These are
   the same three questions, asked in the studio's own modal:

     ask({ title, body, confirm, cancel, danger, typeToConfirm,
           checkbox })                    → Promise<boolean | {ok, checked}>
     tell({ title, body, ok })            → Promise<void>
     askText({ title, body, value, placeholder, confirm })
                                          → Promise<string | null>

   Each resolves exactly once. Escape and the scrim cancel; Enter
   confirms (the confirm button is focused, except for typeToConfirm
   and askText where the field is). Built on the existing .modal-overlay
   / .modal / .modal-actions styles and modal-focus.js, so it is themed,
   skinned, reduced-motion aware and Tab-trapped like every other
   dialog in the app. One dialog at a time: a second call waits for the
   first to close. Nothing here writes storage.

   `checkbox: { label, checked }` adds one tick-box (e.g. "Also delete
   the Google Drive backup") and makes ask() resolve
   { ok, checked } instead of a boolean.
   ============================================================ */
import { h } from '../lib/dom.js';
import { holdFocus, releaseFocus } from './modal-focus.js';

let queue = Promise.resolve();

function open(build) {
  const run = () => new Promise((resolve) => {
    const overlay = h('div.modal-overlay.dlg-overlay', { role: 'presentation' });
    const card = h('div.modal.dlg', { role: 'dialog', 'aria-modal': 'true' });
    overlay.append(card);
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      releaseFocus(overlay);
      overlay.remove();
      resolve(v);
    };
    const parts = build(card, finish);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(parts.cancelValue); }
    };
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) finish(parts.cancelValue); });
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    // .show on the next frame so the existing @starting-style fade runs
    requestAnimationFrame(() => overlay.classList.add('show'));
    overlay.classList.add('show');
    holdFocus(overlay);
    (parts.focus || card).focus({ preventScroll: true });
  });
  const p = queue.then(run, run);
  queue = p.then(() => {}, () => {});
  return p;
}

function head(card, title, body) {
  const id = 'dlg-t-' + Math.random().toString(36).slice(2, 8);
  card.setAttribute('aria-labelledby', id);
  card.append(h('h3', { id, text: title || 'Are you sure?' }));
  if (body) {
    const paras = Array.isArray(body) ? body : String(body).split(/\n{2,}/);
    for (const t of paras) if (t) card.append(h('p.deck', { text: t }));
  }
}

function actions(card, list) {
  const row = h('div.modal-actions');
  for (const b of list) row.append(b);
  card.append(row);
  return row;
}

/* A native-style message → {title, body}. The first paragraph (or, for a
   one-paragraph message longer than a short question, its first sentence)
   is the title; the rest is the body. The wording is the caller's, as it
   was when it went to confirm(). */
function fromMessage(msg) {
  const text = String(msg == null ? '' : msg).trim();
  const para = text.split(/\n{2,}/);
  if (para.length > 1) return { title: para[0].trim(), body: para.slice(1).join('\n\n') };
  if (text.length > 70) {
    const m = text.match(/^(.{20,}?[.?!])\s+(\S[\s\S]*)$/);
    if (m) return { title: m[1], body: m[2] };
  }
  return { title: text, body: '' };
}

/** confirm(), in the app. Takes an options object, or a plain message
    string (split into title and body) plus optional extra options. */
export function ask(opts = {}, extra) {
  if (typeof opts === 'string') opts = { ...fromMessage(opts), ...(extra || {}) };
  return open((card, finish) => {
    head(card, opts.title, opts.body);
    let box = null;
    if (opts.checkbox) {
      box = h('input', { type: 'checkbox', id: 'dlgCheck' });
      box.checked = !!opts.checkbox.checked;
      card.append(h('label.dlg-check', { for: 'dlgCheck' }, [box, h('span', { text: opts.checkbox.label })]));
    }
    const yes = h('button.mbtn.primary' + (opts.danger ? '.danger' : ''), { type: 'button', text: opts.confirm || 'OK' });
    const no = h('button.mbtn', { type: 'button', text: opts.cancel || 'Cancel' });
    const result = (ok) => (box ? { ok, checked: ok && box.checked } : ok);
    let field = null;
    if (opts.typeToConfirm) {
      const want = String(opts.typeToConfirm);
      field = h('input.dlg-field', { type: 'text', autocomplete: 'off', 'aria-label': 'Type ' + want + ' to confirm', placeholder: want });
      card.append(h('p.dlg-hint', { text: 'Type ' + want + ' to confirm.' }), field);
      yes.disabled = true;
      field.addEventListener('input', () => { yes.disabled = field.value.trim() !== want; });
      field.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !yes.disabled) { e.preventDefault(); finish(result(true)); } });
    }
    yes.addEventListener('click', () => finish(result(true)));
    no.addEventListener('click', () => finish(result(false)));
    actions(card, [no, yes]);
    return { cancelValue: result(false), focus: field || yes };
  });
}

/** confirm() for something that destroys: the confirm button is red. */
export function askDanger(opts = {}, extra) {
  return ask(opts, { danger: true, ...(extra || {}) });
}

/** alert(), in the app. */
export function tell(opts = {}) {
  if (typeof opts === 'string') opts = { body: opts };
  return open((card, finish) => {
    head(card, opts.title || 'Note', opts.body);
    const ok = h('button.mbtn.primary', { type: 'button', text: opts.ok || 'OK' });
    ok.addEventListener('click', () => finish(undefined));
    actions(card, [ok]);
    return { cancelValue: undefined, focus: ok };
  });
}

/** prompt(), in the app. Resolves the trimmed text, or null on cancel. */
export function askText(opts = {}, extra) {
  if (typeof opts === 'string') opts = { ...fromMessage(opts), ...(extra || {}) };
  return open((card, finish) => {
    head(card, opts.title, opts.body);
    const field = h('input.dlg-field', { type: 'text', autocomplete: 'off', placeholder: opts.placeholder || '', 'aria-label': opts.title || 'Answer' });
    field.value = opts.value || '';
    card.append(field);
    const yes = h('button.mbtn.primary', { type: 'button', text: opts.confirm || 'OK' });
    const no = h('button.mbtn', { type: 'button', text: opts.cancel || 'Cancel' });
    yes.addEventListener('click', () => finish(field.value.trim()));
    no.addEventListener('click', () => finish(null));
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(field.value.trim()); } });
    actions(card, [no, yes]);
    return { cancelValue: null, focus: field };
  });
}

export default { ask, askDanger, tell, askText };
