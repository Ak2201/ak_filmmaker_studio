/* ============================================================
   ONE STICKY NOTE — the card the dock and the board both draw
   ------------------------------------------------------------
   src/lib/notes-model.js is the record; this is its face. Every
   control carries `data-nt` (a click) or `data-nt-field` (a change)
   plus `data-note`, and the host's delegate does the work through
   src/ui/notes-actions.js, so the dock (notes-dock.js) and the board
   (idea-vault.js) behave the same. `data-nt`, never `data-st`: the
   Story page and the Scene List already read `data-st`.

   The text is a paper field (paper-field.js), on the note's own colour.
   ============================================================ */
import { h } from '../lib/dom.js';
import { paperTextarea, paperField } from './paper-field.js';
import { button, sym } from './kit/index.js';
import { COLORS, COLOR_LABEL, colorOf, pinValue } from '../lib/notes-model.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const dayLabel = (at) => { const d = new Date(at); return isNaN(d) ? '' : d.getDate() + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear(); };

/** The pin select's options: `pins` is { beats: [{value,label}], scenes: [{value,label}], beatTitle }. */
function pinSelect(note, pins) {
  const sel = h('select.nt-pin', { 'data-nt-field': 'pin', 'data-note': note.id, 'aria-label': 'Pin this note to a beat or a scene' });
  sel.append(h('option', { value: '', text: 'Not pinned' }));
  const cur = pinValue(note);
  let found = !cur;
  const group = (label, rows) => {
    if (!rows.length) return;
    const g = h('optgroup', { label });
    for (const r of rows) { g.append(h('option', { value: r.value, text: r.label })); if (r.value === cur) found = true; }
    sel.append(g);
  };
  group(pins.beatTitle || 'Beats', pins.beats || []);
  group('Scenes', pins.scenes || []);
  /* A pin to a beat of another beat sheet, or to a scene since deleted,
     is kept as it is and shown as such: changing the select is the only
     thing that rewrites it. */
  if (!found) sel.append(h('option', { value: cur, text: 'Pinned elsewhere (kept)' }));
  sel.value = cur;
  return sel;
}

/**
 * A note's card. `o`: { pins, index, count, compact, drag }.
 * compact → the dock's narrower card; drag → a grip for the board.
 */
export function noteCard(note, o = {}) {
  const color = colorOf(note);
  const li = h('li.nt-card.nt-' + color, { 'data-note-card': note.id });
  const top = h('div.nt-top');
  if (o.drag) {
    top.append(h('button.nt-grip', {
      type: 'button', 'data-nt': 'grip', 'data-note': note.id,
      'aria-label': 'Move this note. Drag it, or press the up and down arrow keys.'
    }, [sym('drag_indicator')]));
  }
  const dots = h('div.nt-colors', { role: 'group', 'aria-label': 'Note colour' });
  for (const c of COLORS) {
    dots.append(h('button.nt-dot.nt-dot-' + c, {
      type: 'button', 'data-nt': 'color', 'data-note': note.id, 'data-color': c,
      'aria-pressed': String(c === color), 'aria-label': COLOR_LABEL[c], title: COLOR_LABEL[c]
    }));
  }
  top.append(dots);
  top.append(h('span.nt-date', { text: dayLabel(note.at) }));
  li.append(top);

  const ta = paperField(paperTextarea('.nt-text', {
    rows: o.compact ? 3 : 4, 'data-nt-field': 'text', 'data-note': note.id,
    'aria-label': 'Note text', maxlength: '4000'
  }), { script: false });
  ta.value = note.snippet;
  li.append(ta);

  li.append(pinSelect(note, o.pins || {}));

  const acts = h('div.nt-acts');
  acts.append(button({ label: 'Add to synopsis', size: 'sm', attrs: { 'data-nt': 'to-synopsis', 'data-note': note.id, title: 'Append this note to the end of the Story synopsis' } }));
  if (note.sceneId && ((o.pins || {}).scenes || []).some((r) => r.value === 'scene:' + note.sceneId)) {
    acts.append(button({ label: 'Add to the scene', size: 'sm', attrs: { 'data-nt': 'to-scene', 'data-note': note.id, title: 'Append this note to the pinned scene’s synopsis' } }));
  }
  acts.append(button({ label: 'Copy', icon: 'content_copy', iconOnly: true, size: 'sm', attrs: { 'data-nt': 'copy', 'data-note': note.id, title: 'Copy the text' } }));
  if (typeof o.index === 'number') {
    acts.append(button({ label: 'Move up', icon: 'arrow_upward', iconOnly: true, size: 'sm', disabled: o.index === 0, attrs: { 'data-nt': 'up', 'data-note': note.id } }));
    acts.append(button({ label: 'Move down', icon: 'arrow_downward', iconOnly: true, size: 'sm', disabled: o.index >= (o.count || 0) - 1, attrs: { 'data-nt': 'down', 'data-note': note.id } }));
  }
  acts.append(button({ label: 'Delete note', icon: 'delete', iconOnly: true, size: 'sm', variant: 'ghost', attrs: { 'data-nt': 'del', 'data-note': note.id } }));
  li.append(acts);
  return li;
}

/** The "new note" box: text, colour, and Add. `id` keeps two boxes apart. */
export function noteAdd(id, { pin = '' } = {}) {
  const box = h('div.nt-add');
  box.append(h('label.st-label', { for: id, text: 'New sticky note' }));
  box.append(paperField(paperTextarea('#' + id + '.nt-text.nt-new', { rows: 3, placeholder: 'A thought, a line, an image…', maxlength: '4000' }), { script: false }));
  const row = h('div.nt-add-row');
  const dots = h('div.nt-colors', { role: 'radiogroup', 'aria-label': 'Colour for the new note' });
  COLORS.forEach((c, i) => dots.append(h('button.nt-dot.nt-dot-' + c, {
    type: 'button', role: 'radio', 'data-nt': 'new-color', 'data-color': c, 'data-for': id,
    'aria-checked': String(i === 0), tabindex: i === 0 ? '0' : '-1', 'aria-label': COLOR_LABEL[c], title: COLOR_LABEL[c]
  })));   // a radio group is one Tab stop; the arrow keys move it (notes-actions.js)
  row.append(dots);
  row.append(button({ label: 'Add note', variant: 'primary', icon: 'add', size: 'sm', attrs: { 'data-nt': 'add', 'data-for': id, 'data-pin': pin } }));
  box.append(row);
  return box;
}

export default { noteCard, noteAdd, dayLabel };
