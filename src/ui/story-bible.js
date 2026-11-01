/* ============================================================
   STORY BIBLE — the path's Bible step (feature) and Character / World /
   Conflict steps (short)
   ------------------------------------------------------------
   Five cards about the film as a whole: Characters, Conflict, Stakes,
   Theme, World. EVERY CARD OF THE STEP IS ON THE PAGE AT ONCE (the
   owner's rule for the Story page: nothing behind a tab or a drop-down);
   a row of jump chips above them scrolls to one. Nothing here is
   required and nothing is hidden for good: a card's tick only means it
   has something in it.

   THIS IS WHERE THE BLUEPRINT'S QUESTIONS ARE ASKED. The path absorbs
   the Feature Blueprint's steps 03-07 (and the Short's 03 and 05), so
   each blueprint-backed field here carries the blueprint's own
   `data-key` (and, for the few that have one on feature.html, its
   private-note pencil): the stage guide no longer draws those steps, and
   verify's key-union reads `data-key`. A field is on the page once.
   Roles the cast does not hold yet still show their blueprint questions
   as a "not in your cast yet" card, so an answer saved against a slot is
   never hidden by the roster. A SHORT film's path shows the protagonist,
   its world and the conflict, and a feature-only card (stakes, theme,
   antagonist, ally, love, mentor) only when the feature keys behind it
   already hold an answer.

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
import StudioUI from './chrome.js';
import { paperTextarea } from './paper-field.js';
import { aiPill } from './ai-pill.js';   // the one way into AI; the Desk and ai.js load at a click
import { saveOnInput } from '../lib/autosave.js';
import * as Story from '../lib/story.js';
import { readFields, writeFields } from '../lib/blueprint-store.js';
import { loadCharacters, saveCharacters, buildRoster, rosterStats, projectFormat, roleLabel, slotSpec } from '../lib/characters.js';
import { loadScript } from '../lib/script.js';
import { listContacts } from '../lib/contacts.js';
import { renderCharacterSections, displayName, statsText, learnFor, newCharacter, flushCardEdits, onCardInput, onCardChange, onCardClick, noteButton } from './character-card.js';
import BIBLE from '../data/story-bible.json';
import '../styles/story-bible.css';

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
    ...learnFor(c.learn, film),
    /* The AI Desk's arcs (character-arcs, src/lib/ai-tasks-story.js): a draft
       to tick, written only on Accept, into arc / arcStart / arcEnd fields
       that are empty — through the blueprint where a slot holds the field,
       else this list (cardCtx), which then redraws. */
    c.id === 'characters'
      ? h('div.sb-card-ai', {}, [aiPill({
        label: 'Draft arcs',
        tasks: ['character-arcs'],
        ctx: () => ({ ...cardCtx, say: (m) => StudioUI.toast(m, { type: 'info' }) })
      })])
      : null
  ].filter(Boolean);
}

/* A blueprint field: a textarea that writes its one key. It carries the
   blueprint's `data-key` too (see the header). */
function bpField(f, film, fmt) {
  const id = 'sb-' + f.key;
  const ta = paperTextarea('#' + id + '.sb-input', { rows: f.rows || 2, 'data-sb-key': f.key, 'data-sb-ns': f.ns, 'data-key': f.key, placeholder: f.placeholder || '' });
  return h('div.sb-field', {}, [
    h('label.sb-lab', { for: id, text: f.label }),
    noteButton(f.key, fmt, f.label),
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

const hasText = (ns, keys) => {
  try { return Object.values(readFields(ns, keys)).some((v) => typeof v === 'string' && v.trim() !== ''); }
  catch (e) { return false; }
};

/** The fields a blueprint-backed card draws in this format. A short
    film's world card shows the short blueprint's keys; the feature keys
    behind a card the short blueprint has no keys for (stakes, theme, and
    the world's era / duration) show only once they hold an answer. */
function cardFields(cardId, fmt) {
  const fields = Story.bibleFields(cardId, fmt);
  if (fmt !== 'short') return fields;
  return fields.filter((f) => f.ns === 'short' || hasText(f.ns, [f.key]));
}

/** Whether a SHORT project shows a feature-only card: only when the
    feature keys behind it already hold something. */
export function shortShowsCard(cardId) {
  if (!(BIBLE.shortFeatureOnly.cards || []).includes(cardId)) return true;
  const f = Story.bibleFields(cardId, 'feature');
  return f.length > 0 && hasText('feature', f.map((x) => x.key));
}

function blueprintCard(c, film, fmt) {
  const fields = cardFields(c.id, fmt);
  const body = h('div.sb-fields');
  fields.forEach((f) => body.append(bpField(f, film, fmt)));
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
  const ta = paperTextarea('#sb-conflictLine.sb-input', { rows: 2, 'data-sb-story': 'conflictLine', placeholder: BIBLE.conflictLine.placeholder });
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
    renderCharacterSections(c, { contacts: ctx.contacts, names: ctx.names, film: ctx.film, dataKeys: true, shortOnly: projectFormat() === 'short' })
  ]);
  if (ctx.open.has(c.id)) box.open = true;
  return box;
}

/* Field wording for a slot's backed fields: the character card's own. */
const CARD_FIELDS = Object.fromEntries(BIBLE.characterCard.flatMap((sec) => sec.fields.map((f) => [f.key, f])));

/** A role the cast does not hold yet: the blueprint's questions for it,
    so an answer saved against the slot has somewhere to show and a
    writer can answer before there is a character to put it on. Nothing
    is created until a key is typed in. A short film shows only the
    protagonist's, and another role's only when its feature keys already
    hold an answer. */
function slotCard(role, fmt, film) {
  const spec = slotSpec(role, fmt);
  if (!spec) return null;
  let items = Object.entries(spec.fields).map(([f, { ns, key }]) => {
    const cf = CARD_FIELDS[f] || {};
    return { ns, key, label: cf.label || f, placeholder: cf.placeholder || '', rows: 2, learn: cf.learn };
  }).concat(spec.extras.map((x) => ({ ns: x.ns, key: x.key, label: x.label, placeholder: x.placeholder || '', rows: 2 })));
  /* A short film's slot asks the SHORT blueprint's questions; a feature
     key behind it shows only once it holds an answer. */
  if (fmt === 'short') items = items.filter((i) => i.ns === 'short' || hasText(i.ns, [i.key]));
  if (!items.length) return null;
  const keys = { feature: [], short: [] };
  items.forEach((i) => keys[i.ns].push(i.key));
  const any = ['feature', 'short'].some((ns) => keys[ns].length && hasText(ns, keys[ns]));
  if (fmt === 'short' && BIBLE.shortFeatureOnly.roles.includes(role) && !any) return null;
  const body = h('div.sb-fields');
  items.forEach((i) => body.append(bpField(i, film, fmt)));
  fillBp(body, keys);
  const box = h('details.sb-char.is-slot', { 'data-sb-slot': role }, [
    h('summary.sb-char-sum', {}, [
      h('strong.sb-char-name', { text: roleLabel(role) }),
      h('span.sb-char-role', { text: 'not in your cast yet' }),
      h('span.cc-tag', { text: 'from your blueprint' })
    ]),
    h('div.cc-sections', {}, [
      h('p.cc-linked', { text: 'These are the blueprint’s own questions for this role. Add the character above, or give someone this role, and the same answers appear on their card.' }),
      body
    ])
  ]);
  if (any || role === 'protagonist') box.open = true;
  return box;
}

function charactersBody(film, openIds = new Set()) {
  const fmt = projectFormat();
  const list = chars();
  const elements = loadScript().elements || [];
  const roster = buildRoster(list, elements, fmt)
    .map((c, i) => ({ c, i })).sort((a, b) => ((RANK[a.c.role] ?? 2) - (RANK[b.c.role] ?? 2)) || a.i - b.i).map((x) => x.c);
  let contacts = [];
  try { contacts = listContacts(); } catch (e) { contacts = []; }
  const ctx = { stats: rosterStats(roster, elements), contacts, names: roster.map((c) => c.name).filter(Boolean), film, open: openIds };
  const wrap = h('div.sb-card-body.sb-chars');
  const has = (r) => roster.some((c) => c.role === r);
  if (!has('protagonist') || !has('antagonist')) {
    const row = h('div.sb-add-roles');
    if (!has('protagonist')) row.append(h('button.k-btn.k-btn--primary', { type: 'button', 'data-sb': 'add-role', 'data-role': 'protagonist', text: 'Add the protagonist' }));
    if (!has('antagonist')) row.append(h('button.k-btn.k-btn--secondary', { type: 'button', 'data-sb': 'add-role', 'data-role': 'antagonist', text: 'Add the antagonist' }));
    wrap.append(h('p.sb-note', { text: fmt === 'short' ? 'Start with the person the film is about.' : 'Start with the two people the story turns on.' }), row);
  }
  const listEl = h('div.sb-char-list');
  roster.forEach((c, i) => {
    const box = characterBox(c, ctx);
    if (i === 0 && !openIds.size && (c.role === 'protagonist')) box.open = true;
    listEl.append(box);
  });
  /* The roles nobody holds: their blueprint questions, each once. */
  for (const role of ['protagonist', 'antagonist', 'ally', 'love', 'mentor']) {
    if (has(role)) continue;
    const slot = slotCard(role, fmt, film);
    if (slot) listEl.append(slot);
  }
  wrap.append(listEl);
  wrap.append(h('div.sb-new', {}, [
    h('label.sb-lab', { for: 'sb-newname', text: 'Add another character' }),
    h('div.sb-new-row', {}, [
      h('input#sb-newname.sb-input', { type: 'text', 'data-sb-newname': '', placeholder: 'Name', autocomplete: 'off' }),
      h('button.k-btn.k-btn--secondary', { type: 'button', 'data-sb': 'add-char', text: 'Add' })
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

function cardBody(c, film, fmt) {
  if (c.id === 'characters') return charactersBody(film);
  if (c.id === 'conflict') return conflictCard(film);
  return blueprintCard(c, film, fmt);
}

function cardPanel(c, film, fmt) {
  return h('article#sb-card-' + c.id + '.sb-card', { 'data-sb-card': c.id, 'aria-label': c.label }, [...cardHead(c, film), cardBody(c, film, fmt)]);
}

/* Jump chips: the cards are all on the page; a chip scrolls to one. */
function cardNav(list, status) {
  const nav = h('div.sb-nav', { role: 'group', 'aria-label': 'Story Bible cards' });
  list.forEach((c, i) => {
    nav.append(h('button.sb-tab' + (status.cards[c.id] ? '.is-done' : ''), { type: 'button', 'data-sb': 'jump', 'data-card': c.id }, [
      h('span.sb-tab-n', { text: String(i + 1) }),
      h('span.sb-tab-l', { text: c.label }),
      h('span.sb-tab-s', { text: status.cards[c.id] ? 'Filled' : 'Empty' })
    ]));
  });
  return nav;
}

/** The working area for the cards a path step shows (everything under
    its heading): ALL of them, one under another. `cards` is a list of
    card ids (default: every card); `format` defaults to the open
    project's. */
export function renderBibleBody({ cards: ids, format } = {}) {
  const fmt = format || projectFormat();
  const want = ids && ids.length ? ids : cards.map((c) => c.id);
  const film = hooks.film();
  const status = Story.bibleStatus(hooks.getStory());
  const list = want.map((id) => cards.find((c) => c.id === id)).filter(Boolean);
  const wrap = h('div.sb.glossary-scope', { 'data-sb-cards': list.map((c) => c.id).join(',') });
  if (list.length > 1) wrap.append(h('div.sb-top', {}, [cardNav(list, status)]));
  list.forEach((c) => wrap.append(cardPanel(c, film, fmt)));
  markNotes(wrap);
  return wrap;
}

/* ---- the private-note pencils (feature only) --------------------
   comments.js is fetched the first time a pencil is drawn, not up
   front: the Story page's first paint does not pay for it. The notes
   are the blueprint's own (fms_note_<key>), the same store. */
let commentsP = null;
function mountNotes(m) {
  m.mountComments({
    scope: 'feature', notePrefix: 'fms_note_',
    onNoteChange: (key, has) => document.querySelectorAll('.comment-btn[data-note-key="' + CSS.escape(key) + '"]')
      .forEach((b) => b.classList.toggle('has-note', has))
  });
}
function comments() {
  if (!commentsP) {
    commentsP = import('./comments.js').then((m) => { mountNotes(m); return m; })
      .catch((e) => { commentsP = null; console.warn('[story-bible] notes', e); return null; });
  }
  return commentsP;
}
function paintNotes(m, root) {
  root.querySelectorAll('.comment-btn[data-note-key]').forEach((b) => b.classList.toggle('has-note', m.hasNote(b.getAttribute('data-note-key'))));
  if (typeof m.paintBadges === 'function') m.paintBadges();
}
function markNotes(root) {
  if (!root.querySelector('.comment-btn[data-note-key]')) return;
  comments().then((m) => { if (m) paintNotes(m, root); });
}
/** Point the notes' change handler at the whole document again — the
    stage guide's own mounts scope it to their root; call after one ran. */
export function rewireNotes() {
  if (commentsP) commentsP.then((m) => { if (m) { mountNotes(m); paintNotes(m, document); } });
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
    if (act === 'jump') {
      const t = document.getElementById('sb-card-' + el.getAttribute('data-card'));
      if (t) t.scrollIntoView({ block: 'start' });
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
      if (!name) { if (inp) inp.focus(); StudioUI.toast('Type the character’s name first, then press Add.'); return; }
      /* The same name twice may be meant (two Ravis), so it is added —
         and said, since the cast matrix and auto-tag then hold two. */
      const twin = [...document.querySelectorAll('.sb-chars [data-ch-name]')]
        .some((b) => b.getAttribute('data-ch-name').trim().toUpperCase() === name.toUpperCase());
      const c = newCharacter(chars(), '', name);
      saveChars(true);
      redrawCharacters();
      const box = document.querySelector(`details.sb-char[data-ch="${CSS.escape(c.id)}"]`);
      if (box) {
        box.open = true;
        /* The redraw replaced the Add button: the keyboard goes to the
           new character's card, not to <body>. */
        const f = box.querySelector('[data-ch-field="name"]') || box.querySelector('summary');
        if (f) f.focus({ preventScroll: true });
        box.scrollIntoView({ block: 'nearest' });
      }
      if (twin) StudioUI.toast(`There is already a ${name.toUpperCase()} in your cast. This is a second card with the same name.`);
    }
  });
  delegate(document, 'keydown', '[data-sb-newname]', (e) => {
    if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); const b = document.querySelector('[data-sb="add-char"]'); if (b) b.click(); }
  });

  /* A character card's own fields. */
  delegate(document, 'input', '.sb [data-ch-field], .sb [data-ch-extra], .sb [data-ch-rel]', (e, el) => { onCardInput(el, cardCtx); });
  delegate(document, 'change', '.sb [data-ch-field], .sb [data-ch-extra], .sb [data-ch-rel]', async (e, el) => { await onCardChange(el, cardCtx); hooks.saved(); });
  delegate(document, 'click', '.sb [data-ch-action]', (e, el) => { onCardClick(el, cardCtx); });

  /* A blueprint field: one key, merged into the blob. */
  const writeBp = (el) => { writeFields(el.getAttribute('data-sb-ns'), { [el.getAttribute('data-sb-key')]: el.value }); };
  saveOnInput('.sb [data-sb-key]', writeBp);
  delegate(document, 'change', '.sb [data-sb-key]', (e, el) => { writeBp(el); hooks.saved(); });

  /* A private-note pencil: the blueprint's own panel, in the field's box. */
  delegate(document, 'click', '.sb .comment-btn[data-note-key]', (e, btn) => {
    comments().then((m) => { if (m) m.togglePanel(btn.getAttribute('data-note-key'), btn.closest('.sb-field, .cc-field')); });
  });

  /* A story field. */
  const writeStory = (el) => { const s = hooks.getStory(); s[el.getAttribute('data-sb-story')] = el.value; Story.saveStory(s); };
  saveOnInput('.sb [data-sb-story]', writeStory);
  delegate(document, 'change', '.sb [data-sb-story]', (e, el) => { writeStory(el); hooks.saved(); });
}

export default { renderBibleBody, wireBible, rewireNotes, shortShowsCard };
