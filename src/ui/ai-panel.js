/* ============================================================
   THE PARTS EVERY AI PANEL HAS
   ------------------------------------------------------------
   Three jobs in this studio call a model — the shot division on
   visualize.html, the dialogue pass on write.html and the step
   critique on feature.html — and all three need the same four
   things around the one thing that differs:

     the key form     when there is no key on this device
     the key bar      which key, which model, replace, forget
     the gate         what is missing and what to do about it
     the disclosure   what leaves the browser, before it leaves

   This module owns those four and the handlers behind them.
   src/lib/ai.js owns the request; the pages own their own job.
   Nothing here knows what a shot or a speech is.

   WHY A MODULE AND NOT A THIRD COPY. The key form is the place a
   user types a credential. Three hand-copied versions of it is
   three chances for one of them to forget `type="password"`, or
   to keep the value in the DOM after saving, or to word the
   privacy line more generously than the code deserves. It is
   exactly the shape of duplication CLAUDE.md's money-parser
   entry is about, with worse consequences.

   IT IS LAZY. Pages reach this with `import()` at a click, so
   the key machinery, the step JSON behind the blueprint context
   and the model call are all out of first paint.

   THE KEY NEVER COMES BACK OUT. It is read from the field, handed
   to src/lib/ai.js, and the field is emptied. Nothing here
   renders it, logs it, or puts it in an attribute — the only
   thing the DOM ever holds is maskKey(), which is twelve bullets
   and the last four characters.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import AI from '../lib/ai.js';

/* View state, and none of it is stored. Whether the key form is
   open is not the user's work, and a "replace your key" form that
   survived a reload would be a question nobody remembers being
   asked. */
let editingKey = false;

const listeners = new Set();
/** Pages subscribe so their panel can redraw when the key or the
    model changes underneath it. Returns an unsubscribe. */
export function onAIChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function announce() {
  for (const fn of listeners) { try { fn(); } catch (e) { console.warn('[ai-panel]', e); } }
}

export function hasKey() { return AI.hasKey(); }

/* ---- the key form ------------------------------------------ */
export function keyForm() {
  const box = h('div.ai-key');
  box.append(h('p.ai-lead', {
    text: 'This uses your own Anthropic API key. It is saved in this browser only — '
        + 'it is never put in a backup file, never synced to the cloud, and never '
        + 'attached to a project. Every call is billed to your account.'
  }));
  box.append(h('label.ai-field', {}, [
    h('span.ai-flabel', { text: 'API key' }),
    h('input.ai-key-input', {
      type: 'password', autocomplete: 'off', spellcheck: 'false',
      placeholder: 'sk-ant-…', 'aria-label': 'Anthropic API key'
    })
  ]));
  box.append(h('div.ai-acts', {}, [
    h('button.btn.primary', { type: 'button', 'data-action': 'ai-save-key', text: 'Save the key' }),
    editingKey
      ? h('button.btn', { type: 'button', 'data-action': 'ai-cancel-key', text: 'Cancel' })
      : null,
    h('a.ai-link', {
      href: 'https://console.anthropic.com/settings/keys',
      target: '_blank', rel: 'noopener noreferrer',
      text: 'Where do I get one?  ↗'
    })
  ]));
  return box;
}

/* ---- the key bar ------------------------------------------- */
export function keyBar() {
  const bar = h('div.ai-bar');
  // maskKey(), never the key. Twelve bullets and four characters is
  // enough to tell two keys apart and not enough to use.
  bar.append(h('span.ai-keystate', { text: 'Key on this device: ' + AI.maskKey() }));

  const sel = h('select.ai-sel', { 'data-action': 'ai-model', 'aria-label': 'Model' });
  const current = AI.getModel();
  AI.AI_MODELS.forEach((m) => {
    const opt = h('option', { value: m.id, text: m.label + ' — ' + m.hint });
    if (m.id === current) opt.selected = true;
    sel.append(opt);
  });
  bar.append(h('label.ai-modelwrap', {}, [h('span.ai-flabel', { text: 'Model' }), sel]));

  bar.append(h('span.ai-gap'));
  bar.append(h('button.btn', { type: 'button', 'data-action': 'ai-edit-key', text: 'Replace key' }));
  bar.append(h('button.btn.danger', { type: 'button', 'data-action': 'ai-forget-key', text: 'Forget key' }));
  return bar;
}

/* ---- the two gates ------------------------------------------
   A gate says which thing is missing and what to do about it. A
   disabled button says neither, which is why there are no disabled
   buttons in these panels. */
export function gate(lead, body, cta) {
  const p = h('div.ai-gate');
  p.append(h('p', {}, [h('strong', { text: lead + ' ' }), h('span', { text: body })]));
  if (cta) p.append(cta);
  return p;
}

/** The key gate, with the form under it. Returns null when a key is
    present and the user is not replacing it — so a caller can write
    `const g = keyGate(); if (g) { panel.append(g); return panel; }`
    and have the two gates stay genuinely independent. */
export function keyGate(what) {
  if (AI.hasKey() && !editingKey) return null;
  const wrap = h('div.ai-keygate');
  if (!AI.hasKey()) {
    wrap.append(gate(
      'No API key on this device.',
      what + ' runs against Anthropic’s API and there is no server here to run it '
        + 'for you, so it needs a key of your own. Paste one below and it stays on '
        + 'this device.'
    ));
  }
  wrap.append(keyForm());
  // `blocking` tells the caller whether to stop here: replacing a key
  // that already works should not hide the rest of the panel.
  wrap.dataset.blocking = AI.hasKey() ? 'false' : 'true';
  return wrap;
}

/* ---- what leaves the browser -------------------------------
   Before the button, never after it. CLAUDE.md: the screenplay is
   the user's unpublished work, and this is the only place in the
   studio that puts any of it on the network. */
export function disclose(body) {
  return h('div.ai-disclose', {}, [
    h('strong', { text: 'What gets sent, and where' }),
    h('p', { text: body })
  ]);
}

export function statusLine(text) {
  return text ? h('p.ai-status', { role: 'status', text }) : null;
}

export function errorLine(text) {
  if (!text) return null;
  return h('p.ai-error', { role: 'alert' }, [
    h('strong', { text: 'It did not run. ' }),
    h('span', { text })
  ]);
}

/** The mark every piece of model-written text carries. One object,
    so a reader learns it once and then recognises it everywhere. */
export function aiMark(text) {
  return h('span.ai-mark', { title: 'Written by a model, not by you', text: text || 'AI' });
}

/* ---- handlers, bound once ----------------------------------
   Delegated on `document`, with no inline handlers: a strict CSP
   ships and an inline handler breaks the page under it. */
let wired = false;
export function wireAIPanel() {
  if (wired) return;
  wired = true;

  delegate(document, 'click', '[data-action="ai-save-key"]', (e, btn) => {
    const box = btn.closest('.ai-key');
    const input = box && box.querySelector('.ai-key-input');
    if (!input) return;
    const value = input.value;
    // The field is emptied before anything else happens, so the key
    // is not sitting in the DOM while a save is being reported.
    input.value = '';
    if (!AI.looksLikeKey(value)) {
      setPanelNote(box, 'That does not look like an Anthropic key. They start with '
        + '"sk-ant-". Nothing was saved.');
      return;
    }
    if (!AI.setKey(value)) {
      setPanelNote(box, 'This browser refused to store the key — private browsing, or '
        + 'storage is full. Nothing was saved.');
      return;
    }
    editingKey = false;
    announce();
  });

  delegate(document, 'click', '[data-action="ai-edit-key"]', () => {
    editingKey = true;
    announce();
  });
  delegate(document, 'click', '[data-action="ai-cancel-key"]', () => {
    editingKey = false;
    announce();
  });

  delegate(document, 'click', '[data-action="ai-forget-key"]', () => {
    if (!confirm('Forget the API key on this device?\n\n'
      + 'Nothing you have written is touched. You will need to paste the key again '
      + 'to use any of the model-backed tools.')) return;
    AI.clearKey();
    editingKey = false;
    announce();
  });

  delegate(document, 'change', 'select[data-action="ai-model"]', (e, sel) => {
    AI.setModel(sel.value);
    announce();
  });
}

/** A one-line note inside the key box. Put in the DOM rather than a
    toast because it is about the field the user is looking at. */
function setPanelNote(box, text) {
  if (!box) return;
  let note = box.querySelector('.ai-keynote');
  if (!note) {
    note = h('p.ai-keynote', { role: 'alert' });
    box.append(note);
  }
  note.textContent = text;
}

export default {
  onAIChange, hasKey,
  keyForm, keyBar, keyGate, gate, disclose,
  statusLine, errorLine, aiMark, wireAIPanel
};
