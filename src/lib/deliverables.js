/* ============================================================
   DELIVERABLES — what leaves the building, as one checklist
   ------------------------------------------------------------
   The censor certificate, the subtitle file, the DCP, the stills,
   the M&E stems: a finished film is thirty-odd objects and a piece
   of paper for each, and today they are spread across the post step
   of the blueprint, the short film's festival check and the
   submission tracker. This is the one list.

   THE CATALOGUE IS CONTENT. src/data/deliverables.json holds every
   standard item with the sentence saying why it exists; this file
   holds the user's STATE against each item's id and nothing else.
   An id in that file is therefore a storage key — see its _about.

   FESTIVAL FORMATS ARE DERIVED, NOT LISTED. The submission tracker
   already knows which festivals this film is going to, and
   festivals.json already knows what each one asks for. requirements()
   joins the two at render time, so a festival added on the short
   film's step 10 appears here with its format and nothing has to be
   typed twice or kept in step by hand. Where the catalogue does not
   record a format the row says so rather than guessing one.

   THREE STATES AND A FOURTH THAT MEANS "NOT FOR THIS FILM". A
   checklist with only tick/untick cannot say "we do not need a 5.1
   mix, this is a phone film", and then the progress figure lies
   forever. 'na' takes an item out of the denominator.

   STORAGE CONTRACT. `fms_deliverables_v1` is a new key and is
   registered in all five places: SCOPED_KEYS (store.js),
   PROJECT_KEYS (backup.js), ALL_KEYS (hub.js), SCOPE_BY_KEY
   (cloud.js) and the scope CHECK in supabase-schema.sql (section 16).
   ============================================================ */
import './store.js';   // must evaluate before anything reads localStorage
import catalogue from '../data/deliverables.json';
import { listSubmissions, catalogueEntry, statusMeta } from './festivals.js';

export const DELIVERABLES_KEY = 'fms_deliverables_v1';

export const STATES = [
  { id: 'todo',  label: 'To do',        done: false, counts: true  },
  { id: 'doing', label: 'In progress',  done: false, counts: true  },
  { id: 'done',  label: 'Done',         done: true,  counts: true  },
  { id: 'na',    label: 'Not needed',   done: false, counts: false }
];
const stateIds = STATES.map((s) => s.id);
export const stateMeta = (id) => STATES.find((s) => s.id === id) || STATES[0];

export const WHEN = [
  { id: 'always',   label: 'Any screening' },
  { id: 'festival', label: 'Festivals' },
  { id: 'release',  label: 'Release and sales' }
];
export const whenLabel = (id) => (WHEN.find((w) => w.id === id) || WHEN[0]).label;

let seq = 0;
const uid = () => 'dv' + Date.now().toString(36) + (seq++).toString(36);

export function blankItemState(patch = {}) {
  const s = { state: 'todo', note: '', ...patch };
  if (!stateIds.includes(s.state)) s.state = 'todo';
  s.note = String(s.note || '');
  return s;
}

/** An item the user added that the catalogue does not have. */
export function blankCustom(patch = {}) {
  return { id: uid(), label: '', group: 'custom', when: 'always', ...patch };
}

/* ---- persistence -------------------------------------------- */
function readAll() {
  let raw = null;
  try { raw = localStorage.getItem(DELIVERABLES_KEY); } catch (e) { /* private mode */ }
  if (!raw) return { items: {}, custom: [] };
  try {
    const p = JSON.parse(raw);
    return {
      items: (p && p.items && typeof p.items === 'object' && !Array.isArray(p.items)) ? p.items : {},
      custom: Array.isArray(p && p.custom) ? p.custom : []
    };
  } catch (e) {
    return { items: {}, custom: [] };
  }
}

function writeAll(data) {
  try { localStorage.setItem(DELIVERABLES_KEY, JSON.stringify(data)); return true; }
  catch (e) { return false; }
}

export function loadDeliverables() {
  const d = readAll();
  const items = {};
  Object.keys(d.items).forEach((id) => { items[id] = blankItemState(d.items[id]); });
  return {
    items,
    custom: d.custom.map((c) => blankCustom(c)).filter((c) => String(c.label || '').trim())
  };
}

export function itemState(id, data) {
  return ((data || loadDeliverables()).items[id]) || blankItemState();
}

export function setItemState(id, patch) {
  const d = loadDeliverables();
  const next = blankItemState({ ...(d.items[id] || {}), ...patch });
  /* The default state is not stored, so a project that never touched
     the list has an empty blob rather than forty rows of 'todo'. */
  if (next.state === 'todo' && !next.note) delete d.items[id];
  else d.items[id] = next;
  writeAll(d);
  return next;
}

export function addCustom(label, when) {
  const clean = String(label || '').trim();
  if (!clean) return null;
  const d = loadDeliverables();
  const c = blankCustom({ label: clean, when: WHEN.some((w) => w.id === when) ? when : 'always' });
  d.custom.push(c);
  writeAll(d);
  return c;
}

export function removeCustom(id) {
  const d = loadDeliverables();
  d.custom = d.custom.filter((c) => c.id !== id);
  delete d.items[id];
  writeAll(d);
  return d.custom;
}

/** Remove a custom line and hand back what it was — the row, its
    place, and its status — so the page can offer an Undo. */
export function takeCustom(id) {
  const d = loadDeliverables();
  const index = d.custom.findIndex((c) => c.id === id);
  if (index < 0) return null;
  const snap = { index, custom: d.custom[index], state: d.items[id] || null };
  removeCustom(id);
  return snap;
}

/** Put back what takeCustom() took. Nothing if it is already there. */
export function putCustomBack(snap) {
  if (!snap || !snap.custom) return null;
  const d = loadDeliverables();
  if (d.custom.some((c) => c.id === snap.custom.id)) return null;
  d.custom.splice(Math.min(snap.index, d.custom.length), 0, snap.custom);
  if (snap.state) d.items[snap.custom.id] = snap.state;
  writeAll(d);
  return snap.custom;
}

/* ---- derived ------------------------------------------------ */

/**
 * Every item on the list — the catalogue's, filtered for this film's
 * format, then the user's own — each carrying its stored state.
 *
 * @param {string} format  the project's format ('feature', 'short', …)
 *                         so an item limited to one of them is left
 *                         off the other. Unknown formats see everything.
 */
export function listItems(format, data) {
  const d = data || loadDeliverables();
  const out = [];
  (catalogue.groups || []).forEach((g) => {
    (g.items || []).forEach((it) => {
      if (Array.isArray(it.formats) && format && !it.formats.includes(format)) return;
      out.push({ ...it, group: g.id, groupLabel: g.label, custom: false, ...itemState(it.id, d) });
    });
  });
  d.custom.forEach((c) => {
    out.push({ ...c, groupLabel: 'Your own', custom: true, why: '', ...itemState(c.id, d) });
  });
  return out;
}

export function groups() {
  return (catalogue.groups || []).map((g) => ({ id: g.id, label: g.label, blurb: g.blurb || '' }));
}

/**
 * Progress. 'na' items leave the denominator; a list where everything
 * is marked not-needed reads as 0 of 0, which is honest.
 */
export function progress(items) {
  const list = items || listItems();
  const counted = list.filter((i) => stateMeta(i.state).counts);
  const done = counted.filter((i) => stateMeta(i.state).done);
  return {
    total: counted.length,
    done: done.length,
    doing: counted.filter((i) => i.state === 'doing').length,
    skipped: list.length - counted.length,
    complete: counted.length > 0 && done.length === counted.length,
    pct: counted.length ? Math.round((done.length / counted.length) * 100) : 0
  };
}

/* What each tracked festival asks for, joined from the submission
   tracker and the catalogue. A submission that was rejected or
   withdrawn asks for nothing any more and is left out; a festival not
   in the catalogue is listed with "format not recorded", because a
   row that is missing looks like a festival that asks for nothing. */
const CATALOGUE_FORMAT_TO_ITEMS = [
  { test: /dcp/i,     items: ['dcp'] },
  { test: /prores/i,  items: ['master_prores'] },
  { test: /h\.?264|mp4|screener|online/i, items: ['screener_h264'] }
];

export function requirements(submissions) {
  const subs = submissions || listSubmissions();
  return subs
    .filter((s) => String(s.festival || '').trim())
    .filter((s) => !['rejected', 'withdrawn'].includes(s.status))
    .map((s) => {
      const entry = catalogueEntry(s.festival);
      const format = entry && entry.format ? String(entry.format) : '';
      const needs = [];
      CATALOGUE_FORMAT_TO_ITEMS.forEach((m) => {
        if (format && m.test.test(format)) m.items.forEach((id) => { if (!needs.includes(id)) needs.push(id); });
      });
      return {
        submission: s,
        festival: s.festival,
        status: statusMeta(s.status).label,
        format,
        maxLength: entry && entry.maxLength ? String(entry.maxLength) : '',
        known: !!entry,
        needs
      };
    });
}

/** The catalogue items any tracked festival depends on, with the
    festivals that ask for each — so the DCP row can say who wants it. */
export function askedBy(reqs) {
  const list = reqs || requirements();
  const map = {};
  list.forEach((r) => r.needs.forEach((id) => {
    if (!map[id]) map[id] = [];
    if (!map[id].includes(r.festival)) map[id].push(r.festival);
  }));
  return map;
}

export default {
  DELIVERABLES_KEY, STATES, stateMeta, WHEN, whenLabel,
  blankItemState, blankCustom, loadDeliverables, itemState, setItemState,
  addCustom, removeCustom, takeCustom, putCustomBack, listItems, groups, progress, requirements, askedBy
};
