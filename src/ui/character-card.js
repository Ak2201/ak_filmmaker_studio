/* ============================================================
   CHARACTER CARD — one person's sections, shared by two pages
   ------------------------------------------------------------
   The Story Bible's Characters card (story.html) and the writer's
   Characters tab (write.html) show the SAME roster, so they draw one
   card and wire it once. This file is that card: Who · Drive ·
   Make-up · Change · Ties, plus — for the person holding a blueprint
   role — the blueprint's further prompts for that role.

   WHAT A FIELD IS. The card is drawn from a VIEW (src/lib/characters.js
   viewOf): a record with the blueprint's answers laid over the fields
   that have a blueprint key. A write goes where the field lives —
   setField() sends a backed field to the blueprint blob and the rest to
   the record — so nothing is stored twice. This file never decides
   that; it asks the model.

   WRITES happen on a user event only: a keystroke schedules one 400ms
   later, a change (blur, a select) runs it now, and every pending one
   is flushed on pagehide, so nothing is lost to a reload and an idle
   page writes nothing (verify asserts it).

   The two pages differ in what surrounds the card and in how they save
   the stored list, so the caller passes `ctx`:
     list()          the stored records (kept current by the caller)
     save(now)       persist them (debounced unless `now`)
     rerender(box)   redraw this card after a structural change
   ============================================================ */
import { h } from '../lib/dom.js';
import C, { ROLES, roleLabel, viewFor, setField, setExtra, assignRole, blankCharacter } from '../lib/characters.js';
import { learn as learnBox } from './learn.js';
import BIBLE from '../data/story-bible.json';
import '../styles/story-bible.css';

const safe = (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '_');

/** The little "What is a want?" box, or nothing when no topic exists.
    `topic` may be an id or null; returns an array so a caller can spread it. */
export function learnFor(topic, film) {
  if (!topic) return [];
  let el = null;
  try { el = learnBox(topic, { film }); } catch (e) { el = null; }
  return el ? [el] : [];
}

/** "First appears in INT. TEA STALL - DAY (scene 1) · 3 scenes · 41 lines · 312 words",
    or '' when the script says nothing about this person. */
export function statsText(stats) {
  if (!stats) return '';
  const bits = [];
  if (stats.first) bits.push('First appears in ' + (stats.first.heading || 'the script') + (stats.first.sceneNo ? ' (scene ' + stats.first.sceneNo + ')' : ''));
  if (stats.scenes) bits.push(stats.scenes + (stats.scenes === 1 ? ' scene' : ' scenes'));
  if (stats.lines) bits.push(stats.lines + (stats.lines === 1 ? ' line' : ' lines'));
  if (stats.words) bits.push(stats.words + (stats.words === 1 ? ' word' : ' words'));
  return bits.join(' · ');
}

/** What a card calls its person. */
export function displayName(view) {
  const raw = String(view.nameRaw || view.name || '').trim();
  if (raw) return raw.length > 48 ? raw.slice(0, 45) + '…' : raw;
  return view.role ? 'Unnamed ' + roleLabel(view.role).toLowerCase() : 'Unnamed character';
}

function contactSelect(id, view, contacts) {
  const sel = h('select#' + id + '.cc-input', { 'data-ch-field': 'contactId', 'aria-label': 'Cast as — ' + displayName(view) });
  sel.append(h('option', { value: '', text: contacts.length ? 'Not cast yet' : 'Add people on the Contacts page first' }));
  const cast = contacts.filter((p) => p.department === 'Cast');
  const rest = contacts.filter((p) => p.department !== 'Cast');
  const add = (p) => {
    const o = h('option', { value: p.id, text: p.name + (p.role ? ' — ' + p.role : '') + (p.department !== 'Cast' ? ' (' + p.department + ')' : '') });
    if (p.id === view.contactId) o.selected = true;
    sel.append(o);
  };
  cast.forEach(add);
  rest.forEach(add);
  if (view.contactId && !contacts.some((p) => p.id === view.contactId)) {
    sel.append(h('option', { value: view.contactId, selected: true, text: 'A contact no longer on the list' }));
  }
  return sel;
}

function fieldBlock(f, view, o) {
  const id = 'cc-' + safe(view.id) + '-' + f.key;
  const labelText = f.label;
  const head = [h('label.cc-lab', { for: id, text: labelText }), ...learnFor(f.learn, o.film)];
  let input;
  if (f.kind === 'role') {
    input = h('select#' + id + '.cc-input', { 'data-ch-field': 'role' });
    input.append(h('option', { value: '', text: 'No role yet' }));
    ROLES.forEach((r) => input.append(h('option', { value: r, text: roleLabel(r), selected: view.role === r })));
  } else if (f.kind === 'cast') {
    input = contactSelect(id, view, o.contacts || []);
  } else if (f.kind === 'ties') {
    return tiesBlock(f, view, o, id);
  } else if (f.kind === 'line') {
    const isName = f.key === 'name';
    const raw = isName ? (view.nameRaw !== undefined ? view.nameRaw : view.name) : (f.key === 'aliases' ? (view.aliases || []).join(', ') : view[f.key]);
    input = h('input#' + id + '.cc-input', {
      type: 'text', 'data-ch-field': f.key, placeholder: f.placeholder || '', autocomplete: 'off',
      readonly: isName && (view.derived || o.nameEditable === false) ? '' : null
    });
    input.value = raw || '';
  } else {
    input = h('textarea#' + id + '.cc-input', { rows: f.rows || 2, 'data-ch-field': f.key, placeholder: f.placeholder || '' });
    input.value = view[f.key] || '';
  }
  return h('div.cc-field', {}, [...head, input]);
}

function tiesBlock(f, view, o, id) {
  const wrap = h('div.cc-field.cc-ties', {}, [h('span.cc-lab', { id: id + '-l', text: f.label })]);
  const names = (o.names || []).filter((n) => n && n !== view.name);
  const dl = names.length ? h('datalist#' + id + '-names', {}, names.map((n) => h('option', { value: n }))) : null;
  if (dl) wrap.append(dl);
  const rows = h('div.cc-tie-rows', { 'aria-labelledby': id + '-l' });
  (view.relationships || []).forEach((r, i) => {
    const who = h('input.cc-input', { type: 'text', 'data-ch-rel': 'who', placeholder: 'Who', list: dl ? id + '-names' : null, 'aria-label': 'Relationship ' + (i + 1) + ': who' });
    who.value = r.who;
    const how = h('input.cc-input', { type: 'text', 'data-ch-rel': 'how', placeholder: 'How — sister, rival, owes him money…', 'aria-label': 'Relationship ' + (i + 1) + ': how' });
    how.value = r.how;
    rows.append(h('div.cc-tie', { 'data-ch-rel-row': String(i) }, [who, how,
      h('button.btn.cc-x', { type: 'button', 'data-ch-action': 'tie-del', 'data-i': String(i), 'aria-label': 'Remove relationship ' + (i + 1), text: 'REMOVE' })]));
  });
  wrap.append(rows, h('button.btn.cc-add', { type: 'button', 'data-ch-action': 'tie-add', text: 'ADD A RELATIONSHIP' }));
  return wrap;
}

function extrasBlock(view, o) {
  if (!view.extras || !view.extras.length) return null;
  const sec = h('details.cc-sec', { open: o.open === false ? null : '' }, [
    h('summary.cc-sum', { text: 'More on the ' + roleLabel(view.role).toLowerCase() + ' — from your blueprint' })
  ]);
  const body = h('div.cc-body');
  view.extras.forEach((x) => {
    const id = 'cc-' + safe(view.id) + '-x-' + x.key;
    const ta = h('textarea#' + id + '.cc-input', { rows: 2, 'data-ch-extra': x.key, 'data-ns': x.ns, placeholder: x.placeholder || '' });
    ta.value = x.value || '';
    body.append(h('div.cc-field', {}, [h('label.cc-lab', { for: id, text: x.label }), ta]));
  });
  sec.append(body);
  return sec;
}

/** The sections for one person. `o`: { contacts, names, film, open (all
    sections open? default true), nameEditable }. */
export function renderCharacterSections(view, o = {}) {
  const root = h('div.cc-sections');
  if (view.linked) {
    root.append(h('p.cc-linked', {
      text: 'Linked to your blueprint: the answers the blueprint also asks for this role are shared, so changing them here changes them there.'
    }));
  }
  for (const s of BIBLE.characterCard) {
    const sec = h('details.cc-sec', { 'data-cc-sec': s.id, open: o.open === false ? null : '' }, [h('summary.cc-sum', { text: s.label })]);
    const body = h('div.cc-body');
    for (const f of s.fields) body.append(fieldBlock(f, view, o));
    sec.append(body);
    root.append(sec);
  }
  const ex = extrasBlock(view, o);
  if (ex) root.append(ex);
  return root;
}

/* ---- wiring ------------------------------------------------- */

const DELAY = 400;
const timers = new Map();   // element -> timer

/** Run every pending keystroke's write now. */
export function flushCardEdits() {
  for (const [el, t] of [...timers]) { clearTimeout(t.id); timers.delete(el); try { t.fn(); } catch (e) { console.warn('[character-card]', e); } }
}
addEventListener('pagehide', flushCardEdits);
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushCardEdits(); });

function later(el, fn) {
  const prev = timers.get(el);
  if (prev) clearTimeout(prev.id);
  timers.set(el, { fn, id: setTimeout(() => { timers.delete(el); try { fn(); } catch (e) { console.warn('[character-card]', e); } }, DELAY) });
}
function now(el, fn) {
  const prev = timers.get(el);
  if (prev) { clearTimeout(prev.id); timers.delete(el); }
  fn();
}

const boxOf = (el) => el.closest('[data-ch]');

/* After a virtual or derived row became a record the card keeps its
   place and takes the record's id, so the next edit finds it. */
function settleBox(box, rec) {
  if (!rec || !box) return;
  box.dataset.ch = rec.id;
  box.classList.remove('is-derived');
  const tag = box.querySelector('.wr-ch-tag, .cc-tag');
  if (tag) tag.remove();
}

function relRows(box) {
  return [...box.querySelectorAll('[data-ch-rel-row]')].map((r) => ({
    who: r.querySelector('[data-ch-rel="who"]').value,
    how: r.querySelector('[data-ch-rel="how"]').value
  }));
}

function writeField(el, ctx, immediate) {
  const box = boxOf(el);
  if (!box) return;
  const list = ctx.list();
  const view = viewFor(list, box.dataset.ch, box.dataset.chName);
  let key = el.dataset.chField;
  let value = el.value;
  if (el.hasAttribute('data-ch-rel')) { key = 'relationships'; value = relRows(box); }
  const r = setField(list, view, key, value);
  if (r.rec) settleBox(box, r.rec);
  if (r.listChanged) ctx.save(immediate);
}

/** `input` on a card field: a write, 400ms from now. */
export function onCardInput(el, ctx) {
  if (!boxOf(el)) return false;
  const key = el.dataset.chField;
  if (el.hasAttribute('data-ch-extra')) {
    later(el, () => setExtra({ ns: el.dataset.ns, key: el.dataset.chExtra }, el.value));
    return true;
  }
  if (el.hasAttribute('data-ch-rel') || (key && !['role', 'name', 'contactId'].includes(key))) {
    later(el, () => writeField(el, ctx, false));
    return true;
  }
  return !!key;
}

/** `change` on a card field (blur, or a select): a write, now. A new
    role may be refused by the writer, which puts the select back. */
export function onCardChange(el, ctx) {
  const box = boxOf(el);
  if (!box) return false;
  if (el.hasAttribute('data-ch-extra')) { now(el, () => setExtra({ ns: el.dataset.ns, key: el.dataset.chExtra }, el.value)); return true; }
  const key = el.dataset.chField;
  if (key === 'role') {
    const list = ctx.list();
    const view = viewFor(list, box.dataset.ch, box.dataset.chName);
    const prior = view.role || '';
    const res = assignRole(list, view, el.value, { confirm: ctx.confirm });
    if (!res.ok) { el.value = prior; return true; }
    if (res.rec) settleBox(box, res.rec);
    if (res.listChanged) ctx.save(true);
    ctx.rerender(box);
    return true;
  }
  if (!key && !el.hasAttribute('data-ch-rel')) return false;
  now(el, () => writeField(el, ctx, true));
  return true;
}

/** A click on a card's own buttons (add / remove a relationship). */
export function onCardClick(btn, ctx) {
  const box = boxOf(btn);
  if (!box) return false;
  const act = btn.dataset.chAction;
  if (act !== 'tie-add' && act !== 'tie-del') return false;
  flushCardEdits();
  const list = ctx.list();
  const view = viewFor(list, box.dataset.ch, box.dataset.chName);
  const rows = relRows(box);
  if (act === 'tie-add') rows.push({ who: '', how: '' });
  else rows.splice(Number(btn.dataset.i), 1);
  const r = setField(list, view, 'relationships', rows);
  if (r.rec) settleBox(box, r.rec);
  ctx.save(true);
  ctx.rerender(box);
  return true;
}

/** A brand-new record for a role, for the "Add the protagonist" buttons. */
export function newCharacter(list, role, name = '') {
  const c = blankCharacter({ name });
  list.push(c);
  const view = viewFor(list, c.id, c.name);
  if (role) assignRole(list, view, role, { confirm: () => true });
  return c;
}

export default { renderCharacterSections, onCardInput, onCardChange, onCardClick, flushCardEdits, learnFor, statsText, displayName, newCharacter };
