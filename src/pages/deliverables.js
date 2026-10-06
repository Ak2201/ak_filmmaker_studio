/* ============================================================
   DELIVERABLES — one checklist for everything that leaves
   ------------------------------------------------------------
   Read src/lib/deliverables.js first. This file arranges the
   catalogue into its groups, draws the festival requirements the
   tracker already knows about, and takes the ticks.

   THREE THINGS ON THE PAGE ARE READ FROM ELSEWHERE AND SAY SO:
     - the festival rows, from the submission tracker and the
       festival catalogue (festivals.js), with the format each one
       asks for;
     - the blueprint's own answer to "who needs what, in which
       format" (step 32, `po_deliver_list`), quoted so the list and
       the plan can be compared rather than kept apart;
     - the project's format, which hides items a short never needs.
   None of them is copied into this page's key. Change them where
   they live and this page follows.
   ============================================================ */
import Store from '../lib/store.js';          /* FIRST — it patches Storage.prototype. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/deliverables.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import { saveOnInput } from '../lib/autosave.js';
import Deliverables, { STATES, WHEN } from '../lib/deliverables.js';

const app = document.getElementById('app');

/* In memory, like every other page's view state. */
let show = 'all';   // 'all' | a WHEN id

const FEATURE_KEY = 'fms_filmmaker_combined_v1';

/* The blueprint's post step holds two free-text answers this page
   should sit beside. Read through the proxy, so it is the open
   project's; never written here. */
function blueprintSays() {
  try {
    const raw = localStorage.getItem(FEATURE_KEY);
    const bag = raw ? JSON.parse(raw) : {};
    return {
      list: String((bag && bag.po_deliver_list) || '').trim(),
      plan: String((bag && bag.po_release_plan) || '').trim()
    };
  } catch (e) { return { list: '', plan: '' }; }
}

function projectFormat() {
  try { const p = Store.currentProject && Store.currentProject(); return (p && p.format) || ''; }
  catch (e) { return ''; }
}

/* ---- pieces -------------------------------------------------- */

function stat(num, label) {
  return h('div.bd-stat', {}, [h('strong', { text: num }), h('span', { text: label })]);
}

function stateSelect(item) {
  const sel = h('select.bd-sel.dv-state', {
    'data-dv-field': 'state', 'data-item': item.id,
    'aria-label': 'Status: ' + item.label
  });
  STATES.forEach((s) => {
    const o = h('option', { value: s.id, text: s.label });
    if (s.id === item.state) o.selected = true;
    sel.append(o);
  });
  return sel;
}

function itemRow(item, asked) {
  const row = h('article.dv-item.is-' + item.state, { 'data-item': item.id });

  const head = h('div.dv-head');
  head.append(h('h3.dv-label', { text: item.label }));
  head.append(h('span.dv-when', { text: Deliverables.whenLabel(item.when) }));
  if (item.custom) {
    head.append(h('button.bd-icon', {
      type: 'button', 'data-dv-action': 'custom-del', 'data-item': item.id,
      'aria-label': 'Remove ' + item.label, text: '×'
    }));
  }
  row.append(head);

  if (item.why) row.append(h('p.dv-why', { text: item.why }));

  const who = asked[item.id];
  if (who && who.length) {
    row.append(h('p.dv-asked', {
      text: (who.length === 1 ? 'Asked for by ' : 'Asked for by ') + who.join(', ')
        + ' — from your submission tracker.'
    }));
  }

  const ctl = h('div.dv-ctl');
  ctl.append(stateSelect(item));
  const note = h('input.dv-note', {
    type: 'text', placeholder: 'Where it is, who has it, what is wrong with it',
    'data-dv-field': 'note', 'data-item': item.id,
    'aria-label': 'Note: ' + item.label
  });
  note.value = item.note || '';
  ctl.append(note);
  row.append(ctl);
  return row;
}

function group(g, items, asked) {
  if (!items.length) return null;
  const sec = h('section.dv-group', { id: 'g-' + g.id, 'aria-labelledby': 'gh-' + g.id });
  const p = Deliverables.progress(items);
  const head = h('div.dv-group-head');
  head.append(h('h2.dv-h2', { id: 'gh-' + g.id, text: g.label }));
  head.append(h('span.dv-group-count', { text: p.done + ' of ' + p.total }));
  sec.append(head);
  if (g.blurb) sec.append(h('p.dv-blurb', { text: g.blurb }));
  const list = h('div.dv-list');
  items.forEach((it) => list.append(itemRow(it, asked)));
  sec.append(list);
  return sec;
}

function festivalBlock(reqs) {
  const sec = h('section.dv-fest', { id: 'festivals', 'aria-labelledby': 'dv-fest-h' });
  sec.append(h('h2.dv-h2', { id: 'dv-fest-h', text: 'What your festivals ask for' }));
  if (!reqs.length) {
    sec.append(h('p.dv-blurb', {
      text: 'No festivals tracked yet. Add them on the short film’s festival step and each one '
          + 'appears here with the format it asks for.'
    }));
    sec.append(h('a.btn', { href: 'short.html#step-10', text: 'OPEN THE SUBMISSION TRACKER' }));
    return sec;
  }
  sec.append(h('p.dv-blurb', {
    text: 'Read from the submission tracker and the festival catalogue. A festival whose format '
        + 'the catalogue does not record says so — look it up on their page rather than guess.'
  }));
  const ul = h('ul.dv-fest-list');
  reqs.forEach((r) => {
    const li = h('li.dv-fest-row');
    li.append(h('strong', { text: r.festival }));
    li.append(h('span.dv-fest-status', { text: r.status }));
    li.append(h('span.dv-fest-fmt' + (r.format ? '' : '.is-unknown'), {
      text: r.format
        ? 'Format: ' + r.format + (r.maxLength ? ' · ' + r.maxLength : '')
        : (r.known ? 'Format not recorded in the catalogue' : 'Not in the catalogue — check their page')
    }));
    ul.append(li);
  });
  sec.append(ul);
  return sec;
}

function blueprintBlock(says) {
  if (!says.list && !says.plan) return null;
  const sec = h('section.dv-bp', { 'aria-labelledby': 'dv-bp-h' });
  sec.append(h('h2.dv-h2', { id: 'dv-bp-h', text: 'What the blueprint says' }));
  if (says.list) {
    sec.append(h('p.dv-bp-lab', { text: 'Who needs what, in which format — step 32' }));
    sec.append(h('blockquote.dv-bp-q', { text: says.list }));
  }
  if (says.plan) {
    sec.append(h('p.dv-bp-lab', { text: 'First screening, and the date you are working towards' }));
    sec.append(h('blockquote.dv-bp-q', { text: says.plan }));
  }
  sec.append(h('a.dv-bp-link', { href: 'feature.html#step-32', text: 'Edit on the blueprint' }));
  return sec;
}

/* ---- the page ------------------------------------------------ */

function render() {
  const format = projectFormat();
  const data = Deliverables.loadDeliverables();
  const all = Deliverables.listItems(format, data);
  const reqs = Deliverables.requirements();
  const asked = Deliverables.askedBy(reqs);
  const prog = Deliverables.progress(all);
  const shown = show === 'all' ? all : all.filter((i) => i.when === show || i.when === 'always');

  const main = h('main#main.dv-main');

  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Post · deliverables' }),
    h('h1.bd-title', { text: prog.complete ? 'Ready to deliver.' : 'Deliverables.' }),
    h('p.bd-deck', {
      text: 'The censor certificate, the subtitles, the DCP, the stills and the paper behind them, '
          + 'as one list. Tick what is done, mark what this film does not need, and the festival '
          + 'formats come from the tracker rather than from memory.'
    })
  ]));

  const stats = h('div.bd-stats.dv-stats');
  stats.append(stat(prog.done + ' / ' + prog.total, 'delivered'));
  stats.append(stat(String(prog.doing), 'in progress'));
  stats.append(stat(String(prog.skipped), 'not needed'));
  stats.append(stat(String(reqs.length), reqs.length === 1 ? 'festival tracked' : 'festivals tracked'));
  main.append(stats);

  const bp = blueprintBlock(blueprintSays());
  if (bp) main.append(bp);

  main.append(festivalBlock(reqs));

  /* The filter: who is asking. 'always' items stay under every
     filter, because any screening needs them. */
  const tools = h('div.dv-tools');
  const grp = h('div.dv-filters', { role: 'group', 'aria-label': 'Show items needed for' });
  [{ id: 'all', label: 'Everything' }].concat(WHEN).forEach((w) => {
    grp.append(h('button.btn.dv-filter' + (show === w.id ? '.is-on' : ''), {
      type: 'button', 'data-dv-action': 'show', 'data-show': w.id,
      'aria-pressed': String(show === w.id), text: w.label
    }));
  });
  tools.append(grp);
  main.append(tools);

  const list = h('div', { id: 'checklist' });
  Deliverables.groups().forEach((g) => {
    const sec = group(g, shown.filter((i) => i.group === g.id), asked);
    if (sec) list.append(sec);
  });
  const custom = shown.filter((i) => i.custom);
  const own = group({ id: 'custom', label: 'Your own', blurb: 'Anything a buyer or a festival asked for that the list above does not have.' }, custom, asked);
  if (own) list.append(own);
  main.append(list);

  const add = h('form.dv-add', { 'data-dv-form': 'custom', 'aria-label': 'Add your own deliverable' });
  add.append(h('input', { type: 'text', name: 'label', placeholder: 'Add a deliverable the list does not have', 'aria-label': 'New deliverable' }));
  const whenSel = h('select.bd-sel', { name: 'when', 'aria-label': 'Who asks for it' });
  WHEN.forEach((w) => whenSel.append(h('option', { value: w.id, text: w.label })));
  add.append(whenSel);
  add.append(h('button.btn', { type: 'submit', text: 'ADD' }));
  main.append(add);

  app.replaceChildren(main);
  after();
}

function after() {
  mountShell();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[deliverables] chrome', e); }
}

/* ---- events — delegated, no inline handlers ------------------ */

delegate(document, 'click', '[data-dv-action]', (e, el) => {
  const act = el.getAttribute('data-dv-action');
  if (act === 'show') { show = el.getAttribute('data-show') || 'all'; render(); return; }
  if (act === 'custom-del') { Deliverables.removeCustom(el.getAttribute('data-item')); render(); }
});

delegate(document, 'change', '[data-dv-field]', (e, el) => {
  const id = el.getAttribute('data-item');
  const key = el.getAttribute('data-dv-field');
  Deliverables.setItemState(id, { [key]: el.value });
  if (key === 'state') render();
});

/* A note saves as it is typed (UX audit H10): `change` alone lost
   everything since the field was entered to a reload or a closed tab.
   The store write only; the re-render stays on `change`. */
saveOnInput('[data-dv-field]', (el) => {
  Deliverables.setItemState(el.getAttribute('data-item'), { [el.getAttribute('data-dv-field')]: el.value });
});

delegate(document, 'submit', '[data-dv-form="custom"]', (e, form) => {
  e.preventDefault();
  const input = form.querySelector('input[name="label"]');
  const when = form.querySelector('select[name="when"]');
  if (Deliverables.addCustom(input.value, when && when.value)) {
    render();
    if (StudioUI.toastSuccess) StudioUI.toastSuccess('Added to the list');
  } else input.focus();
});

render();
