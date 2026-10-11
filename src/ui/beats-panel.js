/* ============================================================
   THE BEATS PANEL — src/ui/beats-panel.js
   ------------------------------------------------------------
   The story's beats beside the script: the Story stage's framework
   (src/lib/story.js — marks and outline steps give each beat a count)
   with each beat's target page, the beat being written highlighted,
   and a click that jumps there. The beat data is beat-guide's: the
   same framework JSON, the same page estimate (elementLines /
   LINES_PER_PAGE, a beat's `at` × the script's pages). It stores
   nothing — no storage writes, ever.

   mountBeats(host, { getElements, scrollToEl, onJump, getTargetPages })
     getElements()    -> the script's elements ([{id,type,text,…}])
     scrollToEl(id)   -> scroll that element into view (editor.scrollToEl)
     onJump(info)     -> optional; { beat, page, id, written }
     getTargetPages() -> optional; the length the script is meant to
                         reach. Without it the beats are spread over
                         what is written, as beat-guide does.
   Returns { refresh(), setCurrent(id), open(), close(), destroy() }.
   ============================================================ */
import { h } from '../lib/dom.js';
import { loadStory, frameworkById, matrix } from '../lib/story.js';
import { elementLines, LINES_PER_PAGE } from '../lib/script.js';
import '../styles/beats-panel.css';

const PHONE = '(max-width: 719.98px)';

/** Pure: the rows the panel draws and where each one jumps. */
export function deriveBeats(els, currentId, { story, targetPages } = {}) {
  const list = els || [];
  const st = story || loadStory();
  const fw = frameworkById(st.framework);
  let total = 0;
  const startLine = [];
  for (const e of list) { startLine.push(total); total += elementLines(e); }
  const written = total / LINES_PER_PAGE;
  const span = Math.max(targetPages || 0, written, 1);
  const pageOf = (at) => Math.max(1, Math.round(at * span) || 1);

  let idx = currentId ? list.findIndex((e) => e.id === currentId) : -1;
  const curPage = idx >= 0 ? Math.floor(startLine[idx] / LINES_PER_PAGE) + 1 : 0;

  let counts = new Map();
  try { counts = new Map(matrix(st, fw.id).map((r) => [r.beat.id, r.marks.length])); } catch (e) { /* none */ }

  const beats = [...fw.beats].sort((a, b) => a.at - b.at);
  const rows = beats.map((b) => ({ beat: b, page: pageOf(b.at), marks: counts.get(b.id) || 0 }));
  // The beat being written: the last one whose target page has begun.
  let cur = -1;
  if (curPage) rows.forEach((r, i) => { if (r.page <= curPage) cur = i; });
  // Before the first beat's page, you are writing toward the first beat.
  if (curPage && cur < 0 && rows.length) cur = 0;
  rows.forEach((r, i) => { r.current = i === cur; });

  // First scene at/after the target page; failing that, the end.
  const scenes = list.map((e, i) => ({ e, p: Math.floor(startLine[i] / LINES_PER_PAGE) + 1 }))
    .filter((x) => x.e.type === 'scene' && String(x.e.text || '').trim());
  for (const r of rows) {
    r.written = r.page <= Math.ceil(written);
    const hit = r.written ? scenes.find((s) => s.p >= r.page) : null;
    r.targetId = hit ? hit.e.id : (list.length ? list[list.length - 1].id : null);
    if (!hit) r.written = false;
  }
  return { fw, rows, curPage, written, span };
}

export function mountBeats(host, opts = {}) {
  const { getElements, scrollToEl, onJump, getTargetPages } = opts;
  const mq = typeof matchMedia === 'function' ? matchMedia(PHONE) : null;
  let currentId = null;
  let isOpen = !(mq && mq.matches);
  let raf = 0;

  const root = h('aside.bp', { 'aria-label': 'Story beats' });
  const toggle = h('button.bp-toggle', { type: 'button', 'aria-controls': 'bp-body' });
  const body = h('div.bp-body#bp-body');
  const hint = h('p.bp-hint', { role: 'status', 'aria-live': 'polite' });
  root.append(toggle, body, hint);
  host.append(root);

  /* Rebuilding the list on every keystroke reset its scroll to the
     top — the panel "jumped" while you read further down it. Now the
     rows are rebuilt only when the beats themselves change; a new
     current line only moves the highlight, and the list's own scroll
     position is kept either way. */
  let lastSig = '';
  let rowsNow = [];
  /* The list's own scroll box: the body in a drawer, the page's
     pinned column on a wide screen. Never the document. */
  function scroller() {
    for (let el = body; el && el !== document.body && el !== document.documentElement; el = el.parentElement) {
      const o = getComputedStyle(el).overflowY;
      if ((o === 'auto' || o === 'scroll') && el.scrollHeight > el.clientHeight + 1) return el;
    }
    return null;
  }
  function paintCurrent() {
    body.querySelectorAll('li').forEach((li, i) => {
      const r = rowsNow[i];
      const on = !!(r && r.current);
      if (li.classList.contains('is-current') !== on) li.classList.toggle('is-current', on);
      const b = li.firstElementChild;
      if (b) { if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current'); }
    });
    // Keep the current beat in view INSIDE the list; never scroll the page.
    const cur = body.querySelector('li.is-current');
    const sc = cur && isOpen ? scroller() : null;
    if (sc) {
      const box = sc.getBoundingClientRect();
      const r = cur.getBoundingClientRect();
      if (r.top < box.top || r.bottom > box.bottom) sc.scrollTop += r.top - box.top - box.height / 3;
    }
  }
  function draw() {
    const d = deriveBeats(getElements ? getElements() : [], currentId, {
      targetPages: getTargetPages ? getTargetPages() : 0
    });
    rowsNow = d.rows;
    toggle.textContent = '';
    toggle.append(h('span.bp-title', { text: 'Beats' }), h('span.bp-fw', { text: d.fw.name || d.fw.label || '' }),
      h('span.bp-caret', { 'aria-hidden': 'true', text: isOpen ? '▾' : '▸' }));
    toggle.setAttribute('aria-expanded', String(isOpen));
    root.classList.toggle('is-open', isOpen);
    body.hidden = !isOpen;
    const sig = d.fw.id + '|' + d.rows.map((r) => r.beat.id + ':' + r.page + ':' + r.marks + ':' + r.written + ':' + r.targetId).join(',');
    if (sig === lastSig) { paintCurrent(); return; }
    lastSig = sig;
    const sc0 = scroller();
    const keep = sc0 ? sc0.scrollTop : 0;
    body.textContent = '';
    const ol = h('ol.bp-list');
    d.rows.forEach((r, i) => {
      const btn = h('button.bp-beat', {
        type: 'button',
        dataset: { beat: r.beat.id }
      }, [
        h('span.bp-name', { text: r.beat.label || r.beat.id }),
        r.marks ? h('span.bp-marks', { text: String(r.marks), title: r.marks + ' marked in the Story' }) : null,
        h('span.bp-page', { text: '~p.' + r.page })
      ].filter(Boolean));
      btn.addEventListener('click', () => {
        const row = rowsNow[i] || r;
        if (row.targetId && scrollToEl) scrollToEl(row.targetId);
        hint.textContent = row.written ? '' : (row.targetId
          ? 'Not written yet. Around page ' + row.page + '. Taking you to the end.'
          : 'Nothing written yet. This beat sits around page ' + row.page + '.');
        if (onJump) onJump({ beat: row.beat, page: row.page, id: row.targetId, written: row.written });
      });
      ol.append(h('li', {}, [btn]));
    });
    body.append(ol);
    if (sc0) sc0.scrollTop = keep;
    paintCurrent();
  }

  const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };
  toggle.addEventListener('click', () => { isOpen = !isOpen; draw(); });

  const ac = new AbortController();
  const rowId = (t) => (t && t.closest ? (t.closest('[data-el]') || {}).dataset?.el : null);
  document.addEventListener('focusin', (e) => {
    if (!e.target.matches || !e.target.matches('.wr-text')) return;
    const id = rowId(e.target);
    if (id && id !== currentId) { currentId = id; redraw(); }
  }, { signal: ac.signal });
  document.addEventListener('input', (e) => {
    if (e.target && e.target.matches && e.target.matches('.wr-text')) redraw();
  }, { signal: ac.signal });
  if (mq && mq.addEventListener) {
    mq.addEventListener('change', (e) => { isOpen = !e.matches; draw(); }, { signal: ac.signal });
  }

  draw();
  return {
    refresh: draw,
    setCurrent(id) { currentId = id; draw(); },
    open() { isOpen = true; draw(); },
    close() { isOpen = false; draw(); },
    destroy() { ac.abort(); if (raf) cancelAnimationFrame(raf); root.remove(); }
  };
}

export default { mountBeats, deriveBeats };
