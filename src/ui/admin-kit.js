/* ============================================================
   ADMIN KIT — the console's components, built once
   ------------------------------------------------------------
   Every admin tab draws from this file, so the console reads as one
   instrument rather than six panels. Styles live in
   src/styles/admin.css (scoped to .ad-console, plus .ad-drawer for the
   sheet, which sits on <body>). Nothing here draws a literal colour or
   a literal shape: tokens and --sk-* only.

   EXPORTS
     kpi({label,value,sub,href,delta,spark,attention})   a stat tile
     delta(n,{unit,goodWhen})                            a +/- chip
     pill(text,tone,{title,dot})        tone: ok warn danger neutral accent
     meter({value,max,label,tone,format})                a limit gauge
     checklist(items)       [{label,state:'pass'|'fail'|'wait'|'skip',note,href}]
     timeline(items)        [{at,title,sub,tone,target}]
     diff(before,after)                  before/after JSON, changed keys only
     emptyState({title,body,action,stamp,icon})
     errorState({title,why,onRetry})     says WHY, offers Retry
     skeleton({kind:'kpi'|'rows'|'block',count})
     dataTable({columns,rows,rowId,onActivate,caption,empty,toolbar})
     relTime(ts) / absTime(ts)           "3h ago" / the full date, for title=
     getDensity() / setDensity(d)        comfortable | compact, one preference
     registerDrawer(param, loader)       loader(id, ctx) -> {title,sub,body,actions}
     openDrawer({param,id,title,sub,body,actions})
     closeDrawer() / syncDrawerFromHash() / hashParts() / hashFor(tab,params)

   THE DRAWER IS HASH-LINKED: `admin.html#people?user=<id>`. The part
   after `?` is the drawer's; tabs.js reads only the part before it.
   Opening writes it with replaceState (no history entry, no scroll
   jump) and closing removes it. A tab registers what it can show with
   registerDrawer('user', loader); a deep link to a param nobody has
   registered is ignored rather than guessed at.

   HANDLERS. No inline handler anywhere: one delegated listener per
   event, installed once at import, finds its callback in a WeakMap
   keyed by the element. A page that re-renders `main` therefore loses
   nothing, because the callbacks go with the elements.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { holdFocus, releaseFocus } from './modal-focus.js';

const DENSITY_KEY = 'fms_admin_density_v1';
const isEl = (v) => v instanceof Node;
const arr = (v) => (v == null ? [] : [].concat(v));

/* ---- time -------------------------------------------------------- */

export function absTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
export function relTime(ts, now = Date.now()) {
  if (!ts) return '—';
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.round((now - t) / 1000);
  const f = s < 0 ? 'in ' : '';
  const a = Math.abs(s);
  const sfx = s < 0 ? '' : ' ago';
  if (a < 45) return s < 0 ? 'in a moment' : 'just now';
  if (a < 3600) return `${f}${Math.round(a / 60)}m${sfx}`;
  if (a < 86400) return `${f}${Math.round(a / 3600)}h${sfx}`;
  if (a < 86400 * 30) return `${f}${Math.round(a / 86400)}d${sfx}`;
  return new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' });
}
/** A relative time that carries its absolute time in title=. */
const when = (ts) => h('time.ad-when', { datetime: ts ? new Date(ts).toISOString() : null, title: absTime(ts), text: relTime(ts) });

/* ---- density: the one UI preference ------------------------------ */

let density = 'comfortable';
try { if (localStorage.getItem(DENSITY_KEY) === 'compact') density = 'compact'; } catch (e) { /* storage may throw */ }
export const getDensity = () => density;
export function setDensity(d) {
  density = d === 'compact' ? 'compact' : 'comfortable';
  try { localStorage.setItem(DENSITY_KEY, density); } catch (e) { /* private window: the toggle still works for this page */ }
  applyDensity();
}
function applyDensity() {
  document.querySelectorAll('.ad-console').forEach((el) => { el.dataset.density = density; });
  document.querySelectorAll('[data-ad-density]').forEach((b) => {
    b.textContent = density === 'compact' ? 'Compact' : 'Comfortable';
    b.setAttribute('aria-pressed', String(density === 'compact'));
  });
}
/** Stamp the preference on a console root as it is built. */
export const stampDensity = (el) => { el.dataset.density = density; return el; };

/* ---- the small things -------------------------------------------- */

export function pill(text, tone = 'neutral', { title, dot } = {}) {
  return h('span.ad-pill.is-' + tone, { title: title || null }, [
    dot ? h('span.ad-pill-dot', { 'aria-hidden': 'true' }) : null,
    isEl(text) ? text : String(text)
  ]);
}

export function delta(value, { unit = '%', goodWhen = 'up', label } = {}) {
  const v = Number(value);
  if (!Number.isFinite(v)) return h('span.ad-delta.is-flat', { text: '—' });
  const dir = v === 0 ? 'flat' : v > 0 ? 'up' : 'down';
  const good = dir === 'flat' ? 'flat' : (dir === goodWhen ? 'good' : 'bad');
  const arrow = dir === 'up' ? '▲' : dir === 'down' ? '▼' : '■';
  return h('span.ad-delta.is-' + good, { title: label || null }, [
    h('span.ad-delta-ar', { 'aria-hidden': 'true', text: arrow }),
    `${v > 0 ? '+' : ''}${Number.isInteger(v) ? v : v.toFixed(1)}${unit}`
  ]);
}

/** A stat tile. Built on .ad-stat, so every old block that draws one
 *  by hand looks the same. `spark` is any node (an admin-charts
 *  sparkline); `href` makes the tile a link. */
export function kpi({ label, value, sub, href, delta: d, spark, attention, title } = {}) {
  const tag = href ? 'a' : 'div';
  const el = h(tag + '.ad-stat.ad-kpi' + (attention ? '.is-attention' : ''), { href: href || null, title: title || null }, [
    h('span.ad-stat-n', { text: value == null ? '—' : String(value) }),
    h('span.ad-stat-l', { text: label }),
    d || sub ? h('span.ad-kpi-row', {}, [d ? (isEl(d) ? d : delta(d)) : null, sub ? h('span.ad-stat-sub', { text: sub }) : null]) : null,
    spark ? h('span.ad-kpi-spark', {}, [spark]) : null
  ]);
  return el;
}

const meterTone = (pct) => (pct >= 90 ? 'danger' : pct >= 70 ? 'warn' : 'ok');
/** A limit gauge: value over max, tone from how full it is unless given. */
export function meter({ value, max, label, tone, format } = {}) {
  const m = Number(max) > 0 ? Number(max) : 0;
  const v = Math.max(0, Number(value) || 0);
  const pct = m ? Math.min(100, Math.round((v / m) * 100)) : 0;
  const t = tone || meterTone(pct);
  const fmt = format || ((x) => String(x));
  const bar = h('span.ad-meter-bar', { 'aria-hidden': 'true' }, [h('span.ad-meter-fill.is-' + t)]);
  bar.firstChild.style.width = pct + '%';
  return h('div.ad-meter', { role: 'meter', 'aria-valuemin': 0, 'aria-valuemax': m || 0, 'aria-valuenow': v, 'aria-label': label || 'Usage' }, [
    label ? h('span.ad-meter-l', { text: label }) : null,
    bar,
    h('span.ad-meter-v', { text: m ? `${fmt(v)} of ${fmt(m)} · ${pct}%` : fmt(v) })
  ]);
}

const CHECK = {
  pass: { glyph: '✓', word: 'Passing' }, fail: { glyph: '✕', word: 'Failing' },
  wait: { glyph: '…', word: 'Checking' }, skip: { glyph: '–', word: 'Not checked' }
};
/** Ordered steps with a live state. State is a glyph AND a word, never colour alone. */
export function checklist(items = []) {
  const ol = h('ol.ad-check');
  for (const it of items) {
    const s = CHECK[it.state] || CHECK.skip;
    const label = it.href ? h('a.ad-check-l', { href: it.href, text: it.label }) : h('span.ad-check-l', { text: it.label });
    ol.append(h('li.ad-check-i.is-' + (it.state || 'skip'), {}, [
      h('span.ad-check-g', { 'aria-hidden': 'true', text: s.glyph }),
      h('span.visually-hidden', { text: s.word + ': ' }),
      label,
      it.note ? h('span.ad-check-n', { text: it.note }) : null
    ]));
  }
  return ol;
}

/** A reverse-chronological list. `target` is a link (href) or a node for the row's right edge. */
export function timeline(items = []) {
  const ul = h('ol.ad-tl');
  for (const it of items) {
    ul.append(h('li.ad-tl-i' + (it.tone ? '.is-' + it.tone : ''), {}, [
      h('span.ad-tl-dot', { 'aria-hidden': 'true' }),
      h('div.ad-tl-b', {}, [
        h('div.ad-tl-t', {}, [isEl(it.title) ? it.title : h('strong', { text: it.title || '' }), it.at ? when(it.at) : null]),
        it.sub ? (isEl(it.sub) ? it.sub : h('p.ad-tl-s', { text: it.sub })) : null,
        it.target ? (isEl(it.target) ? it.target : h('a.ad-tl-a', { href: it.target.href || it.target, text: it.target.label || 'Open' })) : null
      ])
    ]));
  }
  return ul;
}

const show = (v) => (v === undefined ? '' : typeof v === 'string' ? v : JSON.stringify(v, null, 2));
/** Before/after JSON: only the keys that changed, removed in one column, added in the other. */
export function diff(before, after) {
  const b = before && typeof before === 'object' ? before : {};
  const a = after && typeof after === 'object' ? after : {};
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
  if (!keys.length) return h('p.ad-meta', { text: 'No fields changed.' });
  const box = h('div.ad-diff', { role: 'table', 'aria-label': 'Changes' });
  box.append(h('div.ad-diff-h', { role: 'row' }, ['Field', 'Before', 'After'].map((t) => h('span', { role: 'columnheader', text: t }))));
  for (const k of keys) {
    box.append(h('div.ad-diff-r', { role: 'row' }, [
      h('code.ad-diff-k', { role: 'rowheader', text: k }),
      h('pre.ad-diff-b' + (k in b ? '' : '.is-none'), { role: 'cell', text: k in b ? show(b[k]) : '(absent)' }),
      h('pre.ad-diff-a' + (k in a ? '' : '.is-none'), { role: 'cell', text: k in a ? show(a[k]) : '(removed)' })
    ]));
  }
  return box;
}

/* ---- empty, error, loading --------------------------------------- */

const handlers = new WeakMap();

export function emptyState({ title, body, action, stamp, icon } = {}) {
  const act = action && (action.href
    ? h('a.btn', { href: action.href, text: action.label })
    : h('button.btn', { type: 'button', 'data-ad-act': 'run', text: action.label }));
  if (act && action.onClick) handlers.set(act, action.onClick);
  return h('div.ad-empty', {}, [
    h('span.ad-empty-ic', { 'aria-hidden': 'true', text: icon || '◇' }),
    h('p.ad-empty-h', { text: title || 'Nothing here' }),
    body ? h('p.ad-empty-b', { text: body }) : null,
    act,
    stamp ? h('p.ad-empty-s', {}, [stamp === true ? 'Checked ' : String(stamp) + ' ', when(Date.now())]) : null
  ]);
}

/** A panel that cannot load SAYS WHY and offers Retry — never an empty table that reads as all clear. */
export function errorState({ title, why, onRetry } = {}) {
  const retry = onRetry ? h('button.btn', { type: 'button', 'data-ad-act': 'run', text: 'RETRY' }) : null;
  if (retry) handlers.set(retry, onRetry);
  return h('div.ad-error', { role: 'alert' }, [
    h('p.ad-error-h', { text: title || 'This could not load' }),
    h('p.ad-error-b', { text: why || 'The server did not say why.' }),
    retry
  ]);
}

export function skeleton({ kind = 'rows', count } = {}) {
  const n = count || (kind === 'kpi' ? 4 : kind === 'block' ? 1 : 5);
  const root = h('div.ad-skel.is-' + kind, { 'aria-busy': 'true', 'aria-label': 'Loading' });
  for (let i = 0; i < n; i++) root.append(h('span.ad-skel-i'));
  return root;
}

/* ---- the data table ---------------------------------------------- */

/** columns: [{key,label,render(row)->node|string,align:'end',title(row),width}]
 *  rowId(row) names a row for the drawer; onActivate(row) makes rows
 *  focusable and opens on click / Enter / Space. */
export function dataTable({ columns = [], rows = [], rowId, onActivate, caption, empty, toolbar } = {}) {
  const box = h('div.ad-dt');
  const bar = h('div.ad-dt-bar', {}, [
    h('span.ad-meta', { text: caption || '' }),
    h('span.ad-dt-tools', {}, [
      ...arr(toolbar),
      h('button.ad-chip', { type: 'button', 'data-ad-density': '', 'aria-pressed': String(density === 'compact'), title: 'Row density', text: density === 'compact' ? 'Compact' : 'Comfortable' })
    ])
  ]);
  box.append(bar);
  if (!rows.length) {
    box.append(isEl(empty) ? empty : emptyState({ title: (empty && empty.title) || 'No rows', body: empty && empty.body }));
    return box;
  }
  const table = h('table.ad-table');
  table.append(h('thead', {}, [h('tr', {}, columns.map((c) => h('th', { scope: 'col', class: c.align === 'end' ? 'is-end' : null, text: c.label })))]));
  const tb = h('tbody');
  for (const row of rows) {
    const tr = h('tr', { 'data-row': rowId ? String(rowId(row)) : null, tabindex: onActivate ? '0' : null });
    if (onActivate) { tr.classList.add('is-active'); handlers.set(tr, () => onActivate(row)); }
    for (const c of columns) {
      const v = c.render ? c.render(row) : row[c.key];
      const text = isEl(v) ? '' : (v == null || v === '' ? '—' : String(v));
      const td = h('td', { class: c.align === 'end' ? 'is-end' : null, title: c.title ? c.title(row) : (text && text.length > 28 ? text : null) });
      if (isEl(v)) td.append(v); else td.textContent = text;
      tr.append(td);
    }
    tb.append(tr);
  }
  table.append(tb);
  box.append(h('div.ad-dt-scroll', {}, [table]));
  return box;
}

/* ---- the drawer -------------------------------------------------- */

const loaders = new Map();
let open = null;   // { el, scrim, key }

/** `#people?user=7` -> { tab: 'people', params: URLSearchParams } */
export function hashParts(hash = location.hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const i = raw.indexOf('?');
  return { tab: i < 0 ? raw : raw.slice(0, i), params: new URLSearchParams(i < 0 ? '' : raw.slice(i + 1)) };
}
export function hashFor(tab, params) {
  const q = params ? new URLSearchParams(params).toString() : '';
  return '#' + tab + (q ? '?' + q : '');
}
function writeHash(next) {
  try { history.replaceState(history.state, '', location.pathname + location.search + next); } catch (e) { /* ignore */ }
}

export function registerDrawer(param, loader) { loaders.set(param, loader); }

export function closeDrawer({ keepHash = false } = {}) {
  if (!open) return;
  const { el, scrim, key } = open;
  open = null;
  releaseFocus(el);
  el.classList.remove('is-open');
  scrim.classList.remove('is-open');
  const done = () => { el.remove(); scrim.remove(); };
  /* Reduced motion (and a tab that is not compositing) never plays the
     transition, so do not wait for transitionend that will not come. */
  setTimeout(done, 240);
  document.documentElement.classList.remove('ad-drawer-on');
  if (!keepHash) {
    const { tab, params } = hashParts();
    if (key) params.delete(key);
    for (const k of loaders.keys()) params.delete(k);
    writeHash(hashFor(tab, params));
  }
}

/** Open the sheet. `body` is a node (or a function returning one); `actions`
 *  are nodes for the sticky header. Returns the sheet element. */
export function openDrawer({ param, id, title, sub, body, actions } = {}) {
  if (open) closeDrawer({ keepHash: true });
  const label = 'ad-drawer-t-' + Math.random().toString(36).slice(2, 7);
  const el = h('aside.ad-drawer', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': label, tabindex: '-1' }, [
    h('header.ad-drawer-h', {}, [
      h('div.ad-drawer-t', {}, [h('h2', { id: label, text: title || '' }), sub ? (isEl(sub) ? sub : h('p.ad-meta', { text: sub })) : null]),
      h('div.ad-drawer-a', {}, [...arr(actions), h('button.btn.ad-drawer-x', { type: 'button', 'data-ad-act': 'close-drawer', 'aria-label': 'Close', text: 'CLOSE' })])
    ]),
    h('div.ad-drawer-b', {}, [typeof body === 'function' ? body() : body])
  ]);
  const scrim = h('div.ad-drawer-scrim', { 'data-ad-act': 'close-drawer' });
  document.body.append(scrim, el);
  document.documentElement.classList.add('ad-drawer-on');
  /* Next frame, so the closed state is painted first and the transition runs. */
  /* a timer, not rAF: rAF does not run in a tab that is not compositing */
  setTimeout(() => { el.classList.add('is-open'); scrim.classList.add('is-open'); }, 20);
  open = { el, scrim, key: param || '' };
  if (id != null) el.dataset.id = String(id);
  holdFocus(el);
  const first = el.querySelector('.ad-drawer-x');
  (first || el).focus({ preventScroll: true });
  if (param && id != null) {
    const { tab, params } = hashParts();
    params.set(param, String(id));
    writeHash(hashFor(tab, params));
  }
  return el;
}

/** Open whatever the hash names, if a loader is registered for it; close if it names nothing. */
export async function syncDrawerFromHash(ctx) {
  const { params } = hashParts();
  for (const [param, loader] of loaders) {
    const id = params.get(param);
    if (!id) continue;
    if (open && open.key === param && open.el.dataset.id === id) return;
    try {
      const spec = await loader(id, ctx);
      if (spec) openDrawer({ ...spec, param, id });
    } catch (e) {
      openDrawer({ param, id, title: 'Could not open this', body: errorState({ title: 'This could not load', why: (e && e.message) || 'The server did not say why.', onRetry: () => syncDrawerFromHash(ctx) }) });
    }
    return;
  }
  if (open) closeDrawer({ keepHash: true });
}

/* ---- one delegated listener per event, installed once ------------ */

if (typeof document !== 'undefined') {
  delegate(document, 'click', '[data-ad-act="run"]', (e, el) => { const fn = handlers.get(el); if (fn) fn(e); });
  delegate(document, 'click', '[data-ad-act="close-drawer"]', () => closeDrawer());
  delegate(document, 'click', '[data-ad-density]', () => setDensity(density === 'compact' ? 'comfortable' : 'compact'));
  /* A click on a row opens it, unless the click was on something
     inside it that does its own thing. */
  delegate(document, 'click', '.ad-table tr.is-active', (e, tr) => {
    if (e.target.closest('a, button, input, select, textarea, label, summary')) return;
    const fn = handlers.get(tr); if (fn) fn(e);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && open) { e.stopPropagation(); closeDrawer(); return; }
    const tr = e.target && e.target.closest && e.target.closest('.ad-table tr.is-active');
    if (!tr || e.target !== tr) return;
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const fn = handlers.get(tr); if (fn) fn(e); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const rows = [...tr.parentElement.children];
      const next = rows[rows.indexOf(tr) + (e.key === 'ArrowDown' ? 1 : -1)];
      if (next) next.focus();
    }
  });
  window.addEventListener('hashchange', () => { if (loaders.size) syncDrawerFromHash(); });
}

export default {
  kpi, delta, pill, meter, checklist, timeline, diff, emptyState, errorState, skeleton, dataTable,
  relTime, absTime, getDensity, setDensity, stampDensity, registerDrawer, openDrawer, closeDrawer,
  syncDrawerFromHash, hashParts, hashFor
};
