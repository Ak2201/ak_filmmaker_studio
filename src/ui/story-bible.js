/* ============================================================
   STORY BIBLE — the path's third step
   ------------------------------------------------------------
   Five cards about the film as a whole: Characters, Conflict, Stakes,
   Theme, World. One card at a time with Back / Next card, or every
   card on one page ("See all") for a writer who knows what they want.
   Nothing here is required and nothing is hidden for good: a card's
   tick only means it has something in it.

   WHERE EACH ANSWER LIVES — it is stored once, and not here.
     Characters       src/lib/characters.js (`fms_characters_v1`); for the
                      protagonist, antagonist and the ally / love
                      interest / mentor, the blueprint's own answers
     Conflict         the story model (`fms_story_v1`: `conflicts`,
                      `conflictLine`)
     Stakes, Theme,   the blueprint blobs, through blueprint-store.js
     World            (merge-write: a key not named is never touched).
                      Which keys: src/data/story-bible.json `map`.
   So a writer who filled the blueprint first sees their answers here,
   and one who fills them here finds them in the blueprint.

   WRITES happen on a user event only — a keystroke schedules one
   400ms later (autosave.js), a blur runs it now, pagehide flushes —
   so an idle page writes nothing. The page's own re-render is not
   used for a card: a card is redrawn in place, so the caret and the
   open sections stay where they are.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { saveOnInput } from '../lib/autosave.js';
import * as Story from '../lib/story.js';
import { readFields, writeFields } from '../lib/blueprint-store.js';
import { loadCharacters, saveCharacters, buildRoster, rosterStats, projectFormat, roleLabel } from '../lib/characters.js';
import { loadScript } from '../lib/script.js';
import { listContacts } from '../lib/contacts.js';
import { renderCharacterSections, displayName, statsText, learnFor, newCharacter, flushCardEdits, onCardInput, onCardChange, onCardClick } from './character-card.js';
import BIBLE from '../data/story-bible.json';
import '../styles/story-bible.css';

let card = BIBLE.cards[0].id;      // the card on show (memory only)
let seeAll = false;                // every card on one page
let hooks = { getStory: () => Story.loadStory(), saved: () => {}, film: () => '', rerender: () => {} };
let stored = null;                 // the stored character list, read once, kept current
const chars = () => (stored || (stored = loadCharacters()));
const cards = BIBLE.cards;

/* ---- the character list's saving ------------------------------- */
let saveTimer = 0;
function saveChars(immediate) {
  clearTimeout(saveTimer);
  const run = () => { saveTimer = 0; saveCharacters(chars()); hooks.saved(); };
  if (immediate) run(); else saveTimer = setTimeout(run, 400);
}
addEventListener('pagehide', () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = 0; saveCharacters(chars()); } });
const cardCtx = { list: chars, save: saveChars, rerender: () => redrawCharacters() };

/* ---- the cards ------------------------------------------------- */

function cardHead(c, film) {
  return [
    h('h3.sb-card-h', { text: c.label }),
    h('p.sb-card-lead', { text: c.lead }),
    ...learnFor(c.learn, film)
  ];
}

/* A blueprint field: a textarea that writes its one key. */
function bpField(f, film) {
  const id = 'sb-' + f.key;
  const ta = h('textarea#' + id + '.sb-input', { rows: f.rows || 2, 'data-sb-key': f.key, 'data-sb-ns': f.ns, placeholder: f.placeholder || '' });
  return h('div.sb-field', {}, [
    h('label.sb-lab', { for: id, text: f.label }),
    ...learnFor(f.learn, film),
    ta
  ]);
}
function fillBp(root, byNs) {
  for (const ns of Object.keys(byNs)) {
    const keys = byNs[ns];
    if (!keys.length) continue;
    const got = readFields(ns, keys);
    for (const k of keys) {
      const el = root.querySelector(`[data-sb-key="${k}"][data-sb-ns="${ns}"]`);
      if (el) el.value = typeof got[k] === 'string' ? got[k] : '';
    }
  }
}

function blueprintCard(c, film) {
  const fmt = projectFormat();
  const fields = Story.bibleFields(c.id, fmt);
  const body = h('div.sb-fields');
  fields.forEach((f) => body.append(bpField(f, film)));
  const wrap = h('div.sb-card-body', {}, [body]);
  const by = { feature: [], short: [] };
  fields.forEach((f) => by[f.ns].push(f.key));
  fillBp(wrap, by);
  return wrap;
}

function conflictCard(film) {
  const s = hooks.getStory();
  const grid = h('div.sb-chips', { role: 'group', 'aria-label': 'Kinds of conflict' });
  for (const k of BIBLE.conflicts) {
    const on = s.conflicts.includes(k.id);
    grid.append(h('button.sb-chip' + (on ? '.is-on' : ''), {
      type: 'button', 'data-sb': 'conflict', 'data-id': k.id, 'aria-pressed': String(on)
    }, [h('span.sb-chip-l', { text: k.label }), h('span.sb-chip-m', { text: k.meaning })]));
  }
  const ta = h('textarea#sb-conflictLine.sb-input', { rows: 2, 'data-sb-story': 'conflictLine', placeholder: BIBLE.conflictLine.placeholder });
  ta.value = s.conflictLine;
  return h('div.sb-card-body', {}, [
    grid,
    h('div.sb-field', {}, [h('label.sb-lab', { for: 'sb-conflictLine', text: BIBLE.conflictLine.label }), ta])
  ]);
}

/* ---- characters ------------------------------------------------- */

const RANK = { protagonist: 0, antagonist: 1 };

function characterBox(c, ctx) {
  const name = displayName(c);
  const stat = statsText(ctx.stats.get(c.id));
  const box = h('details.sb-char' + (c.derived ? '.is-derived' : ''), { 'data-ch': c.id, 'data-ch-name': c.name }, [
    h('summary.sb-char-sum', {}, [
      h('strong.sb-char-name', { text: name }),
      c.role ? h('span.sb-char-role', { text: roleLabel(c.role) }) : null,
      c.derived ? h('span.cc-tag', { text: 'from the script' }) : null,
      c.virtual ? h('span.cc-tag', { text: 'from your blueprint' }) : null,
      stat ? h('span.sb-char-stat', { text: stat }) : null
    ]),
    renderCharacterSections(c, { contacts: ctx.contacts, names: ctx.names, film: ctx.film })
  ]);
  if (ctx.open.has(c.id)) box.open = true;
  return box;
}

function charactersBody(film, openIds = new Set()) {
  const list = chars();
  const elements = loadScript().elements || [];
  const roster = buildRoster(list, elements, projectFormat())
    .map((c, i) => ({ c, i })).sort((a, b) => ((RANK[a.c.role] ?? 2) - (RANK[b.c.role] ?? 2)) || a.i - b.i).map((x) => x.c);
  let contacts = [];
  try { contacts = listContacts(); } catch (e) { contacts = []; }
  const ctx = { stats: rosterStats(roster, elements), contacts, names: roster.map((c) => c.name).filter(Boolean), film, open: openIds };
  const wrap = h('div.sb-card-body.sb-chars');
  const has = (r) => roster.some((c) => c.role === r);
  if (!has('protagonist') || !has('antagonist')) {
    const row = h('div.sb-add-roles');
    if (!has('protagonist')) row.append(h('button.btn.primary', { type: 'button', 'data-sb': 'add-role', 'data-role': 'protagonist', text: 'ADD THE PROTAGONIST' }));
    if (!has('antagonist')) row.append(h('button.btn', { type: 'button', 'data-sb': 'add-role', 'data-role': 'antagonist', text: 'ADD THE ANTAGONIST' }));
    wrap.append(h('p.sb-note', { text: 'Start with the two people the story turns on.' }), row);
  }
  const listEl = h('div.sb-char-list');
  roster.forEach((c, i) => {
    const box = characterBox(c, ctx);
    if (i === 0 && !openIds.size && (c.role === 'protagonist')) box.open = true;
    listEl.append(box);
  });
  wrap.append(listEl);
  wrap.append(h('div.sb-new', {}, [
    h('label.sb-lab', { for: 'sb-newname', text: 'Add another character' }),
    h('div.sb-new-row', {}, [
      h('input#sb-newname.sb-input', { type: 'text', 'data-sb-newname': '', placeholder: 'Name', autocomplete: 'off' }),
      h('button.btn', { type: 'button', 'data-sb': 'add-char', text: 'ADD' })
    ])
  ]));
  return wrap;
}

/** Redraw only the characters card, keeping which characters are open. */
function redrawCharacters() {
  flushCardEdits();
  const old = document.querySelector('.sb-chars');
  if (!old) return;
  const open = new Set([...old.querySelectorAll('details.sb-char[open]')].map((d) => d.dataset.ch));
  const nu = charactersBody(hooks.film(), open);
  old.replaceWith(nu);
  hooks.saved();
}

/* ---- the whole step -------------------------------------------- */

function cardBody(c, film) {
  if (c.id === 'characters') return charactersBody(film);
  if (c.id === 'conflict') return conflictCard(film);
  return blueprintCard(c, film);
}

function cardPanel(c, film) {
  return h('article#sb-card-' + c.id + '.sb-card', { 'data-sb-card': c.id, 'aria-label': c.label }, [...cardHead(c, film), cardBody(c, film)]);
}

function cardNav(status) {
  const nav = h('div.sb-nav', { role: 'group', 'aria-label': 'Story Bible cards' });
  cards.forEach((c, i) => {
    const on = !seeAll && c.id === card;
    nav.append(h('button.sb-tab' + (on ? '.is-on' : '') + (status.cards[c.id] ? '.is-done' : ''), {
      type: 'button', 'data-sb': 'card', 'data-card': c.id, 'aria-current': on ? 'true' : null
    }, [
      h('span.sb-tab-n', { text: String(i + 1) }),
      h('span.sb-tab-l', { text: c.label }),
      h('span.sb-tab-s', { text: status.cards[c.id] ? 'Filled' : 'Empty' })
    ]));
  });
  return nav;
}

/** The step's working area (everything under its heading). Redrawn in
    place when the card or the view changes. */
export function renderBibleBody() {
  const film = hooks.film();
  const status = Story.bibleStatus(hooks.getStory());
  const wrap = h('div.sb.glossary-scope');
  const toggle = h('div.sb-view', { role: 'group', 'aria-label': 'How to show the cards' }, [
    h('button.btn' + (!seeAll ? '.is-on' : ''), { type: 'button', 'data-sb': 'view', 'data-view': 'one', 'aria-pressed': String(!seeAll), text: 'ONE CARD AT A TIME' }),
    h('button.btn' + (seeAll ? '.is-on' : ''), { type: 'button', 'data-sb': 'view', 'data-view': 'all', 'aria-pressed': String(seeAll), text: 'SEE ALL' })
  ]);
  wrap.append(h('div.sb-top', {}, [cardNav(status), toggle]));
  if (seeAll) {
    cards.forEach((c) => wrap.append(cardPanel(c, film)));
  } else {
    const i = Math.max(0, cards.findIndex((c) => c.id === card));
    wrap.append(cardPanel(cards[i], film));
    wrap.append(h('div.sb-step-nav', {}, [
      h('button.btn', { type: 'button', 'data-sb': 'card-back', disabled: i === 0, text: 'BACK' }),
      i < cards.length - 1
        ? h('button.btn.primary', { type: 'button', 'data-sb': 'card-next', text: 'NEXT CARD: ' + cards[i + 1].label.toUpperCase() })
        : null
    ]));
  }
  return wrap;
}

function redrawBible() {
  flushCardEdits();
  const old = document.querySelector('.sb');
  if (!old) return;
  old.replaceWith(renderBibleBody());
  hooks.saved();
  try { window.StudioUI && window.StudioUI.wireGlossaryPopovers && window.StudioUI.wireGlossaryPopovers(); } catch (e) { /* chrome */ }
}

const jumpToTop = () => {
  const n = document.querySelector('.sb-nav');
  if (n && n.getBoundingClientRect().top < 0) n.scrollIntoView({ block: 'start' });
};

/** Show a card (and leave "See all"). */
export function openBibleCard(id) {
  if (cards.some((c) => c.id === id)) { card = id; seeAll = false; }
}

/* ---- wiring ------------------------------------------------------ */

let wired = false;
/** `h`: { getStory, saved(), film(), rerender() } — saved runs after any
    write (the page refreshes its stepper's ticks); film() is the
    favourite film's slug. */
export function wireBible(opts = {}) {
  Object.assign(hooks, opts);
  if (wired) return;
  wired = true;

  delegate(document, 'click', '[data-sb]', (e, el) => {
    const act = el.getAttribute('data-sb');
    if (act === 'card') { card = el.getAttribute('data-card'); seeAll = false; redrawBible(); jumpToTop(); }
    else if (act === 'view') { seeAll = el.getAttribute('data-view') === 'all'; redrawBible(); }
    else if (act === 'card-next' || act === 'card-back') {
      const i = cards.findIndex((c) => c.id === card);
      card = cards[Math.min(cards.length - 1, Math.max(0, i + (act === 'card-next' ? 1 : -1)))].id;
      redrawBible(); jumpToTop();
    } else if (act === 'conflict') {
      const s = hooks.getStory();
      const id = el.getAttribute('data-id');
      s.conflicts = s.conflicts.includes(id) ? s.conflicts.filter((x) => x !== id) : [...s.conflicts, id];
      Story.saveStory(s);
      const on = s.conflicts.includes(id);
      el.classList.toggle('is-on', on);
      el.setAttribute('aria-pressed', String(on));
      hooks.saved();
    } else if (act === 'add-role') {
      const c = newCharacter(chars(), el.getAttribute('data-role'));
      saveChars(true);
      redrawCharacters();
      const box = document.querySelector(`details.sb-char[data-ch="${CSS.escape(c.id)}"]`);
      if (box) { box.open = true; const f = box.querySelector('[data-ch-field="name"]'); if (f) f.focus(); }
    } else if (act === 'add-char') {
      const inp = document.querySelector('[data-sb-newname]');
      const name = inp ? inp.value.trim() : '';
      if (!name) { if (inp) inp.focus(); return; }
      const c = newCharacter(chars(), '', name);
      saveChars(true);
      redrawCharacters();
      const box = document.querySelector(`details.sb-char[data-ch="${CSS.escape(c.id)}"]`);
      if (box) { box.open = true; box.scrollIntoView({ block: 'nearest' }); }
    }
  });
  delegate(document, 'keydown', '[data-sb-newname]', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const b = document.querySelector('[data-sb="add-char"]'); if (b) b.click(); }
  });

  /* A character card's own fields. */
  delegate(document, 'input', '.sb [data-ch-field], .sb [data-ch-extra], .sb [data-ch-rel]', (e, el) => { onCardInput(el, cardCtx); });
  delegate(document, 'change', '.sb [data-ch-field], .sb [data-ch-extra], .sb [data-ch-rel]', (e, el) => { onCardChange(el, cardCtx); hooks.saved(); });
  delegate(document, 'click', '.sb [data-ch-action]', (e, el) => { onCardClick(el, cardCtx); });

  /* A blueprint field: one key, merged into the blob. */
  const writeBp = (el) => { writeFields(el.getAttribute('data-sb-ns'), { [el.getAttribute('data-sb-key')]: el.value }); };
  saveOnInput('.sb [data-sb-key]', writeBp);
  delegate(document, 'change', '.sb [data-sb-key]', (e, el) => { writeBp(el); hooks.saved(); });

  /* A story field. */
  const writeStory = (el) => { const s = hooks.getStory(); s[el.getAttribute('data-sb-story')] = el.value; Story.saveStory(s); };
  saveOnInput('.sb [data-sb-story]', writeStory);
  delegate(document, 'change', '.sb [data-sb-story]', (e, el) => { writeStory(el); hooks.saved(); });
}

export default { renderBibleBody, wireBible, openBibleCard };
