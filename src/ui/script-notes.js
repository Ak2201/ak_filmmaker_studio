/* ============================================================
   SCRIPT NOTES OVERVIEW (opened from screenplay.html's ⋯ menu)
   ------------------------------------------------------------
   Every note on the script in one dialog: filter by state, scene,
   author and kind; download as text or CSV; jump to the line.

   A DERIVED VIEW. It reads src/lib/script-notes.js (pure) over the
   script's elements, the private notes already on this device and,
   when signed in, the shared threads comments.js already fetches.
   It writes nothing — no key, no draft of the filters. Filter state
   lives in this closure and goes with the dialog.

   Loaded on first use (dynamic import), so none of it is in the
   page's first paint.
   ============================================================ */
import '../styles/script-notes.css';
import { h, delegate } from '../lib/dom.js';
import { holdFocus, releaseFocus } from './modal-focus.js';
import * as Notes from '../lib/script-notes.js';

let dlg = null;

function download(name, text, type) {
  const url = URL.createObjectURL(new Blob(['﻿' + text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
const slug = (s) => String(s || 'script').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'script';

/**
 * opts: { getElements, getNumbering, title, goTo(id), say(msg) }
 */
export async function openScriptNotes(opts) {
  if (dlg) return;
  const Comments = await import('./comments.js');
  Comments.mountComments({ scope: 'script' });
  let shared = new Map(), cloudState = 'local';
  try {
    shared = await Comments.loadThreads(true);
    cloudState = shared.size ? 'cloud' : (window.StudioCloud && window.StudioCloud.getSession && window.StudioCloud.getSession() ? 'cloud' : 'local');
  } catch (e) { /* local notes still work */ }

  const rows = () => Notes.buildNotes({
    elements: opts.getElements(), numbering: opts.getNumbering && opts.getNumbering(),
    comments: shared,
    readNote: (id) => { try { return localStorage.getItem(Notes.NOTE_PREFIX + Notes.KEY_PREFIX + id) || ''; } catch (e) { return ''; } }
  });
  const f = { state: 'all', sceneId: '', author: '', kind: '' };
  const all = rows();
  const fx = Notes.facets(all);

  const sel = (name, label, options) => h('label.sn-f', {}, [
    h('span', { text: label }),
    h('select', { 'data-sn': name }, options.map(([v, t]) => h('option', { value: v, text: t })))
  ]);
  const list = h('div.sn-list', { 'aria-live': 'polite' });
  const count = h('p.sn-count', { role: 'status' });

  function draw() {
    const shown = Notes.filterNotes(all, f);
    const c = Notes.counts(all);
    count.textContent = shown.length + ' of ' + c.total + (c.total === 1 ? ' note' : ' notes') + ' · ' + c.open + ' open, ' + c.resolved + ' resolved';
    if (!shown.length) {
      list.replaceChildren(h('p.sn-empty', { text: c.total ? 'No notes match these filters.' : 'No notes on this script yet. Press Ctrl/⌘+Shift+K on a line to add one.' }));
      return;
    }
    list.replaceChildren(...Notes.groupByScene(shown).map((g) => h('section.sn-scene', {}, [
      h('h3', { text: g.label }),
      ...g.rows.map((r) => h('article.sn-note' + (r.open ? '' : '.is-done'), { 'data-id': r.id }, [
        h('p.sn-meta', {}, [
          h('span.sn-badge' + (r.kind === 'private' ? '.is-private' : r.open ? '.is-open' : '.is-resolved'),
            { text: r.kind === 'private' ? 'Private' : r.open ? 'Open' : 'Resolved' }),
          h('span', { text: r.author + (r.created ? ' · ' + r.created.slice(0, 10) : '') })
        ]),
        r.line ? h('p.sn-line', { text: 'On: ' + r.line }) : null,
        h('p.sn-body', { text: r.body }),
        ...r.replies.map((p) => h('p.sn-reply', { text: '↳ ' + p.author + ': ' + p.body })),
        r.sceneId || r.scene !== 'Deleted line'
          ? h('button.btn.sn-go', { type: 'button', 'data-sn-go': r.elementId, text: 'Go to line' }) : null
      ].filter(Boolean)))
    ])));
  }

  const close = () => { if (!dlg) return; releaseFocus(dlg); dlg.remove(); dlg = null; document.removeEventListener('keydown', onKey, true); };
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  document.addEventListener('keydown', onKey, true);

  dlg = h('div.sn', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Script notes' }, [
    h('div.sn-card', {}, [
      h('div.sn-head', {}, [
        h('h2', { text: 'Script notes' }),
        h('button.bd-icon', { type: 'button', 'data-sn-close': '', 'aria-label': 'Close', text: '✕' })
      ]),
      cloudState === 'local'
        ? h('p.sn-hint', { text: 'Showing the private notes on this device. Sign in to include shared threads.' }) : null,
      h('div.sn-filters', {}, [
        sel('state', 'Status', [['all', 'All'], ['open', 'Open'], ['resolved', 'Resolved']]),
        sel('sceneId', 'Scene', [['', 'All scenes'], ...fx.scenes.map((s) => [s.id, s.label])]),
        sel('author', 'Author', [['', 'Everyone'], ...fx.authors.map((a) => [a, a])]),
        sel('kind', 'Kind', [['', 'Shared and private'], ['shared', 'Shared'], ['private', 'Private']])
      ]),
      count, list,
      h('div.sn-foot', {}, [
        h('button.btn', { type: 'button', 'data-sn-export': 'txt', text: 'Download text' }),
        h('button.btn', { type: 'button', 'data-sn-export': 'csv', text: 'Download CSV' })
      ])
    ].filter(Boolean))
  ]);
  document.body.append(dlg);
  draw();

  dlg.addEventListener('change', (e) => {
    const s = e.target.closest('[data-sn]');
    if (!s) return;
    f[s.dataset.sn] = s.value;
    draw();
  });
  delegate(dlg, 'click', '[data-sn-close]', close);
  dlg.addEventListener('mousedown', (e) => { if (e.target === dlg) close(); });
  delegate(dlg, 'click', '[data-sn-go]', (e, b) => { const id = b.dataset.snGo; close(); opts.goTo && opts.goTo(id); });
  delegate(dlg, 'click', '[data-sn-export]', (e, b) => {
    const shown = Notes.filterNotes(all, f);
    const base = slug(opts.title) + '-notes';
    if (b.dataset.snExport === 'csv') download(base + '.csv', Notes.toCSV(shown), 'text/csv;charset=utf-8');
    else download(base + '.txt', Notes.toText(shown, opts.title || 'Script'), 'text/plain;charset=utf-8');
    opts.say && opts.say('Downloaded ' + shown.length + (shown.length === 1 ? ' note.' : ' notes.'));
  });
  holdFocus(dlg);
  (dlg.querySelector('select') || dlg).focus();
}

export default { openScriptNotes };
