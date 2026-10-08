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
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import Store from '../lib/store.js';
import { INR, fmtINR, parseNum } from '../lib/money.js';
import C from '../lib/costs.js';
import { listContacts, listCallSheets, DEPARTMENTS } from '../lib/contacts.js';
import { calendarDays } from '../lib/locations.js';
import wages from '../data/wages.fefsi.json';

const rs = (n) => (n < 0 ? '−₹\u00a0' : '₹\u00a0') + INR.format(Math.round(Math.abs(n || 0)));
const pct = (n) => (n === null || n === undefined ? '—' : n + '%');
const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
const label = (list, id) => (list.find((x) => x.id === id) || {}).label || id;

/* Remembered for the life of the page only, so the second expense of
   the day is two taps: who paid and how are usually the same as the
   last one. Deliberately not stored — a preference written on every
   expense would be a write nobody asked for. */
const sticky = { paidBy: '', method: 'cash', shootDay: '', date: '' };
const openCrew = new Set();

/* ---- context: everything a render reads, read once ------------ */
function context() {
  let contacts = [], sheets = [], days = [];
  try { contacts = listContacts(); } catch (e) { /* none */ }
  try { sheets = listCallSheets(); } catch (e) { /* none */ }
  try { days = calendarDays(); } catch (e) { /* none */ }
  const all = C.readAll();
  const lines = C.estimateLines(C.readCalc(), all.lines);
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const nameOf = (id) => (byId.has(id) ? byId.get(id).name || 'Unnamed contact' : id);
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const lineName = (id) => (lineById.has(id) ? lineById.get(id).name : id ? 'A line no longer in the estimate' : '');
  const expenses = C.listExpenses();
  const floats = C.listFloats();
  const crew = C.listCrew();
  const payments = C.listPayments();
  const settings = C.getSettings();
  const report = C.costReport({ lines, expenses, crew, payments, contacts, contingencyPct: settings.contingencyPct });
  return { contacts, sheets, days, lines, byId, nameOf, lineName, expenses, floats, crew, payments, settings, report, overrides: all.wageOverrides };
}

/* ---- small builders --------------------------------------------- */
const stat = (value, text) => h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text })]);
function field(text, control, hint) {
  return h('label.cx-field', {}, [h('span.cx-flabel', { text }), control, hint ? h('span.cx-hint', { text: hint }) : null]);
}
function select(attrs, options, value) {
  const el = h('select', attrs, options.map(([v, t]) => h('option', { value: v, text: t })));
  el.value = value === undefined || value === null ? '' : String(value);
  return el;
}
function chips(name, options, value, fk) {
  return h('div.cx-chips', { role: 'radiogroup' }, options.map((o) =>
    h('label.cx-chip', {}, [
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

function emptyNote(text, href, cta) {
  return h('div.cx-empty', {}, [h('p', { text }), href ? h('a.mini-btn', { href, text: cta }) : null]);
}

/* ============================================================
   1. PETTY CASH + THE DAILY EXPENSE LOG
   ============================================================ */
function renderExpenses(ctx) {
  const fb = C.floatBalances(ctx.floats, ctx.expenses, ctx.nameOf);
  const out = [];
  out.push(h('div.cx-intro', {}, [
    h('h2.cx-h2', { text: 'Petty cash' }),
    h('p.cx-deck', { text: 'Every rupee that leaves a pocket on the shoot, logged the day it goes. Issue floats to whoever carries cash, log what they spend, and the balance in each hand is worked out for you.' })
  ]));
  out.push(h('div.bd-stats.cx-stats', {}, [
    stat(rs(fb.issued), 'floats issued'),
    stat(rs(fb.spent + fb.office), 'spent'),
    stat(rs(fb.inHand), 'cash in hand'),
    stat(rs(fb.owedBack), 'owed back to people'),
    stat(String(ctx.expenses.length), ctx.expenses.length === 1 ? 'entry' : 'entries')
  ]));

  /* QUICK ADD — tuned for a phone on set: the amount first and large,
     the category as one tap, who and how remembered from last time,
     everything a vendor bill needs folded away until it is needed. */
  const form = h('form.cx-card.cx-quick', { 'data-cx-form': 'expense', 'aria-label': 'Add an expense' }, [
    h('h3.cx-h3', { text: 'Log an expense' }),
    h('div.cx-quick-row', {}, [
      field('Amount (₹, bill total)', h('input.cx-amount', { name: 'amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: 'e.g. 1,850 or 2k', required: true, 'data-fk': 'x:amount' })),
      field('Date', h('input', { name: 'date', type: 'date', value: sticky.date || today(), 'data-fk': 'x:date' }))
    ]),
    h('fieldset.cx-set', {}, [h('legend.cx-flabel', { text: 'Category' }), chips('category', C.CATEGORIES, 'food', 'x:cat')]),
    h('div.cx-quick-row', {}, [
      field('Paid by', select({ name: 'paidBy', 'data-fk': 'x:paidBy' }, personOptions(ctx, 'Office / producer — no float'), sticky.paidBy)),
      field('Shoot day', select({ name: 'shootDay', 'data-fk': 'x:day' }, dayOptions(ctx), sticky.shootDay))
    ]),
    h('fieldset.cx-set', {}, [h('legend.cx-flabel', { text: 'Paid with' }), chips('method', C.METHODS.slice(0, 3), sticky.method, 'x:method')]),
    field('Budget line', select({ name: 'line', 'data-fk': 'x:line' }, lineOptions(ctx), '')),
    h('details.cx-more', {}, [
      h('summary', { text: 'Bill details — GST, vendor, receipt' }),
      h('div.cx-quick-row', {}, [
        field('GST in the bill', select({ name: 'gstPct', 'data-fk': 'x:gst' }, C.GST_RATES.map((r) => [String(r), r ? r + '%' : 'No GST']), '0')),
        field('Vendor', h('input', { name: 'vendor', type: 'text', autocomplete: 'off', 'data-fk': 'x:vendor' }))
      ]),
      h('div.cx-quick-row', {}, [
        field('Vendor GSTIN', h('input', { name: 'gstin', type: 'text', autocomplete: 'off', maxlength: '15', placeholder: '15 characters', 'data-fk': 'x:gstin' })),
        field('Receipt link', h('input', { name: 'receipt', type: 'url', autocomplete: 'off', placeholder: 'https://… (a photo in your Drive)', 'data-fk': 'x:receipt' }))
      ]),
      field('Paid by someone not in contacts', h('input', { name: 'paidByName', type: 'text', autocomplete: 'off', placeholder: 'a name — used instead of the list above', 'data-fk': 'x:paidByName' })),
      field('Note', h('input', { name: 'note', type: 'text', autocomplete: 'off', 'data-fk': 'x:note' }))
    ]),
    h('div.cx-actions', {}, [h('button.btn.primary.cx-submit', { type: 'submit', 'data-fk': 'x:submit', text: 'ADD EXPENSE' })])
  ]);
  out.push(form);

  /* FLOATS */
  const floatForm = h('form.cx-card', { 'data-cx-form': 'float', 'aria-label': 'Issue a float' }, [
    h('h3.cx-h3', { text: 'Floats — cash issued to a person' }),
    h('div.cx-quick-row', {}, [
      field('To', select({ name: 'to', 'data-fk': 'f:to' }, personOptions(ctx, 'Pick a person…'), '')),
      field('Amount (₹)', h('input', { name: 'amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', required: true, 'data-fk': 'f:amount' }))
    ]),
    h('div.cx-quick-row', {}, [
      field('Date', h('input', { name: 'date', type: 'date', value: today(), 'data-fk': 'f:date' })),
      field('Method', select({ name: 'method', 'data-fk': 'f:method' }, C.METHODS.map((m) => [m.id, m.label]), 'cash'))
    ]),
    field('Or a name not in contacts', h('input', { name: 'toName', type: 'text', autocomplete: 'off', 'data-fk': 'f:toName' })),
    h('div.cx-actions', {}, [h('button.btn', { type: 'submit', 'data-fk': 'f:submit', text: 'ISSUE FLOAT' })])
  ]);
  out.push(floatForm);

  if (fb.people.length) {
    const t = h('table.cx-table', {}, [
      h('caption', { text: 'Balance by person' }),
      h('thead', {}, h('tr', {}, ['Person', 'Issued', 'Spent', 'Balance'].map((x, i) => h('th', { scope: 'col', class: i ? 'num' : null, text: x }))))
    ]);
    const tb = h('tbody');
    for (const p of fb.people) {
      tb.append(h('tr', { class: p.balance < 0 ? 'is-owed' : null }, [
        h('th', { scope: 'row', text: p.name }),
        h('td.num', { text: rs(p.issued) }),
        h('td.num', { text: rs(p.spent) }),
        h('td.num', { text: p.balance < 0 ? rs(-p.balance) + ' owed back' : rs(p.balance) })
      ]));
    }
    t.append(tb);
    out.push(h('div.cx-scroll', {}, t));
  }
  if (ctx.floats.length) {
    out.push(h('details.cx-more.cx-float-log', {}, [
      h('summary', { text: ctx.floats.length + (ctx.floats.length === 1 ? ' float issued' : ' floats issued') }),
      h('ul.cx-log', {}, ctx.floats.slice().reverse().map((f) => h('li.cx-log-row', {}, [
        h('span.cx-log-amt', { text: rs(f.amount) }),
        h('span.cx-log-what', { text: 'to ' + ctx.nameOf(f.to) + (f.date ? ' · ' + f.date : '') + ' · ' + label(C.METHODS, f.method) }),
        h('button.bd-icon.cx-del', { type: 'button', 'data-cx': 'del-float', 'data-id': f.id, 'aria-label': 'Delete this float', 'data-fk': 'fl:' + f.id, text: '×' })
      ])))
    ]));
  }

  /* THE LOG — newest day first, a total per day. */
  out.push(h('h3.cx-h3', { text: 'Expense log' }));
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
    out.push(h('div.cx-day', {}, [
      h('div.cx-day-head', {}, [h('span', { text: d || 'No date' }), h('span.cx-day-total', { text: rs(total) })]),
      h('ul.cx-log', {}, rows.slice().reverse().map((e) => {
        const g = C.gstSplit(e.amount, e.gstPct);
        const bits = [label(C.CATEGORIES, e.category)];
        if (e.line) bits.push(ctx.lineName(e.line));
        if (e.shootDay) bits.push('Day ' + e.shootDay);
        bits.push((e.paidBy ? ctx.nameOf(e.paidBy) : 'Office') + ' · ' + label(C.METHODS, e.method));
        if (e.gstPct) bits.push('GST ' + e.gstPct + '% ' + rs(g.tax));
        if (e.vendor) bits.push(e.vendor + (e.gstin ? ' (' + e.gstin + ')' : ''));
        return h('li.cx-log-row', {}, [
          h('span.cx-log-amt', { text: rs(e.amount) }),
          h('span.cx-log-what', {}, [
            bits.join(' · '),
            e.note ? h('span.cx-log-note', { text: e.note }) : null,
            /^https?:\/\//i.test(e.receipt) ? h('a.cx-receipt', { href: e.receipt, target: '_blank', rel: 'noopener noreferrer', text: 'receipt' }) : null
          ]),
          h('button.bd-icon.cx-del', { type: 'button', 'data-cx': 'del-expense', 'data-id': e.id, 'aria-label': 'Delete this expense of ' + rs(e.amount), 'data-fk': 'xl:' + e.id, text: '×' })
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
  const out = [h('div.cx-intro', {}, [
    h('h2.cx-h2', { text: 'Cost report' }),
    h('p.cx-deck', { text: 'The estimate against what has actually gone out — expenses on each line plus crew payments — with the variance and how much of each line is used. Worked out fresh every time; nothing here is stored.' })
  ])];
  out.push(h('div.cx-card.cx-cont', {}, [
    field('Contingency (% of the estimate)', h('input', {
      type: 'text', inputmode: 'decimal', value: String(t.contingencyPct), 'data-cx-field': 'contingency', 'data-fk': 'r:cont', autocomplete: 'off'
    }), 'Usually 10%. It is added on top of the estimate; spending past the estimate eats into it.')
  ]));
  out.push(h('div.bd-stats.cx-stats', {}, [
    stat(rs(t.estimate), 'estimate'),
    stat(rs(t.contingency), 'contingency ' + t.contingencyPct + '%'),
    stat(rs(t.actual), 'actual, with GST'),
    stat(rs(t.actualNet), 'actual, without GST'),
    stat(rs(t.variance), t.variance < 0 ? 'over budget' : 'left'),
    stat(pct(t.pctUsed), 'used')
  ]));
  if (!ctx.lines.length && !t.actual) {
    out.push(emptyNote('Nothing to report yet. Price some lines in the estimate, then log what you spend — this compares the two.', '#estimate', 'GO TO THE ESTIMATE'));
    return out;
  }
  if (r.over.length) {
    out.push(h('div.cx-alert', { role: 'note' }, [
      h('strong', { text: r.over.length + (r.over.length === 1 ? ' line is over budget' : ' lines are over budget') }),
      h('ul', {}, r.over.map((l) => h('li', { text: (l.unbudgeted ? C.deptOf(l.dept).label + ': ' : '') + l.name + ' — ' + rs(l.actual) + ' against ' + rs(l.estimate) + (l.unbudgeted ? ' (no line in the estimate)' : '') })))
    ]));
  }
  const table = h('table.cx-table.cx-report', {}, [
    h('caption', { text: 'By department and line' }),
    h('thead', {}, h('tr', {}, ['Line', 'Department', 'Estimate', 'Actual', 'Excl. GST', 'Variance', 'Used'].map((x, i) => h('th', { scope: 'col', class: i > 1 ? 'num' : null, text: x }))))
  ]);
  const deptOpts = C.DEPTS.map((d) => [d.id, d.acct + ' ' + d.label]);
  for (const d of r.depts) {
    const tb = h('tbody.cx-dept');
    tb.append(h('tr.cx-dept-row', {}, [
      h('th', { scope: 'rowgroup', colspan: '2', text: d.acct + ' · ' + d.label }),
      h('td.num', { text: rs(d.estimate) }), h('td.num', { text: rs(d.actual) }), h('td.num', { text: rs(d.actualNet) }),
      h('td.num', { class: d.over ? 'is-over' : null, text: rs(d.variance) }), h('td.num', { text: pct(d.pctUsed) })
    ]));
    for (const l of d.lines) {
      const used = l.pctUsed === null ? 100 : Math.min(100, l.pctUsed);
      tb.append(h('tr', { class: l.over ? 'is-over' : null }, [
        h('th', { scope: 'row' }, [l.name, l.over ? h('span.cx-flag', { text: 'OVER' }) : null]),
        h('td', {}, l.unbudgeted ? h('span.cx-hint', { text: 'not in the estimate' })
          : select({ 'data-cx-field': 'line-dept', 'data-id': l.id, 'data-fk': 'ld:' + l.id, 'aria-label': 'Department for ' + l.name }, deptOpts, l.dept)),
        h('td.num', { text: rs(l.estimate) }), h('td.num', { text: rs(l.actual) }), h('td.num', { text: rs(l.actualNet) }),
        h('td.num', { class: l.over ? 'is-over' : null, text: rs(l.variance) }),
        h('td.num', {}, [pct(l.pctUsed), h('span.cx-bar', { 'aria-hidden': 'true' }, h('span', { style: '--used:' + used + '%' }))])
      ]));
    }
    table.append(tb);
  }
  table.append(h('tfoot', {}, [
    h('tr', {}, [h('th', { scope: 'row', colspan: '2', text: 'Contingency ' + t.contingencyPct + '%' }), h('td.num', { text: rs(t.contingency) }), h('td', { colspan: '4' })]),
    h('tr.cx-total', {}, [
      h('th', { scope: 'row', colspan: '2', text: 'Total' }),
      h('td.num', { text: rs(t.estimateWithContingency) }), h('td.num', { text: rs(t.actual) }), h('td.num', { text: rs(t.actualNet) }),
      h('td.num', { class: t.variance < 0 ? 'is-over' : null, text: rs(t.variance) }), h('td.num', { text: pct(t.pctUsed) })
    ])
  ]));
  out.push(h('div.cx-scroll', {}, table));
  out.push(h('p.cx-hint.cx-taxnote', {
    text: 'GST paid on bills: ' + rs(t.gst) + '. TDS withheld on crew payments: ' + rs(t.tds)
      + ' — owed to the income-tax department, and counted in the actual because it is part of the fee. '
      + 'An expense is logged as the bill total, tax included; the GST share is worked out from its rate.'
  }));
  return out;
}

/* ============================================================
   3. CREW PAYMENTS + THE ADVANCES LEDGER
   ============================================================ */
function crewAccountFor(ctx, c) {
  const rec = ctx.crew[c.id] || C.getCrew(c.id);
  const paid = ctx.payments.filter((p) => p.contactId === c.id);
  const derived = C.derivedDays(c, ctx.days, ctx.sheets);
  return { rec, paid, derived, acct: C.crewAccount(rec, paid, derived) };
}

function wageHintRows(ctx, department) {
  const rows = C.wageRows(wages, ctx.overrides);
  const own = rows.filter((r) => r.department === department);
  return own.length ? [rows[0], ...own] : rows;
}

function renderCrewCard(ctx, c) {
  const { rec, paid, derived, acct } = crewAccountFor(ctx, c);
  const id = c.id;
  const hints = wageHintRows(ctx, c.department);
  const picked = C.wageRows(wages, ctx.overrides).find((r) => r.id === rec.wageRow);
  let hintText = '';
  if (picked) {
    hintText = picked.bata
      ? (picked.overridden.includes('bata') ? 'Your figure for ' + picked.craft + ': ' + rs(picked.bata) + '/day.'
        : picked.craft + ': ' + rs(picked.bata) + '/day — reported for the 2022 MoU, EXPIRED. Confirm with your union.')
      : 'No published figure for ' + picked.craft + '. Set your own on the wage table tab.';
  }
  const daysHint = acct.daysSource === 'entered'
    ? (derived.days ? 'You set this. The ' + derived.source + ' say ' + derived.days + '.' : 'You set this.')
    : derived.days ? 'From the ' + derived.source + '. Type a number to override.' : 'Nothing to count from yet — type the days.';
  const body = h('div.cx-crew-body', {}, [
    h('div.cx-quick-row', {}, [
      field('Fee basis', select({ 'data-cx-field': 'crew', 'data-k': 'feeType', 'data-id': id, 'data-fk': 'cr:' + id + ':ft' }, [['day', 'Per day'], ['lump', 'Lump sum']], rec.feeType)),
      field(rec.feeType === 'lump' ? 'Agreed fee (₹, lump)' : 'Agreed fee (₹ per day)', h('input', {
        type: 'text', inputmode: 'decimal', autocomplete: 'off', value: rec.fee ? String(rec.fee) : '', placeholder: '0',
        'data-cx-field': 'crew', 'data-k': 'fee', 'data-id': id, 'data-fk': 'cr:' + id + ':fee'
      }))
    ]),
    h('div.cx-quick-row', {}, [
      field('Wage-table hint', select({ 'data-cx-field': 'crew', 'data-k': 'wageRow', 'data-id': id, 'data-fk': 'cr:' + id + ':wr' },
        [['', 'None'], ...hints.map((r) => [r.id, r.craft])], rec.wageRow), hintText || 'Optional. A starting point only — there is no current union floor.'),
      picked && picked.bata && rec.feeType === 'day'
        ? h('div.cx-field.cx-usefee', {}, [h('span.cx-flabel', { text: ' ' }), h('button.mini-btn', { type: 'button', 'data-cx': 'use-wage', 'data-id': id, 'data-v': String(picked.bata), 'data-fk': 'cr:' + id + ':use', text: 'USE ' + rs(picked.bata) + ' AS THE FEE' })])
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
    ].map(([k, v]) => h('div', {}, [h('dt', { text: k }), h('dd', { text: v })]))),
    h('h4.cx-h4', { text: 'Advances and payments' }),
    paid.length ? h('ul.cx-log', {}, paid.map((p) => h('li.cx-log-row', {}, [
      h('span.cx-log-amt', { text: rs(p.amount) }),
      h('span.cx-log-what', { text: (p.date || 'No date') + ' · ' + label(C.METHODS, p.method) + (p.note ? ' · ' + p.note : '') }),
      h('button.bd-icon.cx-del', { type: 'button', 'data-cx': 'del-payment', 'data-id': p.id, 'aria-label': 'Delete this payment of ' + rs(p.amount), 'data-fk': 'pl:' + p.id, text: '×' })
    ]))) : h('p.cx-hint', { text: 'Nothing paid yet.' }),
    h('form.cx-pay', { 'data-cx-form': 'payment', 'data-id': id, 'aria-label': 'Record a payment to ' + (c.name || 'this person') }, [
      h('div.cx-quick-row', {}, [
        field('Amount paid (₹, after TDS)', h('input', { name: 'amount', type: 'text', inputmode: 'decimal', autocomplete: 'off', required: true, 'data-fk': 'pf:' + id + ':amt' })),
        field('Date', h('input', { name: 'date', type: 'date', value: today(), 'data-fk': 'pf:' + id + ':date' }))
      ]),
      h('div.cx-quick-row', {}, [
        field('Method', select({ name: 'method', 'data-fk': 'pf:' + id + ':m' }, C.METHODS.map((m) => [m.id, m.label]), 'bank')),
        field('Note', h('input', { name: 'note', type: 'text', autocomplete: 'off', placeholder: 'advance, final settlement…', 'data-fk': 'pf:' + id + ':note' }))
      ]),
      h('div.cx-actions', {}, [
        h('button.btn', { type: 'submit', 'data-fk': 'pf:' + id + ':go', text: 'RECORD PAYMENT' }),
        h('button.btn', { type: 'button', 'data-cx': 'print-settlement', 'data-id': id, 'data-fk': 'pf:' + id + ':print', text: 'PRINT SETTLEMENT' })
      ])
    ])
  ]);
  const d = h('details.cx-crew', { 'data-id': id, open: openCrew.has(id) ? true : null }, [
    h('summary.cx-crew-sum', {}, [
      h('span.cx-crew-name', { text: c.name || 'Unnamed contact' }),
      h('span.cx-crew-role', { text: [c.role, c.department].filter(Boolean).join(' · ') }),
      h('span.cx-crew-due', { class: acct.balance > 0 ? 'is-due' : null, text: acct.gross ? (acct.balance < 0 ? 'overpaid ' + rs(-acct.balance) : acct.balance ? rs(acct.balance) + ' due' : 'settled') : 'no fee set' })
    ]),
    body
  ]);
  return d;
}

function renderCrew(ctx) {
  const out = [h('div.cx-intro', {}, [
    h('h2.cx-h2', { text: 'Crew payments' }),
    h('p.cx-deck', { text: 'What each person was promised, what they have had, and what is still owed. Days come from the day out of days for the cast and from the call sheets for everyone else, unless you type them.' })
  ])];
  if (!ctx.contacts.length) {
    out.push(emptyNote('No contacts yet. Add the unit on the Contacts page and each person gets a ledger here.', 'contacts.html#contacts', 'GO TO CONTACTS'));
    return out;
  }
  let gross = 0, paid = 0, due = 0, tds = 0;
  for (const c of ctx.contacts) {
    const { acct } = crewAccountFor(ctx, c);
    gross += acct.gross; paid += acct.paid; due += Math.max(0, acct.balance); tds += acct.tds;
  }
  out.push(h('div.bd-stats.cx-stats', {}, [
    stat(rs(gross), 'fees agreed'), stat(rs(paid), 'paid'), stat(rs(due), 'still due'), stat(rs(tds), 'TDS to deposit')
  ]));
  const order = [...DEPARTMENTS, ...new Set(ctx.contacts.map((c) => c.department).filter((d) => !DEPARTMENTS.includes(d)))];
  for (const dept of order) {
    const people = ctx.contacts.filter((c) => (c.department || '') === dept);
    if (!people.length) continue;
    out.push(h('div.cx-crew-dept', {}, [h('h3.cx-dept-name', { text: dept }), ...people.map((c) => renderCrewCard(ctx, c))]));
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
    h('h1.cx-doc-title', { text: c.name || 'Unnamed contact' }),
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
      h('tbody', {}, paid.length ? paid.map((p) => h('tr', {}, [h('td', { text: p.date || '—' }), h('td', { text: label(C.METHODS, p.method) }), h('td', { text: p.note }), h('td.num', { text: rs(p.amount) })]))
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
   ============================================================ */
function topSheetDoc(ctx) {
  const ts = C.topSheet(ctx.report);
  const proj = (Store.currentProject && Store.currentProject()) || null;
  const table = h('table.cx-table.cx-top', {}, [
    h('thead', {}, h('tr', {}, ['Acct', 'Department', 'Estimate'].map((x, i) => h('th', { scope: 'col', class: i === 2 ? 'num' : null, text: x }))))
  ]);
  for (const g of ts.groups) {
    if (!g.depts.length) continue;
    const tb = h('tbody', {}, [h('tr.cx-dept-row', {}, [h('th', { scope: 'rowgroup', colspan: '3', text: g.label })])]);
    for (const d of g.depts) tb.append(h('tr', {}, [h('td', { text: d.acct }), h('th', { scope: 'row', text: d.label }), h('td.num', { text: rs(d.estimate) })]));
    tb.append(h('tr.cx-sub', {}, [h('td'), h('th', { scope: 'row', text: 'Total ' + g.label.toLowerCase() }), h('td.num', { text: rs(g.estimate) })]));
    table.append(tb);
  }
  table.append(h('tfoot', {}, [
    h('tr', {}, [h('td'), h('th', { scope: 'row', text: 'Above the line' }), h('td.num', { text: rs(ts.atl) + ' · ' + ts.atlShare + '%' })]),
    h('tr', {}, [h('td'), h('th', { scope: 'row', text: 'Below the line' }), h('td.num', { text: rs(ts.btl) + ' · ' + (ts.subtotal ? 100 - ts.atlShare : 0) + '%' })]),
    h('tr', {}, [h('td'), h('th', { scope: 'row', text: 'Subtotal' }), h('td.num', { text: rs(ts.subtotal) })]),
    h('tr', {}, [h('td'), h('th', { scope: 'row', text: 'Contingency ' + ts.contingencyPct + '%' }), h('td.num', { text: rs(ts.contingency) })]),
    h('tr.cx-total', {}, [h('td'), h('th', { scope: 'row', text: 'Grand total' }), h('td.num', { text: rs(ts.grand) })])
  ]));
  return h('article.cx-doc', {}, [
    h('p.cx-doc-eyebrow', { text: 'Budget top sheet' + (proj && proj.title ? ' · ' + proj.title : '') }),
    h('h1.cx-doc-title', { text: rs(ts.grand) }),
    h('p.cx-doc-sub', { text: (ts.grand >= 100000 ? '≈' + fmtINR(ts.grand) + ' · ' : '') + 'Prepared ' + today() + ' from ' + ctx.lines.length + ' estimate line' + (ctx.lines.length === 1 ? '' : 's') + '.' }),
    table,
    h('p.cx-hint', { text: 'Rates are a starting point, not quotes: the Chennai card is 2024-25 and crew rates have no current union floor.' })
  ]);
}

function renderTopSheet(ctx) {
  const out = [h('div.cx-intro', {}, [
    h('h2.cx-h2', { text: 'Top sheet' }),
    h('p.cx-deck', { text: 'The one page a financier asks for: department totals, above and below the line, contingency and the grand total — folded from the estimate. Move a line to another department on the cost report.' })
  ])];
  if (!ctx.lines.length) {
    out.push(emptyNote('No priced lines yet. The top sheet fills itself from the estimate.', '#estimate', 'GO TO THE ESTIMATE'));
    return out;
  }
  out.push(h('div.cx-actions', {}, [h('button.btn.primary', { type: 'button', 'data-cx': 'print-top', 'data-fk': 'ts:print', text: 'PRINT TOP SHEET' })]));
  out.push(h('div.cx-card.cx-doc-wrap', {}, topSheetDoc(ctx)));
  return out;
}

/* ============================================================
   6. THE WAGE TABLE
   ============================================================ */
function renderWages(ctx) {
  const rows = C.wageRows(wages, ctx.overrides);
  const src = wages.sources || {};
  const out = [h('div.cx-intro', {}, [
    h('h2.cx-h2', { text: 'Crew wage table' }),
    h('p.cx-deck', { text: 'A place to keep the daily bata your unit actually agreed, per craft, with the call hours and overtime rule beside it. The crew payments tab offers these as hints.' })
  ])];
  out.push(h('div.cx-alert.cx-expired', { role: 'note' }, [
    h('strong', { text: 'Last published: ' + wages.title + ' — ' + wages.status.toUpperCase() }),
    h('p', { text: wages.statusNote }),
    h('p', { text: wages.rules.note }),
    h('ul', {}, Object.values(src).map((s) => h('li', {}, [h('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer', text: s.name }), ' — ' + s.says + (s.caveat ? ' ' + s.caveat : '')])))
  ]));
  const table = h('table.cx-table.cx-wages', {}, [
    h('caption', { text: 'Per craft · valid ' + wages.validFrom + ' to ' + wages.validTo + ' · checked ' + wages.lastChecked }),
    h('thead', {}, h('tr', {}, ['Craft', 'Published', 'Your bata (₹/day)', 'Call hours', 'Overtime rule', ''].map((x) => h('th', { scope: 'col', text: x }))))
  ]);
  const tb = h('tbody');
  for (const r of rows) {
    const pub = r.published.bata ? rs(r.published.bata) + ' (reported, expired)' : 'not published';
    const inp = (k, v, ph, mode) => h('input', {
      type: 'text', inputmode: mode || null, autocomplete: 'off', value: r.overridden.includes(k) && v !== null ? String(v) : '', placeholder: ph,
      'data-cx-field': 'wage', 'data-k': k, 'data-id': r.id, 'data-fk': 'w:' + r.id + ':' + k, 'aria-label': k + ' for ' + r.craft
    });
    tb.append(h('tr', { class: r.overridden.length ? 'is-set' : null }, [
      h('th', { scope: 'row' }, [r.craft, r.department ? h('span.cx-hint', { text: ' ' + r.department }) : null]),
      h('td', { text: pub }),
      h('td', {}, inp('bata', r.bata, '—', 'decimal')),
      h('td', {}, inp('callHours', r.callHours, '—', 'decimal')),
      h('td', {}, inp('otRule', r.otRule, 'e.g. ½ bata per 2 h')),
      h('td', {}, r.overridden.length ? h('button.bd-icon', { type: 'button', 'data-cx': 'reset-wage', 'data-id': r.id, 'aria-label': 'Clear your figures for ' + r.craft, 'data-fk': 'w:' + r.id + ':reset', text: '↺' }) : null)
    ]));
  }
  table.append(tb);
  out.push(h('div.cx-scroll', {}, table));
  return out;
}

/* ============================================================
   7. EXPORT — CSV in the Movie Magic shape
   ============================================================ */
function renderExport(ctx) {
  return [
    h('div.cx-intro', {}, [
      h('h2.cx-h2', { text: 'Export' }),
      h('p.cx-deck', { text: 'Spreadsheet files your accountant, line producer or budgeting software can open. The budget uses the account-number layout Movie Magic Budgeting reads — account, description, amount, units, rate, subtotal.' })
    ]),
    h('div.cx-export', {}, [
      h('div.cx-card', {}, [h('h3.cx-h3', { text: 'Budget' }), h('p.cx-hint', { text: ctx.lines.length + ' line' + (ctx.lines.length === 1 ? '' : 's') + ' in ' + ctx.report.depts.filter((d) => d.lines.some((l) => !l.unbudgeted)).length + ' accounts, with contingency and the grand total.' }),
        h('button.btn.primary', { type: 'button', 'data-cx': 'csv-budget', 'data-fk': 'ex:b', text: 'DOWNLOAD BUDGET CSV' })]),
      h('div.cx-card', {}, [h('h3.cx-h3', { text: 'Actuals' }), h('p.cx-hint', { text: 'Estimate, actual with and without GST, TDS, variance and % used, per line and department.' }),
        h('button.btn', { type: 'button', 'data-cx': 'csv-actuals', 'data-fk': 'ex:a', text: 'DOWNLOAD ACTUALS CSV' })]),
      h('div.cx-card', {}, [h('h3.cx-h3', { text: 'Expense log' }), h('p.cx-hint', { text: ctx.expenses.length + ' expense' + (ctx.expenses.length === 1 ? '' : 's') + ', with GST, vendor GSTIN and receipt links — for the books.' }),
        h('button.btn', { type: 'button', 'data-cx': 'csv-expenses', 'data-fk': 'ex:x', text: 'DOWNLOAD EXPENSES CSV' })])
    ])
  ];
}

/* ============================================================
   MOUNT, REFRESH, EVENTS
   ============================================================ */
const SECTIONS = [
  { id: 'expenses', label: 'Petty cash', render: renderExpenses },
  { id: 'actuals', label: 'Cost report', render: renderActuals },
  { id: 'crew', label: 'Crew payments', render: renderCrew },
  { id: 'topsheet', label: 'Top sheet', render: renderTopSheet },
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
  const sel = active && typeof active.selectionStart === 'number' ? [active.selectionStart, active.selectionEnd] : null;
  const open = new Set([...document.querySelectorAll('.cx-sec details[open]:not(.cx-crew)')].map((d) => d.closest('.cx-sec').id + ':' + [...d.parentElement.children].indexOf(d)));
  const ctx = context();
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
  'del-expense': (el) => {
    const list = C.listExpenses();
    const index = list.findIndex((x) => x.id === el.dataset.id);
    const gone = C.removeExpense(el.dataset.id);
    refresh();
    if (gone) toast('Expense of ' + rs(gone.amount) + ' deleted.', { action: 'UNDO', onAction: () => { C.restoreExpense(gone, index); refresh(); } });
  },
  'del-float': (el) => { if (confirm('Delete this float? The balance in that person\'s hand is worked out again without it.')) { C.removeFloat(el.dataset.id); refresh(); } },
  'del-payment': (el) => { if (confirm('Delete this payment from the ledger?')) { C.removePayment(el.dataset.id); refresh(); } },
  'use-wage': (el) => { C.setCrew(el.dataset.id, { fee: Number(el.dataset.v) || 0, feeType: 'day' }); refresh(); toast('Fee set from the wage table — confirm it with the person and the union.'); },
  'reset-wage': (el) => { C.setWageOverride(el.dataset.id, { bata: '', callHours: '', otRule: '' }); refresh(); },
  'print-settlement': (el) => printDoc(settlementDoc(context(), el.dataset.id)),
  'print-top': () => printDoc(topSheetDoc(context())),
  'csv-budget': () => download('budget', C.budgetCSV(context().report)),
  'csv-actuals': () => download('actuals', C.actualsCSV(context().report)),
  'csv-expenses': () => { const ctx = context(); download('expenses', C.expensesCSV(ctx.expenses, ctx.lineName, ctx.nameOf)); }
};

const FORMS = {
  expense(form) {
    const f = new FormData(form);
    const amount = parseNum(f.get('amount'));
    if (!(amount > 0)) { toast('Type the amount first — "1850", "1,850" and "1.85k" all work.', { type: 'error' }); form.querySelector('[name="amount"]').focus(); return; }
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
    toast(rs(row.amount) + ' logged under ' + label(C.CATEGORIES, row.category) + '.', { type: 'success', duration: 2000 });
  },
  float(form) {
    const f = new FormData(form);
    const to = String(f.get('toName') || '').trim() || String(f.get('to') || '');
    const amount = parseNum(f.get('amount'));
    if (!to || !(amount > 0)) { toast('A float needs a person and an amount.', { type: 'error' }); return; }
    C.addFloat({ to, amount, date: f.get('date'), method: f.get('method') });
    refresh();
  },
  payment(form) {
    const f = new FormData(form);
    const amount = parseNum(f.get('amount'));
    if (!(amount > 0)) { toast('Type the amount paid.', { type: 'error' }); return; }
    C.addPayment({ contactId: form.dataset.id, amount, date: f.get('date'), method: f.get('method'), note: f.get('note') });
    openCrew.add(form.dataset.id);
    refresh();
  }
};

function commitField(el) {
  const kind = el.dataset.cxField;
  if (kind === 'contingency') C.setSettings({ contingencyPct: el.value });
  else if (kind === 'line-dept') C.setLineDept(el.dataset.id, el.value);
  else if (kind === 'crew') { C.setCrew(el.dataset.id, { [el.dataset.k]: el.value }); openCrew.add(el.dataset.id); }
  else if (kind === 'wage') C.setWageOverride(el.dataset.id, { [el.dataset.k]: el.value });
  else return;
  /* A `change` fires as focus LEAVES the field, before it lands on the
     next one; rebuilding now would drop it on <body>. One tick later
     the next control has focus, and refresh() puts it back there. */
  setTimeout(refresh, 0);
}

/** Fill the shells and wire them. Call after the page is in the DOM. */
export function initCosts(root) {
  refresh();
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
  delegate(root, 'input', '.calc-row [data-key]', later);
  delegate(root, 'change', '.calc-row [data-key]', later);
  delegate(root, 'click', '[data-action]', later);
}

export default { costSections, initCosts };
