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
import '../styles/deliverables-tools.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import { saveOnInput } from '../lib/autosave.js';
import Deliverables, { STATES, WHEN } from '../lib/deliverables.js';
import { listScenes } from '../lib/scenes.js';
import { isIndia } from '../lib/region.js';
import { loadScript } from '../lib/script.js';
/* pdf.js, cbfc.js and cbfc-rules.json are only needed by the certification
   and dialogue tabs, so they load on demand, not in first paint. */
let PDF = null, Cbfc = null, CBFC_RULES = null, lazyP = null;
const needsLazy = () => tab === 'certification' || tab === 'dialogue-list';
function loadLazy() {
  return lazyP || (lazyP = Promise.all([
    import('../lib/pdf.js'), import('../lib/cbfc.js'), import('../data/cbfc-rules.json')
  ]).then(([p, c, r]) => { PDF = p.default; Cbfc = c.default; CBFC_RULES = r.default; }));
}
import { dialogueRows, toCSV, toSRT, REEL_MINUTES } from '../lib/dialogue-list.js';

const app = document.getElementById('app');

/* In memory, like every other page's view state. */
let show = 'all';   // 'all' | a WHEN id

/* Which tab. Read from the hash, so deliverables.html#certification
   and #dialogue-list land on their tab; anything else (#festivals,
   #checklist, a group's #g-…) is the checklist. Not stored. */
const TABS = [
  { id: 'checklist',     label: 'Checklist' },
  { id: 'certification', label: 'Certification' },
  { id: 'dialogue-list', label: 'Dialogue list' }
];
const tabFromHash = () => {
  const h = (typeof location !== 'undefined' ? location.hash : '').replace(/^#/, '');
  return TABS.some((t) => t.id === h && t.id !== 'checklist') ? h : 'checklist';
};
let tab = tabFromHash();

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
  if (item.tool && TOOL_LINK[item.tool]) {
    row.append(h('a.dv-tool', {
      href: '#' + item.tool, 'data-dv-action': 'tab', 'data-tab': item.tool,
      text: TOOL_LINK[item.tool]
    }));
  }

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

const TOOL_LINK = {
  'dialogue-list': 'Prepare the dialogue list and the subtitle skeleton',
  certification: 'Check the script for certification flags'
};

const fmtChecked = (iso) => {
  const d = new Date(String(iso || '') + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? String(iso || '') : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/* Where a streamer's or a rule's facts came from, and when they were
   checked. Links open the source; nothing here is paraphrased into a
   promise the source does not make. */
function sourceLine(src, urls, checked) {
  const p = h('p.dv-src');
  if (src) p.append(h('span', { text: 'Source: ' + src + ' ' }));
  if (checked) p.append(h('span.dv-src-date', { text: 'Checked ' + fmtChecked(checked) + '.' }));
  const list = (urls || []).filter(Boolean);
  if (list.length) {
    const ul = h('ul.dv-src-links');
    list.forEach((u) => {
      let host = u;
      try { host = new URL(u).hostname.replace(/^www\./, ''); } catch (e) { /* keep the URL */ }
      ul.append(h('li', {}, [h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: host })]));
    });
    p.append(ul);
  }
  return p;
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
  if (g.optional) sec.append(sourceLine(g.source, g.sourceUrls, g.checked));
  const list = h('div.dv-list');
  items.forEach((it) => list.append(itemRow(it, asked)));
  sec.append(list);
  return sec;
}

function festivalBlock(reqs, format) {
  const sec = h('section.dv-fest', { id: 'festivals', 'aria-labelledby': 'dv-fest-h' });
  sec.append(h('h2.dv-h2', { id: 'dv-fest-h', text: 'What your festivals ask for' }));
  if (!reqs.length) {
    /* The tracker has one home, the short film blueprint's step 10,
       and it is per project — so a feature's festivals go there too.
       On a feature that has to be SAID, or the link reads as a wrong
       turn into the other format's blueprint. */
    const feature = format === 'feature';
    sec.append(h('p.dv-blurb', {
      text: feature
        ? 'No festivals tracked yet. The submission tracker lives on the Short Film Blueprint’s '
          + 'festival step and keeps this project’s festivals whatever its format — add a '
          + 'feature’s festivals there and each one appears here with the format it asks for.'
        : 'No festivals tracked yet. Add them on the short film’s festival step and each one '
          + 'appears here with the format it asks for.'
    }));
    sec.append(h('a.btn', {
      href: 'short.html#step-10',
      text: feature ? 'OPEN THE SUBMISSION TRACKER (SHORT FILM BLUEPRINT)' : 'OPEN THE SUBMISSION TRACKER'
    }));
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

/* ---- tabs ------------------------------------------------------
   Three tabs, drawn here rather than by src/ui/tabs.js, whose page
   list is a UI decision this page is not on: the checklist is one
   long list with its own filter, and the other two are tools that
   READ the script. Nothing is removed from the document — a hidden
   tab is `hidden`, so its id still resolves. */
function tabStrip() {
  const nav = h('div.dv-tabs', { role: 'tablist', 'aria-label': 'Deliverables' });
  TABS.forEach((t) => {
    const on = tab === t.id;
    nav.append(h('button.dv-tab' + (on ? '.is-on' : ''), {
      type: 'button', role: 'tab', id: 'dv-tab-' + t.id,
      'aria-selected': String(on), 'aria-controls': t.id === 'checklist' ? 'dv-panel-checklist' : t.id,
      tabindex: on ? '0' : '-1', 'data-dv-action': 'tab', 'data-tab': t.id, text: t.label
    }));
  });
  return nav;
}

function switchTab(id, { focusTab = false } = {}) {
  if (!TABS.some((t) => t.id === id)) id = 'checklist';
  tab = id;
  try { history.replaceState(null, '', '#' + id); } catch (e) { /* file:// */ }
  render(focusTab ? '#dv-tab-' + id : null);
  if (!focusTab) window.scrollTo({ top: 0 });
}

/* ---- streamers: the optional groups --------------------------- */
function streamerBlock() {
  const opts = Deliverables.optionalGroups();
  if (!opts.length) return null;
  const sec = h('section.dv-ott', { id: 'streamers', 'aria-labelledby': 'dv-ott-h' });
  sec.append(h('h2.dv-h2', { id: 'dv-ott-h', text: 'Streamer checklists' }));
  sec.append(h('p.dv-blurb', {
    text: 'Switch on the platforms this film is going to and their delivery items join the list below. '
        + 'Netflix and Prime Video publish specifications; the others are templates to fill in from the '
        + 'sheet their team sends you. The platform’s own requirements for your title always win.'
  }));
  const ul = h('ul.dv-ott-list');
  opts.forEach((g) => {
    const id = 'dv-ott-' + g.id;
    const box = h('input', { type: 'checkbox', id, 'data-dv-group': g.id });
    box.checked = g.on;
    ul.append(h('li.dv-ott-row', {}, [
      box,
      h('label', { for: id }, [
        h('span.dv-ott-name', { text: g.label.replace(/ — delivery template$/, '') }),
        h('span.dv-ott-kind' + (g.published ? '' : '.is-template'), {
          text: g.published ? 'published spec · checked ' + fmtChecked(g.checked) : 'no published spec — template'
        })
      ])
    ]));
  });
  sec.append(ul);
  return sec;
}

/* ---- certification -------------------------------------------- */
const KIND_LABEL = { requirement: 'Requirement', review: 'For the committee', caution: 'Legal caution' };
const CONFIDENCE_LABEL = {
  official: 'Read on the regulator’s own site.',
  secondary: 'Read from reports of the official text, not the text itself.',
  uncertain: 'Uncertain — reported, not confirmed.'
};
const TYPE_LABEL = { dialogue: 'dialogue', action: 'action', heading: 'heading', paren: 'parenthetical', synopsis: 'scene synopsis', elements: 'breakdown tag' };

function certificationPanel(build) {
  const sec = h('section#certification.dv-panel.dv-cert', { role: 'tabpanel', 'aria-labelledby': 'dv-tab-certification', 'data-tab-label': 'Certification' });
  if (!build) { sec.hidden = true; return sec; }

  /* INDIA ONLY (§31 region mode). Every rule behind this tab is an
     Indian statute — the CBFC's examining guidelines, COTPA's tobacco
     warnings, the AWBI's animal permission, the Emblems Act. None of
     it is advice anywhere else, and a certification checklist that
     cites the wrong country's regulator is worse than no checklist.

     The SECTION STAYS, with its id, its tab and a sentence saying why
     it is empty, rather than vanishing: tabs.js builds the strip from
     the sections present, a fragment target that disappears is the
     trap CLAUDE.md already names, and "this tool is not for you" is
     better said than implied by an absence.

     There is no equivalent for other markets and none is invented
     here. The MPA, the BBFC and Eirin are three different regimes with
     three different procedures, and writing a plausible-looking
     checklist for one of them from memory is exactly the kind of
     confident wrongness this file's sources exist to prevent. */
  if (!isIndia()) {
    sec.append(h('h2.dv-h2', { text: 'Certification flags' }));
    sec.append(h('p.dv-blurb', {
      text: 'These checks read a script against Indian certification law — the CBFC\u2019s examining '
          + 'guidelines, the COTPA tobacco warnings, the AWBI\u2019s animal permission. Your studio is '
          + 'set to International, so they are off: they would cite a regulator that has no say over '
          + 'your film. Nothing equivalent is offered for other countries yet, because getting it wrong '
          + 'would be worse than leaving it out. Switch to India in Settings if you are certifying here.'
    }));
    return sec;
  }

  sec.append(h('h2.dv-h2', { text: 'Certification flags' }));
  sec.append(h('p.dv-blurb', {
    text: 'Every scene read against the things a CBFC application will ask about: the tobacco and drug '
        + 'warnings, the AWBI permission for animals, child artists, national symbols and uniforms, and '
        + 'the content the examining committee weighs. A word search, rule by rule, with the line each '
        + 'flag came from. No AI.'
  }));
  sec.append(h('p.dv-cert-disclaimer', { role: 'note', text: Cbfc.DISCLAIMER }));

  const scenes = listScenes();
  const elements = loadScript().elements;
  if (!scenes.length && !elements.some((e) => e.type === 'scene')) {
    sec.append(h('p.bd-none', { text: 'No scenes and no script yet. Write or import the script and every scene is read here.' }));
    return sec;
  }
  const rep = Cbfc.certificationReport(scenes, elements);

  /* The hint — labelled as one in its heading, its body and its foot. */
  const meaning = (CBFC_RULES.ratings.find((r) => r.id === rep.hint.rating) || {}).means || '';
  const hint = h('div.dv-hint', { 'aria-labelledby': 'dv-hint-h' });
  hint.append(h('p.dv-hint-eyebrow', { id: 'dv-hint-h', text: 'Likely rating — a hint, not advice' }));
  hint.append(h('p.dv-hint-rating', { text: rep.hint.rating }));
  if (meaning) hint.append(h('p.dv-hint-means', { text: meaning }));
  hint.append(h('p.dv-hint-why', {
    text: rep.hint.reasons.length
      ? 'Because of: ' + rep.hint.reasons.map((r) => r.label.toLowerCase() + ' (' + r.tier + ', '
          + r.scenes + (r.scenes === 1 ? ' scene' : ' scenes') + ')').join('; ') + '.'
      : 'Nothing in the word lists that this app associates with a higher category.'
  }));
  hint.append(h('p.dv-hint-foot', {
    text: 'The app’s own heuristic over the words above — the Board certifies the finished film as a whole, '
        + 'and how a scene is shot moves it more than what the page says. Categories: '
        + CBFC_RULES.ratings.map((r) => r.label).join(', ') + '.'
  }));
  hint.append(sourceLine(CBFC_RULES.ratingsSource.source, CBFC_RULES.ratingsSource.sourceUrls, CBFC_RULES.ratingsSource.checked));
  sec.append(hint);

  sec.append(h('div.bd-stats.dv-stats', {}, [
    stat(rep.flagged + ' / ' + rep.scanned.scenes, 'scenes flagged'),
    stat(String(rep.byRule.filter((b) => b.kind === 'requirement').length), 'requirements to act on'),
    stat(rep.scanned.fromScript + ' / ' + rep.scanned.scenes, 'read from the script')
  ]));

  /* What to do, rule by rule — the rules that fired first, then the
     ones that found nothing, rendered rather than dropped (a list of
     only failures reads the same when the check stopped running). */
  sec.append(h('h3.dv-h3', { text: 'What the flags mean, and what to do' }));
  const fired = new Set(rep.byRule.map((b) => b.rule.id));
  const list = h('div.dv-rules');
  rep.byRule.forEach((b) => list.append(ruleCard(b)));
  sec.append(list);
  const quiet = Cbfc.rules().filter((r) => !fired.has(r.id));
  if (quiet.length) {
    sec.append(h('p.dv-quiet', { text: 'Nothing found for: ' + quiet.map((r) => r.label.toLowerCase()).join('; ') + '.' }));
  }
  sec.append(h('p.dv-src', { text: CBFC_RULES.guidelinesNote.text }));
  sec.append(h('p.dv-src', {
    text: 'The Tamil and Tanglish words are romanised STARTER lists — common terms only, nowhere near complete. '
        + 'A word the list does not know is not flagged; read the script yourself.'
  }));

  /* Scene by scene. */
  sec.append(h('h3.dv-h3', { id: 'dv-cert-scenes', text: 'Scene by scene' }));
  const flaggedRows = rep.rows.filter((r) => r.flags.length);
  if (!flaggedRows.length) sec.append(h('p.bd-none', { text: 'No scene matched any rule.' }));
  const ol = h('ol.dv-cert-scenes');
  flaggedRows.forEach((row) => {
    const li = h('li.dv-cert-scene');
    li.append(h('p.dv-cert-slug', {}, [
      h('strong', { text: (row.scene ? 'Scene ' : 'Heading ') + row.number }),
      h('span', { text: ' ' + row.heading + (row.scene ? '' : ' (no scene row on the breakdown)') })
    ]));
    const flags = h('ul.dv-cert-flags');
    row.flags.forEach((f) => {
      const terms = [...new Set(f.hits.map((x) => x.term.toLowerCase()))];
      const item = h('li.dv-flag.is-' + f.kind);
      item.append(h('span.dv-flag-kind', { text: KIND_LABEL[f.kind] || f.kind }));
      item.append(h('span.dv-flag-label', { text: f.label + (f.hint ? ' · hint ' + f.hint : '') }));
      item.append(h('span.dv-flag-terms', { text: terms.slice(0, 6).join(', ') + (terms.length > 6 ? ', …' : '') }));
      const ev = f.hits.slice(0, 2).map((x) => h('q.dv-flag-from', { text: x.from, title: TYPE_LABEL[x.type] || x.type }));
      if (ev.length) item.append(h('span.dv-flag-ev', {}, ev));
      flags.append(item);
    });
    li.append(flags);
    ol.append(li);
  });
  sec.append(ol);
  return sec;
}

function ruleCard(b) {
  const r = b.rule;
  const card = h('article.dv-rule.is-' + b.kind, { 'aria-labelledby': 'dv-rule-' + r.id });
  const head = h('div.dv-head');
  head.append(h('h4.dv-label', { id: 'dv-rule-' + r.id, text: r.label }));
  head.append(h('span.dv-when', { text: KIND_LABEL[b.kind] || b.kind }));
  card.append(head);
  const nums = b.scenes.map((row) => row.number);
  card.append(h('p.dv-asked', {
    text: (b.scenes.length === 1 ? '1 scene: ' : b.scenes.length + ' scenes: ')
      + nums.slice(0, 12).join(', ') + (nums.length > 12 ? ', …' : '')
  }));
  card.append(h('p.dv-why', { text: r.what }));
  if (Array.isArray(r.do) && r.do.length) {
    const ul = h('ul.dv-do');
    r.do.forEach((d) => ul.append(h('li', { text: d })));
    card.append(ul);
  }
  card.append(sourceLine(r.source, r.sourceUrls, r.checked));
  const conf = CONFIDENCE_LABEL[r.confidence];
  if (conf || r.uncertain) {
    card.append(h('p.dv-uncertain', { text: [conf, r.uncertain ? 'Check: ' + r.uncertain : ''].filter(Boolean).join(' ') }));
  }
  return card;
}

/* ---- dialogue list --------------------------------------------- */
function dialogueData() {
  return dialogueRows(loadScript().elements, listScenes(), { reelMinutes: REEL_MINUTES });
}

function dialoguePanel(build) {
  const sec = h('section#dialogue-list.dv-panel.dv-dl', { role: 'tabpanel', 'aria-labelledby': 'dv-tab-dialogue-list', 'data-tab-label': 'Dialogue list' });
  if (!build) { sec.hidden = true; return sec; }
  sec.append(h('h2.dv-h2', { text: 'Dialogue list and subtitle prep' }));
  sec.append(h('p.dv-blurb', {
    text: 'Every spoken line in the script, numbered, with its reel, scene, character and parenthetical — '
        + 'the original line beside an empty English column for the translator. Read from the script '
        + 'every time you open it, so it is never out of date.'
  }));
  const dl = dialogueData();
  if (!dl.rows.length) {
    sec.append(h('p.bd-none', { text: 'No dialogue in the script yet. Write or import the script, and every line is listed here.' }));
    return sec;
  }
  sec.append(h('div.bd-stats.dv-stats', {}, [
    stat(String(dl.rows.length), dl.rows.length === 1 ? 'line' : 'lines'),
    stat(String(dl.scenes), dl.scenes === 1 ? 'scene with dialogue' : 'scenes with dialogue'),
    stat(String(dl.speakers), dl.speakers === 1 ? 'speaking part' : 'speaking parts'),
    stat(String(dl.reels), 'reels, estimated')
  ]));
  sec.append(h('div.dv-dl-actions', {}, [
    h('button.btn', { type: 'button', 'data-dv-action': 'dl-csv', text: 'DOWNLOAD CSV' }),
    h('button.btn', { type: 'button', 'data-dv-action': 'dl-srt', text: 'DOWNLOAD SRT SKELETON' }),
    h('button.btn', { type: 'button', 'data-dv-action': 'dl-print', text: 'PRINT OR SAVE AS PDF' })
  ]));
  const notes = h('ul.dv-dl-notes');
  notes.append(h('li', { text: 'The CSV opens in Excel or Google Sheets with Tamil script intact (UTF-8). The English column is empty, for the translator.' }));
  notes.append(h('li', { text: 'The SRT is a skeleton: one numbered cue per line, every timecode 00:00:00,000 --> 00:00:00,000, for a subtitler to time against the locked picture. Do not play it.' }));
  notes.append(h('li', { text: 'Reels are estimated, at ' + REEL_MINUTES + ' minutes each, from the screen-time estimate on the Reports page. A digital film has no physical reels; this is where each scene would fall.' }));
  notes.append(h('li', {
    text: 'For certification: summaries of the Cinematograph (Certification) Rules, 2024 say the e-Cinepramaan '
        + 'application carries the script including the full text of the songs. We could not find a prescribed '
        + 'dialogue-list template, so the printable list uses the conventional layout (reel, scene, character, '
        + 'line, translation). Check what your regional office wants. Song lyrics are listed only if they are '
        + 'written as dialogue in the script.'
  }));
  sec.append(notes);
  sec.append(sourceLine('', CBFC_RULES.ratingsSource.sourceUrls, CBFC_RULES.ratingsSource.checked));

  const PREVIEW = 30;
  sec.append(h('h3.dv-h3', { text: dl.rows.length > PREVIEW ? 'The first ' + PREVIEW + ' lines' : 'The lines' }));
  const ol = h('ol.dv-dl-list');
  dl.rows.slice(0, PREVIEW).forEach((r) => {
    ol.append(h('li.dv-dl-row', {}, [
      h('span.dv-dl-meta', { text: r.n + ' · reel ' + r.reel + (r.scene ? ' · scene ' + r.scene : ' · before the first scene') }),
      h('span.dv-dl-who', { text: (r.character || 'NO CUE') + (r.parenthetical ? ' (' + r.parenthetical + ')' : '') }),
      h('span.dv-dl-line', { text: r.line })
    ]));
  });
  sec.append(ol);
  if (dl.rows.length > PREVIEW) sec.append(h('p.dv-blurb', { text: 'The download and the printed list carry all ' + dl.rows.length + '.' }));
  return sec;
}

/* The printable list, built for the print job and removed after it. */
function dialoguePrintSheet(dl) {
  const wrap = h('div#dv-dl-print.dv-dl-print');
  const t = h('table.dv-dl-table');
  t.append(h('thead', {}, [h('tr', {}, ['No.', 'Reel', 'Sc.', 'TC in', 'Character', 'Dialogue — original', 'English']
    .map((x) => h('th', { scope: 'col', text: x })))]));
  const body = h('tbody');
  let scene = null;
  dl.rows.forEach((r) => {
    if (r.scene !== scene) {
      scene = r.scene;
      body.append(h('tr.dv-dl-scene', {}, [h('td', { colspan: '7', text: (r.scene ? 'Scene ' + r.scene + ' — ' : '') + (r.heading || 'Before the first scene') })]));
    }
    body.append(h('tr', {}, [
      h('td', { text: String(r.n) }), h('td', { text: String(r.reel) }), h('td', { text: r.scene }), h('td', { text: '' }),
      h('td', { text: r.character + (r.parenthetical ? ' (' + r.parenthetical + ')' : '') }),
      h('td.dv-dl-orig', { text: r.line }), h('td', { text: '' })
    ]));
  });
  t.append(body);
  wrap.append(t);
  return wrap;
}

function fileBase() {
  return (PDF.projectTitle() || 'film').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'film';
}
function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---- the page ------------------------------------------------ */

/* `focus` is a selector for the control to hand focus back to after
   the full render replaces it (UX audit M1; visualize.js's pattern). */
function render(focus) {
  if (needsLazy() && !PDF) { loadLazy().then(() => renderNow(focus)); return; }
  renderNow(focus);
}
function renderNow(focus) {
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

  main.append(tabStrip());

  /* The checklist tab: everything this page was before the other two
     arrived, in the same order, under the same ids. */
  const panel = h('div#dv-panel-checklist.dv-panel', { role: 'tabpanel', 'aria-labelledby': 'dv-tab-checklist' });
  if (tab !== 'checklist') panel.hidden = true;

  const bp = blueprintBlock(blueprintSays());
  if (bp) panel.append(bp);

  panel.append(festivalBlock(reqs, format));
  panel.append(streamerBlock());

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
  panel.append(tools);

  const list = h('div', { id: 'checklist' });
  Deliverables.groups().forEach((g) => {
    const sec = group(g, shown.filter((i) => i.group === g.id), asked);
    if (sec) list.append(sec);
  });
  const custom = shown.filter((i) => i.custom);
  const own = group({ id: 'custom', label: 'Your own', blurb: 'Anything a buyer or a festival asked for that the list above does not have.' }, custom, asked);
  if (own) list.append(own);
  panel.append(list);

  const add = h('form.dv-add', { 'data-dv-form': 'custom', 'aria-label': 'Add your own deliverable' });
  add.append(h('input', { type: 'text', name: 'label', placeholder: 'Add a deliverable the list does not have', 'aria-label': 'New deliverable' }));
  const whenSel = h('select.bd-sel', { name: 'when', 'aria-label': 'Who asks for it' });
  WHEN.forEach((w) => whenSel.append(h('option', { value: w.id, text: w.label })));
  add.append(whenSel);
  add.append(h('button.btn', { type: 'submit', text: 'ADD' }));
  panel.append(add);
  main.append(panel);

  /* The other two tabs are built only when shown: the certification
     scan reads the whole script, and a checklist tick should not pay
     for it. Their sections exist either way, so the hash resolves. */
  main.append(certificationPanel(tab === 'certification'));
  main.append(dialoguePanel(tab === 'dialogue-list'));

  app.replaceChildren(main);
  after(focus);
}

function after(focus) {
  if (focus) {
    const node = document.querySelector(focus);
    if (node) node.focus();
  }
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
  if (act === 'tab') {
    e.preventDefault();
    switchTab(el.getAttribute('data-tab'), { focusTab: el.getAttribute('role') === 'tab' });
    return;
  }
  if (act === 'dl-csv') {
    download(fileBase() + '-dialogue-list.csv', toCSV(dialogueData()), 'text/csv;charset=utf-8');
    return;
  }
  if (act === 'dl-srt') {
    download(fileBase() + '-subtitle-skeleton.srt', toSRT(dialogueData()), 'application/x-subrip;charset=utf-8');
    return;
  }
  if (act === 'dl-print') {
    const dl = dialogueData();
    let sheet = null;
    PDF.exportPDF({
      scope: 'dialogue', setup: 'a4', label: 'Dialogue list', classes: ['dv-print-dl'],
      subtitle: dl.rows.length + ' lines · ' + dl.scenes + ' scenes · reels estimated at ' + REEL_MINUTES + ' minutes',
      before: () => { sheet = dialoguePrintSheet(dl); (document.getElementById('main') || document.body).append(sheet); },
      after: () => { if (sheet) sheet.remove(); }
    });
    return;
  }
  if (act === 'show') {
    show = el.getAttribute('data-show') || 'all';
    render('[data-dv-action="show"][data-show="' + show + '"]');
    return;
  }
  if (act === 'custom-del') {
    /* Your own line, with its status and note: an Undo puts back all
       three, at the place it held (UX audit L16). */
    const id = el.getAttribute('data-item');
    const snap = Deliverables.takeCustom(id);
    render('[data-dv-form="custom"] input[name="label"]');
    if (snap && StudioUI.toast) {
      StudioUI.toast('Removed: ' + snap.custom.label, {
        action: 'Undo',
        onAction: () => { Deliverables.putCustomBack(snap); render(); }
      });
    }
  }
});

/* Arrow keys, Home and End across the tabs (WAI-ARIA tabs pattern). */
delegate(document, 'keydown', '.dv-tabs [role="tab"]', (e, el) => {
  const ids = TABS.map((t) => t.id);
  const i = ids.indexOf(el.getAttribute('data-tab'));
  let j = -1;
  if (e.key === 'ArrowRight') j = (i + 1) % ids.length;
  else if (e.key === 'ArrowLeft') j = (i - 1 + ids.length) % ids.length;
  else if (e.key === 'Home') j = 0;
  else if (e.key === 'End') j = ids.length - 1;
  if (j < 0) return;
  e.preventDefault();
  switchTab(ids[j], { focusTab: true });
});

delegate(document, 'change', '[data-dv-group]', (e, el) => {
  const id = el.getAttribute('data-dv-group');
  Deliverables.setGroupOn(id, el.checked);
  render('[data-dv-group="' + CSS.escape(id) + '"]');
});

/* A link from elsewhere (the phase menu, a pasted URL) changes the
   hash; the tab follows it. */
window.addEventListener('hashchange', () => {
  const next = tabFromHash();
  if (next !== tab) { tab = next; render(); }
});

delegate(document, 'change', '[data-dv-field]', (e, el) => {
  const id = el.getAttribute('data-item');
  const key = el.getAttribute('data-dv-field');
  Deliverables.setItemState(id, { [key]: el.value });
  if (key === 'state') render('[data-dv-field="state"][data-item="' + CSS.escape(id) + '"]');
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
