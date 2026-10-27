/* ============================================================
   THE BUDGET'S OTHER TABS — petty cash, cost report, crew
   payments, top sheet, wage table, export
   ------------------------------------------------------------
   The estimator (src/ui/budget.js) is the plan. Everything here is
   a VIEW of src/lib/costs.js plus the estimator's own blob, the
   contacts and the schedule; it stores nothing of its own, and
   every total on screen is recomputed from the rows on every
   render. A total typed into the DOM and read back would be the
   second representation the trap list keeps paying for.

   RENDERING. Each section is rebuilt whole after a change — the
   rows are few and the derivations cheap — and focus is put back
   on the control the person was in (every control carries a
   `data-fk`), so a rebuild after a `change` does not throw a
   keyboard user to the top of the page. Fields commit on `change`
   rather than `input`, so nothing is rebuilt under a typing finger.

   NOTHING WRITES ON LOAD. Rendering only reads; verify's idle-write
   check and the estimator's own "loading must never write" lesson
   both apply here.

   PRINT. The settlement sheet and the top sheet are built into one
   `#cxPrint` element outside #app, `body.cx-printing` hides the rest
   (budget.css), and the element is removed after printing — so the
   page's words and keys are the same whether or not anybody printed.

   THE LOOK is the kit (src/ui/kit/): stat cards, panels, kit fields
   around the native controls (the `name`s FormData reads and the
   `data-fk`s focus returns to are unchanged), kit tables with mono
   tabular figures, badges, notices, empty states. The `cx-*` classes
   stay on everything as the page's own names.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import Store from '../lib/store.js';
// Money is formatted and parsed in the budget's own currency (budget-costs-model.js).
import C from '../lib/costs.js';
import { DEPARTMENTS } from '../lib/contacts.js';
import { rs, rupees, glance, amountOf, sym, shownCurrency, pct, today, label, costContext, crewAccountFor, wageHintRows } from '../lib/budget-costs-model.js';
import wages from '../data/wages.fefsi.json';
import { askDanger } from './dialog.js';
import { button, badge, statCard, statStrip, emptyState, notice, meter } from './kit/index.js';
import { renderSchedule, renderVersions, impactActions, impactForms, bindImpact } from './budget-impact.js';
import { mountBudgetPrivacy, isBudgetLocked, lockedNote } from './budget-privacy-ui.js';

/* rs, pct, today and label are src/lib/budget-costs-model.js's. */

/* Remembered for the life of the page only, so the second expense of
   the day is two taps: who paid and how are usually the same as the
   last one. Deliberately not stored — a preference written on every
   expense would be a write nobody asked for. */
const sticky = { paidBy: '', method: 'cash', shootDay: '', date: '' };
const openCrew = new Set();

/* ---- context: everything a render reads, read once ------------
   costContext() in src/lib/budget-costs-model.js. */
const context = costContext;

/* ---- small builders --------------------------------------------- */
const stat = (value, text) => statCard({ label: text, value });
const stats = (items) => statStrip(items, { class: 'cx-stats' });

/** A native control in the kit's frame. The control is untouched:
    its name, data-fk and value are what the forms and focus read. */
function frame(control) {
  if (control.tagName === 'SELECT') return h('div.k-control.k-select', {}, [control]);
  control.classList.add('k-input');
  const mono = control.getAttribute('inputmode') === 'decimal' || control.type === 'date';
  return h('div.k-control' + (mono ? '.k-control--mono' : ''), {}, [control]);
}
function field(text, control, hint) {
  return h('label.cx-field.k-field', {}, [
    h('span.cx-flabel.k-field-label', { text }),
    frame(control),
    hint ? h('span.cx-hint.k-field-hint', { text: hint }) : null
  ]);
}
function select(attrs, options, value) {
  const el = h('select', attrs, options.map(([v, t]) => h('option', { value: v, text: t })));
  el.value = value === undefined || value === null ? '' : String(value);
  return el;
}
/* Native radios (FormData reads `category` and `method`) drawn as the
   kit's segmented control — the radio variant appended to kit.css. */
function chips(name, options, value, fk) {
  return h('div.cx-chips.k-seg.k-seg--radio.k-seg--wrap', { role: 'radiogroup' }, options.map((o) =>
    h('label.cx-chip.k-seg-btn', {}, [
      h('input', { type: 'radio', name, value: o.id, checked: o.id === value ? true : null, 'data-fk': fk + ':' + o.id }),
      h('span', { text: o.label })
    ])));
}
const lineOptions = (ctx, none = 'Not on a budget line') =>
  [['', none], ...ctx.lines.map((l) => [l.id, l.name + ' · ' + rs(l.estimate)])];
const dayOptions = (ctx) =>
  [['', 'Not a shoot day'], ...ctx.days.map((d) => [String(d.day), 'Day ' + d.day + (d.date ? ' · ' + d.date : '')])];
const personOptions = (ctx, none) =>
  [['', none], ...ctx.contacts.map((c) => [c.id, (c.name || 'Unnamed') + (c.role ? ' — ' + c.role : '')])];

/** A kit panel: header (title + optional meta) over a body. `spec` is
    the element and its own classes ('form.cx-quick'). */
function card(spec, attrs, title, children, meta) {
  const el = h(spec, attrs);
  el.classList.add('cx-card', 'k-panel');
  if (title) {
    el.append(h('div.k-panel-head', {}, [
      h('h3.cx-h3.k-panel-title', { text: title }),
      meta ? h('div.k-panel-meta', {}, [].concat(meta)) : null
    ]));
  }
  el.append(h('div.k-panel-body.cx-card-body', {}, children));
  return el;
}
/** A kit table inside its scrolling wrapper. */
const scroll = (table) => h('div.cx-scroll.k-table-wrap', { tabindex: '0', role: 'region', 'aria-label': (table.querySelector('caption') || {}).textContent + ' (scrolls sideways)' }, [table]);
const numTd = (text, extra) => h('td.num.k-num.k-mono', Object.assign({ text }, extra || {}));
const numTh = (text) => h('th.num.k-num', { scope: 'col', text });
/** The row delete: an icon-only ghost button with its spoken name. */
function delBtn(kind, id, aria, fk) {
  return button({ label: aria, icon: 'close', iconOnly: true, size: 'sm', variant: 'ghost', class: 'cx-del', attrs: { 'data-cx': kind, 'data-id': id, 'data-fk': fk } });
}

function emptyNote(text, href, cta) {
  return emptyState({
    class: 'cx-empty',
    icon: 'inbox',
    body: text,
    actions: href ? [button({ label: cta, href, size: 'sm', icon: 'arrow_forward' })] : null
  });
}
function intro(title, deck, extra) {
  return h('div.cx-intro', {}, [h('h2.cx-h2', { text: title }), h('p.cx-deck', { text: deck }), extra || null]);
}

/* ============================================================
   1. PETTY CASH + THE DAILY EXPENSE LOG
   ============================================================ */
function renderExpenses(ctx) {
  const fb = C.floatBalances(ctx.floats, ctx.expenses, ctx.nameOf);
  const out = [];
  out.push(intro('Petty cash', (shownCurrency() === 'USD' ? 'Every dollar' : 'Every rupee') + ' that leaves a pocket on the shoot, logged the day it goes. Issue floats to whoever carries cash, log what they spend, and the balance in each hand is worked out for you.'));
  out.push(stats([
    stat(rs(fb.issued), 'floats issued'),
    stat(rs(fb.spent), 'spent from floats'),
    ...(fb.office ? [stat(rs(fb.office), 'paid by the office, no float')] : []),
    stat(rs(fb.inHand), 'cash in hand'),
    stat(rs(fb.owedBack), 'owed back to people'),
    stat(String(ctx.expenses.length), ctx.expenses.length === 1 ? 'entry' : 'entries')
  ]));

  /* QUICK ADD — tuned for a phone on set: the amount first and large,
     the category as one tap, who and how remembered from last time,
     everything a vendor bill needs folded away until it is needed. */
  const form = card('form.cx-quick', { 'data-cx-form': 'expense', 'aria-label': 'Add an expense' }, 'Log an expense', [
    h('div.cx-quick-row', {}, [
      field('Amount (' + sym() + ', bill total)', h('input.cx-amount', { name: 'amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 1,850 or 2k', required: true, 'data-fk': 'x:amount' })),
      field('Date', h('input', { name: 'date', type: 'date', value: sticky.date || today(), 'data-fk': 'x:date' }))
    ]),
    h('fieldset.cx-set', {}, [h('legend.cx-flabel.k-field-label', { text: 'Category' }), chips('category', C.categoriesFor(shownCurrency()), 'food', 'x:cat')]),
    h('div.cx-quick-row', {}, [
      field('Paid by', select({ name: 'paidBy', 'data-fk': 'x:paidBy' }, personOptions(ctx, 'Office / producer — no float'), sticky.paidBy)),
      field('Shoot day', select({ name: 'shootDay', 'data-fk': 'x:day' }, dayOptions(ctx), sticky.shootDay))
    ]),
    h('fieldset.cx-set', {}, [h('legend.cx-flabel.k-field-label', { text: 'Paid with' }), chips('method', C.methodsFor(shownCurrency()).slice(0, 3), sticky.method, 'x:method')]),
    field('Budget line', select({ name: 'line', 'data-fk': 'x:line' }, lineOptions(ctx), '')),
    h('details.cx-more', {}, [
      h('summary', { text: shownCurrency() === 'USD' ? 'Bill details — tax, vendor, receipt' : 'Bill details — GST, vendor, receipt' }),
      h('div.cx-quick-row', {}, [
        field(shownCurrency() === 'USD' ? 'Tax in the bill' : 'GST in the bill', select({ name: 'gstPct', 'data-fk': 'x:gst' }, C.GST_RATES.map((r) => [String(r), r ? r + '%' : 'No GST']), '0')),
        field('Vendor', h('input', { name: 'vendor', type: 'text', autocomplete: 'off', 'data-fk': 'x:vendor' }))
      ]),
      h('div.cx-quick-row', {}, [
        shownCurrency() === 'USD' ? null : field('Vendor GSTIN', h('input', { name: 'gstin', type: 'text', autocomplete: 'off', maxlength: '15', placeholder: '15 characters', 'data-fk': 'x:gstin' })),
        field('Receipt link', h('input', { name: 'receipt', type: 'url', autocomplete: 'off', placeholder: 'https://… (a photo in your Drive)', 'data-fk': 'x:receipt' }))
      ]),
      field('Paid by someone not in contacts', h('input', { name: 'paidByName', type: 'text', autocomplete: 'off', placeholder: 'a name — used instead of the list above', 'data-fk': 'x:paidByName' })),
      field('Note', h('input', { name: 'note', type: 'text', autocomplete: 'off', 'data-fk': 'x:note' }))
    ]),
    h('div.cx-actions', {}, [button({ label: 'Add expense', icon: 'add', variant: 'primary', size: 'lg', type: 'submit', class: 'cx-submit', attrs: { 'data-fk': 'x:submit' } })])
  ]);

  /* FLOATS */
  const floatForm = card('form.cx-floats', { 'data-cx-form': 'float', 'aria-label': 'Issue a float' }, 'Floats — cash issued to a person', [
    h('div.cx-quick-row', {}, [
      field('To', select({ name: 'to', 'data-fk': 'f:to' }, personOptions(ctx, 'Pick a person…'), '')),
      field('Amount (' + sym() + ')', h('input', { name: 'amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', required: true, 'data-fk': 'f:amount' }))
    ]),
    h('div.cx-quick-row', {}, [
      field('Date', h('input', { name: 'date', type: 'date', value: today(), 'data-fk': 'f:date' })),
      field('Method', select({ name: 'method', 'data-fk': 'f:method' }, C.methodsFor(shownCurrency()).map((m) => [m.id, m.label]), 'cash'))
    ]),
    field('Or a name not in contacts', h('input', { name: 'toName', type: 'text', autocomplete: 'off', 'data-fk': 'f:toName' })),
    h('div.cx-actions', {}, [button({ label: 'Issue float', icon: 'add', type: 'submit', attrs: { 'data-fk': 'f:submit' } })])
  ], badge({ label: rs(fb.inHand) + ' in hand', tag: true }));
  out.push(h('div.cx-forms', {}, [form, floatForm]));

  if (fb.people.length) {
    const t = h('table.cx-table.k-table', {}, [
      h('caption', { text: 'Balance by person' }),
      h('thead', {}, h('tr', {}, [h('th', { scope: 'col', text: 'Person' }), numTh('Issued'), numTh('Spent'), numTh('Balance')]))
    ]);
    const tb = h('tbody');
    for (const p of fb.people) {
      tb.append(h('tr', { class: p.balance < 0 ? 'is-owed' : null }, [
        h('th', { scope: 'row', text: p.name }),
        numTd(rs(p.issued)),
        numTd(rs(p.spent)),
        numTd(p.balance < 0 ? rs(-p.balance) + ' owed back' : rs(p.balance))
      ]));
    }
    t.append(tb);
    out.push(scroll(t));
  }
  if (ctx.floats.length) {
    out.push(h('details.cx-more.cx-float-log', {}, [
      h('summary', { text: ctx.floats.length + (ctx.floats.length === 1 ? ' float issued' : ' floats issued') }),
      h('ul.cx-log', {}, ctx.floats.slice().reverse().map((f) => h('li.cx-log-row', {}, [
        h('span.cx-log-amt.k-mono', { text: rs(f.amount) }),
        h('span.cx-log-what', { text: 'to ' + ctx.nameOf(f.to) + (f.date ? ' · ' + f.date : '') + ' · ' + label(C.methodsFor(shownCurrency()), f.method) }),
        delBtn('del-float', f.id, 'Delete the ' + rs(f.amount) + ' float to ' + ctx.nameOf(f.to), 'fl:' + f.id)
      ])))
    ]));
  }

  /* THE LOG — newest day first, a total per day. */
  out.push(h('h3.cx-h3.cx-section-h', { text: 'Expense log' }));
  if (!ctx.expenses.length) {
    out.push(emptyNote('Nothing logged yet. The first expense you add above appears here, under its date.'));
    return out;
  }
  const byDate = new Map();
  for (const e of ctx.expenses) {
    const k = e.date || '';
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k).push(e);
  }
  const dates = [...byDate.keys()].sort((a, b) => (b || '').localeCompare(a || ''));
  for (const d of dates) {
    const rows = byDate.get(d);
    const total = rows.reduce((s, e) => s + e.amount, 0);
    out.push(h('div.cx-day.k-panel', {}, [
      h('div.cx-day-head.k-panel-head', {}, [h('span.k-mono', { text: d || 'No date' }), h('span.cx-day-total.k-mono', { text: rs(total) })]),
      h('ul.cx-log', {}, rows.slice().reverse().map((e) => {
        const g = C.gstSplit(e.amount, e.gstPct);
        const bits = [label(C.categoriesFor(shownCurrency()), e.category)];
        if (e.line) bits.push(ctx.lineName(e.line));
        if (e.shootDay) bits.push('Day ' + e.shootDay);
        bits.push((e.paidBy ? ctx.nameOf(e.paidBy) : 'Office') + ' · ' + label(C.methodsFor(shownCurrency()), e.method));
        if (e.gstPct) bits.push('GST ' + e.gstPct + '% ' + rs(g.tax));
        if (e.vendor) bits.push(e.vendor + (e.gstin ? ' (' + e.gstin + ')' : ''));
        return h('li.cx-log-row', {}, [
          h('span.cx-log-amt.k-mono', { text: rs(e.amount) }),
          h('span.cx-log-what', {}, [
            bits.join(' · '),
            e.note ? h('span.cx-log-note', { text: e.note }) : null,
            /^https?:\/\//i.test(e.receipt) ? h('a.cx-receipt', { href: e.receipt, target: '_blank', rel: 'noopener noreferrer', text: 'receipt' }) : null
          ]),
          delBtn('del-expense', e.id, 'Delete this expense of ' + rs(e.amount), 'xl:' + e.id)
        ]);
      }))
    ]));
  }
  return out;
}

/* ============================================================
   2. THE COST REPORT — budget against actuals
   ============================================================ */
function renderActuals(ctx) {
  const r = ctx.report, t = r.totals;
  const out = [intro('Cost report', 'The estimate against what has actually gone out — expenses on each line plus crew payments — with the variance and how much of each line is used. Worked out fresh every time; nothing here is stored.')];
  out.push(card('div.cx-cont', {}, null, [
    field('Contingency (% of the estimate)', h('input', {
      type: 'text', inputmode: 'decimal', value: String(t.contingencyPct), 'data-cx-field': 'contingency', 'data-fk': 'r:cont', autocomplete: 'off'
    }), 'Usually 10%. It is added on top of the estimate; spending past the estimate eats into it.')
  ]));
  const usd = shownCurrency() === 'USD';
  out.push(stats([
    stat(rs(t.estimate), 'estimate'),
    stat(rs(t.contingency), 'contingency ' + t.contingencyPct + '%'),
    stat(rs(t.actual), usd ? 'actual, with tax' : 'actual, with GST'),
    stat(rs(t.actualNet), usd ? 'actual, without tax' : 'actual, without GST'),
    statCard({ label: t.variance < 0 ? 'over budget' : 'left', value: rs(Math.abs(t.variance)), class: t.variance < 0 ? 'cx-stat-over' : null }),
    stat(pct(t.pctUsed, t.actual), 'used')
  ]));
  if (!ctx.lines.length && !t.actual) {
    out.push(emptyNote('Nothing to report yet. Price some lines in the estimate, then log what you spend — this compares the two.', '#estimate', 'Go to the estimate'));
    return out;
  }
  if (r.over.length) {
    out.push(notice({
      tone: 'danger',
      class: 'cx-alert',
      title: r.over.length + (r.over.length === 1 ? ' line is over budget' : ' lines are over budget'),
      body: h('ul', {}, r.over.map((l) => h('li', { text: (l.unbudgeted ? label(C.deptsFor(shownCurrency()), l.dept) + ': ' : '') + l.name + ' — ' + rs(l.actual) + ' against ' + rs(l.estimate) + (l.unbudgeted ? ' (no line in the estimate)' : '') })))
    }));
  }
  const table = h('table.cx-table.k-table.cx-report', {}, [
    h('caption', { text: 'By department and line' }),
    h('thead', {}, h('tr', {}, [
      h('th', { scope: 'col', text: 'Line' }), h('th', { scope: 'col', text: 'Department' }),
      ...['Estimate', 'Actual', usd ? 'Excl. tax' : 'Excl. GST', 'Variance', 'Used'].map(numTh)
    ]))
  ]);
  const deptOpts = C.deptsFor(shownCurrency()).map((d) => [d.id, d.acct + ' ' + d.label]);
  for (const d of r.depts) {
    const tb = h('tbody.cx-dept');
    tb.append(h('tr.cx-dept-row', {}, [
      h('th', { scope: 'rowgroup', colspan: '2' }, [h('span.k-mono.cx-acct', { text: d.acct }), ' · ' + label(C.deptsFor(shownCurrency()), d.id)]),
      numTd(rs(d.estimate)), numTd(rs(d.actual)), numTd(rs(d.actualNet)),
      numTd(rs(d.variance), { class: d.over ? 'is-over' : null }), numTd(pct(d.pctUsed, d.actual))
    ]));
    for (const l of d.lines) {
      const used = l.pctUsed === null ? 100 : Math.min(100, l.pctUsed);
      tb.append(h('tr', { class: l.over ? 'is-over' : null }, [
        h('th', { scope: 'row' }, [l.name, l.over ? badge({ label: 'OVER', tone: 'danger', class: 'cx-flag' }) : null]),
        h('td', {}, l.unbudgeted ? h('span.cx-hint', { text: 'not in the estimate' })
          : frame(select({ 'data-cx-field': 'line-dept', 'data-id': l.id, 'data-fk': 'ld:' + l.id, 'aria-label': 'Department for ' + l.name }, deptOpts, l.dept))),
        numTd(rs(l.estimate)), numTd(rs(l.actual)), numTd(rs(l.actualNet)),
        numTd(rs(l.variance), { class: l.over ? 'is-over' : null }),
        h('td.num.k-num.k-mono', {}, [pct(l.pctUsed, l.actual), meter({ value: used, max: 100, show: false, tone: l.over ? 'danger' : null, class: 'cx-bar', attrs: { 'aria-hidden': 'true' } })])
      ]));
    }
    table.append(tb);
  }
  table.append(h('tfoot', {}, [
    h('tr', {}, [h('th', { scope: 'row', colspan: '2', text: 'Contingency ' + t.contingencyPct + '%' }), numTd(rs(t.contingency)), h('td', { colspan: '4' })]),
    h('tr.cx-total', {}, [
      h('th', { scope: 'row', colspan: '2', text: 'Total' }),
      numTd(rs(t.estimateWithContingency)), numTd(rs(t.actual)), numTd(rs(t.actualNet)),
      numTd(rs(t.variance), { class: t.variance < 0 ? 'is-over' : null }), numTd(pct(t.pctUsed, t.actual))
    ])
  ]));
  out.push(scroll(table));
  out.push(h('p.cx-hint.cx-taxnote', {
    text: shownCurrency() === 'USD'
      ? 'Tax paid on bills: ' + rs(t.gst) + '. Withheld on crew payments: ' + rs(t.tds)
        + ' — counted in the actual because it is part of the fee. An expense is logged as the bill total, tax included; the tax share is worked out from its rate.'
      : 'GST paid on bills: ' + rs(t.gst) + '. TDS withheld on crew payments: ' + rs(t.tds)
      + ' — owed to the income-tax department, and counted in the actual because it is part of the fee. '
      + 'An expense is logged as the bill total, tax included; the GST share is worked out from its rate.'
  }));
  return out;
}

/* ============================================================
   3. CREW PAYMENTS + THE ADVANCES LEDGER
   ============================================================ */
/* crewAccountFor() and wageHintRows() are src/lib/budget-costs-model.js's. */

function renderCrewCard(ctx, c) {
  const { rec, paid, derived, acct } = crewAccountFor(ctx, c);
  const id = c.id;
  const hints = wageHintRows(ctx, c.department);
  const picked = C.wageRows(wages, ctx.overrides).find((r) => r.id === rec.wageRow);
  /* In a dollar budget the published FEFSI figure is still rupees: it is
     shown as rupees and never offered as the fee. Only the person's own
     figure (typed in the budget's currency) is. */
  const usd = shownCurrency() === 'USD';
  const own = !!(picked && picked.overridden.includes('bata'));
  let hintText = '';
  if (picked) {
    hintText = picked.bata
      ? (own ? 'Your figure for ' + picked.craft + ': ' + rs(picked.bata) + '/day.'
        : picked.craft + ': ' + rupees(picked.bata) + '/day — reported for the 2022 MoU, EXPIRED. Confirm with your union.'
          + (usd ? ' A Chennai rupee figure, not offered as a dollar fee.' : ''))
      : 'No published figure for ' + picked.craft + '. Set your own on the wage table tab.';
  }
  const daysHint = acct.daysSource === 'entered'
    ? (derived.days ? 'You set this. The ' + derived.source + ' say ' + derived.days + '.' : 'You set this.')
    : derived.days ? 'From the ' + derived.source + '. Type a number to override.' : 'Nothing to count from yet — type the days.';
  const body = h('div.cx-crew-body', {}, [
    h('div.cx-quick-row', {}, [
      field('Fee basis', select({ 'data-cx-field': 'crew', 'data-k': 'feeType', 'data-id': id, 'data-fk': 'cr:' + id + ':ft' }, [['day', 'Per day'], ['lump', 'Lump sum']], rec.feeType)),
      field(rec.feeType === 'lump' ? 'Agreed fee (' + sym() + ', lump)' : 'Agreed fee (' + sym() + ' per day)', h('input', {
        type: 'text', inputmode: 'decimal', autocomplete: 'off', value: rec.fee ? String(rec.fee) : '', placeholder: '0',
        'data-cx-field': 'crew', 'data-k': 'fee', 'data-id': id, 'data-fk': 'cr:' + id + ':fee'
      }))
    ]),
    h('div.cx-quick-row', {}, [
      field('Wage-table hint', select({ 'data-cx-field': 'crew', 'data-k': 'wageRow', 'data-id': id, 'data-fk': 'cr:' + id + ':wr' },
        [['', 'None'], ...hints.map((r) => [r.id, r.craft])], rec.wageRow), hintText || (usd ? 'Optional. Your own figure from the wage table tab; no US crew rate is offered.' : 'Optional. A starting point only — there is no current union floor.')),
      picked && picked.bata && rec.feeType === 'day' && (own || !usd)
        ? h('div.cx-field.cx-usefee', {}, [button({ label: 'Use ' + rs(picked.bata) + ' as the fee', size: 'sm', attrs: { 'data-cx': 'use-wage', 'data-id': id, 'data-v': String(picked.bata), 'data-fk': 'cr:' + id + ':use' } })])
        : null
    ]),
    h('div.cx-quick-row', {}, [
      field('Days worked', h('input', {
        type: 'text', inputmode: 'decimal', autocomplete: 'off', value: rec.days === '' ? '' : String(rec.days),
        placeholder: derived.days ? String(derived.days) : '0', disabled: rec.feeType === 'lump' ? true : null,
        'data-cx-field': 'crew', 'data-k': 'days', 'data-id': id, 'data-fk': 'cr:' + id + ':days'
      }), rec.feeType === 'lump' ? 'A lump sum does not count days.' : daysHint),
      field('TDS deducted', select({ 'data-cx-field': 'crew', 'data-k': 'tdsPct', 'data-id': id, 'data-fk': 'cr:' + id + ':tds' },
        C.TDS_RATES.map((r) => [String(r), r ? r + '%' : 'None']), String(rec.tdsPct)), '194J professional fees are usually 10%; 194C contracts 1–2%. Check with your accountant.')
    ]),
    field('Budget line it is paid from', select({ 'data-cx-field': 'crew', 'data-k': 'line', 'data-id': id, 'data-fk': 'cr:' + id + ':line' }, lineOptions(ctx, 'Not on a budget line'), rec.line)),
    h('dl.cx-sum', {}, [
      ['Gross fee', rs(acct.gross)], ['TDS ' + acct.tdsPct + '%', rs(acct.tds)], ['Net payable', rs(acct.net)],
      ['Paid so far', rs(acct.paid)], [acct.balance < 0 ? 'Overpaid' : 'Balance due', rs(Math.abs(acct.balance))]
    ].map(([k, v]) => h('div', {}, [h('dt', { text: k }), h('dd.k-mono', { text: v })]))),
    h('h4.cx-h4', { text: 'Advances and payments' }),
    paid.length ? h('ul.cx-log', {}, paid.map((p) => h('li.cx-log-row', {}, [
      h('span.cx-log-amt.k-mono', { text: rs(p.amount) }),
      h('span.cx-log-what', { text: (p.date || 'No date') + ' · ' + label(C.methodsFor(shownCurrency()), p.method) + (p.note ? ' · ' + p.note : '') }),
      delBtn('del-payment', p.id, 'Delete this payment of ' + rs(p.amount), 'pl:' + p.id)
    ]))) : h('p.cx-hint', { text: 'Nothing paid yet.' }),
    h('form.cx-pay', { 'data-cx-form': 'payment', 'data-id': id, 'aria-label': 'Record a payment to ' + (c.name || 'this person') }, [
      h('div.cx-quick-row', {}, [
        field('Amount paid (' + sym() + ', after TDS)', h('input', { name: 'amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', required: true, 'data-fk': 'pf:' + id + ':amt' })),
        field('Date', h('input', { name: 'date', type: 'date', value: today(), 'data-fk': 'pf:' + id + ':date' }))
      ]),
      h('div.cx-quick-row', {}, [
        field('Method', select({ name: 'method', 'data-fk': 'pf:' + id + ':m' }, C.methodsFor(shownCurrency()).map((m) => [m.id, m.label]), 'bank')),
        field('Note', h('input', { name: 'note', type: 'text', autocomplete: 'off', placeholder: 'advance, final settlement…', 'data-fk': 'pf:' + id + ':note' }))
      ]),
      h('div.cx-actions', {}, [
        button({ label: 'Record payment', icon: 'add', variant: 'primary', type: 'submit', attrs: { 'data-fk': 'pf:' + id + ':go' } }),
        button({ label: 'Print settlement', icon: 'print', attrs: { 'data-cx': 'print-settlement', 'data-id': id, 'data-fk': 'pf:' + id + ':print' } })
      ])
    ])
  ]);
  const dueText = acct.gross ? (acct.balance < 0 ? 'overpaid ' + rs(-acct.balance) : acct.balance ? rs(acct.balance) + ' due' : 'settled') : 'no fee set';
  const dueTone = !acct.gross ? null : acct.balance > 0 ? 'warn' : acct.balance < 0 ? 'danger' : 'ok';
  const d = h('details.cx-crew.k-panel', { 'data-id': id, open: openCrew.has(id) ? true : null }, [
    h('summary.cx-crew-sum', {}, [
      h('span.cx-crew-name', { text: c.name || 'Unnamed contact' }),
      h('span.cx-crew-role', { text: [c.role, c.department].filter(Boolean).join(' · ') }),
      badge({ label: dueText, tone: dueTone, dot: !!dueTone, class: 'cx-crew-due' + (acct.balance > 0 ? ' is-due' : '') })
    ]),
    body
  ]);
  return d;
}

function renderCrew(ctx) {
  const out = [intro('Crew payments', 'What each person was promised, what they have had, and what is still owed. Days come from the day out of days for the cast and from the call sheets for everyone else, unless you type them.')];
  if (!ctx.contacts.length) {
    out.push(emptyNote('No contacts yet. Add the unit on the Cast & Crew page and each person gets a ledger here.', 'contacts.html#contacts', 'Go to Cast & Crew'));
    return out;
  }
  let gross = 0, paid = 0, due = 0, tds = 0;
  for (const c of ctx.contacts) {
    const { acct } = crewAccountFor(ctx, c);
    gross += acct.gross; paid += acct.paid; due += Math.max(0, acct.balance); tds += acct.tds;
  }
  out.push(stats([
    stat(rs(gross), 'fees agreed'), stat(rs(paid), 'paid'), stat(rs(due), 'still due'), stat(rs(tds), 'TDS to deposit')
  ]));
  const order = [...DEPARTMENTS, ...new Set(ctx.contacts.map((c) => c.department).filter((d) => !DEPARTMENTS.includes(d)))];
  for (const dept of order) {
    const people = ctx.contacts.filter((c) => (c.department || '') === dept);
    if (!people.length) continue;
    out.push(h('div.cx-crew-dept', {}, [
      h('h3.cx-dept-name', {}, [h('span', { text: dept }), h('span.cx-dept-count.k-mono', { text: String(people.length) })]),
      ...people.map((c) => renderCrewCard(ctx, c))
    ]));
  }
  return out;
}

/* The settlement sheet: one person, one page, signed at the bottom. */
function settlementDoc(ctx, id) {
  const c = ctx.byId.get(id);
  if (!c) return null;
  const { paid, acct } = crewAccountFor(ctx, c);
  const proj = (Store.currentProject && Store.currentProject()) || null;
  return h('article.cx-doc', {}, [
    h('p.cx-doc-eyebrow', { text: (proj && proj.title ? proj.title + ' · ' : '') + 'Crew settlement' }),
    h('h2.cx-doc-title', { text: c.name || 'Unnamed contact' }),
    h('p.cx-doc-sub', { text: [c.role, c.department, c.phone].filter(Boolean).join(' · ') }),
    h('table.cx-table', {}, [
      h('tbody', {}, [
        ['Fee', acct.feeType === 'lump' ? rs(acct.fee) + ' lump sum' : rs(acct.fee) + ' per day × ' + acct.days + ' day' + (acct.days === 1 ? '' : 's') + (acct.daysSource && acct.daysSource !== 'entered' ? ' (from the ' + acct.daysSource + ')' : '')],
        ['Gross', rs(acct.gross)], ['TDS deducted (' + acct.tdsPct + '%)', rs(acct.tds)], ['Net payable', rs(acct.net)]
      ].map(([k, v]) => h('tr', {}, [h('th', { scope: 'row', text: k }), h('td.num', { text: v })])))
    ]),
    h('table.cx-table', {}, [
      h('caption', { text: 'Paid' }),
      h('thead', {}, h('tr', {}, ['Date', 'Method', 'Note', 'Amount'].map((x, i) => h('th', { scope: 'col', class: i === 3 ? 'num' : null, text: x })))),
      h('tbody', {}, paid.length ? paid.map((p) => h('tr', {}, [h('td', { text: p.date || '—' }), h('td', { text: label(C.methodsFor(shownCurrency()), p.method) }), h('td', { text: p.note }), h('td.num', { text: rs(p.amount) })]))
        : [h('tr', {}, [h('td', { colspan: '4', text: 'Nothing paid yet.' })])]),
      h('tfoot', {}, [
        h('tr', {}, [h('th', { scope: 'row', colspan: '3', text: 'Total paid' }), h('td.num', { text: rs(acct.paid) })]),
        h('tr.cx-total', {}, [h('th', { scope: 'row', colspan: '3', text: acct.balance < 0 ? 'Overpaid' : 'Balance due' }), h('td.num', { text: rs(Math.abs(acct.balance)) })])
      ])
    ]),
    h('div.cx-sign', {}, [
      h('p', { text: 'Received the above in full settlement.' }),
      h('div.cx-sign-row', {}, [h('span', { text: 'Signature' }), h('span', { text: 'Date' }), h('span', { text: 'For the production' })])
    ])
  ]);
}

/* ============================================================
   5. THE TOP SHEET
   ------------------------------------------------------------
   One document, two homes: on screen inside a kit panel (`screen`
   true, kit table classes) and on paper in #cxPrint (plain classes,
   print.css / budget.css's print block).
   ============================================================ */
function topSheetDoc(ctx, screen) {
  const ts = C.topSheet(ctx.report);
  const proj = (Store.currentProject && Store.currentProject()) || null;
  const num = (text) => h(screen ? 'td.num.k-num.k-mono' : 'td.num', { text });
  const table = h('table.cx-table.cx-top' + (screen ? '.k-table' : ''), {}, [
    h('thead', {}, h('tr', {}, ['Acct', 'Department', 'Estimate'].map((x, i) => h('th', { scope: 'col', class: i === 2 ? (screen ? 'num k-num' : 'num') : null, text: x }))))
  ]);
  for (const g of ts.groups) {
    if (!g.depts.length) continue;
    const tb = h('tbody', {}, [h('tr.cx-dept-row', {}, [h('th', { scope: 'rowgroup', colspan: '3', text: g.label })])]);
    for (const d of g.depts) tb.append(h('tr', {}, [h('td' + (screen ? '.k-mono' : ''), { text: d.acct }), h('th', { scope: 'row', text: label(C.deptsFor(shownCurrency()), d.id) }), num(rs(d.estimate))]));
    tb.append(h('tr.cx-sub', {}, [h('td'), h('th', { scope: 'row', text: 'Total ' + g.label.toLowerCase() }), num(rs(g.estimate))]));
    table.append(tb);
  }
  table.append(h('tfoot', {}, [
    h('tr', {}, [h('td'), h('th', { scope: 'row', text: 'Above the line' }), num(rs(ts.atl) + ' · ' + ts.atlShare + '%')]),
    h('tr', {}, [h('td'), h('th', { scope: 'row', text: 'Below the line' }), num(rs(ts.btl) + ' · ' + (ts.subtotal ? 100 - ts.atlShare : 0) + '%')]),
    h('tr', {}, [h('td'), h('th', { scope: 'row', text: 'Subtotal' }), num(rs(ts.subtotal))]),
    h('tr', {}, [h('td'), h('th', { scope: 'row', text: 'Contingency ' + ts.contingencyPct + '%' }), num(rs(ts.contingency))]),
    h('tr.cx-total', {}, [h('td'), h('th', { scope: 'row', text: 'Grand total' }), num(rs(ts.grand))])
  ]));
  return h('article.cx-doc', {}, [
    h('p.cx-doc-eyebrow', { text: 'Budget top sheet' + (proj && proj.title ? ' · ' + proj.title : '') }),
    h('h2.cx-doc-title', { text: rs(ts.grand) }),
    h('p.cx-doc-sub', { text: (ts.grand >= 100000 ? '≈' + glance(ts.grand) + ' · ' : '') + 'Prepared ' + today() + ' from ' + ctx.lines.length + ' estimate line' + (ctx.lines.length === 1 ? '' : 's') + '.' }),
    screen ? scroll(table) : table,
    h('p.cx-hint', { text: shownCurrency() === 'USD'
      ? 'Rates are a starting point, not quotes: the US figures are one rental house\'s list prices, and no crew rate is offered.'
      : 'Rates are a starting point, not quotes: the Chennai card is 2024-25 and crew rates have no current union floor.' })
  ]);
}

function renderTopSheet(ctx) {
  const out = [intro('Top sheet', 'The one page a financier asks for: department totals, above and below the line, contingency and the grand total — folded from the estimate. Move a line to another department on the cost report.')];
  if (!ctx.lines.length) {
    out.push(emptyNote('No priced lines yet. The top sheet fills itself from the estimate.', '#estimate', 'Go to the estimate'));
    return out;
  }
  out.push(h('div.cx-actions', {}, [button({ label: 'Print top sheet', icon: 'print', variant: 'primary', pill: true, attrs: { 'data-cx': 'print-top', 'data-fk': 'ts:print' } })]));
  out.push(card('div.cx-doc-wrap', {}, null, [topSheetDoc(ctx, true)]));
  return out;
}

/* ============================================================
   6. THE WAGE TABLE
   ============================================================ */
/* The wage inputs' column headers, which are also their accessible
   names: a label built from the field key read 'callHours for …'. */
const WAGE_COLS = {
  bata: () => 'Your batta (' + sym() + '/day)',
  callHours: () => 'Call hours',
  otRule: () => 'Overtime rule'
};

function renderWages(ctx) {
  const rows = C.wageRows(wages, ctx.overrides);
  const src = wages.sources || {};
  const out = [intro('Crew wage table', 'A place to keep the daily batta your unit actually agreed, per craft, with the call hours and overtime rule beside it. The crew payments tab offers these as hints.')];
  out.push(notice({
    tone: 'warn',
    class: 'cx-alert cx-expired',
    title: 'Last published: ' + wages.title + ' — ' + wages.status.toUpperCase(),
    body: h('div', {}, [
      h('p', { text: wages.statusNote }),
      h('p', { text: wages.rules.note }),
      h('ul', {}, Object.values(src).map((s) => h('li', {}, [h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.name }), ' — ' + s.says + (s.caveat ? ' ' + s.caveat : '')])))
    ])
  }));
  const table = h('table.cx-table.k-table.cx-wages', {}, [
    h('caption', { text: 'Per craft · valid ' + wages.validFrom + ' to ' + wages.validTo + ' · checked ' + wages.lastChecked }),
    h('thead', {}, h('tr', {}, ['Craft', 'Published', WAGE_COLS.bata(), WAGE_COLS.callHours(), WAGE_COLS.otRule(), ''].map((x) => h('th', { scope: 'col', text: x }))))
  ]);
  const tb = h('tbody');
  for (const r of rows) {
    const pub = r.published.bata ? rupees(r.published.bata) + ' (reported, expired)' : 'not published';
    const inp = (k, v, ph, mode) => frame(h('input', {
      type: 'text', inputmode: mode || null, autocomplete: 'off', value: r.overridden.includes(k) && v !== null ? String(v) : '', placeholder: ph,
      'data-cx-field': 'wage', 'data-k': k, 'data-id': r.id, 'data-fk': 'w:' + r.id + ':' + k, 'aria-label': WAGE_COLS[k]() + ' for ' + r.craft
    }));
    tb.append(h('tr', { class: r.overridden.length ? 'is-set' : null }, [
      h('th', { scope: 'row' }, [r.craft, r.department ? h('span.cx-hint', { text: ' ' + r.department }) : null]),
      h('td' + (r.published.bata ? '.k-mono' : ''), { text: pub }),
      h('td', {}, inp('bata', r.bata, '—', 'decimal')),
      h('td', {}, inp('callHours', r.callHours, '—', 'decimal')),
      h('td', {}, inp('otRule', r.otRule, 'e.g. ½ batta per 2 h')),
      h('td', {}, r.overridden.length ? button({ label: 'Clear your figures for ' + r.craft, icon: 'restart_alt', iconOnly: true, size: 'sm', variant: 'ghost', attrs: { 'data-cx': 'reset-wage', 'data-id': r.id, 'data-fk': 'w:' + r.id + ':reset' } }) : null)
    ]));
  }
  table.append(tb);
  out.push(scroll(table));
  return out;
}

/* ============================================================
   7. EXPORT — CSV in the Movie Magic shape
   ============================================================ */
function renderExport(ctx) {
  const accounts = ctx.report.depts.filter((d) => d.lines.some((l) => !l.unbudgeted)).length;
  return [
    intro('Export', 'Spreadsheet files your accountant, line producer or budgeting software can open. The budget uses the account-number layout Movie Magic Budgeting reads — account, description, amount, units, rate, subtotal.'),
    h('div.cx-export', {}, [
      card('div', {}, 'Budget', [h('p.cx-hint', { text: ctx.lines.length + ' line' + (ctx.lines.length === 1 ? '' : 's') + ' in ' + accounts + ' account' + (accounts === 1 ? '' : 's') + ', with contingency and the grand total.' }),
        button({ label: 'Download budget CSV', icon: 'download', variant: 'primary', attrs: { 'data-cx': 'csv-budget', 'data-fk': 'ex:b' } })]),
      card('div', {}, 'Actuals', [h('p.cx-hint', { text: shownCurrency() === 'USD' ? 'Estimate, actual with and without tax, variance and % used, per line and department.' : 'Estimate, actual with and without GST, TDS, variance and % used, per line and department.' }),
        button({ label: 'Download actuals CSV', icon: 'download', attrs: { 'data-cx': 'csv-actuals', 'data-fk': 'ex:a' } })]),
      card('div', {}, 'Expense log', [h('p.cx-hint', { text: ctx.expenses.length + ' expense' + (ctx.expenses.length === 1 ? '' : 's') + (shownCurrency() === 'USD' ? ', with tax, vendor and receipt links — for the books.' : ', with GST, vendor GSTIN and receipt links — for the books.') }),
        button({ label: 'Download expenses CSV', icon: 'download', attrs: { 'data-cx': 'csv-expenses', 'data-fk': 'ex:x' } })])
    ])
  ];
}

/* ============================================================
   THE HEADER FIGURES: above the tabs, always visible
   ------------------------------------------------------------
   Five kit stat cards read off the same context every tab reads: the
   schedule's day count, then budgetKpis() for the other four. Each
   figure is measured; the note under it says what it is measured
   against, or that there is nothing yet to measure.
   ============================================================ */
function renderKpis(ctx) {
  const k = C.budgetKpis(ctx.report);
  const days = ctx.days.length;
  const scenes = ctx.days.reduce((n, d) => n + d.scenes.length, 0);
  return [
    statCard({ label: 'Stripboard', value: String(days), unit: days === 1 ? 'day' : 'days', note: days ? scenes + ' scenes scheduled' : 'Nothing scheduled yet', class: 'bd-kpi' }),
    statCard({ label: 'Total budget', value: glance(k.approved), note: !k.approved ? (k.actual ? 'No budget set' : 'Nothing priced yet') : k.contingency.pct ? 'Estimate + ' + k.contingency.pct + '% contingency' : 'Estimate, no contingency', class: 'bd-kpi' }),
    statCard({ label: 'Actual spent', value: glance(k.actual), note: k.approved ? pct(k.pctUsed, k.actual) + ' of the budget used' : 'Nothing to measure against', class: 'bd-kpi' }),
    statCard({ label: k.over ? 'Over budget' : 'Remaining', value: glance(Math.abs(k.remaining)), note: k.over ? (k.approved ? 'Spent beyond the budget' : 'Spent with no budget set') : !k.approved && !k.actual ? 'Nothing priced yet' : 'Left to spend', noteTone: k.over ? 'danger' : null, class: 'bd-kpi' + (k.over ? ' over' : '') }),
    contingencyCard(k)
  ];
}

/* The contingency % is typed on the cost report (#actuals), not the top
   sheet, so the empty note says so and links there. */
function contingencyCard(k) {
  const card = statCard({ label: 'Contingency', value: k.contingency.pct + '%', note: k.contingency.pool ? glance(k.contingency.pool) + ' pool, ' + glance(k.contingency.left) + ' left' : 'Set it on the ', class: 'bd-kpi' });
  if (!k.contingency.pool) card.querySelector('.k-stat-note').append(h('a', { href: '#actuals', text: 'cost report' }));
  return card;
}

/** The header strip's shell, for the page to put above the tabs. */
export function costKpis() {
  return h('div#bdKpis.bd-kpis.k-stat-strip', { role: 'group', 'aria-label': 'Budget at a glance' });
}

/* ============================================================
   THE ESTIMATE'S ASIDE — petty cash and floats, at a glance
   ------------------------------------------------------------
   The same floats and expenses the Petty cash tab shows, read off
   the same context: who is holding cash and what went out today.
   It writes nothing and adds nothing — the form is on the tab, one
   link away.
   ============================================================ */
function renderAside(ctx) {
  const fb = C.floatBalances(ctx.floats, ctx.expenses, ctx.nameOf);
  const day = today();
  const todays = ctx.expenses.filter((e) => e.date === day);
  const holders = fb.people.filter((p) => p.issued > 0);
  const go = button({ label: 'Log a petty cash bill', icon: 'receipt_long', href: '#expenses', block: true, class: 'bud-aside-go' });
  const body = [];
  if (!holders.length && !todays.length) {
    body.push(emptyState({
      icon: 'receipt_long',
      title: 'No petty cash yet',
      body: 'Floats you issue and bills you log on the shoot show here, with the cash still in each hand.'
    }));
  }
  if (holders.length) {
    body.push(h('div.bud-aside-sec', {}, [
      h('p.bud-aside-h', {}, [h('span.k-eyebrow', { text: 'Floats issued' }), h('span.k-mono', { text: rs(fb.issued) })]),
      h('ul.bud-aside-list', {}, holders.slice(0, 4).map((p) => h('li.bud-aside-row', {}, [
        h('span.bud-aside-name', { text: p.name }),
        h('span.bud-aside-sub', { text: rs(p.spent) + ' spent' }),
        h('span.bud-aside-amt.k-mono', { text: p.balance < 0 ? rs(-p.balance) + ' owed back' : rs(p.balance) + ' in hand' })
      ])))
    ]));
  }
  if (todays.length) {
    const sum = todays.reduce((s, e) => s + e.amount, 0);
    body.push(h('div.bud-aside-sec', {}, [
      h('p.bud-aside-h', {}, [h('span.k-eyebrow', { text: 'Logged today' }), h('span.k-mono', { text: rs(sum) })]),
      h('ul.bud-aside-list', {}, todays.slice(-3).reverse().map((e) => h('li.bud-aside-row', {}, [
        h('span.bud-aside-name', { text: label(C.categoriesFor(shownCurrency()), e.category) + (e.vendor ? ' · ' + e.vendor : '') }),
        h('span.bud-aside-sub', { text: (e.paidBy ? ctx.nameOf(e.paidBy) : 'Office') + ' · ' + label(C.methodsFor(shownCurrency()), e.method) }),
        h('span.bud-aside-amt.k-mono', { text: rs(e.amount) })
      ])))
    ]));
  }
  return [h('div.k-panel-head', {}, [
    h('h3.k-panel-title', { text: 'Petty cash & floats' }),
    h('div.k-panel-meta', {}, [badge({ label: ctx.expenses.length + (ctx.expenses.length === 1 ? ' entry' : ' entries'), tag: true })])
  ]), h('div.k-panel-body.bud-aside-body', {}, [...body, go])];
}

/** The aside's shell, for the page to place beside the estimator. */
export function costAside() {
  return h('aside#bdPetty.bud-aside.k-panel', { 'aria-label': 'Petty cash and floats at a glance' });
}

/* ============================================================
   MOUNT, REFRESH, EVENTS
   ============================================================ */
const SECTIONS = [
  { id: 'expenses', label: 'Petty cash', render: renderExpenses },
  { id: 'actuals', label: 'Cost report', render: renderActuals },
  { id: 'crew', label: 'Crew payments', render: renderCrew },
  { id: 'topsheet', label: 'Top sheet', render: renderTopSheet },
  { id: 'schedule', label: 'Schedule impact', render: renderSchedule },
  { id: 'versions', label: 'Versions', render: renderVersions },
  { id: 'wages', label: 'Wage table', render: renderWages },
  { id: 'export', label: 'Export', render: renderExport }
];

/** The empty section shells, for the page to place beside the estimate. */
export function costSections() {
  return SECTIONS.map((s) => h('section.cx-sec', { id: s.id, 'data-tab-label': s.label }));
}

function refresh() {
  const active = document.activeElement;
  const fk = active && active.dataset ? active.dataset.fk : '';
  // Where the focused control sits among its siblings, in case it is deleted.
  const secEl = active && active.closest ? active.closest('.cx-sec') : null;
  const fkPre = fk ? fk.slice(0, fk.lastIndexOf(':') + 1) : '';
  const fkAt = secEl && fkPre ? [...secEl.querySelectorAll('[data-fk^="' + CSS.escape(fkPre) + '"]')].indexOf(active) : -1;
  const secId = secEl ? secEl.id : '';
  const sel = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  const open = new Set([...document.querySelectorAll('.cx-sec details[open]:not(.cx-crew)')].map((d) => d.closest('.cx-sec').id + ':' + [...d.parentElement.children].indexOf(d)));
  /* A PRIVATE BUDGET (schema §55) on a view or comment link: every
     cost tab says so, and the strip and the aside draw nothing — a row
     of ₹ 0 would read as a real, empty budget. The local copy is not
     touched (budget-privacy-ui.js). */
  if (isBudgetLocked()) {
    const kp0 = document.getElementById('bdKpis');
    if (kp0) { kp0.replaceChildren(); kp0.hidden = true; }
    const aside0 = document.getElementById('bdPetty');
    if (aside0) { aside0.replaceChildren(); aside0.hidden = true; }
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) el.replaceChildren(lockedNote());
    }
    return;
  }
  const ctx = context();
  const kp = document.getElementById('bdKpis');
  if (kp && kp.hidden) kp.hidden = false;
  const asideShown = document.getElementById('bdPetty');
  if (asideShown && asideShown.hidden) asideShown.hidden = false;
  if (kp) kp.replaceChildren(...renderKpis(ctx));
  const aside = document.getElementById('bdPetty');
  if (aside) aside.replaceChildren(...renderAside(ctx));
  for (const s of SECTIONS) {
    const el = document.getElementById(s.id);
    if (el) el.replaceChildren(...s.render(ctx));
  }
  for (const key of open) {
    const [sec, i] = key.split(':');
    const host = document.getElementById(sec);
    const d = host && host.querySelectorAll('details:not(.cx-crew)');
    if (d) [...d].forEach((x) => { if ([...x.parentElement.children].indexOf(x) === +i) x.open = true; });
  }
  if (fk) {
    const back = document.querySelector('[data-fk="' + CSS.escape(fk) + '"]');
    if (back) {
      back.focus({ preventScroll: true });
      if (sel && typeof back.setSelectionRange === 'function') { try { back.setSelectionRange(sel[0], sel[1]); } catch (e) { /* not a text field */ } }
    } else if (secId) {
      // The control was deleted: its neighbour, else the section's heading.
      const sec = document.getElementById(secId);
      const sibs = sec && fkAt >= 0 ? sec.querySelectorAll('[data-fk^="' + CSS.escape(fkPre) + '"]') : [];
      const next = sibs.length ? sibs[Math.min(fkAt, sibs.length - 1)] : (sec && sec.querySelector('h2'));
      if (next) { if (!sibs.length) next.tabIndex = -1; next.focus({ preventScroll: true }); }
    }
  }
}

function toast(msg, opts) {
  if (window.StudioUI && window.StudioUI.toast) window.StudioUI.toast(msg, Object.assign({ type: 'info' }, opts || {}));
}

function download(name, text) {
  const proj = (Store.currentProject && Store.currentProject()) || null;
  const slug = String((proj && proj.title) || 'film').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'film';
  // The BOM makes Excel read ₹ and Tamil names as UTF-8.
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: slug + '-' + name + '-' + today() + '.csv' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function printDoc(doc) {
  if (!doc) return;
  let host = document.getElementById('cxPrint');
  if (!host) { host = h('div#cxPrint'); document.body.append(host); }
  host.replaceChildren(doc);
  document.body.classList.add('cx-printing');
  const done = () => { document.body.classList.remove('cx-printing'); host.remove(); window.removeEventListener('afterprint', done); };
  window.addEventListener('afterprint', done);
  window.print();
  // Browsers that print synchronously have fired afterprint already;
  // ones that never fire it get cleaned up on the next frame anyway.
  setTimeout(() => { if (document.body.classList.contains('cx-printing')) done(); }, 0);
}

const ACTIONS = {
  ...impactActions,
  'del-expense': (el) => {
    const list = C.listExpenses();
    const index = list.findIndex((x) => x.id === el.dataset.id);
    const gone = C.removeExpense(el.dataset.id);
    refresh();
    if (gone) toast('Expense of ' + rs(gone.amount) + ' deleted.', { action: 'UNDO', onAction: () => { C.restoreExpense(gone, index); refresh(); } });
  },
  'del-float': async (el) => { if (await askDanger({ title: 'Delete this float?', body: 'The balance in that person\'s hand is worked out again without it.', confirm: 'Delete float' })) { C.removeFloat(el.dataset.id); refresh(); toast('Float deleted.'); } },
  'del-payment': async (el) => { if (await askDanger({ title: 'Delete this payment?', body: 'It leaves the ledger and the balance is worked out again without it.', confirm: 'Delete payment' })) { C.removePayment(el.dataset.id); refresh(); toast('Payment deleted.'); } },
  'use-wage': (el) => { C.setCrew(el.dataset.id, { fee: Number(el.dataset.v) || 0, feeType: 'day' }); refresh(); toast('Fee set from the wage table — confirm it with the person and the union.'); },
  'reset-wage': (el) => { C.setWageOverride(el.dataset.id, { bata: '', callHours: '', otRule: '' }); refresh(); },
  'print-settlement': (el) => printDoc(settlementDoc(context(), el.dataset.id)),
  'print-top': () => printDoc(topSheetDoc(context(), false)),
  'csv-budget': () => download('budget', C.budgetCSV(context().report, shownCurrency())),
  'csv-actuals': () => download('actuals', C.actualsCSV(context().report, shownCurrency())),
  'csv-expenses': () => { const ctx = context(); download('expenses', C.expensesCSV(ctx.expenses, ctx.lineName, ctx.nameOf, shownCurrency())); }
};

const NOT_AMOUNT = 'That is not an amount above zero — "1850", "1,850" and "1.85k" all work.';

const FORMS = {
  version(form) { impactForms.version(form, context()); },
  expense(form) {
    const f = new FormData(form);
    const amount = amountOf(f.get('amount'));
    if (!(amount > 0)) { toast(String(f.get('amount') || '').trim() ? NOT_AMOUNT : 'Type the amount first — "1850", "1,850" and "1.85k" all work.', { type: 'error' }); form.querySelector('[name="amount"]').focus(); return; }
    const gstin = String(f.get('gstin') || '').trim();
    if (gstin && !C.gstinLooksValid(gstin)) toast('That GSTIN does not look like 15 characters of the usual shape — saved as typed; check it against the bill.', { type: 'error' });
    const paidBy = String(f.get('paidByName') || '').trim() || String(f.get('paidBy') || '');
    const row = C.addExpense({
      amount, date: f.get('date'), category: f.get('category'), paidBy, method: f.get('method'),
      shootDay: f.get('shootDay'), line: f.get('line'), gstPct: f.get('gstPct'),
      vendor: f.get('vendor'), gstin, receipt: f.get('receipt'), note: f.get('note')
    });
    Object.assign(sticky, { paidBy: String(f.get('paidBy') || ''), method: row.method, shootDay: String(f.get('shootDay') || ''), date: row.date });
    refresh();
    const again = document.querySelector('[data-fk="x:amount"]');
    if (again) again.focus({ preventScroll: true });
    toast(rs(row.amount) + ' logged under ' + label(C.categoriesFor(shownCurrency()), row.category) + '.', { type: 'success', duration: 2000 });
  },
  float(form) {
    const f = new FormData(form);
    const to = String(f.get('toName') || '').trim() || String(f.get('to') || '');
    const amount = amountOf(f.get('amount'));
    if (!to || !(amount > 0)) {
      toast(to && String(f.get('amount') || '').trim() ? NOT_AMOUNT : 'A float needs a person and an amount.', { type: 'error' });
      return;
    }
    C.addFloat({ to, amount, date: f.get('date'), method: f.get('method') });
    refresh();
  },
  payment(form) {
    const f = new FormData(form);
    const amount = amountOf(f.get('amount'));
    if (!(amount > 0)) { toast(String(f.get('amount') || '').trim() ? NOT_AMOUNT : 'Type the amount paid.', { type: 'error' }); return; }
    C.addPayment({ contactId: form.dataset.id, amount, date: f.get('date'), method: f.get('method'), note: f.get('note') });
    openCrew.add(form.dataset.id);
    refresh();
  }
};

function commitField(el) {
  const kind = el.dataset.cxField;
  if (kind === 'contingency') C.setSettings({ contingencyPct: el.value });
  else if (kind === 'line-dept') C.setLineDept(el.dataset.id, el.value);
  else if (kind === 'line-scales') C.setLineScales(el.dataset.id, el.value === 'scales' ? true : el.value === 'fixed' ? false : null);
  else if (kind === 'crew') { C.setCrew(el.dataset.id, { [el.dataset.k]: el.dataset.k === 'fee' ? amountOf(el.value) : el.value }); openCrew.add(el.dataset.id); }
  else if (kind === 'wage') C.setWageOverride(el.dataset.id, { [el.dataset.k]: el.dataset.k === 'bata' && el.value !== '' ? amountOf(el.value) : el.value });
  else return;
  /* A `change` fires as focus LEAVES the field, before it lands on the
     next one; rebuilding now would drop it on <body>. One tick later
     the next control has focus, and refresh() puts it back there. */
  setTimeout(refresh, 0);
}

/** Fill the shells and wire them. Call after the page is in the DOM. */
export function initCosts(root) {
  bindImpact({ refresh, toast });
  refresh();
  mountBudgetPrivacy(root, () => refresh());
  delegate(root, 'click', '[data-cx]', (e, el) => {
    const fn = ACTIONS[el.dataset.cx];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });
  delegate(root, 'submit', 'form[data-cx-form]', (e, form) => {
    e.preventDefault();
    const fn = FORMS[form.dataset.cxForm];
    if (fn) fn(form);
  });
  delegate(root, 'change', '[data-cx-field]', (e, el) => commitField(el));
  delegate(root, 'toggle', 'details.cx-crew', (e, d) => { if (d.open) openCrew.add(d.dataset.id); else openCrew.delete(d.dataset.id); }, true);
  /* The estimator writes its own key on every keystroke; the report,
     the top sheet and the export follow it, a beat behind. */
  let t = 0;
  const later = () => { clearTimeout(t); t = setTimeout(refresh, 350); };
  // Reset answers a dialog after the click's own refresh has run.
  document.addEventListener('budget:calc-cleared', () => { clearTimeout(t); refresh(); });
  delegate(root, 'input', '.calc-row [data-key]', later);
  delegate(root, 'change', '.calc-row [data-key]', later);
  delegate(root, 'click', '[data-action]', later);
}

export default { costSections, costKpis, costAside, initCosts };
