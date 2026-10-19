/* ============================================================
   DIALOG — the app's own confirm / alert / prompt
   ------------------------------------------------------------
   The browser's confirm(), alert() and prompt() are a grey system box
   that names the host ("filmmakerstudio.in says"), cannot
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
   SWISS MODAL (14 Oct 2026). The card is built as the kit's modal
   (kit.css, .dlg.k-modal): a head with an optional icon tile, a mono
   EYEBROW and the H3; a body; an optional kit notice; for
   typeToConfirm, a "Type WORD to confirm · CASE-SENSITIVE" row whose
   field shows VERIFIED once it matches; and an actions bar. Every
   option below is optional and every old call reads as before:
     eyebrow   the mono line above the title (default per kind)
     icon      a Material Symbols name for the icon tile (listed in
               src/data/section-icons.json `icons`)
     tone      'danger' | 'warn' | 'info' (danger: true implies danger)
     notice    { tone, title, body } — a kit notice inside the body
   The class names the proofs and older styles read are kept: .dlg,
   .dlg-overlay, .modal, .modal-actions, .mbtn(.primary)(.danger),
   .dlg-field, .dlg-hint, .dlg-check, and the title is still `.dlg h3`.
   The × close button is deliberately NOT an .mbtn.
   ============================================================ */
import { h } from '../lib/dom.js';
import { holdFocus, releaseFocus } from './modal-focus.js';
import { notice as kitNotice } from './kit/notice.js';
import { setPort } from '../lib/ports.js';

let queue = Promise.resolve();

const symSpan = (name, cls) => h('span.' + cls + '.sym', { text: name, 'aria-hidden': 'true', translate: 'no' });

function open(build) {
  const run = () => new Promise((resolve) => {
    const overlay = h('div.modal-overlay.dlg-overlay', { role: 'presentation' });
    const card = h('div.modal.dlg.k-modal', { role: 'dialog', 'aria-modal': 'true' });
    overlay.append(card);
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey, true);
      releaseFocus(overlay);
      resolve(v);
      /* The exit. Focus and the answer are settled above, synchronously;
         only the pixels linger. Under ma-on (motion wanted, a real
         browser) the overlay fades for --speed-exit and then goes; without
         it — reduced motion, or webdriver, which is every proof — it is
         removed at once, exactly as before. */
      if (!document.documentElement.classList.contains('ma-on')) { overlay.remove(); return; }
      overlay.classList.add('is-closing');
      /* a leaving dialog is no longer one: nothing in it takes focus and
         the page behind it is no longer hidden from a screen reader */
      overlay.inert = true;
      card.removeAttribute('aria-modal');
      overlay.removeAttribute('aria-modal');
      let gone = false;
      const drop = () => { if (gone) return; gone = true; overlay.remove(); };
      overlay.addEventListener('transitionend', (e) => { if (e.target === overlay) drop(); });
      setTimeout(drop, 200);
    };
    const parts = build(card, finish);
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finish(parts.cancelValue); }
    };
    overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) finish(parts.cancelValue); });
    const x = card.querySelector('.k-modal-close');
    if (x) x.addEventListener('click', () => finish(parts.cancelValue));
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

/* The head and the body. Returns the body, which the caller fills. */
function head(card, opts, defaults) {
  const id = 'dlg-t-' + Math.random().toString(36).slice(2, 8);
  card.setAttribute('aria-labelledby', id);
  const tone = opts.tone || (opts.danger ? 'danger' : defaults.tone || '');
  if (tone === 'danger') card.classList.add('is-danger');
  if (tone === 'warn') card.classList.add('is-warn');
  const icon = opts.icon === false ? null : (opts.icon || defaults.icon || null);
  const top = h('div.k-modal-head' + (icon ? '' : '.no-icon'));
  if (icon) top.append(symSpan(icon, 'k-modal-icon'));
  const titles = h('div.k-modal-titles');
  const eyebrow = opts.eyebrow === false ? null : (opts.eyebrow || defaults.eyebrow || null);
  if (eyebrow) titles.append(h('p.k-eyebrow', { text: eyebrow }));
  titles.append(h('h3', { id, text: opts.title || 'Are you sure?' }));
  top.append(titles);
  top.append(h('button.k-btn.k-btn--ghost.k-btn--icon.k-modal-close', { type: 'button', 'aria-label': 'Close' }, [symSpan('close', 'k-sym')]));
  card.append(top);
  const body = h('div.k-modal-body');
  const text = opts.body;
  if (text) {
    const paras = Array.isArray(text) ? text : String(text).split(/\n{2,}/);
    for (const t of paras) if (t) body.append(h('p.deck', { text: t }));
  }
  if (opts.notice) {
    const n = typeof opts.notice === 'string' ? { body: opts.notice } : opts.notice;
    body.append(kitNotice({ tone: n.tone || (tone === 'danger' ? 'danger' : 'warn'), title: n.title, body: n.body }));
  }
  card.append(body);
  return body;
}

function actions(card, list) {
  const row = h('div.modal-actions.k-modal-actions');
  for (const b of list) row.append(b);
  card.append(row);
  return row;
}

/* The typed confirmation: "Type WORD to confirm" over a mono field that
   says VERIFIED once it matches, exactly and case-sensitively. */
function typedConfirm(body, want) {
  const block = h('div.k-confirm');
  const label = h('p.dlg-hint.k-confirm-label');
  label.append(h('span', {}, ['Type ', h('span.k-confirm-word', { text: want }), ' to confirm']),
    h('span.k-confirm-case', { text: 'Case-sensitive' }));
  const field = h('input.dlg-field', { type: 'text', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Type ' + want + ' to confirm', placeholder: want });
  const ok = h('span.k-trail.k-confirm-ok', { 'aria-hidden': 'true' }, [symSpan('check_circle', 'k-sym'), h('span', { text: 'Verified' })]);
  const ctl = h('div.k-control.k-control--mono', {}, [field, ok]);
  block.append(label, ctl);
  body.append(block);
  return { field, block };
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
    const body = head(card, opts, opts.danger
      ? { eyebrow: 'Destructive action', icon: 'warning', tone: 'danger' }
      : { eyebrow: 'Confirm', icon: 'info' });
    let box = null;
    if (opts.checkbox) {
      box = h('input', { type: 'checkbox', id: 'dlgCheck' });
      box.checked = !!opts.checkbox.checked;
      body.append(h('label.dlg-check.k-check', { for: 'dlgCheck' }, [box, h('span', { text: opts.checkbox.label })]));
    }
    const yes = h('button.mbtn.primary.k-btn' + (opts.danger ? '.danger.k-btn--danger' : '.k-btn--primary'), { type: 'button', text: opts.confirm || 'OK' });
    const no = h('button.mbtn.k-btn', { type: 'button', text: opts.cancel || 'Cancel' });
    const result = (ok) => (box ? { ok, checked: ok && box.checked } : ok);
    let field = null;
    if (opts.typeToConfirm) {
      const want = String(opts.typeToConfirm);
      const tc = typedConfirm(body, want);
      field = tc.field;
      yes.disabled = true;
      field.addEventListener('input', () => {
        const match = field.value.trim() === want;
        yes.disabled = !match;
        tc.block.classList.toggle('is-verified', match);
      });
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
    head(card, { ...opts, title: opts.title || 'Note' }, { eyebrow: 'Notice', icon: 'info' });
    const ok = h('button.mbtn.primary.k-btn.k-btn--primary', { type: 'button', text: opts.ok || 'OK' });
    ok.addEventListener('click', () => finish(undefined));
    actions(card, [ok]);
    return { cancelValue: undefined, focus: ok };
  });
}

/** prompt(), in the app. Resolves the trimmed text, or null on cancel. */
export function askText(opts = {}, extra) {
  if (typeof opts === 'string') opts = { ...fromMessage(opts), ...(extra || {}) };
  return open((card, finish) => {
    const body = head(card, opts, { eyebrow: 'Input', icon: 'edit_note' });
    const field = h('input.dlg-field', { type: 'text', autocomplete: 'off', placeholder: opts.placeholder || '', 'aria-label': opts.title || 'Answer' });
    field.value = opts.value || '';
    body.append(h('div.k-control', {}, [field]));
    const yes = h('button.mbtn.primary.k-btn.k-btn--primary', { type: 'button', text: opts.confirm || 'OK' });
    const no = h('button.mbtn.k-btn', { type: 'button', text: opts.cancel || 'Cancel' });
    yes.addEventListener('click', () => finish(field.value.trim()));
    no.addEventListener('click', () => finish(null));
    field.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); finish(field.value.trim()); } });
    actions(card, [no, yes]);
    return { cancelValue: null, focus: field };
  });
}

// The logic layer asks through a port, never by importing this file.
setPort('ask', ask);

export default { ask, askDanger, tell, askText };
