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

  function draw() {
    const d = deriveBeats(getElements ? getElements() : [], currentId, {
      targetPages: getTargetPages ? getTargetPages() : 0
    });
    toggle.textContent = '';
    toggle.append(h('span.bp-title', { text: 'Beats' }), h('span.bp-fw', { text: d.fw.name || d.fw.label || '' }),
      h('span.bp-caret', { 'aria-hidden': 'true', text: isOpen ? '▾' : '▸' }));
    toggle.setAttribute('aria-expanded', String(isOpen));
    root.classList.toggle('is-open', isOpen);
    body.hidden = !isOpen;
    body.textContent = '';
    const ol = h('ol.bp-list');
    d.rows.forEach((r) => {
      const btn = h('button.bp-beat', {
        type: 'button',
        'aria-current': r.current ? 'true' : null,
        dataset: { beat: r.beat.id }
      }, [
        h('span.bp-name', { text: r.beat.label || r.beat.id }),
        r.marks ? h('span.bp-marks', { text: String(r.marks), title: r.marks + ' marked in the Story' }) : null,
        h('span.bp-page', { text: '~p.' + r.page })
      ].filter(Boolean));
      btn.addEventListener('click', () => {
        if (r.targetId && scrollToEl) scrollToEl(r.targetId);
        hint.textContent = r.written ? '' : (r.targetId
          ? 'Not written yet. Around page ' + r.page + '. Taking you to the end.'
          : 'Nothing written yet. This beat sits around page ' + r.page + '.');
        if (onJump) onJump({ beat: r.beat, page: r.page, id: r.targetId, written: r.written });
      });
      ol.append(h('li', { class: r.current ? 'is-current' : '' }, [btn]));
    });
    body.append(ol);
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
