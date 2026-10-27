/* ============================================================
   WRITE — the revision tools: compare, revised pages, locked numbers
   ------------------------------------------------------------
   Three panels under the Revisions list on write.html, and the clicks
   behind them. Kept out of src/pages/write.js, which owns the document
   editor; write.js calls `renderRevisionTools()` from renderRevisions()
   and hands this module its doc, its save and its render once, through
   `mountRevisionTools()`.

     COMPARE        two revisions, or a revision and the script now, as
                    a diff by element grouped by scene, with the words
                    that changed inside a changed line marked. The diff
                    is src/lib/script-diff.js, loaded at the click.
     REVISED PAGES  a PDF of the script with an asterisk in the right
                    margin beside every line changed since a chosen
                    revision, and each page that holds one headed with
                    the revision colour's name — optionally tinted that
                    colour. The marks are src/lib/screenplay-export.js's.
     SCENE NUMBERS  lock / unlock. Stored as `numbering` inside the
                    script blob (src/lib/script.js); the Breakdown's rows
                    follow through src/lib/scene-sync.js.

   NOTHING HERE WRITES ON A RENDER. The compare result and the PDF
   choices live in this module's memory for the session — they are a
   way of looking, not a record — and the only writes are the lock and
   the unlock, each at a click, each through the page's own save.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { button } from './kit/index.js';
import '../styles/write-revisions.css';
import StudioUI from './chrome.js';
import Scenes from '../lib/scenes.js';
import { applyNumbers } from '../lib/scene-sync.js';
import {
  revisionColour, sceneNumbers, lockNumbering, isNumberingLocked, typeLabel
} from '../lib/script.js';
import { askDanger } from './dialog.js';

const differ = () => import('../lib/script-diff.js');

let ctx = { getDoc: () => null, persistNow: () => {}, render: () => {}, exportPDF: () => {} };

/* Session state: what is being compared, and how revised pages print. */
const LIVE = 'live';
let cmpFrom = '';          // a revision id
let cmpTo = LIVE;          // a revision id, or LIVE
let marksSince = '';       // a revision id, '' = the latest
let marksTint = false;
let lastResult = null;     // { from, to, groups, stats } for the panel's re-render

const say = (m, type = 'info') => { try { StudioUI.toast(m, { type }); } catch (e) { /* no chrome yet */ } };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

function revLabel(doc, id) {
  if (id === LIVE) return 'The script now';
  const i = doc.revisions.findIndex((r) => r.id === id);
  if (i < 0) return '';
  return revisionColour(i).name + ' — ' + doc.revisions[i].name;
}
function revElements(doc, id) {
  if (id === LIVE) return doc.elements;
  const r = doc.revisions.find((x) => x.id === id);
  return r ? r.elements : null;
}
const validRev = (doc, id) => doc.revisions.some((r) => r.id === id);

/* ============================================================
   RENDER — reads, never writes
   ============================================================ */
export function renderRevisionTools() {
  const doc = ctx.getDoc();
  if (!doc) return null;
  const wrap = h('div.wr-revtools');
  if (doc.revisions.length) {
    wrap.append(renderCompare(doc), renderRevisedPages(doc));
  }
  wrap.append(renderNumbering(doc));
  return wrap;
}

function revOptions(doc, selected, withLive) {
  const opts = doc.revisions.map((r, i) => h('option', {
    value: r.id, text: revisionColour(i).name + ' — ' + r.name, selected: r.id === selected
  }));
  if (withLive) opts.push(h('option', { value: LIVE, text: 'The script now', selected: selected === LIVE }));
  return opts;
}

function renderCompare(doc) {
  if (!validRev(doc, cmpFrom)) cmpFrom = doc.revisions[doc.revisions.length - 1].id;
  if (cmpTo !== LIVE && !validRev(doc, cmpTo)) cmpTo = LIVE;
  const box = h('section.wr-cmp', { 'aria-labelledby': 'wr-cmp-h' });
  box.append(
    h('h3.wr-tool-h', { id: 'wr-cmp-h', text: 'Compare' }),
    h('p.wr-tool-sub', {
      text: 'What changed between two drafts, scene by scene: lines added, cut and rewritten, '
          + 'with the rewritten words marked inside the line.'
    }),
    h('div.wr-tool-row', {}, [
      h('label.wr-field', {}, [h('span', { text: 'From' }),
        h('select#wr-cmp-from', { 'data-rt': 'cmp-from' }, revOptions(doc, cmpFrom, false))]),
      h('label.wr-field', {}, [h('span', { text: 'To' }),
        h('select#wr-cmp-to', { 'data-rt': 'cmp-to' }, revOptions(doc, cmpTo, true))]),
      button({ label: 'Compare', variant: 'primary', action: 'rev-compare' })
    ]),
    h('div.wr-cmp-out', { id: 'wr-cmp-out', 'aria-live': 'polite' },
      lastResult && lastResult.from === cmpFrom && lastResult.to === cmpTo ? resultNodes(doc, lastResult) : [])
  );
  return box;
}

function renderRevisedPages(doc) {
  if (marksSince && !validRev(doc, marksSince)) marksSince = '';
  const since = marksSince || doc.revisions[doc.revisions.length - 1].id;
  const box = h('section.wr-marks', { 'aria-labelledby': 'wr-marks-h' });
  box.append(
    h('h3.wr-tool-h', { id: 'wr-marks-h', text: 'Revised pages' }),
    h('p.wr-tool-sub', {
      text: 'A PDF with an asterisk in the right margin beside every line changed since the '
          + 'revision you pick, and each page that carries one headed with this issue’s colour — '
          + 'so a crew holding the old pages can swap in only the new ones.'
    }),
    h('div.wr-tool-row', {}, [
      h('label.wr-field', {}, [h('span', { text: 'Mark changes since' }),
        h('select#wr-marks-since', { 'data-rt': 'marks-since' }, revOptions(doc, since, false))]),
      h('label.wr-check', {}, [
        h('input#wr-marks-tint', { type: 'checkbox', 'data-rt': 'marks-tint', checked: marksTint }),
        h('span', { text: 'Tint revised pages in the colour' })
      ]),
      button({ label: 'Save revised PDF', action: 'export-pdf-revised' })
    ])
  );
  return box;
}

function renderNumbering(doc) {
  const box = h('section.wr-lock', { 'aria-labelledby': 'wr-lock-h' });
  box.append(h('h3.wr-tool-h', { id: 'wr-lock-h', text: 'Scene numbers' }));
  const heads = doc.elements.filter((e) => e && e.type === 'scene' && String(e.text || '').trim()).length;
  if (!isNumberingLocked(doc.numbering)) {
    box.append(
      h('p.wr-tool-sub', {
        text: 'Numbered by position: the twelfth heading is scene 12. Lock them when the script '
            + 'goes to the floor — after that a scene inserted after 12 is 12A, a cut scene stays '
            + 'in the pages as OMITTED, and no call sheet ends up pointing at the wrong scene.'
      }),
      h('div.wr-tool-row', {}, [
        button({ label: 'Lock scene numbers', action: 'numbers-lock', disabled: heads === 0 })
      ])
    );
    return box;
  }
  const res = sceneNumbers(doc.elements, doc.numbering);
  const lettered = [...res.byId.values()].filter((n) => /[A-Z]/i.test(n)).length;
  const stamp = String(doc.numbering.at || '').slice(0, 10);
  const facts = [plural(res.byId.size, 'scene'), plural(lettered, 'lettered insert'),
    plural(res.omitted.length, 'omitted', 'omitted')];
  /* Filtered: Element.append(null) inserts the text "null" (CLAUDE.md). */
  box.append(...[
    h('p.wr-lock-state', {}, [
      h('strong', { text: 'Locked' + (stamp ? ' since ' + stamp : '') + '. ' }),
      h('span', { text: facts.join(' · ') })
    ]),
    res.omitted.length
      ? h('p.wr-tool-sub', { text: 'Omitted: ' + res.omitted.map((o) => o.number).join(', ')
          + '. Each prints where its scene was, as “OMITTED”.' })
      : null,
    h('p.wr-tool-sub', {
      text: 'The Breakdown, the stripboard and the call sheets carry these numbers. Unlocking '
          + 'renumbers every scene by position.'
    }),
    h('div.wr-tool-row', {}, [
      button({ label: 'Unlock and renumber…', action: 'numbers-unlock' })
    ]),
    renderPagesLock(doc)
  ].filter(Boolean));
  return box;
}

/* Locked PAGES, inside a scene lock (screenplay-export.js "LOCKED PAGES").
   The labels are computed where the pages are, so this module only
   records the lock and reads the summary back; the typesetter is a lazy
   chunk and is loaded at the press. */
let TS = null;
const typeset = async () => (TS || (TS = await import('../lib/screenplay-export.js')));
function renderPagesLock(doc) {
  const box = h('div.wr-pages-lock');
  box.append(h('h4.wr-tool-h', { text: 'Page numbers' }));
  const lock = doc.numbering && doc.numbering.pages && doc.numbering.pages.locked ? doc.numbering.pages : null;
  if (!lock) {
    box.append(
      h('p.wr-tool-sub', {
        text: 'Lock the pages too once they are handed out. After that, a page that grows spills '
            + 'into 12A, 12B rather than pushing every later page on, and a page whose lines are '
            + 'all cut is folded into the one before it as 12-13, so a crew swaps in only the pages that changed.'
      }),
      h('div.wr-tool-row', {}, [button({ label: 'Lock page numbers', action: 'pages-lock' })])
    );
    return box;
  }
  const summary = h('p.wr-lock-state', {}, [
    h('strong', { text: 'Pages locked' + (lock.at ? ' since ' + String(lock.at).slice(0, 10) : '') + '. ' }),
    h('span', { 'data-pages-summary': '', text: plural(lock.starts.length, 'page') + ' when locked.' })
  ]);
  box.append(summary, h('div.wr-tool-row', {}, [
    button({ label: 'Unlock page numbers…', action: 'pages-unlock' })
  ]));
  /* The A-pages and folded pages as they stand now, filled in once the
     typesetter has loaded. */
  typeset().then((T) => {
    const labels = T.pageNumbersDoc(doc);
    const a = labels.filter((l) => /[A-Z]/.test(l)).length;
    const folded = labels.filter((l) => l.includes('-')).length;
    const node = summary.querySelector('[data-pages-summary]');
    if (node) node.textContent = plural(lock.starts.length, 'page') + ' when locked · ' + plural(a, 'A-page') + ' · ' + plural(folded, 'folded page');
  }).catch(() => { /* the summary keeps its first line */ });
  return box;
}

/* ---- the compare result ------------------------------------- */
const OP_WORD = { added: 'Added', removed: 'Cut', changed: 'Changed', moved: 'Moved' };
const OP_MARK = { added: '+', removed: '−', changed: '~', moved: '↕' };
const MAX_GROUPS = 80;

function lineNode(o) {
  const el = o.b || o.a;
  const li = h('li.wr-cmp-line.is-' + o.op);
  li.append(
    h('span.wr-cmp-mark', { 'aria-hidden': 'true', text: OP_MARK[o.op] || '' }),
    h('span.visually-hidden', { text: (OP_WORD[o.op] || '') + ': ' }),
    h('span.wr-cmp-type', {
      text: o.typeChanged ? typeLabel(o.a.type) + ' → ' + typeLabel(o.b.type) : typeLabel(el.type)
    })
  );
  const text = h('span.wr-cmp-text');
  if (o.words && o.words.length) {
    for (const w of o.words) {
      if (w.op === 'same') text.append(w.text);
      else text.append(h(w.op === 'add' ? 'ins' : 'del', { text: w.text }));
    }
  } else {
    text.textContent = String(el.text || '') || '(blank)';
  }
  li.append(text);
  return li;
}

function resultNodes(doc, res) {
  const out = [];
  const { stats, groups } = res;
  const changes = stats.changed + stats.added + stats.removed + stats.moved;
  if (!changes) {
    const to = res.to === LIVE ? 'the script now' : res.toLabel;
    out.push(h('p.wr-cmp-sum', { text: res.fromLabel + ' and ' + to + ' say the same thing, line for line.' }));
    return out;
  }
  out.push(h('p.wr-cmp-sum', {}, [
    h('strong', { text: res.fromLabel + ' → ' + res.toLabel + ': ' }),
    h('span', {
      text: [plural(groups.length, 'scene') + ' touched', plural(stats.changed, 'line') + ' changed',
        stats.added + ' added', stats.removed + ' cut', stats.moved + ' moved'].join(' · ')
    })
  ]));
  for (const g of groups.slice(0, MAX_GROUPS)) {
    const sec = h('section.wr-cmp-scene');
    const no = g.headingId && res.numbers ? res.numbers.get(g.headingId) : '';
    const head = h('h4.wr-cmp-head', {}, [
      no ? h('span.wr-cmp-no', { text: no }) : null,
      h('span', { text: g.heading || 'Before the first scene' }),
      g.headingOp === 'added' ? h('span.wr-cmp-tag', { text: 'new scene' }) : null,
      g.headingOp === 'removed' ? h('span.wr-cmp-tag', { text: 'cut scene' }) : null
    ]);
    const ul = h('ul.wr-cmp-lines');
    for (const o of g.ops) if (o.op !== 'same') ul.append(lineNode(o));
    sec.append(head, ul);
    out.push(sec);
  }
  if (groups.length > MAX_GROUPS) {
    out.push(h('p.wr-tool-sub', { text: 'And ' + plural(groups.length - MAX_GROUPS, 'more scene') + ' with changes.' }));
  }
  return out;
}

/* ============================================================
   EVENTS
   ============================================================ */
function wire() {
  delegate(document, 'change', '[data-rt="cmp-from"]', (e, sel) => { cmpFrom = sel.value; });
  delegate(document, 'change', '[data-rt="cmp-to"]', (e, sel) => { cmpTo = sel.value; });
  delegate(document, 'change', '[data-rt="marks-since"]', (e, sel) => { marksSince = sel.value; });
  delegate(document, 'change', '[data-rt="marks-tint"]', (e, box) => { marksTint = !!box.checked; });

  delegate(document, 'click', '[data-action="rev-compare"]', async () => {
    const doc = ctx.getDoc();
    if (!doc) return;
    const A = revElements(doc, cmpFrom), B = revElements(doc, cmpTo);
    if (!A || !B) return;
    if (cmpFrom === cmpTo) { say('Pick two different drafts to compare.'); return; }
    let D;
    try { D = await differ(); } catch (e) { say('The comparison could not be loaded. Check the connection and try again.', 'error'); return; }
    const diff = D.diffElements(A, B);
    // The newer side's numbers: the live script's own (locked or not),
    // or a revision's positions.
    const numbers = cmpTo === LIVE
      ? sceneNumbers(doc.elements, doc.numbering).byId
      : sceneNumbers(B, null).byId;
    lastResult = {
      from: cmpFrom, to: cmpTo, stats: diff.stats, groups: D.groupByScene(diff), numbers,
      fromLabel: revLabel(doc, cmpFrom), toLabel: revLabel(doc, cmpTo)
    };
    const out = document.getElementById('wr-cmp-out');
    if (out) out.replaceChildren(...resultNodes(doc, lastResult));
  });

  delegate(document, 'click', '[data-action="export-pdf-revised"]', async () => {
    const doc = ctx.getDoc();
    if (!doc || !doc.revisions.length) return;
    if (!doc.elements.length) { say('Nothing to export yet — write a line first.'); return; }
    const sinceId = marksSince && validRev(doc, marksSince) ? marksSince : doc.revisions[doc.revisions.length - 1].id;
    const since = doc.revisions.findIndex((r) => r.id === sinceId);
    let D;
    try { D = await differ(); } catch (e) { say('The revision marks could not be loaded. Check the connection and try again.', 'error'); return; }
    const diff = D.diffElements(doc.revisions[since].elements, doc.elements);
    const ids = D.revisedIds(diff);
    if (!ids.size) {
      say('Nothing has changed since ' + revLabel(doc, sinceId) + ', so there is nothing to mark.');
      return;
    }
    /* Which colour these pages are. If the script is exactly the latest
       snapshot, that snapshot IS this issue; otherwise this is the
       issue after it, not yet snapshotted. */
    const latest = doc.revisions.length - 1;
    const issued = D.isUnchanged(D.diffElements(doc.revisions[latest].elements, doc.elements));
    const colour = revisionColour(issued ? latest : latest + 1);
    ctx.exportPDF({
      marks: { ids, label: colour.name + ' Revision', swatch: colour.swatch, tint: marksTint },
      note: plural(ids.size, 'revised line') + ' since ' + revisionColour(since).name
    });
  });

  delegate(document, 'click', '[data-action="numbers-lock"]', () => {
    const doc = ctx.getDoc();
    if (!doc || isNumberingLocked(doc.numbering)) return;
    /* An imported shooting script's numbers live on the Breakdown's rows
       (the importer never puts them in the element text). When every
       heading's row carries one, they are what is locked. */
    const preset = new Map();
    try {
      for (const s of Scenes.listScenes()) if (s.scriptElId && s.number) preset.set(s.scriptElId, String(s.number));
    } catch (e) { /* no scenes */ }
    doc.numbering = lockNumbering(doc.elements, preset);
    ctx.persistNow();
    let moved = 0;
    try { moved = applyNumbers(doc.elements, doc.numbering); } catch (e) { console.warn('[write] numbers', e); }
    ctx.render('[data-action="numbers-unlock"]');
    const n = Object.keys(doc.numbering.ids).length;
    say('Scene numbers locked: ' + plural(n, 'scene') + '.'
      + (moved ? ' ' + plural(moved, 'Breakdown row') + ' renumbered to match.' : ''), 'success');
  });

  delegate(document, 'click', '[data-action="pages-lock"]', async () => {
    const doc = ctx.getDoc();
    if (!doc || !isNumberingLocked(doc.numbering) || (doc.numbering.pages && doc.numbering.pages.locked)) return;
    let T;
    try { T = await typeset(); } catch (e) { say('The page typesetter could not be loaded. Check the connection and try again.'); return; }
    doc.numbering.pages = T.lockPages(doc);
    ctx.persistNow();
    ctx.render('[data-action="pages-unlock"]');
    say('Page numbers locked: ' + plural(doc.numbering.pages.starts.length, 'page') + '.', 'success');
  });

  delegate(document, 'click', '[data-action="pages-unlock"]', async () => {
    const doc = ctx.getDoc();
    if (!doc || !doc.numbering || !doc.numbering.pages) return;
    const ok = await askDanger('Unlock the page numbers?\n\n'
      + 'The pages are numbered by position again: A-pages become whole numbers and folded pages split '
      + 'out. Scene numbers stay locked.\n\nPages already handed out will no longer match. Cancel keeps them locked.');
    if (!ok) return;
    delete doc.numbering.pages;
    ctx.persistNow();
    ctx.render('[data-action="pages-lock"]');
    say('Page numbers unlocked.', 'success');
  });

  delegate(document, 'click', '[data-action="numbers-unlock"]', async () => {
    const doc = ctx.getDoc();
    if (!doc || !isNumberingLocked(doc.numbering)) return;
    const res = sceneNumbers(doc.elements, doc.numbering);
    const ok = await askDanger('Unlock the scene numbers?\n\n'
      + 'Every scene is renumbered by its position, 1 to ' + res.byId.size + ' — lettered inserts '
      + 'like 12A become whole numbers'
      + (res.omitted.length ? ', and the ' + plural(res.omitted.length, 'OMITTED placeholder') + ' go' : '')
      + '. The Breakdown, the stripboard and the call sheets follow.'
      + (doc.numbering.pages ? ' The page numbers are unlocked with them.' : '') + '\n\n'
      + 'Pages already handed out will no longer match. Cancel keeps the numbers locked.');
    if (!ok) return;
    delete doc.numbering;
    ctx.persistNow();
    let moved = 0;
    try { moved = applyNumbers(doc.elements, null); } catch (e) { console.warn('[write] numbers', e); }
    ctx.render('[data-action="numbers-lock"]');
    say('Scene numbers unlocked and renumbered by position.'
      + (moved ? ' ' + plural(moved, 'Breakdown row') + ' renumbered.' : ''), 'success');
  });
}

/** The scene-number lock on its own, for drafts.html#numbering (the
    stripboard's "Manage numbering" lands there). The lock and unlock
    handlers are the ones mountRevisionTools() wires. */
export function renderNumberingTool() {
  const doc = ctx.getDoc && ctx.getDoc();
  return doc ? renderNumbering(doc) : null;
}

/** Once, from write.js. */
export function mountRevisionTools(opts = {}) {
  ctx = { ...ctx, ...opts };
  wire();
}

/** The Compare panel on its own, for the Drafts page (src/pages/drafts.js).
    Null until there is a draft to compare. */
export function renderCompareTool() {
  const doc = ctx.getDoc();
  return doc && doc.revisions.length ? renderCompare(doc) : null;
}
/** The Revised pages panel on its own, for the Drafts page, where
    write.html#revisions lands now (QA: the export was only on the
    retired write.html). Null until there is a draft to mark against. */
export function renderRevisedPagesTool() {
  const doc = ctx.getDoc();
  return doc && doc.revisions.length ? renderRevisedPages(doc) : null;
}
/** Preselect the two sides (a draft id, or 'live') and forget the last result. */
export function presetCompare(from, to = LIVE) {
  cmpFrom = from; cmpTo = to; lastResult = null;
}

export default { mountRevisionTools, renderRevisionTools, renderCompareTool, renderRevisedPagesTool, presetCompare };
