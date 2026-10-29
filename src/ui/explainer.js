/* ============================================================
   EXPLAINER — help that opens OVER the page, never inside it
   ------------------------------------------------------------
   openExplainer({ title, build, returnTo, eyebrow, onClose }) → { close, body }

   Owner, 29 Oct 2026: every "What is a …?" opens as a pop-up, so the
   page a writer is working on never moves under them. An in-place
   <details> pushed every row below it down by the height of a
   definition, an example and two video facades.

   ONE FRAME PER WIDTH, the same as the rest of the app:
     - above 720px it is dialog.js's kit modal — the sign-out dialog's
       classes and structure (.modal-overlay.dlg-overlay > .modal.dlg
       .k-modal, a head with an eyebrow and an H3, a body, an actions
       bar), so kit.css styles it and the proofs read it the same way;
     - at 720px and below it is the phone's bottom sheet, through
       mobile-nav.js openSheet() (the kit's sheet()), which owns its own
       swipe, scrim, scroll lock and Escape.
   The query is the kit's phone query, (max-width: 720px), and it is
   LISTENED to: a window that crosses it while the explainer is open
   moves the SAME body node into the other frame (nothing is rebuilt,
   a video already playing is not reloaded).

   build(body) fills the body once, lazily, and may be async; until it
   settles the body says "Loading…" quietly and carries aria-busy.
   Escape, the scrim, × and the Close button all close it; focus is
   trapped by modal-focus.js and goes back to `returnTo` (the trigger).
   It writes NOTHING to storage. Motion is the frames' own: the
   modal's exit fade runs only under html.ma-on, every distance in
   either frame is × --motion, so reduced motion simply appears.
   ============================================================ */
import { h } from '../lib/dom.js';
import { holdFocus, releaseFocus } from './modal-focus.js';
import '../styles/explainer.css';

const PHONE = '(max-width: 720px)';
const sym = (name, cls) => h('span.' + cls + '.sym', { text: name, 'aria-hidden': 'true', translate: 'no' });

let current = null;

/** Close whichever explainer is open (there is only ever one). */
export function closeExplainer() { if (current) current.close(); }

export function openExplainer({ title = '', build, returnTo = null, eyebrow = 'Explainer', onClose = null } = {}) {
  if (current) current.close({ silent: true });
  const mq = typeof matchMedia === 'function' ? matchMedia(PHONE) : null;
  const body = h('div.xp-body', { 'aria-busy': 'true' }, [h('p.xp-wait', { text: 'Loading…' })]);
  const closeBtn = h('button.mbtn.k-btn.xp-done', { type: 'button', text: 'Close' });
  const footer = h('div.modal-actions.k-modal-actions.xp-actions', {}, [closeBtn]);

  let frame = null;      // { kind: 'modal' | 'sheet', overlay, teardown }
  let done = false;
  let switching = false;

  const focusBack = () => {
    if (returnTo && returnTo.isConnected && typeof returnTo.focus === 'function') {
      try { returnTo.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
    }
  };

  function finish({ silent = false } = {}) {
    if (done) return;
    done = true;
    if (mq) mq.removeEventListener('change', onMedia);
    const f = frame; frame = null;
    if (f) f.teardown();
    if (current === api) current = null;
    if (typeof onClose === 'function') { try { onClose(); } catch (e) { console.warn('[explainer] onClose', e); } }
    if (!silent) focusBack();
  }

  /* ---- above 720px: the kit modal ------------------------------- */
  function mountModal() {
    const id = 'xp-t-' + Math.random().toString(36).slice(2, 8);
    const overlay = h('div.modal-overlay.dlg-overlay.xp-overlay', { role: 'presentation' });
    const card = h('div.modal.dlg.k-modal.xp-modal', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id, 'data-explainer': '' });
    const x = h('button.k-btn.k-btn--ghost.k-btn--icon.k-modal-close', { type: 'button', 'aria-label': 'Close' }, [sym('close', 'k-sym')]);
    card.append(
      h('div.k-modal-head.no-icon', {}, [
        h('div.k-modal-titles', {}, [
          eyebrow ? h('p.k-eyebrow', { text: eyebrow }) : null,
          h('h3', { id, text: title })
        ].filter(Boolean)),
        x
      ]),
      h('div.k-modal-body.xp-scroll', {}, [body]),
      footer
    );
    overlay.append(card);
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.preventDefault(); e.stopPropagation(); finish();
    };
    const onDown = (e) => { if (e.target === overlay) finish(); };
    x.addEventListener('click', () => finish());
    overlay.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    document.body.append(overlay);
    overlay.classList.add('show');
    holdFocus(overlay);
    x.focus({ preventScroll: true });
    return {
      kind: 'modal',
      overlay,
      teardown() {
        document.removeEventListener('keydown', onKey, true);
        releaseFocus(overlay);
        /* the body and footer may be moving to the sheet: take them out
           before the card goes, so a lingering exit fade is empty */
        if (switching || !document.documentElement.classList.contains('ma-on')) { overlay.remove(); return; }
        overlay.classList.add('is-closing');
        overlay.inert = true;
        card.removeAttribute('aria-modal');
        let gone = false;
        const drop = () => { if (gone) return; gone = true; overlay.remove(); };
        overlay.addEventListener('transitionend', (e) => { if (e.target === overlay) drop(); });
        setTimeout(drop, 200);
      }
    };
  }

  /* ---- at 720px and below: the phone's sheet --------------------- */
  function mountSheet() {
    const wrap = h('div.mn-body.xp-sheet-body', { 'data-explainer': '' }, [body, footer]);
    const f = { kind: 'sheet', overlay: null, teardown: () => {} };
    import('./mobile-nav.js').then((m) => {
      if (done || frame !== f) return;
      const s = m.openSheet('explainer', title, wrap, {
        returnTo: null,       // focus goes back here, in finish()
        onClose: () => {
          if (switching || frame !== f) return;
          /* mobile-nav drops its sheet itself when the bottom bar detaches
             (the window grew past 720px), and that can run before our own
             media listener: that is a switch of frame, not a close */
          if (mq && !mq.matches) { frame = mountModal(); return; }
          finish();
        }
      });
      f.overlay = s && s.overlay;
      f.teardown = () => { if (f.overlay && f.overlay.isConnected && !f.overlay.classList.contains('is-closing')) m.closeSheet(); };
    }).catch(() => { if (frame === f) { frame = null; switching = false; frame = mountModal(); } });
    return f;
  }

  const mount = () => (mq && mq.matches ? mountSheet() : mountModal());

  function onMedia() {
    if (done || !frame) return;
    const want = mq.matches ? 'sheet' : 'modal';
    if (frame.kind === want) return;
    switching = true;
    const old = frame;
    frame = null;
    old.teardown();
    switching = false;
    frame = mount();
  }

  closeBtn.addEventListener('click', () => finish());
  if (mq) mq.addEventListener('change', onMedia);
  frame = mount();

  const api = { close: (o) => finish(o), body };
  current = api;

  Promise.resolve()
    .then(() => (typeof build === 'function' ? build(body) : null))
    .catch(() => {
      body.replaceChildren(h('p.xp-wait', { text: 'This explanation could not be loaded.' }));
    })
    .then(() => {
      body.removeAttribute('aria-busy');
      const w = body.querySelector(':scope > .xp-wait');
      if (w && body.children.length > 1) w.remove();
    });
  return api;
}

export default { openExplainer, closeExplainer };
