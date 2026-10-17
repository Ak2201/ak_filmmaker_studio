/* KIT · TABLE — dense, sticky header, optional sticky first column
   table({ columns, rows, stickyFirst, center, maxHeight, todayCol,
           caption, empty, label })
     columns  [{ key, label, num?, class?, render?(row) → node|string }]
     rows     arrays of plain objects; a cell is row[key], or render(row)
     num      right-aligned mono tabular figures
     todayCol the key of a column to tint (DAY 04 (TODAY))
     maxHeight a CSS length: the wrapper scrolls and the header sticks
     responsive 'stack' — below 720px every row becomes a card and every
              cell a "label · value" line; each cell carries its column's
              label as data-label (the head's own words, nothing new)
   Returns the scrolling wrapper; the <table> is its only child. */
import { h, cx, kids } from './util.js';

export function table(o = {}) {
  const cols = o.columns || [];
  const wrap = h('div.k-table-wrap');
  if (o.label) { wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', o.label); wrap.tabIndex = 0; }
  if (o.maxHeight) { wrap.dataset.maxH = ''; wrap.style.setProperty('--k-table-max-h', o.maxHeight); }
  const stack = o.responsive === 'stack';
  const t = h('table', { class: cx('k-table', o.stickyFirst && 'k-table--sticky-first', o.center && 'k-table--center', stack && 'k-table--stack', o.class) });
  if (o.caption) t.append(h('caption.visually-hidden', { text: o.caption }));
  const tr = h('tr');
  for (const c of cols) {
    tr.append(h('th', { scope: 'col', class: cx(c.num && 'k-num', c.key === o.todayCol && 'is-col-today', c.class), text: c.label || '' }));
  }
  t.append(kids(h('thead'), tr));
  const body = h('tbody');
  const rows = o.rows || [];
  if (!rows.length && o.empty) {
    body.append(kids(h('tr'), h('td', { colspan: String(cols.length || 1), class: 'k-table-empty', text: o.empty })));
  }
  for (const row of rows) {
    const r = h('tr');
    cols.forEach((c, i) => {
      const val = c.render ? c.render(row) : row[c.key];
      const cell = h(i === 0 && o.rowHeaders !== false ? 'th' : 'td', { class: cx(c.num && 'k-num k-mono', c.key === o.todayCol && 'is-col-today', c.cellClass) });
      if (i === 0 && o.rowHeaders !== false) cell.setAttribute('scope', 'row');
      if (stack && c.label) cell.dataset.label = c.label;
      kids(cell, val == null ? '' : val);
      r.append(cell);
    });
    body.append(r);
  }
  t.append(body);
  wrap.append(t);
  return wrap;
}
