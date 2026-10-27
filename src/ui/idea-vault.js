/* ============================================================
   THE IDEA VAULT — the film's board of sticky notes and clippings
   ------------------------------------------------------------
   Drawn on vault.html. Clippings are as they always were: same markup,
   same data-st attributes, same key (fms_idea_vault_v1, through
   src/lib/story.js). Since 23 Oct 2026 (owner: "multiple thoughts and
   ideas like sticky notes, like Celtx") the same array also holds
   STICKY NOTES (src/lib/notes-model.js), and this page is their board:
   every note and clipping in one grid, in the array's own order, which
   dragging a note changes. The same notes open beside the Story path,
   the Scene List and the Screenplay Writer (src/ui/notes-dock.js).
   ============================================================ */
import { h } from '../lib/dom.js';
import { paperTextarea } from './paper-field.js';
import { BRAND } from '../lib/brand.js';
import * as Story from '../lib/story.js';
import { button, badge, emptyState, panel, segmented } from './kit/index.js';
import { isNote, filterBoard, COLORS, COLOR_LABEL } from '../lib/notes-model.js';
import { noteCard, noteAdd, dayLabel } from './note-card.js';
import { pinOptions, projectFormat } from './notes-actions.js';
import '../styles/notes.css';

export const FILTERS = [
  { value: 'all', label: 'All' }, { value: 'notes', label: 'Notes' },
  { value: 'pinned', label: 'Pinned' }, { value: 'clips', label: 'Clippings' }
];

function clipCard(it, fw) {
  const li = h('li.st-clip', { 'data-board-item': it.id });
  li.append(h('p.st-clip-text', { text: it.snippet }));
  const meta = h('div.st-clip-meta');
  const host = Story.clipSourceHost(it.url);   // http(s) only
  if (host) meta.append(h('a.st-clip-src', { href: it.url, target: '_blank', rel: 'noopener noreferrer', text: host }));
  meta.append(badge({ label: dayLabel(it.at), tag: true }));
  const ps = h('select', { 'data-st-field': 'clip-beat', 'data-clip': it.id, 'aria-label': 'Pin this clipping to a beat' });
  ps.append(h('option', { value: '', text: 'Pin to a beat…' }));
  fw.beats.forEach((b) => ps.append(h('option', { value: fw.id + ':' + b.id, text: b.label })));
  ps.value = it.beat && it.beat.startsWith(fw.id + ':') ? it.beat : '';
  meta.append(ps);
  meta.append(button({ label: 'Add to synopsis', size: 'sm', attrs: { 'data-st': 'clip-use', 'data-clip': it.id } }));
  meta.append(button({ label: 'Remove', size: 'sm', variant: 'ghost', icon: 'delete', class: 'st-x', attrs: { 'data-st': 'clip-del', 'data-clip': it.id } }));
  li.append(meta);
  return li;
}

/** The board. `view` is { filter, color } (in memory, the page's). */
export function renderVault(s, view = { filter: 'all', color: '' }) {
  const sec = h('div.st-vault');
  sec.append(h('p.bd-sub', { text: 'Sticky notes for every thought, line and image you want in the film. Pin one to a beat or a scene, drag them into order, and send one into the synopsis when it earns its place. The same notes open beside the Story, the Scene List and the Screenplay Writer. Clippings from the Chrome extension’s “Send to ' + BRAND.name + '” land here too.' }));

  const add = h('div.st-vault-add');
  add.append(h('label.st-label', { for: 'stClip', text: 'Add a clipping' }));
  add.append(paperTextarea('#stClip.st-text.k-textarea', { rows: 3, maxlength: String(Story.VAULT_MAX), placeholder: 'A quote, a link, a page of notes…' }));
  add.append(button({ label: 'Add to vault', variant: 'primary', icon: 'add', attrs: { 'data-st': 'clip-add' } }));
  sec.append(h('div.nt-board-adds', {}, [
    panel({ class: 'st-vault-panel nt-board-new', body: [noteAdd('ntBoardNew')] }),
    panel({ class: 'st-vault-panel', body: [add] })
  ]));

  const items = Story.listVault();
  if (!items.length) { sec.append(emptyState({ icon: 'lightbulb', title: 'Nothing here yet.', body: 'Write a sticky note above, add a clipping, or send a page from the Chrome extension.' })); return sec; }

  const colorSel = h('select.bd-sel', { 'data-vault-color': '', 'aria-label': 'Show one colour of note' },
    [h('option', { value: '', text: 'Any colour' })].concat(COLORS.map((c) => h('option', { value: c, text: COLOR_LABEL[c] }))));
  colorSel.value = view.color || '';
  sec.append(h('div.nt-filters', {}, [
    segmented({ label: 'Show', name: 'vault-filter', action: 'vault-filter', quiet: true, value: view.filter, options: FILTERS }),
    colorSel
  ]));

  let shown = filterBoard(items, view.filter);
  if (view.color) shown = shown.filter((x) => isNote(x) && (x.color || COLORS[0]) === view.color);
  /* Reordering is offered on the whole board only: a move inside a
     filtered view would step over notes the reader cannot see. */
  const ordered = view.filter === 'all' && !view.color;
  if (!shown.length) { sec.append(h('p.nt-empty', { text: 'Nothing matches this filter.' })); return sec; }

  /* The beat sheet the Story page draws (a short film is always the
     five beats), never the stored default: the note pins use the same. */
  const fw = Story.frameworkById(Story.effectiveFramework(s, projectFormat()));
  const pins = pinOptions();
  const ul = h('ul.nt-board', { 'aria-label': 'Notes and clippings' });
  shown.forEach((it, i) => {
    if (isNote(it)) {
      const card = noteCard(it, { pins, drag: ordered, index: ordered ? i : undefined, count: shown.length });
      card.setAttribute('data-board-item', it.id);
      ul.append(card);
    } else ul.append(clipCard(it, fw));
  });
  sec.append(ul);
  if (ordered) sec.append(h('p.nt-foot', { text: 'Drag a note by its handle, or focus the handle and press the arrow keys. The order is kept with the project.' }));
  return sec;
}

export default { renderVault, FILTERS };
