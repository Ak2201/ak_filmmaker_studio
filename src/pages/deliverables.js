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
import '../lib/store.js';          /* FIRST — it patches Storage.prototype. */
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
import { h, delegate, download } from '../lib/dom.js';
import { pageEntry } from '../lib/navmodel.js';
import { saveOnInput } from '../lib/autosave.js';
import Deliverables, { STATES, WHEN } from '../lib/deliverables.js';
import { LINK_KINDS, guessKind, linkText } from '../lib/links.js';
import { listScenes } from '../lib/scenes.js';
import { filmRegion } from '../lib/film-region.js';   // = region.js currentProjectPrefs(); film-region.js says why
import { loadScript } from '../lib/script.js';
import {
  blueprintSays, projectFormat, TABS, tabFromHash as tabOf, tabForKey, shownItems, TOOL_LINK, fmtChecked, hostOf,
  festivalFormat, streamerKind, KIND_LABEL, TYPE_LABEL, hintWhy, flagTerms, ruleScenes, ruleCertainty,
  dialogueData, dialogueMeta, dialogueWho, dialogueSubtitle, fileBase as fileBaseOf
} from '../lib/deliverables-model.js';
import { guideHref } from '../lib/blueprint-route.js';
import { pageHeader, statCard, statStrip, badge, button } from '../ui/kit/index.js';
/* pdf.js, cbfc.js and cbfc-rules.json are only needed by the certification
   and dialogue tabs, so they load on demand, not in first paint. */
let PDF = null, Cbfc = null, CBFC_RULES = null, lazyP = null;
const needsLazy = () => tab === 'certification' || tab === 'dialogue-list';
function loadLazy() {
  return lazyP || (lazyP = Promise.all([
    import('../lib/pdf.js'), import('../lib/cbfc.js'), import('../data/cbfc-rules.json')
  ]).then(([p, c, r]) => { PDF = p.default; Cbfc = c.default; CBFC_RULES = r.default; }));
}
import { toCSV, toSRT, REEL_MINUTES } from '../lib/dialogue-list.js';

const app = document.getElementById('app');

/* In memory, like every other page's view state. */
let show = 'all';   // 'all' | a WHEN id

/* Which tab. Read from the hash, so deliverables.html#certification
   and #dialogue-list land on their tab; anything else (#festivals,
   #checklist, a group's #g-…) is the checklist. Not stored. */
/* TABS, the hash rule and the blueprint read are src/lib/deliverables-model.js's. */
const tabFromHash = () => tabOf(typeof location !== 'undefined' ? location.hash : '');
let tab = tabFromHash();

/* ---- pieces -------------------------------------------------- */

function stat(num, label) {
  return statCard({ label, value: num });
}
const statRow = (items, label) => statStrip(items, { class: 'dv-stats', label });

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

/* Where this item's files live — addresses only, the studio stores no
   media. Anchors open in a new tab without handing over window.opener. */
function linksBlock(item) {
  const box = h('div.dv-links');
  const links = item.links || [];
  if (links.length) {
    const ul = h('ul.dv-link-list');
    links.forEach((l) => {
      ul.append(h('li.dv-link', {}, [
        h('a.dv-link-a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', text: linkText(l), title: l.url }),
        h('button.bd-icon.dv-link-x', {
          type: 'button', 'data-dv-action': 'link-del', 'data-item': item.id, 'data-link': l.id,
          'aria-label': 'Remove link ' + linkText(l) + ' from ' + item.label, text: '×'
        })
      ]));
    });
    box.append(ul);
  }
  const form = h('form.dv-link-form', { 'data-dv-form': 'link', 'data-item': item.id, novalidate: '' });
  const kind = h('select.bd-sel', { name: 'kind', 'aria-label': 'Where it is kept: ' + item.label });
  LINK_KINDS.forEach((k) => kind.append(h('option', { value: k.id, text: k.label })));
  kind.value = 'other';
  form.append(
    h('input.dv-link-url', { type: 'url', name: 'url', placeholder: 'https://…', autocomplete: 'off', 'aria-label': 'Link address: ' + item.label, 'data-dv-linkurl': '' }),
    kind,
    h('input.dv-link-label', { type: 'text', name: 'label', maxlength: '80', placeholder: 'Label (optional)', 'aria-label': 'Link label: ' + item.label }),
    h('button.k-btn.k-btn--sm.dv-link-go', { type: 'submit', text: 'Add' }),
    h('p.dv-link-why', { role: 'alert', hidden: '' })
  );
  box.append(h('details.dv-link-add', {}, [
    h('summary', { 'data-item': item.id, text: 'Add link' }),
    form
  ]));
  return box;
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
  row.append(linksBlock(item));
  return row;
}

/* TOOL_LINK and fmtChecked are src/lib/deliverables-model.js's. */

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
      ul.append(h('li', {}, [h('a', { href: u, target: '_blank', rel: 'noopener noreferrer', text: hostOf(u) })]));
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
        ? 'No festivals tracked yet. Every format keeps its festivals in the Short Film Blueprint’s tracker.'
        : 'No festivals tracked yet. Add them on the short film’s festival step and each one '
          + 'appears here with the format it asks for.'
    }));
    /* A stage guide shows the OPEN project's format, so on a feature
       guideHref('short', …) opened the Feature questions for post and
       no tracker. The retired short page, kept behind ?stay=1, is the
       one place a feature can reach the short film's festival step. */
    sec.append(h('p.dv-fest-go', {}, [button({
      label: feature ? 'Add festivals' : 'Open the submission tracker',
      iconAfter: 'arrow_forward',
      href: feature ? 'short.html?stay=1#step-10' : (guideHref('short', 'step-10') || 'edit.html#guide')
    })]));
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
    li.append(h('span.dv-fest-fmt' + (r.format ? '' : '.is-unknown'), { text: festivalFormat(r) }));
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
  sec.append(h('a.dv-bp-link', { href: guideHref('feature', 'step-32') || 'edit.html#guide', text: 'Edit on the blueprint' }));
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
      tabindex: on ? '0' : '-1', 'data-dv-action': 'tab', 'data-tab': t.id,
      /* the rail's label for this tab (navigation.json: the Deliverables
         module and its sections), so the flyout and the strip agree */
      text: (pageEntry('deliverables.html', t.id) || t).label
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
        h('span.dv-ott-kind' + (g.published ? '' : '.is-template'), { text: streamerKind(g) })
      ])
    ]));
  });
  sec.append(ul);
  return sec;
}

/* ---- certification -------------------------------------------- */
/* KIND_LABEL, CONFIDENCE_LABEL and TYPE_LABEL are src/lib/deliverables-model.js's. */

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
  const prefs = filmRegion();
  if (!prefs.showIndiaContent) {
    /* The film's own region decides when it has one (REGION-CONTENT);
       a film that predates regions follows the device, as before. */
    sec.append(h('h2.dv-h2', { text: 'Certification flags' }));
    sec.append(h('p.dv-blurb', {
      text: 'These checks read a script against Indian certification law — the CBFC\u2019s examining '
          + 'guidelines, the COTPA tobacco warnings, the AWBI\u2019s animal permission. '
          + (prefs.explicit
            ? 'This film is set to be made outside India, so they are off: '
            : 'Your studio is set to International, so they are off: ')
          + 'they would cite a regulator that has no say over '
          + 'your film. Nothing equivalent is offered for other countries yet, because getting it wrong '
          + 'would be worse than leaving it out. '
          + (prefs.explicit
            ? 'Set the film to India on the dashboard\u2019s Title page card if you are certifying here.'
            : 'Switch to India in Settings if you are certifying here.')
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
  hint.append(h('p.dv-hint-why', { text: hintWhy(rep.hint) }));
  hint.append(h('p.dv-hint-foot', {
    text: 'The app’s own heuristic over the words above — the Board certifies the finished film as a whole, '
        + 'and how a scene is shot moves it more than what the page says. Categories: '
        + CBFC_RULES.ratings.map((r) => r.label).join(', ') + '.'
  }));
  hint.append(sourceLine(CBFC_RULES.ratingsSource.source, CBFC_RULES.ratingsSource.sourceUrls, CBFC_RULES.ratingsSource.checked));
  sec.append(hint);

  sec.append(statRow([
    stat(rep.flagged + ' / ' + rep.scanned.scenes, 'scenes flagged'),
    stat(String(rep.byRule.filter((b) => b.kind === 'requirement').length), 'requirements to act on'),
    stat(rep.scanned.fromScript + ' / ' + rep.scanned.scenes, 'read from the script')
  ], 'Content check figures'));

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
      const item = h('li.dv-flag.is-' + f.kind);
      item.append(h('span.dv-flag-kind', { text: KIND_LABEL[f.kind] || f.kind }));
      item.append(h('span.dv-flag-label', { text: f.label + (f.hint ? ' · hint ' + f.hint : '') }));
      item.append(h('span.dv-flag-terms', { text: flagTerms(f) }));
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
  card.append(h('p.dv-asked', { text: ruleScenes(b) }));
  card.append(h('p.dv-why', { text: r.what }));
  if (Array.isArray(r.do) && r.do.length) {
    const ul = h('ul.dv-do');
    r.do.forEach((d) => ul.append(h('li', { text: d })));
    card.append(ul);
  }
  card.append(sourceLine(r.source, r.sourceUrls, r.checked));
  const certainty = ruleCertainty(r);
  if (certainty) card.append(h('p.dv-uncertain', { text: certainty }));
  return card;
}

/* ---- dialogue list --------------------------------------------- */
/* dialogueData() is src/lib/deliverables-model.js's. */
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
  sec.append(statRow([
    stat(String(dl.rows.length), dl.rows.length === 1 ? 'line' : 'lines'),
    stat(String(dl.scenes), dl.scenes === 1 ? 'scene with dialogue' : 'scenes with dialogue'),
    stat(String(dl.speakers), dl.speakers === 1 ? 'speaking part' : 'speaking parts'),
    stat(String(dl.reels), 'reels, estimated')
  ], 'Dialogue list figures'));
  sec.append(h('div.dv-dl-actions', {}, [
    h('button.k-btn', { type: 'button', 'data-dv-action': 'dl-csv', text: 'Download CSV' }),
    h('button.k-btn', { type: 'button', 'data-dv-action': 'dl-srt', text: 'Download SRT skeleton' }),
    h('button.k-btn', { type: 'button', 'data-dv-action': 'dl-print', text: 'Print or save as PDF' })
  ]));
  const notes = h('ul.dv-dl-notes');
  notes.append(h('li', { text: 'The CSV opens in Excel or Google Sheets with Tamil script intact (UTF-8). The English column is empty, for the translator.' }));
  notes.append(h('li', { text: 'The SRT is a skeleton: one numbered cue per line, every timecode 00:00:00,000 --> 00:00:00,000, for a subtitler to time against the locked picture. Do not play it.' }));
  notes.append(h('li', { text: 'Reels are estimated, at ' + REEL_MINUTES + ' minutes each, from the screen-time estimate on the Production Reports page. A digital film has no physical reels; this is where each scene would fall.' }));
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
      h('span.dv-dl-meta', { text: dialogueMeta(r) }),
      h('span.dv-dl-who', { text: dialogueWho(r) }),
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
  return fileBaseOf(PDF.projectTitle());
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
  const shown = shownItems(all, show);

  const main = h('main#main.dv-main.k-page');

  /* ONE PAGE FRAME: the h1 is the page's name; "ready to deliver" is a
     state, a badge under it. */
  main.append(pageHeader({
    eyebrow: ['Post', 'Deliverables'],
    title: 'Deliverables',
    class: 'bd-head',
    meta: prog.complete ? [badge({ label: 'Ready to deliver', tone: 'ok', tag: true })] : [],
    sub: 'The censor certificate, the subtitles, the DCP, the stills and the paper behind them, '
       + 'as one list. Tick what is done, mark what this film does not need, and the festival '
       + 'formats come from the tracker rather than from memory.'
  }));

  main.append(statRow([
    stat(prog.done + ' / ' + prog.total, 'delivered'),
    stat(String(prog.doing), 'in progress'),
    stat(String(prog.skipped), 'not needed'),
    stat(String(reqs.length), reqs.length === 1 ? 'festival tracked' : 'festivals tracked')
  ], 'Deliverables figures'));

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
    grp.append(h('button.k-btn.k-btn--sm.dv-filter' + (show === w.id ? '.is-on' : ''), {
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
  add.append(h('button.k-btn.k-btn--sm', { type: 'submit', text: 'Add' }));
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
      subtitle: dialogueSubtitle(dl),
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
  if (act === 'link-del') {
    const id = el.getAttribute('data-item');
    const before = Deliverables.itemState(id).links;
    const r = Deliverables.removeItemLink(id, el.getAttribute('data-link'));
    if (!r.removed) return;
    render('summary[data-item="' + CSS.escape(id) + '"]');
    if (StudioUI.toast) {
      StudioUI.toast('Link removed', {
        action: 'Undo',
        onAction: () => { Deliverables.setItemState(id, { links: before }); render(); }
      });
    }
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
  const to = tabForKey(el.getAttribute('data-tab'), e.key);
  if (!to) return;
  e.preventDefault();
  switchTab(to, { focusTab: true });
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

/* The kind follows the address until the person picks one themselves. */
delegate(document, 'input', '[data-dv-linkurl]', (e, el) => {
  const sel = el.form && el.form.querySelector('select[name="kind"]');
  if (sel && !sel.dataset.touched) sel.value = guessKind(el.value.trim());
});
delegate(document, 'change', '.dv-link-form select[name="kind"]', (e, el) => { el.dataset.touched = '1'; });

delegate(document, 'submit', '[data-dv-form="link"]', (e, form) => {
  e.preventDefault();
  const id = form.getAttribute('data-item');
  const why = form.querySelector('.dv-link-why');
  const r = Deliverables.addItemLink(id, {
    url: form.querySelector('[name="url"]').value,
    kind: form.querySelector('[name="kind"]').value,
    label: form.querySelector('[name="label"]').value
  });
  const urlField = form.querySelector('[name="url"]');
  if (r.why) {
    why.textContent = r.why;
    why.hidden = false;
    urlField.setAttribute('aria-invalid', 'true');
    urlField.focus();
    return;
  }
  render('summary[data-item="' + CSS.escape(id) + '"]');
  if (StudioUI.toastSuccess) StudioUI.toastSuccess('Link added');
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
